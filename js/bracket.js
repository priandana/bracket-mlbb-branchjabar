// =====================================================
// BRACKET LOGIC — bracket.js
// Supports standard seeding & custom manual pairings
// =====================================================

/**
 * Get smallest power of 2 >= n
 */
function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard bracket seed order generator
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
 */
function getFormat(round, total) {
  return round >= total - 1 ? 'BO3' : 'BO1';
}

/**
 * Get human-readable round name
 */
function getRoundName(round, total) {
  const fromEnd = total - round;
  if (fromEnd === 0) return 'Grand Final';
  if (fromEnd === 1) return 'Semi Final';
  if (fromEnd === 2) return 'Quarter Final';
  if (fromEnd === 3) return 'Round of 16';
  if (fromEnd === 4) return 'Round of 32';
  return `Round ${round}`;
}

/**
 * Get date for a round
 * Round 16 & Quarter Final: 13 Agustus 2026
 * Semi Final & Grand Final: 14 Agustus 2026
 */
function getRoundDate(round, total) {
  const fromEnd = total - round;
  if (fromEnd === 0) return '14 Agustus 2026'; // Grand Final
  if (fromEnd === 1) return '14 Agustus 2026'; // Semi Final
  if (fromEnd === 2) return '13 Agustus 2026'; // Quarter Final
  if (fromEnd === 3) return '13 Agustus 2026'; // Round of 16
  return '13 Agustus 2026';
}

/**
 * Calculate BO3 score from games object
 */
function calcBO3(games, team1Id, team2Id) {
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

/**
 * Get next match info that a winner should advance to
 */
function getNextMatchInfo(currentRound, currentPosition, totalRounds) {
  if (currentRound >= totalRounds) return null;
  const nextRound = currentRound + 1;
  const nextPos   = Math.floor(currentPosition / 2);
  const slot      = currentPosition % 2 === 0 ? 'team1' : 'team2';
  return { matchId: `r${nextRound}_m${nextPos}`, slot };
}

/**
 * Generate full bracket object from custom Round 1 pairings.
 */
function generateBracketFromPairings(pairings, totalRounds, bracketSize) {
  const matches = {};

  // ── 1. Round 1 ─────────────────────────────────────
  const r1format    = getFormat(1, totalRounds);
  const r1RoundName = getRoundName(1, totalRounds);
  const r1RoundDate = getRoundDate(1, totalRounds);
  const numR1       = bracketSize / 2;

  for (let pos = 0; pos < numR1; pos++) {
    const pair = pairings[pos] || { team1: null, team2: null };
    const t1   = pair.team1;
    const t2   = pair.team2;
    const isBye = (!t1 && !t2) || (!t1 && t2) || (t1 && !t2);
    const winner = isBye ? (t1 ? t1.id : t2 ? t2.id : null) : null;

    const id = `r1_m${pos}`;
    matches[id] = {
      id,
      round:     1,
      position:  pos,
      roundName: r1RoundName,
      roundDate: r1RoundDate,
      format:    r1format,
      team1:     t1 ? t1.id : null,
      team2:     t2 ? t2.id : null,
      winner,
      isBye,
      status:    isBye ? 'done' : 'pending',
      games:     { g1: null, g2: null, g3: null }
    };
  }

  // ── 2. Rounds 2 ... totalRounds ────────────────────
  for (let r = 2; r <= totalRounds; r++) {
    const numMatches = bracketSize / Math.pow(2, r);
    const fmt   = getFormat(r, totalRounds);
    const rName = getRoundName(r, totalRounds);
    const rDate = getRoundDate(r, totalRounds);

    for (let m = 0; m < numMatches; m++) {
      const id = `r${r}_m${m}`;
      matches[id] = {
        id,
        round:     r,
        position:  m,
        roundName: rName,
        roundDate: rDate,
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

  // ── 3. Auto-advance BYE winners into Round 2 ────────
  if (totalRounds >= 2) {
    for (let pos = 0; pos < numR1; pos++) {
      const m = matches[`r1_m${pos}`];
      if (m.isBye && m.winner) {
        const nextPos = Math.floor(pos / 2);
        const nextId  = `r2_m${nextPos}`;
        const slot    = pos % 2 === 0 ? 'team1' : 'team2';
        if (matches[nextId]) matches[nextId][slot] = m.winner;
      }
    }

    // ── 4. Cascade check for Round 2 matches that become BYEs ──
    const numR2 = bracketSize / 4;
    for (let pos = 0; pos < numR2; pos++) {
      const m = matches[`r2_m${pos}`];
      if (m) {
        const t1 = m.team1;
        const t2 = m.team2;
        // If one team is present and the other slot came from an empty BYE, auto-advance
        if ((t1 && !t2) || (!t1 && t2)) {
          // Check if the other slot was from an empty R1 match
          const r1Pos1 = pos * 2;
          const r1Pos2 = pos * 2 + 1;
          const r1m1 = matches[`r1_m${r1Pos1}`];
          const r1m2 = matches[`r1_m${r1Pos2}`];

          // If one R1 match was completely empty (no teams), advance the team in R2
          if ((r1m1 && !r1m1.team1 && !r1m1.team2) || (r1m2 && !r1m2.team1 && !r1m2.team2)) {
            m.winner = t1 || t2;
            m.isBye = true;
            m.status = 'done';
            const nextInfo = getNextMatchInfo(2, pos, totalRounds);
            if (nextInfo && matches[nextInfo.matchId]) {
              matches[nextInfo.matchId][nextInfo.slot] = m.winner;
            }
          }
        }
      }
    }
  }

  return { bracketSize, totalRounds, matches };
}

/**
 * Standard automatic bracket generator (fallback)
 */
function generateBracket(teams) {
  const n           = teams.length;
  const bracketSize = nextPowerOf2(n);
  const totalRounds = Math.log2(bracketSize);
  const seedOrder   = generateSeeds(bracketSize);

  const slots = seedOrder.map(seed => {
    const idx = seed - 1;
    return idx < n ? teams[idx] : null;
  });

  const pairings = [];
  for (let i = 0; i < bracketSize; i += 2) {
    pairings.push({ team1: slots[i], team2: slots[i + 1] });
  }

  return generateBracketFromPairings(pairings, totalRounds, bracketSize);
}
