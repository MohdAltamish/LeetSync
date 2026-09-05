/**
 * service-worker.js
 * MV3 Background Service Worker.
 *
 * Handles:
 *  - Syncing solution + README to GitHub
 *  - Problem timer (time taken to solve)
 *  - Daily streak tracking
 *  - Difficulty stats (easy / medium / hard)
 */
import { pushFile } from './github.js';

// ─── Language map ─────────────────────────────────────────────────────────────

const LANG_EXT = {
  bash: '.sh', c: '.c', cangjie: '.cj', cpp: '.cpp', csharp: '.cs',
  dart: '.dart', elixir: '.ex', erlang: '.erl', golang: '.go',
  java: '.java', javascript: '.js', kotlin: '.kt', mysql: '.sql',
  mssql: '.sql', oraclesql: '.sql', php: '.php', pandas: '.py',
  postgresql: '.sql', python: '.py', python3: '.py', racket: '.rkt',
  ruby: '.rb', rust: '.rs', scala: '.scala', swift: '.swift', typescript: '.ts',
};

function getExt(langName) {
  return LANG_EXT[(langName ?? '').toLowerCase()] ?? '.txt';
}

// ─── Guard: one sync at a time ────────────────────────────────────────────────

let isSyncing = false;

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'LEETSYNC_SYNC') return;

  if (isSyncing) {
    sendResponse({ success: false, error: 'Sync already in progress.' });
    return true;
  }

  isSyncing = true;
  syncToGitHub(msg.payload)
    .then((info) => sendResponse({ success: true, info }))
    .catch((err) => {
      setBadge('✗', '#ef4444');
      sendResponse({ success: false, error: err.message });
    })
    .finally(() => { isSyncing = false; });

  return true;
});

// ─── Core sync ────────────────────────────────────────────────────────────────

async function syncToGitHub(detail) {
  const { github_token, github_user, github_repo } =
    await chrome.storage.local.get(['github_token', 'github_user', 'github_repo']);

  if (!github_token || !github_user || !github_repo) {
    throw new Error('LeetSync not connected. Open the popup to set up.');
  }

  const {
    question, code, lang,
    runtimeDisplay, memoryDisplay,
    runtimePercentile, memoryPercentile,
    timeTaken = 'N/A',
    timeTakenSeconds = 0,
  } = detail;

  if (!question || !code) throw new Error('Incomplete submission data.');

  const padId  = String(question.questionFrontendId).padStart(4, '0');
  const folder = `${padId}-${question.titleSlug}`;
  const ext    = getExt(lang?.name);

  const rPct = runtimePercentile != null
    ? `${Math.round(runtimePercentile * 100) / 100}%` : 'N/A';
  const mPct = memoryPercentile != null
    ? `${Math.round(memoryPercentile * 100) / 100}%` : 'N/A';

  const commitMsg =
    `[LeetSync] ${question.questionFrontendId}. ${question.title}` +
    ` | ${runtimeDisplay ?? 'N/A'} (${rPct}) | ${memoryDisplay ?? 'N/A'} (${mPct})` +
    ` | Solved in ${timeTaken}`;

  const base = { token: github_token, owner: github_user, repo: github_repo };

  // 1. Commit solution file
  await pushFile({
    ...base,
    path: `${folder}/solution${ext}`,
    content: code,
    message: commitMsg,
  });

  // 2. Commit README
  await pushFile({
    ...base,
    path: `${folder}/README.md`,
    content: buildReadme({ question, runtimeDisplay, memoryDisplay, rPct, mPct, timeTaken }),
    message: `[LeetSync] Docs: ${question.title}`,
  });

  // 3. Update stats (difficulty counts + streak + timer)
  const stats = await updateStats(question.difficulty, timeTakenSeconds);

  // 4. Save last sync info for popup
  await chrome.storage.local.set({
    last_sync: {
      title:      question.title,
      difficulty: question.difficulty,
      folder,
      timeTaken,
      timestamp:  Date.now(),
    },
  });

  // 5. Badge
  setBadge('✓', '#10b981');
  setTimeout(() => setBadge('', ''), 5000);

  return { folder, stats };
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
    `| Memory  | ${memoryDisplay ?? 'N/A'} | ${mPct} |`,
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
    .replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/gi, '_$1_')
    .replace(/<li>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<p>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Stats: difficulty + streak + timer ──────────────────────────────────────

function todayKey() {
  // Returns "YYYY-MM-DD" in local time
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function updateStats(difficulty, timeTakenSeconds) {
  const { leetsync_stats } = await chrome.storage.local.get('leetsync_stats');

  const stats = leetsync_stats ?? {
    solved: 0,
    easy:   0,
    medium: 0,
    hard:   0,
    streak:       0,
    lastSolveDate: null,
    bestStreak:    0,
    totalSeconds:  0,
    fastestSeconds: null,
    fastestTitle:   null,
  };

  // ── Difficulty counts
  stats.solved += 1;
  const d = (difficulty ?? '').toLowerCase();
  if (d === 'easy')   stats.easy   += 1;
  if (d === 'medium') stats.medium += 1;
  if (d === 'hard')   stats.hard   += 1;

  // ── Streak logic
  const today     = todayKey();
  const yesterday = (() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  })();

  if (stats.lastSolveDate === today) {
    // Already solved today — streak unchanged
  } else if (stats.lastSolveDate === yesterday) {
    // Solved yesterday → extend streak
    stats.streak += 1;
  } else {
    // Gap of 1+ days → reset streak
    stats.streak = 1;
  }

  stats.lastSolveDate = today;
  stats.bestStreak = Math.max(stats.bestStreak ?? 0, stats.streak);

  // ── Timer stats
  stats.totalSeconds = (stats.totalSeconds ?? 0) + timeTakenSeconds;

  if (
    timeTakenSeconds > 0 &&
    (stats.fastestSeconds === null || timeTakenSeconds < stats.fastestSeconds)
  ) {
    stats.fastestSeconds = timeTakenSeconds;
  }

  await chrome.storage.local.set({ leetsync_stats: stats });
  return stats;
}

// ─── Badge helper ─────────────────────────────────────────────────────────────

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}
