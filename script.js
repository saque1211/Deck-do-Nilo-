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

  /* --- 3D grill stage: scroll progress + doneness UI --- */
  const stage = document.querySelector('.stage');
  const stageWord = document.getElementById('stageWord');
  const stageDesc = document.getElementById('stageDesc');
  const meterFill = document.getElementById('meterFill');
  const stageCta = document.getElementById('stageCta');
  const stageScroll = document.getElementById('stageScroll');

  if (stage) {
    const stages = [
      { t: 0.00, word: 'Cru', desc: 'Um corte nobre, selecionado a dedo. Role a tela para acender a brasa. 🔥' },
      { t: 0.20, word: 'Selando', desc: 'A parrilla recebe a carne. O selo dourado começa a se formar.' },
      { t: 0.45, word: 'No ponto', desc: 'Suco por dentro, crosta por fora. O aroma toma conta do deck.' },
      { t: 0.68, word: 'Quase lá', desc: 'A última virada na brasa antes de ir pra tábua.' },
      { t: 0.84, word: 'Ponto supremo', desc: 'Cortada na hora, rosada por dentro. É assim que se serve no Deck do Nilo.' },
    ];
    let lastIdx = -1;
    let ticking = false;

    const update = () => {
      ticking = false;
      const rect = stage.getBoundingClientRect();
      const total = stage.offsetHeight - window.innerHeight;
      const p = total > 0 ? clamp(-rect.top / total, 0, 1) : 0;

      if (window.Grill) window.Grill.setProgress(p);
      if (meterFill) meterFill.style.width = (p * 100).toFixed(1) + '%';

      let idx = 0;
      for (let i = 0; i < stages.length; i++) if (p >= stages[i].t) idx = i;
      if (idx !== lastIdx) {
        lastIdx = idx;
        if (stageWord) { stageWord.textContent = stages[idx].word; stageWord.classList.remove('is-pop'); void stageWord.offsetWidth; stageWord.classList.add('is-pop'); }
        if (stageDesc) stageDesc.textContent = stages[idx].desc;
        if (stageWord) stageWord.classList.toggle('is-supreme', idx === stages.length - 1);
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
