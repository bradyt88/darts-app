import { useState, useEffect, useRef, useMemo } from "react";

const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const RAD = {
  missOuter: 196,
  doubleOuter: 188,
  doubleInner: 176,
  tripleOuter: 116,
  tripleInner: 104,
  bullOuter: 16,
  bullInner: 7,
};

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx, cy, rIn, rOut, a0, a1) {
  const p1 = polar(cx, cy, rOut, a0);
  const p2 = polar(cx, cy, rOut, a1);
  const p3 = polar(cx, cy, rIn, a1);
  const p4 = polar(cx, cy, rIn, a0);
  return "M " + p1.x.toFixed(2) + " " + p1.y.toFixed(2) + " A " + rOut + " " + rOut + " 0 0 1 " + p2.x.toFixed(2) + " " + p2.y.toFixed(2) + " L " + p3.x.toFixed(2) + " " + p3.y.toFixed(2) + " A " + rIn + " " + rIn + " 0 0 0 " + p4.x.toFixed(2) + " " + p4.y.toFixed(2) + " Z";
}

function buildBoard(cx, cy) {
  const wedges = [];
  ORDER.forEach((num, k) => {
    const a0 = k * 18 - 9;
    const a1 = k * 18 + 9;
    const even = k % 2 === 0;
    const singleColor = even ? "#16181d" : "#e7ddc2";
    const hitColor = even ? "#b1332c" : "#1f7a48";
    wedges.push({ key: "D" + num, value: num * 2, isDouble: true, d: wedgePath(cx, cy, RAD.doubleInner, RAD.doubleOuter, a0, a1), fill: hitColor });
    wedges.push({ key: "S" + num + "o", value: num, isDouble: false, d: wedgePath(cx, cy, RAD.tripleOuter, RAD.doubleInner, a0, a1), fill: singleColor });
    wedges.push({ key: "T" + num, value: num * 3, isDouble: false, d: wedgePath(cx, cy, RAD.tripleInner, RAD.tripleOuter, a0, a1), fill: hitColor });
    wedges.push({ key: "S" + num + "i", value: num, isDouble: false, d: wedgePath(cx, cy, RAD.bullOuter, RAD.tripleInner, a0, a1), fill: singleColor });
  });
  const labels = ORDER.map((num, k) => {
    const pos = polar(cx, cy, RAD.doubleOuter + 13, k * 18);
    return { num, x: pos.x, y: pos.y };
  });
  return { wedges, labels };
}

const ALL_SEGMENTS = (() => {
  const segs = [];
  for (let n = 1; n <= 20; n++) {
    segs.push({ label: "S" + n, value: n });
    segs.push({ label: "D" + n, value: n * 2, isDouble: true });
    segs.push({ label: "T" + n, value: n * 3 });
  }
  segs.push({ label: "Bull", value: 25 });
  segs.push({ label: "D-Bull", value: 50, isDouble: true });
  return segs;
})();

function findCheckout(remaining, dartsLeft) {
  if (remaining <= 1 || remaining > 170 || dartsLeft <= 0) return null;
  const doubles = ALL_SEGMENTS.filter((s) => s.isDouble);
  for (const d of doubles) if (d.value === remaining) return [d.label];
  if (dartsLeft >= 2) {
    for (const a of ALL_SEGMENTS) {
      for (const d of doubles) {
        if (a.value + d.value === remaining) return [a.label, d.label];
      }
    }
  }
  if (dartsLeft >= 3) {
    for (const a of ALL_SEGMENTS) {
      for (const b of ALL_SEGMENTS) {
        for (const d of doubles) {
          if (a.value + b.value + d.value === remaining) return [a.label, b.label, d.label];
        }
      }
    }
  }
  return null;
}

function qualityLabel(total) {
  if (total === 180) return "Maximum!";
  if (total >= 140) return "Excellent!";
  if (total >= 100) return "Great scoring!";
  if (total >= 60) return "Solid turn.";
  if (total > 0) return "Keep going.";
  return "";
}

const LOBBY = [
  { name: "Jamie_180", avg: 62.4 },
  { name: "SteveD", avg: 54.1 },
  { name: "AdeArrows", avg: 71.8 },
  { name: "NiteHawk", avg: 48.9 },
];

const MODE_TILES = [
  { key: "501", label: "501", desc: "Classic single or double out", playable: true },
  { key: "301", label: "301", desc: "Fast paced game", playable: true },
  { key: "cricket", label: "Cricket", desc: "Mark and close", playable: false },
  { key: "clock", label: "Around the clock", desc: "Hit each number in order", playable: false },
  { key: "shanghai", label: "Shanghai", desc: "Single, double, triple on one number", playable: false },
  { key: "highscore", label: "High score", desc: "3 darts, highest total", playable: false },
  { key: "killer", label: "Killer", desc: "Take out your opponents", playable: false },
  { key: "countup", label: "Count up", desc: "See how high you can go", playable: false },
];

function emptyProfile(name) {
  return { name, gamesPlayed: 0, gamesWon: 0, totalPoints: 0, totalDarts: 0, total180s: 0, bestCheckout: 0, history: [] };
}

function initPlayer(name, startScore) {
  return { name, remaining: startScore, dartsThrown: 0, pointsScored: 0 };
}

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

export default function DartMind() {
  const [screen, setScreen] = useState("loading");
  const [profile, setProfile] = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [gameConfig, setGameConfig] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [players, setPlayers] = useState(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [turnThrows, setTurnThrows] = useState([]);
  const [bustPending, setBustPending] = useState(false);
  const [flash, setFlash] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [user180s, setUser180s] = useState(0);
  const [challengeTab, setChallengeTab] = useState("daily");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const boardRef = useRef(null);
  const cx = 200;
  const cy = 200;
  const board = useMemo(() => buildBoard(cx, cy), []);

  useEffect(() => {
    (async () => {
      let p = null;
      try {
        if (window.storage && window.storage.get) {
          const res = await window.storage.get("profile");
          if (res && res.value) p = JSON.parse(res.value);
        } else {
          const raw = window.localStorage.getItem("darkmind_profile");
          if (raw) p = JSON.parse(raw);
        }
      } catch (e) {}
      setScreen(p ? "home" : "login");
      if (p) setProfile({ history: [], ...p });
    })();
  }, []);

  async function saveProfile(p) {
    setProfile(p);
    try {
      if (window.storage && window.storage.set) await window.storage.set("profile", JSON.stringify(p));
      else window.localStorage.setItem("darkmind_profile", JSON.stringify(p));
    } catch (e) {}
  }

  function handleCreateAccount(overrideName) {
    const name = (overrideName || nameInput).trim();
    if (!name) return;
    saveProfile(emptyProfile(name));
    setScreen("home");
  }

  async function handleLogOut() {
    try {
      if (window.storage && window.storage.delete) await window.storage.delete("profile");
      window.localStorage.removeItem("darkmind_profile");
    } catch (e) {}
    setProfile(null);
    setNameInput("");
    setScreen("login");
  }

  function startLocalGame(mode) {
    const startScore = mode === "301" ? 301 : 501;
    setGameConfig({ mode, opponentName: "Alex", online: false, startScore });
    setCalibrated(false);
    setCalibrationStep(0);
    setCalibrationPoints([]);
    setCameraError("");
    setScreen("calibrate");
  }

  function startOnlineSearch() {
    setSearching(true);
    setTimeout(() => {
      const opp = LOBBY[Math.floor(Math.random() * LOBBY.length)];
      setGameConfig({ mode: "501", opponentName: opp.name, online: true, startScore: 501 });
      setSearching(false);
      setCalibrated(false);
      setCalibrationStep(0);
      setCalibrationPoints([]);
      setCameraError("");
      setScreen("calibrate");
    }, 1600);
  }

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access needs a secure connection (HTTPS or localhost). Open Dark Mind from a secure web address or local development server.");
      return;
    }
    try {
      if (cameraStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
      setCameraStarted(true);
    } catch (err) {
      setCameraError(err && err.name === "NotAllowedError" ? "Camera permission was blocked. Allow camera access in your browser settings and try again." : "Dark Mind could not access the camera on this device.");
      setCameraReady(false);
    }
  }

  function stopCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setCameraReady(false);
    setCameraStarted(false);
  }

  useEffect(() => {
    if (screen !== "calibrate") stopCamera();
    return () => stopCamera();
  }, [screen]);

  function playToneSequence(notes, duration = 0.12) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * duration);
        gain.gain.exponentialRampToValueAtTime(0.08, now + i * duration + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * duration + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * duration);
        osc.stop(now + i * duration + duration + 0.02);
      });
      setTimeout(() => ctx.close(), (notes.length * duration + 0.3) * 1000);
    } catch (e) {}
  }

  function handleCalibrationTap(evt) {
    if (!cameraReady || calibrated) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 100;
    const y = ((evt.clientY - rect.top) / rect.height) * 100;
    if (calibrationStep === 0) {
      setCalibrationPoints([{ x, y, label: "Bull centre" }]);
      setCalibrationStep(1);
      playToneSequence([660]);
    } else if (calibrationStep === 1) {
      setCalibrationPoints((pts) => [...pts, { x, y, label: "20 outer edge" }]);
      setCalibrationStep(2);
      playToneSequence([660, 880]);
    }
  }

  function runCalibration() {
    if (!cameraReady) {
      startCamera();
      return;
    }
    if (calibrationStep < 2) return;
    setCalibrating(true);
    setTimeout(() => {
      setCalibrating(false);
      setCalibrated(true);
      playToneSequence([523, 659, 784]);
    }, 650);
  }

  function beginGame() {
    setPlayers([initPlayer(profile.name, gameConfig.startScore), initPlayer(gameConfig.opponentName, gameConfig.startScore)]);
    setTurnIndex(0);
    setTurnThrows([]);
    setBustPending(false);
    setGameOver(null);
    setUser180s(0);
    setScreen("game");
  }

  function getSvgPoint(evt) {
    const svg = boardRef.current;
    if (!svg) return { x: cx, y: cy };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: cx, y: cy };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  }

  function applyTurnScore(pIdx, thrown, totalOverride, isWin, finishValue) {
    const turnTotal = totalOverride != null ? totalOverride : thrown.reduce((s, t) => s + t.value, 0);
    const list = [...players];
    list[pIdx] = { ...list[pIdx], remaining: list[pIdx].remaining - turnTotal, dartsThrown: list[pIdx].dartsThrown + thrown.length, pointsScored: list[pIdx].pointsScored + turnTotal };
    setPlayers(list);
    if (turnTotal === 180 && !isWin) {
      setFlash("180");
      playToneSequence([523, 659, 784, 1047], 0.10);
      setTimeout(() => setFlash(null), 1500);
      if (pIdx === 0) setUser180s((c) => c + 1);
    }
    if (isWin) {
      playToneSequence([659, 784, 988, 1319], 0.11);
      finishGame(pIdx, list, finishValue);
    }
    return list;
  }

  function applyThrow(throwObj) {
    if (gameOver || !players || bustPending || turnThrows.length >= 3) return;
    const pIdx = turnIndex;
    const committedRemaining = players[pIdx].remaining;
    const turnSoFar = turnThrows.reduce((s, t) => s + t.value, 0);
    const liveRemaining = committedRemaining - turnSoFar;
    const newLive = liveRemaining - throwObj.value;
    const newTurnThrows = [...turnThrows, throwObj];
    const isBust = newLive < 0 || newLive === 1 || (newLive === 0 && !throwObj.isDouble);

    setTurnThrows(newTurnThrows);

    if (isBust) {
      setBustPending(true);
      return;
    }
    if (newLive === 0) {
      const turnTotal = turnSoFar + throwObj.value;
      applyTurnScore(pIdx, newTurnThrows, turnTotal, true, throwObj.value);
    }
  }

  function handleBoardClick(evt, label, value, isDouble) {
    const pt = getSvgPoint(evt);
    applyThrow({ label, value, isDouble: !!isDouble, x: pt.x, y: pt.y });
  }

  function handleMissButton() {
    applyThrow({ label: "Miss", value: 0, isDouble: false, x: null, y: null });
  }

  function handleUndo() {
    if (turnThrows.length === 0 || gameOver) return;
    setTurnThrows(turnThrows.slice(0, -1));
    setBustPending(false);
  }

  function handleNextPlayer() {
    if (!players || gameOver) return;
    const pIdx = turnIndex;
    if (bustPending) {
      setBustPending(false);
      setTurnThrows([]);
      setTurnIndex(pIdx === 0 ? 1 : 0);
      return;
    }
    if (turnThrows.length === 0) return;
    applyTurnScore(pIdx, turnThrows);
    setTurnThrows([]);
    setTurnIndex(pIdx === 0 ? 1 : 0);
  }

  function finishGame(winnerIdx, list, finishValue) {
    setGameOver({ winnerIdx, finishValue });
    if (!profile) return;
    const you = list[0];
    const won = winnerIdx === 0;
    const gameAvg = you.dartsThrown > 0 ? Math.round(((you.pointsScored / you.dartsThrown) * 3) * 10) / 10 : 0;
    const history = [...(profile.history || []), { avg: gameAvg }].slice(-10);
    saveProfile({
      ...profile,
      gamesPlayed: profile.gamesPlayed + 1,
      gamesWon: profile.gamesWon + (won ? 1 : 0),
      totalPoints: profile.totalPoints + you.pointsScored,
      totalDarts: profile.totalDarts + you.dartsThrown,
      total180s: profile.total180s + user180s,
      bestCheckout: won ? Math.max(profile.bestCheckout, finishValue) : profile.bestCheckout,
      history,
    });
  }

  const currentPlayer = players ? players[turnIndex] : null;
  const dartsLeftInTurn = 3 - turnThrows.length;
  const turnSoFarValue = turnThrows.reduce((s, t) => s + t.value, 0);
  const liveRemainingForCurrent = currentPlayer ? currentPlayer.remaining - turnSoFarValue : 0;
  const checkout = currentPlayer && !gameOver && !bustPending ? findCheckout(liveRemainingForCurrent, dartsLeftInTurn) : null;
  const avg = profile && profile.totalDarts > 0 ? (profile.totalPoints / profile.totalDarts) * 3 : 0;
  const winRate = profile && profile.gamesPlayed > 0 ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100) : 0;
  const totalXp = profile ? profile.gamesPlayed * 120 + profile.gamesWon * 80 + profile.total180s * 50 : 0;
  const level = Math.floor(totalXp / 500) + 1;
  const xpIntoLevel = totalXp % 500;

  function Header(props) {
    const title = props.title;
    const onBack = props.onBack;
    const showProfile = props.showProfile;
    return (
      <div className="dm-header">
        {onBack ? (
          <button className="dm-iconbtn" onClick={onBack} aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 2 L4 8 L10 14" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ) : (
          <div className="dm-mark">
            <svg width="20" height="20" viewBox="0 0 20 20">
              <line x1="4" y1="16" x2="15" y2="5" stroke="#3FE07A" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M4 16 L2 18 M4 16 L1 15.2" stroke="#3FE07A" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M12 5 L15 2 L17 4 L14 7 Z" fill="#3FE07A" />
            </svg>
          </div>
        )}
        <div className="dm-title">{title}</div>
        {showProfile && profile && (
          <button className="dm-avatar" onClick={() => setScreen("stats")} aria-label="Profile">
            {initials(profile.name)}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="dm-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap');
        .dm-root {
          --bg-a: #04150c;
          --bg-b: #050806;
          --panel: #0F1712;
          --panel-2: #131C16;
          --border: #1E2B22;
          --border-strong: #2A3B2F;
          --ink: #ECF6EF;
          --text: #93A79A;
          --text-dim: #566258;
          --accent: #3FE07A;
          --accent-strong: #2ECB68;
          --accent-ink: #06210F;
          --err: #E2504A;
          --op: #D7DEDA;
          font-family: 'Inter', -apple-system, sans-serif;
          background: radial-gradient(ellipse at 50% 0%, var(--bg-a) 0%, var(--bg-b) 60%, #020402 100%);
          color: var(--text);
          display: flex;
          justify-content: center;
        }
        .dm-shell { width: 100%; max-width: 420px; display: flex; flex-direction: column; min-height: 660px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
        .dm-header { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .dm-mark { flex-shrink: 0; }
        .dm-title { font-family: 'Bebas Neue', sans-serif; font-size: 21px; letter-spacing: 0.03em; color: var(--ink); }
        .dm-iconbtn { background: none; border: 1px solid var(--border); color: var(--text); border-radius: 4px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .dm-avatar { margin-left: auto; width: 30px; height: 30px; border-radius: 50%; background: var(--panel-2); border: 1px solid var(--accent); color: var(--accent); font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .dm-body { flex: 1; padding: 22px 20px; display: flex; flex-direction: column; box-sizing: border-box; }
        .dm-h1 { font-family: 'Bebas Neue', sans-serif; font-size: 25px; color: var(--ink); letter-spacing: 0.01em; margin: 0 0 4px; }
        .dm-sub { font-size: 13px; color: var(--text-dim); margin: 0 0 20px; }
        .dm-field-label { font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
        .dm-input { width: 100%; background: var(--panel); border: 1px solid var(--border); color: var(--ink); font-size: 15px; padding: 11px 12px; border-radius: 4px; box-sizing: border-box; outline: none; }
        .dm-input:focus { border-color: var(--accent); }
        .dm-primary-btn { background: var(--accent); color: var(--accent-ink); border: none; border-radius: 4px; padding: 13px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 16px; }
        .dm-primary-btn:disabled { opacity: 0.35; cursor: default; }
        .dm-ghost-btn { background: none; color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 11px; font-size: 13.5px; cursor: pointer; width: 100%; }
        .dm-ghost-btn:hover { border-color: var(--border-strong); color: var(--ink); }
        .dm-or { text-align: center; font-size: 11px; color: var(--text-dim); margin: 16px 0 10px; }
        .dm-stack { display: flex; flex-direction: column; gap: 8px; }
        .dm-link { text-align: center; font-size: 13px; color: var(--text-dim); margin-top: 14px; background: none; border: none; cursor: pointer; text-decoration: underline; }

        .dm-dash-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .dm-bigavatar { width: 46px; height: 46px; border-radius: 50%; background: var(--panel-2); border: 1px solid var(--accent); color: var(--accent); font-family: 'Bebas Neue', sans-serif; font-size: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .dm-dash-greet { font-family: 'Bebas Neue', sans-serif; font-size: 19px; color: var(--ink); line-height: 1.1; }
        .dm-levelrow { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
        .dm-xpbar { height: 4px; background: var(--panel); border-radius: 2px; margin-top: 6px; overflow: hidden; }
        .dm-xpbar-fill { height: 100%; background: var(--accent); }

        .dm-statrow { display: flex; gap: 10px; margin-bottom: 22px; }
        .dm-statgrid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px; }
        .dm-statcard { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; flex: 1; }
        .dm-statcard .n { font-family: 'Bebas Neue', sans-serif; font-size: 22px; color: var(--ink); }
        .dm-statcard .l { font-size: 11px; color: var(--text-dim); }

        .dm-menu-row { display: flex; align-items: center; gap: 12px; padding: 13px 14px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; cursor: pointer; text-align: left; width: 100%; }
        .dm-menu-row .ico { width: 30px; height: 30px; border-radius: 6px; background: var(--panel-2); display: flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
        .dm-menu-row .t { font-size: 14px; color: var(--ink); font-weight: 500; }
        .dm-menu-row .s { font-size: 11px; color: var(--text-dim); }
        .dm-menu-row .chev { margin-left: auto; color: var(--text-dim); }

        .dm-tabs { display: flex; gap: 8px; margin-bottom: 18px; }
        .dm-tab { flex: 1; text-align: center; padding: 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 12.5px; color: var(--text-dim); cursor: pointer; background: var(--panel); }
        .dm-tab.active { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }

        .dm-mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .dm-mode-card { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 15px 13px; cursor: pointer; text-align: left; }
        .dm-mode-card .t { font-family: 'Bebas Neue', sans-serif; font-size: 19px; color: var(--ink); }
        .dm-mode-card .s { font-size: 10.5px; color: var(--text-dim); margin-top: 2px; }
        .dm-mode-card.soon { opacity: 0.4; cursor: default; }
        .dm-online-btn { border: 1px solid var(--accent); color: var(--accent); background: none; border-radius: 6px; padding: 14px; font-size: 14px; font-weight: 500; cursor: pointer; width: 100%; }

        .dm-profile-head { display: flex; flex-direction: column; align-items: center; padding: 6px 0 22px; }
        .dm-bigavatar2 { width: 60px; height: 60px; border-radius: 50%; background: var(--panel-2); border: 1px solid var(--accent); color: var(--accent); font-family: 'Bebas Neue', sans-serif; font-size: 20px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
        .dm-profile-name { font-family: 'Bebas Neue', sans-serif; font-size: 21px; color: var(--ink); }
        .dm-trend-box { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 20px; }
        .dm-trend-label { font-size: 11px; color: var(--text-dim); margin-bottom: 8px; }
        .dm-trend-empty { font-size: 12px; color: var(--text-dim); padding: 10px 0; }

        .dm-lobby-row { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; }
        .dm-lobby-row .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
        .dm-lobby-row .name { font-size: 14px; color: var(--ink); flex: 1; }
        .dm-lobby-row .avg { font-size: 12px; color: var(--text-dim); }
        .dm-searching { display: flex; flex-direction: column; align-items: center; padding: 40px 0; gap: 14px; }
        .dm-pulse { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); animation: dm-pulse 1s infinite ease-in-out; }
        @keyframes dm-pulse { 0%,100% { transform: scale(0.7); opacity: 0.5; } 50% { transform: scale(1.15); opacity: 1; } }

        .dm-viewfinder { position: relative; width: 240px; height: 240px; margin: 10px auto 20px; }
        .dm-viewfinder .corner { position: absolute; width: 22px; height: 22px; border: 2px solid var(--accent); }
        .dm-viewfinder .tl { top: 0; left: 0; border-right: none; border-bottom: none; }
        .dm-viewfinder .tr { top: 0; right: 0; border-left: none; border-bottom: none; }
        .dm-viewfinder .bl { bottom: 0; left: 0; border-right: none; border-top: none; }
        .dm-viewfinder .br { bottom: 0; right: 0; border-left: none; border-top: none; }
        .dm-viewfinder .board-wrap { position: absolute; inset: 20px; transition: opacity 0.4s; }
        .dm-scanline { position: absolute; left: 8px; right: 8px; height: 2px; background: var(--accent); opacity: 0.7; animation: dm-scan 1.3s linear infinite; }
        @keyframes dm-scan { 0% { top: 8px; } 100% { top: 232px; } }
        .dm-calib-status { text-align: center; font-size: 13px; color: var(--text-dim); margin-bottom: 4px; }
        .dm-calib-ok { text-align: center; font-size: 13px; color: var(--accent); margin-bottom: 4px; }

        .dm-hero { position: relative; height: 185px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 18px; background: #07120B; }
        .dm-hero img { width: 100%; height: 100%; object-fit: cover; object-position: center 46%; display: block; opacity: 0.82; }
        .dm-hero-overlay { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(2,8,4,0.92), rgba(2,8,4,0.35), rgba(2,8,4,0.7)); }
        .dm-hero-copy { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 18px; }
        .dm-hero-kicker, .dm-banner-kicker { color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: 0.16em; }
        .dm-hero-title, .dm-banner-title { font-family: 'Bebas Neue', sans-serif; color: var(--ink); font-size: 27px; letter-spacing: 0.04em; margin-top: 2px; }
        .dm-hero-sub, .dm-banner-sub { color: #B7C6BC; font-size: 11px; }
        .dm-home-banner { display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 9px; padding: 14px; margin-bottom: 16px; background: linear-gradient(135deg, #0E1A12, #07100A); overflow: hidden; }
        .dm-banner-board { width: 82px; height: 82px; flex-shrink: 0; opacity: 0.95; }
        .dm-banner-board svg { width: 100%; height: 100%; }
        .dm-viewfinder.real-camera { width: 100%; max-width: 380px; height: 285px; margin: 4px auto 14px; background: #020403; border-radius: 10px; overflow: hidden; border: 1px solid var(--border-strong); }
        .dm-camera-video { width: 100%; height: 100%; object-fit: cover; display: block; background: #020403; }
        .dm-camera-placeholder { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; color: var(--text); gap: 5px; font-size: 13px; }
        .dm-camera-placeholder span { color: var(--text-dim); font-size: 10px; }
        .dm-camera-icon { width: 42px; height: 42px; border: 1px solid var(--accent); color: var(--accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 4px; }
        .camera-guide-circle { position: absolute; width: 74%; aspect-ratio: 1; left: 13%; top: 13%; border: 2px dashed rgba(63,224,122,0.8); border-radius: 50%; box-shadow: 0 0 0 999px rgba(0,0,0,0.10); pointer-events: none; }
        .camera-guide-crosshair { position: absolute; width: 22px; height: 22px; left: calc(50% - 11px); top: calc(50% - 11px); border: 1px solid var(--accent); border-radius: 50%; pointer-events: none; }
        .camera-guide-crosshair:before, .camera-guide-crosshair:after { content: ''; position: absolute; background: var(--accent); opacity: 0.8; }
        .camera-guide-crosshair:before { width: 38px; height: 1px; left: -9px; top: 10px; }
        .camera-guide-crosshair:after { width: 1px; height: 38px; left: 10px; top: -9px; }
        .camera-tap-layer { position: absolute; inset: 0; border: 0; background: transparent; cursor: crosshair; z-index: 4; }
        .calibration-dot { position: absolute; width: 28px; height: 28px; transform: translate(-50%,-50%); border-radius: 50%; background: var(--accent); color: var(--accent-ink); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; z-index: 5; box-shadow: 0 0 0 3px rgba(63,224,122,0.25); pointer-events: none; }
        .dm-calibration-card { border: 1px solid var(--border); background: var(--panel); border-radius: 8px; padding: 11px 12px; margin-bottom: 2px; }
        .dm-calib-step { display: flex; gap: 10px; align-items: flex-start; padding: 7px 0; }
        .dm-calib-step > span { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border-strong); color: var(--text-dim); display: flex; align-items: center; justify-content: center; font-size: 10px; flex-shrink: 0; }
        .dm-calib-step > span.done { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
        .dm-calib-step b { display: block; font-size: 12px; color: var(--ink); }
        .dm-calib-step small { display: block; color: var(--text-dim); font-size: 10.5px; margin-top: 2px; }
        .dm-camera-error { border: 1px solid rgba(226,80,74,0.4); background: rgba(226,80,74,0.08); color: #F09A95; border-radius: 6px; padding: 9px 10px; font-size: 11px; line-height: 1.4; margin-bottom: 10px; }
        .dm-camera-tip { text-align: center; color: var(--text-dim); font-size: 10.5px; line-height: 1.4; margin-top: 10px; }

        .dm-scoreheads { display: flex; gap: 10px; margin-bottom: 12px; }
        .dm-scorehead { flex: 1; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; }
        .dm-scorehead .name { font-size: 11px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dm-scorehead .rem { font-family: 'Bebas Neue', sans-serif; font-size: 28px; line-height: 1.1; color: var(--ink); }
        .dm-turnlabel { text-align: center; font-size: 12px; color: var(--text-dim); margin-bottom: 8px; }
        .dm-checkout { text-align: center; font-size: 12px; color: var(--accent); margin-bottom: 8px; min-height: 16px; }
        .dm-board-holder { display: flex; justify-content: center; margin-bottom: 14px; }

        .dm-lastturn { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 8px; text-align: center; }
        .dm-lastturn-chips { display: flex; justify-content: center; gap: 6px; margin-bottom: 8px; min-height: 22px; }
        .dm-chip { background: var(--panel-2); border: 1px solid var(--border); border-radius: 4px; padding: 3px 8px; font-size: 11px; color: var(--ink); }
        .dm-lastturn-total { font-family: 'Bebas Neue', sans-serif; font-size: 38px; color: var(--ink); line-height: 1.05; }
        .dm-lastturn-total.bust { color: var(--err); }
        .dm-lastturn-quality { font-size: 12.5px; color: var(--accent); margin: 2px 0 6px; min-height: 16px; }
        .dm-lastturn-rem { font-size: 12px; color: var(--text-dim); margin-bottom: 12px; }
        .dm-turn-actions { display: flex; gap: 8px; }
        .dm-turn-actions button { flex: 1; padding: 9px; font-size: 12.5px; }

        .dm-overlay { position: absolute; inset: 0; background: rgba(4,10,6,0.92); display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; padding: 24px; }
        .dm-flash180 { font-family: 'Bebas Neue', sans-serif; font-size: 38px; color: var(--accent); letter-spacing: 0.02em; }
        .dm-gameover-title { font-family: 'Bebas Neue', sans-serif; font-size: 27px; color: var(--ink); margin-bottom: 6px; }
        .dm-gameover-sub { font-size: 13px; color: var(--text-dim); margin-bottom: 22px; }
        .dm-gameover-actions { display: flex; gap: 10px; width: 100%; max-width: 240px; }
        .dm-relative { position: relative; flex: 1; display: flex; flex-direction: column; }

        .dm-chall-card { background: var(--panel); border: 1px solid var(--accent); border-radius: 8px; padding: 16px; margin-bottom: 14px; }
        .dm-chall-title { font-family: 'Bebas Neue', sans-serif; font-size: 19px; color: var(--ink); margin-bottom: 2px; }
        .dm-chall-desc { font-size: 12px; color: var(--text-dim); margin-bottom: 12px; }
        .dm-chall-bar { height: 6px; background: var(--panel-2); border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
        .dm-chall-bar-fill { height: 100%; background: var(--accent); }
        .dm-chall-rewards { display: flex; gap: 14px; font-size: 12px; color: var(--accent); }
        .dm-chall-row { display: flex; align-items: center; gap: 10px; padding: 12px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; }
        .dm-chall-row .t { font-size: 13.5px; color: var(--ink); flex: 1; }
        .dm-chall-row .p { font-size: 12px; color: var(--text-dim); }
      `}</style>

      <div className="dm-shell">
        {screen === "loading" && <div style={{ padding: 24 }} />}

        {screen === "login" && (
          <>
            <Header title="Dark Mind" />
            <div className="dm-body">
              <div className="dm-hero">
                <img src="/assets/dartmind-hero.png" alt="Dark Mind darts experience" />
                <div className="dm-hero-overlay" />
                <div className="dm-hero-copy"><div className="dm-hero-kicker">DARK MIND</div><div className="dm-hero-title">PLAY. IMPROVE. COMPETE.</div><div className="dm-hero-sub">Your darts. Your data. Your game.</div></div>
              </div>
              <div className="dm-h1">Your game. Your stats.</div>
              <div className="dm-sub">Create a profile to track averages, checkouts and games as you play.</div>
              <div className="dm-field-label">Your name</div>
              <input
                className="dm-input"
                placeholder="Enter your name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateAccount(); }}
              />
              <button className="dm-primary-btn" onClick={() => handleCreateAccount()} disabled={!nameInput.trim()}>
                Create account
              </button>
              <div className="dm-or">or continue with</div>
              <div className="dm-stack">
                <button className="dm-ghost-btn" onClick={() => handleCreateAccount(nameInput.trim() || "Player")}>Continue with Google</button>
                <button className="dm-ghost-btn" onClick={() => handleCreateAccount(nameInput.trim() || "Player")}>Continue with Apple</button>
              </div>
              <button className="dm-link" onClick={() => handleCreateAccount(nameInput.trim() || "Guest")}>Continue as guest</button>
            </div>
          </>
        )}

        {screen === "home" && profile && (
          <>
            <Header title="Dark Mind" showProfile />
            <div className="dm-body">
              <div className="dm-home-banner">
                <div><div className="dm-banner-kicker">DARK MIND</div><div className="dm-banner-title">LET'S THROW.</div><div className="dm-banner-sub">Camera scoring is coming to your setup.</div></div>
                <div className="dm-banner-board"><MiniBoard board={board} /></div>
              </div>
              <div className="dm-dash-head">
                <div className="dm-bigavatar">{initials(profile.name)}</div>
                <div style={{ flex: 1 }}>
                  <div className="dm-dash-greet">Welcome back, {profile.name}</div>
                  <div className="dm-levelrow">Level {level} &middot; {xpIntoLevel}/500 XP</div>
                  <div className="dm-xpbar"><div className="dm-xpbar-fill" style={{ width: Math.round((xpIntoLevel / 500) * 100) + "%" }} /></div>
                </div>
              </div>
              <div className="dm-statgrid2">
                <div className="dm-statcard"><div className="n">{avg.toFixed(1)}</div><div className="l">3-dart average</div></div>
                <div className="dm-statcard"><div className="n">{profile.gamesPlayed}</div><div className="l">games played</div></div>
                <div className="dm-statcard"><div className="n">{profile.total180s}</div><div className="l">180s</div></div>
                <div className="dm-statcard"><div className="n">{profile.bestCheckout}</div><div className="l">highest checkout</div></div>
              </div>
              <button className="dm-menu-row" onClick={() => setScreen("modes")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" fill="none" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /></svg></div>
                <div><div className="t">Play game</div><div className="s">Choose a game mode</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("trainingSoon")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 13 L14 3" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M2 13 L4 13.6 L1.4 14.6 Z" fill="currentColor" /></svg></div>
                <div><div className="t">Training mode</div><div className="s">Improve your skills</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("lobby")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="6" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.3" fill="none" /><circle cx="11" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.3" fill="none" /></svg></div>
                <div><div className="t">Play online</div><div className="s">Challenge players worldwide</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("stats")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 13 V8 M8 13 V4 M13 13 V10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg></div>
                <div><div className="t">Stats and progress</div><div className="s">Track your journey</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("challenges")} style={{ marginBottom: 0 }}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" fill="none" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /></svg></div>
                <div><div className="t">Challenges</div><div className="s">Daily and weekly goals</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
            </div>
          </>
        )}

        {screen === "modes" && (
          <>
            <Header title="Choose a game" onBack={() => setScreen("home")} />
            <div className="dm-body">
              <div className="dm-tabs">
                <div className="dm-tab active">Popular</div>
                <div className="dm-tab">Training</div>
                <div className="dm-tab">All</div>
              </div>
              <div className="dm-mode-grid">
                {MODE_TILES.map((m) => (
                  <div
                    key={m.key}
                    className={"dm-mode-card" + (m.playable ? "" : " soon")}
                    onClick={m.playable ? () => startLocalGame(m.key) : undefined}
                  >
                    <div className="t">{m.label}</div>
                    <div className="s">{m.playable ? m.desc : "Coming soon"}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {screen === "trainingSoon" && (
          <>
            <Header title="Training mode" onBack={() => setScreen("home")} />
            <div className="dm-body">
              <div className="dm-h1">Coming soon</div>
              <div className="dm-sub">Guided practice drills for doubles, checkouts and scoring are on the way.</div>
            </div>
          </>
        )}

        {screen === "stats" && profile && (
          <>
            <Header title="Your stats" onBack={() => setScreen("home")} />
            <div className="dm-body">
              <div className="dm-profile-head">
                <div className="dm-bigavatar2">{initials(profile.name)}</div>
                <div className="dm-profile-name">{profile.name}</div>
              </div>
              <div className="dm-statgrid2">
                <div className="dm-statcard"><div className="n">{profile.gamesPlayed}</div><div className="l">games played</div></div>
                <div className="dm-statcard"><div className="n">{winRate}%</div><div className="l">win rate</div></div>
                <div className="dm-statcard"><div className="n">{avg.toFixed(1)}</div><div className="l">3-dart average</div></div>
                <div className="dm-statcard"><div className="n">{profile.bestCheckout}</div><div className="l">highest checkout</div></div>
              </div>
              <div className="dm-trend-box">
                <div className="dm-trend-label">Average trend (last {(profile.history || []).length} games)</div>
                {(profile.history || []).length >= 2 ? (
                  <svg viewBox="0 0 280 60" width="100%" height="60">
                    {(() => {
                      const hist = profile.history;
                      const max = Math.max(...hist.map((h) => h.avg), 1);
                      const min = Math.min(...hist.map((h) => h.avg), 0);
                      const range = Math.max(max - min, 1);
                      const step = 280 / (hist.length - 1);
                      const pts = hist.map((h, i) => (i * step).toFixed(1) + "," + (55 - ((h.avg - min) / range) * 50).toFixed(1));
                      return <polyline points={pts.join(" ")} fill="none" stroke="#3FE07A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
                    })()}
                  </svg>
                ) : (
                  <div className="dm-trend-empty">Play a few games to see your trend.</div>
                )}
              </div>
              <button className="dm-ghost-btn" onClick={handleLogOut}>Log out</button>
            </div>
          </>
        )}

        {screen === "challenges" && profile && (
          <>
            <Header title="Challenges" onBack={() => setScreen("home")} />
            <div className="dm-body">
              <div className="dm-tabs">
                <div className={"dm-tab" + (challengeTab === "daily" ? " active" : "")} onClick={() => setChallengeTab("daily")}>Daily</div>
                <div className={"dm-tab" + (challengeTab === "weekly" ? " active" : "")} onClick={() => setChallengeTab("weekly")}>Weekly</div>
                <div className={"dm-tab" + (challengeTab === "special" ? " active" : "")} onClick={() => setChallengeTab("special")}>Special</div>
              </div>
              {challengeTab === "daily" ? (
                <>
                  <div className="dm-chall-card">
                    <div className="dm-chall-title">Checkout 100</div>
                    <div className="dm-chall-desc">Hit a checkout of 100 or more in a game.</div>
                    <div className="dm-chall-bar"><div className="dm-chall-bar-fill" style={{ width: profile.bestCheckout >= 100 ? "100%" : "0%" }} /></div>
                    <div className="dm-chall-rewards"><span>+250 XP</span><span>Badge</span></div>
                  </div>
                  <div className="dm-chall-row"><div className="t">Hit 5x T20</div><div className="p">0/5</div></div>
                  <div className="dm-chall-row"><div className="t">Checkout 50+</div><div className="p">{profile.bestCheckout >= 50 ? "1/1" : "0/1"}</div></div>
                </>
              ) : (
                <div className="dm-trend-empty">Coming soon.</div>
              )}
            </div>
          </>
        )}

        {screen === "lobby" && (
          <>
            <Header title="Play online" onBack={() => setScreen("home")} />
            <div className="dm-body">
              {searching ? (
                <div className="dm-searching">
                  <div className="dm-pulse" />
                  <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Searching for an opponent...</div>
                </div>
              ) : (
                <>
                  <button className="dm-online-btn" style={{ marginBottom: 20 }} onClick={startOnlineSearch}>Quick match</button>
                  <div className="dm-field-label">Players online</div>
                  {LOBBY.map((p) => (
                    <div className="dm-lobby-row" key={p.name}>
                      <div className="dot" />
                      <div className="name">{p.name}</div>
                      <div className="avg">avg {p.avg}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {screen === "calibrate" && gameConfig && (
          <>
            <Header title={gameConfig.mode + " vs " + gameConfig.opponentName} onBack={() => { stopCamera(); setScreen(gameConfig.online ? "lobby" : "home"); }} />
            <div className="dm-body">
              <div className="dm-camera-intro">
                <div className="dm-h1">Set up your camera</div>
                <div className="dm-sub">Keep your phone still, use the rear camera and get the whole board inside the guide.</div>
              </div>
              <div className={"dm-viewfinder real-camera" + (cameraReady ? " live" : "")}>
                <video ref={videoRef} className="dm-camera-video" playsInline muted autoPlay />
                {!cameraReady && <div className="dm-camera-placeholder"><div className="dm-camera-icon">◉</div><div>Camera preview</div><span>Dark Mind will use your rear camera.</span></div>}
                <div className="camera-guide-circle" />
                <div className="camera-guide-crosshair" />
                <div className="corner tl" /><div className="corner tr" /><div className="corner bl" /><div className="corner br" />
                {calibrationPoints.map((p, i) => (
                  <div key={p.label} className="calibration-dot" style={{ left: p.x + "%", top: p.y + "%" }}><span>{i + 1}</span></div>
                ))}
                {calibrating && <div className="dm-scanline" />}
                <button className="camera-tap-layer" onClick={handleCalibrationTap} aria-label="Tap calibration point" />
              </div>
              {cameraError && <div className="dm-camera-error">{cameraError}</div>}
              {!cameraStarted && !cameraError && <button className="dm-primary-btn" onClick={startCamera}>Enable camera</button>}
              {cameraStarted && !calibrated && (
                <div className="dm-calibration-card">
                  <div className="dm-calib-step"><span className={calibrationStep >= 0 ? "done" : ""}>1</span><div><b>Centre the bull</b><small>Tap the exact centre of the bull on the live camera.</small></div></div>
                  <div className="dm-calib-step"><span className={calibrationStep >= 1 ? "done" : ""}>2</span><div><b>Mark the 20 outer edge</b><small>Tap the outside edge of the doubles ring at 20.</small></div></div>
                  <div className="dm-calib-step"><span className={calibrationStep >= 2 ? "done" : ""}>3</span><div><b>Lock calibration</b><small>Dark Mind uses those points to map the board.</small></div></div>
                </div>
              )}
              {calibrated ? (
                <>
                  <div className="dm-calib-ok">✓ Board calibrated and ready</div>
                  <button className="dm-primary-btn" onClick={beginGame}>Start game</button>
                </>
              ) : (
                <button className="dm-primary-btn" onClick={runCalibration} disabled={!cameraReady || calibrationStep < 2 || calibrating}>
                  {calibrating ? "Locking calibration..." : "Calibrate board"}
                </button>
              )}
              <div className="dm-camera-tip">💡 Best setup: camera roughly level with the board, as square-on as possible, with the full board visible and even lighting.</div>
            </div>
          </>
        )}

        {screen === "game" && players && (
          <>
            <Header title={gameConfig.mode} onBack={() => setScreen("home")} />
            <div className="dm-body dm-relative">
              <div className="dm-scoreheads">
                <div className="dm-scorehead" style={{ borderColor: turnIndex === 0 ? "#3FE07A" : "#1E2B22" }}>
                  <div className="name">{players[0].name}</div>
                  <div className="rem">{turnIndex === 0 ? liveRemainingForCurrent : players[0].remaining}</div>
                </div>
                <div className="dm-scorehead" style={{ borderColor: turnIndex === 1 ? "#D7DEDA" : "#1E2B22" }}>
                  <div className="name">{players[1].name}</div>
                  <div className="rem">{turnIndex === 1 ? liveRemainingForCurrent : players[1].remaining}</div>
                </div>
              </div>
              <div className="dm-turnlabel">{turnIndex === 0 ? "Your turn" : players[1].name + "'s turn"}</div>
              <div className="dm-checkout">{checkout ? "Checkout: " + checkout.join(" \u00b7 ") : ""}</div>
              <div className="dm-board-holder">
                <svg
                  ref={boardRef}
                  viewBox="0 0 400 400"
                  width="260"
                  height="260"
                  style={{ opacity: bustPending || turnThrows.length >= 3 || gameOver ? 0.55 : 1, pointerEvents: bustPending || turnThrows.length >= 3 || gameOver ? "none" : "auto" }}
                >
                  <circle cx={cx} cy={cy} r={RAD.missOuter} fill="#1a1d22" stroke="#1E2B22" strokeWidth="1" onClick={(e) => handleBoardClick(e, "Miss", 0, false)} />
                  {board.wedges.map((w) => (
                    <path key={w.key} d={w.d} fill={w.fill} stroke="#05070a" strokeWidth="0.75" onClick={(e) => handleBoardClick(e, w.key, w.value, w.isDouble)} />
                  ))}
                  <circle cx={cx} cy={cy} r={RAD.bullOuter} fill="#1f7a48" stroke="#05070a" strokeWidth="0.75" onClick={(e) => handleBoardClick(e, "Bull", 25, false)} />
                  <circle cx={cx} cy={cy} r={RAD.bullInner} fill="#b1332c" stroke="#05070a" strokeWidth="0.75" onClick={(e) => handleBoardClick(e, "D-Bull", 50, true)} />
                  {board.labels.map((l) => (
                    <text key={l.num} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontFamily="Inter" fontWeight="500" fill="#B9C0C9">{l.num}</text>
                  ))}
                  {turnThrows.filter((t) => t.x != null).map((t, i) => (
                    <circle key={i} cx={t.x} cy={t.y} r="5" fill={turnIndex === 0 ? "#3FE07A" : "#D7DEDA"} stroke="#05070a" strokeWidth="1" />
                  ))}
                </svg>
              </div>

              <div className="dm-lastturn">
                <div className="dm-lastturn-chips">
                  {turnThrows.map((t, i) => (<div className="dm-chip" key={i}>{t.label}</div>))}
                </div>
                <div className={"dm-lastturn-total" + (bustPending ? " bust" : "")}>{bustPending ? "Bust" : turnSoFarValue}</div>
                <div className="dm-lastturn-quality">{bustPending ? "No score this turn" : qualityLabel(turnSoFarValue)}</div>
                <div className="dm-lastturn-rem">Remaining: {bustPending ? currentPlayer.remaining : liveRemainingForCurrent}</div>
                <div className="dm-turn-actions">
                  <button className="dm-ghost-btn" onClick={handleUndo} disabled={turnThrows.length === 0}>Undo</button>
                  <button className="dm-ghost-btn" onClick={handleMissButton} disabled={bustPending || turnThrows.length >= 3}>Miss</button>
                  <button className="dm-primary-btn" style={{ marginTop: 0 }} onClick={handleNextPlayer} disabled={turnThrows.length === 0 && !bustPending}>Next player</button>
                </div>
              </div>

              {flash === "180" && (
                <div className="dm-overlay">
                  <div className="dm-flash180">ONE HUNDRED AND EIGHTY</div>
                </div>
              )}
              {gameOver && (
                <div className="dm-overlay">
                  <div className="dm-gameover-title">{gameOver.winnerIdx === 0 ? "Game shot!" : players[1].name + " wins"}</div>
                  <div className="dm-gameover-sub">{gameOver.winnerIdx === 0 ? "Checked out on " + gameOver.finishValue : "Better luck next leg"}</div>
                  <div className="dm-gameover-actions">
                    <button className="dm-ghost-btn" onClick={() => setScreen("home")}>Home</button>
                    <button className="dm-primary-btn" style={{ marginTop: 0 }} onClick={() => { setCalibrated(true); beginGame(); }}>Play again</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniBoard(props) {
  const board = props.board;
  return (
    <svg viewBox="0 0 400 400" width="100%" height="100%">
      {board.wedges.map((w) => (
        <path key={w.key} d={w.d} fill={w.fill} stroke="#05070a" strokeWidth="0.75" />
      ))}
      <circle cx="200" cy="200" r={RAD.bullOuter} fill="#1f7a48" stroke="#05070a" strokeWidth="0.75" />
      <circle cx="200" cy="200" r={RAD.bullInner} fill="#b1332c" stroke="#05070a" strokeWidth="0.75" />
    </svg>
  );
}
