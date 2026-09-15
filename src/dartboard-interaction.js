const MAX_ZOOM = 1.8;
const MIN_ZOOM = 1;
const ZOOM_STEP = 0.1;

const pointers = new Map();
const stateBySvg = new WeakMap();
let observerStarted = false;

function clamp(value, min, max) { return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)); }
function distance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

function addBoardArtwork(svg) {
  if (svg.dataset.dmArtworkReady === "1") return;
  svg.dataset.dmArtworkReady = "1";
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  const gradients = [
    ["dm-sisal-dark", "#0d120f", "#252b27"],
    ["dm-sisal-light", "#a9a493", "#e0dac7"],
    ["dm-red", "#76151a", "#b92f35"],
    ["dm-green", "#124e34", "#2d8b5b"],
    ["dm-bull-red", "#7d171c", "#c7353c"],
    ["dm-bull-green", "#14583a", "#35a368"]
  ];
  gradients.forEach(([id, start, end]) => {
    const g = document.createElementNS(ns, "linearGradient");
    g.id = id; g.setAttribute("x1", "0"); g.setAttribute("y1", "0"); g.setAttribute("x2", "1"); g.setAttribute("y2", "1");
    const a = document.createElementNS(ns, "stop"); a.setAttribute("offset", "0%"); a.setAttribute("stop-color", start);
    const b = document.createElementNS(ns, "stop"); b.setAttribute("offset", "100%"); b.setAttribute("stop-color", end);
    g.append(a, b); defs.appendChild(g);
  });
  const shadow = document.createElementNS(ns, "filter"); shadow.id = "dm-board-shadow"; shadow.setAttribute("x", "-20%"); shadow.setAttribute("y", "-20%"); shadow.setAttribute("width", "140%"); shadow.setAttribute("height", "140%");
  const drop = document.createElementNS(ns, "feDropShadow"); drop.setAttribute("dx", "0"); drop.setAttribute("dy", "4"); drop.setAttribute("stdDeviation", "4"); drop.setAttribute("flood-color", "#000"); drop.setAttribute("flood-opacity", ".68"); shadow.appendChild(drop); defs.appendChild(shadow);
  svg.insertBefore(defs, svg.firstChild);
  svg.style.filter = "url(#dm-board-shadow)";

  const paths = Array.from(svg.querySelectorAll("path"));
  paths.forEach((path, index) => {
    const slot = index % 4;
    const segmentIndex = Math.floor(index / 4);
    const accent = segmentIndex % 2 === 0 ? "url(#dm-red)" : "url(#dm-green)";
    path.setAttribute("fill", slot === 0 || slot === 2 ? accent : (slot === 1 ? "url(#dm-sisal-dark)" : "url(#dm-sisal-light)"));
    path.setAttribute("stroke", "#070b08"); path.setAttribute("stroke-width", "0.9");
  });
  const circles = Array.from(svg.querySelectorAll("circle"));
  const bulls = circles.filter(c => Number(c.getAttribute("r")) <= 16);
  if (bulls.length >= 2) { bulls[bulls.length - 2].setAttribute("fill", "url(#dm-bull-green)"); bulls[bulls.length - 1].setAttribute("fill", "url(#dm-bull-red)"); }
  svg.querySelectorAll("text").forEach(text => {
    text.setAttribute("font-weight", "900"); text.setAttribute("font-size", "15"); text.setAttribute("fill", "#f4f7f2");
    text.setAttribute("paint-order", "stroke"); text.setAttribute("stroke", "#020402"); text.setAttribute("stroke-width", "2.8");
  });
  const web = document.createElementNS(ns, "g"); web.setAttribute("pointer-events", "none"); web.setAttribute("opacity", ".78");
  [188,176,116,104,16,7].forEach(r => { const c=document.createElementNS(ns,"circle"); c.setAttribute("cx","200"); c.setAttribute("cy","200"); c.setAttribute("r",r); c.setAttribute("fill","none"); c.setAttribute("stroke",r<=16?"#d9ddd6":"#858d86"); c.setAttribute("stroke-width",r<=16?".7":".5"); web.appendChild(c); });
  for(let k=0;k<20;k++) { const angle=((k*18-9-90)*Math.PI)/180; const line=document.createElementNS(ns,"line"); line.setAttribute("x1",(200+7*Math.cos(angle)).toFixed(2)); line.setAttribute("y1",(200+7*Math.sin(angle)).toFixed(2)); line.setAttribute("x2",(200+188*Math.cos(angle)).toFixed(2)); line.setAttribute("y2",(200+188*Math.sin(angle)).toFixed(2)); line.setAttribute("stroke","#7f8780"); line.setAttribute("stroke-width",".5"); web.appendChild(line); }
  svg.appendChild(web);
}

function applyZoom(svg, scale) {
  const next = clamp(scale);
  const state = stateBySvg.get(svg) || {};
  state.scale = next; stateBySvg.set(svg, state);
  svg.style.transform = `scale(${next})`;
  svg.style.transformOrigin = "50% 50%";
  svg.style.transition = pointers.size > 0 ? "none" : "transform 120ms ease-out";
  svg.setAttribute("aria-label", `Manual dartboard, ${Math.round(next*100)} percent zoom`);
}

function attachZoom(svg) {
  if (svg.dataset.dmZoomReady === "1") return;
  svg.dataset.dmZoomReady = "1";
  svg.style.touchAction = "none";
  svg.style.transformOrigin = "50% 50%";
  svg.style.willChange = "transform";
  stateBySvg.set(svg, { scale:1, pinchDistance:0 });

  // Do NOT use setPointerCapture here. The React scorer relies on the
  // pointer/click completing on the actual dartboard wedge that was tapped.
  // Capturing the pointer on the parent SVG retargets the subsequent click
  // away from the wedge, which makes manual scoring appear completely dead.
  svg.addEventListener("pointerdown", e => {
    pointers.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY,svg});
  });

  svg.addEventListener("pointermove", e => {
    const active = pointers.get(e.pointerId);
    if(!active || active.svg !== svg) return;
    pointers.set(e.pointerId,{clientX:e.clientX,clientY:e.clientY,svg});
    if(pointers.size<2) return;
    const pts=Array.from(pointers.values()).filter(p => p.svg === svg), state=stateBySvg.get(svg), d=distance(pts[0],pts[1]);
    if(pts.length<2) return;
    if(!state.pinchDistance) state.pinchDistance=d;
    if(state.pinchDistance>0) { const ratio=d/state.pinchDistance; if(Math.abs(ratio-1)>0.002) { applyZoom(svg,state.scale*ratio); state.pinchDistance=d; } }
    e.preventDefault();
  },{passive:false});

  const end=e=>{
    const active = pointers.get(e.pointerId);
    if(!active || active.svg !== svg) return;
    pointers.delete(e.pointerId);
    const s=stateBySvg.get(svg); if(s && Array.from(pointers.values()).filter(p => p.svg === svg).length<2) s.pinchDistance=0;
  };
  svg.addEventListener("pointerup",end); svg.addEventListener("pointercancel",end);
  svg.addEventListener("wheel",e=>{ if(!e.ctrlKey&&Math.abs(e.deltaY)<2)return; e.preventDefault(); const s=stateBySvg.get(svg); applyZoom(svg,s.scale-Math.sign(e.deltaY)*ZOOM_STEP); },{passive:false});
  svg.addEventListener("dblclick",e=>{e.preventDefault();const s=stateBySvg.get(svg);applyZoom(svg,s.scale>1.05?1:1.35);});
}
function decorateBoard(svg){ addBoardArtwork(svg); attachZoom(svg); }
function scan(){ document.querySelectorAll(".dm-board-holder > svg").forEach(decorateBoard); }
function start(){ if(observerStarted)return; observerStarted=true; scan(); new MutationObserver(scan).observe(document.body,{childList:true,subtree:true}); }
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true}); else start();
