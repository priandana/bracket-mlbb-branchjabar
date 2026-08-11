// =====================================================
// BRACKET VIEWER — app.js (Challonge-style clean render)
// =====================================================

const SLOT_H = 90; // px per bracket slot

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

  db.ref(`${ROOT}/teams`).on('value', snap => {
    _teams = snap.val() || {};
    tryRender();
  });

  db.ref(`${ROOT}/matches`).on('value', snap => {
    _matches = snap.val() || {};
    tryRender();
  });
}

function tryRender() {
  if (!_meta.totalRounds || Object.keys(_matches).length === 0) return;
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

  // Group matches by round & sort by position
  const rounds = {};
  for (const id in _matches) {
    const m = _matches[id];
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  for (const r in rounds) rounds[r].sort((a, b) => a.position - b.position);

  // Find which rounds have at least one real (non-bye) match
  // Skip rounds that are ALL byes (e.g. a full bye-only Round 1)
  const visibleRounds = [];
  for (let r = 1; r <= totalRounds; r++) {
    const rMatches = rounds[r] || [];
    const hasReal  = rMatches.some(m => !m.isBye);
    if (hasReal || r > 1) visibleRounds.push(r);
  }

  // Total bracket height (based on full bracketSize for alignment)
  const bracketH = bracketSize * SLOT_H;

  // Check champion
  const finalRound = rounds[totalRounds] || [];
  const champion   = finalRound.length > 0 && finalRound[0].winner
    ? _teams[finalRound[0].winner] : null;

  let html = '<div class="bracket-wrap" id="bracket-wrap">';

  visibleRounds.forEach((r, idx) => {
    const rMatches   = rounds[r] || [];
    const isBO3      = rMatches.length > 0 && rMatches[0].format === 'BO3';
    const roundName  = rMatches.length > 0 ? rMatches[0].roundName : `Round ${r}`;
    const slotH      = SLOT_H * Math.pow(2, r - 1);

    html += `
      <div class="round-col" id="round-col-${r}">
        <div class="round-header">
          <span class="round-label">${roundName}</span>
          <span class="round-format-tag ${isBO3 ? 'bo3' : 'bo1'}">${isBO3 ? 'BO3' : 'BO1'}</span>
        </div>
        <div class="round-matches" style="height:${bracketH}px;" id="round-matches-${r}">`;

    for (const match of rMatches) {
      if (match.isBye) {
        // Render as invisible spacer to maintain alignment
        html += `<div class="match-slot" style="height:${slotH}px;">
                   <div class="bye-spacer" style="height:${slotH}px;"></div>
                 </div>`;
      } else {
        html += `<div class="match-slot" style="height:${slotH}px;">
                   ${renderMatchCard(match)}
                 </div>`;
      }
    }

    html += `</div></div>`;

    // Connector gap spacer
    if (idx < visibleRounds.length - 1) {
      html += `<div class="connector-gap" id="cgap-${r}" style="height:${bracketH + 60}px;"></div>`;
    }
  });

  // Champion card
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

  requestAnimationFrame(() => drawConnectors(rounds, visibleRounds, bracketSize));
}

// ── Match Card ────────────────────────────────────────
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

  const t1Win = m.winner && m.winner === m.team1;
  const t2Win = m.winner && m.winner === m.team2;
  const isDone = m.status === 'done';

  let cardCls = 'match-card';
  if (isDone) cardCls += ' done';
  else if (m.team1 && m.team2) cardCls += ' active';

  // Map dots (BO3)
  let mapDots = '';
  if (m.format === 'BO3') {
    mapDots = '<div class="map-scores">';
    for (let i = 1; i <= 3; i++) {
      const g = m.games ? m.games[`g${i}`] : null;
      let cls = 'pending', lbl = i;
      if (g === m.team1) { cls = 'team1win'; lbl = '✓'; }
      else if (g === m.team2) { cls = 'team2win'; lbl = '✗'; }
      mapDots += `<div class="map-dot ${cls}">${lbl}</div>`;
    }
    mapDots += '</div>';
  }

  return `
    <div class="${cardCls}" data-id="${m.id}">
      ${renderTeamSlot(t1, m.team1, t1score, t1Win, t2Win && isDone)}
      ${renderTeamSlot(t2, m.team2, t2score, t2Win, t1Win && isDone)}
      <div class="match-foot">
        <span class="format-badge ${m.format.toLowerCase()}">${m.format}</span>
        ${mapDots}
      </div>
    </div>`;
}

function renderTeamSlot(team, teamId, score, isWin, isLose) {
  if (!teamId) return `<div class="tbd-slot">TBD</div>`;
  const name = team ? esc(team.name) : 'TBD';
  const seed = team ? team.seed : '';
  let cls = 'team-slot';
  if (isWin)  cls += ' winner';
  if (isLose) cls += ' loser';
  const scoreHtml = score !== '' ? `<div class="team-score">${score}</div>` : '';
  return `
    <div class="${cls}">
      <span class="team-seed">${seed}</span>
      <span class="team-name">${name}</span>
      ${scoreHtml}
    </div>`;
}

// ── SVG Connectors ────────────────────────────────────
function drawConnectors(rounds, visibleRounds, bracketSize) {
  const svg  = document.getElementById('bracket-svg');
  const wrap = document.getElementById('bracket-wrap');
  if (!svg || !wrap) return;

  svg.setAttribute('width',  wrap.offsetWidth);
  svg.setAttribute('height', wrap.scrollHeight + 60);
  svg.innerHTML = '';

  const wRect = wrap.getBoundingClientRect();
  const scrollY = window.scrollY || 0;
  const scrollX = window.scrollX || 0;

  for (let vi = 0; vi < visibleRounds.length - 1; vi++) {
    const r     = visibleRounds[vi];
    const rNext = visibleRounds[vi + 1];

    const curSlots  = document.querySelectorAll(`#round-matches-${r} .match-slot`);
    const nextSlots = document.querySelectorAll(`#round-matches-${rNext} .match-slot`);

    // For each next slot, find its two source slots
    nextSlots.forEach((nextSlot, ni) => {
      const nextCard = nextSlot.querySelector('.match-card');
      if (!nextCard) return;

      const src1 = curSlots[ni * 2];
      const src2 = curSlots[ni * 2 + 1];
      if (!src1 || !src2) return;

      // Get center-right of source cards (or slot midpoint for byes)
      const getPoint = (slot) => {
        const card = slot.querySelector('.match-card');
        const r = (card || slot).getBoundingClientRect();
        return {
          x: r.right  - wRect.left + scrollX,
          y: (r.top + r.bottom) / 2 - wRect.top + scrollY
        };
      };

      const p1   = getPoint(src1);
      const p2   = getPoint(src2);
      const nR   = nextCard.getBoundingClientRect();
      const xEnd = nR.left  - wRect.left + scrollX;
      const yEnd = (nR.top + nR.bottom) / 2 - wRect.top + scrollY;
      const midX = p1.x + (xEnd - p1.x) * 0.5;

      // Check if source is a real match or bye spacer
      const src1Real = !!src1.querySelector('.match-card');
      const src2Real = !!src2.querySelector('.match-card');

      // Draw line from src1 → mid → yEnd → xEnd
      if (src1Real) {
        addPath(svg, `M ${p1.x} ${p1.y} H ${midX} V ${yEnd} H ${xEnd}`);
      }
      // Draw line from src2 → midX (shared vertical)
      if (src2Real) {
        addPath(svg, `M ${p2.x} ${p2.y} H ${midX}`);
      }
      // If one side is bye but other isn't, still draw the vertical+right portion
      if (!src1Real && src2Real) {
        addPath(svg, `M ${midX} ${yEnd} H ${xEnd}`);
      } else if (src1Real && !src2Real) {
        // already drawn above
      }
    });
  }
}

function addPath(svg, d) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('stroke', '#CBD5E1');
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(p);
}

// ── Utility ──────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.addEventListener('resize', () => {
  if (!_meta.totalRounds || !Object.keys(_matches).length) return;
  const rounds = {};
  for (const id in _matches) {
    const m = _matches[id];
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  const visibleRounds = [];
  for (let r = 1; r <= _meta.totalRounds; r++) {
    const rMatches = rounds[r] || [];
    const hasReal  = rMatches.some(m => !m.isBye);
    if (hasReal || r > 1) visibleRounds.push(r);
  }
  drawConnectors(rounds, visibleRounds, _meta.bracketSize);
});

document.addEventListener('DOMContentLoaded', initViewer);
