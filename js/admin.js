// =====================================================
// ADMIN PANEL — admin.js
// Interactive Matchup & Bracket Generator
// =====================================================

// ── State ────────────────────────────────────────────
let isLoggedIn   = false;
let _settings    = {};
let _teams       = {};
let _matches     = {};
let _activeModal = null;

// Custom Pairings State: array of { team1Id: string|null, team2Id: string|null }
let _customPairings = [];

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
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert('login-error');
  const pw    = document.getElementById('login-pw').value.trim();
  const hash  = await sha256(pw);

  const snap = await db.ref(`${ROOT}/settings/adminPasswordHash`).get();
  const storedHash = snap.val();

  if (!storedHash) {
    await db.ref(`${ROOT}/settings`).update({
      adminPasswordHash: await sha256('admin123'),
      status: 'setup'
    });
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
    loadMatchesTab();
  });
}

// ── SETUP TAB ─────────────────────────────────────────
function populateSetupForm() {
  const s = _settings;
  const nameEl = document.getElementById('setup-name');
  if (nameEl) nameEl.value = s.name || '';

  const num = s.numTeams || 8;
  const slider = document.getElementById('num-teams-slider');
  if (slider) slider.value = num;
  const valEl = document.getElementById('num-teams-val');
  if (valEl) valEl.textContent = num;

  buildTeamInputs(num, s.teamNames || {});
  renderMatchupBuilder();

  const statusEl = document.getElementById('setup-status');
  if (statusEl) {
    if (s.status === 'ongoing')   { statusEl.className = 'status-pill pending'; statusEl.textContent = '🟢 Sedang Berlangsung'; }
    else if (s.status === 'done') { statusEl.className = 'status-pill done';    statusEl.textContent = '🏆 Selesai'; }
    else                          { statusEl.className = 'status-pill bye';      statusEl.textContent = '⚙️ Setup'; }
  }
}

// Slider update
document.getElementById('num-teams-slider')?.addEventListener('input', function() {
  const v = parseInt(this.value);
  document.getElementById('num-teams-val').textContent = v;
  buildTeamInputs(v, {});
  _customPairings = []; // reset custom pairings on team count change
  renderMatchupBuilder();
});

function buildTeamInputs(count, existingNames) {
  const grid = document.getElementById('team-inputs-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const row = document.createElement('div');
    row.className = 'team-input-row';
    const val = existingNames[`team_${i}`] || `Tim ${i}`;
    row.innerHTML = `
      <span class="team-num">${i}</span>
      <input
        class="form-input team-name-input"
        type="text"
        id="team-name-${i}"
        data-team-id="team_${i}"
        placeholder="Nama Tim ${i}"
        value="${esc(val)}"
        maxlength="25"
      />`;
    grid.appendChild(row);
  }

  // Add listeners to team inputs so dropdowns update live
  grid.querySelectorAll('.team-name-input').forEach(input => {
    input.addEventListener('input', () => {
      renderMatchupBuilder(true); // keep selected IDs
    });
  });
}

// Get current team list from setup tab
function getCurrentTeams() {
  const numTeams = parseInt(document.getElementById('num-teams-slider')?.value || '8');
  const teams = [];
  for (let i = 1; i <= numTeams; i++) {
    const el = document.getElementById(`team-name-${i}`);
    const name = el ? (el.value.trim() || `Tim ${i}`) : `Tim ${i}`;
    teams.push({ id: `team_${i}`, name, seed: i });
  }
  return teams;
}

// ── MATCHUP BUILDER UI ────────────────────────────────
function renderMatchupBuilder(preserveSelections = false) {
  const container = document.getElementById('matchup-builder-grid');
  if (!container) return;

  const teams = getCurrentTeams();
  const numTeams = teams.length;
  const bracketSize = nextPowerOf2(numTeams);
  const numR1Matches = bracketSize / 2;

  // Initialize standard default pairings if empty or count changed
  if (_customPairings.length !== numR1Matches || !preserveSelections) {
    const seedOrder = generateSeeds(bracketSize);
    const slots = seedOrder.map(s => (s <= numTeams ? `team_${s}` : null));
    _customPairings = [];
    for (let i = 0; i < bracketSize; i += 2) {
      _customPairings.push({ team1Id: slots[i], team2Id: slots[i + 1] });
    }
  }

  let html = '';
  for (let m = 0; m < numR1Matches; m++) {
    const p = _customPairings[m] || { team1Id: null, team2Id: null };
    html += `
      <div class="matchup-builder-card" data-match-idx="${m}">
        <div class="mb-match-title">Match ${m + 1}</div>
        <div class="mb-select-row">
          ${buildTeamSelectHTML(teams, p.team1Id, m, 'team1')}
          <span class="mb-vs">VS</span>
          ${buildTeamSelectHTML(teams, p.team2Id, m, 'team2')}
        </div>
      </div>`;
  }

  container.innerHTML = html;

  // Bind change events
  container.querySelectorAll('.mb-team-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.matchIdx);
      const slot = e.target.dataset.slot; // 'team1' or 'team2'
      const val = e.target.value || null;

      // Update state
      if (slot === 'team1') _customPairings[idx].team1Id = val;
      else _customPairings[idx].team2Id = val;
    });
  });
}

function buildTeamSelectHTML(teams, selectedId, matchIdx, slot) {
  let opts = `<option value="">-- BYE --</option>`;
  for (const t of teams) {
    const sel = t.id === selectedId ? 'selected' : '';
    opts += `<option value="${t.id}" ${sel}>#${t.seed} ${esc(t.name)}</option>`;
  }
  return `
    <select class="form-select mb-team-select" data-match-idx="${matchIdx}" data-slot="${slot}">
      ${opts}
    </select>`;
}

// Shuffle matchups randomly
document.getElementById('btn-shuffle-matchups')?.addEventListener('click', () => {
  const teams = getCurrentTeams();
  const numTeams = teams.length;
  const bracketSize = nextPowerOf2(numTeams);
  const numR1Matches = bracketSize / 2;

  // Shuffle team IDs
  const teamIds = teams.map(t => t.id);
  for (let i = teamIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
  }

  // Fill array up to bracketSize with nulls (BYEs)
  while (teamIds.length < bracketSize) teamIds.push(null);

  _customPairings = [];
  for (let i = 0; i < bracketSize; i += 2) {
    _customPairings.push({ team1Id: teamIds[i], team2Id: teamIds[i + 1] });
  }

  renderMatchupBuilder(true);
  toast('Matchup berhasil diacak!', 'info');
});

// Reset matchups to standard seeding
document.getElementById('btn-reset-matchups')?.addEventListener('click', () => {
  _customPairings = [];
  renderMatchupBuilder();
  toast('Matchup dikembalikan ke urutan standard', 'info');
});

// Save tournament name + team names
document.getElementById('save-setup-btn')?.addEventListener('click', async () => {
  const name     = document.getElementById('setup-name').value.trim() || 'ML Tournament';
  const numTeams = parseInt(document.getElementById('num-teams-slider').value);

  const teamNames = {};
  for (let i = 1; i <= numTeams; i++) {
    const v = document.getElementById(`team-name-${i}`)?.value.trim() || `Tim ${i}`;
    teamNames[`team_${i}`] = v;
  }

  await db.ref(`${ROOT}/settings`).update({ name, numTeams, teamNames });
  toast('Nama tim tersimpan!', 'success');
});

// Generate Bracket from Custom Pairings
document.getElementById('generate-bracket-btn')?.addEventListener('click', async () => {
  const teams = getCurrentTeams();
  const numTeams = teams.length;
  const name = document.getElementById('setup-name').value.trim() || 'ML Tournament';

  if (numTeams < 2) { toast('Minimal 2 tim!', 'error'); return; }

  // Build teams map for quick lookup
  const teamMap = {};
  for (const t of teams) teamMap[t.id] = t;

  const bracketSize = nextPowerOf2(numTeams);
  const totalRounds = Math.log2(bracketSize);
  const numR1Matches = bracketSize / 2;

  // Build pairings object array for bracket logic
  const pairings = [];
  for (let i = 0; i < numR1Matches; i++) {
    const p = _customPairings[i] || { team1Id: null, team2Id: null };
    pairings.push({
      team1: p.team1Id ? teamMap[p.team1Id] || null : null,
      team2: p.team2Id ? teamMap[p.team2Id] || null : null
    });
  }

  const { matches } = generateBracketFromPairings(pairings, totalRounds, bracketSize);

  // Teams object for Firebase
  const teamsObj = {};
  for (const t of teams) teamsObj[t.id] = { id: t.id, name: t.name, seed: t.seed };

  // Save to Firebase
  const updates = {};
  updates[`${ROOT}/teams`]   = teamsObj;
  updates[`${ROOT}/matches`] = matches;
  updates[`${ROOT}/settings/bracketSize`] = bracketSize;
  updates[`${ROOT}/settings/totalRounds`] = totalRounds;
  updates[`${ROOT}/settings/numTeams`]    = numTeams;
  updates[`${ROOT}/settings/name`]        = name;
  updates[`${ROOT}/settings/status`]      = 'ongoing';

  // Also save teamNames
  const teamNames = {};
  for (const t of teams) teamNames[t.id] = t.name;
  updates[`${ROOT}/settings/teamNames`]   = teamNames;

  await db.ref().update(updates);
  toast(`Bracket berhasil dibuat! (${totalRounds} round, ${bracketSize} slot)`, 'success');
});

// ── MATCHES TAB ───────────────────────────────────────
function loadMatchesTab() {
  const list = document.getElementById('matches-list');
  if (!list) return;

  if (Object.keys(_matches).length === 0) {
    list.innerHTML = '<p style="color:var(--text-3);font-size:.85rem">Bracket belum dibuat. Klik "Simpan & Generate Bracket" di tab Setup.</p>';
    return;
  }

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
document.getElementById('modal-close-btn')?.addEventListener('click', closeMatchModal);
document.getElementById('match-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMatchModal();
});

// ── BO1 UI ────────────────────────────────────────────
function buildBO1UI(m, t1name, t2name) {
  return `
    <p style="color:var(--text-3);font-size:.85rem;margin-bottom:16px">Pilih pemenang pertandingan:</p>
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

  const next = getNextMatchInfo(m.round, m.position, _settings.totalRounds);
  if (next) {
    updates[`${ROOT}/matches/${next.matchId}/${next.slot}`] = _bo1Selected;
  } else {
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
      <p style="color:var(--text-3);font-size:.8rem;margin-bottom:12px;text-align:center">Pemenang: <strong id="bo3-winner-preview" style="color:var(--gold)"></strong></p>
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

  const btn1 = document.getElementById(`gbtn-${gameNum}-t1`);
  const btn2 = document.getElementById(`gbtn-${gameNum}-t2`);
  if (btn1) btn1.classList.toggle('selected', winnerId === m.team1);
  if (btn2) btn2.classList.toggle('selected', winnerId === m.team2);

  const { t1wins, t2wins, winner } = calcBO3(_bo3Games, m.team1, m.team2);

  document.getElementById('tally-t1').textContent = t1wins;
  document.getElementById('tally-t2').textContent = t2wins;

  const row3 = document.getElementById('game-row-3');
  if (row3) {
    if ((t1wins >= 2 || t2wins >= 2) && !_bo3Games.g3) row3.classList.add('disabled');
    else row3.classList.remove('disabled');
  }

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

  const { winner } = calcBO3(_bo3Games, m.team1, m.team2);
  if (!winner) { toast('Belum ada pemenang BO3!', 'error'); return; }

  const updates = {};
  updates[`${ROOT}/matches/${m.id}/games`]  = _bo3Games;
  updates[`${ROOT}/matches/${m.id}/winner`] = winner;
  updates[`${ROOT}/matches/${m.id}/status`] = 'done';

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

  const oldHash = await sha256(oldPw);
  const snap    = await db.ref(`${ROOT}/settings/adminPasswordHash`).get();
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
  renderMatchupBuilder();
});
