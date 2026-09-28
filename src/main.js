import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = matchMedia("(max-width: 720px)").matches;

/* ---------------- smooth scroll ---------------- */
if (!reduceMotion) {
  const lenis = new Lenis({ lerp: 0.09 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------------- renderer: physically based, filmic ---------------- */
const canvas = document.getElementById("saree");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

// studio environment: gives the zari real reflections and the silk soft fill
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

// warm key light (casts the pleat-on-pleat shadows), cool rim, low fill
const key = new THREE.DirectionalLight("#ffe2b8", 2.6);
key.position.set(3, 4, 5);
key.castShadow = true;
key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -3.5;
key.shadow.camera.right = key.shadow.camera.top = 3.5;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.025;
key.shadow.radius = 4;
scene.add(key);
const rim = new THREE.DirectionalLight("#ffb0a0", 1.6);
rim.position.set(-4, 2, -3);
scene.add(rim);
scene.add(new THREE.HemisphereLight("#fff3e0", "#3a0a13", 0.35));

/* ---------------- woven textures (generated at load) ---------------- */
// Colour map, a roughness/metalness map (G = rough, B = metal: zari is metal)
// and a tiling weave bump map so light rakes across real warp & weft.
const TEX = isMobile ? 1024 : 2048;
const SANDAL = "#dcc08a", MAROON = "#5e0d1c", GOLD = "#c79b45";

function drawSaree(ctx, S, body, border, gold, { pallu = false, grain = true } = {}) {
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, S, S);
  if (grain) {
    // uneven silk yarn: faint streaks of light and dark along the warp
    for (let x = 0; x < S; x += 2) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "255,240,210" : "40,10,10"},${Math.random() * 0.05})`;
      ctx.fillRect(x, 0, 1 + (Math.random() * 2) | 0, S);
    }
  }
  // body motifs: zari buttas, or pallu stripes
  ctx.fillStyle = gold;
  if (pallu) {
    for (let y = 0.22; y < 1; y += 0.09) {
      ctx.fillRect(0, y * S, S, S * 0.018);
      ctx.fillRect(0, (y + 0.03) * S, S, S * 0.005);
    }
  } else {
    const step = S / 9;
    for (let gy = 0; gy < 8; gy++)
      for (let gx = 0; gx < 9; gx++) {
        const cx = (gx + 0.5 + (gy % 2) * 0.5) * step, cy = S * 0.22 + gy * step * 0.9;
        if (cy > S) continue;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(k * Math.PI / 2) * S * 0.006, cy + Math.sin(k * Math.PI / 2) * S * 0.006, S * 0.005, S * 0.0028, k * Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
  }
  // contrast korvai border along the outer edge (top of canvas = outer edge)
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, S, S * 0.2);
  ctx.fillStyle = gold;
  ctx.fillRect(0, S * 0.185, S, S * 0.012);
  ctx.fillRect(0, S * 0.045, S, S * 0.012);
  ctx.fillRect(0, 0, S, S * 0.014);
  // rettai pettu temple spikes
  const n = 14, w = S / n;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    ctx.moveTo(i * w + w * 0.08, S * 0.175);
    ctx.lineTo(i * w + w * 0.5, S * 0.07);
    ctx.lineTo(i * w + w * 0.92, S * 0.175);
  }
  ctx.fill();
  // selvedge
  ctx.fillRect(0, 0, S * 0.01, S);
  ctx.fillRect(S * 0.99, 0, S * 0.01, S);
}

function canvasTex(draw, srgb) {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  draw(c.getContext("2d"), TEX);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

const weave = (() => {
  // plain-weave tile: alternating raised warp/weft threads
  const c = document.createElement("canvas");
  const s = 64;
  c.width = c.height = s;
  const g = c.getContext("2d");
  for (let y = 0; y < s; y += 4)
    for (let x = 0; x < s; x += 4) {
      const warp = ((x + y) / 4) % 2 === 0;
      const grad = warp ? g.createLinearGradient(x, 0, x + 4, 0) : g.createLinearGradient(0, y, 0, y + 4);
      grad.addColorStop(0, "#333"); grad.addColorStop(0.5, "#eee"); grad.addColorStop(1, "#333");
      g.fillStyle = grad;
      g.fillRect(x, y, 4, 4);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(90, 150);
  return t;
})();

function silk(body, border, sheen, opts = {}) {
  const map = canvasTex((g, S) => drawSaree(g, S, body, border, GOLD, opts), true);
  // G: silk 0.55 rough, zari 0.3 · B: zari fully metallic
  const rm = canvasTex((g, S) => drawSaree(g, S, "rgb(0,140,0)", "rgb(0,140,0)", "rgb(0,75,255)", { ...opts, grain: false }), false);
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: rm,
    metalnessMap: rm,
    roughness: 1,
    metalness: 1,
    bumpMap: weave,
    bumpScale: 0.35,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.32,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
  });
}

const matSandal = silk(SANDAL, MAROON, "#fff1cf");
const matMaroon = silk(MAROON, SANDAL, "#b8404c");
const matPallu = silk(MAROON, SANDAL, "#c04a50", { pallu: true });

/* ---------------- cloth panels (deformed on the CPU each frame) ---------------- */
const PANELS = isMobile ? 11 : 15;
const W = 1.25, H = 2.4;
const SEG_X = isMobile ? 18 : 30, SEG_Y = isMobile ? 28 : 48;
const base = new THREE.PlaneGeometry(W, H, SEG_X, SEG_Y);
base.translate(0, H / 2, 0); // pivot at the hand (bottom edge)
const basePos = base.attributes.position.array.slice();

function clothPanel(mat) {
  const geo = base.clone();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  return { pivot, mesh, geo };
}

// silk drape: ripples grow toward the free edge, edge curls, optional peel
function deform(panel, t, wave, phase, peel = 0) {
  const pos = panel.geo.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    const x = basePos[i], y = basePos[i + 1], k = y / H;
    let z = Math.sin(x * 3.2 + t * 1.3 + phase) * 0.05 * wave * k;
    z += Math.sin(y * 4.0 - t * 1.1 + phase) * 0.035 * wave * k;
    z += Math.sin(x * 9.0 + y * 2.0 + phase) * 0.008 * wave * k; // fine crinkle
    z -= k * k * 0.2 * wave;
    z += peel * k * k * 0.9;
    pos[i + 2] = z;
  }
  panel.geo.attributes.position.needsUpdate = true;
  panel.geo.computeVertexNormals();
}

const saree = new THREE.Group();
const pleats = [];
for (let i = 0; i < PANELS; i++) {
  const p = clothPanel(i % 3 === 1 ? matMaroon : matSandal);
  p.pivot.position.z = (i - PANELS / 2) * 0.014;
  p.i = i;
  saree.add(p.pivot);
  pleats.push(p);
}
const pallu = clothPanel(matPallu);
pallu.pivot.position.z = (PANELS / 2) * 0.014 + 0.014;
saree.add(pallu.pivot);

// gold binding ring where the pleats gather
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(0.14, 0.035, 24, 64),
  new THREE.MeshPhysicalMaterial({ color: "#d4a64c", metalness: 1, roughness: 0.28, clearcoat: 0.6 })
);
ring.castShadow = true;
saree.add(ring);
scene.add(saree);

// floating gold dust
const dustN = isMobile ? 250 : 600;
const dustPos = new Float32Array(dustN * 3);
for (let i = 0; i < dustN; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 12;
  dustPos[i * 3 + 1] = (Math.random() - 0.5) * 8;
  dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({ color: GOLD, size: 0.018, transparent: true, opacity: 0.5, depthWrite: false })
);
scene.add(dust);

/* ---------------- scroll + pointer state ---------------- */
// 0–.15 folded bundle turns in 3D · .15–.45 pallu peels · .42–.78 pleats fan open · .78–1 hero turntable
const state = { p: 0 };
const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = (e.clientY / innerHeight) * 2 - 1;
});

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const range = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = THREE.MathUtils.lerp;

const beats = [...document.querySelectorAll(".beat")];
const beatWindows = [[-1, 0, 0.12, 0.2], [0.17, 0.24, 0.38, 0.46], [0.46, 0.54, 0.7, 0.78], [0.8, 0.88, 2, 3]];
const bar = document.getElementById("bar");

ScrollTrigger.create({
  trigger: "#unfold",
  start: "top top",
  end: "bottom bottom",
  scrub: reduceMotion ? true : 0.6,
  onUpdate: (self) => (state.p = self.progress),
});

function updateBeats(p) {
  beats.forEach((el, i) => {
    const [a, b, c, d] = beatWindows[i];
    const o = p < b ? range(p, a, b) : 1 - range(p, c, d);
    el.style.opacity = o;
    el.style.translate = `0 ${(1 - o) * 24}px`;
    el.style.pointerEvents = o > 0.5 ? "auto" : "none";
  });
  bar.style.width = `${p * 100}%`;
}

function updateSaree(p, t) {
  const peel = ease(range(p, 0.15, 0.45));
  const fan = ease(range(p, 0.42, 0.78));
  const reveal = ease(range(p, 0.78, 1));
  pointer.sx += (pointer.x - pointer.sx) * 0.05;
  pointer.sy += (pointer.y - pointer.sy) * 0.05;

  // the bundle turns through space so its depth reads, then rises to face us
  saree.rotation.z = lerp(-Math.PI / 2, -0.05, fan);
  saree.rotation.x = lerp(-0.9 + Math.sin(t * 0.5) * 0.06, -0.18, Math.max(peel * 0.5, fan)) + pointer.sy * 0.18;
  saree.rotation.y = lerp(0.6 + Math.sin(t * 0.4) * 0.25 - peel * 0.5, Math.sin(t * 0.35) * 0.18 + (reveal - 0.5) * 0.5 * reveal, fan) + pointer.sx * 0.35;
  saree.position.y = lerp(0.1 + Math.sin(t * 0.9) * 0.05, -0.75, fan);
  saree.position.x = isMobile ? 0 : lerp(lerp(1.1, 0.8, peel), 1.05, fan);
  saree.scale.setScalar(lerp(1, isMobile ? 0.8 : 0.82, fan));

  // fan: pleats swing around the hand one after another, with accordion zig-zag
  const spread = isMobile ? 1.1 : 1.3;
  pleats.forEach((pl) => {
    const k = pl.i / (PANELS - 1);
    const local = ease(clamp01(fan * 1.4 - (1 - k) * 0.4));
    pl.pivot.rotation.z = (k - 0.5) * 2 * spread * local;
    pl.pivot.rotation.y = (pl.i % 2 ? 1 : -1) * 0.25 * local;
    deform(pl, t, 0.15 + local * 0.9, pl.i * 0.7);
  });

  // pallu lifts off the stack, then settles over the edge of the fan
  pallu.pivot.rotation.z = lerp(0, spread + 0.12, fan);
  pallu.pivot.rotation.x = -peel * 0.5 * (1 - fan) - fan * 0.15;
  deform(pallu, t, 0.3 + peel * 1.1, 2.1, peel * (1 - fan) * 0.8);

  camera.position.set(0, lerp(0.4, 0.3, fan), lerp(7.2, isMobile ? 9.5 : 6.4, peel) + fan * 1.2);
  camera.lookAt(0, lerp(0, 0.2, fan), 0);

  dust.rotation.y = t * 0.02;
  dust.position.y = Math.sin(t * 0.2) * 0.1;
}

/* ---------------- loop ---------------- */
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
let shown = 0;
renderer.setAnimationLoop(() => {
  shown += (state.p - shown) * (reduceMotion ? 1 : 0.12);
  const t = reduceMotion ? 0 : clock.getElapsedTime();
  updateSaree(shown, t);
  updateBeats(shown);
  renderer.render(scene, camera);
});
document.getElementById("loader").classList.add("done");

/* ---------------- collection ---------------- */
const products = [
  ["Sandal Temple Border", "Sandal body · maroon korvai", "#e6cc98", "#6e1325", "Bestseller"],
  ["Maroon Rettai Pettu", "Maroon body · sandal border", "#6e1325", "#e6cc98", "New"],
  ["Sandal Butta Soft Silk", "Zari buttas · maroon pallu", "#ecd6a8", "#7a1a2c", ""],
  ["Maroon Checks", "Kattam weave · gold zari", "#5e0f1f", "#d9b877", ""],
  ["Sandal Mayil Chakram", "Peacock motif pallu", "#dfc28c", "#6b1424", "Limited"],
  ["Maroon Vaira Oosi", "Needle-stripe body", "#741628", "#ead3a4", ""],
  ["Sandal Plain Soft Silk", "Wide zari border", "#f0dcb2", "#5a0f1d", ""],
  ["Maroon Grand Pallu", "Rich pallu · half-fine zari", "#681324", "#e2c68f", "Bestseller"],
];
document.getElementById("grid").innerHTML = products
  .map(
    ([name, desc, body, border, tag]) => `
  <article class="card reveal">
    <div class="swatch" style="--body:${body};--border:${border}">${tag ? `<span class="tag">${tag}</span>` : ""}</div>
    <h3>${name}</h3>
    <div class="meta"><span>${desc}</span></div>
  </article>`
  )
  .join("");

gsap.utils.toArray(".reveal, .head, .craft-copy, .steps li, .visit > *").forEach((el) => {
  gsap.fromTo(
    el,
    { opacity: 0, y: 40 },
    { opacity: 1, y: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } }
  );
});
