/**
 * service-worker.js — MV3 Background Service Worker
 *
 * Message types handled:
 *  LEETSYNC_SYNC          — commit solution to GitHub
 *  LEETSYNC_OAUTH_START   — start Device Flow OAuth
 *  LEETSYNC_FETCH_INSIGHTS — fetch real stats from GitHub repo
 */
import { pushFile, getGitHubUser, requestDeviceCode, pollForToken, fetchRepoInsights } from './github.js';

// ─── Language map ─────────────────────────────────────────────────────────────

const LANG_EXT = {
  bash:'.sh', c:'.c', cangjie:'.cj', cpp:'.cpp', csharp:'.cs',
  dart:'.dart', elixir:'.ex', erlang:'.erl', golang:'.go',
  java:'.java', javascript:'.js', kotlin:'.kt', mysql:'.sql',
  mssql:'.sql', oraclesql:'.sql', php:'.php', pandas:'.py',
  postgresql:'.sql', python:'.py', python3:'.py', racket:'.rkt',
  ruby:'.rb', rust:'.rs', scala:'.scala', swift:'.swift', typescript:'.ts',
};
function getExt(n) { return LANG_EXT[(n ?? '').toLowerCase()] ?? '.txt'; }

// ─── Guard ────────────────────────────────────────────────────────────────────

let isSyncing = false;

// ─── Router ───────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'LEETSYNC_SYNC') {
    if (isSyncing) { sendResponse({ success: false, error: 'Sync in progress.' }); return true; }
    isSyncing = true;
    syncToGitHub(msg.payload)
      .then((info) => sendResponse({ success: true, info }))
      .catch((err) => { setBadge('✗', '#ef4444'); sendResponse({ success: false, error: err.message }); })
      .finally(() => { isSyncing = false; });
    return true;
  }

  if (msg.type === 'LEETSYNC_OAUTH_START') {
    startDeviceFlow()
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err)   => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'LEETSYNC_FETCH_INSIGHTS') {
    fetchInsights()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err)  => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── A. Sync solution to GitHub ───────────────────────────────────────────────

async function syncToGitHub(detail) {
  const { github_token, github_user, github_repo } =
    await chrome.storage.local.get(['github_token', 'github_user', 'github_repo']);

  if (!github_token || !github_user || !github_repo)
    throw new Error('LeetSync not connected. Open the popup to set up.');

  const {
    question, code, lang,
    runtimeDisplay, memoryDisplay,
    runtimePercentile, memoryPercentile,
    timeTaken = 'N/A', timeTakenSeconds = 0,
  } = detail;

  if (!question || !code) throw new Error('Incomplete submission data.');

  const padId  = String(question.questionFrontendId).padStart(4, '0');
  const folder = `${padId}-${question.titleSlug}`;
  const ext    = getExt(lang?.name);
  const rPct   = runtimePercentile != null ? `${Math.round(runtimePercentile * 100) / 100}%` : 'N/A';
  const mPct   = memoryPercentile  != null ? `${Math.round(memoryPercentile  * 100) / 100}%` : 'N/A';

  const commitMsg =
    `[LeetSync] ${question.questionFrontendId}. ${question.title}` +
    ` | ${runtimeDisplay ?? 'N/A'} (${rPct}) | ${memoryDisplay ?? 'N/A'} (${mPct})` +
    ` | Solved in ${timeTaken}`;

  const base = { token: github_token, owner: github_user, repo: github_repo };

  await pushFile({ ...base, path: `${folder}/solution${ext}`, content: code, message: commitMsg });
  await pushFile({
    ...base,
    path: `${folder}/README.md`,
    content: buildReadme({ question, runtimeDisplay, memoryDisplay, rPct, mPct, timeTaken }),
    message: `[LeetSync] Docs: ${question.title}`,
  });

  const stats = await updateStats(question.difficulty, timeTakenSeconds);

  await chrome.storage.local.set({
    last_sync: {
      title: question.title, difficulty: question.difficulty,
      folder, timeTaken, timestamp: Date.now(),
    },
    insights_cache: null, // invalidate cache so next open re-fetches
  });

  setBadge('✓', '#10b981');
  setTimeout(() => setBadge('', ''), 5000);
  return { folder, stats };
}

// ─── B. Device Flow OAuth ─────────────────────────────────────────────────────

async function startDeviceFlow() {
  // 1. Request device + user code
  const { device_code, user_code, verification_uri, expires_in, interval } =
    await requestDeviceCode();

  // Save pending OAuth state so popup can restore view if re-opened
  await chrome.storage.local.set({
    pending_oauth: {
      user_code,
      verification_uri,
      expires_at: Date.now() + (expires_in || 900) * 1000,
    },
  });

  // Start polling in background (non-blocking from popup's perspective)
  pollForToken(device_code, interval, expires_in)
    .then(async (token) => {
      const user = await getGitHubUser(token);
      await chrome.storage.local.remove('pending_oauth');
      await chrome.storage.local.set({
        github_token:     token,
        github_user:      user.login,
        github_avatar:    user.avatar,
        github_auth_type: 'oauth',
      });
      // Notify popup if it is open (ignore if closed)
      chrome.runtime.sendMessage({ type: 'LEETSYNC_OAUTH_DONE', user: user.login }).catch(() => {});
    })
    .catch(async (err) => {
      await chrome.storage.local.remove('pending_oauth');
      chrome.runtime.sendMessage({ type: 'LEETSYNC_OAUTH_ERROR', error: err.message }).catch(() => {});
    });

  // Return immediately with the code to display
  return { user_code, verification_uri, expires_in };
}

// ─── C. Fetch repo insights ───────────────────────────────────────────────────

async function fetchInsights() {
  const { github_token, github_user, github_repo, insights_cache } =
    await chrome.storage.local.get(['github_token', 'github_user', 'github_repo', 'insights_cache']);

  if (!github_token || !github_user || !github_repo)
    throw new Error('Not connected.');

  // Return cached data if fresh (< 5 minutes old)
  if (insights_cache && Date.now() - insights_cache.fetchedAt < 5 * 60 * 1000) {
    return { ...insights_cache, fromCache: true };
  }

  // Fetch real data from GitHub
  // github.js now reads every README to get exact difficulty counts — no scaling
  const data = await fetchRepoInsights(github_token, github_user, github_repo);

  // Keep local-only fields (timer stats) that GitHub cannot provide
  const { leetsync_stats: local = {} } = await chrome.storage.local.get('leetsync_stats');

  const merged = {
    ...data,
    totalSeconds:   local.totalSeconds   ?? 0,
    fastestSeconds: local.fastestSeconds ?? null,
    bestStreak:     Math.max(data.streak, local.bestStreak ?? 0),
    fetchedAt:      Date.now(),
  };

  // Sync local stats with GitHub truth (difficulty counts are now exact)
  await chrome.storage.local.set({
    insights_cache: merged,
    leetsync_stats: {
      ...local,
      solved:     merged.solved,
      easy:       merged.easy,       // ✅ exact — read from every README
      medium:     merged.medium,     // ✅ exact
      hard:       merged.hard,       // ✅ exact
      streak:     merged.streak,     // ✅ calculated from commit dates
      bestStreak: merged.bestStreak,
    },
  });

  return merged;
}

// ─── README builder ───────────────────────────────────────────────────────────

function buildReadme({ question, runtimeDisplay, memoryDisplay, rPct, mPct, timeTaken }) {
  const lcUrl = `https://leetcode.com/problems/${question.titleSlug}/`;
  const body  = htmlToText(question.content ?? '');
  return [
    `# ${question.questionFrontendId}. ${question.title}`,
    '',
    `**Difficulty:** ${question.difficulty ?? 'Unknown'}  `,
    `**URL:** [${question.title}](${lcUrl})`,
    `**Solved in:** ${timeTaken}`,
    '',
    '| Metric | Value | Beats |',
    '|--------|-------|-------|',
    `| Runtime | ${runtimeDisplay ?? 'N/A'} | ${rPct} |`,
    `| Memory  | ${memoryDisplay  ?? 'N/A'} | ${mPct} |`,
    '',
    '---',
    '',
    '## Problem',
    '',
    body,
  ].join('\n');
}

function htmlToText(html) {
  return html
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) =>
      `\`\`\`\n${c.replace(/<[^>]+>/g, '').trim()}\n\`\`\``)
    .replace(/<code>([\s\S]*?)<\/code>/gi,     '`$1`')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi,         '_$1_')
    .replace(/<li>([\s\S]*?)<\/li>/gi,         '- $1\n')
    .replace(/<p>([\s\S]*?)<\/p>/gi,           '$1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/\n{3,}/g,'\n\n').trim();
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function updateStats(difficulty, timeTakenSeconds) {
  const { leetsync_stats } = await chrome.storage.local.get('leetsync_stats');
  const s = leetsync_stats ?? { solved:0, easy:0, medium:0, hard:0, streak:0, lastSolveDate:null, bestStreak:0, totalSeconds:0, fastestSeconds:null };

  s.solved += 1;
  const d = (difficulty ?? '').toLowerCase();
  if (d === 'easy')   s.easy++;
  if (d === 'medium') s.medium++;
  if (d === 'hard')   s.hard++;

  const today     = todayKey();
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  if      (s.lastSolveDate === today)     { /* same day — no change */ }
  else if (s.lastSolveDate === yesterday) { s.streak++; }
  else                                    { s.streak = 1; }
  s.lastSolveDate = today;
  s.bestStreak    = Math.max(s.bestStreak ?? 0, s.streak);

  s.totalSeconds = (s.totalSeconds ?? 0) + timeTakenSeconds;
  if (timeTakenSeconds > 0 && (s.fastestSeconds === null || timeTakenSeconds < s.fastestSeconds))
    s.fastestSeconds = timeTakenSeconds;

  await chrome.storage.local.set({ leetsync_stats: s });
  return s;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}
