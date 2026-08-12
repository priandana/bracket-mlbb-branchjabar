// =====================================================
// BRACKET VIEWER — app.js
// Symmetrical layout, Zoom & Pan, Clean Animated Match Modal
// =====================================================

const SLOT_H = 110; // base slot height per match in Round 1 (px) — 110px ensures no vertical overlap

let _teams   = {};
let _matches = {};
let _meta    = {};
let _zoomLevel = 1.0;

// ── Init ─────────────────────────────────────────────
function initViewer() {
  setTimeout(hideLoadingSpinner, 4000);

  db.ref(`${ROOT}/settings`).on('value', snap => {
    const s = snap.val();
    if (!s) { showEmpty(); return; }
    const name = s.name || 'ML Tournament';
    document.getElementById('tournament-name').textContent = name;
    document.title = name + ' — Bracket';

    if (s.status === 'setup' || !s.totalRounds) {
      showEmpty();
      return;
    }

    _meta = { totalRounds: s.totalRounds, bracketSize: s.bracketSize };
    tryRender();
  });

  db.ref(`${ROOT}/teams`).on('value', snap => {
    _teams = snap.val() || {};
    tryRender();
  });

  db.ref(`${ROOT}/matches`).on('value', snap => {
    const newMatches = snap.val() || {};
    checkForWinnerSmashAnimations(newMatches);
    _matches = newMatches;
    tryRender();
  });

  setupZoomControls();
}

let _prevWinners = {};
let _isInitialWinnerLoad = true;

function checkForWinnerSmashAnimations(newMatches) {
  if (typeof CoinShatterEngine === 'undefined') return;

  if (_isInitialWinnerLoad) {
    for (const id in newMatches) {
      if (newMatches[id]) {
        _prevWinners[id] = newMatches[id].winner || null;
      }
    }
    _isInitialWinnerLoad = false;
    return;
  }

  for (const id in newMatches) {
    const m = newMatches[id];
    const prevW = _prevWinners[id];
    const currW = m ? m.winner : null;

    if (currW && currW !== prevW && m.status === 'done') {
      if (_activeViewerMatchId === id) {
        setTimeout(() => {
          openViewerMatchModal(id);
        }, 100);
      }
    }

    if (m) {
      _prevWinners[id] = m.winner || null;
    }
  }
}

function hideLoadingSpinner() {
  const loading = document.getElementById('loading-state');
  if (loading) loading.style.display = 'none';
}

function tryRender() {
  if (!_meta.totalRounds || !Object.keys(_matches).length) return;
  hideLoadingSpinner();
  renderBracket();
}

function showEmpty() {
  hideLoadingSpinner();
  document.getElementById('bracket-root').innerHTML = `
    <div class="empty-state">
      <span class="emoji">⚔️</span>
      <h2>Bracket Belum Tersedia</h2>
      <p>Administrator sedang mempersiapkan turnamen. Bracket akan muncul di sini setelah dibuat dari Panel Admin.</p>
    </div>`;
}

// ── Main Render ───────────────────────────────────────
function renderBracket() {
  const { totalRounds, bracketSize } = _meta;
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

  let html = '<div class="bracket-wrap" id="bracket-wrap">';
  html += `<svg id="bracket-svg" xmlns="http://www.w3.org/2000/svg"></svg>`;

  for (let r = 1; r <= totalRounds; r++) {
    const rMatches   = rounds[r] || [];
    const numMatches = bracketSize / Math.pow(2, r);
    const slotH      = BRACKET_H / numMatches;
    const isBO3      = rMatches.length > 0 && rMatches[0].format === 'BO3';
    const roundName  = rMatches.length > 0 ? rMatches[0].roundName : `Round ${r}`;

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
      html += `<div class="connector-gap" id="cgap-${r}" style="width:52px;height:${BRACKET_H}px;flex-shrink:0;"></div>`;
    }
  }

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
  root.innerHTML = html;

  applyZoom();
  attachCardClickHandlers();

  requestAnimationFrame(() => drawConnectors(rounds, totalRounds));
}

// ── Helper to detect dead unused bracket slots ────────
function isDeadSlot(m, matches) {
  if (!m) return true;
  if (m.team1 || m.team2) return false;
  if (m.round === 1) {
    return !m.team1 && !m.team2;
  }
  const prevRound = m.round - 1;
  const src1 = matches[`r${prevRound}_m${m.position * 2}`];
  const src2 = matches[`r${prevRound}_m${m.position * 2 + 1}`];
  return isDeadSlot(src1, matches) && isDeadSlot(src2, matches);
}

// ── Match Card HTML ───────────────────────────────────
function renderMatchCard(m) {
  // Hide dead dummy slots that will never receive teams
  if (isDeadSlot(m, _matches)) {
    return `<div class="bye-spacer"></div>`;
  }

  if (m.isBye) {
    const winnerTeam = m.winner ? _teams[m.winner] : null;
    const name = winnerTeam ? esc(winnerTeam.name) : 'BYE';
    const seed = winnerTeam ? winnerTeam.seed : '';
    return `
      <div class="match-card bye-card" data-match-id="${m.id}">
        <div class="team-slot winner">
          <span class="team-seed">${seed}</span>
          <span class="team-name">${name}</span>
          <div class="team-score bye-tag">PASS</div>
        </div>
        <div class="tbd-slot" style="height:26px;font-size:0.68rem;color:var(--text-4);">BYE</div>
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

  let cardCls = 'match-card clickable';
  if (isDone)                  cardCls += ' done';
  else if (m.team1 || m.team2) cardCls += ' active';

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
    <div class="${cardCls}" data-match-id="${m.id}">
      ${teamRow(t1, m.team1, t1score, t1Win, t2Win && isDone)}
      ${teamRow(t2, m.team2, t2score, t2Win, t1Win && isDone)}
      <div class="match-foot">
        <span class="format-badge ${m.format.toLowerCase()}">${m.format}</span>
        ${mapDots}
        <span class="click-hint">🔍 Lihat Detail</span>
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
  const avatarHtml = getTeamAvatarHTML(name);
  return `
    <div class="${cls}">
      <span class="team-seed">${seed}</span>
      ${avatarHtml}
      <span class="team-name">${name}</span>
      ${scoreBadge}
    </div>`;
}

function getTeamAvatarHTML(name) {
  if (!name || name === 'TBD' || name === 'BYE') return '';
  return `<div class="team-avatar">${getInitials(name)}</div>`;
}

function getInitials(name) {
  if (!name || name === 'TBD') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

// ── SVG Connectors (Untransformed Native Coordinates) ──
function drawConnectors(rounds, totalRounds) {
  const svg  = document.getElementById('bracket-svg');
  const wrap = document.getElementById('bracket-wrap');
  if (!svg || !wrap) return;

  const wW = wrap.scrollWidth  || wrap.offsetWidth;
  const wH = wrap.scrollHeight || wrap.offsetHeight;

  svg.setAttribute('width',  wW);
  svg.setAttribute('height', wH);
  svg.setAttribute('viewBox', `0 0 ${wW} ${wH}`);
  svg.innerHTML = '';

  const getCardCenter = (cardEl) => {
    let top = 0;
    let left = 0;
    let el = cardEl;
    while (el && el !== wrap) {
      top  += el.offsetTop;
      left += el.offsetLeft;
      el    = el.offsetParent;
    }
    return {
      left:    left,
      right:   left + cardEl.offsetWidth,
      centerY: top  + cardEl.offsetHeight / 2
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
      if (!src1Slot && !src2Slot) return;

      const src1Card = src1Slot ? src1Slot.querySelector('.match-card') : null;
      const src2Card = src2Slot ? src2Slot.querySelector('.match-card') : null;

      if (!src1Card && !src2Card) return;

      const pN   = getCardCenter(nextCard);
      const xEnd = pN.left;
      const yEnd = pN.centerY;

      if (src1Card && src2Card) {
        const p1   = getCardCenter(src1Card);
        const p2   = getCardCenter(src2Card);
        const midX = p1.right + (xEnd - p1.right) * 0.5;

        addPath(svg, `M ${p1.right} ${p1.centerY} H ${midX} V ${yEnd} H ${xEnd}`);
        addPath(svg, `M ${p2.right} ${p2.centerY} H ${midX} V ${yEnd}`);
      } else {
        const realCard = src1Card || src2Card;
        const p        = getCardCenter(realCard);
        const midX     = p.right + (xEnd - p.right) * 0.5;

        addPath(svg, `M ${p.right} ${p.centerY} H ${midX} V ${yEnd} H ${xEnd}`);
      }
    });
  }
}

function addPath(svg, d) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('stroke', '#FFFFFF');
  p.setAttribute('stroke-width', '1.8');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke-linecap', 'square');
  svg.appendChild(p);
}

// ── ZOOM CONTROLS ─────────────────────────────────────
function setupZoomControls() {
  document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
    if (_zoomLevel < 1.6) {
      _zoomLevel += 0.15;
      applyZoom();
    }
  });

  document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
    if (_zoomLevel > 0.75) {
      _zoomLevel -= 0.15;
      applyZoom();
    }
  });

  document.getElementById('zoom-reset-btn')?.addEventListener('click', () => {
    const wrap = document.getElementById('bracket-wrap');
    const outer = document.getElementById('bracket-outer');
    if (wrap && outer) {
      const availW = outer.clientWidth - 64;
      const wrapW  = wrap.scrollWidth || 900;
      const fitScale = Math.min(1.1, Math.max(0.8, availW / wrapW));
      _zoomLevel = Math.round(fitScale * 20) / 20;
    } else {
      _zoomLevel = 1.0;
    }
    applyZoom();
  });
}

function applyZoom() {
  const wrap = document.getElementById('bracket-wrap');
  const levelText = document.getElementById('zoom-level-text');
  if (wrap) {
    wrap.style.transform = `scale(${_zoomLevel})`;
    wrap.style.transformOrigin = 'top center';
  }
  if (levelText) {
    levelText.textContent = `${Math.round(_zoomLevel * 100)}%`;
  }
  if (_meta.totalRounds) {
    const rounds = {};
    for (const id in _matches) {
      const m = _matches[id];
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
    }
    drawConnectors(rounds, _meta.totalRounds);
  }
}

// ── CLEAN & ELEGANT MATCH DETAIL MODAL ────────────────
function attachCardClickHandlers() {
  document.querySelectorAll('.match-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const matchId = card.dataset.matchId;
      if (matchId) openViewerMatchModal(matchId);
    });
  });
}

function openViewerMatchModal(matchId) {
  const m = _matches[matchId];
  if (!m) return;

  const t1 = m.team1 ? (_teams[m.team1]?.name || 'TBD') : 'TBD';
  const t2 = m.team2 ? (_teams[m.team2]?.name || 'TBD') : 'TBD';
  const t1Seed = m.team1 ? (_teams[m.team1]?.seed || '') : '';
  const t2Seed = m.team2 ? (_teams[m.team2]?.seed || '') : '';

  const isDone = m.status === 'done';
  const t1Win  = isDone && m.winner === m.team1;
  const t2Win  = isDone && m.winner === m.team2;

  document.getElementById('vm-title').textContent = m.roundName;
  document.getElementById('vm-format').textContent = m.format;

  const body = document.getElementById('vm-body');

  let statusBadge = '<span class="status-pill pending">🟢 DALAM PROSES / MENUNGGU</span>';
  if (isDone) statusBadge = '<span class="status-pill done">🏆 PERTANDINGAN SELESAI</span>';

  let scoresContent = '';
  if (m.format === 'BO3' && m.games) {
    const { t1wins, t2wins, winner } = calcBO3(m.games, m.team1, m.team2);
    scoresContent = `
      <div class="score-tally">
        <div class="tally-team ${winner === m.team1 ? 'win-text' : ''}">${esc(t1)} ${winner === m.team1 ? '👑' : ''}</div>
        <div class="tally-score">${t1wins} - ${t2wins}</div>
        <div class="tally-team ${winner === m.team2 ? 'win-text' : ''}">${winner === m.team2 ? '👑' : ''} ${esc(t2)}</div>
      </div>
      <div class="bo3-map-summary">
        <div class="map-sum-row"><span>Map 1:</span> <strong>${getGameWinnerName(m.games.g1, m)}</strong></div>
        <div class="map-sum-row"><span>Map 2:</span> <strong>${getGameWinnerName(m.games.g2, m)}</strong></div>
        <div class="map-sum-row"><span>Map 3:</span> <strong>${getGameWinnerName(m.games.g3, m)}</strong></div>
      </div>`;
  } else {
    scoresContent = `
      <div class="score-tally">
        <div class="tally-team ${t1Win ? 'win-text' : ''}">${esc(t1)} ${t1Win ? '👑' : ''}</div>
        <div class="tally-score">${t1Win ? '1' : t2Win ? '0' : '0'} - ${t2Win ? '1' : t1Win ? '0' : '0'}</div>
        <div class="tally-team ${t2Win ? 'win-text' : ''}">${t2Win ? '👑' : ''} ${esc(t2)}</div>
      </div>`;
  }

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:16px">${statusBadge}</div>

    <div class="arena-stage">
      <div class="arena-card ${t1Win ? 'winner' : t2Win ? 'defeated' : ''}">
        ${t1Win ? '<div class="confetti-particles">✨ 🏆 ✨</div>' : ''}
        <div class="arena-emblem">${getInitials(t1)}</div>
        <span class="arena-seed">#${t1Seed}</span>
        <div class="arena-name">${esc(t1)}</div>
        ${t1Win ? '<div class="esports-victory-ribbon">🏆 WINNER</div>' : ''}
      </div>

      <div class="arena-vs-shield">
        <span>VS</span>
      </div>

      <div class="arena-card ${t2Win ? 'winner' : t1Win ? 'defeated' : ''}">
        ${t2Win ? '<div class="confetti-particles">✨ 🏆 ✨</div>' : ''}
        <div class="arena-emblem">${getInitials(t2)}</div>
        <span class="arena-seed">#${t2Seed}</span>
        <div class="arena-name">${esc(t2)}</div>
        ${t2Win ? '<div class="esports-victory-ribbon">🏆 WINNER</div>' : ''}
      </div>
    </div>

    ${scoresContent}

    ${(localStorage.getItem('mlbb_admin_active') === 'true' && m.team1 && m.team2 && !m.isBye) ? `
      <div class="admin-modal-controls">
        <div class="admin-controls-title">👑 PANEL ADMIN: TENTUKAN PEMENANG</div>
        <div class="admin-controls-btns">
          <button class="admin-pick-btn t1-btn ${t1Win ? 'active-win' : ''}" onclick="quickAdminPickWinner('${m.id}', '${m.team1}')">
            🏆 Menangkan ${esc(t1)}
          </button>
          <button class="admin-pick-btn t2-btn ${t2Win ? 'active-win' : ''}" onclick="quickAdminPickWinner('${m.id}', '${m.team2}')">
            🏆 Menangkan ${esc(t2)}
          </button>
        </div>
        ${isDone ? `
          <div style="margin-top:10px;">
            <button class="admin-reset-btn" onclick="quickAdminResetMatch('${m.id}')">
              🔄 Reset / Batalkan Pemenang Match Ini
            </button>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div style="text-align:center;margin-top:16px;">
      <button id="modal-demo-smash-btn" class="modal-smash-btn">💥 Tes Animasi Smash</button>
    </div>
  `;

  document.getElementById('viewer-match-modal').classList.add('show');
  _activeViewerMatchId = matchId;

  const triggerModalSmash = () => {
    const arenaStage = body.querySelector('.arena-stage');
    const cards = body.querySelectorAll('.arena-card');
    if (cards.length >= 2) {
      const winnerCard = t2Win ? cards[1] : cards[0];
      const loserCard  = t2Win ? cards[0] : cards[1];
      const winnerName = t2Win ? t2 : t1;
      
      const winnerEmblem = winnerCard.querySelector('.arena-emblem');
      const loserEmblem  = loserCard.querySelector('.arena-emblem');
      
      if (winnerEmblem && loserEmblem && typeof CoinShatterEngine !== 'undefined') {
        CoinShatterEngine.triggerSmash(arenaStage, winnerEmblem, loserEmblem, winnerName);
      }
    }
  };

  document.getElementById('modal-demo-smash-btn')?.addEventListener('click', triggerModalSmash);

  if (isDone && (t1Win || t2Win) && typeof CoinShatterEngine !== 'undefined') {
    setTimeout(triggerModalSmash, 300);
  }
}

async function quickAdminPickWinner(matchId, winnerTeamId) {
  const m = _matches[matchId];
  if (!m || !winnerTeamId) return;

  const updates = {};
  updates[`${ROOT}/matches/${m.id}/winner`] = winnerTeamId;
  updates[`${ROOT}/matches/${m.id}/status`] = 'done';

  const totalRounds = _meta.totalRounds || 4;
  const next = getNextMatchInfo(m.round, m.position, totalRounds);
  if (next) {
    updates[`${ROOT}/matches/${next.matchId}/${next.slot}`] = winnerTeamId;
  } else {
    updates[`${ROOT}/settings/status`] = 'done';
  }

  try {
    await db.ref().update(updates);
    setTimeout(() => {
      openViewerMatchModal(matchId);
    }, 150);
  } catch (err) {
    alert('Gagal menyimpan hasil admin: ' + err.message);
  }
}

async function quickAdminResetMatch(matchId) {
  const m = _matches[matchId];
  if (!m) return;
  if (!confirm(`Batalkan hasil pertandingan ${m.roundName}?`)) return;

  const updates = {};
  updates[`${ROOT}/matches/${m.id}/winner`] = null;
  updates[`${ROOT}/matches/${m.id}/status`] = 'pending';

  const totalRounds = _meta.totalRounds || 4;
  const next = getNextMatchInfo(m.round, m.position, totalRounds);
  if (next) {
    updates[`${ROOT}/matches/${next.matchId}/${next.slot}`] = null;
    updates[`${ROOT}/matches/${next.matchId}/winner`] = null;
    updates[`${ROOT}/matches/${next.matchId}/status`] = 'pending';
  }

  try {
    await db.ref().update(updates);
    setTimeout(() => {
      openViewerMatchModal(matchId);
    }, 150);
  } catch (err) {
    alert('Gagal mereset hasil: ' + err.message);
  }
}

let _activeViewerMatchId = null;

function getGameWinnerName(gameWinnerId, matchObj) {
  if (!gameWinnerId) return '<span style="color:var(--text-4)">Belum Dimainkan</span>';
  if (gameWinnerId === matchObj.team1) return `<span style="color:var(--green);font-weight:700">${esc(_teams[matchObj.team1]?.name)}</span>`;
  if (gameWinnerId === matchObj.team2) return `<span style="color:var(--green);font-weight:700">${esc(_teams[matchObj.team2]?.name)}</span>`;
  return 'Belum Dimainkan';
}

function closeViewerMatchModal() {
  document.getElementById('viewer-match-modal')?.classList.remove('show');
  _activeViewerMatchId = null;
}
document.getElementById('vm-close-btn')?.addEventListener('click', closeViewerMatchModal);
document.getElementById('viewer-match-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeViewerMatchModal();
});

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
