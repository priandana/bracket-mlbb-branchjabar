// =====================================================
// BRACKET LOGIC
// Single-elimination bracket generator
// =====================================================

/**
 * Get the smallest power of 2 >= n
 */
function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate standard bracket seed order for a given bracket size.
 * Ensures balanced seeding (e.g. 1 vs 2 only in finals).
 * For size 8  → [1, 8, 5, 4, 3, 6, 7, 2]
 * For size 16 → [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2]
 */
function generateSeeds(size) {
  if (size === 1) return [1];
  const prev = generateSeeds(size / 2);
  const result = [];
  for (const s of prev) {
    result.push(s);
    result.push(size + 1 - s);
  }
  return result;
}

/**
 * Get match format: last 2 rounds are BO3, rest BO1
 * @param {number} round  1-indexed round number
 * @param {number} total  total rounds in bracket
 */
function getFormat(round, total) {
  return round >= total - 1 ? 'BO3' : 'BO1';
}

/**
 * Get human-readable round name
 */
function getRoundName(round, total) {
  const fromEnd = total - round; // 0 = final, 1 = SF, 2 = QF, ...
  if (fromEnd === 0) return 'Grand Final';
  if (fromEnd === 1) return 'Semi Final';
  if (fromEnd === 2) return 'Quarter Final';
  if (fromEnd === 3) return 'Round of 16';
  if (fromEnd === 4) return 'Round of 32';
  return `Round ${round}`;
}

/**
 * Build the full bracket data structure from a list of team objects.
 * Each team must have: { id, name, seed }
 *
 * Returns:
 * {
 *   bracketSize,
 *   totalRounds,
 *   matches: { [matchId]: matchObj }
 * }
 *
 * matchObj:
 * {
 *   id, round, position, roundName, format,
 *   team1, team2, winner, isBye, status,
 *   games: { g1: null|teamId, g2: null|teamId, g3: null|teamId }
 * }
 */
function generateBracket(teams) {
  const n           = teams.length;
  const bracketSize = nextPowerOf2(n);
  const totalRounds = Math.log2(bracketSize);
  const seedOrder   = generateSeeds(bracketSize);

  // Map seed position → team (null = bye)
  const slots = seedOrder.map(seed => {
    const idx = seed - 1;
    return idx < n ? teams[idx] : null;
  });

  const matches = {};

  // ── Round 1 ──────────────────────────────────────
  const r1format   = getFormat(1, totalRounds);
  const r1RoundName = getRoundName(1, totalRounds);

  for (let i = 0; i < bracketSize; i += 2) {
    const pos = i / 2;
    const t1  = slots[i];
    const t2  = slots[i + 1];
    const isBye = !t1 || !t2;
    const winner  = isBye ? (t1 ? t1.id : t2 ? t2.id : null) : null;

    const id = `r1_m${pos}`;
    matches[id] = {
      id,
      round:     1,
      position:  pos,
      roundName: r1RoundName,
      format:    r1format,
      team1:     t1 ? t1.id : null,
      team2:     t2 ? t2.id : null,
      winner,
      isBye,
      status:    isBye ? 'done' : 'pending',
      games:     { g1: null, g2: null, g3: null }
    };
  }

  // ── Rounds 2…totalRounds (empty shells) ──────────
  for (let r = 2; r <= totalRounds; r++) {
    const numMatches = bracketSize / Math.pow(2, r);
    const fmt  = getFormat(r, totalRounds);
    const rName = getRoundName(r, totalRounds);

    for (let m = 0; m < numMatches; m++) {
      const id = `r${r}_m${m}`;
      matches[id] = {
        id,
        round:     r,
        position:  m,
        roundName: rName,
        format:    fmt,
        team1:     null,
        team2:     null,
        winner:    null,
        isBye:     false,
        status:    'pending',
        games:     { g1: null, g2: null, g3: null }
      };
    }
  }

  // ── Auto-advance bye winners into Round 2 ────────
  if (totalRounds >= 2) {
    for (let pos = 0; pos < bracketSize / 2; pos++) {
      const m = matches[`r1_m${pos}`];
      if (m.isBye && m.winner) {
        const nextPos = Math.floor(pos / 2);
        const nextId  = `r2_m${nextPos}`;
        const slot    = pos % 2 === 0 ? 'team1' : 'team2';
        if (matches[nextId]) matches[nextId][slot] = m.winner;
      }
    }
  }

  return { bracketSize, totalRounds, matches };
}

/**
 * Calculate BO3 score from games object
 * Returns { t1wins, t2wins, winner }
 */
function calcBO3(games, team1Id, team2Id) {
  let t1 = 0, t2 = 0;
  for (const g of ['g1', 'g2', 'g3']) {
    if (games[g] === team1Id) t1++;
    else if (games[g] === team2Id) t2++;
  }
  let winner = null;
  if (t1 >= 2) winner = team1Id;
  else if (t2 >= 2) winner = team2Id;
  return { t1wins: t1, t2wins: t2, winner };
}

/**
 * Get the next match info that a winner should advance to.
 * Returns { matchId, slot } or null if this is the final.
 */
function getNextMatchInfo(currentRound, currentPosition, totalRounds) {
  if (currentRound >= totalRounds) return null;
  const nextRound = currentRound + 1;
  const nextPos   = Math.floor(currentPosition / 2);
  const slot      = currentPosition % 2 === 0 ? 'team1' : 'team2';
  return { matchId: `r${nextRound}_m${nextPos}`, slot };
}
