# Architecture Overview

## What This Extension Does (in one sentence)
When you get an **Accepted** verdict on LeetCode, the extension automatically commits your solution code + a formatted README to your chosen GitHub repository — zero manual steps.

---

## The 4-Layer Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1 — Page World (scripts/interceptor.js)               │
│  world: "MAIN" — runs inside LeetCode's JS context           │
│                                                              │
│  Monkey-patches window.fetch.                                │
│  When POST /submit/ fires → captures submission_id           │
│  → dispatches CustomEvent("LEETCODE_SUBMISSION_DETECTED")    │
└──────────────────────────┬───────────────────────────────────┘
                           │ CustomEvent (DOM bridge)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  LAYER 2 — Isolated Content Script (scripts/content.js)      │
│  world: "ISOLATED" — Chrome extension sandbox                │
│                                                              │
│  Listens for the CustomEvent.                                │
│  Polls /submissions/detail/{id}/check/ every 1.5s            │
│  until state === "SUCCESS".                                  │
│  If status_msg === "Accepted":                               │
│    → Calls LeetCode GraphQL for full submission details      │
│    → Sends chrome.runtime.sendMessage(SYNC_SUBMISSION)       │
└──────────────────────────┬───────────────────────────────────┘
                           │ chrome.runtime.sendMessage
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  LAYER 3 — Background Service Worker                         │
│  (background/service-worker.js + background/github.js)       │
│                                                              │
│  Reads github_token, github_user, github_repo                │
│  from chrome.storage.local.                                  │
│  Builds folder path: 0001-two-sum/                           │
│  Commits solution file  → PUT /repos/.../contents/...        │
│  Commits README.md      → PUT /repos/.../contents/...        │
│  Updates extension badge to ✓                                │
└──────────────────────────┬───────────────────────────────────┘
                           │ GitHub REST API
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  LAYER 4 — GitHub Repository                                 │
│                                                              │
│  my-leetcode-solutions/                                      │
│  ├── 0001-two-sum/                                           │
│  │   ├── solution.py   ← clean source code                   │
│  │   └── README.md     ← problem description + stats         │
│  ├── 0002-add-two-numbers/                                   │
│  │   ├── solution.js                                         │
│  │   └── README.md                                           │
└──────────────────────────────────────────────────────────────┘
```

---

## Why This Architecture Is Reliable

| Design Decision | Why It Matters |
|----------------|----------------|
| Fetch interception (not DOM scraping) | Immune to LeetCode UI redesigns |
| Polling the check endpoint | Waits for actual judge result, not a race condition |
| GraphQL for details | Official API — stable, structured, complete |
| GitHub Contents API (PUT) | Handles both create and update in one call |
| SHA check before commit | Prevents "409 Conflict" errors on re-submissions |
| Service Worker handles GitHub calls | Content scripts can't reliably make cross-origin requests |
| Zero external dependencies | Nothing to break, nothing to update |

---

## Data Flow Diagram (Simplified)

```
User clicks Submit
      │
      ▼
interceptor.js captures submission_id
      │
      ▼
content.js polls until Accepted
      │
      ▼
content.js fetches GraphQL details
      │
      ▼
service-worker.js commits to GitHub
      │
      ▼
Badge shows ✓
```

---

## Security Model

- **No OAuth client_secret** — uses GitHub PAT stored in `chrome.storage.local` (encrypted by Chrome, never exposed to page scripts)
- **No external servers** — all communication is directly between the extension and GitHub's API
- **Minimal permissions** — only `storage` permission + `host_permissions` for leetcode.com and api.github.com
- **PAT scope** — user only needs `repo` scope (or `public_repo` for public repos)
