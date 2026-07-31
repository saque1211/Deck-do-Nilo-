/* ============================================================
   Deck do Nilo — 3D Grill Stage
   A cut of meat that sears as you scroll and is sliced at the
   "ponto supremo" at the bottom of the scroll.
   Exposes: window.Grill.setProgress(p 0..1), Grill.resize()
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('grill3d');
  const stageEl = document.querySelector('.stage');
  if (!canvas) return;

  // Graceful fallback if Three.js failed to load
  if (!window.THREE) {
    if (stageEl) stageEl.classList.add('no3d');
    window.Grill = { setProgress() {}, resize() {} };
    return;
  }

  const THREE = window.THREE;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 720px)').matches;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const lerpC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  // deterministic RNG so baked textures don't flicker on redraw
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------- Renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 3.3, 6.6);

  /* ---------- Lights ---------- */
  scene.add(new THREE.AmbientLight(0x2a1608, 0.9));

  const key = new THREE.SpotLight(0xfff0dd, 40, 24, Math.PI / 5, 0.5, 1.4);
  key.position.set(3.5, 8, 5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xff6a2a, 1.1);
  rim.position.set(-4, 2, -5);
  scene.add(rim);

  const fireLight = new THREE.PointLight(0xff5a1e, 0, 12, 2);
  fireLight.position.set(0, -0.5, 0.4);
  scene.add(fireLight);

  /* ---------- Canvas-texture helpers ---------- */
  function makeCanvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

  // Soft round sprite for particles
  const spriteTex = (() => {
    const c = makeCanvas(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); return t;
  })();

  /* ---------- Crust texture (bakes the cooking) ---------- */
  const CRUST = 512;
  const crustCanvas = makeCanvas(CRUST);
  const crustCtx = crustCanvas.getContext('2d');
  const crustTex = new THREE.CanvasTexture(crustCanvas);
  crustTex.colorSpace = THREE.SRGBColorSpace;
  crustTex.wrapS = crustTex.wrapT = THREE.ClampToEdgeWrapping;
  crustTex.repeat.set(0.30, 0.30);
  crustTex.offset.set(0.5, 0.5);

  // precomputed marbling + char flecks (stable across redraws)
  const marb = (() => { const r = rng(7); const a = []; for (let i = 0; i < 46; i++) a.push([r() * CRUST, r() * CRUST, (r() - 0.5) * 90, (r() - 0.5) * 40, r() * 2 + 1]); return a; })();
  const flecks = (() => { const r = rng(21); const a = []; for (let i = 0; i < 120; i++) a.push([r() * CRUST, r() * CRUST, r() * 5 + 1]); return a; })();

  const RAW = [150, 44, 36], SEAR = [120, 66, 40], CHAR = [66, 40, 26];
  const FAT_RAW = [238, 226, 198], FAT_DONE = [176, 116, 58];

  function drawCrust(cook) {
    const ctx = crustCtx, S = CRUST;
    // base body colour
    let base = cook < 0.6 ? lerpC(RAW, SEAR, cook / 0.6) : lerpC(SEAR, CHAR, (cook - 0.6) / 0.4 * 0.8);
    ctx.fillStyle = css(base); ctx.fillRect(0, 0, S, S);

    // marbling (fat threads) — fade as it cooks
    ctx.lineCap = 'round';
    for (const m of marb) {
      ctx.strokeStyle = `rgba(236,222,196,${0.14 * (1 - cook * 0.55)})`;
      ctx.lineWidth = m[4];
      ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.quadraticCurveTo(m[0] + m[2] * 0.5, m[1] + m[3], m[0] + m[2], m[1] + m[3] * 0.5); ctx.stroke();
    }

    // fat cap band along the top
    const fat = lerpC(FAT_RAW, FAT_DONE, cook);
    const grd = ctx.createLinearGradient(0, 0, 0, S * 0.26);
    grd.addColorStop(0, css(fat)); grd.addColorStop(1, `rgba(${fat[0]|0},${fat[1]|0},${fat[2]|0},0)`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S * 0.26);

    // grill marks — appear with searing
    const gm = smooth(0.16, 0.62, cook) * 0.6;
    if (gm > 0.01) {
      ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-Math.PI / 5); ctx.translate(-S / 2, -S / 2);
      ctx.strokeStyle = `rgba(28,14,8,${gm})`; ctx.lineWidth = S / 26;
      for (let i = -S; i < S * 2; i += S / 6) { ctx.beginPath(); ctx.moveTo(i, -S); ctx.lineTo(i, S * 2); ctx.stroke(); }
      ctx.restore();
      // faint cross-hatch
      ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(Math.PI / 6); ctx.translate(-S / 2, -S / 2);
      ctx.strokeStyle = `rgba(20,10,6,${gm * 0.5})`; ctx.lineWidth = S / 34;
      for (let i = -S; i < S * 2; i += S / 5) { ctx.beginPath(); ctx.moveTo(i, -S); ctx.lineTo(i, S * 2); ctx.stroke(); }
      ctx.restore();
    }

    // char flecks near the finish
    const ch = smooth(0.7, 1, cook);
    if (ch > 0.01) { for (const f of flecks) { ctx.fillStyle = `rgba(24,12,8,${ch * 0.4})`; ctx.beginPath(); ctx.arc(f[0], f[1], f[2], 0, 7); ctx.fill(); } }

    // sheen
    const sh = ctx.createRadialGradient(S * 0.4, S * 0.35, 10, S * 0.4, S * 0.35, S * 0.5);
    sh.addColorStop(0, `rgba(255,200,140,${0.12 + gm * 0.12})`); sh.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, S, S);

    crustTex.needsUpdate = true;
  }
  drawCrust(0);

  /* ---------- Interior cross-section texture (the "supreme" point) ---------- */
  const interiorTex = (() => {
    const S = 256, c = makeCanvas(S), ctx = c.getContext('2d');
    ctx.fillStyle = '#3a1c12'; ctx.fillRect(0, 0, S, S);                 // seared rim
    roundRect(ctx, S * 0.06, S * 0.06, S * 0.88, S * 0.88, 26); ctx.fillStyle = '#7a3326'; ctx.fill(); // cooked band
    const g = ctx.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S * 0.42);
    g.addColorStop(0, '#d16b63'); g.addColorStop(0.7, '#c15749'); g.addColorStop(1, '#9c4436'); // rosy medium centre
    roundRect(ctx, S * 0.14, S * 0.14, S * 0.72, S * 0.72, 20); ctx.fillStyle = g; ctx.fill();
    const r = rng(3);                                                    // marbling
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) { ctx.strokeStyle = `rgba(240,210,195,${0.12 + r() * 0.1})`; ctx.lineWidth = r() * 2 + 0.6; ctx.beginPath(); const x = S * 0.2 + r() * S * 0.6, y = S * 0.2 + r() * S * 0.6; ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 40); ctx.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ---------- Grill grates + coals ---------- */
  const grill = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({ color: 0x15130f, metalness: 0.85, roughness: 0.45 });
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5.2, 16), barMat);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, -0.62, i * 0.42);
    grill.add(bar);
  }
  const coalsTex = (() => {
    const S = 256, c = makeCanvas(S), ctx = c.getContext('2d'); ctx.fillStyle = '#1a0a04'; ctx.fillRect(0, 0, S, S);
    const r = rng(99); for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, rad = r() * 26 + 6; const g = ctx.createRadialGradient(x, y, 0, x, y, rad); const h = 20 + r() * 25; g.addColorStop(0, `hsl(${h},100%,60%)`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const coals = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 4.2), new THREE.MeshStandardMaterial({ color: 0x120600, emissive: 0xff5a1e, emissiveMap: coalsTex, emissiveIntensity: 0, roughness: 1 }));
  coals.rotation.x = -Math.PI / 2; coals.position.y = -0.8; grill.add(coals);
  scene.add(grill);

  /* ---------- The steak (two halves + interior slices) ---------- */
  function halfShape(side) {
    const s = new THREE.Shape(), S = side;
    s.moveTo(0, 0.92);
    s.quadraticCurveTo(-0.4 * S, 1.04, -1.02 * S, 0.8);
    s.quadraticCurveTo(-1.56 * S, 0.54, -1.5 * S, 0.02);
    s.quadraticCurveTo(-1.44 * S, -0.52, -0.88 * S, -0.84);
    s.quadraticCurveTo(-0.4 * S, -1.03, 0, -0.9);
    s.lineTo(0, 0.92);
    return s;
  }
  const exOpts = { depth: 0.46, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 3, steps: 1, curveSegments: 22 };

  const crustMat = new THREE.MeshStandardMaterial({ map: crustTex, roughness: 0.85, metalness: 0.02, emissive: 0xff4d1a, emissiveIntensity: 0 });
  const interiorMat = () => new THREE.MeshStandardMaterial({ map: interiorTex, roughness: 0.55, metalness: 0, transparent: true, opacity: 0 });

  function buildHalf(side) {
    const geo = new THREE.ExtrudeGeometry(halfShape(side), exOpts);
    geo.translate(0, 0, -(exOpts.depth) / 2 - exOpts.bevelThickness / 2);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    const half = new THREE.Group();
    const mesh = new THREE.Mesh(geo, crustMat);
    half.add(mesh);
    // interior slice plane on the cut face (x = 0)
    const slice = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.72), interiorMat());
    slice.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    slice.position.x = side < 0 ? -0.02 : 0.02;
    half.add(slice);
    half.userData.slice = slice;
    return half;
  }

  const steak = new THREE.Group();
  const leftHalf = buildHalf(-1);
  const rightHalf = buildHalf(1);
  steak.add(leftHalf, rightHalf);
  steak.position.y = 0.02;
  scene.add(steak);

  /* ---------- Knife ---------- */
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 2.3), new THREE.MeshStandardMaterial({ color: 0xd7dde2, metalness: 1, roughness: 0.18 }));
  blade.position.y = 0.3;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.9), new THREE.MeshStandardMaterial({ color: 0x2a1a10, metalness: 0.2, roughness: 0.7 }));
  handle.position.set(0, 0.62, 1.5);
  knife.add(blade, handle);
  knife.position.set(0, 3, 0);
  knife.visible = false;
  scene.add(knife);

  /* ---------- Particles ---------- */
  function makeParticles(count, colorFn, opts) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const data = [];
    const spawn = (i, init) => {
      const a = Math.random() * Math.PI * 2, rad = Math.random() * opts.spread;
      const d = { x: Math.cos(a) * rad, y: opts.y0 + (init ? Math.random() * opts.rise : 0), z: Math.sin(a) * rad * 0.7, vy: opts.vy * (0.6 + Math.random() * 0.8), vx: (Math.random() - 0.5) * opts.drift, life: init ? Math.random() : 0, max: opts.life * (0.7 + Math.random() * 0.6) };
      data[i] = d;
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      const c = colorFn(); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    };
    for (let i = 0; i < count; i++) spawn(i, true);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: opts.size, map: spriteTex, vertexColors: true, transparent: true, depthWrite: false, blending: opts.blending, opacity: 0 });
    const points = new THREE.Points(g, mat);
    points.userData = { data, pos, spawn, count, opts };
    return points;
  }

  const smoke = makeParticles(isMobile ? 50 : 110, () => [0.72, 0.68, 0.62], { spread: 1.2, y0: 0.25, rise: 2.2, vy: 0.6, vx: 0, drift: 0.5, life: 3.2, size: 1.5, blending: THREE.NormalBlending });
  const embers = makeParticles(isMobile ? 40 : 90, () => { const h = Math.random(); return [1, 0.45 + h * 0.35, 0.1 + h * 0.15]; }, { spread: 1.7, y0: -0.7, rise: 1.6, vy: 0.9, vx: 0, drift: 0.4, life: 2.2, size: 0.12, blending: THREE.AdditiveBlending });
  scene.add(smoke, embers);

  function stepParticles(pts, dt, intensity) {
    const { data, pos, spawn, count, opts } = pts.userData;
    for (let i = 0; i < count; i++) {
      const d = data[i];
      d.life += dt;
      d.y += d.vy * dt; d.x += (d.vx + Math.sin(d.y * 1.5 + i) * 0.1) * dt;
      if (d.life > d.max || d.y > opts.y0 + opts.rise) spawn(i, false);
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    pts.material.opacity = intensity;
  }

  /* ---------- Progress-driven state ---------- */
  let target = 0, current = 0, lastCookBucket = -1;
  window.Grill = {
    setProgress(p) { target = clamp(p, 0, 1); },
    resize() { resize(); }
  };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  /* ---------- Animation loop ---------- */
  const clock = new THREE.Clock();
  let running = true, spin = 0;

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    current += (target - current) * Math.min(1, dt * 6);   // smooth follow
    const p = current;

    // Cooking amount (done by ~0.82, then it's the cut)
    const cook = clamp(p / 0.82, 0, 1);
    const bucket = Math.round(cook / 0.02);
    if (bucket !== lastCookBucket) { drawCrust(cook); lastCookBucket = bucket; }

    // sear glow / fire ramps up then eases
    const sear = smooth(0.05, 0.4, p) * (1 - smooth(0.82, 1, p) * 0.5);
    const flick = 0.75 + Math.sin(performance.now() * 0.02) * 0.15 + Math.sin(performance.now() * 0.011) * 0.1;
    fireLight.intensity = (2 + sear * 9) * flick;
    coals.material.emissiveIntensity = (0.2 + sear * 1.3) * flick;
    crustMat.emissiveIntensity = sear * 0.28 * flick;
    crustMat.roughness = lerp(0.9, 0.62, smooth(0.1, 0.6, cook));

    // gentle spin while cooking, settle for the cut
    spin += dt * (0.5 * (1 - smooth(0.7, 1, p)));
    steak.rotation.y = Math.sin(spin) * 0.5 + spin * 0.15;

    // coals shimmer
    coalsTex.offset.x += dt * 0.03;

    // camera drama
    const camY = p < 0.82 ? lerp(3.4, 2.3, smooth(0, 0.82, p)) : lerp(2.3, 2.9, smooth(0.82, 1, p));
    const camZ = p < 0.82 ? lerp(6.8, 5.7, smooth(0, 0.82, p)) : lerp(5.7, 6.3, smooth(0.82, 1, p));
    camera.position.x = Math.sin(p * 0.6) * 0.6;
    camera.position.y += (camY - camera.position.y) * Math.min(1, dt * 4);
    camera.position.z += (camZ - camera.position.z) * Math.min(1, dt * 4);
    camera.lookAt(0, 0.05, 0);

    // ---- The cut ----
    const cut = smooth(0.8, 0.96, p);
    leftHalf.position.x = -cut * 0.95;
    rightHalf.position.x = cut * 0.95;
    leftHalf.position.z = rightHalf.position.z = cut * 0.15;
    leftHalf.rotation.y = -cut * 0.4;
    rightHalf.rotation.y = cut * 0.4;
    leftHalf.userData.slice.material.opacity = cut;
    rightHalf.userData.slice.material.opacity = cut;

    // knife: descend + dip through around the cut, then retract
    knife.visible = p > 0.6 && p < 0.98;
    if (knife.visible) {
      const app = smooth(0.6, 0.8, p);       // lower in
      const dip = smooth(0.78, 0.85, p) * (1 - smooth(0.85, 0.95, p)); // quick chop
      const lift = smooth(0.9, 0.98, p);
      knife.position.y = lerp(3, 0.15, app) - dip * 0.2 + lift * 3.2;
      knife.position.x = Math.sin(p * 40) * 0.02 * (1 - lift);
    }

    // particles
    stepParticles(smoke, dt, reduced ? 0 : sear * 0.5);
    stepParticles(embers, dt, reduced ? 0.1 : (0.25 + sear * 0.5));

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  frame();

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); frame(); }
  });
})();
