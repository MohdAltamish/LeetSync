/**
 * content.js
 * world: "ISOLATED" (default) — Chrome extension sandbox.
 *
 * Flow:
 *  1. Start timer when problem page loads
 *  2. Listen for LEETSYNC_SUBMISSION event from interceptor.js
 *  3. Poll LeetCode check endpoint until judging is complete
 *  4. If Accepted → stop timer, fetch full details via GraphQL
 *  5. Send details + time taken to service worker
 */
'use strict';

const BASE_URL = window.location.hostname.includes('leetcode.cn')
  ? 'https://leetcode.cn'
  : 'https://leetcode.com';

// ─── Timer ────────────────────────────────────────────────────────────────────

const timerStart = Date.now(); // starts the moment the page loads

function getElapsedSeconds() {
  return Math.floor((Date.now() - timerStart) / 1000);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Poll until judging finishes ──────────────────────────────────────────────

async function pollUntilDone(submissionId, maxAttempts = 20) {
  const url = `${BASE_URL}/submissions/detail/${submissionId}/check/`;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(1500);
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.state === 'SUCCESS') return data;
    } catch (_) {
      // network blip — keep polling
    }
  }
  return null;
}

// ─── Fetch full submission details via GraphQL ────────────────────────────────

async function fetchSubmissionDetails(submissionId) {
  const query = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        runtime
        runtimeDisplay
        runtimePercentile
        memory
        memoryDisplay
        memoryPercentile
        code
        lang {
          name
          verboseName
        }
        question {
          questionId
          questionFrontendId
          title
          titleSlug
          content
          difficulty
        }
      }
    }
  `;

  const res = await fetch(`${BASE_URL}/graphql/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { submissionId: parseInt(submissionId, 10) },
      operationName: 'submissionDetails',
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.submissionDetails ?? null;
}

// ─── Main: listen for submission event ───────────────────────────────────────

window.addEventListener('LEETSYNC_SUBMISSION', async (event) => {
  const { submissionId } = event.detail;

  // Poll for result
  const result = await pollUntilDone(submissionId);
  if (!result) return;

  // Only sync Accepted
  if (result.status_msg !== 'Accepted') return;

  // Stop timer
  const elapsedSeconds = getElapsedSeconds();
  const timeTaken = formatDuration(elapsedSeconds);

  // Fetch full details
  const details = await fetchSubmissionDetails(submissionId);
  if (!details || !details.code || !details.question) return;

  // Attach timer data to payload
  details.timeTaken        = timeTaken;
  details.timeTakenSeconds = elapsedSeconds;

  // Send to service worker
  chrome.runtime.sendMessage(
    { type: 'LEETSYNC_SYNC', payload: details },
    (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.success) {
        console.log(`[LeetSync] ✅ Synced: ${details.question.title} in ${timeTaken}`);
      }
    }
  );
});
