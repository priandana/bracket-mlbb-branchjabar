// =====================================================
// COIN SHATTER & CINEMATIC VICTORY SMASH ENGINE — coin-shatter.js
// Dynamic canvas particle physics, Indonesian female announcer & speech FX
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
        `${cleanName}, menang!`,
        `Selamat kepada ${cleanName}!`,
        `${cleanName} meraih kemenangan!`,
        `Kemenangan mutlak untuk ${cleanName}!`
      ];
      const text = phrases[Math.floor(Math.random() * phrases.length)];
      const utterance = new SpeechSynthesisUtterance(text);

      utterance.rate = 1.0;
      utterance.pitch = 1.5; // Distinct high female voice pitch
      utterance.volume = 1.0;
      utterance.lang = 'id-ID';

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const maleKeywords = ['andika', 'ardi', 'david', 'mark', 'george', 'male', 'guy', 'man', 'stefan'];
        const femaleKeywords = ['gadis', 'winda', 'woni', 'zira', 'susan', 'aria', 'jenny', 'google', 'female', 'woman', 'girl', 'natural'];

        const isMale = (v) => maleKeywords.some(m => v.name.toLowerCase().includes(m));
        const isFemale = (v) => femaleKeywords.some(f => v.name.toLowerCase().includes(f));

        // 1. Indonesian Female Voice
        let selectedVoice = voices.find(v => 
          v.lang && (v.lang.toLowerCase().includes('id') || v.lang.toLowerCase().includes('ind')) &&
          !isMale(v) && isFemale(v)
        );

        // 2. Any Indonesian Non-Male Voice
        if (!selectedVoice) {
          selectedVoice = voices.find(v => 
            v.lang && (v.lang.toLowerCase().includes('id') || v.lang.toLowerCase().includes('ind')) &&
            !isMale(v)
          );
        }

        // 3. Any Female Voice
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

  function triggerSmash(containerElem, winnerAvatarElem, loserAvatarElem, winnerTeamName = '') {
    if (!canvas) initCanvas();
    playImpactSFX();
    speakVictory(winnerTeamName);

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

    const smashClone = winnerAvatarElem.cloneNode(true);
    smashClone.classList.add('smash-flying-coin');
    smashClone.style.left = `${wX - winnerRect.width / 2}px`;
    smashClone.style.top = `${wY - winnerRect.height / 2}px`;
    smashClone.style.width = `${winnerRect.width}px`;
    smashClone.style.height = `${winnerRect.height}px`;
    document.body.appendChild(smashClone);

    loserAvatarElem.style.opacity = '0';

    const deltaX = lX - wX;
    const deltaY = lY - wY;

    smashClone.getBoundingClientRect();

    smashClone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.55) rotate(360deg)`;
    smashClone.style.transition = 'transform 0.42s cubic-bezier(0.15, 0.9, 0.25, 1.25)';

    setTimeout(() => {
      createImpactFlash();

      createFissureAndShatterParticles(lX, lY);

      if (containerElem) triggerContainerShake(containerElem);

      createShockwave(lX, lY);

      showVictorySpeechBubble(winnerAvatarElem, winnerTeamName);

      const loserCard = loserAvatarElem.closest('.arena-card');
      if (loserCard) {
        loserCard.classList.add('defeated-smoked-out');
      }

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

  function showVictorySpeechBubble(winnerAvatarElem, teamName) {
    if (!winnerAvatarElem) return;
    const winnerCard = winnerAvatarElem.closest('.arena-card');
    if (!winnerCard) return;

    const existing = winnerCard.querySelector('.victory-speech-bubble');
    if (existing) existing.remove();

    const name = (teamName || 'Tim Pemenang').toUpperCase();
    const callouts = [
      `🔥 ${name} MENANG!`,
      `🏆 VICTORY ${name}!`,
      `⚡ ${name} MENGUASAI!`,
      `👑 ${name} JUARA!`
    ];
    const speechText = callouts[Math.floor(Math.random() * callouts.length)];

    const bubble = document.createElement('div');
    bubble.className = 'victory-speech-bubble';
    bubble.innerHTML = speechText;
    winnerCard.appendChild(bubble);

    setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translate(-50%, -15px) scale(0.9)';
      bubble.style.transition = 'all 0.4s ease';
      setTimeout(() => bubble.remove(), 400);
    }, 2800);
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
