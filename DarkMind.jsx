import { useState, useEffect, useRef, useMemo } from "react";
import { ALL_SEGMENTS, findCheckout, isBustThrow, sumThrows } from "./src/scoringEngine.js";

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
    wedges.push({ key: "S" + num + "o", label: "S" + num, value: num, isDouble: false, d: wedgePath(cx, cy, RAD.tripleOuter, RAD.doubleInner, a0, a1), fill: singleColor });
    wedges.push({ key: "T" + num, value: num * 3, isDouble: false, d: wedgePath(cx, cy, RAD.tripleInner, RAD.tripleOuter, a0, a1), fill: hitColor });
    wedges.push({ key: "S" + num + "i", label: "S" + num, value: num, isDouble: false, d: wedgePath(cx, cy, RAD.bullOuter, RAD.tripleInner, a0, a1), fill: singleColor });
  });
  const labels = ORDER.map((num, k) => {
    const pos = polar(cx, cy, RAD.doubleOuter + 13, k * 18);
    return { num, x: pos.x, y: pos.y };
  });
  return { wedges, labels };
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
  { key: "501", label: "501", desc: "Classic 501, double out", playable: true },
  { key: "301", label: "301", desc: "Fast paced game", playable: true },
  { key: "cricket", label: "Cricket", desc: "Mark and close", playable: false },
  { key: "clock", label: "Around the clock", desc: "Hit each number in order", playable: false },
  { key: "shanghai", label: "Shanghai", desc: "Single, double, triple on one number", playable: false },
  { key: "highscore", label: "High score", desc: "3 darts, highest total", playable: false },
  { key: "killer", label: "Killer", desc: "Take out your opponents", playable: false },
  { key: "countup", label: "Count up", desc: "See how high you can go", playable: false },
];

const SCORE_OPTIONS = [
  { key: "manual", label: "Manual scoring", desc: "Tap the virtual dartboard to score as normal.", playable: true },
  { key: "liv", label: "Liv scoring", desc: "Keep the camera visible after calibration and score from the live board image.", playable: true },
];
const LOCAL_SCORING_OPTIONS = [
  { key: "manual", label: "Virtual Board", desc: "Use the existing manual dartboard scoring.", playable: true },
  { key: "liv", label: "Camera", desc: "Use the live camera scoring flow.", playable: true },
  { key: "voice", label: "Voice", desc: "Voice scoring is coming next.", playable: true },
];
const CALIBRATION_STORAGE_KEY = "darkmind_board_calibration";

function emptyProfile(name) {
  return { name, gamesPlayed: 0, gamesWon: 0, totalPoints: 0, totalDarts: 0, total180s: 0, bestCheckout: 0, history: [] };
}

function initPlayer(name, startScore) {
  return { name, remaining: startScore, dartsThrown: 0, pointsScored: 0 };
}

function emptyPlayerStats(name) {
  return {
    name,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    legsPlayed: 0,
    legsWon: 0,
    totalPoints: 0,
    totalDarts: 0,
    total180s: 0,
    total140Plus: 0,
    total100Plus: 0,
    checkoutAttempts: 0,
    checkoutHits: 0,
    highestCheckout: 0,
    bestLegDarts: null,
    firstNinePoints: 0,
    firstNineDarts: 0,
  };
}

function createMatchLog(name) {
  return {
    name,
    darts: [],
    turnTotals: [],
    checkoutAttempts: 0,
    checkoutHits: 0,
  };
}

function buildStatsStore() {
  return { players: {}, games: [] };
}

function loadStatsStore() {
  if (typeof window === "undefined") return buildStatsStore();
  try {
    const raw = window.localStorage.getItem("darkmind_stats_store_v1");
    if (!raw) return buildStatsStore();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        players: parsed.players || {},
        games: Array.isArray(parsed.games) ? parsed.games : [],
      };
    }
  } catch (e) {}
  return buildStatsStore();
}

function saveStatsStore(store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("darkmind_stats_store_v1", JSON.stringify(store));
  } catch (e) {}
}

function getPlayerStatsRecord(store, playerName) {
  const name = (playerName || "").trim() || "Player";
  const existing = store.players[name];
  if (existing) return existing;
  const record = emptyPlayerStats(name);
  store.players[name] = record;
  return record;
}

function getAverage(points, darts) {
  if (!darts) return 0;
  return (points / darts) * 3;
}

function getFirstNineAverage(darts) {
  if (!darts || darts.length === 0) return 0;
  const sample = darts.slice(0, 9);
  const total = sample.reduce((sum, value) => sum + value, 0);
  return total / sample.length;
}

function normalizeGameRecord(game) {
  return {
    id: game.id || Date.now() + Math.random(),
    date: game.date || new Date().toISOString(),
    gameType: game.gameType || "501",
    players: game.players || [],
    winnerName: game.winnerName || "",
    winnerIdx: game.winnerIdx ?? 0,
    finishValue: game.finishValue || 0,
    result: game.result || "",
  };
}

function normalizePlayerNames(names) {
  return names
    .map((name, index) => {
      const cleaned = (name || "").trim();
      return cleaned || `Player ${index + 1}`;
    })
    .filter((name, index, arr) => name || index < arr.length);
}

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

function formatShortDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch (e) {
    return value;
  }
}

function formatPercent(value) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value)}%`;
}

function formatAverage(value) {
  if (!Number.isFinite(value) || value <= 0) return "0.0";
  return value.toFixed(1);
}

function saveCalibrationToLocalStorage(calibration) {
  try {
    window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibration));
  } catch (e) {}
}

function getCalibrationGeometry(calibrationPoints, frameWidth, frameHeight) {
  if (!calibrationPoints || calibrationPoints.length < 2) return null;
  const bull = {
    x: (calibrationPoints[0].x / 100) * frameWidth,
    y: (calibrationPoints[0].y / 100) * frameHeight,
  };
  const edge20 = {
    x: (calibrationPoints[1].x / 100) * frameWidth,
    y: (calibrationPoints[1].y / 100) * frameHeight,
  };
  const dx = edge20.x - bull.x;
  const dy = edge20.y - bull.y;
  const scale = Math.hypot(dx, dy) / RAD.doubleOuter;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return {
    center: bull,
    scale,
    angle: Math.atan2(dy, dx),
  };
}

function mapImagePointToThrow(point, geometry, frameWidth, frameHeight) {
  if (!geometry || !point) return null;
  const dx = point.x - geometry.center.x;
  const dy = point.y - geometry.center.y;
  const radius = Math.hypot(dx, dy) / geometry.scale;
  const angle = Math.atan2(dy, dx) - geometry.angle;
  const angleDeg = ((angle * 180) / Math.PI + 360) % 360;
  const signedAngle = angleDeg > 180 ? angleDeg - 360 : angleDeg;
  const wedgeIndex = ((Math.floor((signedAngle + 9) / 18) % ORDER.length) + ORDER.length) % ORDER.length;
  const segmentNumber = ORDER[wedgeIndex];

  let label = "Miss";
  let value = 0;
  let isDouble = false;

  if (radius <= RAD.bullInner) {
    label = "D-Bull";
    value = 50;
    isDouble = true;
  } else if (radius <= RAD.bullOuter) {
    label = "25 / Outer Bull";
    value = 25;
  } else if (radius <= RAD.tripleInner) {
    label = "S" + segmentNumber;
    value = segmentNumber;
  } else if (radius <= RAD.tripleOuter) {
    label = "T" + segmentNumber;
    value = segmentNumber * 3;
  } else if (radius <= RAD.doubleInner) {
    label = "S" + segmentNumber;
    value = segmentNumber;
  } else if (radius <= RAD.doubleOuter) {
    label = "D" + segmentNumber;
    value = segmentNumber * 2;
    isDouble = true;
  } else if (radius <= RAD.missOuter) {
    label = "Miss";
    value = 0;
  }

  return { label, value, isDouble, x: point.x / frameWidth * 100, y: point.y / frameHeight * 100 };
}

export default function DartMind() {
  const [screen, setScreen] = useState("loading");
  const [profile, setProfile] = useState(null);
  const [statsStore, setStatsStore] = useState(() => loadStatsStore());
  const [nameInput, setNameInput] = useState("");
  const [gameConfig, setGameConfig] = useState(null);
  const [pendingMode, setPendingMode] = useState(null);
  const [localPlayers, setLocalPlayers] = useState(["Player 1", "Player 2"]);
  const [localGameMode, setLocalGameMode] = useState(501);
  const [localScoringType, setLocalScoringType] = useState("manual");
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
  const [visitNumber, setVisitNumber] = useState(1);
  const [challengeTab, setChallengeTab] = useState("daily");
  const [modeTab, setModeTab] = useState("popular");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [savedCalibration, setSavedCalibration] = useState(null);
  const [detectedPoint, setDetectedPoint] = useState(null);
  const [pendingScore, setPendingScore] = useState(null);
  const matchLogsRef = useRef([]);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const boardRef = useRef(null);
  const detectionCanvasRef = useRef(null);
  const detectionRef = useRef({
    prevFrame: null,
    isTracking: false,
    trackingStart: 0,
    pendingPoint: null,
    lastScoredAt: 0,
  });
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.points) && parsed.points.length >= 2) {
        setSavedCalibration(parsed);
        setCalibrationPoints(parsed.points);
        setCalibrationStep(2);
        setCalibrated(true);
      }
    } catch (e) {}
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

  function startLocalGame(mode, scoringType = "manual") {
    const startScore = mode === "301" ? 301 : 501;
    setGameConfig({ mode, opponentName: "Alex", online: false, startScore, scoringType, players: [profile?.name || "You", "Alex"] });
    setPendingMode(null);
    setCameraError("");
    if (scoringType === "liv") {
      setScreen("calibrate");
      return;
    }
    beginGame({
      mode,
      startScore,
      scoringType,
      players: [profile?.name || "You", "Alex"],
    });
  }

  function addLocalPlayer() {
    if (localPlayers.length >= 8) return;
    setLocalPlayers((current) => [...current, `Player ${current.length + 1}`]);
  }

  function removeLocalPlayer(index) {
    if (localPlayers.length <= 1) return;
    setLocalPlayers((current) => current.filter((_, i) => i !== index));
  }

  function updateLocalPlayer(index, value) {
    setLocalPlayers((current) => current.map((player, playerIndex) => (playerIndex === index ? value : player)));
  }

  function startLocalMultiplayerGame() {
    const players = normalizePlayerNames(localPlayers);
    const startScore = localGameMode === 301 ? 301 : 501;
    const nextGameConfig = {
      mode: String(localGameMode),
      opponentName: players[1] || players[0],
      online: false,
      startScore,
      scoringType: localScoringType,
      players,
    };

    setGameConfig(nextGameConfig);
    setCameraError("");
    setPendingMode(null);

    if (localScoringType === "liv") {
      setScreen("calibrate");
      return;
    }

    const preparedPlayers = players.map((name) => initPlayer(name, startScore));
    setPlayers(preparedPlayers);
    setTurnIndex(0);
    setTurnThrows([]);
    setBustPending(false);
    setGameOver(null);
    setUser180s(0);
    setDetectedPoint(null);
    setPendingScore(null);
    setVisitNumber(1);
    setScreen("game");
  }

  function startOnlineSearch() {
    setSearching(true);
    setTimeout(() => {
      const opp = LOBBY[Math.floor(Math.random() * LOBBY.length)];
      setGameConfig({ mode: "501", opponentName: opp.name, online: true, startScore: 501, scoringType: "manual" });
      setSearching(false);
      setPendingMode(null);
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
    const keepCameraForLivGame = screen === "game" && gameConfig?.scoringType === "liv";
    if (screen === "calibrate" || keepCameraForLivGame) return;
    stopCamera();
  }, [screen, gameConfig?.scoringType]);

  useEffect(() => {
    if (!videoRef.current || !cameraStreamRef.current) return;
    if (screen === "calibrate" || (screen === "game" && gameConfig?.scoringType === "liv")) {
      videoRef.current.srcObject = cameraStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [screen, cameraReady, gameConfig?.scoringType]);

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
      const calibration = {
        points: calibrationPoints,
        savedAt: Date.now(),
      };
      setSavedCalibration(calibration);
      saveCalibrationToLocalStorage(calibration);
      setCalibrating(false);
      setCalibrated(true);
      playToneSequence([523, 659, 784]);
    }, 650);
  }

  function beginGame(overrides = {}) {
    const startScore = overrides.startScore ?? gameConfig?.startScore ?? 501;
    const playerNames = overrides.players ?? gameConfig?.players ?? [profile?.name || "You", gameConfig?.opponentName || "Alex"];
    const playersToUse = playerNames.map((name) => initPlayer(name, startScore));

    matchLogsRef.current = playersToUse.map((player) => createMatchLog(player.name));
    setPlayers(playersToUse);
    setTurnIndex(0);
    setTurnThrows([]);
    setBustPending(false);
    setGameOver(null);
    setUser180s(0);
    setDetectedPoint(null);
    setPendingScore(null);
    setVisitNumber(1);
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

  function applyTurnScore(pIdx, thrown, totalOverride, isWin, finishValue, basePlayers = players) {
    const turnTotal = totalOverride != null ? totalOverride : sumThrows(thrown);
    const list = [...basePlayers];
    const playerLog = matchLogsRef.current[pIdx] || createMatchLog(list[pIdx].name);
    if (playerLog) {
      playerLog.turnTotals.push(turnTotal);
      playerLog.total180s = turnTotal === 180 ? (playerLog.total180s || 0) + 1 : playerLog.total180s || 0;
      playerLog.total140Plus = turnTotal >= 140 ? (playerLog.total140Plus || 0) + 1 : playerLog.total140Plus || 0;
      playerLog.total100Plus = turnTotal >= 100 ? (playerLog.total100Plus || 0) + 1 : playerLog.total100Plus || 0;
    }
    list[pIdx] = {
      ...list[pIdx],
      remaining: list[pIdx].remaining - turnTotal,
      dartsThrown: list[pIdx].dartsThrown || 0,
      pointsScored: list[pIdx].pointsScored + turnTotal,
    };
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
    const turnSoFar = sumThrows(turnThrows);
    const liveRemaining = committedRemaining - turnSoFar;
    const newLive = liveRemaining - throwObj.value;
    const playerLog = matchLogsRef.current[pIdx] || createMatchLog(players[pIdx].name);
    const isBust = isBustThrow({ currentRemaining: committedRemaining, turnThrows, nextThrow: throwObj });
    const dartsLeftBeforeThrow = 3 - turnThrows.length;
    const wasOnCheckout = Boolean(findCheckout(liveRemaining, dartsLeftBeforeThrow));
    const isFinishAttemptDart = Boolean(throwObj.isDouble || throwObj.value === 25 || throwObj.value === 50);
    const countedCheckoutAttempt = wasOnCheckout && isFinishAttemptDart;
    const recordedThrow = { ...throwObj, countedCheckoutAttempt };
    const newTurnThrows = [...turnThrows, recordedThrow];

    playerLog.darts.push(recordedThrow.value);
    if (countedCheckoutAttempt) {
      playerLog.checkoutAttempts = (playerLog.checkoutAttempts || 0) + 1;
    }

    const updatedPlayers = [...players];
    updatedPlayers[pIdx] = {
      ...updatedPlayers[pIdx],
      dartsThrown: updatedPlayers[pIdx].dartsThrown + 1,
    };
    setPlayers(updatedPlayers);
    setTurnThrows(newTurnThrows);

    if (isBust) {
      setBustPending(true);
      return;
    }

    if (newLive === 0) {
      const turnTotal = turnSoFar + throwObj.value;
      playerLog.checkoutHits += 1;
      applyTurnScore(pIdx, newTurnThrows, turnTotal, true, throwObj.value, updatedPlayers);
    }
  }

  function handleBoardClick(evt, label, value, isDouble) {
    const pt = getSvgPoint(evt);
    applyThrow({ label, value, isDouble: !!isDouble, x: pt.x, y: pt.y });
  }

  function captureReferenceFrame() {
    if (!videoRef.current || !cameraReady || !videoRef.current.videoWidth) return;
    const canvas = detectionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const sampleWidth = 160;
    const sampleHeight = 120;
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    ctx.drawImage(videoRef.current, 0, 0, sampleWidth, sampleHeight);
    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    detectionRef.current.referenceFrame = {
      data: new Uint8ClampedArray(imageData.data),
      width: sampleWidth,
      height: sampleHeight,
    };
    detectionRef.current.pendingPoint = null;
    setDetectedPoint(null);
    setPendingScore(null);
  }

  function scheduleReferenceCapture() {
    setTimeout(() => {
      captureReferenceFrame();
    }, 180);
  }

  function confirmDetectedThrow() {
    if (!pendingScore) return;
    const throwObj = {
      label: pendingScore.label,
      value: pendingScore.value,
      isDouble: !!pendingScore.isDouble,
      x: pendingScore.point.x,
      y: pendingScore.point.y,
    };
    applyThrow(throwObj);
    setPendingScore(null);
    setDetectedPoint(null);
    scheduleReferenceCapture();
  }

  function dismissDetectedThrow() {
    setPendingScore(null);
    setDetectedPoint(null);
    scheduleReferenceCapture();
  }

  function handleDetectedThrow(point) {
    if (!savedCalibration || !videoRef.current || !players || !gameConfig || gameConfig.scoringType !== "liv") return;
    const frameWidth = videoRef.current.videoWidth || videoRef.current.clientWidth || 360;
    const frameHeight = videoRef.current.videoHeight || videoRef.current.clientHeight || 240;
    const geometry = getCalibrationGeometry(savedCalibration.points, frameWidth, frameHeight);
    if (!geometry) return;
    const mapped = mapImagePointToThrow(point, geometry, frameWidth, frameHeight);
    if (!mapped || mapped.value === 0) return;
    setDetectedPoint(mapped);
    setPendingScore({
      label: mapped.label,
      value: mapped.value,
      isDouble: !!mapped.isDouble,
      point,
    });
  }

  function handleMissButton() {
    applyThrow({ label: "Miss", value: 0, isDouble: false, x: null, y: null });
  }

  function handleUndo() {
    if (turnThrows.length === 0 || gameOver) return;
    const pIdx = turnIndex;
    const undoneThrow = turnThrows[turnThrows.length - 1];
    const playerLog = matchLogsRef.current[pIdx];
    if (playerLog) {
      if (playerLog.darts.length > 0) playerLog.darts.pop();
      if (undoneThrow?.countedCheckoutAttempt) {
        playerLog.checkoutAttempts = Math.max(0, (playerLog.checkoutAttempts || 0) - 1);
      }
    }
    setPlayers((current) => {
      if (!current) return current;
      const list = [...current];
      list[pIdx] = { ...list[pIdx], dartsThrown: Math.max(0, list[pIdx].dartsThrown - 1) };
      return list;
    });
    setTurnThrows(turnThrows.slice(0, -1));
    setBustPending(false);
  }

  function handleNextPlayer() {
    if (!players || gameOver) return;
    const pIdx = turnIndex;
    if (bustPending) {
      setBustPending(false);
      setTurnThrows([]);
      setTurnIndex((pIdx + 1) % players.length);
      setVisitNumber((value) => value + 1);
      return;
    }
    if (turnThrows.length === 0) return;
    applyTurnScore(pIdx, turnThrows);
    setTurnThrows([]);
    setTurnIndex((pIdx + 1) % players.length);
    setVisitNumber((value) => value + 1);
  }

  function persistCompletedGame(list, winnerIdx, finishValue) {
    const playerSummaries = list.map((player, index) => {
      const playerLog = matchLogsRef.current[index] || createMatchLog(player.name);
      const firstNineAverage = getFirstNineAverage(playerLog.darts);
      const average = getAverage(player.pointsScored, player.dartsThrown);
      const checkoutAttempts = playerLog.checkoutAttempts || 0;
      const checkoutHits = playerLog.checkoutHits || 0;
      const total180s = playerLog.turnTotals.filter((turnTotal) => turnTotal === 180).length;
      const total140Plus = playerLog.turnTotals.filter((turnTotal) => turnTotal >= 140).length;
      const total100Plus = playerLog.turnTotals.filter((turnTotal) => turnTotal >= 100).length;
      const highestCheckout = index === winnerIdx ? finishValue : 0;

      return {
        name: player.name,
        result: index === winnerIdx ? "won" : "lost",
        average,
        firstNineAverage,
        highestCheckout,
        checkoutAttempts,
        checkoutHits,
        total180s,
        total140Plus,
        total100Plus,
        pointsScored: player.pointsScored,
        dartsThrown: player.dartsThrown,
      };
    });

    const gameRecord = normalizeGameRecord({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      date: new Date().toISOString(),
      gameType: gameConfig?.mode || "501",
      players: playerSummaries,
      winnerName: list[winnerIdx]?.name || "",
      winnerIdx,
      finishValue,
      result: `${list[winnerIdx]?.name || "Player"} won`,
    });

    const nextStore = loadStatsStore();
    nextStore.games = [gameRecord, ...nextStore.games].slice(0, 250);

    playerSummaries.forEach((summary) => {
      const record = getPlayerStatsRecord(nextStore, summary.name);
      record.gamesPlayed += 1;
      record.wins += summary.result === "won" ? 1 : 0;
      record.losses += summary.result === "lost" ? 1 : 0;
      record.legsPlayed += 1;
      record.legsWon += summary.result === "won" ? 1 : 0;
      record.totalPoints += summary.pointsScored;
      record.totalDarts += summary.dartsThrown;
      record.total180s += summary.total180s;
      record.total140Plus += summary.total140Plus;
      record.total100Plus += summary.total100Plus;
      record.checkoutAttempts += summary.checkoutAttempts;
      record.checkoutHits += summary.checkoutHits;
      record.highestCheckout = Math.max(record.highestCheckout, summary.highestCheckout);
      record.bestLegDarts = record.bestLegDarts == null ? summary.dartsThrown : Math.min(record.bestLegDarts, summary.dartsThrown);
      record.firstNinePoints += summary.firstNineAverage * Math.min(9, summary.dartsThrown || 0);
      record.firstNineDarts += Math.min(9, summary.dartsThrown || 0);
    });

    saveStatsStore(nextStore);
    setStatsStore(nextStore);
    return gameRecord;
  }

  function finishGame(winnerIdx, list, finishValue) {
    setGameOver({ winnerIdx, finishValue });
    const gameRecord = persistCompletedGame(list, winnerIdx, finishValue);

    if (!profile) return gameRecord;
    const you = list[0];
    const won = winnerIdx === 0;
    const gameAvg = you.dartsThrown > 0 ? Math.round(((you.pointsScored / you.dartsThrown) * 3) * 10) / 10 : 0;
    const history = [...(profile.history || []), { avg: gameAvg, date: gameRecord.date }].slice(-10);
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
    return gameRecord;
  }

  const currentPlayer = players ? players[turnIndex] : null;
  const dartsLeftInTurn = 3 - turnThrows.length;

  useEffect(() => {
    if (!videoRef.current || !cameraReady || screen !== "game" || gameConfig?.scoringType !== "liv" || !savedCalibration || !cameraStreamRef.current) return;

    const sampleCanvas = detectionCanvasRef.current;
    if (!sampleCanvas) return;
    const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    const sampleWidth = 160;
    const sampleHeight = 120;
    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;

    let rafId = 0;
    const state = detectionRef.current;
    state.prevFrame = null;
    state.isTracking = false;
    state.trackingStart = 0;
    state.pendingPoint = null;

    function getComponentStats(startIdx) {
      const stack = [startIdx];
      const visited = new Uint8Array(sampleWidth * sampleHeight);
      visited[startIdx] = 1;

      let minX = sampleWidth;
      let minY = sampleHeight;
      let maxX = -1;
      let maxY = -1;
      let count = 0;
      let sumX = 0;
      let sumY = 0;

      while (stack.length > 0) {
        const idx = stack.pop();
        const x = idx % sampleWidth;
        const y = Math.floor(idx / sampleWidth);
        count += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        sumX += x;
        sumY += y;

        const neighbors = [
          idx - 1,
          idx + 1,
          idx - sampleWidth,
          idx + sampleWidth,
        ];

        for (const next of neighbors) {
          if (next < 0 || next >= sampleWidth * sampleHeight) continue;
          const nx = next % sampleWidth;
          const ny = Math.floor(next / sampleWidth);
          if (nx < 0 || ny < 0 || nx >= sampleWidth || ny >= sampleHeight) continue;
          if (state.mask[next] && !visited[next]) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const area = count;
      const aspect = Math.max(width, height) / Math.max(Math.min(width, height), 1);
      const density = area / (width * height);

      return {
        count,
        width,
        height,
        aspect,
        density,
        cx: sumX / count,
        cy: sumY / count,
      };
    }

    function analyze() {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafId = requestAnimationFrame(analyze);
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0, sampleWidth, sampleHeight);
      const frame = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;

      if (!state.referenceFrame) {
        state.referenceFrame = { data: new Uint8ClampedArray(frame), width: sampleWidth, height: sampleHeight };
        state.pendingPoint = null;
        rafId = requestAnimationFrame(analyze);
        return;
      }

      const ref = state.referenceFrame.data;
      state.mask = new Uint8Array(sampleWidth * sampleHeight);
      let changedCount = 0;
      let totalDelta = 0;

      for (let i = 0; i < frame.length; i += 4) {
        const idx = i / 4;
        const dr = Math.abs(frame[i] - ref[i]);
        const dg = Math.abs(frame[i + 1] - ref[i + 1]);
        const db = Math.abs(frame[i + 2] - ref[i + 2]);
        const delta = (dr + dg + db) / 3;
        if (delta > 24) {
          state.mask[idx] = 1;
          changedCount += 1;
          totalDelta += delta;
        }
      }

      const motionRatio = changedCount / (sampleWidth * sampleHeight);

      if (motionRatio < 0.003 || changedCount < 30) {
        rafId = requestAnimationFrame(analyze);
        return;
      }

      const visited = new Uint8Array(sampleWidth * sampleHeight);
      let bestRegion = null;
      let bestScore = -1;

      for (let i = 0; i < state.mask.length; i += 1) {
        if (!state.mask[i] || visited[i]) continue;

        const stats = getComponentStats(i);
        if (stats.count < 8 || stats.width < 3 || stats.height < 2) continue;
        if (stats.width > sampleWidth * 0.8 || stats.height > sampleHeight * 0.8) continue;
        const aspect = Math.max(stats.width, stats.height) / Math.max(Math.min(stats.width, stats.height), 1);
        if (aspect < 1.7) continue;

        const score = Math.min(1, stats.count / 120) * 0.6 + Math.min(1, aspect / 5) * 0.4;

        if (score > bestScore) {
          bestScore = score;
          bestRegion = {
            ...stats,
            score,
          };
        }
      }

      if (bestRegion && bestRegion.score >= 0.4) {
        const frameWidth = videoRef.current.videoWidth || videoRef.current.clientWidth || 360;
        const frameHeight = videoRef.current.videoHeight || videoRef.current.clientHeight || 240;
        const point = {
          x: (bestRegion.cx / sampleWidth) * frameWidth,
          y: (bestRegion.cy / sampleHeight) * frameHeight,
        };
        handleDetectedThrow(point);
      } else {
        setPendingScore(null);
        setDetectedPoint(null);
      }

      rafId = requestAnimationFrame(analyze);
    }

    rafId = requestAnimationFrame(analyze);

    return () => cancelAnimationFrame(rafId);
  }, [cameraReady, gameConfig?.scoringType, screen, savedCalibration, players, turnThrows.length]);
  const turnSoFarValue = sumThrows(turnThrows);
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
        .dm-ghost-btn:disabled, .dm-mini-btn:disabled { opacity: 0.35; cursor: default; }
        .dm-ghost-btn:disabled:hover { border-color: var(--border); color: var(--text); }
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
        .dm-tab { flex: 1; text-align: center; padding: 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 12.5px; color: var(--text-dim); cursor: pointer; background: var(--panel); font-family: inherit; margin: 0; }
        .dm-tab.active { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
        .dm-stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
        .dm-stats-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
        .dm-stats-card .label { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
        .dm-stats-card .value { font-family: 'Bebas Neue', sans-serif; font-size: 24px; line-height: 1; color: var(--ink); }
        .dm-trend-box .dm-stats-list { display: flex; flex-direction: column; gap: 8px; }
        .dm-form-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; }
        .dm-form-row .left { display: flex; flex-direction: column; gap: 2px; }
        .dm-form-row .left strong { font-size: 12px; color: var(--ink); }
        .dm-form-row .left span { font-size: 11px; color: var(--text-dim); }
        .dm-form-row .result { font-size: 11px; font-weight: 700; color: var(--accent); }
        .dm-history-list { display: flex; flex-direction: column; gap: 10px; }
        .dm-history-item { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
        .dm-history-item .head { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 6px; }
        .dm-history-item .date { font-size: 11px; color: var(--text-dim); }
        .dm-history-item .winner { font-size: 12px; color: var(--ink); }
        .dm-history-item .players { font-size: 11px; color: var(--text-dim); margin-bottom: 8px; }
        .dm-history-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; font-size: 11px; color: var(--text-dim); }
        .dm-history-meta strong { color: var(--ink); font-weight: 600; }
        .dm-empty-state { border: 1px solid var(--border); background: var(--panel); border-radius: 8px; padding: 14px; color: var(--text-dim); font-size: 12px; }

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
        .camera-guide-circle { position: absolute; width: 74%; aspect-ratio: 1; left: 50%; top: 50%; transform: translate(-50%, -50%); border: 2px dashed rgba(63,224,122,0.8); border-radius: 50%; box-shadow: 0 0 0 999px rgba(0,0,0,0.10); pointer-events: none; }
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
        .dm-score-option-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
        .dm-score-option-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px 14px; text-align: left; cursor: pointer; color: inherit; }
        .dm-score-option-card .t { font-family: 'Bebas Neue', sans-serif; font-size: 21px; color: var(--ink); }
        .dm-score-option-card .s { font-size: 11px; color: var(--text-dim); margin-top: 6px; line-height: 1.4; }
        .dm-score-option-card.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
        .dm-player-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .dm-player-row input { flex: 1; }
        .dm-mini-btn { background: none; border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 8px 10px; font-size: 11px; cursor: pointer; }
        .dm-player-summary { background: linear-gradient(135deg, #0D1A12, #090F0B); border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-bottom: 14px; }
        .dm-player-summary-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .dm-player-summary-name { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; }
        .dm-player-summary-score { font-family: 'Bebas Neue', sans-serif; font-size: 42px; color: var(--ink); line-height: 1; }
        .dm-player-summary-meta { font-size: 12px; color: var(--text-dim); }
        .dm-player-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
        .dm-player-pill { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
        .dm-player-pill.active { border-color: var(--accent); background: rgba(63,224,122,0.06); }
        .dm-player-pill .n { font-size: 11px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dm-player-pill .r { font-family: 'Bebas Neue', sans-serif; font-size: 24px; color: var(--ink); line-height: 1.05; }
        .dm-leg-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
        .dm-leg-card .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 11px; color: var(--text-dim); }
        .dm-leg-card .value { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: var(--ink); margin-top: 4px; }
        .dm-dart-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
        .dm-dart-slot { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; min-height: 64px; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 8px; text-align: center; }
        .dm-dart-slot.filled { border-color: var(--accent); background: rgba(63,224,122,0.06); }
        .dm-dart-slot .label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; }
        .dm-dart-slot .value { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: var(--ink); line-height: 1.1; margin-top: 2px; }
        .dm-legacy-note { border: 1px solid var(--border); background: var(--panel); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; font-size: 12px; color: var(--text-dim); }
        .dm-live-camera-panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
        .dm-live-camera-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
        .dm-live-camera-label { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; }
        .dm-inline-btn { background: none; border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 6px 8px; font-size: 11px; cursor: pointer; }
        .dm-live-camera-frame { position: relative; height: 146px; overflow: hidden; border-radius: 8px; background: #020403; border: 1px solid var(--border-strong); }
        .dm-live-camera-video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .dm-live-camera-badge { position: absolute; left: 8px; bottom: 8px; padding: 5px 7px; border-radius: 999px; background: rgba(3, 11, 6, 0.7); border: 1px solid rgba(63,224,122,0.5); color: var(--accent); font-size: 10px; font-weight: 600; }
        .dm-live-camera-dot { position: absolute; width: 17px; height: 17px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.85); background: rgba(227,63,63,0.9); transform: translate(-50%, -50%); box-shadow: 0 0 0 3px rgba(227,63,63,0.25); z-index: 2; }
        .dm-live-camera-dot::after { content: attr(data-label); position: absolute; left: 50%; top: -5px; transform: translate(-50%, -100%); background: rgba(3,11,6,0.9); color: var(--ink); border-radius: 999px; border: 1px solid rgba(63,224,122,0.5); padding: 2px 5px; font-size: 9px; white-space: nowrap; }
        .dm-live-camera-note { font-size: 10.5px; color: var(--text-dim); line-height: 1.4; margin-top: 8px; }
        .dm-proposed-score { margin-top: 10px; border: 1px solid var(--border); background: var(--panel-2); border-radius: 8px; padding: 10px 12px; }
        .dm-proposed-score .label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
        .dm-proposed-score .value { font-family: 'Bebas Neue', sans-serif; font-size: 26px; color: var(--ink); line-height: 1; margin-top: 4px; }
        .dm-proposed-score .meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

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
            <Header title="Dart Zone" />
            <div className="dm-body">
              <div className="dm-hero">
                <img src="./assets/dartmind-hero.png" alt="Dark Mind darts experience" />
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
            <Header title="Dart Zone" showProfile />
            <div className="dm-body">
              <div className="dm-home-banner">
                <div><div className="dm-banner-kicker">DART ZONE</div><div className="dm-banner-title">LET'S THROW.</div><div className="dm-banner-sub">Choose manual or Liv scoring for your setup.</div></div>
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
              <button className="dm-menu-row" onClick={() => setScreen("localSetup")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 12 L6 9 L8 11 L13 6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="4" cy="5" r="1.3" fill="currentColor" /><circle cx="12" cy="11" r="1.3" fill="currentColor" /></svg></div>
                <div><div className="t">Local multiplayer</div><div className="s">Set up a face-to-face match</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("trainingSoon")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 13 L14 3" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M2 13 L4 13.6 L1.4 14.6 Z" fill="currentColor" /></svg></div>
                <div><div className="t">Training mode</div><div className="s">Improve your skills</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("lobby")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="6" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.3" fill="none" /><circle cx="11" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.3" fill="none" /></svg></div>
                <div><div className="t">Play online</div><div className="s">Demo matchmaking — real online play is coming soon</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("stats")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 13 V8 M8 13 V4 M13 13 V10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg></div>
                <div><div className="t">Stats and progress</div><div className="s">Track your journey</div></div>
                <div className="chev">&rsaquo;</div>
              </button>
              <button className="dm-menu-row" onClick={() => setScreen("history")}>
                <div className="ico"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 4 L12 4 L12 13 L4 13 Z" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M6 7 H10 M6 9 H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg></div>
                <div><div className="t">Game history</div><div className="s">Review recent matches</div></div>
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
                <button type="button" className={"dm-tab" + (modeTab === "popular" ? " active" : "")} onClick={() => setModeTab("popular")}>Popular</button>
                <button type="button" className={"dm-tab" + (modeTab === "training" ? " active" : "")} onClick={() => setModeTab("training")}>Training</button>
                <button type="button" className={"dm-tab" + (modeTab === "all" ? " active" : "")} onClick={() => setModeTab("all")}>All</button>
              </div>
              {pendingMode ? (
                <>
                  <div className="dm-h1">Choose scoring</div>
                  <div className="dm-sub">{pendingMode === "301" ? "301" : "501"} can be played with a live camera or traditional manual tap scoring.</div>
                  <div className="dm-score-option-grid">
                    {SCORE_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        className={"dm-score-option-card" + (gameConfig?.scoringType === option.key ? " active" : "")}
                        onClick={() => startLocalGame(pendingMode, option.key)}
                      >
                        <div className="t">{option.label}</div>
                        <div className="s">{option.desc}</div>
                      </button>
                    ))}
                  </div>
                  <button className="dm-ghost-btn" style={{ marginTop: 16 }} onClick={() => setPendingMode(null)}>Back to modes</button>
                </>
              ) : (
                <div className="dm-mode-grid">
                  {MODE_TILES.map((m) => (
                    <div
                      key={m.key}
                      className={"dm-mode-card" + (m.playable ? "" : " soon")}
                      onClick={m.playable ? () => setPendingMode(m.key) : undefined}
                    >
                      <div className="t">{m.label}</div>
                      <div className="s">{m.playable ? m.desc : "Coming soon"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {screen === "localSetup" && (
          <>
            <Header title="Local multiplayer" onBack={() => setScreen("home")} />
            <div className="dm-body">
              <div className="dm-h1">Set up the game</div>
              <div className="dm-sub">Add players, choose the game mode and scoring method, then start a local match.</div>

              <div className="dm-field-label">Game mode</div>
              <div className="dm-score-option-grid" style={{ marginTop: 0, marginBottom: 16 }}>
                {[301, 501].map((mode) => (
                  <button
                    key={mode}
                    className={"dm-score-option-card" + (localGameMode === mode ? " active" : "")}
                    onClick={() => setLocalGameMode(mode)}
                  >
                    <div className="t">{mode}</div>
                    <div className="s">{mode === 301 ? "Fast paced, double out" : "Classic 501, double out"}</div>
                  </button>
                ))}
              </div>

              <div className="dm-field-label">Scoring method</div>
              <div className="dm-score-option-grid" style={{ marginTop: 0, marginBottom: 16 }}>
                {LOCAL_SCORING_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    className={"dm-score-option-card" + (localScoringType === option.key ? " active" : "")}
                    onClick={() => setLocalScoringType(option.key)}
                  >
                    <div className="t">{option.label}</div>
                    <div className="s">{option.desc}</div>
                  </button>
                ))}
              </div>

              <div className="dm-field-label">Players</div>
              {localPlayers.map((player, index) => (
                <div key={index} className="dm-player-row">
                  <input
                    className="dm-input"
                    value={player}
                    onChange={(e) => updateLocalPlayer(index, e.target.value)}
                    maxLength={20}
                  />
                  {localPlayers.length > 1 && (
                    <button className="dm-mini-btn" onClick={() => removeLocalPlayer(index)} aria-label={`Remove ${player}`}>
                      Remove
                    </button>
                  )}
                </div>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8, marginBottom: 18 }}>
                <button className="dm-ghost-btn" onClick={addLocalPlayer} disabled={localPlayers.length >= 8}>Add player</button>
                <button className="dm-primary-btn" style={{ marginTop: 0, flex: 1 }} onClick={startLocalMultiplayerGame}>Start game</button>
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

              <div className="dm-stats-grid">
                <div className="dm-stats-card">
                  <div className="label">Career totals</div>
                  <div className="value">{statsStore.players?.[profile.name]?.gamesPlayed || profile.gamesPlayed || 0}</div>
                </div>
                <div className="dm-stats-card">
                  <div className="label">Wins / Losses</div>
                  <div className="value">{statsStore.players?.[profile.name]?.wins || 0} / {statsStore.players?.[profile.name]?.losses || 0}</div>
                </div>
                <div className="dm-stats-card">
                  <div className="label">Legs won</div>
                  <div className="value">{statsStore.players?.[profile.name]?.legsWon || 0}</div>
                </div>
                <div className="dm-stats-card">
                  <div className="label">Best checkout</div>
                  <div className="value">{statsStore.players?.[profile.name]?.highestCheckout || profile.bestCheckout || 0}</div>
                </div>
              </div>

              <div className="dm-trend-box">
                <div className="dm-trend-label">Recent form</div>
                <div className="dm-stats-list">
                  <div className="dm-form-row">
                    <div className="left"><strong>3-dart average</strong><span>{formatAverage(statsStore.players?.[profile.name]?.totalDarts ? (statsStore.players[profile.name].totalPoints / statsStore.players[profile.name].totalDarts) * 3 : avg)}</span></div>
                    <div className="result">{formatAverage(statsStore.players?.[profile.name]?.totalDarts ? (statsStore.players[profile.name].totalPoints / statsStore.players[profile.name].totalDarts) * 3 : avg)}</div>
                  </div>
                  <div className="dm-form-row">
                    <div className="left"><strong>First 9 average</strong><span>{formatAverage(statsStore.players?.[profile.name]?.firstNineDarts ? statsStore.players[profile.name].firstNinePoints / statsStore.players[profile.name].firstNineDarts : 0)}</span></div>
                    <div className="result">{formatAverage(statsStore.players?.[profile.name]?.firstNineDarts ? statsStore.players[profile.name].firstNinePoints / statsStore.players[profile.name].firstNineDarts : 0)}</div>
                  </div>
                  <div className="dm-form-row">
                    <div className="left"><strong>Checkout %</strong><span>{formatPercent(statsStore.players?.[profile.name]?.checkoutAttempts ? (statsStore.players[profile.name].checkoutHits / statsStore.players[profile.name].checkoutAttempts) * 100 : 0)}</span></div>
                    <div className="result">{formatPercent(statsStore.players?.[profile.name]?.checkoutAttempts ? (statsStore.players[profile.name].checkoutHits / statsStore.players[profile.name].checkoutAttempts) * 100 : 0)}</div>
                  </div>
                </div>
              </div>

              <div className="dm-trend-box">
                <div className="dm-trend-label">Last 10 games</div>
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

              <div className="dm-trend-box">
                <div className="dm-trend-label">Best performances</div>
                <div className="dm-stats-list">
                  <div className="dm-form-row">
                    <div className="left"><strong>180s</strong><span>{statsStore.players?.[profile.name]?.total180s || 0}</span></div>
                    <div className="result">{statsStore.players?.[profile.name]?.total180s || 0}</div>
                  </div>
                  <div className="dm-form-row">
                    <div className="left"><strong>140+</strong><span>{statsStore.players?.[profile.name]?.total140Plus || 0}</span></div>
                    <div className="result">{statsStore.players?.[profile.name]?.total140Plus || 0}</div>
                  </div>
                  <div className="dm-form-row">
                    <div className="left"><strong>100+</strong><span>{statsStore.players?.[profile.name]?.total100Plus || 0}</span></div>
                    <div className="result">{statsStore.players?.[profile.name]?.total100Plus || 0}</div>
                  </div>
                  <div className="dm-form-row">
                    <div className="left"><strong>Best leg</strong><span>{statsStore.players?.[profile.name]?.bestLegDarts ?? "—"} darts</span></div>
                    <div className="result">{statsStore.players?.[profile.name]?.bestLegDarts ?? "—"}</div>
                  </div>
                </div>
              </div>

              <button className="dm-ghost-btn" onClick={handleLogOut}>Log out</button>
            </div>
          </>
        )}

        {screen === "history" && (
          <>
            <Header title="Game history" onBack={() => setScreen("home")} />
            <div className="dm-body">
              {statsStore.games.length === 0 ? (
                <div className="dm-empty-state">No completed games yet. Finish a 301 or 501 game to add history.</div>
              ) : (
                <div className="dm-history-list">
                  {statsStore.games.map((game) => (
                    <div key={game.id} className="dm-history-item">
                      <div className="head">
                        <div className="date">{formatShortDate(game.date)}</div>
                        <div className="winner">{game.winnerName || "Winner"}</div>
                      </div>
                      <div className="players">{game.players.map((p) => p.name).join(" • ")}</div>
                      <div className="dm-history-meta">
                        <div><strong>Game</strong> {game.gameType}</div>
                        <div><strong>Avg</strong> {formatAverage(game.players[0]?.average || 0)}</div>
                        <div><strong>Checkout</strong> {game.finishValue || 0}</div>
                        <div><strong>180s</strong> {game.players.reduce((sum, p) => sum + (p.total180s || 0), 0)}</div>
                        <div><strong>Winner</strong> {game.winnerName}</div>
                        <div><strong>Result</strong> {game.result}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {screen === "challenges" && profile && (
          <>
            <Header title="Challenges" onBack={() => setScreen("home")} />
            <div className="dm-body">
              <div className="dm-tabs">
                <button type="button" className={"dm-tab" + (challengeTab === "daily" ? " active" : "")} onClick={() => setChallengeTab("daily")}>Daily</button>
                <button type="button" className={"dm-tab" + (challengeTab === "weekly" ? " active" : "")} onClick={() => setChallengeTab("weekly")}>Weekly</button>
                <button type="button" className={"dm-tab" + (challengeTab === "special" ? " active" : "")} onClick={() => setChallengeTab("special")}>Special</button>
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
                  <div className="dm-empty-state" style={{ marginBottom: 16 }}>Real online multiplayer isn't built yet — this screen is a demo that pairs you with a sample opponent so you can preview the flow.</div>
                  <div className="dm-field-label">Players online (sample data)</div>
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
                  <div className="dm-turn-actions" style={{ marginBottom: 8 }}>
                    <button className="dm-ghost-btn" onClick={() => { setCalibrated(false); setCalibrationStep(0); setCalibrationPoints([]); }}>Recalibrate</button>
                    <button className="dm-primary-btn" style={{ marginTop: 0 }} onClick={beginGame}>Start game</button>
                  </div>
                </>
              ) : (
                <button className="dm-primary-btn" onClick={runCalibration} disabled={!cameraReady || calibrationStep < 2 || calibrating}>
                  {calibrating ? "Locking calibration..." : "Calibrate board"}
                </button>
              )}
              <div className="dm-camera-tip">💡 Best setup: mount the phone on a stand — it must stay completely still. Get the board level, square-on and evenly lit; any camera movement will be read as a dart.</div>
            </div>
          </>
        )}

        {screen === "game" && players && (
          <>
            <Header title={gameConfig.mode} onBack={() => setScreen("home")} />
            <div className="dm-body dm-relative">
              <div className="dm-player-summary">
                <div className="dm-player-summary-head">
                  <div className="dm-player-summary-name">Current player</div>
                  <div className="dm-player-summary-meta">Visit {visitNumber}</div>
                </div>
                <div className="dm-player-summary-score">{currentPlayer?.remaining ?? 0}</div>
                <div className="dm-player-summary-meta">{currentPlayer?.name}</div>
              </div>

              <div className="dm-player-list">
                {players.map((player, index) => (
                  <div key={player.name + index} className={"dm-player-pill" + (turnIndex === index ? " active" : "")}>
                    <div className="n">{player.name}</div>
                    <div className="r">{player.remaining}</div>
                  </div>
                ))}
              </div>

              <div className="dm-leg-card">
                <div className="top">
                  <span>Current leg</span>
                  <span>{turnThrows.length}/3 darts</span>
                </div>
                <div className="value">{turnSoFarValue}</div>
              </div>

              <div className="dm-dart-slots">
                {[0, 1, 2].map((slot) => {
                  const throwItem = turnThrows[slot];
                  return (
                    <div key={slot} className={"dm-dart-slot" + (throwItem ? " filled" : "")}>
                      <div className="label">Dart {slot + 1}</div>
                      <div className="value">{throwItem ? throwItem.label : "-"}</div>
                    </div>
                  );
                })}
              </div>

              <div className="dm-checkout">{checkout ? "Checkout: " + checkout.join(" \u00b7 ") : ""}</div>
              {gameConfig?.scoringType === "liv" && (
                <div className="dm-live-camera-panel">
                  <div className="dm-live-camera-head">
                    <div className="dm-live-camera-label">Liv camera</div>
                    <button className="dm-inline-btn" onClick={() => setScreen("calibrate")}>Recalibrate</button>
                  </div>
                  <div className="dm-live-camera-frame">
                    <video ref={videoRef} className="dm-live-camera-video" playsInline muted autoPlay />
                    {detectedPoint && (
                      <div
                        className="dm-live-camera-dot"
                        data-label={detectedPoint.label}
                        style={{ left: (detectedPoint.x / 100) * 100 + "%", top: (detectedPoint.y / 100) * 100 + "%" }}
                      />
                    )}
                    <div className="dm-live-camera-badge">Calibration active</div>
                  </div>
                  {pendingScore && (
                    <div className="dm-proposed-score">
                      <div className="label">Detected impact</div>
                      <div className="value">{pendingScore.label} · {pendingScore.value}</div>
                      <div className="meta">Tap confirm to send this dart into the live game.</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button className="dm-primary-btn" onClick={confirmDetectedThrow}>Confirm</button>
                        <button className="dm-ghost-btn" onClick={dismissDetectedThrow}>Not a dart</button>
                      </div>
                    </div>
                  )}
                  <div className="dm-live-camera-note">Liv scoring keeps the calibrated camera visible while you play. The app now captures a clean reference frame before each dart, detects a likely dart object, shows the predicted impact point, and waits for your confirmation before sending the score to 501/301.</div>
                </div>
              )}
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
                    <path key={w.key} d={w.d} fill={w.fill} stroke="#05070a" strokeWidth="0.75" onClick={(e) => handleBoardClick(e, w.label || w.key, w.value, w.isDouble)} />
                  ))}
                  <circle cx={cx} cy={cy} r={RAD.bullOuter} fill="#1f7a48" stroke="#05070a" strokeWidth="0.75" onClick={(e) => handleBoardClick(e, "25 / Outer Bull", 25, false)} />
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
                  <button className="dm-ghost-btn" onClick={handleUndo} disabled={turnThrows.length === 0}>Undo last dart</button>
                  <button className="dm-ghost-btn" onClick={handleMissButton} disabled={bustPending || turnThrows.length >= 3}>Miss</button>
                  <button className="dm-primary-btn" style={{ marginTop: 0 }} onClick={handleNextPlayer} disabled={turnThrows.length === 0 && !bustPending}>Next player</button>
                </div>
              </div>

              <div className="dm-turn-actions" style={{ marginBottom: 12 }}>
                <button className="dm-ghost-btn" onClick={() => setScreen("home")}>Finish / Exit</button>
              </div>

              {flash === "180" && (
                <div className="dm-overlay">
                  <div className="dm-flash180">ONE HUNDRED AND EIGHTY</div>
                </div>
              )}
              {gameOver && (
                <div className="dm-overlay">
                  <div className="dm-gameover-title">{gameOver.winnerIdx === 0 ? "Game shot!" : players[gameOver.winnerIdx]?.name + " wins"}</div>
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

