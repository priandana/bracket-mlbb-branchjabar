// =====================================================
// BRACKET VIEWER — app.js (Perfect Symmetrical Layout)
// =====================================================

const SLOT_H = 90; // base slot height per match in Round 1 (px)

let _teams   = {};
let _matches = {};
let _meta    = {};

// ── Init ─────────────────────────────────────────────
function initViewer() {
  db.ref(`${ROOT}/settings`).on('value', snap => {
    const s = snap.val();
    if (!s) { showEmpty(); return; }
    const name = s.name || 'ML Tournament';
    document.getElementById('tournament-name').textContent = name;
    document.title = name + ' — Bracket';
    if (s.status === 'setup' || !s.totalRounds) { showEmpty(); return; }
    _meta = { totalRounds: s.totalRounds, bracketSize: s.bracketSize };
    tryRender();
  });
  db.ref(`${ROOT}/teams`).on('value',   snap => { _teams   = snap.val() || {}; tryRender(); });
  db.ref(`${ROOT}/matches`).on('value', snap => { _matches = snap.val() || {}; tryRender(); });
}

function tryRender() {
  if (!_meta.totalRounds || !Object.keys(_matches).length) return;
  renderBracket();
}

function showEmpty() {
  document.getElementById('bracket-root').innerHTML = `
    <div class="empty-state">
      <span class="emoji">⚔️</span>
      <h2>Bracket Belum Tersedia</h2>
      <p>Administrator sedang mempersiapkan turnamen. Bracket akan muncul di sini setelah dibuat.</p>
      <a href="admin.html" class="btn btn-primary">Buka Panel Admin</a>
    </div>`;
}

// ── Main Render ───────────────────────────────────────
function renderBracket() {
  const { totalRounds, bracketSize } = _meta;

  // Total height for round container: (bracketSize / 2) * SLOT_H
  // e.g. bracketSize=16 -> (16/2)*90 = 720px
  // e.g. bracketSize=8  -> (8/2)*90  = 360px
  const BRACKET_H = (bracketSize / 2) * SLOT_H;

  // Group matches by round & sort by position
  const rounds = {};
  for (const id in _matches) {
    const m = _matches[id];
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  for (const r in rounds) rounds[r].sort((a, b) => a.position - b.position);

  // Check champion
  const finalRound = rounds[totalRounds] || [];
  const champion   = finalRound.length > 0 && finalRound[0].winner
    ? _teams[finalRound[0].winner] : null;

  // Start building HTML
  let html = '<div class="bracket-wrap" id="bracket-wrap">';
  html += `<svg id="bracket-svg" xmlns="http://www.w3.org/2000/svg"></svg>`;

  for (let r = 1; r <= totalRounds; r++) {
    const rMatches  = rounds[r] || [];
    const numMatches = bracketSize / Math.pow(2, r);
    const slotH     = BRACKET_H / numMatches; // perfect mathematical slot height
    const isBO3     = rMatches.length > 0 && rMatches[0].format === 'BO3';
    const roundName = rMatches.length > 0 ? rMatches[0].roundName : `Round ${r}`;

    html += `
      <div class="round-col" id="round-col-${r}">
        <div class="round-header">
          <span class="round-label">${roundName}</span>
          <span class="round-format-tag ${isBO3 ? 'bo3' : 'bo1'}">${isBO3 ? 'BO3' : 'BO1'}</span>
        </div>
        <div class="round-matches" style="height:${BRACKET_H}px;" id="round-matches-${r}">`;

    for (const m of rMatches) {
      html += `<div class="match-slot" style="height:${slotH}px;">
                 ${renderMatchCard(m)}
               </div>`;
    }

    html += `</div></div>`;

    // Connector gap between round columns
    if (r < totalRounds) {
      html += `<div class="connector-gap" id="cgap-${r}" style="width:48px;height:${BRACKET_H}px;flex-shrink:0;"></div>`;
    }
  }

  // Champion card on far right
  if (champion) {
    html += `
      <div class="champion-wrap">
        <div class="champion-card">
          <div class="champion-label">🏆 Champion</div>
          <span class="champion-trophy">👑</span>
          <div class="champion-name">${esc(champion.name)}</div>
        </div>
      </div>`;
  }

  html += '</div>';

  const root = document.getElementById('bracket-root');
  root.innerHTML = html;

  // Draw lines after layout settles
  requestAnimationFrame(() => drawConnectors(rounds, totalRounds));
}

// ── Match Card ────────────────────────────────────────
function renderMatchCard(m) {
  // BYE Card handling
  if (m.isBye) {
    const winnerTeam = m.winner ? _teams[m.winner] : null;
    const name = winnerTeam ? esc(winnerTeam.name) : 'BYE';
    const seed = winnerTeam ? winnerTeam.seed : '';
    return `
      <div class="match-card bye-card" data-id="${m.id}">
        <div class="team-slot winner">
          <span class="team-seed">${seed}</span>
          <span class="team-name">${name}</span>
          <div class="team-score bye-tag">PASS</div>
        </div>
        <div class="tbd-slot" style="height:28px;font-size:0.7rem;color:var(--text-3);">BYE</div>
      </div>`;
  }

  const t1 = m.team1 ? _teams[m.team1] : null;
  const t2 = m.team2 ? _teams[m.team2] : null;

  let t1score = '', t2score = '';
  if (m.format === 'BO3' && m.games) {
    const r = calcBO3(m.games, m.team1, m.team2);
    t1score = r.t1wins.toString();
    t2score = r.t2wins.toString();
  } else if (m.format === 'BO1' && m.winner) {
    t1score = m.winner === m.team1 ? '1' : '0';
    t2score = m.winner === m.team2 ? '1' : '0';
  }

  const t1Win = !!(m.winner && m.winner === m.team1);
  const t2Win = !!(m.winner && m.winner === m.team2);
  const isDone = m.status === 'done';

  let cardCls = 'match-card';
  if (isDone)                  cardCls += ' done';
  else if (m.team1 || m.team2) cardCls += ' active';

  // Map dots (BO3)
  let mapDots = '';
  if (m.format === 'BO3') {
    mapDots = '<div class="map-scores">';
    for (let i = 1; i <= 3; i++) {
      const g = m.games ? m.games[`g${i}`] : null;
      let cls = 'pending', lbl = i;
      if (g === m.team1)      { cls = 'team1win'; lbl = '✓'; }
      else if (g === m.team2) { cls = 'team2win'; lbl = '✗'; }
      mapDots += `<div class="map-dot ${cls}">${lbl}</div>`;
    }
    mapDots += '</div>';
  }

  return `
    <div class="${cardCls}" data-id="${m.id}">
      ${teamRow(t1, m.team1, t1score, t1Win, t2Win && isDone)}
      ${teamRow(t2, m.team2, t2score, t2Win, t1Win && isDone)}
      <div class="match-foot">
        <span class="format-badge ${m.format.toLowerCase()}">${m.format}</span>
        ${mapDots}
      </div>
    </div>`;
}

function teamRow(team, teamId, score, isWin, isLose) {
  if (!teamId) return `<div class="tbd-slot">TBD</div>`;
  const name = team ? esc(team.name) : 'TBD';
  const seed = team ? team.seed : '';
  let cls = 'team-slot';
  if (isWin)  cls += ' winner';
  if (isLose) cls += ' loser';
  const scoreBadge = score !== ''
    ? `<div class="team-score">${score}</div>` : '';
  return `
    <div class="${cls}">
      <span class="team-seed">${seed}</span>
      <span class="team-name">${name}</span>
      ${scoreBadge}
    </div>`;
}

// ── SVG Connector Lines ───────────────────────────────
function drawConnectors(rounds, totalRounds) {
  const svg  = document.getElementById('bracket-svg');
  const wrap = document.getElementById('bracket-wrap');
  if (!svg || !wrap) return;

  const wW = wrap.offsetWidth;
  const wH = wrap.offsetHeight;

  svg.setAttribute('width',  wW);
  svg.setAttribute('height', wH);
  svg.setAttribute('viewBox', `0 0 ${wW} ${wH}`);
  svg.innerHTML = '';

  const wRect = wrap.getBoundingClientRect();

  // Helper to get card center relative to wrap
  const getCardCenter = (cardEl) => {
    const cRect = cardEl.getBoundingClientRect();
    return {
      left:    cRect.left - wRect.left,
      right:   cRect.right - wRect.left,
      centerY: (cRect.top + cRect.bottom) / 2 - wRect.top
    };
  };

  for (let r = 1; r < totalRounds; r++) {
    const curSlots  = document.querySelectorAll(`#round-matches-${r} .match-slot`);
    const nextSlots = document.querySelectorAll(`#round-matches-${r + 1} .match-slot`);

    nextSlots.forEach((nextSlot, ni) => {
      const nextCard = nextSlot.querySelector('.match-card');
      if (!nextCard) return;

      const src1Slot = curSlots[ni * 2];
      const src2Slot = curSlots[ni * 2 + 1];
      if (!src1Slot || !src2Slot) return;

      const src1Card = src1Slot.querySelector('.match-card');
      const src2Card = src2Slot.querySelector('.match-card');
      if (!src1Card || !src2Card) return;

      const p1 = getCardCenter(src1Card);
      const p2 = getCardCenter(src2Card);
      const pN = getCardCenter(nextCard);

      const x1   = p1.right;
      const y1   = p1.centerY;
      const x2   = p2.right;
      const y2   = p2.centerY;
      const xEnd = pN.left;
      const yEnd = pN.centerY;
      const midX = x1 + (xEnd - x1) * 0.5;

      // Line 1: Top match -> midX -> yEnd -> xEnd
      addPath(svg, `M ${x1} ${y1} H ${midX} V ${yEnd} H ${xEnd}`);
      // Line 2: Bottom match -> midX -> yEnd
      addPath(svg, `M ${x2} ${y2} H ${midX} V ${yEnd}`);
    });
  }
}

function addPath(svg, d) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('stroke', '#94A3B8'); // crisp slate border color
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke-linecap', 'square');
  svg.appendChild(p);
}

// ── Utility ──────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.addEventListener('resize', () => {
  if (!_meta.totalRounds || !Object.keys(_matches).length) return;
  const rounds = {};
  for (const id in _matches) {
    const m = _matches[id];
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  for (const r in rounds) rounds[r].sort((a, b) => a.position - b.position);
  drawConnectors(rounds, _meta.totalRounds);
});

document.addEventListener('DOMContentLoaded', initViewer);
