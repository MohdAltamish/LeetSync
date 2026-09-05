/**
 * github.js — GitHub REST API client
 * Used only by the service worker.
 */

const GH_API    = 'https://api.github.com';
const GH_CLIENT = 'Iv23liP2qSKqyx0FIgey';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

// ─── PAT validation ───────────────────────────────────────────────────────────

export async function getGitHubUser(token) {
  const res = await fetch(`${GH_API}/user`, { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('Invalid token. Check your GitHub PAT.');
  if (!res.ok) throw new Error(`GitHub error: ${res.status}`);
  const data = await res.json();
  return { login: data.login, avatar: data.avatar_url, name: data.name };
}

// ─── Device Flow OAuth / GitHub App ───────────────────────────────────────────

export async function requestDeviceCode() {
  if (!GH_CLIENT || GH_CLIENT.includes('xxxx')) {
    throw new Error('OAuth not configured. Please use the PAT option instead, or set up a GitHub App.');
  }
  const body = { client_id: GH_CLIENT };
  // GitHub Apps define permissions on the App itself; OAuth apps require scope
  if (!GH_CLIENT.startsWith('Iv')) {
    body.scope = 'repo';
  }
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.message || `Device code request failed: ${res.status}`);
  }
  return res.json();
}

export async function pollForToken(deviceCode, intervalSec = 5, expiresSec = 900) {
  const deadline = Date.now() + expiresSec * 1000;
  while (Date.now() < deadline) {
    await sleep(intervalSec * 1000);
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GH_CLIENT,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const data = await res.json();
    if (data.access_token)                    return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down')           { intervalSec += 5; continue; }
    if (data.error === 'expired_token')       throw new Error('Authorization expired. Please try again.');
    if (data.error === 'access_denied')       throw new Error('Authorization was denied.');
    if (data.error)                           throw new Error(`OAuth error: ${data.error}`);
  }
  throw new Error('Authorization timed out. Please try again.');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ─── Repo management ──────────────────────────────────────────────────────────

export async function listUserRepos(token) {
  // 1. If GitHub App, query granted installation repositories
  try {
    const instRes = await fetch(`${GH_API}/user/installations`, { headers: authHeaders(token) });
    if (instRes.ok) {
      const instData = await instRes.json();
      if (instData.installations && instData.installations.length > 0) {
        const appRepos = [];
        for (const inst of instData.installations) {
          const repoRes = await fetch(`${GH_API}/user/installations/${inst.id}/repositories?per_page=100`, {
            headers: authHeaders(token),
          });
          if (repoRes.ok) {
            const data = await repoRes.json();
            if (Array.isArray(data.repositories)) {
              data.repositories.forEach((r) => appRepos.push({ name: r.name, fullName: r.full_name }));
            }
          }
        }
        if (appRepos.length > 0) return appRepos;
      }
    }
  } catch (_) {}

  // 2. Fallback for PAT
  try {
    const res = await fetch(
      `${GH_API}/user/repos?per_page=100&sort=updated&affiliation=owner`,
      { headers: authHeaders(token) }
    );
    if (res.ok) {
      const repos = await res.json();
      if (Array.isArray(repos) && repos.length > 0) {
        return repos.map((r) => ({ name: r.name, fullName: r.full_name }));
      }
    }
  } catch (_) {}

  return [];
}

export async function createRepo(token, repoName) {
  const res = await fetch(`${GH_API}/user/repos`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name: repoName,
      description: 'My LeetCode solutions, auto-synced by LeetSync.',
      private: false,
      auto_init: true,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || `Failed to create repo: ${res.status}`);
  }
  return res.json();
}

// ─── File commits ─────────────────────────────────────────────────────────────

export async function pushFile({ token, owner, repo, path, content, message }) {
  const url     = `${GH_API}/repos/${owner}/${repo}/contents/${path}`;
  const headers = authHeaders(token);

  let sha = null;
  try {
    const check = await fetch(url, { headers });
    if (check.ok) sha = (await check.json()).sha ?? null;
  } catch (_) {}

  const encoded = btoa(unescape(encodeURIComponent(content)));
  const body    = { message, content: encoded };
  if (sha) body.sha = sha;

  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub commit failed (${res.status}): ${err}`);
  }
  return res.json();
}

function decodeBase64Utf8(base64) {
  try {
    const clean = (base64 || '').replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (_) {
    try {
      return atob((base64 || '').replace(/\s+/g, ''));
    } catch (_) {
      return '';
    }
  }
}

function parseDifficulty(text) {
  if (!text) return null;
  // 1. LeetHub HTML format: <h3>Easy</h3> or <h2-4>Easy</h2-4>
  const htmlMatch = text.match(/<h[1-6][^>]*>\s*(Easy|Medium|Hard)\s*<\/h[1-6]>/i);
  if (htmlMatch) return htmlMatch[1].toLowerCase();

  // 2. LeetSync / Standard Markdown formats: **Difficulty:** Easy, **Difficulty**: Easy, Difficulty: Easy
  const mdMatch = text.match(/(?:\*\*Difficulty:\*\*|\*\*Difficulty\*\*:|Difficulty:)\s*\[?(Easy|Medium|Hard)\]?/i);
  if (mdMatch) return mdMatch[1].toLowerCase();

  // 3. Markdown header format: ### Easy or ## Easy
  const headerMatch = text.match(/^#{1,4}\s*(Easy|Medium|Hard)\b/im);
  if (headerMatch) return headerMatch[1].toLowerCase();

  // 4. Badge or bracket format: [Easy] or Difficulty-Easy
  const badgeMatch = text.match(/\[(Easy|Medium|Hard)\]/i) || text.match(/Difficulty-(Easy|Medium|Hard)/i);
  if (badgeMatch) return badgeMatch[1].toLowerCase();

  return null;
}

// ─── Repo Insights ────────────────────────────────────────────────────────────
//
// Reads every problem folder's README.md to get exact difficulty counts.
// Supports both LeetSync and LeetHub / HTML formats.

export async function fetchRepoInsights(token, owner, repo) {
  const headers = authHeaders(token);

  // 1. Get default branch
  const repoRes = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) throw new Error(`Cannot access repo: ${repoRes.status}`);
  const branch = (await repoRes.json()).default_branch ?? 'main';

  // 2. Get full tree in one call
  const treeRes = await fetch(
    `${GH_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) throw new Error(`Cannot read repo tree: ${treeRes.status}`);
  const tree = (await treeRes.json()).tree ?? [];

  // 3. Find problem folders and exact README file paths
  const problemFolders = tree
    .filter((f) => f.type === 'tree' && /^\d{1,5}-/.test(f.path) && !f.path.includes('/'))
    .map((f) => f.path);

  const readmePaths = [];
  tree.forEach((f) => {
    if (f.type === 'blob' && /(^|\/)(README|readme)\.md$/i.test(f.path)) {
      readmePaths.push(f.path);
    }
  });

  const totalSolved = Math.max(problemFolders.length, readmePaths.length);

  if (totalSolved === 0) {
    return { solved: 0, easy: 0, medium: 0, hard: 0, streak: 0, commitDates: [], lastCommit: null };
  }

  // 4. Fetch ALL READMEs in parallel with exact paths & UTF-8 decoding
  const pathsToFetch = readmePaths.length > 0 ? readmePaths : problemFolders.map((f) => `${f}/README.md`);
  const readmeResults = await Promise.allSettled(
    pathsToFetch.map((filePath) =>
      fetch(`${GH_API}/repos/${owner}/${repo}/contents/${filePath}`, { headers })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d || !d.content) return '';
          return decodeBase64Utf8(d.content);
        })
    )
  );

  // 5. Count difficulty with flexible multi-format parser
  let easy = 0, medium = 0, hard = 0;
  readmeResults.forEach(({ status, value }) => {
    if (status !== 'fulfilled' || !value) return;
    const d = parseDifficulty(value);
    if      (d === 'easy')   easy++;
    else if (d === 'medium') medium++;
    else if (d === 'hard')   hard++;
  });

  // 6. Fetch commits for streak calculation
  const allCommits = await fetchAllCommits(token, owner, repo, headers);

  // Unique solve dates from commits (exclude pure merge or docs-only commits)
  const commitDates = [
    ...new Set(
      allCommits
        .filter((c) => {
          const msg = c.commit?.message ?? '';
          return !msg.startsWith('Merge') && !msg.includes('Docs:') && !msg.includes('Initial commit');
        })
        .map((c) => c.commit?.author?.date?.slice(0, 10))
        .filter(Boolean)
    ),
  ].sort().reverse();

  const streak = calcStreak(commitDates);

  const lastCommit = allCommits[0]
    ? { message: allCommits[0].commit.message, date: allCommits[0].commit.author.date, sha: allCommits[0].sha.slice(0, 7) }
    : null;

  return { solved: totalSolved, easy, medium, hard, streak, commitDates, lastCommit };
}

// Paginate commits — up to 300 (3 pages × 100)
async function fetchAllCommits(token, owner, repo, headers) {
  let page = 1, all = [];
  while (page <= 3) {
    const res = await fetch(
      `${GH_API}/repos/${owner}/${repo}/commits?per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    all = all.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

// Calculate streak from newest-first "YYYY-MM-DD" array
function calcStreak(dates) {
  if (!dates.length) return 0;
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays = Math.round((new Date(dates[i-1]) - new Date(dates[i])) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}
