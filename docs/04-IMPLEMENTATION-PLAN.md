# Implementation Plan

## Overview

Build order follows dependency order — each step produces working, testable output before the next begins.

---

## Step 1 — Clean Slate Setup

**Goal:** Remove legacy code, establish new folder structure.

**Actions:**
- Delete `src/` folder entirely (jQuery, Semantic UI, old OAuth, DOM scrapers — all gone)
- Keep `assets/` for now (icons can be replaced later)
- The new `manifest.json` is already partially written — finalize it
- Create folders: `popup/`, `scripts/`, `background/`, `icons/`

**Files touched:**
- `manifest.json` (finalize)
- Delete `src/`

**Test:** Load extension in Chrome (`chrome://extensions` → Load unpacked). It should load without errors (popup will be blank, that's fine).

---

## Step 2 — Language Map

**Goal:** Single source of truth for language → extension mapping.

**File:** `scripts/languages.js`

**Content:** Plain object export. ~30 language entries. No logic, no dependencies.

**Test:** Open browser console, manually call `getExtensionForLanguage("python3")` → should return `".py"`.

---

## Step 3 — Fetch Interceptor

**Goal:** Capture `submission_id` from LeetCode's submit API call.

**File:** `scripts/interceptor.js`

**Logic:**
1. Wrap `window.fetch` in an IIFE
2. After original fetch resolves, check if URL contains `/submit/`
3. Clone response, parse JSON, extract `submission_id`
4. Dispatch `CustomEvent("LEETCODE_SUBMISSION_DETECTED", { detail: { submissionId } })`

**Test:**
- Load extension, go to any LeetCode problem
- Open DevTools → Console
- Submit any solution (pass or fail)
- Should see `[LeetSync] Fetch interceptor installed.` on page load
- After submit: `CustomEvent` should fire (verify in console with a listener)

---

## Step 4 — Content Script (Polling + GraphQL)

**Goal:** React to submission event, wait for result, fetch details.

**File:** `scripts/content.js`

**Logic:**
1. Listen for `LEETCODE_SUBMISSION_DETECTED`
2. Poll `/submissions/detail/{id}/check/` every 1500ms, max 20 attempts
3. When `state === "SUCCESS"` and `status_msg === "Accepted"`:
4. Call GraphQL `submissionDetails` query
5. `chrome.runtime.sendMessage({ type: "SYNC_SUBMISSION", payload: details })`

**Test:**
- Submit an accepted solution on LeetCode
- In DevTools → Console (content script context): should see polling logs
- Should see `[LeetSync] Sending to service worker: Two Sum`
- Service worker will fail (not built yet) — that's expected

---

## Step 5 — GitHub API Client

**Goal:** Reusable functions for all GitHub API calls.

**File:** `background/github.js`

**Functions:**
- `getGitHubUser(token)` → validates PAT, returns username
- `listUserRepos(token)` → returns `[{ name, full_name }]`
- `createRepo(token, name)` → creates repo, returns repo object
- `pushFileToGitHub({ token, owner, repo, path, content, message })` → creates or updates file

**Key detail for `pushFileToGitHub`:**
1. GET the file first to check if it exists (get SHA)
2. Base64-encode content with `btoa(unescape(encodeURIComponent(content)))`
3. PUT with `{ message, content: encoded, sha? }`

**Test:** Temporarily call from service worker console with a test token.

---

## Step 6 — Service Worker

**Goal:** Receive message, build file paths, commit to GitHub.

**File:** `background/service-worker.js`

**Logic:**
1. `chrome.runtime.onMessage.addListener` for `SYNC_SUBMISSION`
2. Read `github_token`, `github_user`, `github_repo` from `chrome.storage.local`
3. Build folder: `padStart(4, '0') + '-' + titleSlug` → `0001-two-sum`
4. Get file extension from language name
5. Call `pushFileToGitHub` for solution file
6. Build README markdown string
7. Call `pushFileToGitHub` for README
8. Set badge: `chrome.action.setBadgeText({ text: '✓' })`
9. Clear badge after 5 seconds
10. Increment `stats.solved` in `chrome.storage.local`

**README format:**
```markdown
# 1. Two Sum
**Difficulty:** Easy
**Runtime:** 52ms (beats 87.3%) | **Memory:** 16.2MB (beats 74.1%)
---
## Problem Description
[stripped HTML content]
```

**Test:**
- Manually set storage: `chrome.storage.local.set({ github_token: "...", github_user: "...", github_repo: "..." })`
- Submit an accepted solution
- Check GitHub repo for committed files

---

## Step 7 — Popup UI

**Goal:** Beautiful, functional 3-view popup.

**Files:** `popup/popup.html`, `popup/popup.css`, `popup/popup.js`

**View logic in `popup.js`:**
```
showView('setup')    → hide others, show #view-setup
showView('picker')   → hide others, show #view-picker
showView('dashboard') → hide others, show #view-dashboard
```

**Setup view flow:**
1. User pastes PAT → clicks Connect
2. Show spinner on button
3. Call `getGitHubUser(token)` → if fails, show error + shake
4. If success → save token + username → `showView('picker')`

**Picker view flow:**
1. Call `listUserRepos(token)` → populate `<select>`
2. Show skeleton while loading
3. "Create new repo" → show inline input → call `createRepo`
4. "Start Syncing" → save repo → `showView('dashboard')`

**Dashboard view flow:**
1. Read stats from `chrome.storage.local`
2. Animate count-up for solved numbers
3. Show last synced info
4. Settings panel toggle
5. Disconnect → clear storage → `showView('setup')`

**Test:** Click through all 3 views manually.

---

## Step 8 — Icons

**Goal:** Replace placeholder icons with proper branded icons.

**Files:** `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`

**Options:**
- Use a simple SVG of the chosen logo, export at 3 sizes
- Or use the existing `assets/thumbnail.png` temporarily

---

## Step 9 — End-to-End Test

**Full flow test:**
1. Load extension unpacked
2. Open popup → connect GitHub PAT
3. Pick or create a repo
4. Go to LeetCode → solve Two Sum in Python
5. Submit → get Accepted
6. Check GitHub repo → `0001-two-sum/solution.py` and `0001-two-sum/README.md` should appear
7. Submit again → files should update (not duplicate)
8. Check popup dashboard → solved count should be 1

**Edge cases to test:**
- Submit a wrong answer → nothing should happen
- Submit the same problem twice → file should update, not error
- Disconnect and reconnect → should work cleanly
- Submit on `leetcode.cn` → should work (BASE_URL detection)

---

## Step 10 — Polish & Cleanup

- Remove `src/` folder
- Remove `package.json` build tooling (no bundler needed)
- Update `README.md` with new name, setup instructions, screenshots
- Add `PRIVACY.md` (no data collected, no external servers)
