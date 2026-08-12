// =====================================================
// COIN SHATTER & VICTORY SMASH ENGINE — coin-shatter.js
// Dynamic canvas particle physics & smash animation for bracket
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

      // 1. Bass boom oscillator
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.35);

      // 2. High glass/metal shatter noise
      const bufferSize = audioCtx.sampleRate * 0.25;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1200, now);

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.8, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

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

  function createShatterParticles(x, y, bgGradientColors) {
    const numFragments = 18;

    // Triangular fragments of the coin
    for (let i = 0; i < numFragments; i++) {
      const angle = (i / numFragments) * Math.PI * 2 + (Math.random() * 0.2);
      const speed = 4 + Math.random() * 9;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - (Math.random() * 3 + 2); // slight upwards velocity

      particles.push({
        type: 'fragment',
        x: x + (Math.random() * 10 - 5),
        y: y + (Math.random() * 10 - 5),
        vx: vx,
        vy: vy,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 8 + 6,
        color: bgGradientColors[i % bgGradientColors.length] || '#EF4444',
        alpha: 1,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.015,
        gravity: 0.35
      });
    }

    // Sparkles & golden embers burst
    const numSparks = 35;
    const sparkColors = ['#F59E0B', '#38BDF8', '#FBBF24', '#FFFFFF', '#EF4444'];
    for (let i = 0; i < numSparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 12;
      particles.push({
        type: 'spark',
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
        alpha: 1,
        life: 1.0,
        decay: Math.random() * 0.03 + 0.02,
        gravity: 0.1
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
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;

        // Draw an irregular polygon fragment
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.8, p.size * 0.8);
        ctx.lineTo(-p.size * 0.8, p.size * 0.6);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
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

  function triggerSmash(matchCardElem, winnerAvatarElem, loserAvatarElem) {
    if (!canvas) initCanvas();
    playImpactSFX();

    if (!winnerAvatarElem || !loserAvatarElem) {
      if (matchCardElem) triggerCardShake(matchCardElem);
      return;
    }

    const winnerRect = winnerAvatarElem.getBoundingClientRect();
    const loserRect = loserAvatarElem.getBoundingClientRect();

    // Coordinates relative to viewport
    const wX = winnerRect.left + winnerRect.width / 2;
    const wY = winnerRect.top + winnerRect.height / 2;
    const lX = loserRect.left + loserRect.width / 2;
    const lY = loserRect.top + loserRect.height / 2;

    // Create flying Smash clone of the Winner Avatar
    const smashClone = winnerAvatarElem.cloneNode(true);
    smashClone.classList.add('smash-flying-coin');
    smashClone.style.left = `${wX - winnerRect.width / 2}px`;
    smashClone.style.top = `${wY - winnerRect.height / 2}px`;
    document.body.appendChild(smashClone);

    // Hide original loser avatar temporarily during shatter
    loserAvatarElem.style.opacity = '0';

    // Animate Winner Smash motion towards Loser position
    const deltaX = lX - wX;
    const deltaY = lY - wY;

    // Force reflow
    smashClone.getBoundingClientRect();

    // Keyframe move
    smashClone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.4) rotate(360deg)`;
    smashClone.style.transition = 'transform 0.42s cubic-bezier(0.2, 0.9, 0.3, 1.3)';

    // Trigger shatter on impact
    setTimeout(() => {
      // Create shatter explosion at loser's position
      createShatterParticles(lX, lY, ['#EF4444', '#DC2626', '#991B1B', '#F59E0B', '#1E293B']);

      // Shake match card
      if (matchCardElem) triggerCardShake(matchCardElem);

      // Add shockwave ring over impact site
      createShockwave(lX, lY);

      // Add victory floating badge above match card
      if (matchCardElem) showVictoryBadge(matchCardElem);

      // Remove flying clone smoothly
      smashClone.style.opacity = '0';
      smashClone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.0)`;
      setTimeout(() => {
        smashClone.remove();
        if (loserAvatarElem) {
          loserAvatarElem.style.transition = 'opacity 0.5s ease';
          loserAvatarElem.style.opacity = '';
        }
      }, 300);
    }, 420);
  }

  function triggerCardShake(cardElem) {
    cardElem.classList.add('match-card-shake');
    setTimeout(() => {
      cardElem.classList.remove('match-card-shake');
    }, 600);
  }

  function createShockwave(x, y) {
    const ring = document.createElement('div');
    ring.className = 'smash-shockwave';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 600);
  }

  function showVictoryBadge(cardElem) {
    const cardRect = cardElem.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'victory-smash-banner';
    badge.innerHTML = '⚡ VICTORY!';
    badge.style.left = `${cardRect.left + cardRect.width / 2}px`;
    badge.style.top = `${cardRect.top - 20}px`;
    document.body.appendChild(badge);

    setTimeout(() => {
      badge.style.opacity = '0';
      badge.style.transform = 'translate(-50%, -25px) scale(0.9)';
      badge.style.transition = 'all 0.4s ease';
      setTimeout(() => badge.remove(), 400);
    }, 1400);
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
