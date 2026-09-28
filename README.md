# Noolagam · Kanchipuram Soft Silk landing page

A scroll-driven 3D landing page for a single category (sandal & maroon soft silk sarees).

- `index.html`: page markup and import map (Three.js, GSAP ScrollTrigger and Lenis from jsDelivr)
- `src/main.js`: procedural 3D saree (pleat panels + pallu, custom silk/zari shader) driven by scroll
- `src/style.css`: styles (Bitter + Mona Sans)

Scroll stages: folded bundle → pallu peels → pleats fan open → colourway swap + price CTA.

Run it: `python3 -m http.server` and open http://localhost:8000. No build step.
