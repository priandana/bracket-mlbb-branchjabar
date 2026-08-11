// =====================================================
// BRACKET VIEWER — app.js  (Challonge-style layout)
// =====================================================

const SLOT_H  = 90;   // px per bracket slot (base unit)
const CARD_H  = 102;  // estimated match card height for vertical centering

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
      <p>Administrator sedang mempersiapkan turnamen. Bracket akan muncul setelah dibuat.</p>
      <a href="admin.html" class="btn btn-primary">Buka Panel Admin</a>
    </div>`;
}

// ── Main Render ───────────────────────────────────────
function renderBracket() {
  const { totalRounds, bracketSize } = _meta;

  // ── Correct bracket height: (bracketSize/2) * SLOT_H ──
  // e.g. 16-bracket: (16/2)*90 = 720px
  // This ensures all rounds share the same total height.
  const BRACKET_H = (bracketSize / 2) * SLOT_H;

  // Group & sort matches by round
  const rounds = {};
  for (const id in _matches) {
    const m = _matches[id];
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  for (const r in rounds) rounds[r].sort((a, b) => a.position - b.position);

  // ── Detect "preliminary" round ──
  // Round 1 may have many byes. If so, we show it as a compact
  // "preliminary" column where real matches are absolutely-positioned
  // to align with their QF counterparts (Challonge style).
  const r1Matches  = rounds[1] || [];
  const r1Real     = r1Matches.filter(m => !m.isBye);
  const hasPrelim  = r1Real.length > 0 && r1Real.length < r1Matches.length;
  const mainStart  = hasPrelim ? 2 : 1;

  // QF slot height (first main round)
  const numQFMatches = bracketSize / Math.pow(2, mainStart);
  const qfSlotH      = BRACKET_H / numQFMatches; // e.g. 720/4 = 180px

  // Champion
  const finalRound = rounds[totalRounds] || [];
  const champion   = finalRound.length > 0 && finalRound[0].winner
    ? _teams[finalRound[0].winner] : null;

  let html = '<div class="bracket-wrap" id="bracket-wrap">';

  // ── PRELIMINARY COLUMN (if needed) ────────────────
  if (hasPrelim) {
    html += `
      <div class="prelim-col" id="prelim-col"
           style="position:relative;width:200px;height:${BRACKET_H}px;flex-shrink:0;">`;

    for (const m of r1Real) {
      // The next round (QF) match position this preliminary match feeds into
      const nextPos = Math.floor(m.position / 2);
      const centerY = nextPos * qfSlotH + qfSlotH / 2;
      const topY    = Math.max(0, centerY - CARD_H / 2);

      html += `
        <div class="prelim-slot" data-match-id="${m.id}"
             style="position:absolute;top:${topY}px;left:0;width:200px;">
          ${renderMatchCard(m)}
        </div>`;
    }

    html += `</div>`;
    // Small gap between prelim and QF
    html += `<div class="connector-gap" id="prelim-gap"
               style="width:48px;height:${BRACKET_H}px;flex-shrink:0;"></div>`;
  }

  // ── MAIN ROUNDS ───────────────────────────────────
  for (let r = mainStart; r <= totalRounds; r++) {
    const rMatches  = rounds[r] || [];
    const slotH     = SLOT_H * Math.pow(2, r - 1); // slot height doubles each round
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

    if (r < totalRounds) {
      html += `<div class="connector-gap" id="cgap-${r}"
                 style="width:48px;height:${BRACKET_H + 60}px;flex-shrink:0;"></div>`;
    }
  }

  // ── CHAMPION ──────────────────────────────────────
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
  root.innerHTML = `<svg id="bracket-svg" xmlns="http://www.w3.org/2000/svg"></svg>` + html;

  requestAnimationFrame(() =>
    drawConnectors(rounds, mainStart, totalRounds, BRACKET_H, qfSlotH, r1Real, hasPrelim)
  );
}

// ── Match Card HTML ───────────────────────────────────
function renderMatchCard(m) {
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
  if (isDone)                      cardCls += ' done';
  else if (m.team1 && m.team2)     cardCls += ' active';

  // Map dots (BO3 only)
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
function drawConnectors(rounds, mainStart, totalRounds, BRACKET_H, qfSlotH, r1Real, hasPrelim) {
  const svg  = document.getElementById('bracket-svg');
  const wrap = document.getElementById('bracket-wrap');
  if (!svg || !wrap) return;

  const W = wrap.scrollWidth;
  const H = wrap.scrollHeight;
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.innerHTML = '';

  const wRect  = wrap.getBoundingClientRect();
  const offX   = wRect.left + window.scrollX;
  const offY   = wRect.top  + window.scrollY;

  // ── 1. Preliminary → QF connectors ───────────────
  if (hasPrelim) {
    const qfMatchesEl = document.querySelectorAll(`#round-matches-${mainStart} .match-slot`);

    document.querySelectorAll('.prelim-slot').forEach(ps => {
      const card = ps.querySelector('.match-card');
      if (!card) return;
      const matchId = ps.dataset.matchId;
      const m       = _matches[matchId];
      if (!m) return;

      const nextPos  = Math.floor(m.position / 2);
      const qfSlot   = qfMatchesEl[nextPos];
      if (!qfSlot) return;
      const qfCard   = qfSlot.querySelector('.match-card');
      if (!qfCard) return;

      const rC  = card.getBoundingClientRect();
      const rQF = qfCard.getBoundingClientRect();

      const x1   = rC.right   - offX;
      const y1   = (rC.top + rC.bottom) / 2 - offY;
      const xEnd = rQF.left   - offX;
      const yEnd = (rQF.top + rQF.bottom) / 2 - offY;
      const midX = x1 + (xEnd - x1) * 0.55;

      addPath(svg, `M ${x1} ${y1} H ${midX} V ${yEnd} H ${xEnd}`);
    });
  }

  // ── 2. Main round → next round connectors ─────────
  for (let r = mainStart; r < totalRounds; r++) {
    const curSlots  = document.querySelectorAll(`#round-matches-${r} .match-slot`);
    const nextSlots = document.querySelectorAll(`#round-matches-${r + 1} .match-slot`);

    nextSlots.forEach((nextSlot, ni) => {
      const nextCard = nextSlot.querySelector('.match-card');
      if (!nextCard) return;

      const src1 = curSlots[ni * 2];
      const src2 = curSlots[ni * 2 + 1];
      if (!src1 || !src2) return;

      const getCenter = (slot) => {
        const card = slot.querySelector('.match-card');
        const el   = card || slot;
        const r    = el.getBoundingClientRect();
        return {
          x: r.right - offX,
          y: (r.top + r.bottom) / 2 - offY
        };
      };

      const p1   = getCenter(src1);
      const p2   = getCenter(src2);
      const rN   = nextCard.getBoundingClientRect();
      const xEnd = rN.left - offX;
      const yEnd = (rN.top + rN.bottom) / 2 - offY;
      const midX = p1.x + (xEnd - p1.x) * 0.5;

      addPath(svg, `M ${p1.x} ${p1.y} H ${midX} V ${yEnd} H ${xEnd}`);
      addPath(svg, `M ${p2.x} ${p2.y} H ${midX}`);
    });
  }
}

function addPath(svg, d) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('stroke', '#CBD5E1');
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
  tryRender();
});

document.addEventListener('DOMContentLoaded', initViewer);
