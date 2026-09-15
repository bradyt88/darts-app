/* Dart Zone celebration audio — event feedback only. */

function playCelebration(kind) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "180" ? 1.15 : 1.35));
    master.connect(ctx.destination);

    const impact = ctx.createOscillator();
    const impactGain = ctx.createGain();
    impact.type = "sawtooth";
    impact.frequency.setValueAtTime(kind === "180" ? 150 : 125, now);
    impact.frequency.exponentialRampToValueAtTime(kind === "180" ? 55 : 42, now + 0.22);
    impactGain.gain.setValueAtTime(0.0001, now);
    impactGain.gain.exponentialRampToValueAtTime(0.8, now + 0.018);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    impact.connect(impactGain).connect(master);
    impact.start(now);
    impact.stop(now + 0.3);

    const notes = kind === "180" ? [392, 523.25, 659.25, 783.99, 1046.5] : [329.63, 440, 554.37, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + 0.12 + i * (kind === "180" ? 0.11 : 0.09);
      osc.type = i === notes.length - 1 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(i === notes.length - 1 ? 0.22 : 0.11, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.21);
    });

    if (kind !== "180") {
      const finish = ctx.createOscillator();
      const finishGain = ctx.createGain();
      finish.type = "triangle";
      finish.frequency.setValueAtTime(98, now + 0.62);
      finish.frequency.exponentialRampToValueAtTime(49, now + 1.2);
      finishGain.gain.setValueAtTime(0.0001, now + 0.62);
      finishGain.gain.exponentialRampToValueAtTime(0.16, now + 0.67);
      finishGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      finish.connect(finishGain).connect(master);
      finish.start(now + 0.62);
      finish.stop(now + 1.25);
    }

    setTimeout(() => ctx.close().catch(() => {}), 1700);
  } catch (e) {}
}

let lastState = "";
const observer = new MutationObserver(() => {
  const flash = document.querySelector(".dm-flash180");
  const win = document.querySelector(".dm-gameover-title");
  const state = flash ? "180" : win ? "win" : "";
  if (state && state !== lastState) playCelebration(state === "180" ? "180" : "win");
  lastState = state;
});

if (typeof document !== "undefined") {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
