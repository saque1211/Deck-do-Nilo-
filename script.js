/* Deck do Nilo — interactions */
(function () {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Year --- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* --- Navbar scroll state --- */
  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (window.scrollY > 40) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* --- Mobile menu --- */
  const burger = document.getElementById('burger');
  if (burger) {
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('.nav__links a').forEach((a) =>
      a.addEventListener('click', () => {
        nav.classList.remove('is-open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      })
    );
  }

  /* --- 3D grill stage: scroll progress, imagination words & doneness UI --- */
  const stage = document.querySelector('.stage');
  const imagination = document.getElementById('imagination');
  const meterFill = document.getElementById('meterFill');
  const stageCta = document.getElementById('stageCta');
  const stageScroll = document.getElementById('stageScroll');

  if (stage) {
    // Floating phrases that materialize like imagination as you scroll.
    // t0..t1 = scroll window; x/y = viewport position (%); s = size scale; k = kind
    const words = [
      { tx: 'Imagine…',                 x: 22, y: 24, t0: 0.01, t1: 0.11, s: 1.4, k: 'soft' },
      { tx: 'A melhor carne do Brasil', x: 34, y: 44, t0: 0.05, t1: 0.20, s: 1.0, k: 'hero' },
      { tx: 'Angus certificado',        x: 62, y: 24, t0: 0.15, t1: 0.30, s: 1.0, k: 'tag' },
      { tx: 'Marmoreio perfeito',       x: 34, y: 66, t0: 0.22, t1: 0.36, s: 1.0, k: 'tag' },
      { tx: 'Wagyu que derrete',        x: 52, y: 58, t0: 0.32, t1: 0.47, s: 0.95, k: 'hero' },
      { tx: 'Fogo de verdade',          x: 34, y: 28, t0: 0.44, t1: 0.58, s: 1.0, k: 'tag' },
      { tx: 'Selada na parrilla',       x: 60, y: 40, t0: 0.54, t1: 0.66, s: 1.0, k: 'tag' },
      { tx: 'Suculência pura',          x: 36, y: 64, t0: 0.62, t1: 0.75, s: 0.95, k: 'hero' },
      { tx: 'Aroma de brasa',           x: 63, y: 62, t0: 0.70, t1: 0.82, s: 1.0, k: 'tag' },
      { tx: 'Ponto supremo',            x: 50, y: 42, t0: 0.85, t1: 1.01, s: 1.0, k: 'supreme' },
    ];

    const els = words.map((w) => {
      const el = document.createElement('div');
      el.className = 'imag-word imag-word--' + w.k;
      el.textContent = w.tx;
      el.style.left = w.x + '%';
      el.style.top = w.y + '%';
      el.style.setProperty('--s', w.s);
      imagination.appendChild(el);
      return el;
    });

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = stage.getBoundingClientRect();
      const total = stage.offsetHeight - window.innerHeight;
      const p = total > 0 ? clamp(-rect.top / total, 0, 1) : 0;

      if (window.Grill) window.Grill.setProgress(p);
      if (meterFill) meterFill.style.width = (p * 100).toFixed(1) + '%';

      // fade each phrase in/out within its scroll window
      for (let i = 0; i < words.length; i++) {
        const w = words[i], el = els[i];
        let o = 0, drift = 30;
        if (p >= w.t0 && p <= w.t1) {
          const local = (p - w.t0) / (w.t1 - w.t0);          // 0..1 across window
          o = Math.sin(local * Math.PI);                     // fade in then out
          o = Math.min(1, o * 1.6);
          drift = (0.5 - local) * 60;                         // rise as it passes
        }
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translate(-50%,-50%) translateY(${drift.toFixed(1)}px) scale(${(0.9 + o * 0.12).toFixed(3)})`;
      }

      if (stageCta) stageCta.classList.toggle('is-visible', p >= 0.86);
      if (stageScroll) stageScroll.style.opacity = p > 0.05 ? '0' : '1';
    };

    const onStageScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onStageScroll, { passive: true });
    window.addEventListener('resize', () => { if (window.Grill) window.Grill.resize(); update(); });
    update();
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* --- Scroll reveal --- */
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !prefersReduced) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* --- Ember particles --- */
  const canvas = document.getElementById('embers');
  if (canvas && !prefersReduced) {
    const ctx = canvas.getContext('2d');
    let w, h, embers, raf;
    const COUNT = () => Math.min(70, Math.floor(window.innerWidth / 22));

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function spark() {
      return {
        x: Math.random() * w,
        y: h + Math.random() * h,
        r: Math.random() * 2.2 + 0.6,
        vy: Math.random() * 0.9 + 0.35,
        vx: (Math.random() - 0.5) * 0.4,
        life: Math.random(),
        hue: 18 + Math.random() * 26,
      };
    }

    function init() {
      resize();
      embers = Array.from({ length: COUNT() }, spark);
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (const p of embers) {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(p.y * 0.01) * 0.3;
        p.life += 0.004;
        const alpha = Math.max(0, 0.9 - p.life) * (0.5 + Math.sin(p.life * 10) * 0.2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 55%, ${alpha})`;
        ctx.fill();
        if (p.y < -10 || p.life > 1.4) Object.assign(p, spark());
      }
      raf = requestAnimationFrame(tick);
    }

    init();
    tick();
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      init();
      tick();
    });

    // pause when tab hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else tick();
    });
  }
})();
