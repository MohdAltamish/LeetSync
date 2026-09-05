# Known Risks & Mitigations

## Risk 1 — LeetCode Changes Its Submit API Endpoint

**Likelihood:** Medium (they've changed it before)
**Impact:** High — interceptor stops capturing submission IDs

**Current endpoint:** `POST /problems/{slug}/submit/`

**Mitigation:**
- The interceptor checks `url.includes('/submit/')` — a substring match, not an exact URL
- If LeetCode changes the path structure significantly, update this one string
- Add a fallback: also watch for `url.includes('/check/')` responses that contain `submission_id`

---

## Risk 2 — LeetCode GraphQL Schema Changes

**Likelihood:** Low (GraphQL schemas are more stable than REST)
**Impact:** Medium — submission details query returns null fields

**Current query fields:** `runtime`, `runtimeDisplay`, `runtimePercentile`, `memory`, `memoryDisplay`, `memoryPercentile`, `code`, `lang`, `question`

**Mitigation:**
- All field accesses use optional chaining (`?.`) — missing fields degrade gracefully
- If `code` is null, the service worker throws a clear error and does NOT commit
- The README still commits even if stats are missing (uses "N/A" fallback)

---

## Risk 3 — GitHub PAT Expires or Is Revoked

**Likelihood:** High (fine-grained PATs expire; users rotate tokens)
**Impact:** Medium — sync silently fails

**Mitigation:**
- On any GitHub API 401 response, set badge to `✗` (red)
- Store a `github_auth_error` flag in `chrome.storage.local`
- Popup reads this flag and shows "Token expired — reconnect" banner on open
- User clicks "Reconnect" → goes back to Setup view

---

## Risk 4 — Service Worker Terminates Mid-Sync (MV3 Limitation)

**Likelihood:** Low for short operations (GitHub API calls are fast, ~500ms each)
**Impact:** Medium — partial commit (solution file written, README not)

**Mitigation:**
- Both commits happen in the same `async` function with `await`
- Total time is ~1-2 seconds — well within the service worker's active window
- If the worker does terminate, the next submission will re-commit both files (idempotent)
- The SHA check ensures no duplicate/corrupt commits

---

## Risk 5 — User Submits Very Rapidly (Race Condition)

**Likelihood:** Low
**Impact:** Low — two concurrent syncs could conflict on the SHA check

**Mitigation:**
- Add a simple `isSyncing` boolean flag in the service worker
- If `isSyncing === true` when a new message arrives, queue it or skip it
- For v1, skipping is acceptable (the next accepted submission will sync)

---

## Risk 6 — LeetCode CN Uses Different GraphQL Schema

**Likelihood:** Medium (CN has different fields, e.g. `submissionDetail` vs `submissionDetails`)
**Impact:** Medium — CN users get no sync

**Mitigation:**
- `content.js` detects `window.location.hostname.includes('leetcode.cn')`
- Uses a separate CN-specific GraphQL query (already documented in the old codebase)
- Phase 1: support `.com` only, add `.cn` in Phase 2

---

## Risk 7 — GitHub API Rate Limiting

**Likelihood:** Very Low (authenticated requests: 5000/hour)
**Impact:** Low — a very active user solving 100+ problems/hour would hit this

**Mitigation:**
- Each sync makes 3 API calls (1 GET + 2 PUTs)
- At 5000/hour limit, user would need to solve 1666 problems/hour to hit it
- Not a real concern for v1

---

## Risk 8 — Content Security Policy Blocks Fetch in Content Script

**Likelihood:** Low (LeetCode's CSP allows same-origin fetches; GraphQL is same-origin)
**Impact:** High — GraphQL query fails

**Mitigation:**
- The GraphQL call is to `leetcode.com/graphql/` from a `leetcode.com` page — same origin, always allowed
- The polling call is also same-origin
- Only the GitHub API call is cross-origin — that's handled in the service worker, not the content script

---

## What We Deliberately Keep Simple (Complexity Budget)

| Temptation | Decision | Reason |
|-----------|----------|--------|
| XHR fallback interceptor | ❌ Skip | LeetCode uses fetch; adds 80 lines for <1% of cases |
| Retry queue for failed syncs | ❌ Skip v1 | Adds state management complexity |
| Offline detection | ❌ Skip v1 | GitHub API will just fail with a clear error |
| Multiple repo support | ❌ Skip v1 | One repo per user is the right UX |
| Sync history log | ❌ Skip v1 | Nice-to-have, Phase 2 |
| Difficulty folder organization | ❌ Skip v1 | Adds path-building complexity, breaks on re-org |
