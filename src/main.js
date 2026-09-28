import * as THREE from "three";
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

/* ---------------- renderer / scene ---------------- */
const canvas = document.getElementById("saree");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

/* ---------------- silk shader ---------------- */
// One material per pleat panel; uniforms drive wave, palette and zari.
const SANDAL = new THREE.Color("#e6cc98");
const MAROON = new THREE.Color("#6e1325");
const GOLD = new THREE.Color("#d4a94e");

const vert = /* glsl */ `
  uniform float uTime, uWave, uPhase, uPeel;
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vec3 p = position;
    float t = uv.y;                       // 0 at hand (pivot), 1 at outer edge
    // silk ripple, stronger toward the free edge
    p.z += sin(p.x * 3.2 + uTime * 1.3 + uPhase) * 0.045 * uWave * t;
    p.z += sin(p.y * 4.0 - uTime * 1.1 + uPhase) * 0.03 * uWave * t;
    // soft curl of the outer edge as the panel opens
    p.z -= t * t * 0.18 * uWave;
    // pallu peel: curl up from the pivot
    p.z += uPeel * t * t * 0.9;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */ `
  uniform vec3 uBody, uBorder, uGold;
  uniform float uPallu, uSheen;
  varying vec2 vUv;
  varying vec3 vPos;

  float band(float x, float a, float b) { return step(a, x) * step(x, b); }

  void main() {
    vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vPos);
    vec2 uv = vUv;

    // body with tiny zari buttas
    vec3 col = uBody;
    vec2 g = fract(uv * vec2(7.0, 9.0)) - 0.5;
    float butta = 1.0 - smoothstep(0.05, 0.08, length(g * vec2(1.0, 1.3)));
    col = mix(col, uGold, butta * 0.9 * (1.0 - uPallu));

    // pallu: stripes of zari across the body
    float stripes = band(fract(uv.y * 6.0), 0.0, 0.12);
    col = mix(col, uGold, stripes * uPallu * 0.85);

    // contrast korvai border along the outer edge, framed by zari lines
    float border = step(0.8, uv.y);
    col = mix(col, uBorder, border);
    float zari = band(uv.y, 0.80, 0.815) + band(uv.y, 0.94, 0.955) + band(uv.y, 0.985, 1.0);
    // temple-spike motif (rettai pettu) inside the border
    float spike = step(abs(fract(uv.x * 10.0) - 0.5) * 2.0, (uv.y - 0.83) / 0.1) * band(uv.y, 0.83, 0.93);
    col = mix(col, uGold, clamp(zari + spike * 0.8, 0.0, 1.0));
    // selvedge
    col = mix(col, uGold, band(uv.x, 0.0, 0.012) + band(uv.x, 0.988, 1.0));

    // woven grain
    col *= 0.94 + 0.06 * sin(uv.x * 900.0) * sin(uv.y * 700.0);

    float isGold = clamp(butta * (1.0 - uPallu) + zari + spike + stripes * uPallu, 0.0, 1.0);

    // lighting: key + rim sheen (silk) + specular for zari
    vec3 L = normalize(vec3(0.4, 0.8, 0.9));
    float diff = max(dot(n, L), 0.0) * 0.75 + 0.35;
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5) * uSheen;
    vec3 h = normalize(L + v);
    float spec = pow(max(dot(n, h), 0.0), mix(18.0, 60.0, isGold)) * mix(0.25, 1.4, isGold);

    vec3 c = col * diff + rim * (col * 0.8 + uGold * 0.15) + spec * mix(col + 0.2, uGold, isGold);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

function silk(body, border, phase, pallu = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWave: { value: 0.2 },
      uPhase: { value: phase },
      uPeel: { value: 0 },
      uBody: { value: body.clone() },
      uBorder: { value: border.clone() },
      uGold: { value: GOLD },
      uPallu: { value: pallu },
      uSheen: { value: 0.55 },
    },
  });
}

/* ---------------- the folded saree ---------------- */
// Pleats stacked into a flat "brick". Each pleat pivots at the hand
// (bottom-centre) so scroll can spread them into a fan like the reel.
const PANELS = isMobile ? 11 : 15;
const W = 1.25, H = 2.4;
const geo = new THREE.PlaneGeometry(W, H, isMobile ? 24 : 40, isMobile ? 36 : 60);
geo.translate(0, H / 2, 0); // pivot at bottom edge

const saree = new THREE.Group();
const pleats = [];
for (let i = 0; i < PANELS; i++) {
  // Kanchi contrast: sandal body with maroon border, alternating with maroon pleats
  const maroonPleat = i % 3 === 1;
  const m = silk(maroonPleat ? MAROON : SANDAL, maroonPleat ? SANDAL : MAROON, i * 0.7);
  const mesh = new THREE.Mesh(geo, m);
  const pivot = new THREE.Group();
  pivot.add(mesh);
  pivot.position.z = (i - PANELS / 2) * 0.012;
  saree.add(pivot);
  pleats.push({ pivot, mesh, m, i });
}

// pallu: the top layer, maroon with zari stripes, that peels and drapes over
const palluMat = silk(MAROON, SANDAL, 2.1, 1);
const pallu = new THREE.Mesh(geo, palluMat);
const palluPivot = new THREE.Group();
palluPivot.add(pallu);
palluPivot.position.z = (PANELS / 2) * 0.012 + 0.012;
saree.add(palluPivot);

// the "hand": a soft dark grip where the pleats gather
const grip = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.2, 0.34, 32),
  new THREE.MeshBasicMaterial({ color: "#2a070d" })
);
grip.rotation.x = Math.PI / 2;
saree.add(grip);

scene.add(saree);

// gold dust
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
  new THREE.PointsMaterial({ color: GOLD, size: 0.018, transparent: true, opacity: 0.55, depthWrite: false })
);
scene.add(dust);

/* ---------------- scroll state ---------------- */
// p: 0 → 1 across the pinned hero. Stages mirror the reel:
// 0–.15 folded float · .15–.45 pallu peel · .45–.78 fan open · .78–1 reveal + colourway swap
const state = { p: 0 };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const range = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

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

const swapBody = new THREE.Color();
function updateSaree(p, t) {
  const peel = ease(range(p, 0.15, 0.45));
  const fan = ease(range(p, 0.42, 0.78));
  const reveal = ease(range(p, 0.78, 1));

  // whole bundle: lies flat and horizontal in the hand, then rises to face us
  saree.rotation.z = THREE.MathUtils.lerp(-Math.PI / 2, -0.05, fan);
  saree.rotation.x = THREE.MathUtils.lerp(-0.9, -0.12, Math.max(peel * 0.5, fan));
  saree.rotation.y = THREE.MathUtils.lerp(0.5 + Math.sin(t * 0.4) * 0.15, Math.sin(t * 0.3) * 0.08, fan);
  saree.position.y = THREE.MathUtils.lerp(0.1 + Math.sin(t * 0.9) * 0.05, -0.75, fan);
  saree.position.x = isMobile ? 0 : THREE.MathUtils.lerp(1.1, 0, reveal) * (1 - peel * 0.4);
  saree.scale.setScalar(THREE.MathUtils.lerp(1, isMobile ? 0.8 : 0.95, fan));

  // fan spread: pleats rotate around the hand, staggered, with accordion zig-zag
  const spread = isMobile ? 1.1 : 1.3;
  pleats.forEach(({ pivot, m, i }) => {
    const k = i / (PANELS - 1);
    const local = ease(clamp01(fan * 1.4 - (1 - k) * 0.4));
    pivot.rotation.z = (k - 0.5) * 2 * spread * local;
    pivot.rotation.y = (i % 2 ? 1 : -1) * 0.22 * local * (1 - reveal * 0.4);
    m.uniforms.uTime.value = t;
    m.uniforms.uWave.value = 0.2 + local * 0.9;
    // final beat: swap to the alternate colourway (maroon body, sandal border)
    const maroonPleat = i % 3 === 1;
    const swapK = ease(clamp01(reveal * 1.6 - k * 0.6));
    swapBody.copy(maroonPleat ? MAROON : SANDAL).lerp(maroonPleat ? SANDAL : MAROON, swapK * 0.85);
    m.uniforms.uBody.value.copy(swapBody);
  });

  // pallu peels up off the stack, then drapes over the top of the fan
  palluPivot.rotation.z = THREE.MathUtils.lerp(0, spread + 0.12, fan);
  palluPivot.rotation.x = -peel * 0.5 * (1 - fan) - fan * 0.15;
  palluMat.uniforms.uPeel.value = peel * (1 - fan) * 0.8;
  palluMat.uniforms.uWave.value = 0.3 + peel * 1.2;
  palluMat.uniforms.uTime.value = t;
  grip.visible = fan < 0.98;

  camera.position.set(0, THREE.MathUtils.lerp(0.4, 0.3, fan), THREE.MathUtils.lerp(7.2, isMobile ? 9.5 : 6.4, peel) + fan * 1.2);
  camera.lookAt(0, THREE.MathUtils.lerp(0, 0.2, fan), 0);

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
  // lerp the displayed progress for extra silkiness
  shown += (state.p - shown) * (reduceMotion ? 1 : 0.12);
  const t = reduceMotion ? 0 : clock.getElapsedTime();
  updateSaree(shown, t);
  updateBeats(shown);
  renderer.render(scene, camera);
});
document.getElementById("loader").classList.add("done");

/* ---------------- collection ---------------- */
const products = [
  ["Sandal Temple Border", "Sandal body · maroon korvai", 800, "#e6cc98", "#6e1325", "Bestseller"],
  ["Maroon Rettai Pettu", "Maroon body · sandal border", 950, "#6e1325", "#e6cc98", "New"],
  ["Sandal Butta Soft Silk", "Zari buttas · maroon pallu", 1100, "#ecd6a8", "#7a1a2c", ""],
  ["Maroon Checks", "Kattam weave · gold zari", 1250, "#5e0f1f", "#d9b877", ""],
  ["Sandal Mayil Chakram", "Peacock motif pallu", 1400, "#dfc28c", "#6b1424", "Limited"],
  ["Maroon Vaira Oosi", "Needle-stripe body", 900, "#741628", "#ead3a4", ""],
  ["Sandal Plain Soft Silk", "Wide zari border", 800, "#f0dcb2", "#5a0f1d", ""],
  ["Maroon Grand Pallu", "Rich pallu · half-fine zari", 1600, "#681324", "#e2c68f", "Bestseller"],
];
document.getElementById("grid").innerHTML = products
  .map(
    ([name, desc, price, body, border, tag]) => `
  <article class="card reveal">
    <div class="swatch" style="--body:${body};--border:${border}">${tag ? `<span class="tag">${tag}</span>` : ""}</div>
    <h3>${name}</h3>
    <div class="meta"><span>${desc}</span><b>₹${price}</b></div>
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
