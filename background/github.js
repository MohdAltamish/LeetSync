/**
 * github.js
 * GitHub REST API client — used only by the service worker.
 * All functions are pure async — no side effects, no chrome.* calls.
 */

const GH_API = 'https://api.github.com';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

// ─── Validate token + get username ───────────────────────────────────────────

export async function getGitHubUser(token) {
  const res = await fetch(`${GH_API}/user`, { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('Invalid token. Check your GitHub PAT.');
  if (!res.ok) throw new Error(`GitHub error: ${res.status}`);
  const data = await res.json();
  return data.login; // username string
}

// ─── List user's own repos ────────────────────────────────────────────────────

export async function listUserRepos(token) {
  const res = await fetch(
    `${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner`,
    { headers: authHeaders(token) }
  );
  if (!res.ok) throw new Error(`Could not fetch repos: ${res.status}`);
  const repos = await res.json();
  return repos.map((r) => ({ name: r.name, fullName: r.full_name }));
}

// ─── Create a new repo ────────────────────────────────────────────────────────

export async function createRepo(token, repoName) {
  const res = await fetch(`${GH_API}/user/repos`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name: repoName,
      description: 'My LeetCode solutions, auto-synced by LeetSync.',
      private: false,
      auto_init: true, // creates default branch so we can commit immediately
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `Failed to create repo: ${res.status}`);
  }
  return res.json();
}

// ─── Push (create or update) a single file ───────────────────────────────────

export async function pushFile({ token, owner, repo, path, content, message }) {
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${path}`;
  const headers = authHeaders(token);

  // 1. Get existing SHA (needed to update an existing file)
  let sha = null;
  try {
    const check = await fetch(url, { headers });
    if (check.ok) {
      const existing = await check.json();
      sha = existing.sha ?? null;
    }
  } catch (_) {
    // File doesn't exist yet — sha stays null
  }

  // 2. Base64-encode content (UTF-8 safe)
  const encoded = btoa(unescape(encodeURIComponent(content)));

  // 3. Commit
  const body = { message, content: encoded };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub commit failed (${res.status}): ${err}`);
  }

  return res.json();
}
