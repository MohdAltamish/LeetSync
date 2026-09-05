/**
 * popup.js — LeetSync popup controller
 * Views: setup → oauth → picker → dashboard
 */
'use strict';

// ─── View router ──────────────────────────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.remove('active');
    v.style.display = 'none';
  });
  const t = document.getElementById(`view-${id}`);
  if (!t) return;
  t.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('active')));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function showError(id, msg) {
  const e = $(id); if (!e) return;
  e.textContent = msg; e.classList.remove('hidden');
}
function hideError(id) { const e=$(id); if(e) e.classList.add('hidden'); }

function setBtnLoading(btnId, spinnerId, labelId, on) {
  const btn=$(btnId); if(btn) btn.disabled=on;
  const sp=$(spinnerId); if(sp) sp.classList.toggle('hidden',!on);
  const lb=$(labelId); if(lb) lb.classList.toggle('hidden',on);
}

function timeAgo(ts) {
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60)    return `${s}s ago`;
  if(s<3600)  return `${Math.floor(s/60)}m ago`;
  if(s<86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function formatSeconds(sec) {
  if(!sec||sec<=0) return '—';
  if(sec<60) return `${sec}s`;
  const m=Math.floor(sec/60), s=sec%60;
  return s>0?`${m}m ${s}s`:`${m}m`;
}

function animateCount(el, target, duration=600) {
  if(!el||isNaN(target)) return;
  const n=Number(target), start=performance.now();
  (function step(now) {
    const p=Math.min((now-start)/duration,1);
    el.textContent=Math.floor(p*n);
    if(p<1) requestAnimationFrame(step); else el.textContent=n;
  })(performance.now());
}

function animateBars(easy, medium, hard) {
  const total=(easy||0)+(medium||0)+(hard||0);
  setTimeout(()=>{
    const be=$('bar-easy'),bm=$('bar-medium'),bh=$('bar-hard');
    if(be) be.style.width=total?`${((easy||0)/total)*100}%`:'0%';
    if(bm) bm.style.width=total?`${((medium||0)/total)*100}%`:'0%';
    if(bh) bh.style.width=total?`${((hard||0)/total)*100}%`:'0%';
  },150);
}

// ─── GitHub API (popup-side) ──────────────────────────────────────────────────

async function validateToken(token) {
  const res=await fetch('https://api.github.com/user',{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github.v3+json'},
  });
  if(res.status===401) throw new Error('Invalid token — make sure it has the repo scope.');
  if(!res.ok) throw new Error(`GitHub error: ${res.status}`);
  const d=await res.json();
  return {login:d.login,avatar:d.avatar_url};
}

async function fetchRepos(token) {
  // 1. If GitHub App, return ONLY the repositories granted during installation
  try {
    const instRes = await fetch('https://api.github.com/user/installations', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (instRes.ok) {
      const instData = await instRes.json();
      if (instData.installations && instData.installations.length > 0) {
        const appRepos = [];
        for (const inst of instData.installations) {
          const repoRes = await fetch(`https://api.github.com/user/installations/${inst.id}/repositories?per_page=100`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
          });
          if (repoRes.ok) {
            const data = await repoRes.json();
            if (Array.isArray(data.repositories)) {
              data.repositories.forEach((r) => appRepos.push(r.name));
            }
          }
        }
        if (appRepos.length > 0) {
          return [...new Set(appRepos)].sort();
        }
      }
    }
  } catch (_) {}

  // 2. Fallback for PAT tokens
  try {
    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner',
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) return list.map((r) => r.name).sort();
    }
  } catch (_) {}

  return [];
}

async function createRepo(token,name) {
  const res=await fetch('https://api.github.com/user/repos',{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github.v3+json','Content-Type':'application/json'},
    body:JSON.stringify({name,description:'My LeetCode solutions, auto-synced by LeetSync.',private:false,auto_init:true}),
  });
  if(!res.ok){const e=await res.json();throw new Error(e.message||`Failed: ${res.status}`);}
  return res.json();
}

// ─── VIEW 1: Setup ────────────────────────────────────────────────────────────

function initSetupView() {
  const patInput=$('pat-input');

  // Eye toggle
  $('pat-toggle').addEventListener('click',()=>{
    const isPass=patInput.type==='password';
    patInput.type=isPass?'text':'password';
    $('eye-show').classList.toggle('hidden',isPass);
    $('eye-hide').classList.toggle('hidden',!isPass);
  });

  // PAT connect
  $('connect-btn').addEventListener('click',async()=>{
    const token=patInput.value.trim();
    if(!token){
      patInput.classList.add('error');
      showError('setup-error','Please enter your GitHub token.');
      setTimeout(()=>patInput.classList.remove('error'),600);
      return;
    }
    hideError('setup-error');
    setBtnLoading('connect-btn','connect-spinner','connect-label',true);
    try {
      const user=await validateToken(token);
      await chrome.storage.local.set({github_token:token,github_user:user.login,github_avatar:user.avatar,github_auth_type:'pat'});
      await loadPickerView(token,user.login);
      showView('picker');
    } catch(err) {
      patInput.classList.add('error');
      showError('setup-error',err.message);
      setTimeout(()=>patInput.classList.remove('error'),600);
    } finally {
      setBtnLoading('connect-btn','connect-spinner','connect-label',false);
    }
  });

  // OAuth button — starts device flow + auto-copies code + opens tab
  $('oauth-btn').addEventListener('click', async () => {
    hideError('setup-error');
    setBtnLoading('oauth-btn', 'oauth-spinner', 'oauth-label', true);

    chrome.runtime.sendMessage({ type: 'LEETSYNC_OAUTH_START' }, async (res) => {
      setBtnLoading('oauth-btn', 'oauth-spinner', 'oauth-label', false);

      if (chrome.runtime.lastError || !res?.success) {
        showError('setup-error', res?.error || 'Could not start OAuth. Try the PAT option.');
        return;
      }

      // 1. Copy code to clipboard FIRST while document is guaranteed focused
      try {
        await navigator.clipboard.writeText(res.user_code);
      } catch (_) {}

      // 2. Show OAuth view in popup with the code
      startOAuthView(res.user_code, res.verification_uri, res.expires_in);
      showView('oauth');

      // 3. Open GitHub device activation tab
      chrome.tabs.create({ url: res.verification_uri || 'https://github.com/login/device' });
    });
  });
}

// ─── VIEW 2: OAuth Device Flow ────────────────────────────────────────────────

let oauthCountdownInterval=null;

function startOAuthView(userCode,verifyUri,expiresIn) {
  $('device-user-code').textContent=userCode;
  $('device-verify-link').href=verifyUri||'https://github.com/login/device';
  hideError('oauth-error');
  $('oauth-status-text').textContent='Waiting for you to authorize…';

  // ✅ Auto-copy the code to clipboard immediately
  navigator.clipboard.writeText(userCode).then(()=>{
    const lbl=$('copy-label');
    if(lbl) lbl.textContent='Copied!';
    $('copy-icon').classList.add('hidden');
    $('copied-icon').classList.remove('hidden');
    // Reset after 3s
    setTimeout(()=>{
      if(lbl) lbl.textContent='Copy';
      $('copy-icon').classList.remove('hidden');
      $('copied-icon').classList.add('hidden');
    },3000);
  }).catch(()=>{
    // Clipboard failed (rare) — user can still click Copy manually
  });

  // Manual copy button
  $('copy-code-btn').onclick=()=>{
    navigator.clipboard.writeText(userCode).then(()=>{
      const lbl=$('copy-label');
      if(lbl) lbl.textContent='Copied!';
      $('copy-icon').classList.add('hidden');
      $('copied-icon').classList.remove('hidden');
      setTimeout(()=>{
        if(lbl) lbl.textContent='Copy';
        $('copy-icon').classList.remove('hidden');
        $('copied-icon').classList.add('hidden');
      },2000);
    });
  };

  // Countdown timer
  if(oauthCountdownInterval) clearInterval(oauthCountdownInterval);
  let remaining=expiresIn||900;
  const tick=()=>{
    const m=Math.floor(remaining/60),s=remaining%60;
    const el=$('oauth-countdown');
    if(el) el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if(remaining<=0){
      clearInterval(oauthCountdownInterval);
      showError('oauth-error','Code expired. Please try again.');
    }
    remaining--;
  };
  tick();
  oauthCountdownInterval=setInterval(tick,1000);

  // Cancel
  $('oauth-cancel-btn').onclick = async () => {
    clearInterval(oauthCountdownInterval);
    await chrome.storage.local.remove('pending_oauth');
    showView('setup');
  };

  // Listen for SW completion
  function oauthListener(msg) {
    if(msg.type==='LEETSYNC_OAUTH_DONE'){
      clearInterval(oauthCountdownInterval);
      chrome.runtime.onMessage.removeListener(oauthListener);

      // ✅ Update step indicators
      const s2=$('step-2'),s3=$('step-3');
      if(s2){s2.classList.remove('active');s2.classList.add('done');}
      if(s3){s3.classList.add('done');}

      $('oauth-status-text').textContent=`Connected as @${msg.user} ✓`;

      setTimeout(async()=>{
        const {github_token}=await chrome.storage.local.get('github_token');
        await loadPickerView(github_token,msg.user);
        showView('picker');
      },900);
    }
    if(msg.type==='LEETSYNC_OAUTH_ERROR'){
      clearInterval(oauthCountdownInterval);
      chrome.runtime.onMessage.removeListener(oauthListener);
      showError('oauth-error',msg.error);
    }
  }
  chrome.runtime.onMessage.addListener(oauthListener);
}

// ─── VIEW 3: Repo Picker ──────────────────────────────────────────────────────

async function loadPickerView(token,username) {
  $('picker-username').textContent=`@${username}`;
  $('repo-skeleton').classList.remove('hidden');
  $('repo-select').classList.add('hidden');
  try {
    const repos=await fetchRepos(token);
    const select=$('repo-select');
    select.innerHTML='<option value="">— select a repo —</option>';
    repos.forEach((name)=>{const o=document.createElement('option');o.value=name;o.textContent=name;select.appendChild(o);});
    if(repos.length===1){
      select.value=repos[0];
      $('start-sync-btn').disabled=false;
    }
    $('repo-skeleton').classList.add('hidden');
    select.classList.remove('hidden');
  } catch(err) {
    $('repo-skeleton').classList.add('hidden');
    showError('picker-error',err.message);
  }
}

function initPickerView() {
  const select=$('repo-select'),startBtn=$('start-sync-btn');

  const handleLogout = async () => {
    await chrome.storage.local.clear();
    showView('setup');
  };
  $('picker-logout-btn')?.addEventListener('click', handleLogout);
  $('picker-disconnect-btn')?.addEventListener('click', handleLogout);

  select.addEventListener('change',()=>{startBtn.disabled=!select.value;hideError('picker-error');});

  $('create-repo-btn').addEventListener('click',()=>{
    $('create-repo-input-row').classList.toggle('hidden');
    $('create-repo-btn').classList.toggle('hidden');
    $('new-repo-name').focus();
  });

  $('create-repo-confirm').addEventListener('click',async()=>{
    const name=$('new-repo-name').value.trim().replace(/\s+/g,'-');
    if(!name) return;
    hideError('picker-error');
    setBtnLoading('create-repo-confirm','create-spinner','create-label',true);
    try {
      const {github_token}=await chrome.storage.local.get('github_token');
      await createRepo(github_token,name);
      const o=document.createElement('option');o.value=name;o.textContent=name;
      select.appendChild(o);select.value=name;startBtn.disabled=false;
      $('create-repo-input-row').classList.add('hidden');
      $('create-repo-btn').classList.remove('hidden');
      $('new-repo-name').value='';
    } catch(err){showError('picker-error',err.message);}
    finally{setBtnLoading('create-repo-confirm','create-spinner','create-label',false);}
  });

  startBtn.addEventListener('click',async()=>{
    const repo=select.value;if(!repo) return;
    await chrome.storage.local.set({github_repo:repo});
    await loadDashboard();
    showView('dashboard');
    fetchAndApplyInsights(false);
  });
}

// ─── VIEW 4: Dashboard ────────────────────────────────────────────────────────

async function loadDashboard() {
  const {
    github_user,github_repo,
    leetsync_stats:s={solved:0,easy:0,medium:0,hard:0,streak:0,bestStreak:0,totalSeconds:0},
    last_sync,
  }=await chrome.storage.local.get(['github_user','github_repo','leetsync_stats','last_sync']);

  $('repo-link').href=`https://github.com/${github_user}/${github_repo}`;
  $('repo-name-display').textContent=`${github_user}/${github_repo}`;

  animateCount($('streak-count'),s.streak??0);
  $('best-streak-label').textContent=`Best: ${s.bestStreak??0}`;

  $('last-time').textContent=last_sync?.timeTaken??'—';
  const avgSec=(s.solved>0)?Math.floor((s.totalSeconds??0)/s.solved):0;
  $('avg-time-label').textContent=`Avg: ${formatSeconds(avgSec)}`;

  const easy=s.easy??0,medium=s.medium??0,hard=s.hard??0,total=s.solved??0;
  animateCount($('stat-easy'),easy);
  animateCount($('stat-medium'),medium);
  animateCount($('stat-hard'),hard);
  animateCount($('stat-total'),total);
  animateBars(easy,medium,hard);

  if(last_sync){
    const badge=$('last-sync-diff-badge');
    const diff=(last_sync.difficulty??'').toLowerCase();
    badge.textContent=last_sync.difficulty??'';
    badge.className=`diff-badge ${diff}`;
    $('last-sync-text').textContent=last_sync.title??'';
    $('last-sync-time').textContent=`${last_sync.timeTaken??''} · ${timeAgo(last_sync.timestamp)}`;
    $('last-sync-row').classList.remove('hidden');
  }

  const {leetsync_settings={autosync:true,skipresub:true}}=await chrome.storage.local.get('leetsync_settings');
  $('setting-autosync').checked=leetsync_settings.autosync;
  $('setting-skipresub').checked=leetsync_settings.skipresub;
}

async function fetchAndApplyInsights(forceRefresh=false) {
  const statusEl=$('insights-status'),cachedEl=$('insights-cached'),refreshBtn=$('refresh-btn');
  if(statusEl) statusEl.classList.remove('hidden');
  if(cachedEl) cachedEl.classList.add('hidden');
  if(refreshBtn) refreshBtn.classList.add('spinning');

  if(forceRefresh) await chrome.storage.local.set({insights_cache:null});

  chrome.runtime.sendMessage({type:'LEETSYNC_FETCH_INSIGHTS'},(res)=>{
    if(refreshBtn) refreshBtn.classList.remove('spinning');
    if(statusEl)   statusEl.classList.add('hidden');

    if(chrome.runtime.lastError||!res?.success){
      if(cachedEl){
        const txt=$('insights-cached-text');
        if(txt) txt.textContent=`Could not fetch: ${res?.error??'unknown error'}`;
        cachedEl.style.color='var(--accent-r)';
        cachedEl.classList.remove('hidden');
      }
      return;
    }

    const d=res.data;
    animateCount($('stat-easy'),  d.easy??0);
    animateCount($('stat-medium'),d.medium??0);
    animateCount($('stat-hard'),  d.hard??0);
    animateCount($('stat-total'), d.solved??0);
    animateBars(d.easy??0,d.medium??0,d.hard??0);
    animateCount($('streak-count'),d.streak??0);

    if(cachedEl){
      cachedEl.style.color='';
      const txt=$('insights-cached-text');
      if(txt) txt.textContent=d.fromCache?'From cache · click ↺ to refresh':`Synced from GitHub · ${timeAgo(d.fetchedAt)}`;
      cachedEl.classList.remove('hidden');
    }
  });
}

function initDashboardView() {
  $('refresh-btn').addEventListener('click',()=>fetchAndApplyInsights(true));

  $('settings-toggle').addEventListener('click',()=>{
    const panel=$('settings-panel'),open=!panel.classList.contains('hidden');
    panel.classList.toggle('hidden',open);
    $('settings-toggle').classList.toggle('open',!open);
  });

  $('settings-save').addEventListener('click',async()=>{
    await chrome.storage.local.set({leetsync_settings:{autosync:$('setting-autosync').checked,skipresub:$('setting-skipresub').checked}});
    const saved=$('settings-saved');saved.classList.remove('hidden');
    setTimeout(()=>saved.classList.add('hidden'),2000);
  });

  $('disconnect-btn').addEventListener('click',()=>{
    $('disconnect-confirm').classList.remove('hidden');
    $('disconnect-btn').classList.add('hidden');
  });
  $('disconnect-no').addEventListener('click',()=>{
    $('disconnect-confirm').classList.add('hidden');
    $('disconnect-btn').classList.remove('hidden');
  });
  $('disconnect-yes').addEventListener('click',async()=>{
    await chrome.storage.local.clear();
    showView('setup');
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  initSetupView();
  initPickerView();
  initDashboardView();

  const { github_token, github_user, github_repo, pending_oauth } =
    await chrome.storage.local.get(['github_token', 'github_user', 'github_repo', 'pending_oauth']);

  if (github_token && github_user && github_repo) {
    await loadDashboard();
    showView('dashboard');
    fetchAndApplyInsights(false);
  } else if (github_token && github_user) {
    await loadPickerView(github_token, github_user);
    showView('picker');
  } else if (pending_oauth && pending_oauth.expires_at > Date.now()) {
    const remaining = Math.max(1, Math.floor((pending_oauth.expires_at - Date.now()) / 1000));
    startOAuthView(pending_oauth.user_code, pending_oauth.verification_uri, remaining);
    showView('oauth');
  } else {
    showView('setup');
  }
}

document.addEventListener('DOMContentLoaded',boot);
