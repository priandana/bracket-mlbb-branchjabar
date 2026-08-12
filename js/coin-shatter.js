// =====================================================
// COIN SHATTER & CINEMATIC VICTORY SMASH ENGINE — coin-shatter.js
// Dynamic canvas particle physics & cinematic impact FX
// =====================================================

const CoinShatterEngine = (function() {
  let canvas = null;
  let ctx = null;
  let particles = [];
  let animId = null;
  let audioCtx = null;

  // Sound synthesis using Web Audio API
  function playImpactSFX() {
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      // 1. Heavy Sub-Bass Impact Boom
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.45);

      gain.gain.setValueAtTime(1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.45);

      // 2. High Glass & Metallic Shatter Noise
      const bufferSize = audioCtx.sampleRate * 0.3;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.18));
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1500, now);

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.9, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);

      whiteNoise.start(now);
    } catch (e) {
      console.warn('SFX audio play blocked or unsupported:', e);
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

  function createFissureAndShatterParticles(x, y) {
    const numFragments = 22;

    // Glowing Molten Gold + Obsidian Stone Fragments
    const obsidianColors = ['#0F172A', '#1E293B', '#334155'];
    const moltenColors = ['#F59E0B', '#FBBF24', '#EF4444', '#F97316'];

    for (let i = 0; i < numFragments; i++) {
      const angle = (i / numFragments) * Math.PI * 2 + (Math.random() * 0.25);
      const speed = 5 + Math.random() * 11;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - (Math.random() * 4 + 2);

      const isMolten = Math.random() > 0.4;
      const colorArr = isMolten ? moltenColors : obsidianColors;

      particles.push({
        type: 'fragment',
        x: x + (Math.random() * 12 - 6),
        y: y + (Math.random() * 12 - 6),
        vx: vx,
        vy: vy,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 9 + 6,
        color: colorArr[Math.floor(Math.random() * colorArr.length)],
        isMolten: isMolten,
        alpha: 1,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.015,
        gravity: 0.38
      });
    }

    // Sparks & Energy Embers
    const numSparks = 40;
    const sparkColors = ['#F59E0B', '#38BDF8', '#FBBF24', '#FFFFFF', '#EF4444'];
    for (let i = 0; i < numSparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 14;
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

    // Smoke embers trailing up
    const numSmoke = 15;
    for (let i = 0; i < numSmoke; i++) {
      particles.push({
        type: 'smoke',
        x: x + (Math.random() * 20 - 10),
        y: y + (Math.random() * 20 - 10),
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 3 - 1,
        size: Math.random() * 14 + 10,
        color: '#475569',
        alpha: 0.5,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.01,
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

      if (p.type === 'fragment') {
        p.rotation += p.vRot;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.isMolten) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
        } else {
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 4;
        }

        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.85, p.size * 0.85);
        ctx.lineTo(-p.size * 0.85, p.size * 0.65);
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

  function triggerSmash(containerElem, winnerAvatarElem, loserAvatarElem) {
    if (!canvas) initCanvas();
    playImpactSFX();

    if (!winnerAvatarElem || !loserAvatarElem) {
      if (containerElem) triggerContainerShake(containerElem);
      return;
    }

    const winnerRect = winnerAvatarElem.getBoundingClientRect();
    const loserRect = loserAvatarElem.getBoundingClientRect();

    const wX = winnerRect.left + winnerRect.width / 2;
    const wY = winnerRect.top + winnerRect.height / 2;
    const lX = loserRect.left + loserRect.width / 2;
    const lY = loserRect.top + loserRect.height / 2;

    // Flying Smash clone of Winner Emblem
    const smashClone = winnerAvatarElem.cloneNode(true);
    smashClone.classList.add('smash-flying-coin');
    smashClone.style.left = `${wX - winnerRect.width / 2}px`;
    smashClone.style.top = `${wY - winnerRect.height / 2}px`;
    smashClone.style.width = `${winnerRect.width}px`;
    smashClone.style.height = `${winnerRect.height}px`;
    document.body.appendChild(smashClone);

    // Hide original loser avatar temporarily
    loserAvatarElem.style.opacity = '0';

    const deltaX = lX - wX;
    const deltaY = lY - wY;

    // Force reflow
    smashClone.getBoundingClientRect();

    // Phase 1: High speed leap towards Loser
    smashClone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.55) rotate(360deg)`;
    smashClone.style.transition = 'transform 0.42s cubic-bezier(0.15, 0.9, 0.25, 1.25)';

    // Phase 2: Fissure Cracks & Impact Flash on collision
    setTimeout(() => {
      // Impact Flash
      createImpactFlash();

      // Fissure shatter explosion
      createFissureAndShatterParticles(lX, lY);

      // Modal container shake & punch
      if (containerElem) triggerContainerShake(containerElem);

      // Shockwave ring
      createShockwave(lX, lY);

      // Apply defeated smoked-out style to loser card
      const loserCard = loserAvatarElem.closest('.arena-card');
      if (loserCard) {
        loserCard.classList.add('defeated-smoked-out');
      }

      // Smoothly remove flying clone
      smashClone.style.opacity = '0';
      smashClone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.0)`;
      setTimeout(() => {
        smashClone.remove();
        if (loserAvatarElem) {
          loserAvatarElem.style.transition = 'opacity 0.4s ease';
          loserAvatarElem.style.opacity = '0.3';
        }
      }, 300);
    }, 420);
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
    flash.className = 'impact-flash-overlay';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 120);
  }

  function createShockwave(x, y) {
    const ring = document.createElement('div');
    ring.className = 'smash-shockwave';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 600);
  }

  return {
    init: initCanvas,
    triggerSmash: triggerSmash,
    playSFX: playImpactSFX
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  CoinShatterEngine.init();
});
