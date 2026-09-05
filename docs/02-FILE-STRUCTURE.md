# File Structure

## Final Project Layout

```
leetsync/  (or gitgrind/ — rename when you pick a name)
│
├── manifest.json                  ← MV3 manifest (permissions, scripts, popup)
│
├── popup/
│   ├── popup.html                 ← Extension popup shell
│   ├── popup.css                  ← Modern dark-mode UI styles
│   └── popup.js                   ← Auth flow, repo picker, settings
│
├── scripts/
│   ├── interceptor.js             ← world: MAIN — patches window.fetch
│   ├── content.js                 ← world: ISOLATED — polls + GraphQL + sendMessage
│   └── languages.js               ← langName → file extension map
│
├── background/
│   ├── service-worker.js          ← Message handler + GitHub commit orchestrator
│   └── github.js                  ← GitHub REST API client (push, validate, list repos)
│
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
│
└── docs/                          ← Planning documents (this folder)
    ├── 00-NAME-IDEAS.md
    ├── 01-ARCHITECTURE.md
    ├── 02-FILE-STRUCTURE.md       ← (this file)
    ├── 03-UI-UX-DESIGN.md
    ├── 04-IMPLEMENTATION-PLAN.md
    └── 05-KNOWN-RISKS.md
```

---

## What Each File Does

### `manifest.json`
- Declares MV3 extension
- Registers `interceptor.js` in `world: "MAIN"` at `document_start`
- Registers `content.js` in isolated world at `document_idle`
- Points popup to `popup/popup.html`
- Points service worker to `background/service-worker.js` with `"type": "module"`
- Permissions: only `storage`
- Host permissions: `leetcode.com/*`, `leetcode.cn/*`, `api.github.com/*`

### `popup/popup.html`
- Single-page popup with 3 views rendered via CSS class toggling (no routing library):
  - **View 1 — Setup:** PAT input + validate button
  - **View 2 — Repo Picker:** dropdown of user's repos + "Create new repo" option
  - **View 3 — Dashboard:** stats (solved count), connected repo, disconnect button

### `popup/popup.css`
- Dark glassmorphic design
- CSS custom properties for theming
- Smooth view transitions with `opacity` + `transform`
- No external CSS frameworks

### `popup/popup.js`
- Validates PAT via `GET /user`
- Fetches repo list via `GET /user/repos`
- Saves `github_token`, `github_user`, `github_repo` to `chrome.storage.local`
- Reads `stats` object to display solved count on dashboard

### `scripts/interceptor.js`
- Runs in page's JS context (`world: "MAIN"`)
- Wraps `window.fetch` — intercepts POST to `/submit/`
- Fires `CustomEvent("LEETCODE_SUBMISSION_DETECTED")` with `submissionId`
- **Does NOT touch chrome APIs** (not available in MAIN world)

### `scripts/content.js`
- Runs in Chrome's isolated sandbox
- Listens for `LEETCODE_SUBMISSION_DETECTED`
- Polls `/submissions/detail/{id}/check/` until `state === "SUCCESS"`
- Checks `status_msg === "Accepted"` before proceeding
- Calls LeetCode GraphQL `submissionDetails` query
- Sends result to service worker via `chrome.runtime.sendMessage`

### `scripts/languages.js`
- Simple lookup object: `{ python3: ".py", cpp: ".cpp", ... }`
- Imported by both `content.js` and `service-worker.js`
- Easy to extend for new languages

### `background/service-worker.js`
- Listens for `SYNC_SUBMISSION` messages
- Reads credentials from `chrome.storage.local`
- Builds folder name: `0001-two-sum`
- Calls `pushFileToGitHub` twice (solution + README)
- Updates badge on success/failure
- Increments `stats.solved` counter

### `background/github.js`
- `pushFileToGitHub({ token, owner, repo, path, content, message })`
  - Fetches existing SHA (for updates)
  - Base64-encodes content
  - PUT to GitHub Contents API
- `getGitHubUser(token)` → validates PAT, returns username
- `listUserRepos(token)` → returns array of repo names
- `createRepo(token, name)` → creates new repo with auto-init

---

## What We Are NOT Building (Intentional Simplifications)

| Feature | Why Skipped |
|---------|-------------|
| OAuth flow | PAT is simpler, more secure, no server needed |
| Difficulty subfolders | Adds complexity, breaks if GraphQL changes |
| Topic-based README index | Nice-to-have, Phase 2 |
| Notes / Solution posts | Out of scope for v1 |
| XHR interception fallback | LeetCode uses fetch; XHR fallback adds complexity |
| Timestamp filenames | Confusing UX for most users |
