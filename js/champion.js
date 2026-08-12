// =====================================================
// CHAMPION SCREEN ENGINE — champion.js
// Canvas confetti + cinematic champion overlay
// =====================================================

const ChampionScreen = (() => {
  let _confettiCanvas = null;
  let _confettiCtx = null;
  let _particles = [];
  let _animId = null;
  let _shown = false;

  const COLORS = [
    '#FFD700', '#FFA500', '#FF4500', '#00CFFF',
    '#A855F7', '#10B981', '#F43F5E', '#FBBF24',
    '#38BDF8', '#C084FC', '#FFFFFF'
  ];

  function createParticle() {
    return {
      x: Math.random() * (_confettiCanvas ? _confettiCanvas.width : window.innerWidth),
      y: -20,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: Math.random() * 10 + 5,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
      opacity: 1,
      alpha: Math.random() * 0.4 + 0.6
    };
  }

  function drawParticle(p) {
    _confettiCtx.save();
    _confettiCtx.globalAlpha = p.opacity * p.alpha;
    _confettiCtx.fillStyle = p.color;
    _confettiCtx.translate(p.x, p.y);
    _confettiCtx.rotate((p.rotation * Math.PI) / 180);
    if (p.shape === 'rect') {
      _confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else {
      _confettiCtx.beginPath();
      _confettiCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      _confettiCtx.fill();
    }
    _confettiCtx.restore();
  }

  function animateConfetti() {
    if (!_confettiCtx) return;
    _confettiCtx.clearRect(0, 0, _confettiCanvas.width, _confettiCanvas.height);
    if (_particles.length < 220) {
      for (let i = 0; i < 4; i++) _particles.push(createParticle());
    }
    _particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.rotation += p.rotSpeed;
      if (p.y > _confettiCanvas.height * 0.8) p.opacity -= 0.012;
      drawParticle(p);
    });
    _particles = _particles.filter(p => p.opacity > 0);
    _animId = requestAnimationFrame(animateConfetti);
  }

  function speakChampion(teamName) {
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(
      `Selamat! ${teamName}, menjadi juara turnamen! Congratulation!`
    );
    utter.lang = 'id-ID';
    utter.pitch = 1.5;
    utter.rate = 0.95;
    const maleBL = ['andika', 'ardi', 'david', 'mark', 'george', 'male'];
    const femalePref = ['gadis', 'winda', 'woni', 'zira', 'susan', 'aria', 'google', 'female'];
    const trySpeak = () => {
      const voices = speechSynthesis.getVoices();
      let chosen = null;
      for (const kw of femalePref) {
        chosen = voices.find(v =>
          v.lang.startsWith('id') &&
          !maleBL.some(m => v.name.toLowerCase().includes(m)) &&
          v.name.toLowerCase().includes(kw)
        );
        if (chosen) break;
      }
      if (!chosen) chosen = voices.find(v => v.lang.startsWith('id') && !maleBL.some(m => v.name.toLowerCase().includes(m)));
      if (!chosen) chosen = voices.find(v => v.lang.startsWith('id'));
      if (chosen) utter.voice = chosen;
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
    };
    if (speechSynthesis.getVoices().length > 0) trySpeak();
    else speechSynthesis.onvoiceschanged = trySpeak;
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function resizeCanvas() {
    if (!_confettiCanvas) return;
    _confettiCanvas.width = window.innerWidth;
    _confettiCanvas.height = window.innerHeight;
  }

  function show(teamName, isAdmin) {
    if (_shown) return;
    _shown = true;
    const overlay = document.createElement('div');
    overlay.id = 'champion-screen';
    overlay.innerHTML = `
      <canvas id="champion-confetti"></canvas>
      <div class="champion-screen-inner">
        <div class="champ-trophy-icon">🏆</div>
        <div class="champ-label">JUARA TURNAMEN</div>
        <div class="champ-team-name">${escHtml(teamName)}</div>
        <div class="champ-sub">Selamat kepada tim juara!</div>
        ${isAdmin ? '<button class="champ-close-btn" id="champ-close-btn">✕ Tutup Layar Juara</button>' : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    _confettiCanvas = document.getElementById('champion-confetti');
    _confettiCtx = _confettiCanvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    animateConfetti();
    speakChampion(teamName);
    document.getElementById('champ-close-btn')?.addEventListener('click', hide);
  }

  function hide() {
    const overlay = document.getElementById('champion-screen');
    if (overlay) { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 600); }
    if (_animId) cancelAnimationFrame(_animId);
    _particles = [];
    _shown = false;
  }

  return { show, hide };
})();
