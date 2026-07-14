/* Micro-celebración instantánea al resolver un caso.
   Sin dependencias: un confeti breve en canvas + un sello "✓ ¡Resuelto!".
   Se auto-limpia. Respeta prefers-reduced-motion. */

export function celebrarResuelto(mensaje = "¡Resuelto!") {
  if (typeof window === "undefined") return;

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // Sello central
  const sello = document.createElement("div");
  sello.textContent = "✓ " + mensaje;
  sello.setAttribute("style", [
    "position:fixed", "left:50%", "top:42%", "transform:translate(-50%,-50%) scale(.6)",
    "z-index:9999", "pointer-events:none",
    "background:rgba(46,204,113,.16)", "border:1px solid rgba(46,204,113,.5)",
    "color:#7ff0b0", "font-weight:700", "font-size:22px",
    "padding:12px 22px", "border-radius:999px",
    "box-shadow:0 8px 30px rgba(0,0,0,.4)", "opacity:0",
    "transition:opacity .18s ease, transform .28s cubic-bezier(.2,1.5,.4,1)",
  ].join(";"));
  document.body.appendChild(sello);
  requestAnimationFrame(() => {
    sello.style.opacity = "1";
    sello.style.transform = "translate(-50%,-50%) scale(1)";
  });
  setTimeout(() => {
    sello.style.opacity = "0";
    sello.style.transform = "translate(-50%,-50%) scale(1.05)";
  }, 1100);
  setTimeout(() => sello.remove(), 1450);

  if (reduce) return;

  // Confeti
  const canvas = document.createElement("canvas");
  canvas.setAttribute("style", "position:fixed;inset:0;z-index:9998;pointer-events:none");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const colores = ["#2ecc71", "#7c5cff", "#2dd4bf", "#f4e9c1", "#ffd166", "#ff6b9d"];
  const cx = W / 2, cy = H * 0.42;
  const N = 130;
  const parts = Array.from({ length: N }, () => {
    const ang = Math.random() * Math.PI * 2;
    const vel = 4 + Math.random() * 8;
    return {
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 20,
      vx: Math.cos(ang) * vel,
      vy: Math.sin(ang) * vel - 4,
      g: 0.18 + Math.random() * 0.12,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colores[(Math.random() * colores.length) | 0],
    };
  });

  const inicio = performance.now();
  const DUR = 1600;
  const frame = (t: number) => {
    const k = t - inicio;
    ctx.clearRect(0, 0, W, H);
    const alpha = k < DUR - 400 ? 1 : Math.max(0, (DUR - k) / 400);
    ctx.globalAlpha = alpha;
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.vx *= 0.99;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (k < DUR) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
