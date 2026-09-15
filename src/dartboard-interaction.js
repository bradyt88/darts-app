const MAX_ZOOM = 1.8;
const MIN_ZOOM = 1;
const ZOOM_STEP = 0.1;

const pointers = new Map();
const stateBySvg = new WeakMap();
let observerStarted = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function addBoardArtwork(svg) {
  if (svg.dataset.dmArtworkReady === "1") return;
  svg.dataset.dmArtworkReady = "1";

  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");

  const gradients = [
    ["dm-sisal-dark", "#111713", "#242a26"],
    ["dm-sisal-light", "#b7b2a2", "#e6e0cd"],
    ["dm-red", "#7f171b", "#c83a3e"],
    ["dm-green", "#145b3b", "#39a56c"],
    ["dm-bull-red", "#8d1a20", "#dc444a"],
    ["dm-bull-green", "#17623f", "#42b978"],
  ];

  gradients.forEach(([id, start, end]) => {
    const g = document.createElementNS(ns, "linearGradient");
    g.setAttribute("id", id);
    g.setAttribute("x1", "0");
    g.setAttribute("y1", "0");
    g.setAttribute("x2", "1");
    g.setAttribute("y2", "1");
    const s1 = document.createElementNS(ns, "stop");
    s1.setAttribute("offset", "0%");
    s1.setAttribute("stop-color", start);
    const s2 = document.createElementNS(ns, "stop");
    s2.setAttribute("offset", "100%");
    s2.setAttribute("stop-color", end);
    g.append(s1, s2);
    defs.appendChild(g);
  });

  const shadow = document.createElementNS(ns, "filter");
  shadow.setAttribute("id", "dm-board-shadow");
  shadow.setAttribute("x", "-20%");
  shadow.setAttribute("y", "-20%");
  shadow.setAttribute("width", "140%");
  shadow.setAttribute("height", "140%");
  const drop = document.createElementNS(ns, "feDropShadow");
  drop.setAttribute("dx", "0");
  drop.setAttribute("dy", "4");
  drop.setAttribute("stdDeviation", "4");
  drop.setAttribute("flood-color", "#000");
  drop.setAttribute("flood-opacity", ".65");
  shadow.appendChild(drop);
  defs.appendChild(shadow);

  svg.insertBefore(defs, svg.firstChild);
  svg.style.filter = "url(#dm-board-shadow)";

  const paths = Array.from(svg.querySelectorAll("path"));
  paths.forEach((path, index) => {
    const slot = index % 4;
    if (slot === 0 || slot === 2) {
      path.setAttribute("fill", index % 2 === 0 ? "url(#dm-red)" : "url(#dm-green)");
    } else {
      path.setAttribute("fill", slot === 1 ? "url(#dm-sisal-dark)" : "url(#dm-sisal-light)");
    }
    path.setAttribute("stroke", "#080c09");
    path.setAttribute("stroke-width", "0.9");
  });

  const circles = Array.from(svg.querySelectorAll("circle"));
  const bullCircles = circles.filter((circle) => Number(circle.getAttribute("r")) <= 16);
  if (bullCircles.length >= 2) {
    bullCircles[bullCircles.length - 2].setAttribute("fill", "url(#dm-bull-green)");
    bullCircles[bullCircles.length - 1].setAttribute("fill", "url(#dm-bull-red)");
  }

  svg.querySelectorAll("text").forEach((text) => {
    text.setAttribute("font-weight", "800");
    text.setAttribute("font-size", "14");
    text.setAttribute("fill", "#eef5ee");
    text.setAttribute("paint-order", "stroke");
    text.setAttribute("stroke", "#020503");
    text.setAttribute("stroke-width", "2.5");
    text.setAttribute("stroke-linejoin", "round");
  });

  const web = document.createElementNS(ns, "g");
  web.setAttribute("pointer-events", "none");
  web.setAttribute("opacity", ".72");

  [188, 176, 116, 104, 16, 7].forEach((r) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", "200");
    c.setAttribute("cy", "200");
    c.setAttribute("r", String(r));
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", r <= 16 ? "#d7d9d3" : "#9ba19b");
    c.setAttribute("stroke-width", r <= 16 ? ".7" : ".55");
    web.appendChild(c);
  });

  for (let k = 0; k < 20; k += 1) {
    const angle = ((k * 18 - 9 - 90) * Math.PI) / 180;
    const x1 = 200 + 7 * Math.cos(angle);
    const y1 = 200 + 7 * Math.sin(angle);
    const x2 = 200 + 188 * Math.cos(angle);
    const y2 = 200 + 188 * Math.sin(angle);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", x1.toFixed(2));
    line.setAttribute("y1", y1.toFixed(2));
    line.setAttribute("x2", x2.toFixed(2));
    line.setAttribute("y2", y2.toFixed(2));
    line.setAttribute("stroke", "#8f9690");
    line.setAttribute("stroke-width", ".55");
    web.appendChild(line);
  }

  svg.appendChild(web);
}

function applyZoom(svg, scale) {
  const next = clamp(scale, MIN_ZOOM, MAX_ZOOM);
  const state = stateBySvg.get(svg) || {};
  state.scale = next;
  stateBySvg.set(svg, state);
  svg.style.transform = `scale(${next})`;
  svg.style.transformOrigin = "50% 50%";
  svg.style.transition = pointers.size > 0 ? "none" : "transform 120ms ease-out";
  svg.setAttribute("aria-label", `Manual dartboard, ${Math.round(next * 100)} percent zoom`);
}

function resetZoom(svg) {
  applyZoom(svg, 1);
}

function attachZoom(svg) {
  if (svg.dataset.dmZoomReady === "1") return;
  svg.dataset.dmZoomReady = "1";
  svg.style.touchAction = "none";
  svg.style.transformOrigin = "50% 50%";
  svg.style.willChange = "transform";
  stateBySvg.set(svg, { scale: 1, lastTap: 0, tapTimer: null });

  svg.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    svg.setPointerCapture?.(event.pointerId);
  });

  svg.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (pointers.size < 2) return;

    const points = Array.from(pointers.values());
    const state = stateBySvg.get(svg);
    const currentDistance = distance(points[0], points[1]);
    if (!state.pinchDistance) state.pinchDistance = currentDistance;
    if (state.pinchDistance > 0) {
      const ratio = currentDistance / state.pinchDistance;
      if (Math.abs(ratio - 1) > 0.002) {
        applyZoom(svg, state.scale * ratio);
        state.pinchDistance = currentDistance;
      }
    }
    event.preventDefault();
  }, { passive: false });

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      const state = stateBySvg.get(svg);
      if (state) state.pinchDistance = 0;
    }
  };

  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);

  svg.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && Math.abs(event.deltaY) < 2) return;
    event.preventDefault();
    const state = stateBySvg.get(svg);
    applyZoom(svg, state.scale - Math.sign(event.deltaY) * ZOOM_STEP);
  }, { passive: false });

  svg.addEventListener("dblclick", (event) => {
    event.preventDefault();
    const state = stateBySvg.get(svg);
    applyZoom(svg, state.scale > 1.05 ? 1 : 1.45);
  });
}

function decorateBoard(svg) {
  addBoardArtwork(svg);
  attachZoom(svg);
}

function scan() {
  document.querySelectorAll(".dm-board-holder > svg").forEach(decorateBoard);
}

function start() {
  if (observerStarted) return;
  observerStarted = true;
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
