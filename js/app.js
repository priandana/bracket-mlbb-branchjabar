// =====================================================
// BRACKET VIEWER — app.js
// Symmetrical layout, Zoom & Pan, Clean Animated Match Modal
// =====================================================

const SLOT_H = 110; // base slot height per match in Round 1 (px) — 110px ensures no vertical overlap

let _teams   = {};
let _matches = {};
let _meta    = {};
let _zoomLevel = 1.0;
let _teamsLoaded   = false;
let _matchesLoaded = false;
let _settingsLoaded = false;

// ── Live Toast Notification ───────────────────────────
function showLiveToast(msg, type = 'info', duration = 5000) {
  const container = document.getElementById('live-toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `live-toast live-toast--${type}`;
  toast.innerHTML = `<span class="live-toast-msg">${msg}</span><button class="live-toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ── Countdown Timer Ticker ────────────────────────────
let _countdownInterval = null;
function startCountdownTicker() {
  if (_countdownInterval) return;
  _countdownInterval = setInterval(() => {
    document.querySelectorAll('.match-countdown[data-start]').forEach(el => {
      const startTs = parseInt(el.dataset.start, 10);
      const now = Date.now();
      const diff = startTs - now;
      if (diff <= 0) {
        el.textContent = '🔴 SEDANG BERLANGSUNG';
        el.classList.add('live-now');
        el.removeAttribute('data-start');
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        el.textContent = h > 0
          ? `⏱ Mulai dalam ${h}j ${String(m).padStart(2,'0')}m`
          : `⏱ Mulai dalam ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }
    });
  }, 1000);
}

// ── Init ─────────────────────────────────────────────
let _prevTournamentStatus = null;
let _isInitialSettingsLoad = true;

function initViewer() {
  setTimeout(hideLoadingSpinner, 4000);

  db.ref(`${ROOT}/settings`).on('value', snap => {
    const s = snap.val() || {};
    const name = s.name || 'ML Tournament';
    document.getElementById('tournament-name').textContent = name;
    document.title = name + ' — Bracket';

    // Champion screen trigger — only when status CHANGES to 'done' while viewer is open
    if (!_isInitialSettingsLoad && s.status === 'done' && _prevTournamentStatus !== 'done') {
      setTimeout(() => {
        const finalMatchId = `r${s.totalRounds}_m1`;
        const finalMatch = _matches[finalMatchId];
        if (finalMatch && finalMatch.winner && _teams[finalMatch.winner]) {
          const champName = _teams[finalMatch.winner].name;
          const isAdmin = localStorage.getItem('mlbb_admin_active') === 'true';
          if (typeof ChampionScreen !== 'undefined') {
            ChampionScreen.show(champName, isAdmin);
          }
        }
      }, 800);
    }
    _prevTournamentStatus = s.status;
    _isInitialSettingsLoad = false;

    _meta = {
      totalRounds: s.totalRounds || _meta.totalRounds || 4,
      bracketSize: s.bracketSize || _meta.bracketSize || 16
    };
    _settingsLoaded = true;
    tryRender();
  });

  db.ref(`${ROOT}/teams`).on('value', snap => {
    _teams = snap.val() || {};
    _teamsLoaded = true;
    tryRender();
  });

  db.ref(`${ROOT}/matches`).on('value', snap => {
    const newMatches = snap.val() || {};
    checkForWinnerSmashAnimations(newMatches);
    _matches = newMatches;
    _matchesLoaded = true;
    tryRender();
  });

  setupZoomControls();
  startCountdownTicker();
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
      // Live toast notification
      const winnerTeam = _teams[currW];
      const t1 = _teams[m.team1];
      const t2 = _teams[m.team2];
      if (winnerTeam && t1 && t2) {
        const loserTeam = currW === m.team1 ? t2 : t1;
        showLiveToast(
          `🏆 <strong>${winnerTeam.name}</strong> mengalahkan ${loserTeam.name} di <em>${m.roundName}</em>!`,
          'win',
          6000
        );
      }

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

function _getRoundDate(round, total) {
  const fromEnd = total - round;
  if (fromEnd === 0) return '14 Agustus 2026';
  if (fromEnd === 1) return '14 Agustus 2026';
  if (fromEnd === 2) return '13 Agustus 2026';
  if (fromEnd === 3) return '13 Agustus 2026';
  return '13 Agustus 2026';
}

function _getRoundName(round, total) {
  const fromEnd = total - round;
  if (fromEnd === 0) return 'Grand Final';
  if (fromEnd === 1) return 'Semi Final';
  if (fromEnd === 2) return 'Quarter Final';
  if (fromEnd === 3) return 'Round of 16';
  if (fromEnd === 4) return 'Round of 32';
  return `Round ${round}`;
}

function _calcBO3(games, team1Id, team2Id) {
  let t1 = 0, t2 = 0;
  if (games) {
    for (const g of ['g1', 'g2', 'g3']) {
      if (games[g] === team1Id) t1++;
      else if (games[g] === team2Id) t2++;
    }
  }
  let winner = null;
  if (t1 >= 2) winner = team1Id;
  else if (t2 >= 2) winner = team2Id;
  return { t1wins: t1, t2wins: t2, winner };
}

function _getNextMatchInfo(currentRound, currentPosition, totalRounds) {
  if (currentRound >= totalRounds) return null;
  const nextRound = currentRound + 1;
  const nextPos   = Math.floor(currentPosition / 2);
  const slot      = currentPosition % 2 === 0 ? 'team1' : 'team2';
  return { matchId: `r${nextRound}_m${nextPos}`, slot };
}

function ensureThirdPlaceMatchExists() {
  const tot = _meta.totalRounds || 4;
  if (tot >= 2 && !_matches['m_third']) {
    const sfDate = _getRoundDate(Math.max(1, tot - 1), tot);
    _matches['m_third'] = {
      id: 'm_third',
      round: Math.max(1, tot - 1),
      position: 99,
      isThirdPlace: true,
      roundName: 'PEREBUTAN JUARA 3',
      roundDate: sfDate,
      format: 'BO1',
      team1: null,
      team2: null,
      winner: null,
      isBye: false,
      status: 'pending',
      games: { g1: null, g2: null, g3: null }
    };
  }
}

function tryRender() {
  // Don't do anything until both matches and settings have loaded from Firebase
  if (!_matchesLoaded || !_settingsLoaded) return;

  const matchKeys = Object.keys(_matches).filter(k => k !== 'm_third');
  if (!matchKeys.length) {
    showEmpty();
    return;
  }

  // Compute totalRounds from meta or from match keys
  let maxR = 0;
  for (const k of matchKeys) {
    const m = _matches[k];
    if (m && m.round) {
      const r = Number(m.round);
      if (r > maxR) maxR = r;
    }
  }

  _meta.totalRounds = _meta.totalRounds || maxR || 4;
  _meta.bracketSize = _meta.bracketSize || Math.pow(2, _meta.totalRounds);

  try {
    ensureThirdPlaceMatchExists();
    hideLoadingSpinner();
    renderBracket();
  } catch (err) {
    console.error('Error in renderBracket:', err);
    hideLoadingSpinner();
    const root = document.getElementById('bracket-root');
    if (root) {
      root.innerHTML = `<div class="empty-state"><span class="emoji">⚠️</span><h2>Error Memuat Bracket</h2><p style="color:#F87171;font-size:0.8rem;">${err.message}</p></div>`;
    }
  }
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
    const rMatches   = (rounds[r] || []).filter(m => m.id !== 'm_third');
    const numMatches = bracketSize / Math.pow(2, r);
    const slotH      = BRACKET_H / numMatches;
    const isBO3      = rMatches.length > 0 && rMatches[0].format === 'BO3';
    const roundName  = rMatches.length > 0 ? rMatches[0].roundName : _getRoundName(r, totalRounds);
    const roundDate  = (rMatches.length > 0 && rMatches[0].roundDate) ? rMatches[0].roundDate : _getRoundDate(r, totalRounds);

    html += `
      <div class="round-col" id="round-col-${r}">
        <div class="round-header">
          <span class="round-label">${roundName}</span>
          <div class="round-meta">
            <span class="round-format-tag ${isBO3 ? 'bo3' : 'bo1'}">${isBO3 ? 'BO3' : 'BO1'}</span>
            <span class="round-date-tag">📅 ${roundDate}</span>
          </div>
        </div>
        <div class="round-matches" style="height:${BRACKET_H}px;" id="round-matches-${r}">`;

    for (const m of rMatches) {
      html += `<div class="match-slot" style="height:${slotH}px;">
                 ${renderMatchCard(m)}
               </div>`;
    }

    html += `</div>`;

    if (r === totalRounds && _matches['m_third']) {
      const m3 = _matches['m_third'];
      html += `
        <div class="third-place-box" style="margin-top:24px;width:100%;text-align:center;">
          <div class="third-place-title" style="font-size:0.72rem;font-weight:800;color:#F59E0B;letter-spacing:1px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px;">
            <span>🥉 PEREBUTAN JUARA 3</span>
            <span class="format-badge bo1" style="font-size:0.55rem;padding:1px 5px;">BO1</span>
          </div>
          ${renderMatchCard(m3)}
        </div>`;
    }

    html += `</div>`;

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
  if (m.id === 'm_third' || m.isThirdPlace) return false;
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
    const r = _calcBO3(m.games, m.team1, m.team2);
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

  // Countdown badge
  let countdownBadge = '';
  if (!isDone && m.startTime) {
    const diff = m.startTime - Date.now();
    if (diff > 0) {
      const h = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const label = h > 0
        ? `⏱ Mulai dalam ${h}j ${String(mins).padStart(2,'0')}m`
        : `⏱ Mulai dalam ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
      countdownBadge = `<div class="match-countdown" data-start="${m.startTime}">${label}</div>`;
    } else {
      countdownBadge = `<div class="match-countdown live-now">🔴 SEDANG BERLANGSUNG</div>`;
    }
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
      ${countdownBadge}
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
  p.setAttribute('stroke', 'var(--connector-line, #FFFFFF)');
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
  const root = document.getElementById('bracket-root');
  if (!root) return;
  
  // Re-bind direct click handlers to clickable match cards
  root.querySelectorAll('.match-card.clickable').forEach(card => {
    card.style.cursor = 'pointer';
    card.onclick = (e) => {
      e.stopPropagation();
      const matchId = card.dataset.matchId;
      if (matchId) openViewerMatchModal(matchId);
    };
  });
}

function openViewerMatchModal(matchId) {
  const m = _matches[matchId];
  if (!m) return;

  // Close break overlay if open so spectator detail modal is front & center
  closeBreakOverlay();

  const t1 = m.team1 ? (_teams[m.team1]?.name || 'TBD') : 'TBD';
  const t2 = m.team2 ? (_teams[m.team2]?.name || 'TBD') : 'TBD';
  const t1Seed = m.team1 ? (_teams[m.team1]?.seed || '') : '';
  const t2Seed = m.team2 ? (_teams[m.team2]?.seed || '') : '';

  const isDone = m.status === 'done';
  const t1Win  = isDone && m.winner === m.team1;
  const t2Win  = isDone && m.winner === m.team2;

  document.getElementById('vm-title').textContent = m.roundName;
  document.getElementById('vm-format').textContent = m.format;
  const vmDateEl = document.getElementById('vm-date');
  if (vmDateEl) {
    const tot = (_meta && _meta.totalRounds) || 4;
    vmDateEl.textContent = m.roundDate || _getRoundDate(m.round, tot);
  }

  const body = document.getElementById('vm-body');

  let statusBadge = '<span class="status-pill pending">🟢 DALAM PROSES / MENUNGGU</span>';
  if (isDone) statusBadge = '<span class="status-pill done">🏆 PERTANDINGAN SELESAI</span>';

  let scoresContent = '';
  if (m.format === 'BO3' && m.games) {
    const { t1wins, t2wins, winner } = _calcBO3(m.games, m.team1, m.team2);
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
          <button class="admin-pick-btn t1-btn ${t1Win ? 'active-win' : ''}" data-pick-match="${m.id}" data-pick-team="${m.team1}" onclick="window.quickAdminPickWinner('${m.id}','${m.team1}')">
            🏆 Menangkan ${esc(t1)}
          </button>
          <button class="admin-pick-btn t2-btn ${t2Win ? 'active-win' : ''}" data-pick-match="${m.id}" data-pick-team="${m.team2}" onclick="window.quickAdminPickWinner('${m.id}','${m.team2}')">
            🏆 Menangkan ${esc(t2)}
          </button>
        </div>
        ${isDone ? `
          <div style="margin-top:10px;">
            <button class="admin-reset-btn" data-reset-match="${m.id}" onclick="window.quickAdminResetMatch('${m.id}')">
              🔄 Reset / Batalkan Pemenang Match Ini
            </button>
          </div>
        ` : ''}
      </div>
    ` : ''}
  `;

  document.getElementById('viewer-match-modal').classList.add('show');
  _activeViewerMatchId = matchId;

  // Attach admin button listeners after innerHTML is set
  body.querySelectorAll('[data-pick-match]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mid = btn.getAttribute('data-pick-match');
      const tid = btn.getAttribute('data-pick-team');
      quickAdminPickWinner(mid, tid);
    });
  });
  body.querySelectorAll('[data-reset-match]').forEach(btn => {
    btn.addEventListener('click', () => {
      quickAdminResetMatch(btn.getAttribute('data-reset-match'));
    });
  });

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

  if (isDone && (t1Win || t2Win) && typeof CoinShatterEngine !== 'undefined') {
    setTimeout(triggerModalSmash, 300);
  }
}

async function quickAdminPickWinner(matchId, winnerTeamId) {
  try {
    const m = _matches[matchId];
    if (!m) { alert('Match tidak ditemukan: ' + matchId); return; }
    if (!winnerTeamId) { alert('Team ID tidak valid'); return; }

    const updates = {};
    updates[`${ROOT}/matches/${m.id}/winner`] = winnerTeamId;
    updates[`${ROOT}/matches/${m.id}/status`] = 'done';

    const totalRounds = _meta.totalRounds || 4;

    if (m.id !== 'm_third') {
      const next = _getNextMatchInfo(m.round, m.position, totalRounds);
      if (next) {
        updates[`${ROOT}/matches/${next.matchId}/${next.slot}`] = winnerTeamId;
      } else {
        updates[`${ROOT}/settings/status`] = 'done';
      }

      // Auto-advance loser of Semifinal to 3rd Place Match (m_third)
      if (m.round === (totalRounds - 1)) {
        const loserId = m.team1 === winnerTeamId ? m.team2 : (m.team2 === winnerTeamId ? m.team1 : null);
        const slot = m.position === 0 ? 'team1' : 'team2';
        updates[`${ROOT}/matches/m_third/id`] = 'm_third';
        updates[`${ROOT}/matches/m_third/round`] = totalRounds - 1;
        updates[`${ROOT}/matches/m_third/roundName`] = 'PEREBUTAN JUARA 3';
        updates[`${ROOT}/matches/m_third/format`] = 'BO1';
        updates[`${ROOT}/matches/m_third/isThirdPlace`] = true;
        updates[`${ROOT}/matches/m_third/${slot}`] = loserId;
      }
    }

    await db.ref().update(updates);
    setTimeout(() => {
      openViewerMatchModal(matchId);
    }, 150);
  } catch (err) {
    console.error('quickAdminPickWinner error:', err);
    alert('❌ Gagal menyimpan: ' + (err.message || JSON.stringify(err)));
  }
}

async function quickAdminResetMatch(matchId) {
  try {
    const m = _matches[matchId];
    if (!m) return;
    if (!confirm(`Batalkan hasil pertandingan ${m.roundName}?`)) return;

    const updates = {};
    updates[`${ROOT}/matches/${m.id}/winner`] = null;
    updates[`${ROOT}/matches/${m.id}/status`] = 'pending';

    const totalRounds = _meta.totalRounds || 4;

    if (m.id !== 'm_third') {
      const next = _getNextMatchInfo(m.round, m.position, totalRounds);
      if (next) {
        updates[`${ROOT}/matches/${next.matchId}/${next.slot}`] = null;
        updates[`${ROOT}/matches/${next.matchId}/winner`] = null;
        updates[`${ROOT}/matches/${next.matchId}/status`] = 'pending';
      }

      // Reset 3rd Place Match slot if Semifinal match is reset
      if (m.round === (totalRounds - 1)) {
        const slot = m.position === 0 ? 'team1' : 'team2';
        updates[`${ROOT}/matches/m_third/${slot}`] = null;
        updates[`${ROOT}/matches/m_third/winner`] = null;
        updates[`${ROOT}/matches/m_third/status`] = 'pending';
      }
    }

    await db.ref().update(updates);
    setTimeout(() => {
      openViewerMatchModal(matchId);
    }, 150);
  } catch (err) {
    console.error('quickAdminResetMatch error:', err);
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

// ── Theme Toggle ──────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const knob = document.getElementById('theme-toggle-knob');
  if (knob) knob.textContent = theme === 'light' ? '☀️' : '🌙';
  localStorage.setItem('mlbb_theme', theme);
}

// ── Next Match Overview & Intermission Overlay ─────────
let _breakCountdownInterval = null;

function renderRosterCardsHTML(teamId, teamName, isBlueSide) {
  const rosterData = typeof getTeamRoster === 'function' ? getTeamRoster(teamId, teamName) : null;
  const sideClass  = isBlueSide ? 'blue-side' : 'red-side';
  const emblemText = isBlueSide ? '🟦' : '🟥';
  const displayName = teamName || 'TBD';

  let playersHTML = '';
  if (rosterData && rosterData.players && rosterData.players.length > 0) {
    playersHTML = rosterData.players.map(p => {
      const roleCls = (p.role || '').toLowerCase().replace(/[^a-z]/g, '');
      return `
        <div class="roster-item">
          <div class="roster-player-info">
            <span class="roster-nick">${esc(p.nickname || p.name)}</span>
            <span class="roster-real">${esc(p.name)} (${esc(p.division)})</span>
          </div>
          <span class="role-badge r-${roleCls}">${esc(p.role)}</span>
        </div>`;
    }).join('');
  } else {
    playersHTML = `
      <div style="padding:16px;text-align:center;color:var(--text-3);font-size:0.84rem;">
        Roster pemain akan segera diumumkan
      </div>`;
  }

  return `
    <div class="break-team-card ${sideClass}">
      <div class="break-team-header">
        <div class="break-team-emblem">${emblemText}</div>
        <div class="break-team-name">${esc(displayName)}</div>
      </div>
      <div class="roster-list">
        ${playersHTML}
      </div>
    </div>`;
}

function getNextPendingMatch() {
  const matchesArr = Object.values(_matches);
  if (!matchesArr.length) return null;
  matchesArr.sort((a, b) => a.round - b.round || a.position - b.position);
  return matchesArr.find(m => m.status === 'pending' && !m.isBye && (m.team1 || m.team2)) || matchesArr.find(m => m.status === 'pending' && !m.isBye) || matchesArr[0];
}

function renderNextMatchOverview(matchId, endTimeMs) {
  let targetMatch = matchId ? _matches[matchId] : null;
  if (!targetMatch) {
    targetMatch = getNextPendingMatch();
  }

  const roundTitle = targetMatch ? targetMatch.roundName.toUpperCase() : 'ROUND OF 16';
  const rDate = targetMatch ? (targetMatch.roundDate || _getRoundDate(targetMatch.round, _meta.totalRounds || 4)) : '13 AGUSTUS 2026';
  const fmt = targetMatch ? targetMatch.format : 'BO1';

  document.getElementById('bo-round-title').textContent = roundTitle;
  document.getElementById('bo-match-sub').textContent = `MATCH ${targetMatch ? targetMatch.id : ''} • ${fmt} • ${rDate.toUpperCase()}`;

  const t1Name = targetMatch && targetMatch.team1 ? (_teams[targetMatch.team1]?.name || 'TBD') : 'TBD';
  const t2Name = targetMatch && targetMatch.team2 ? (_teams[targetMatch.team2]?.name || 'TBD') : 'TBD';
  const t1Id   = targetMatch ? targetMatch.team1 : null;
  const t2Id   = targetMatch ? targetMatch.team2 : null;

  const t1HTML = renderRosterCardsHTML(t1Id, t1Name, true);
  const t2HTML = renderRosterCardsHTML(t2Id, t2Name, false);

  const arenaHTML = `
    <div class="break-arena-grid">
      ${t1HTML}
      <div class="break-vs-center">
        <div class="break-vs-shield">VS</div>
        <div class="break-timer-box">
          <div class="timer-val" id="bo-timer-display">READY</div>
          <div class="timer-lbl">COUNTDOWN MATCH</div>
        </div>
      </div>
      ${t2HTML}
    </div>`;

  const contentEl = document.getElementById('bo-arena-content');
  if (contentEl) contentEl.innerHTML = arenaHTML;
  startBreakCountdown(endTimeMs);
}

function startBreakCountdown(endTimeMs) {
  if (_breakCountdownInterval) clearInterval(_breakCountdownInterval);

  const timerEl = document.getElementById('bo-timer-display');
  if (!timerEl) return;

  if (!endTimeMs) {
    timerEl.textContent = 'READY';
    return;
  }

  function update() {
    const remaining = Math.max(0, Math.floor((endTimeMs - Date.now()) / 1000));
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;

    if (remaining <= 0) {
      clearInterval(_breakCountdownInterval);
      timerEl.textContent = '00:00';
    }
  }

  update();
  _breakCountdownInterval = setInterval(update, 1000);
}

function openBreakOverlay(matchId, endTimeMs) {
  renderNextMatchOverview(matchId, endTimeMs);
  document.getElementById('break-overlay')?.classList.add('show');
}

function closeBreakOverlay() {
  document.getElementById('break-overlay')?.classList.remove('show');
  if (_breakCountdownInterval) clearInterval(_breakCountdownInterval);
}

document.getElementById('open-break-btn')?.addEventListener('click', () => openBreakOverlay());
document.getElementById('break-close-btn')?.addEventListener('click', closeBreakOverlay);
document.getElementById('break-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeBreakOverlay();
});

document.addEventListener('DOMContentLoaded', () => {
  initViewer();

  // Global click delegation for match cards to guarantee detail modal opens
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.match-card.clickable');
    if (card && card.dataset.matchId) {
      openViewerMatchModal(card.dataset.matchId);
    }
  });

  // Listen to Firebase breakState for live sync across all viewers
  db.ref(`${ROOT}/settings/breakState`).on('value', snap => {
    const bs = snap.val();
    if (bs && bs.active) {
      openBreakOverlay(bs.matchId, bs.endTimeMs);
    } else {
      closeBreakOverlay();
    }
  });

  // Apply saved theme on load
  const savedTheme = localStorage.getItem('mlbb_theme') || 'dark';
  applyTheme(savedTheme);

  // Wire toggle button
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
});

// Expose admin functions globally so onclick attributes always work
window.quickAdminPickWinner = quickAdminPickWinner;
window.quickAdminResetMatch = quickAdminResetMatch;
