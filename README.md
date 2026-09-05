# LeetSync

> **Sync your LeetCode solutions to GitHub, automatically.**

LeetSync is a lightweight Chrome extension (Manifest V3) that detects when you get an **Accepted** verdict on LeetCode and instantly commits your solution + a formatted README to your GitHub repository — zero manual steps.

---

## Features

- ✅ Auto-detects Accepted submissions via fetch interception (no DOM scraping)
- ✅ Fetches full details via LeetCode's official GraphQL API
- ✅ Commits solution file + README to GitHub in one click
- ✅ Secure GitHub PAT authentication — no exposed secrets
- ✅ Zero external dependencies — pure Vanilla JS, < 50 KB total
- ✅ Modern dark-mode popup with live stats dashboard

---

## Repository Structure (output)

```
your-repo/
├── 0001-two-sum/
│   ├── solution.py
│   └── README.md
├── 0002-add-two-numbers/
│   ├── solution.js
│   └── README.md
```

---

## Installation (Developer Mode)

1. Clone or download this repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select this folder
5. Click the LeetSync icon → paste your GitHub PAT → pick a repo → done

### GitHub PAT Setup

1. Go to [GitHub → Settings → Tokens](https://github.com/settings/tokens/new?scopes=repo&description=LeetSync)
2. Select scope: **`repo`** (or `public_repo` for public repos only)
3. Generate and copy the token
4. Paste it into the LeetSync popup

---

## How It Works

```
Submit on LeetCode
  → interceptor.js captures submission_id (fetch interception)
  → content.js polls until Accepted
  → content.js fetches details via GraphQL
  → service-worker.js commits to GitHub via REST API
  → Badge shows ✓
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension standard | Chrome Manifest V3 |
| Submission detection | Fetch API interception |
| Solution data | LeetCode GraphQL API |
| GitHub commits | GitHub Contents REST API |
| UI | Vanilla JS + CSS (no frameworks) |
| Auth | GitHub Personal Access Token |

---

## Privacy

- No data is sent to any server other than GitHub's API
- Your token is stored in `chrome.storage.local` (encrypted by Chrome)
- No analytics, no tracking, no external requests

---

## License

MIT
