/**
 * interceptor.js
 * world: "MAIN" — runs inside LeetCode's own JS context.
 *
 * Wraps window.fetch to detect when the user submits a solution.
 * Fires a CustomEvent with the submission_id so content.js can pick it up.
 * Does NOT use any chrome.* APIs (not available in MAIN world).
 */
(function () {
  'use strict';

  const _originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await _originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '');

      if (url.includes('/submit/')) {
        const clone = response.clone();
        const data = await clone.json();

        if (data && data.submission_id) {
          window.dispatchEvent(
            new CustomEvent('LEETSYNC_SUBMISSION', {
              detail: { submissionId: String(data.submission_id) }
            })
          );
        }
      }
    } catch (_) {
      // Never break the original fetch — silently ignore parse errors
    }

    return response;
  };
})();
