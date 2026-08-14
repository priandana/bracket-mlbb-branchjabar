// =====================================================
// MLBB HERO VICTORY ANIMATION ENGINE — coin-shatter.js
// Featuring MIYA (Moonlight Archer) Projectile Attack,
// Celestial Particle Physics & Indonesian Voice Announcer
// =====================================================

const CoinShatterEngine = (function() {
  let canvas = null;
  let ctx = null;
  let particles = [];
  let animId = null;
  let audioCtx = null;

  // Web Speech Voice Announcer (Strict Female Voice Prioritization)
  function speakVictory(teamName) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const cleanName = teamName || 'Tim Pemenang';
      const phrases = [
        `One shot, one kill! Kemenangan mutlak untuk ${cleanName}!`,
        `${cleanName} menang! Panah cahaya bulan mengalahkan lawan!`,
        `Selamat kepada ${cleanName}! Kemenangan gemilang!`,
        `Victory! Kemenangan untuk ${cleanName}!`
      ];
      const text = phrases[Math.floor(Math.random() * phrases.length)];
      const utterance = new SpeechSynthesisUtterance(text);

      utterance.rate = 1.05;
      utterance.pitch = 1.4; // Distinct high female voice pitch
      utterance.volume = 1.0;
      utterance.lang = 'id-ID';

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const maleKeywords = ['andika', 'ardi', 'david', 'mark', 'george', 'male', 'guy', 'man', 'stefan'];
        const femaleKeywords = ['gadis', 'winda', 'woni', 'zira', 'susan', 'aria', 'jenny', 'google', 'female', 'woman', 'girl', 'natural'];

        const isMale = (v) => maleKeywords.some(m => v.name.toLowerCase().includes(m));
        const isFemale = (v) => femaleKeywords.some(f => v.name.toLowerCase().includes(f));

        let selectedVoice = voices.find(v => 
          v.lang && (v.lang.toLowerCase().includes('id') || v.lang.toLowerCase().includes('ind')) &&
          !isMale(v) && isFemale(v)
        );

        if (!selectedVoice) {
          selectedVoice = voices.find(v => 
            v.lang && (v.lang.toLowerCase().includes('id') || v.lang.toLowerCase().includes('ind')) &&
            !isMale(v)
          );
        }

        if (!selectedVoice) {
          selectedVoice = voices.find(v => isFemale(v) && !isMale(v));
        }

        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis blocked or unsupported:', e);
    }
  }

  function getAudioContext() {
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  // 1. Bow Release / Arrow Launch SFX (Web Audio Synthesizer)
  function playBowReleaseSFX() {
    try {
      const actx = getAudioContext();
      if (!actx) return;
      const now = actx.currentTime;

      // Whizzing arrow sound (bandpass filtered noise ramp)
      const bufferSize = actx.sampleRate * 0.25;
      const noiseBuffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const noise = actx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = actx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(3200, now + 0.22);
      filter.Q.setValueAtTime(4.0, now);

      const gain = actx.createGain();
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);
      noise.start(now);

      // Chime harmonic (Celestial arrow glow tone)
      const osc = actx.createOscillator();
      const oscGain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(2400, now + 0.22);

      oscGain.gain.setValueAtTime(0.4, now);
      oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

      osc.connect(oscGain);
      oscGain.connect(actx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn('Bow SFX error:', e);
    }
  }

  // 2. Crystal Arrow Impact SFX (Web Audio Synthesizer)
  function playImpactSFX() {
    try {
      const actx = getAudioContext();
      if (!actx) return;
      const now = actx.currentTime;

      // Heavy sub-bass boom
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.45);

      gain.gain.setValueAtTime(1.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(now);
      osc.stop(now + 0.45);

      // Metallic & Crystal Shatter Noise
      const bufferSize = actx.sampleRate * 0.35;
      const noiseBuffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
      }

      const whiteNoise = actx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = actx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1800, now);

      const noiseGain = actx.createGain();
      noiseGain.gain.setValueAtTime(1.0, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(actx.destination);
      whiteNoise.start(now);
    } catch (e) {
      console.warn('SFX impact play error:', e);
    }
  }

  function initCanvas() {
    canvas = document.getElementById('shatter-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'shatter-canvas';
      document.body.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // Particle Burst for Moonlight Arrow Impact
  function createMoonlightParticles(x, y) {
    const numCrystalFragments = 26;
    const crystalColors = ['#38BDF8', '#0284C7', '#7DD3FC', '#F59E0B', '#FFFFFF'];

    for (let i = 0; i < numCrystalFragments; i++) {
      const angle = (i / numCrystalFragments) * Math.PI * 2 + (Math.random() * 0.3);
      const speed = 6 + Math.random() * 12;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - (Math.random() * 5 + 2);

      particles.push({
        type: 'crystal',
        x: x + (Math.random() * 10 - 5),
        y: y + (Math.random() * 10 - 5),
        vx: vx,
        vy: vy,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.6,
        size: Math.random() * 9 + 5,
        color: crystalColors[Math.floor(Math.random() * crystalColors.length)],
        alpha: 1,
        life: 1.0,
        decay: Math.random() * 0.025 + 0.018,
        gravity: 0.35
      });
    }

    const numSparks = 45;
    const sparkColors = ['#38BDF8', '#BAE6FD', '#F59E0B', '#FFFFFF', '#67E8F9'];
    for (let i = 0; i < numSparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 15;
      particles.push({
        type: 'spark',
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3.5 + 2,
        color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
        alpha: 1,
        life: 1.0,
        decay: Math.random() * 0.035 + 0.02,
        gravity: 0.12
      });
    }

    const numSmoke = 16;
    for (let i = 0; i < numSmoke; i++) {
      particles.push({
        type: 'smoke',
        x: x + (Math.random() * 24 - 12),
        y: y + (Math.random() * 24 - 12),
        vx: (Math.random() - 0.5) * 2.5,
        vy: -Math.random() * 3 - 1,
        size: Math.random() * 16 + 12,
        color: '#1E293B',
        alpha: 0.55,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.012,
        gravity: -0.05
      });
    }

    if (!animId) {
      renderLoop();
    }
  }

  function renderLoop() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= p.decay;
      p.alpha = Math.max(0, p.life);

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.type === 'crystal') {
        p.rotation += p.vRot;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.7, p.size * 0.7);
        ctx.lineTo(-p.size * 0.7, p.size * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    if (particles.length > 0) {
      animId = requestAnimationFrame(renderLoop);
    } else {
      animId = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── MAIN TRIGGER: MIYA MOONLIGHT ARCHER ATTACK ANIMATION ──
  function triggerMiyaAttack(containerElem, winnerAvatarElem, loserAvatarElem, winnerTeamName = '') {
    if (!canvas) initCanvas();

    if (!winnerAvatarElem || !loserAvatarElem) {
      if (containerElem) triggerContainerShake(containerElem);
      speakVictory(winnerTeamName);
      return;
    }

    const winnerRect = winnerAvatarElem.getBoundingClientRect();
    const loserRect  = loserAvatarElem.getBoundingClientRect();

    const wX = winnerRect.left + winnerRect.width / 2;
    const wY = winnerRect.top + winnerRect.height / 2;
    const lX = loserRect.left + loserRect.width / 2;
    const lY = loserRect.top + loserRect.height / 2;

    const deltaX = lX - wX;
    const deltaY = lY - wY;
    const angleRad = Math.atan2(deltaY, deltaX);
    const angleDeg = angleRad * (180 / Math.PI);

    // 1. Spawn Miya Summon Badge on Winner Card
    const winnerCard = winnerAvatarElem.closest('.arena-card');
    let miyaBadge = null;
    if (winnerCard) {
      winnerCard.querySelectorAll('.miya-summon-badge').forEach(el => el.remove());
      miyaBadge = document.createElement('div');
      miyaBadge.className = 'miya-summon-badge';
      miyaBadge.innerHTML = `
        <div class="miya-avatar-wrap">
          <img src="images/miya-hero.jpg" alt="Miya Moonlight Archer" class="miya-avatar-img" />
          <div class="miya-lunar-ring"></div>
        </div>
        <div class="miya-badge-title">🏹 MIYA • MOONLIGHT ARCHER</div>
      `;
      winnerCard.appendChild(miyaBadge);
      requestAnimationFrame(() => miyaBadge.classList.add('active'));
    }

    // 2. Play Bow Charge & Release Sound
    playBowReleaseSFX();

    // 3. Spawn Glowing Moonlight Arrow Projectile
    const arrow = document.createElement('div');
    arrow.className = 'moonlight-arrow-projectile';
    arrow.style.left = `${wX}px`;
    arrow.style.top = `${wY}px`;
    arrow.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg) scale(0.6)`;
    arrow.innerHTML = `
      <div class="arrow-energy-head"></div>
      <div class="arrow-shaft"></div>
      <div class="arrow-energy-trail"></div>
      <div class="arrow-crystal-sparkles"></div>
    `;
    document.body.appendChild(arrow);

    // Trigger Flying Motion
    requestAnimationFrame(() => {
      arrow.style.transition = 'transform 0.38s cubic-bezier(0.18, 0.89, 0.32, 1.15), opacity 0.38s ease';
      arrow.style.transform = `translate(${deltaX - 20 * Math.cos(angleRad)}px, ${deltaY - 20 * Math.sin(angleRad)}px) rotate(${angleDeg}deg) scale(1.35)`;
    });

    // 4. On Arrow Hit & Impact (380ms)
    setTimeout(() => {
      // Audio SFX
      playImpactSFX();

      // Screen/Impact Visuals
      createImpactFlash();
      createLunarShockwave(lX, lY);
      createMoonlightParticles(lX, lY);

      if (containerElem) triggerContainerShake(containerElem);

      const loserCard = loserAvatarElem.closest('.arena-card');
      if (loserCard) {
        loserCard.classList.add('defeated-smoked-out');
      }

      // Show Speech Bubble & Voice Callout
      showMiyaSpeechBubble(winnerAvatarElem, winnerTeamName);
      speakVictory(winnerTeamName);

      // Fade out and remove arrow
      arrow.style.opacity = '0';
      setTimeout(() => arrow.remove(), 200);

      // Remove Miya badge after celebration
      if (miyaBadge) {
        setTimeout(() => {
          miyaBadge.style.opacity = '0';
          miyaBadge.style.transform = 'translate(-50%, -15px) scale(0.85)';
          miyaBadge.style.transition = 'all 0.5s ease';
          setTimeout(() => miyaBadge.remove(), 500);
        }, 3200);
      }
    }, 380);
  }

  function showMiyaSpeechBubble(winnerAvatarElem, teamName) {
    if (!winnerAvatarElem) return;
    const winnerCard = winnerAvatarElem.closest('.arena-card');
    if (!winnerCard) return;

    const existing = winnerCard.querySelector('.victory-speech-bubble');
    if (existing) existing.remove();

    const name = (teamName || 'Tim Pemenang').toUpperCase();
    const callouts = [
      `🏹 "One shot, one kill!" • ${name} MENANG!`,
      `✨ "Panah rembulan memandu ${name}!"`,
      `🏆 VICTORY! Kemenangan untuk ${name}!`,
      `👑 ${name} MENGUASAI LAND OF DAWN!`
    ];
    const speechText = callouts[Math.floor(Math.random() * callouts.length)];

    const bubble = document.createElement('div');
    bubble.className = 'victory-speech-bubble miya-theme-bubble';
    bubble.innerHTML = speechText;
    winnerCard.appendChild(bubble);

    setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translate(-50%, -15px) scale(0.9)';
      bubble.style.transition = 'all 0.4s ease';
      setTimeout(() => bubble.remove(), 400);
    }, 3200);
  }

  function triggerContainerShake(elem) {
    const card = elem.closest('.modal') || elem;
    card.classList.add('match-card-shake');
    setTimeout(() => {
      card.classList.remove('match-card-shake');
    }, 550);
  }

  function createImpactFlash() {
    const flash = document.createElement('div');
    flash.className = 'impact-flash-overlay miya-lunar-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 140);
  }

  function createLunarShockwave(x, y) {
    const ring = document.createElement('div');
    ring.className = 'lunar-crescent-blast';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 600);
  }

  return {
    init: initCanvas,
    triggerSmash: triggerMiyaAttack,
    triggerMiyaAttack: triggerMiyaAttack,
    playSFX: playImpactSFX,
    speakVictory: speakVictory
  };
})();

// Pre-load voices
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  CoinShatterEngine.init();
});
