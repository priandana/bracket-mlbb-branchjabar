// =====================================================
// BRACKET VIEWER — app.js
// Real-time bracket display using Firebase
// =====================================================

const SLOT_H = 90; // px per bracket slot (card height + gap)

let _teams   = {};
let _matches = {};
let _meta    = {};
let _renderedOnce = false;

// ── Init ────────────────────────────────────────────
function initViewer() {
  // Listen: settings
  db.ref(`${ROOT}/settings`).on('value', snap => {
    const s = snap.val();
    if (!s) { showEmpty(); return; }

    document.getElementById('tournament-name').textContent = s.name || 'ML Tournament';
    document.title = (s.name || 'ML Bracket') + ' — Bracket';

    if (s.status === 'setup' || !s.totalRounds) {
      showEmpty();
      return;
    }

    _meta = {
      totalRounds: s.totalRounds,
      bracketSize: s.bracketSize
    };
    tryRender();
  });

  // Listen: teams
  db.ref(`${ROOT}/teams`).on('value', snap => {
    _teams = snap.val() || {};
    tryRender();
  });

  // Listen: matches
  db.ref(`${ROOT}/matches`).on('value', snap => {
    _matches = snap.val() || {};
    tryRender();
  });
}

function tryRender() {
  if (!_meta.totalRounds) return;
  if (Object.keys(_matches).length === 0) return;
  renderBracket();
}

// ── Empty / Setup state ─────────────────────────────
function showEmpty() {
  document.getElementById('bracket-root').innerHTML = `
    <div class="empty-state">
      <span class="emoji">⚔️</span>
      <h2>Bracket Belum Dibuat</h2>
      <p>Administrator sedang mempersiapkan turnamen.<br>Nantikan bracket segera!</p>
      <a href="admin.html" class="btn btn-primary">Panel Admin</a>
    </div>`;
}

// ── Main Render ─────────────────────────────────────
function renderBracket() {
  const { totalRounds, bracketSize } = _meta;
  const bracketH = bracketSize * SLOT_H;

  // Group & sort matches by round
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

  let html = '<div class="bracket-wrap" id="bracket-wrap">';

  for (let r = 1; r <= totalRounds; r++) {
    const rMatches    = (rounds[r] || []);
    const isBO3Round  = rMatches.length > 0 && rMatches[0].format === 'BO3';
    const roundName   = rMatches.length > 0 ? rMatches[0].roundName : `Round ${r}`;
    const slotH       = SLOT_H * Math.pow(2, r - 1);

    html += `
      <div class="round-col" id="round-${r}">
        <div class="round-header">
          <div class="round-name-badge ${isBO3Round ? 'bo3' : ''}">
            <span class="dot"></span>${roundName}${isBO3Round ? ' · BO3' : ''}
          </div>
        </div>
        <div class="round-matches" style="height:${bracketH}px;">
    `;

    for (const match of rMatches) {
      html += `
        <div class="match-slot" style="height:${slotH}px;">
          ${renderMatchCard(match)}
        </div>`;
    }

    html += `</div></div>`;

    // Spacer gap between rounds
    if (r < totalRounds) {
      html += `<div class="connector-gap" style="height:${bracketH + 60}px;"></div>`;
    }
  }

  // Champion
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

  html += '</div>'; // close bracket-wrap

  const root = document.getElementById('bracket-root');
  root.innerHTML = `<svg id="bracket-svg" xmlns="http://www.w3.org/2000/svg"></svg>` + html;

  // Draw SVG connectors after DOM paint
  requestAnimationFrame(() => drawConnectors(rounds, totalRounds, bracketSize));
}

// ── Match Card HTML ─────────────────────────────────
function renderMatchCard(m) {
  const t1 = m.team1 ? _teams[m.team1] : null;
  const t2 = m.team2 ? _teams[m.team2] : null;

  // Compute scores
  let t1score = '', t2score = '';
  if (m.format === 'BO3' && m.games) {
    const r = calcBO3(m.games, m.team1, m.team2);
    t1score = r.t1wins.toString();
    t2score = r.t2wins.toString();
  } else if (m.format === 'BO1' && m.winner) {
    t1score = m.winner === m.team1 ? '1' : '0';
    t2score = m.winner === m.team2 ? '1' : '0';
  }

  const t1Win = m.winner === m.team1;
  const t2Win = m.winner === m.team2;
  const isDone = m.status === 'done';
  const isActive = m.status === 'pending' && (m.team1 || m.team2);

  let cardClass = 'match-card';
  if (m.isBye)     cardClass += ' bye-card';
  else if (isDone) cardClass += ' done';
  else if (isActive) cardClass += ' active';

  // Map dots for BO3
  let mapDots = '';
  if (m.format === 'BO3') {
    mapDots = `<div class="map-scores">`;
    for (let i = 1; i <= 3; i++) {
      const g = m.games ? m.games[`g${i}`] : null;
      let cls = 'pending', label = i.toString();
      if (g === m.team1) { cls = 'team1win'; label = 'W'; }
      else if (g === m.team2) { cls = 'team2win'; label = 'L'; }
      mapDots += `<div class="map-dot ${cls}">${label}</div>`;
    }
    mapDots += `</div>`;
  }

  const slot1 = renderTeamSlot(t1, m.team1, t1score, t1Win, t2Win && isDone);
  const slot2 = renderTeamSlot(t2, m.team2, t2score, t2Win, t1Win && isDone);

  return `
    <div class="${cardClass}" data-id="${m.id}">
      ${slot1}
      ${slot2}
      ${mapDots}
      <div class="match-foot">
        <span class="format-badge ${m.format.toLowerCase()}">${m.format}</span>
        ${m.isBye ? '<span class="bye-badge">BYE</span>' : ''}
      </div>
    </div>`;
}

function renderTeamSlot(team, teamId, score, isWin, isLose) {
  if (!teamId) {
    return `<div class="tbd-slot">TBD</div>`;
  }
  const name = team ? esc(team.name) : 'TBD';
  const seed = team ? team.seed : '';
  let cls = 'team-slot';
  if (isWin)  cls += ' winner';
  if (isLose) cls += ' loser';

  return `
    <div class="${cls}">
      <span class="team-seed">${seed}</span>
      <span class="team-name">${name}</span>
      ${isWin ? '<span class="win-crown">👑</span>' : ''}
      <span class="team-score">${score}</span>
    </div>`;
}

// ── SVG Connector Lines ─────────────────────────────
function drawConnectors(rounds, totalRounds, bracketSize) {
  const svg   = document.getElementById('bracket-svg');
  const wrap  = document.getElementById('bracket-wrap');
  if (!svg || !wrap) return;

  const wRect = wrap.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${wrap.offsetWidth} ${wrap.offsetHeight}`);
  svg.setAttribute('width',  wrap.offsetWidth);
  svg.setAttribute('height', wrap.offsetHeight);
  svg.innerHTML = '';

  // Gradient def
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'lineGrad');
  grad.setAttribute('x1','0%'); grad.setAttribute('y1','0%');
  grad.setAttribute('x2','100%'); grad.setAttribute('y2','0%');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','#C9A227'); s1.setAttribute('stop-opacity','0.6');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','#C9A227'); s2.setAttribute('stop-opacity','0.25');
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad);
  svg.appendChild(defs);

  for (let r = 1; r < totalRounds; r++) {
    const curRoundEl  = document.getElementById(`round-${r}`);
    const nextRoundEl = document.getElementById(`round-${r + 1}`);
    if (!curRoundEl || !nextRoundEl) continue;

    const curCards  = curRoundEl.querySelectorAll('.match-card:not(.bye-card)');
    const nextCards = nextRoundEl.querySelectorAll('.match-card');

    // Pair up: every 2 cur cards → 1 next card
    // But we need to account for bye cards too (they exist in DOM as slots)
    const allCurSlots  = curRoundEl.querySelectorAll('.match-slot');
    const allNextSlots = nextRoundEl.querySelectorAll('.match-slot');

    for (let ni = 0; ni < allNextSlots.length; ni++) {
      const nextSlot = allNextSlots[ni];
      const nextCard = nextSlot.querySelector('.match-card');
      if (!nextCard) continue;

      const srcSlot1 = allCurSlots[ni * 2];
      const srcSlot2 = allCurSlots[ni * 2 + 1];
      if (!srcSlot1 || !srcSlot2) continue;

      const card1 = srcSlot1.querySelector('.match-card');
      const card2 = srcSlot2.querySelector('.match-card');
      if (!card1 || !card2) continue;

      const r1 = card1.getBoundingClientRect();
      const r2 = card2.getBoundingClientRect();
      const rN = nextCard.getBoundingClientRect();

      const ox = wRect.left + window.scrollX;
      const oy = wRect.top  + window.scrollY;

      const x1   = r1.right  - ox;
      const y1   = (r1.top + r1.bottom) / 2 - oy;
      const x2   = r2.right  - ox;
      const y2   = (r2.top + r2.bottom) / 2 - oy;
      const xEnd = rN.left   - ox;
      const yEnd = (rN.top + rN.bottom) / 2 - oy;
      const midX = x1 + (xEnd - x1) * 0.5;

      // Line from card1 right → midX → yEnd → xEnd
      drawPath(svg, `M ${x1} ${y1} H ${midX} V ${yEnd} H ${xEnd}`);
      // Line from card2 right → midX
      drawPath(svg, `M ${x2} ${y2} H ${midX}`);
    }
  }
}

function drawPath(svg, d) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('stroke', 'url(#lineGrad)');
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke-linecap', 'round');
  svg.appendChild(p);
}

// ── Utility ─────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// Re-draw connectors on resize
window.addEventListener('resize', () => {
  if (!_meta.totalRounds || Object.keys(_matches).length === 0) return;
  const rounds = {};
  for (const id in _matches) {
    const m = _matches[id];
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  for (const r in rounds) rounds[r].sort((a,b) => a.position - b.position);
  drawConnectors(rounds, _meta.totalRounds, _meta.bracketSize);
});

// ── Start ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initViewer);
