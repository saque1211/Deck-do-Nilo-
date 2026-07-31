/* ============================================================
   Deck do Nilo — 3D Grill Stage (realistic cut)
   A realistic cut of meat that sears as you scroll and is
   sliced at the "ponto supremo".
   Exposes: window.Grill.setProgress(p 0..1), Grill.resize()
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('grill3d');
  const stageEl = document.querySelector('.stage');
  if (!canvas) return;

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
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  // tiny coherent value noise (3D) for surface sculpting
  function hash3(i, j, k) { let h = (i * 374761393 + j * 668265263 + k * 2147483647) >>> 0; h = (h ^ (h >>> 13)) * 1274126177 >>> 0; return (h & 0xffff) / 0xffff; }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
      l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
      w) * 2 - 1;
  }

  /* ---------- Renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 3.3, 6.6);

  /* ---------- Environment (warm reflections) ---------- */
  (function buildEnv() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#241408'); g.addColorStop(0.6, '#3a1c0c'); g.addColorStop(1, '#5a2a0e');
    x.fillStyle = g; x.fillRect(0, 0, 256, 128);
    const hot = x.createRadialGradient(128, 118, 4, 128, 118, 90);
    hot.addColorStop(0, '#ff9a44'); hot.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = hot; x.fillRect(0, 40, 256, 88);
    const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env; pmrem.dispose(); tex.dispose();
  })();

  /* ---------- Lights ---------- */
  scene.add(new THREE.AmbientLight(0x2a1608, 0.7));
  const key = new THREE.SpotLight(0xfff1de, 55, 26, Math.PI / 5, 0.5, 1.4);
  key.position.set(3.5, 8.5, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a2e, 1.2);
  rim.position.set(-4, 2, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd8a8, 0.35);
  fill.position.set(0, 3, 7); scene.add(fill);
  const fireLight = new THREE.PointLight(0xff5a1e, 0, 12, 2);
  fireLight.position.set(0, -0.5, 0.4); scene.add(fireLight);

  /* ---------- Canvas helpers ---------- */
  const mkC = (s) => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };

  const spriteTex = (() => {
    const c = mkC(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  /* ---------- Stable random detail for textures ---------- */
  const TEX = 512;
  const fibers = (() => { const r = rng(11); const a = []; for (let i = 0; i < 190; i++) a.push({ y: r() * TEX, amp: 4 + r() * 14, ph: r() * 6.28, fr: 0.006 + r() * 0.01, w: 0.6 + r() * 1.4, sh: (r() - 0.5) }); return a; })();
  const veins = (() => { const r = rng(29); const a = []; for (let i = 0; i < 26; i++) { const pts = []; let x = r() * TEX, y = r() * TEX; const steps = 6 + (r() * 8 | 0); let ang = r() * 6.28; for (let s = 0; s < steps; s++) { ang += (r() - 0.5) * 0.9; x += Math.cos(ang) * (10 + r() * 22); y += Math.sin(ang) * (10 + r() * 22); pts.push([x, y]); } a.push({ pts, w: 0.8 + r() * 2.2 }); } return a; })();
  const flecks = (() => { const r = rng(43); const a = []; for (let i = 0; i < 140; i++) a.push([r() * TEX, r() * TEX, r() * 5 + 1]); return a; })();
  const sheens = (() => { const r = rng(61); const a = []; for (let i = 0; i < 22; i++) a.push([r() * TEX, r() * TEX * 0.7 + TEX * 0.15, r() * 30 + 12]); return a; })();

  /* ---------- Albedo (cooking baked in) ---------- */
  const albCanvas = mkC(TEX), albCtx = albCanvas.getContext('2d');
  const albTex = new THREE.CanvasTexture(albCanvas);
  albTex.colorSpace = THREE.SRGBColorSpace;
  albTex.wrapS = albTex.wrapT = THREE.ClampToEdgeWrapping;
  albTex.repeat.set(0.30, 0.30); albTex.offset.set(0.5, 0.5); albTex.anisotropy = 4;

  const RAW = [168, 58, 50], COOKED_MUL = [116, 72, 46], CHAR_MUL = [58, 36, 24];
  const FAT_RAW = [240, 228, 202], FAT_DONE = [176, 120, 60];

  function drawAlbedo(cook) {
    const ctx = albCtx, S = TEX;
    ctx.globalCompositeOperation = 'source-over';
    // base raw meat with vertical tone gradient
    const base = ctx.createLinearGradient(0, 0, 0, S);
    base.addColorStop(0, css([RAW[0] + 14, RAW[1] + 10, RAW[2] + 8]));
    base.addColorStop(1, css([RAW[0] - 20, RAW[1] - 12, RAW[2] - 10]));
    ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);

    // muscle fibers (grain runs across X)
    ctx.lineCap = 'round';
    for (const f of fibers) {
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) { const y = f.y + Math.sin(x * f.fr + f.ph) * f.amp + f.sh * x * 0.02; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      const tint = f.sh > 0 ? 40 : -30;
      ctx.strokeStyle = `rgba(${clamp(RAW[0] + tint, 60, 210)|0},${clamp(RAW[1] + tint * 0.5, 20, 120)|0},${clamp(RAW[2] + tint * 0.4, 20, 110)|0},0.16)`;
      ctx.lineWidth = f.w; ctx.stroke();
    }
    // marbling veins (fat) — fade as it cooks
    ctx.save(); ctx.shadowColor = 'rgba(235,222,196,.5)'; ctx.shadowBlur = 3;
    for (const v of veins) {
      ctx.beginPath(); ctx.moveTo(v.pts[0][0], v.pts[0][1]);
      for (let i = 1; i < v.pts.length; i++) ctx.lineTo(v.pts[i][0], v.pts[i][1]);
      ctx.strokeStyle = `rgba(238,226,202,${0.5 * (1 - cook * 0.5)})`; ctx.lineWidth = v.w; ctx.stroke();
    }
    ctx.restore();

    // crust browning (multiply darkening toward brown)
    const crust = smooth(0.08, 0.82, cook);
    if (crust > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      const bm = lerpC([255, 255, 255], COOKED_MUL, crust);
      const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.15, S / 2, S / 2, S * 0.62);
      vg.addColorStop(0, `rgba(${bm[0]|0},${bm[1]|0},${bm[2]|0},${crust * 0.85})`);
      vg.addColorStop(1, `rgba(${CHAR_MUL[0]},${CHAR_MUL[1]},${CHAR_MUL[2]},${crust})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, S, S);
    }
    // grill marks (multiply)
    const gm = smooth(0.2, 0.66, cook) * 0.7;
    if (gm > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(-Math.PI / 5); ctx.translate(-S / 2, -S / 2);
      ctx.strokeStyle = `rgba(46,24,12,${gm})`; ctx.lineWidth = S / 24;
      for (let i = -S; i < S * 2; i += S / 6) { ctx.beginPath(); ctx.moveTo(i, -S); ctx.lineTo(i, S * 2); ctx.stroke(); }
      ctx.restore();
    }
    // char flecks
    const ch = smooth(0.72, 1, cook);
    if (ch > 0.01) { ctx.globalCompositeOperation = 'multiply'; for (const f of flecks) { ctx.fillStyle = `rgba(30,16,10,${ch * 0.5})`; ctx.beginPath(); ctx.arc(f[0], f[1], f[2], 0, 7); ctx.fill(); } }

    // fat cap band along top
    ctx.globalCompositeOperation = 'source-over';
    const fat = lerpC(FAT_RAW, FAT_DONE, cook * 0.9);
    const grd = ctx.createLinearGradient(0, 0, 0, S * 0.2);
    grd.addColorStop(0, css(fat)); grd.addColorStop(0.7, css(fat)); grd.addColorStop(1, `rgba(${fat[0]|0},${fat[1]|0},${fat[2]|0},0)`);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S * 0.2);
    // fat texture
    ctx.strokeStyle = `rgba(150,110,70,${0.25 + cook * 0.2})`; ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) { const y = (i / 30) * S * 0.18; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 3); ctx.stroke(); }

    // wet sheen highlights
    ctx.globalCompositeOperation = 'screen';
    const wet = 0.1 + smooth(0.15, 0.6, cook) * 0.25;
    for (const s of sheens) { const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], s[2]); g.addColorStop(0, `rgba(255,225,180,${wet})`); g.addColorStop(1, 'rgba(255,225,180,0)'); ctx.fillStyle = g; ctx.fillRect(s[0] - s[2], s[1] - s[2], s[2] * 2, s[2] * 2); }
    ctx.globalCompositeOperation = 'source-over';
    albTex.needsUpdate = true;
  }
  drawAlbedo(0);

  /* ---------- Normal map (surface relief, baked once) ---------- */
  const normalTex = (() => {
    const S = TEX, h = mkC(S), hc = h.getContext('2d');
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, S, S);
    // fibers as grooves
    hc.lineCap = 'round';
    for (const f of fibers) {
      hc.beginPath();
      for (let x = 0; x <= S; x += 8) { const y = f.y + Math.sin(x * f.fr + f.ph) * f.amp + f.sh * x * 0.02; x === 0 ? hc.moveTo(x, y) : hc.lineTo(x, y); }
      hc.strokeStyle = f.sh > 0 ? 'rgba(150,150,150,0.5)' : 'rgba(70,70,70,0.5)'; hc.lineWidth = f.w * 1.4; hc.stroke();
    }
    // veins as raised ridges
    for (const v of veins) { hc.beginPath(); hc.moveTo(v.pts[0][0], v.pts[0][1]); for (let i = 1; i < v.pts.length; i++) hc.lineTo(v.pts[i][0], v.pts[i][1]); hc.strokeStyle = 'rgba(200,200,200,0.5)'; hc.lineWidth = v.w * 1.5; hc.stroke(); }
    // random lumps
    const r = rng(77); for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, rad = r() * 40 + 12; const g = hc.createRadialGradient(x, y, 0, x, y, rad); const up = r() > 0.5; g.addColorStop(0, up ? 'rgba(190,190,190,0.4)' : 'rgba(80,80,80,0.4)'); g.addColorStop(1, 'rgba(128,128,128,0)'); hc.fillStyle = g; hc.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    // fat cap raised
    hc.fillStyle = 'rgba(175,175,175,0.5)'; hc.fillRect(0, 0, S, S * 0.16);

    // sobel -> normal
    const src = hc.getImageData(0, 0, S, S).data;
    const out = mkC(S), oc = out.getContext('2d'), dst = oc.createImageData(S, S), d = dst.data;
    const H = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
    const str = 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * str, dy = (H(x, y - 1) - H(x, y + 1)) * str;
      const len = Math.hypot(dx, dy, 1); const i = (y * S + x) * 4;
      d[i] = (dx / len * 0.5 + 0.5) * 255; d[i + 1] = (dy / len * 0.5 + 0.5) * 255; d[i + 2] = (1 / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    oc.putImageData(dst, 0, 0);
    const t = new THREE.CanvasTexture(out); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(0.30, 0.30); t.offset.set(0.5, 0.5);
    return t;
  })();

  /* ---------- Interior cross-section ---------- */
  const interiorTex = (() => {
    const S = 256, c = mkC(S), ctx = c.getContext('2d');
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    ctx.fillStyle = '#3a1c12'; ctx.fillRect(0, 0, S, S);
    rr(S * 0.05, S * 0.05, S * 0.9, S * 0.9, 26); ctx.fillStyle = '#7c3527'; ctx.fill();
    const g = ctx.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S * 0.44);
    g.addColorStop(0, '#d76d63'); g.addColorStop(0.7, '#c4574a'); g.addColorStop(1, '#9e4536');
    rr(S * 0.13, S * 0.13, S * 0.74, S * 0.74, 20); ctx.fillStyle = g; ctx.fill();
    const r = rng(5); ctx.lineCap = 'round';
    for (let i = 0; i < 30; i++) { ctx.strokeStyle = `rgba(240,214,198,${0.14 + r() * 0.12})`; ctx.lineWidth = r() * 2 + 0.6; const x = S * 0.2 + r() * S * 0.6, y = S * 0.2 + r() * S * 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 46, y + (r() - 0.5) * 46); ctx.stroke(); }
    ctx.fillStyle = 'rgba(245,235,210,0.9)'; ctx.fillRect(0, 0, S, S * 0.1); // fat edge
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  /* ---------- Grill grates + coals ---------- */
  const grill = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({ color: 0x14120e, metalness: 0.9, roughness: 0.4, envMapIntensity: 0.6 });
  for (let i = -3; i <= 3; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5.2, 18), barMat); bar.rotation.z = Math.PI / 2; bar.position.set(0, -0.62, i * 0.42); grill.add(bar); }
  const coalsTex = (() => {
    const S = 256, c = mkC(S), ctx = c.getContext('2d'); ctx.fillStyle = '#180903'; ctx.fillRect(0, 0, S, S);
    const r = rng(99); for (let i = 0; i < 70; i++) { const x = r() * S, y = r() * S, rad = r() * 26 + 6; const g = ctx.createRadialGradient(x, y, 0, x, y, rad); const h = 18 + r() * 28; g.addColorStop(0, `hsl(${h},100%,${55 + r() * 15}%)`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const coals = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 4.4), new THREE.MeshStandardMaterial({ color: 0x0f0500, emissive: 0xff5a1e, emissiveMap: coalsTex, emissiveIntensity: 0, roughness: 1 }));
  coals.rotation.x = -Math.PI / 2; coals.position.y = -0.8; grill.add(coals);
  scene.add(grill);

  /* ---------- The steak (two sculpted halves + interior) ---------- */
  function halfShape(side) {
    const s = new THREE.Shape(), S = side;
    s.moveTo(0, 0.92);
    s.quadraticCurveTo(-0.4 * S, 1.06, -1.02 * S, 0.82);
    s.quadraticCurveTo(-1.58 * S, 0.56, -1.52 * S, 0.02);
    s.quadraticCurveTo(-1.46 * S, -0.54, -0.9 * S, -0.86);
    s.quadraticCurveTo(-0.4 * S, -1.05, 0, -0.9);
    s.lineTo(0, 0.92);
    return s;
  }
  const exOpts = { depth: 0.44, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16, bevelSegments: 4, steps: 2, curveSegments: 26 };

  const meatMat = new THREE.MeshPhysicalMaterial({
    map: albTex, normalMap: normalTex, normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.62, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.42,
    emissive: 0xff4d1a, emissiveIntensity: 0, envMapIntensity: 0.55, sheen: 0.3, sheenColor: 0x6a1f12,
  });
  const interiorMat = () => new THREE.MeshPhysicalMaterial({ map: interiorTex, roughness: 0.5, metalness: 0, clearcoat: 0.3, transparent: true, opacity: 0, envMapIntensity: 0.4 });

  function buildHalf(side) {
    const geo = new THREE.ExtrudeGeometry(halfShape(side), exOpts);
    geo.translate(0, 0, -(exOpts.depth) / 2 - exOpts.bevelThickness);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    // organic displacement (skip near the cut plane x≈0)
    const pos = geo.attributes.position, nor = geo.attributes.normal, v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
      const gate = smooth(0.0, 0.18, Math.abs(v.x));
      const d = (noise3(v.x * 2.2, v.y * 2.2, v.z * 2.2) * 0.055 + noise3(v.x * 5, v.y * 5, v.z * 5) * 0.025) * gate;
      v.addScaledVector(n, d);
      if (Math.abs(v.x) < 0.012) v.x = 0; // keep cut flush
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true; geo.computeVertexNormals();

    const half = new THREE.Group();
    half.add(new THREE.Mesh(geo, meatMat));
    const slice = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.78), interiorMat());
    slice.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    slice.position.x = side < 0 ? -0.02 : 0.02;
    half.add(slice); half.userData.slice = slice;
    return half;
  }

  const steak = new THREE.Group();
  const leftHalf = buildHalf(-1), rightHalf = buildHalf(1);
  steak.add(leftHalf, rightHalf); steak.position.y = 0.04; scene.add(steak);

  /* ---------- Knife ---------- */
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.62, 2.4), new THREE.MeshStandardMaterial({ color: 0xdbe1e6, metalness: 1, roughness: 0.15, envMapIntensity: 1 }));
  blade.position.y = 0.31;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.17, 0.95), new THREE.MeshStandardMaterial({ color: 0x281910, metalness: 0.2, roughness: 0.7 }));
  handle.position.set(0, 0.64, 1.55);
  knife.add(blade, handle); knife.position.set(0, 3, 0); knife.visible = false; scene.add(knife);

  /* ---------- Particles ---------- */
  function makeParticles(count, colorFn, opts) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), col = new Float32Array(count * 3), data = [];
    const spawn = (i, init) => { const a = Math.random() * 6.28, rad = Math.random() * opts.spread; const d = { x: Math.cos(a) * rad, y: opts.y0 + (init ? Math.random() * opts.rise : 0), z: Math.sin(a) * rad * 0.7, vy: opts.vy * (0.6 + Math.random() * 0.8), vx: (Math.random() - 0.5) * opts.drift, life: init ? Math.random() : 0, max: opts.life * (0.7 + Math.random() * 0.6) }; data[i] = d; pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z; const c = colorFn(); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; };
    for (let i = 0; i < count; i++) spawn(i, true);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: opts.size, map: spriteTex, vertexColors: true, transparent: true, depthWrite: false, blending: opts.blending, opacity: 0 });
    const points = new THREE.Points(g, mat); points.userData = { data, pos, spawn, count, opts }; return points;
  }
  const smoke = makeParticles(isMobile ? 50 : 110, () => [0.72, 0.68, 0.62], { spread: 1.2, y0: 0.28, rise: 2.4, vy: 0.6, vx: 0, drift: 0.5, life: 3.2, size: 1.6, blending: THREE.NormalBlending });
  const embers = makeParticles(isMobile ? 40 : 90, () => { const h = Math.random(); return [1, 0.45 + h * 0.35, 0.1 + h * 0.15]; }, { spread: 1.8, y0: -0.7, rise: 1.7, vy: 0.9, vx: 0, drift: 0.4, life: 2.2, size: 0.12, blending: THREE.AdditiveBlending });
  scene.add(smoke, embers);
  function stepParticles(pts, dt, intensity) { const { data, pos, spawn, count, opts } = pts.userData; for (let i = 0; i < count; i++) { const d = data[i]; d.life += dt; d.y += d.vy * dt; d.x += (d.vx + Math.sin(d.y * 1.5 + i) * 0.1) * dt; if (d.life > d.max || d.y > opts.y0 + opts.rise) spawn(i, false); pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z; } pts.geometry.attributes.position.needsUpdate = true; pts.material.opacity = intensity; }

  /* ---------- State + loop ---------- */
  let target = 0, current = 0, lastBucket = -1;
  window.Grill = { setProgress(p) { target = clamp(p, 0, 1); }, resize() { resize(); } };

  function resize() { const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock(); let running = true, spin = 0;
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    current += (target - current) * Math.min(1, dt * 6);
    const p = current;

    const cook = clamp(p / 0.82, 0, 1);
    const bucket = Math.round(cook / 0.03);
    if (bucket !== lastBucket) { drawAlbedo(cook); lastBucket = bucket; }

    const sear = smooth(0.05, 0.4, p) * (1 - smooth(0.82, 1, p) * 0.5);
    const flick = 0.75 + Math.sin(performance.now() * 0.02) * 0.15 + Math.sin(performance.now() * 0.011) * 0.1;
    fireLight.intensity = (2 + sear * 9) * flick;
    coals.material.emissiveIntensity = (0.2 + sear * 1.3) * flick;
    meatMat.emissiveIntensity = sear * 0.16 * flick;
    meatMat.roughness = lerp(0.7, 0.5, smooth(0.1, 0.6, cook));

    spin += dt * (0.5 * (1 - smooth(0.7, 1, p)));
    steak.rotation.y = Math.sin(spin) * 0.5 + spin * 0.15;
    coalsTex.offset.x += dt * 0.03;

    const camY = p < 0.82 ? lerp(3.4, 2.3, smooth(0, 0.82, p)) : lerp(2.3, 2.9, smooth(0.82, 1, p));
    const camZ = p < 0.82 ? lerp(6.8, 5.7, smooth(0, 0.82, p)) : lerp(5.7, 6.2, smooth(0.82, 1, p));
    camera.position.x = Math.sin(p * 0.6) * 0.5;
    camera.position.y += (camY - camera.position.y) * Math.min(1, dt * 4);
    camera.position.z += (camZ - camera.position.z) * Math.min(1, dt * 4);
    camera.lookAt(0, 0.05, 0);

    const cut = smooth(0.8, 0.96, p);
    leftHalf.position.x = -cut * 0.98; rightHalf.position.x = cut * 0.98;
    leftHalf.position.z = rightHalf.position.z = cut * 0.16;
    leftHalf.rotation.y = -cut * 0.42; rightHalf.rotation.y = cut * 0.42;
    leftHalf.userData.slice.material.opacity = cut; rightHalf.userData.slice.material.opacity = cut;

    knife.visible = p > 0.6 && p < 0.98;
    if (knife.visible) { const app = smooth(0.6, 0.8, p), dip = smooth(0.78, 0.85, p) * (1 - smooth(0.85, 0.95, p)), lift = smooth(0.9, 0.98, p); knife.position.y = lerp(3, 0.15, app) - dip * 0.2 + lift * 3.2; knife.position.x = Math.sin(p * 40) * 0.02 * (1 - lift); }

    stepParticles(smoke, dt, reduced ? 0 : sear * 0.5);
    stepParticles(embers, dt, reduced ? 0.1 : (0.25 + sear * 0.5));

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  resize(); frame();
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) { clock.getDelta(); frame(); } });
})();
