/* ============================================================
   Deck do Nilo — Grill Stage (cinematic photo sequence)
   Real steak photos that cook as you scroll: raw → searing →
   no ponto → sliced at the "ponto supremo". Warm ember glow
   flickers over the fire while the frames cross-fade.
   Exposes: window.Grill.setProgress(p 0..1), Grill.resize()
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('grill3d');
  const stageEl = document.querySelector('.stage');
  if (!canvas) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { if (stageEl) stageEl.classList.add('no3d'); window.Grill = { setProgress() {}, resize() {} }; return; }

  /* ---------- Load the cooking sequence ---------- */
  const SRC = [
    'assets/steak-1-raw.jpg',     // Cru
    'assets/steak-2-searing.jpg', // Selando
    'assets/steak-3-done.jpg',    // No ponto
    'assets/steak-4-supreme.jpg', // Supremo (fatiada)
  ];
  const imgs = SRC.map((src) => { const im = new Image(); im.decoding = 'async'; im.src = src; return im; });
  let loaded = 0, failed = 0;
  imgs.forEach((im) => {
    const done = () => { if (loaded + failed === imgs.length && loaded === 0 && stageEl) stageEl.classList.add('no3d'); };
    if (im.complete && im.naturalWidth) { loaded++; done(); return; }
    im.addEventListener('load', () => { loaded++; }, { once: true });
    im.addEventListener('error', () => { failed++; done(); }, { once: true });
  });

  /* ---------- Sizing (device-pixel aware) ---------- */
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);

  /* ---------- Cover-fit draw with zoom + pan (Ken Burns) ---------- */
  function cover(img, scale, px, py, alpha) {
    if (!img.naturalWidth) return;
    const ir = img.naturalWidth / img.naturalHeight, cr = W / H;
    let dw, dh;
    if (ir > cr) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
    dw *= scale; dh *= scale;
    const exX = dw - W, exY = dh - H;
    const dx = -exX / 2 + px * exX * 0.5;
    const dy = -exY / 2 + py * exY * 0.5;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ---------- Ember glow / heat flicker over the fire ---------- */
  function glow(p, t) {
    // hot while searing, calms once sliced
    const heat = smooth(0.04, 0.42, p) * (1 - smooth(0.82, 1, p) * 0.5);
    if (heat <= 0.01 && p < 0.04) return;
    const flick = reduced ? 0.85 : 0.72 + Math.sin(t * 0.019) * 0.16 + Math.sin(t * 0.037 + 1.3) * 0.1;
    const a = (0.16 + heat * 0.5) * flick;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(W * 0.5, H * 1.02, H * 0.05, W * 0.5, H * 1.02, H * 0.82);
    g.addColorStop(0, `rgba(255,150,54,${a})`);
    g.addColorStop(0.45, `rgba(255,96,26,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // gentle overall warm tone that deepens with cooking
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.15 + smooth(0.1, 0.8, p) * 0.2;
    ctx.fillStyle = '#ff6a22';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ---------- State + render loop ---------- */
  let target = 0, current = 0;
  window.Grill = { setProgress(p) { target = clamp(p, 0, 1); }, resize() { resize(); } };

  let running = true;
  function frame() {
    if (!running) return;
    current += (target - current) * 0.12;
    if (Math.abs(target - current) < 0.0002) current = target;
    const p = current;
    const t = performance.now();

    ctx.clearRect(0, 0, W, H);

    // cross-fade across the sequence, holding on each frame between blends
    const N = imgs.length;
    const seg = p * (N - 1);
    const i = Math.min(N - 2, Math.floor(seg));
    const f = smooth(0.22, 0.78, seg - i); // rest then blend

    // cinematic push-in + slow upward drift
    const baseScale = 1.07 + p * 0.11;
    const px = Math.sin(p * 3.1) * 0.18;
    const py = lerp(0.32, -0.22, p);

    cover(imgs[i], baseScale, px, py, 1);
    if (f > 0.001) cover(imgs[i + 1], baseScale, px, py, f);
    ctx.globalAlpha = 1;

    glow(p, t);

    requestAnimationFrame(frame);
  }

  resize();
  // keep drawing a couple of frames even before all images decode
  (function warm() { if (loaded === 0 && failed === 0) { requestAnimationFrame(warm); } })();
  frame();

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) frame();
  });
})();
