// =====================================================
// ADMIN PANEL — admin.js
// =====================================================

// ── State ────────────────────────────────────────────
let isLoggedIn   = false;
let _settings    = {};
let _teams       = {};
let _matches     = {};
let _totalRounds = 0;
let _activeModal = null;

// ── Password Hashing (SHA-256 via Web Crypto) ────────
async function sha256(msg) {
  const buf   = new TextEncoder().encode(msg);
  const hash  = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Utility ──────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  el.innerHTML = `<span>${icons[type]||''}</span> ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function showAlert(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

// ── Login ─────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert('login-error');
  const pw    = document.getElementById('login-pw').value.trim();
  const hash  = await sha256(pw);

  const snap = await db.ref(`${ROOT}/settings/adminPasswordHash`).get();
  const storedHash = snap.val();

  if (!storedHash) {
    // First-time setup: set default password
    await db.ref(`${ROOT}/settings`).update({
      adminPasswordHash: await sha256('admin123'),
      status: 'setup'
    });
    // Check again
    if (hash !== await sha256('admin123')) {
      showAlert('login-error', 'Password salah! Default: admin123');
      return;
    }
  } else if (hash !== storedHash) {
    showAlert('login-error', 'Password salah!');
    return;
  }

  isLoggedIn = true;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-layout').classList.add('show');
  initAdminListeners();
  loadMatchesTab();
});

// ── Navigation (handled by inline script in admin.html) ──

// ── Firebase Listeners ────────────────────────────────
function initAdminListeners() {
  db.ref(`${ROOT}/settings`).on('value', snap => {
    _settings = snap.val() || {};
    populateSetupForm();
  });
  db.ref(`${ROOT}/teams`).on('value', snap => {
    _teams = snap.val() || {};
  });
  db.ref(`${ROOT}/matches`).on('value', snap => {
    _matches = snap.val() || {};
    _totalRounds = _settings.totalRounds || 0;
    loadMatchesTab();
  });
}

// ── SETUP TAB ─────────────────────────────────────────
function populateSetupForm() {
  const s = _settings;
  document.getElementById('setup-name').value   = s.name    || '';
  const num = s.numTeams || 8;
  document.getElementById('num-teams-slider').value = num;
  document.getElementById('num-teams-val').textContent = num;
  buildTeamInputs(num, s.teamNames || {});

  const statusEl = document.getElementById('setup-status');
  if (s.status === 'ongoing')   { statusEl.className = 'status-pill pending'; statusEl.textContent = '🟢 Sedang Berlangsung'; }
  else if (s.status === 'done') { statusEl.className = 'status-pill done';    statusEl.textContent = '🏆 Selesai'; }
  else                          { statusEl.className = 'status-pill bye';      statusEl.textContent = '⚙️ Setup'; }
}

// Slider update
document.getElementById('num-teams-slider').addEventListener('input', function() {
  const v = parseInt(this.value);
  document.getElementById('num-teams-val').textContent = v;
  buildTeamInputs(v, {});
});

function buildTeamInputs(count, existingNames) {
  const grid = document.getElementById('team-inputs-grid');
  grid.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const row = document.createElement('div');
    row.className = 'team-input-row';
    row.innerHTML = `
      <span class="team-num">${i}</span>
      <input
        class="form-input"
        type="text"
        id="team-name-${i}"
        placeholder="Nama Tim ${i}"
        value="${esc(existingNames[`team_${i}`] || '')}"
        maxlength="20"
      />`;
    grid.appendChild(row);
  }
}

// Save tournament name + team count
document.getElementById('save-setup-btn').addEventListener('click', async () => {
  const name    = document.getElementById('setup-name').value.trim();
  const numTeams = parseInt(document.getElementById('num-teams-slider').value);

  if (!name) { toast('Isi nama turnamen dulu!', 'error'); return; }

  // Collect team names
  const teamNames = {};
  for (let i = 1; i <= numTeams; i++) {
    const v = document.getElementById(`team-name-${i}`)?.value.trim() || `Tim ${i}`;
    teamNames[`team_${i}`] = v;
  }

  await db.ref(`${ROOT}/settings`).update({ name, numTeams, teamNames });
  toast('Pengaturan tersimpan!', 'success');
});

// Generate Bracket
document.getElementById('generate-bracket-btn').addEventListener('click', async () => {
  const numTeams  = parseInt(document.getElementById('num-teams-slider').value);
  const teamNames = _settings.teamNames || {};
  const name      = document.getElementById('setup-name').value.trim() || 'ML Tournament';

  if (numTeams < 2) { toast('Minimal 2 tim!', 'error'); return; }

  // Build teams array
  const teams = [];
  for (let i = 1; i <= numTeams; i++) {
    const tname = teamNames[`team_${i}`] || `Tim ${i}`;
    teams.push({ id: `team_${i}`, name: tname, seed: i });
  }

  const { bracketSize, totalRounds, matches } = generateBracket(teams);

  // Build teams object for Firebase
  const teamsObj = {};
  for (const t of teams) teamsObj[t.id] = { id: t.id, name: t.name, seed: t.seed };

  const updates = {};
  updates[`${ROOT}/teams`]   = teamsObj;
  updates[`${ROOT}/matches`] = matches;
  updates[`${ROOT}/settings/bracketSize`]  = bracketSize;
  updates[`${ROOT}/settings/totalRounds`]  = totalRounds;
  updates[`${ROOT}/settings/numTeams`]     = numTeams;
  updates[`${ROOT}/settings/name`]         = name;
  updates[`${ROOT}/settings/status`]       = 'ongoing';

  await db.ref().update(updates);
  toast(`Bracket berhasil dibuat! (${totalRounds} round, ${bracketSize} slot)`, 'success');
});

// ── MATCHES TAB ───────────────────────────────────────
function loadMatchesTab() {
  const list = document.getElementById('matches-list');
  if (!list) return;

  if (Object.keys(_matches).length === 0) {
    list.innerHTML = '<p style="color:var(--text-700);font-size:.85rem">Bracket belum dibuat. Buat di tab Setup dulu.</p>';
    return;
  }

  // Sort: pending first, then by round, then position
  const sorted = Object.values(_matches).sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (a.status !== 'done' && b.status === 'done') return -1;
    if (a.round !== b.round) return a.round - b.round;
    return a.position - b.position;
  });

  list.innerHTML = sorted.map(m => {
    const t1 = m.team1 ? (_teams[m.team1]?.name || 'TBD') : 'TBD';
    const t2 = m.team2 ? (_teams[m.team2]?.name || 'TBD') : 'TBD';
    const statusCls   = m.isBye ? 'bye' : m.status === 'done' ? 'done' : 'pending';
    const statusLabel = m.isBye ? 'BYE' : m.status === 'done' ? 'Selesai' : 'Menunggu';
    const itemCls     = m.isBye ? 'match-item bye-item' : m.status === 'done' ? 'match-item done' : 'match-item';

    return `
      <div class="${itemCls}" data-match-id="${m.id}" onclick="openMatchModal('${m.id}')">
        <div class="match-item-round">${m.roundName}</div>
        <div class="match-item-teams">
          <span>${esc(t1)}</span>
          <span class="match-item-vs">VS</span>
          <span>${esc(t2)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="format-badge ${m.format.toLowerCase()}">${m.format}</span>
          <span class="status-pill ${statusCls}">${statusLabel}</span>
        </div>
      </div>`;
  }).join('');
}

// ── MATCH MODAL ───────────────────────────────────────
function openMatchModal(matchId) {
  const m = _matches[matchId];
  if (!m || m.isBye || m.status === 'done') return;
  if (!m.team1 || !m.team2) {
    toast('Salah satu tim belum diketahui (tunggu round sebelumnya)', 'error');
    return;
  }

  _activeModal = matchId;
  const t1name = _teams[m.team1]?.name || 'Tim 1';
  const t2name = _teams[m.team2]?.name || 'Tim 2';

  document.getElementById('modal-match-title').textContent = m.roundName;
  document.getElementById('modal-match-format').textContent = m.format;

  const body = document.getElementById('modal-body');
  if (m.format === 'BO1') {
    body.innerHTML = buildBO1UI(m, t1name, t2name);
  } else {
    body.innerHTML = buildBO3UI(m, t1name, t2name);
  }

  document.getElementById('match-modal').classList.add('show');
}

function closeMatchModal() {
  document.getElementById('match-modal').classList.remove('show');
  _activeModal = null;
}
document.getElementById('modal-close-btn').addEventListener('click', closeMatchModal);
document.getElementById('match-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMatchModal();
});

// ── BO1 UI ────────────────────────────────────────────
function buildBO1UI(m, t1name, t2name) {
  return `
    <p style="color:var(--text-500);font-size:.85rem;margin-bottom:16px">Pilih pemenang pertandingan:</p>
    <div class="bo1-grid">
      <button class="winner-pick" onclick="selectBO1('${m.team1}')" id="pick-${m.team1}">
        🏆 ${esc(t1name)}
      </button>
      <button class="winner-pick" onclick="selectBO1('${m.team2}')" id="pick-${m.team2}">
        🏆 ${esc(t2name)}
      </button>
    </div>
    <div id="bo1-confirm" style="display:none;margin-top:16px">
      <button class="btn btn-primary btn-full" onclick="submitBO1()">✅ Konfirmasi Hasil</button>
    </div>`;
}

let _bo1Selected = null;
function selectBO1(teamId) {
  _bo1Selected = teamId;
  document.querySelectorAll('.winner-pick').forEach(b => b.classList.remove('selected'));
  document.getElementById(`pick-${teamId}`)?.classList.add('selected');
  document.getElementById('bo1-confirm').style.display = 'block';
}

async function submitBO1() {
  if (!_bo1Selected || !_activeModal) return;
  const m = _matches[_activeModal];
  if (!m) return;

  const updates = {};
  updates[`${ROOT}/matches/${m.id}/winner`] = _bo1Selected;
  updates[`${ROOT}/matches/${m.id}/status`] = 'done';

  // Advance winner to next round
  const next = getNextMatchInfo(m.round, m.position, _settings.totalRounds);
  if (next) {
    updates[`${ROOT}/matches/${next.matchId}/${next.slot}`] = _bo1Selected;
  }

  // Check if tournament is finished
  if (!next) {
    updates[`${ROOT}/settings/status`] = 'done';
  }

  await db.ref().update(updates);
  closeMatchModal();
  toast('Hasil tersimpan!', 'success');
  _bo1Selected = null;
}

// ── BO3 UI ────────────────────────────────────────────
let _bo3Games = { g1: null, g2: null, g3: null };

function buildBO3UI(m, t1name, t2name) {
  _bo3Games = { g1: null, g2: null, g3: null };

  // Restore existing games if any
  if (m.games) {
    _bo3Games.g1 = m.games.g1 || null;
    _bo3Games.g2 = m.games.g2 || null;
    _bo3Games.g3 = m.games.g3 || null;
  }

  return `
    <div class="score-tally">
      <span class="tally-team">${esc(t1name)}</span>
      <span class="tally-score" id="tally-t1">0</span>
      <span class="tally-dash">-</span>
      <span class="tally-score" id="tally-t2">0</span>
      <span class="tally-team">${esc(t2name)}</span>
    </div>
    <div class="bo3-games" id="bo3-games">
      ${buildGameRow(1, m.team1, m.team2, t1name, t2name)}
      ${buildGameRow(2, m.team1, m.team2, t1name, t2name)}
      ${buildGameRow(3, m.team1, m.team2, t1name, t2name)}
    </div>
    <div id="bo3-confirm" style="display:none">
      <div class="divider"></div>
      <p style="color:var(--text-500);font-size:.8rem;margin-bottom:12px;text-align:center">Pemenang: <strong id="bo3-winner-preview" style="color:var(--gold-500)"></strong></p>
      <button class="btn btn-primary btn-full" onclick="submitBO3()">✅ Konfirmasi Hasil BO3</button>
    </div>`;
}

function buildGameRow(gameNum, team1Id, team2Id, t1name, t2name) {
  return `
    <div class="game-row" id="game-row-${gameNum}">
      <div class="game-label">Map ${gameNum}</div>
      <div class="game-btns">
        <button class="game-team-btn" onclick="selectGame(${gameNum},'${team1Id}')" id="gbtn-${gameNum}-t1">
          ${esc(t1name)}
        </button>
        <span class="game-vs">MENANG</span>
        <button class="game-team-btn" onclick="selectGame(${gameNum},'${team2Id}')" id="gbtn-${gameNum}-t2">
          ${esc(t2name)}
        </button>
      </div>
    </div>`;
}

function selectGame(gameNum, winnerId) {
  const m = _matches[_activeModal];
  if (!m) return;

  _bo3Games[`g${gameNum}`] = winnerId;

  // Update button styles
  const btn1 = document.getElementById(`gbtn-${gameNum}-t1`);
  const btn2 = document.getElementById(`gbtn-${gameNum}-t2`);
  if (btn1) btn1.classList.toggle('selected', winnerId === m.team1);
  if (btn2) btn2.classList.toggle('selected', winnerId === m.team2);

  // Recalculate totals
  const { t1wins, t2wins, winner } = calcBO3(_bo3Games, m.team1, m.team2);

  document.getElementById('tally-t1').textContent = t1wins;
  document.getElementById('tally-t2').textContent = t2wins;

  // Disable game 3 row if already decided
  const row3 = document.getElementById('game-row-3');
  if (row3) {
    if ((t1wins >= 2 || t2wins >= 2) && !_bo3Games.g3) {
      row3.classList.add('disabled');
    } else {
      row3.classList.remove('disabled');
    }
  }

  // Show confirm if we have a winner
  const confirmEl = document.getElementById('bo3-confirm');
  if (winner) {
    const wname = _teams[winner]?.name || winner;
    document.getElementById('bo3-winner-preview').textContent = wname;
    if (confirmEl) confirmEl.style.display = 'block';
  } else {
    if (confirmEl) confirmEl.style.display = 'none';
  }
}

async function submitBO3() {
  const m = _matches[_activeModal];
  if (!m) return;

  const { t1wins, t2wins, winner } = calcBO3(_bo3Games, m.team1, m.team2);
  if (!winner) { toast('Belum ada pemenang BO3!', 'error'); return; }

  const updates = {};
  updates[`${ROOT}/matches/${m.id}/games`]  = _bo3Games;
  updates[`${ROOT}/matches/${m.id}/winner`] = winner;
  updates[`${ROOT}/matches/${m.id}/status`] = 'done';

  // Advance winner
  const next = getNextMatchInfo(m.round, m.position, _settings.totalRounds);
  if (next) {
    updates[`${ROOT}/matches/${next.matchId}/${next.slot}`] = winner;
  } else {
    updates[`${ROOT}/settings/status`] = 'done';
  }

  await db.ref().update(updates);
  closeMatchModal();
  toast('Hasil BO3 tersimpan!', 'success');
  _bo3Games = { g1: null, g2: null, g3: null };
}

// ── RESET BRACKET ─────────────────────────────────────
document.getElementById('reset-bracket-btn')?.addEventListener('click', async () => {
  if (!confirm('Reset bracket? Semua hasil pertandingan akan terhapus!')) return;
  await db.ref(`${ROOT}/matches`).remove();
  await db.ref(`${ROOT}/settings`).update({ status: 'setup', totalRounds: 0, bracketSize: 0 });
  toast('Bracket direset', 'info');
});

// ── CHANGE PASSWORD ───────────────────────────────────
document.getElementById('change-pw-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert('pw-error');
  const oldPw  = document.getElementById('old-pw').value.trim();
  const newPw  = document.getElementById('new-pw').value.trim();
  const newPw2 = document.getElementById('new-pw2').value.trim();

  if (newPw !== newPw2) { showAlert('pw-error', 'Password baru tidak cocok!'); return; }
  if (newPw.length < 4) { showAlert('pw-error', 'Password minimal 4 karakter!'); return; }

  const oldHash  = await sha256(oldPw);
  const snap     = await db.ref(`${ROOT}/settings/adminPasswordHash`).get();
  if (snap.val() !== oldHash) { showAlert('pw-error', 'Password lama salah!'); return; }

  await db.ref(`${ROOT}/settings/adminPasswordHash`).set(await sha256(newPw));
  toast('Password berhasil diubah!', 'success');
  e.target.reset();
});

// ── Logout ────────────────────────────────────────────
document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (!confirm('Keluar dari panel admin?')) return;
  isLoggedIn = false;
  document.getElementById('admin-layout').classList.remove('show');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-pw').value = '';
});

// ── DOMContentLoaded ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildTeamInputs(8, {});
});
