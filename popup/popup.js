/**
 * popup.js
 * 3-view popup: Setup → Repo Picker → Dashboard
 * Features: streak, timer, difficulty breakdown bars
 */
'use strict';

// ─── View router ──────────────────────────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.remove('active');
    v.style.display = 'none';
  });
  const target = document.getElementById(`view-${id}`);
  if (!target) return;
  target.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => target.classList.add('active')));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function setLoading(btnId, spinnerId, labelId, on) {
  $(btnId).disabled = on;
  $(spinnerId).classList.toggle('hidden', !on);
  if (labelId) $(labelId).classList.toggle('hidden', on);
}

function showError(id, msg) { const e = $(id); e.textContent = msg; e.classList.remove('hidden'); }
function hideError(id)      { $(id).classList.add('hidden'); }

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatSeconds(sec) {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─── Count-up animation ───────────────────────────────────────────────────────

function animateCount(el, target, duration = 600) {
  if (!el) return;
  const start = performance.now();
  (function step(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.floor(p * target);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  })(performance.now());
}

// ─── Difficulty bar animation ─────────────────────────────────────────────────

function animateBars(easy, medium, hard) {
  const total = easy + medium + hard;
  if (total === 0) return;

  // Small delay so CSS transition fires after element is visible
  setTimeout(() => {
    const barEasy   = $('bar-easy');
    const barMedium = $('bar-medium');
    const barHard   = $('bar-hard');
    if (barEasy)   barEasy.style.width   = `${(easy   / total) * 100}%`;
    if (barMedium) barMedium.style.width = `${(medium / total) * 100}%`;
    if (barHard)   barHard.style.width   = `${(hard   / total) * 100}%`;
  }, 120);
}

// ─── GitHub API helpers ───────────────────────────────────────────────────────

async function validateToken(token) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (res.status === 401) throw new Error('Invalid token. Make sure it has the repo scope.');
  if (!res.ok) throw new Error(`GitHub error: ${res.status}`);
  return (await res.json()).login;
}

async function fetchRepos(token) {
  const res = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner',
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
  );
  if (!res.ok) throw new Error(`Could not load repos: ${res.status}`);
  return (await res.json()).map((r) => r.name).sort();
}

async function createRepo(token, name) {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
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

// ─── View 1: Setup ────────────────────────────────────────────────────────────

function initSetupView() {
  const patInput = $('pat-input');

  $('pat-toggle').addEventListener('click', () => {
    const isPass = patInput.type === 'password';
    patInput.type = isPass ? 'text' : 'password';
    $('eye-show').classList.toggle('hidden', isPass);
    $('eye-hide').classList.toggle('hidden', !isPass);
  });

  $('connect-btn').addEventListener('click', async () => {
    const token = patInput.value.trim();
    if (!token) {
      patInput.classList.add('error');
      showError('setup-error', 'Please enter your GitHub token.');
      setTimeout(() => patInput.classList.remove('error'), 600);
      return;
    }

    hideError('setup-error');
    setLoading('connect-btn', 'connect-spinner', 'connect-label', true);

    try {
      const username = await validateToken(token);
      await chrome.storage.local.set({ github_token: token, github_user: username });
      await loadPickerView(token, username);
      showView('picker');
    } catch (err) {
      patInput.classList.add('error');
      showError('setup-error', err.message);
      setTimeout(() => patInput.classList.remove('error'), 600);
    } finally {
      setLoading('connect-btn', 'connect-spinner', 'connect-label', false);
    }
  });
}

// ─── View 2: Repo Picker ──────────────────────────────────────────────────────

async function loadPickerView(token, username) {
  $('picker-username').textContent = `@${username}`;
  $('repo-skeleton').classList.remove('hidden');
  $('repo-select').classList.add('hidden');

  try {
    const repos  = await fetchRepos(token);
    const select = $('repo-select');
    select.innerHTML = '<option value="">— select a repo —</option>';
    repos.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      select.appendChild(opt);
    });
    $('repo-skeleton').classList.add('hidden');
    select.classList.remove('hidden');
  } catch (err) {
    $('repo-skeleton').classList.add('hidden');
    showError('picker-error', err.message);
  }
}

function initPickerView() {
  const select   = $('repo-select');
  const startBtn = $('start-sync-btn');

  select.addEventListener('change', () => {
    startBtn.disabled = !select.value;
    hideError('picker-error');
  });

  $('create-repo-btn').addEventListener('click', () => {
    $('create-repo-input-row').classList.toggle('hidden');
    $('create-repo-btn').classList.toggle('hidden');
    $('new-repo-name').focus();
  });

  $('create-repo-confirm').addEventListener('click', async () => {
    const name = $('new-repo-name').value.trim().replace(/\s+/g, '-');
    if (!name) return;

    hideError('picker-error');
    setLoading('create-repo-confirm', 'create-spinner', 'create-label', true);

    try {
      const { github_token } = await chrome.storage.local.get('github_token');
      await createRepo(github_token, name);

      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      select.appendChild(opt);
      select.value = name;
      startBtn.disabled = false;

      $('create-repo-input-row').classList.add('hidden');
      $('create-repo-btn').classList.remove('hidden');
      $('new-repo-name').value = '';
    } catch (err) {
      showError('picker-error', err.message);
    } finally {
      setLoading('create-repo-confirm', 'create-spinner', 'create-label', false);
    }
  });

  startBtn.addEventListener('click', async () => {
    const repo = select.value;
    if (!repo) return;
    await chrome.storage.local.set({ github_repo: repo });
    await loadDashboard();
    showView('dashboard');
  });
}

// ─── View 3: Dashboard ────────────────────────────────────────────────────────

async function loadDashboard() {
  const {
    github_user,
    github_repo,
    leetsync_stats: s = { solved: 0, easy: 0, medium: 0, hard: 0, streak: 0, bestStreak: 0, totalSeconds: 0, fastestSeconds: null },
    last_sync,
  } = await chrome.storage.local.get(['github_user', 'github_repo', 'leetsync_stats', 'last_sync']);

  // Repo link
  $('repo-link').href = `https://github.com/${github_user}/${github_repo}`;
  $('repo-name-display').textContent = `${github_user}/${github_repo}`;

  // ── Streak
  animateCount($('streak-count'), s.streak ?? 0);
  $('best-streak-label').textContent = `Best: ${s.bestStreak ?? 0}`;

  // ── Timer
  const lastTime = last_sync?.timeTaken ?? '—';
  $('last-time').textContent = lastTime;

  const avgSec = s.solved > 0 ? Math.floor((s.totalSeconds ?? 0) / s.solved) : 0;
  $('avg-time-label').textContent = `Avg: ${formatSeconds(avgSec)}`;

  // ── Difficulty counts + bars
  const easy   = s.easy   ?? 0;
  const medium = s.medium ?? 0;
  const hard   = s.hard   ?? 0;
  const total  = s.solved ?? 0;

  animateCount($('stat-easy'),   easy);
  animateCount($('stat-medium'), medium);
  animateCount($('stat-hard'),   hard);
  animateCount($('stat-total'),  total);
  animateBars(easy, medium, hard);

  // ── Last sync row
  if (last_sync) {
    const badge = $('last-sync-diff-badge');
    const diff  = (last_sync.difficulty ?? '').toLowerCase();
    badge.textContent = last_sync.difficulty ?? '';
    badge.className   = `diff-badge ${diff}`;

    $('last-sync-text').textContent = last_sync.title ?? '';
    $('last-sync-time').textContent =
      `${last_sync.timeTaken ?? ''} · ${timeAgo(last_sync.timestamp)}`;
    $('last-sync-row').classList.remove('hidden');
  }

  // ── Settings
  const { leetsync_settings = { autosync: true, skipresub: true } } =
    await chrome.storage.local.get('leetsync_settings');
  $('setting-autosync').checked  = leetsync_settings.autosync;
  $('setting-skipresub').checked = leetsync_settings.skipresub;
}

function initDashboardView() {
  const settingsToggle = $('settings-toggle');
  const settingsPanel  = $('settings-panel');

  settingsToggle.addEventListener('click', () => {
    const open = !settingsPanel.classList.contains('hidden');
    settingsPanel.classList.toggle('hidden', open);
    settingsToggle.classList.toggle('open', !open);
  });

  $('settings-save').addEventListener('click', async () => {
    await chrome.storage.local.set({
      leetsync_settings: {
        autosync:  $('setting-autosync').checked,
        skipresub: $('setting-skipresub').checked,
      },
    });
    const saved = $('settings-saved');
    saved.classList.remove('hidden');
    setTimeout(() => saved.classList.add('hidden'), 2000);
  });

  $('disconnect-btn').addEventListener('click', () => {
    $('disconnect-confirm').classList.remove('hidden');
    $('disconnect-btn').classList.add('hidden');
  });

  $('disconnect-no').addEventListener('click', () => {
    $('disconnect-confirm').classList.add('hidden');
    $('disconnect-btn').classList.remove('hidden');
  });

  $('disconnect-yes').addEventListener('click', async () => {
    await chrome.storage.local.clear();
    showView('setup');
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  initSetupView();
  initPickerView();
  initDashboardView();

  const { github_token, github_user, github_repo } =
    await chrome.storage.local.get(['github_token', 'github_user', 'github_repo']);

  if (github_token && github_user && github_repo) {
    await loadDashboard();
    showView('dashboard');
  } else if (github_token && github_user) {
    await loadPickerView(github_token, github_user);
    showView('picker');
  } else {
    showView('setup');
  }
}

document.addEventListener('DOMContentLoaded', boot);
