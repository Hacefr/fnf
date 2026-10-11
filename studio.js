// --- FNF Studio Engine: .imp Importer/Exporter, Downscroll & V-Slice Mobile Touch Drag ---
const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('stage-canvas-container');

function resizeCanvas() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// Configuration
const gameConfig = {
  downscroll: false,
  mobileTouch: false
};

// Camera System (Smart Tracking & Beat Bop)
const cam = {
  x: 0, y: 0,
  targetX: 0, targetY: 0,
  zoom: 0.9, targetZoom: 0.9,
  bopStrength: 0.04,
  bopFreq: 4,
  smartTracking: true,
  shakeIntensity: 0, shakeDuration: 0,
  flashColor: '#ffffff', flashAlpha: 0
};

// Audio & Chart System
let audioCtx = null;
let instBuffer = null, voicesBuffer = null;
let instSource = null, voicesSource = null;
let rawAudioFiles = { inst: null, voices: null, chart: null };

let chartData = null;
let parsedNotes = [];
let bpm = 150;
let songSpeed = 2.6;
let songDuration = 120000;
let currentTime = 0;
let startPosTime = 0;
let isPlaying = false;
let audioStartContextTime = 0;
let audioSeekOffset = 0;

// Beat Timing
let curBeat = 0;
let lastBeat = -1;

// Colors for arrows
const ARROW_COLORS = ['#C24B99', '#00FFFF', '#12FA05', '#F9393F']; // Purple, Cyan, Green, Red

// Active Receptors State (0: normal, 1: pressed, 2: confirmed hit glow)
const playerReceptors = [0, 0, 0, 0];
const receptorGlowTimer = [0, 0, 0, 0];

// =========================================================================
// --- ISOLATED PHASES & ICONS DATA ARCHITECTURE ---
// =========================================================================

function createEmptyPoses() {
  return { idle: [], singUP: [], singDOWN: [], singLEFT: [], singRIGHT: [] };
}

function createDefaultCharacters() {
  return {
    dad: {
      id: 'dad', name: 'Opponent (Lime)', x: -380, y: 80, width: 220, height: 380,
      flipX: false, color: '#39ff14', currentPose: 'idle', fps: 12, animTimer: 0,
      danceFreq: 2, bouncePow: 0.06, bounceScale: 1.0, poses: createEmptyPoses()
    },
    gf: {
      id: 'gf', name: 'Girlfriend', x: 0, y: 10, width: 240, height: 320,
      flipX: false, color: '#a855f7', currentPose: 'idle', fps: 12, animTimer: 0,
      danceFreq: 2, bouncePow: 0.06, bounceScale: 1.0, poses: createEmptyPoses()
    },
    bf: {
      id: 'bf', name: 'Boyfriend', x: 360, y: 90, width: 200, height: 320,
      flipX: false, color: '#00ffff', currentPose: 'idle', fps: 12, animTimer: 0,
      danceFreq: 2, bouncePow: 0.06, bounceScale: 1.0, poses: createEmptyPoses()
    }
  };
}

let phases = [
  {
    id: 'phase_1',
    name: 'Phase 1',
    characters: createDefaultCharacters(),
    icons: {
      bf: { neutral: null, losing: null },
      dad: { neutral: null, losing: null }
    },
    props: [],
    stageBg: null
  }
];

let activePhaseIndex = 0;
function getCurPhase() { return phases[activePhaseIndex]; }

let activeTargetId = 'bf';
let toolMode = 'move'; // 'move', 'resize', or 'cam'

// Transform & Drag State
let isInteracting = false;
let activeHandle = null;
let dragStartX = 0, dragStartY = 0;
let initX = 0, initY = 0, initW = 0, initH = 0;

// Coordinate transformations
function screenToWorld(sx, sy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    x: (sx - cx) / cam.zoom + cam.x,
    y: (sy - cy) / cam.zoom + cam.y
  };
}

function getActiveTarget() {
  const cp = getCurPhase();
  if (cp.characters[activeTargetId]) return cp.characters[activeTargetId];
  const p = cp.props.find(pr => pr.id === activeTargetId);
  if (p) return p;
  if (cp.stageBg && cp.stageBg.id === activeTargetId) return cp.stageBg;
  return cp.characters.bf;
}

function getBounds(obj) {
  return {
    left: obj.x - obj.width / 2,
    right: obj.x + obj.width / 2,
    top: obj.y - obj.height / 2,
    bottom: obj.y + obj.height / 2
  };
}

function getHandles(obj) {
  const b = getBounds(obj);
  return {
    tl: { x: b.left, y: b.top, cursor: 'nwse-resize' },
    tr: { x: b.right, y: b.top, cursor: 'nesw-resize' },
    bl: { x: b.left, y: b.bottom, cursor: 'nesw-resize' },
    br: { x: b.right, y: b.bottom, cursor: 'nwse-resize' },
    t:  { x: obj.x, y: b.top, cursor: 'ns-resize' },
    b:  { x: obj.x, y: b.bottom, cursor: 'ns-resize' },
    l:  { x: b.left, y: obj.y, cursor: 'ew-resize' },
    r:  { x: b.right, y: obj.y, cursor: 'ew-resize' }
  };
}

// =========================================================================
// --- PHASE MANAGEMENT & CLONING ---
// =========================================================================

function renderPhaseTabs() {
  const container = document.getElementById('phase-tabs-container');
  container.innerHTML = '';
  phases.forEach((p, idx) => {
    const tab = document.createElement('div');
    tab.className = `phase-tab ${idx === activePhaseIndex ? 'active' : ''}`;
    tab.textContent = p.name;
    tab.onclick = () => switchPhase(idx);
    container.appendChild(tab);
  });
  document.getElementById('lbl-phase-name').textContent = getCurPhase().name;
  document.getElementById('lbl-icon-phase').textContent = getCurPhase().name;
}

function switchPhase(idx) {
  activePhaseIndex = idx;
  renderPhaseTabs();
  selectTarget(activeTargetId);
  refreshPropsList();
}

function addNewPhase() {
  const newNum = phases.length + 1;
  const prevPhase = getCurPhase();

  const newChars = createDefaultCharacters();
  ['bf', 'dad', 'gf'].forEach(cid => {
    newChars[cid].x = prevPhase.characters[cid].x;
    newChars[cid].y = prevPhase.characters[cid].y;
    newChars[cid].width = prevPhase.characters[cid].width;
    newChars[cid].height = prevPhase.characters[cid].height;
    newChars[cid].flipX = prevPhase.characters[cid].flipX;
  });

  phases.push({
    id: `phase_${newNum}`,
    name: `Phase ${newNum}`,
    characters: newChars,
    icons: {
      bf: { neutral: null, losing: null },
      dad: { neutral: null, losing: null }
    },
    props: JSON.parse(JSON.stringify(prevPhase.props)),
    stageBg: prevPhase.stageBg
  });

  switchPhase(phases.length - 1);
}

// =========================================================================
// --- V-SLICE MOBILE TOUCH & DRAG-ACROSS SLIDING CONTROLS ---
// =========================================================================

function toggleMobileTouchLayer(enabled) {
  gameConfig.mobileTouch = enabled;
  document.getElementById('mobile-touch-layer').style.display = enabled ? 'block' : 'none';
}

const mobileTouchLayer = document.getElementById('mobile-touch-layer');
const hitboxes = document.querySelectorAll('.touch-hitbox');

// Smooth Drag Across Keys (using elementFromPoint so user doesn't lift finger)
function updateMobileTouches(e) {
  e.preventDefault();
  const activeLanes = [false, false, false, false];

  // Loop through all active touches on screen
  for (let i = 0; i < e.touches.length; i++) {
    const touch = e.touches[i];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.dataset.lane !== undefined) {
      const lane = parseInt(el.dataset.lane);
      activeLanes[lane] = true;
    }
  }

  // Update button visual styles & trigger key presses/releases
  hitboxes.forEach((box) => {
    const lane = parseInt(box.dataset.lane);
    const isDown = activeLanes[lane];

    if (isDown) {
      if (!box.classList.contains('pressed')) {
        box.classList.add('pressed');
        triggerPlayerLaneHit(lane);
      }
    } else {
      if (box.classList.contains('pressed')) {
        box.classList.remove('pressed');
        playerReceptors[lane] = 0;
      }
    }
  });
}

function handleTouchEnd(e) {
  e.preventDefault();
  updateMobileTouches(e);
}

['touchstart', 'touchmove'].forEach(evt => {
  mobileTouchLayer.addEventListener(evt, updateMobileTouches, { passive: false });
});
['touchend', 'touchcancel'].forEach(evt => {
  mobileTouchLayer.addEventListener(evt, handleTouchEnd, { passive: false });
});

function triggerPlayerLaneHit(lane) {
  playerReceptors[lane] = 2; // glow hit
  receptorGlowTimer[lane] = currentTime + 140;

  // Trigger BF sing pose immediately
  const dirPoses = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];
  const bf = getCurPhase().characters.bf;
  bf.currentPose = dirPoses[lane];
  bf.animTimer = 0;
}

// Keyboard fallback
const KEY_MAP = {
  'KeyD': 0, 'ArrowLeft': 0,
  'KeyF': 1, 'ArrowDown': 1,
  'KeyJ': 2, 'ArrowUp': 2,
  'KeyK': 3, 'ArrowRight': 3
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const lane = KEY_MAP[e.code];
  if (lane !== undefined) triggerPlayerLaneHit(lane);
});

window.addEventListener('keyup', (e) => {
  const lane = KEY_MAP[e.code];
  if (lane !== undefined) playerReceptors[lane] = 0;
});

// =========================================================================
// --- ICONS & BOUNCE CONFIGURATION ---
// =========================================================================

function updateDanceFreq(val) {
  const t = getActiveTarget();
  if (t && t.danceFreq !== undefined) t.danceFreq = parseInt(val) || 2;
}

function updateBouncePow(val) {
  const t = getActiveTarget();
  if (t && t.bouncePow !== undefined) t.bouncePow = parseFloat(val) || 0.06;
}

function loadCharacterIcon(state, evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    const cp = getCurPhase();
    const charKey = (activeTargetId === 'dad') ? 'dad' : 'bf';
    cp.icons[charKey][state] = img;
    alert(`Loaded ${charKey.toUpperCase()} ${state.toUpperCase()} icon for ${cp.name}!`);
  };
}

// =========================================================================
// --- AUDIO & CHART PARSING ENGINE ---
// =========================================================================

async function initAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
}

async function loadAudioTrack(type, evt) {
  await initAudioContext();
  const file = evt.target.files[0];
  if (!file) return;

  rawAudioFiles[type] = file;
  const arrayBuf = await file.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(arrayBuf);

  if (type === 'inst') {
    instBuffer = decoded;
    songDuration = instBuffer.duration * 1000;
    document.getElementById('status-inst').textContent = '✓';
  } else {
    voicesBuffer = decoded;
    document.getElementById('status-voices').textContent = '✓';
  }
}

function loadChartJSON(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  rawAudioFiles.chart = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      chartData = JSON.parse(e.target.result);
      processChartData(chartData);
      document.getElementById('status-chart').textContent = '✓';
    } catch (err) {
      alert('Invalid FNF JSON format!');
    }
  };
  reader.readAsText(file);
}

function processChartData(data) {
  const song = data.song || data;
  bpm = song.bpm || 150;
  songSpeed = song.speed || 2.6;

  parsedNotes = [];
  const isNMV = song.format === 'nmv2' || song.lanes !== undefined || Boolean(song.format);

  (song.notes || []).forEach(sec => {
    const mustHit = sec.mustHitSection;
    (sec.sectionNotes || []).forEach(n => {
      const strumTime = n[0];
      const rawDir = n[1];
      const sustain = n[2] || 0;
      const isPlayer = isNMV ? (rawDir < 4) : (mustHit ? rawDir < 4 : rawDir >= 4);
      parsedNotes.push({ time: strumTime, dir: rawDir % 4, sustain: sustain, isPlayer: isPlayer });
    });
  });

  parsedNotes.sort((a, b) => a.time - b.time);
  document.getElementById('chart-info').innerHTML = `
    <b>Song:</b> ${song.song || 'Loaded'} | <b>BPM:</b> ${bpm}<br>
    <b>Speed:</b> ${songSpeed} | <b>Total Notes:</b> ${parsedNotes.length}
  `;
}

function togglePlayback() {
  if (isPlaying) stopPlayback();
  else startPlaybackAt(currentTime);
}

async function startPlaybackAt(timeMs) {
  await initAudioContext();
  stopAudioSources();

  audioSeekOffset = timeMs / 1000;
  audioStartContextTime = audioCtx.currentTime;

  if (instBuffer) {
    instSource = audioCtx.createBufferSource();
    instSource.buffer = instBuffer;
    instSource.connect(audioCtx.destination);
    instSource.start(0, audioSeekOffset);
  }
  if (voicesBuffer) {
    voicesSource = audioCtx.createBufferSource();
    voicesSource.buffer = voicesBuffer;
    voicesSource.connect(audioCtx.destination);
    voicesSource.start(0, audioSeekOffset);
  }

  isPlaying = true;
  document.getElementById('btn-play-pause').textContent = '⏸ Pause';
  document.getElementById('btn-play-pause').classList.replace('btn-green', 'btn-gray');
}

function stopPlayback() {
  isPlaying = false;
  stopAudioSources();
  document.getElementById('btn-play-pause').textContent = '▶ Play';
  document.getElementById('btn-play-pause').classList.replace('btn-gray', 'btn-green');
}

function stopAudioSources() {
  if (instSource) { try { instSource.stop(); } catch(e){} instSource = null; }
  if (voicesSource) { try { voicesSource.stop(); } catch(e){} voicesSource = null; }
}

// =========================================================================
// --- TIMELINE, STARTPOS & SMART BLACKOUT ENGINE ---
// =========================================================================

let timelineEvents = [];
let activeTransition = null;
let transitionOverlayImg = null;

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  const remMs = Math.floor(ms % 1000);
  return `${String(m).padStart(2,'0')}:${String(remS).padStart(2,'0')}.${String(remMs).padStart(3,'0')}`;
}

function setStartPos() {
  startPosTime = currentTime;
  document.getElementById('lbl-startpos-time').textContent = `StartPos: ${formatTime(startPosTime)}`;
  const pct = (startPosTime / songDuration) * 100;
  document.getElementById('startposMarker').style.left = `${pct}%`;
}

function playFromStartPos() {
  currentTime = startPosTime;
  startPlaybackAt(startPosTime);
}

function scrubTimeline(e) {
  const rect = document.getElementById('timelineTrack').getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  currentTime = pct * songDuration;
  document.getElementById('playhead').style.left = `${pct * 100}%`;
  document.getElementById('lbl-current-time').textContent = formatTime(currentTime);

  if (isPlaying) startPlaybackAt(currentTime);
}

function openTransitionModal() {
  const select = document.getElementById('trans-target-phase');
  select.innerHTML = '';
  phases.forEach((p, idx) => {
    select.innerHTML += `<option value="${idx}">${p.name}</option>`;
  });
  document.getElementById('transition-modal').style.display = 'flex';
}

function closeTransitionModal() {
  document.getElementById('transition-modal').style.display = 'none';
}

function loadTransitionOverlay(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => { transitionOverlayImg = img; };
}

function saveTransitionEvent() {
  const targetPhase = parseInt(document.getElementById('trans-target-phase').value) || 0;
  const uiMode = document.getElementById('trans-ui-mode').value;
  const peakFlash = document.getElementById('trans-peak-flash').value;
  const peakShake = parseFloat(document.getElementById('trans-peak-shake').value) || 0;
  const fadeOut = parseFloat(document.getElementById('trans-fade-out').value) || 0.4;
  const hold = parseFloat(document.getElementById('trans-hold').value) || 1.2;
  const fadeIn = parseFloat(document.getElementById('trans-fade-in').value) || 0.5;

  timelineEvents.push({
    time: currentTime,
    targetPhaseIndex: targetPhase,
    uiMode: uiMode,
    peakFlash: peakFlash,
    peakShake: peakShake,
    fadeOut: fadeOut,
    hold: hold,
    fadeIn: fadeIn,
    overlayImg: transitionOverlayImg
  });

  renderEventMarkers();
  closeTransitionModal();
}

function renderEventMarkers() {
  const container = document.getElementById('eventMarkersContainer');
  container.innerHTML = '';
  timelineEvents.forEach(ev => {
    const pct = (ev.time / songDuration) * 100;
    const m = document.createElement('div');
    m.className = 'timeline-event-marker';
    m.style.left = `${pct}%`;
    container.appendChild(m);
  });
}

function previewCurrentTransition() {
  const nextIdx = (activePhaseIndex + 1) % phases.length;
  triggerBlackoutTransition({
    fadeOut: 0.4, hold: 1.2, fadeIn: 0.5,
    targetPhaseIndex: nextIdx,
    uiMode: 'keep_ui',
    peakFlash: '#ff1744',
    peakShake: 20,
    overlayImg: transitionOverlayImg
  });
}

function triggerBlackoutTransition(trans) {
  activeTransition = {
    ...trans,
    elapsed: 0,
    total: trans.fadeOut + trans.hold + trans.fadeIn,
    swapped: false
  };
}

// =========================================================================
// --- MOUSE CANVAS DRAG & 4-SIDE RESIZE ---
// =========================================================================

canvas.addEventListener('mousedown', (e) => {
  if (toolMode === 'cam') return;
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const target = getActiveTarget();

  if (toolMode === 'resize' && target) {
    const handles = getHandles(target);
    const handleThreshold = 12 / cam.zoom;
    for (const [key, pt] of Object.entries(handles)) {
      if (Math.hypot(world.x - pt.x, world.y - pt.y) <= handleThreshold) {
        isInteracting = true;
        activeHandle = key;
        dragStartX = world.x; dragStartY = world.y;
        initX = target.x; initY = target.y; initW = target.width; initH = target.height;
        return;
      }
    }
  }

  const cp = getCurPhase();
  const allObjects = [cp.characters.bf, cp.characters.dad, cp.characters.gf, ...cp.props.slice().reverse()];
  if (cp.stageBg) allObjects.push(cp.stageBg);

  for (const obj of allObjects) {
    const b = getBounds(obj);
    if (world.x >= b.left && world.x <= b.right && world.y >= b.top && world.y <= b.bottom) {
      selectTarget(obj.id);
      isInteracting = true;
      activeHandle = 'body';
      dragStartX = world.x; dragStartY = world.y;
      initX = obj.x; initY = obj.y;
      return;
    }
  }
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const target = getActiveTarget();

  if (!isInteracting && toolMode === 'resize' && target) {
    const handles = getHandles(target);
    let matched = 'default';
    for (const pt of Object.values(handles)) {
      if (Math.hypot(world.x - pt.x, world.y - pt.y) <= 12 / cam.zoom) {
        matched = pt.cursor;
        break;
      }
    }
    canvas.style.cursor = matched;
  } else if (!isInteracting) {
    canvas.style.cursor = toolMode === 'move' ? 'grab' : 'default';
  }

  if (!isInteracting || !target) return;
  const dx = world.x - dragStartX;
  const dy = world.y - dragStartY;

  if (activeHandle === 'body') {
    canvas.style.cursor = 'grabbing';
    target.x = Math.round(initX + dx);
    target.y = Math.round(initY + dy);
    return;
  }

  let newW = initW, newH = initH, newX = initX, newY = initY;
  if (activeHandle.includes('r')) { newW = Math.max(20, initW + dx); newX = initX + (newW - initW) / 2; }
  else if (activeHandle.includes('l')) { newW = Math.max(20, initW - dx); newX = initX - (newW - initW) / 2; }
  if (activeHandle.includes('b')) { newH = Math.max(20, initH + dy); newY = initY + (newH - initH) / 2; }
  else if (activeHandle.includes('t')) { newH = Math.max(20, initH - dy); newY = initY - (newH - initH) / 2; }

  target.width = Math.round(newW);
  target.height = Math.round(newH);
  target.x = Math.round(newX);
  target.y = Math.round(newY);
});

window.addEventListener('mouseup', () => {
  isInteracting = false;
  activeHandle = null;
  canvas.style.cursor = 'default';
});

// --- UI Selection & Modes ---
function setToolMode(mode) {
  toolMode = mode;
  document.getElementById('lbl-mode').textContent = mode;
  ['move', 'resize', 'cam'].forEach(m => {
    const btn = document.getElementById(`btn-mode-${m}`);
    btn.className = (m === mode) ? 'btn btn-active' : 'btn btn-gray';
  });
}

function selectTarget(id) {
  activeTargetId = id;
  const cp = getCurPhase();
  if (cp.characters[id]) {
    document.getElementById('char-select').value = id;
    document.getElementById('char-flip').checked = cp.characters[id].flipX;
    document.getElementById('char-dance-freq').value = cp.characters[id].danceFreq;
    document.getElementById('char-bounce-pow').value = cp.characters[id].bouncePow;
  }
  const t = getActiveTarget();
  document.getElementById('lbl-selected').textContent = t ? (t.name || t.id) : 'none';
}

function updateSelectedTransform() {
  const t = getActiveTarget();
  if (t && t.flipX !== undefined) t.flipX = document.getElementById('char-flip').checked;
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel-content').forEach(p => p.style.display = 'none');
  document.getElementById(`tab-${tab}`).style.display = 'flex';
  event.target.classList.add('active');
}

function triggerPose(pose) {
  const t = getActiveTarget();
  if (t && t.poses) { t.currentPose = pose; t.animTimer = 0; }
}

function loadBackground(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    getCurPhase().stageBg = { id: 'bg', name: 'Background', img: img, x: 0, y: 0, width: img.width, height: img.height };
    refreshPropsList();
  };
}

function addProp(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    const p = {
      id: 'prop_' + Date.now(), name: file.name.split('.')[0] || 'Prop',
      img: img, x: 0, y: 0, width: img.width || 200, height: img.height || 200
    };
    getCurPhase().props.push(p);
    selectTarget(p.id);
    refreshPropsList();
  };
}

function refreshPropsList() {
  const list = document.getElementById('props-list');
  list.innerHTML = '';
  const cp = getCurPhase();
  if (cp.stageBg) list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('bg')">🖼️ Main Background</div>`;
  cp.props.forEach(p => {
    list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('${p.id}')">📦 ${p.name}</div>`;
  });
}

function triggerFlash(col, a) { cam.flashColor = col; cam.flashAlpha = a; }
function triggerShake(amt, d) { cam.shakeIntensity = amt; cam.shakeDuration = d; }

// =========================================================================
// --- FRAME STUDIO ---
// =========================================================================

const POSE_KEYS = [
  { key: 'idle', label: 'IDLE' },
  { key: 'singUP', label: 'UP' },
  { key: 'singDOWN', label: 'DOWN' },
  { key: 'singLEFT', label: 'LEFT' },
  { key: 'singRIGHT', label: 'RIGHT' }
];

let selectedFrameInfo = null;

function openFrameStudio() {
  const t = getActiveTarget();
  document.getElementById('studio-character-title').textContent = `${t.name} (${getCurPhase().name})`;
  document.getElementById('studio-fps-input').value = t.fps || 12;
  renderPosesGrid();
  document.getElementById('frame-studio-modal').style.display = 'flex';
}

function closeFrameStudio() {
  document.getElementById('frame-studio-modal').style.display = 'none';
  selectedFrameInfo = null;
  document.getElementById('frame-inspector').style.display = 'none';
}

function updateFPS(val) {
  const t = getActiveTarget();
  if (t) t.fps = Math.max(1, parseInt(val) || 12);
}

function renderPosesGrid() {
  const grid = document.getElementById('poses-grid-container');
  grid.innerHTML = '';
  const t = getActiveTarget();

  POSE_KEYS.forEach(p => {
    const frames = t.poses[p.key] || [];
    const row = document.createElement('div');
    row.className = 'pose-row';

    const labelCell = document.createElement('div');
    labelCell.className = 'pose-label-cell';
    labelCell.innerHTML = `<h4>${p.label}</h4><small style="color:#64748b;">${frames.length} frame(s)</small>`;
    row.appendChild(labelCell);

    const strip = document.createElement('div');
    strip.className = 'frames-strip';

    const addCell = document.createElement('div');
    addCell.className = 'add-frame-cell';
    addCell.innerHTML = `+ Add<br>Frame`;
    addCell.onclick = () => triggerUploadFrame(p.key);
    strip.appendChild(addCell);

    frames.forEach((f, idx) => {
      const fCell = document.createElement('div');
      fCell.className = `frame-cell ${selectedFrameInfo && selectedFrameInfo.poseKey === p.key && selectedFrameInfo.frameIndex === idx ? 'selected' : ''}`;
      const imgElem = document.createElement('img');
      imgElem.src = f.img.src;
      fCell.appendChild(imgElem);
      const numSpan = document.createElement('span');
      numSpan.textContent = `FRAME ${idx + 1}`;
      fCell.appendChild(numSpan);
      fCell.onclick = () => selectFrame(p.key, idx);
      strip.appendChild(fCell);
    });

    row.appendChild(strip);
    grid.appendChild(row);
  });
}

function triggerUploadFrame(poseKey) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const t = getActiveTarget();
      t.poses[poseKey].push({ img: img, w: t.width, h: t.height, ox: 0, oy: 0 });
      renderPosesGrid();
    };
  };
  input.click();
}

function selectFrame(poseKey, idx) {
  selectedFrameInfo = { poseKey, frameIndex: idx };
  renderPosesGrid();
  const t = getActiveTarget();
  const f = t.poses[poseKey][idx];
  document.getElementById('frame-inspector').style.display = 'flex';
  document.getElementById('lbl-insp-pose').textContent = poseKey.toUpperCase();
  document.getElementById('lbl-insp-idx').textContent = idx + 1;
  document.getElementById('insp-frame-w').value = f.w;
  document.getElementById('insp-frame-h').value = f.h;
  document.getElementById('insp-frame-ox').value = f.ox;
  document.getElementById('insp-frame-oy').value = f.oy;
}

function updateFrameDimensions() {
  if (!selectedFrameInfo) return;
  const t = getActiveTarget();
  const f = t.poses[selectedFrameInfo.poseKey][selectedFrameInfo.frameIndex];
  f.w = parseInt(document.getElementById('insp-frame-w').value) || t.width;
  f.h = parseInt(document.getElementById('insp-frame-h').value) || t.height;
  f.ox = parseInt(document.getElementById('insp-frame-ox').value) || 0;
  f.oy = parseInt(document.getElementById('insp-frame-oy').value) || 0;
}

function replaceSelectedFrame(evt) {
  const file = evt.target.files[0];
  if (!file || !selectedFrameInfo) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    const t = getActiveTarget();
    t.poses[selectedFrameInfo.poseKey][selectedFrameInfo.frameIndex].img = img;
    renderPosesGrid();
  };
}

function deleteSelectedFrame() {
  if (!selectedFrameInfo) return;
  getActiveTarget().poses[selectedFrameInfo.poseKey].splice(selectedFrameInfo.frameIndex, 1);
  selectedFrameInfo = null;
  document.getElementById('frame-inspector').style.display = 'none';
  renderPosesGrid();
}

let rawSlicerImg = null;
function openSlicerModal() { document.getElementById('slicer-modal').style.display = 'flex'; }
function closeSlicerModal() { document.getElementById('slicer-modal').style.display = 'none'; }
function previewSlicerImage(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => { rawSlicerImg = img; };
}

function processSlices() {
  if (!rawSlicerImg) { alert('Upload an image first!'); return; }
  const rows = parseInt(document.getElementById('slicer-rows').value) || 1;
  const cols = parseInt(document.getElementById('slicer-cols').value) || 1;
  const targetPose = document.getElementById('slicer-target-pose').value;
  const cellW = rawSlicerImg.width / cols;
  const cellH = rawSlicerImg.height / rows;

  const t = getActiveTarget();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = cellW; sliceCanvas.height = cellH;
      const sctx = sliceCanvas.getContext('2d');
      sctx.drawImage(rawSlicerImg, c * cellW, r * cellH, cellW, cellH, 0, 0, cellW, cellH);

      const frameImg = new Image();
      frameImg.src = sliceCanvas.toDataURL();
      t.poses[targetPose].push({ img: frameImg, w: t.width, h: t.height, ox: 0, oy: 0 });
    }
  }
  closeSlicerModal();
  renderPosesGrid();
}

// =========================================================================
// --- MAIN RENDER, NOTES SCROLL, SMART CAM & SMART BLACKOUT ---
// =========================================================================

let lastTime = performance.now();

function render() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Real-time audio sync
  if (isPlaying) {
    if (audioCtx && instSource) {
      currentTime = (audioCtx.currentTime - audioStartContextTime + audioSeekOffset) * 1000;
    } else {
      currentTime += dt * 1000;
    }

    if (currentTime >= songDuration) { stopPlayback(); currentTime = 0; }

    const pct = (currentTime / songDuration) * 100;
    document.getElementById('playhead').style.left = `${pct}%`;
    document.getElementById('lbl-current-time').textContent = formatTime(currentTime);

    // Check transition triggers
    timelineEvents.forEach(ev => {
      if (!ev.triggered && Math.abs(currentTime - ev.time) <= 120) {
        ev.triggered = true;
        triggerBlackoutTransition(ev);
      }
    });

    // Smart Note Sing Trigger
    const curSingNote = parsedNotes.find(n => Math.abs(n.time - currentTime) <= 80);
    if (curSingNote) {
      const charKey = curSingNote.isPlayer ? 'bf' : 'dad';
      const dirPoses = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];
      const targetChar = getCurPhase().characters[charKey];
      targetChar.currentPose = dirPoses[curSingNote.dir];
      targetChar.animTimer = 0;
    }
  }

  // Decay player receptor glow
  for (let i = 0; i < 4; i++) {
    if (playerReceptors[i] === 2 && currentTime > receptorGlowTimer[i]) {
      playerReceptors[i] = 0;
    }
  }

  // Musical Beat Bop Calculation
  const beatDuration = (60 / bpm) * 1000;
  curBeat = Math.floor(currentTime / beatDuration);

  if (curBeat !== lastBeat && curBeat >= 0) {
    lastBeat = curBeat;

    // 1. Smart Camera Beat Bop
    if (curBeat % cam.bopFreq === 0) {
      cam.zoom += cam.bopStrength;
    }

    // 2. Character Idle Beat Bounce
    const cp = getCurPhase();
    ['dad', 'bf', 'gf'].forEach(cid => {
      const ch = cp.characters[cid];
      if (curBeat % ch.danceFreq === 0) {
        ch.bounceScale = 1.0 + ch.bouncePow;
        if (!ch.currentPose.startsWith('sing')) {
          ch.animTimer = 0;
        }
      }
    });
  }

  // Smooth Camera Lerp & Tracking
  const cp = getCurPhase();
  if (cam.smartTracking && toolMode !== 'cam') {
    const curSingNote = parsedNotes.find(n => Math.abs(n.time - currentTime) <= 250);
    if (curSingNote) {
      const singer = curSingNote.isPlayer ? cp.characters.bf : cp.characters.dad;
      cam.targetX = singer.x;
      cam.targetY = singer.y - 30;
    } else {
      cam.targetX = 0;
      cam.targetY = 0;
    }
  } else if (toolMode === 'cam') {
    const target = getActiveTarget();
    cam.targetX = target.x;
    cam.targetY = target.y - 30;
  } else {
    cam.targetX = 0;
    cam.targetY = 0;
  }

  cam.x += (cam.targetX - cam.x) * 0.08;
  cam.y += (cam.targetY - cam.y) * 0.08;
  cam.zoom += (cam.targetZoom - cam.zoom) * 0.08;

  // Camera Shake
  let shakeX = 0, shakeY = 0;
  if (cam.shakeDuration > 0) {
    cam.shakeDuration -= dt;
    shakeX = (Math.random() - 0.5) * cam.shakeIntensity * 2;
    shakeY = (Math.random() - 0.5) * cam.shakeIntensity * 2;
  }

  ctx.fillStyle = '#06070a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // =========================================================================
  // --- LAYER 1: WORLD (Background, Props, Characters) ---
  // =========================================================================

  ctx.save();
  ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // 1. Draw Background
  if (cp.stageBg && cp.stageBg.img) {
    ctx.drawImage(cp.stageBg.img, cp.stageBg.x - cp.stageBg.width / 2, cp.stageBg.y - cp.stageBg.height / 2, cp.stageBg.width, cp.stageBg.height);
  } else {
    ctx.strokeStyle = '#161e2e';
    ctx.lineWidth = 2;
    for (let x = -1000; x <= 1000; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, 260); ctx.lineTo(x, 1000); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-1200, 260); ctx.lineTo(1200, 260); ctx.stroke();
  }

  // 2. Draw Props
  cp.props.forEach(p => {
    ctx.drawImage(p.img, p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
  });

  // 3. Draw Characters with Bounce Scale
  ['gf', 'dad', 'bf'].forEach(id => {
    const c = cp.characters[id];
    c.animTimer = (c.animTimer || 0) + dt;
    c.bounceScale += (1.0 - c.bounceScale) * 0.12;

    const frames = c.poses[c.currentPose] && c.poses[c.currentPose].length > 0 
      ? c.poses[c.currentPose] 
      : c.poses['idle'];

    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.flipX) ctx.scale(-1, 1);
    ctx.scale(c.bounceScale, 2.0 - c.bounceScale);

    if (frames && frames.length > 0) {
      const frameIndex = Math.floor(c.animTimer * c.fps) % frames.length;
      const curFrame = frames[frameIndex];
      const fw = curFrame.w || c.width;
      const fh = curFrame.h || c.height;
      const ox = curFrame.ox || 0;
      const oy = curFrame.oy || 0;
      ctx.drawImage(curFrame.img, -fw / 2 + ox, -fh / 2 + oy, fw, fh);
    } else {
      ctx.fillStyle = c.color + '33';
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 2;
      ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);
      ctx.strokeRect(-c.width / 2, -c.height / 2, c.width, c.height);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.name, 0, 0);
      ctx.font = '12px monospace';
      ctx.fillText(`(${c.currentPose})`, 0, 20);
    }
    ctx.restore();
  });

  // 4. Selection Bounding Box
  const activeObj = getActiveTarget();
  if (activeObj && toolMode !== 'cam') {
    const b = getBounds(activeObj);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(b.left, b.top, activeObj.width, activeObj.height);
    ctx.setLineDash([]);

    if (toolMode === 'resize') {
      const handles = getHandles(activeObj);
      const hSize = 8 / cam.zoom;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      for (const pt of Object.values(handles)) {
        ctx.fillRect(pt.x - hSize / 2, pt.y - hSize / 2, hSize, hSize);
        ctx.strokeRect(pt.x - hSize / 2, pt.y - hSize / 2, hSize, hSize);
      }
    }
  }

  ctx.restore();

  // =========================================================================
  // --- LAYER 2: SMART BLACKOUT (WORLD ONLY - KEEP UI VISIBLE) ---
  // =========================================================================

  let blackAlpha = 0;
  if (activeTransition) {
    activeTransition.elapsed += dt;
    const t = activeTransition.elapsed;

    if (t < activeTransition.fadeOut) {
      blackAlpha = t / activeTransition.fadeOut;
    } else if (t < activeTransition.fadeOut + activeTransition.hold) {
      blackAlpha = 1.0;
      if (!activeTransition.swapped) {
        switchPhase(activeTransition.targetPhaseIndex);
        activeTransition.swapped = true;

        if (activeTransition.peakFlash && activeTransition.peakFlash !== 'none') {
          triggerFlash(activeTransition.peakFlash, 0.9);
        }
        if (activeTransition.peakShake && activeTransition.peakShake > 0) {
          triggerShake(activeTransition.peakShake, 0.4);
        }
      }
    } else if (t < activeTransition.total) {
      blackAlpha = (activeTransition.total - t) / activeTransition.fadeIn;
    } else {
      activeTransition = null;
    }

    if (activeTransition && activeTransition.uiMode === 'keep_ui') {
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = Math.min(1, Math.max(0, blackAlpha));
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }
  }

  // =========================================================================
  // --- LAYER 3: GAMEPLAY UI (STRUM ARROWS, NOTES & HEALTH BAR WITH ICONS) ---
  // =========================================================================

  drawStrumlinesAndNotes(ctx);
  drawHealthBarWithIcons(ctx, cp);

  // =========================================================================
  // --- LAYER 4: FULL SCREEN BLACKOUT (IF HIDE EVERYTHING MODE) ---
  // =========================================================================

  if (activeTransition && activeTransition.uiMode === 'hide_all') {
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = Math.min(1, Math.max(0, blackAlpha));
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (activeTransition.overlayImg && blackAlpha >= 0.7) {
      const oi = activeTransition.overlayImg;
      const scale = Math.min(canvas.width * 0.5 / oi.width, canvas.height * 0.5 / oi.height);
      const ow = oi.width * scale, oh = oi.height * scale;
      ctx.globalAlpha = 1.0;
      ctx.drawImage(oi, (canvas.width - ow) / 2, (canvas.height - oh) / 2, ow, oh);
    }
    ctx.globalAlpha = 1.0;
  }

  // =========================================================================
  // --- LAYER 5: INTENSITY FLASH FX (PIERCES THROUGH BLACKOUT) ---
  // =========================================================================

  if (cam.flashAlpha > 0) {
    ctx.fillStyle = cam.flashColor;
    ctx.globalAlpha = cam.flashAlpha;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    cam.flashAlpha = Math.max(0, cam.flashAlpha - dt * 1.5);
  }

  requestAnimationFrame(render);
}

// Renders the 4 Dad and 4 BF Arrow Receptors + Scrolling Notes (Upscroll or Downscroll)
function drawStrumlinesAndNotes(ctx) {
  const downscroll = gameConfig.downscroll;
  const strumY = downscroll ? (canvas.height - 70) : 55;
  const spacing = 46;
  const size = 18;
  const scrollFactor = 0.45 * songSpeed;

  // Dad Receptors (Left: 4 arrows)
  for (let i = 0; i < 4; i++) {
    drawMiniArrow(ctx, 60 + i * spacing, strumY, size, i, ARROW_COLORS[i], 'stroke');
  }

  // BF Receptors (Right: 4 arrows)
  const bfStartX = canvas.width - (4 * spacing) - 40;
  for (let i = 0; i < 4; i++) {
    const rx = bfStartX + i * spacing;
    const style = playerReceptors[i] === 2 ? 'glow' : (playerReceptors[i] === 1 ? 'fill' : 'stroke');
    drawMiniArrow(ctx, rx, strumY, size, i, ARROW_COLORS[i], style);
  }

  // Render scrolling notes from chart
  if (isPlaying && parsedNotes.length > 0) {
    parsedNotes.forEach(n => {
      const timeDiff = n.time - currentTime;
      if (timeDiff < -200 || timeDiff > 1200) return;

      const noteX = n.isPlayer ? (bfStartX + n.dir * spacing) : (60 + n.dir * spacing);
      const noteY = downscroll ? (strumY - timeDiff * scrollFactor) : (strumY + timeDiff * scrollFactor);

      if (noteY >= -50 && noteY <= canvas.height + 50) {
        drawMiniArrow(ctx, noteX, noteY, size, n.dir, ARROW_COLORS[n.dir], 'fill');
      }
    });
  }
}

function drawMiniArrow(ctx, x, y, size, dir, color, style = 'stroke') {
  ctx.save();
  ctx.translate(x, y);
  const angles = [-Math.PI / 2, Math.PI, 0, Math.PI / 2];
  ctx.rotate(angles[dir]);

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.9, 0);
  ctx.lineTo(size * 0.45, 0);
  ctx.lineTo(size * 0.45, size * 0.9);
  ctx.lineTo(-size * 0.45, size * 0.9);
  ctx.lineTo(-size * 0.45, 0);
  ctx.lineTo(-size * 0.9, 0);
  ctx.closePath();

  if (style === 'fill') {
    ctx.fillStyle = color;
    ctx.fill();
  } else if (style === 'glow') {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fill();
  } else {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

// Renders the Health Bar and Phase Icons bouncing on beat
function drawHealthBarWithIcons(ctx, phase) {
  const barW = 380, barH = 12;
  const barX = (canvas.width - barW) / 2;
  const barY = gameConfig.downscroll ? 45 : (canvas.height - 35);

  ctx.fillStyle = '#ff1744';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#39ff14';
  ctx.fillRect(barX + barW / 2, barY, barW / 2, barH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(barX, barY, barW, barH);

  const iconBounce = Math.max(1.0, 1.0 + (cam.zoom - cam.targetZoom) * 1.2);
  const iconSize = 42 * iconBounce;

  const dadIcon = phase.icons.dad.neutral;
  if (dadIcon) {
    ctx.drawImage(dadIcon, barX + barW / 2 - iconSize - 10, barY - iconSize / 2, iconSize, iconSize);
  }

  const bfIcon = phase.icons.bf.neutral;
  if (bfIcon) {
    ctx.drawImage(bfIcon, barX + barW / 2 + 10, barY - iconSize / 2, iconSize, iconSize);
  }
}

// =========================================================================
// --- EXPORT & IMPORT .IMP PACKAGE ENGINE ---
// =========================================================================

function fileToBase64(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function imageToBase64(img) {
  if (!img) return null;
  if (img.src && img.src.startsWith('data:')) return img.src;
  const c = document.createElement('canvas');
  c.width = img.width || 200;
  c.height = img.height || 200;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

function base64ToArrayBuffer(base64) {
  const raw = window.atob(base64.split(',')[1] || base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function loadImageFromB64(b64) {
  return new Promise((resolve) => {
    if (!b64) return resolve(null);
    const img = new Image();
    img.src = b64;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

// Export Complete .imp Package
async function exportIMPPackage() {
  const btn = event.target;
  btn.textContent = '📦 Packaging .imp...';

  const instB64 = await fileToBase64(rawAudioFiles.inst);
  const voicesB64 = await fileToBase64(rawAudioFiles.voices);

  const serializedPhases = phases.map(p => ({
    id: p.id,
    name: p.name,
    characters: {
      dad: serializeCharacter(p.characters.dad),
      bf:  serializeCharacter(p.characters.bf),
      gf:  serializeCharacter(p.characters.gf)
    },
    icons: {
      dad: {
        neutral: imageToBase64(p.icons.dad.neutral),
        losing:  imageToBase64(p.icons.dad.losing)
      },
      bf: {
        neutral: imageToBase64(p.icons.bf.neutral),
        losing:  imageToBase64(p.icons.bf.losing)
      }
    },
    stageBg: p.stageBg ? { ...p.stageBg, imgB64: imageToBase64(p.stageBg.img), img: undefined } : null,
    props: p.props.map(pr => ({ ...pr, imgB64: imageToBase64(pr.img), img: undefined }))
  }));

  const impPackage = {
    format: 'IMP_STUDIO_V1',
    created: Date.now(),
    startPos: startPosTime,
    config: {
      downscroll: gameConfig.downscroll
    },
    camera: {
      baseZoom: cam.targetZoom,
      bopStrength: cam.bopStrength,
      bopFreq: cam.bopFreq,
      smartTracking: cam.smartTracking
    },
    audio: {
      inst: instB64,
      voices: voicesB64
    },
    chart: chartData,
    phases: serializedPhases,
    events: timelineEvents
  };

  const blob = new Blob([JSON.stringify(impPackage)], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${chartData?.song?.song || 'my_mod'}.imp`;
  a.click();

  btn.textContent = '📦 Export .imp Package';
}

function serializeCharacter(c) {
  const posesB64 = {};
  for (const [key, frames] of Object.entries(c.poses)) {
    posesB64[key] = frames.map(f => ({
      imgB64: imageToBase64(f.img),
      w: f.w, h: f.h, ox: f.ox, oy: f.oy
    }));
  }

  return {
    id: c.id, name: c.name, x: c.x, y: c.y, width: c.width, height: c.height,
    flipX: c.flipX, fps: c.fps, danceFreq: c.danceFreq, bouncePow: c.bouncePow,
    poses: posesB64
  };
}

// Full .imp Project Importer
async function handleImportIMP(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  const text = await file.text();
  try {
    const imp = JSON.parse(text);
    if (!imp.format || !imp.format.startsWith('IMP_STUDIO')) {
      alert('File is not a valid FNF Studio .imp file!');
      return;
    }

    await initAudioContext();

    // 1. Rebuild Audio
    if (imp.audio?.inst) {
      const buf = base64ToArrayBuffer(imp.audio.inst);
      instBuffer = await audioCtx.decodeAudioData(buf);
      songDuration = instBuffer.duration * 1000;
      document.getElementById('status-inst').textContent = '✓';
    }
    if (imp.audio?.voices) {
      const buf = base64ToArrayBuffer(imp.audio.voices);
      voicesBuffer = await audioCtx.decodeAudioData(buf);
      document.getElementById('status-voices').textContent = '✓';
    }

    // 2. Rebuild Chart
    if (imp.chart) {
      chartData = imp.chart;
      processChartData(chartData);
      document.getElementById('status-chart').textContent = '✓';
    }

    // 3. Rebuild Settings & Camera
    if (imp.config) {
      gameConfig.downscroll = !!imp.config.downscroll;
      document.getElementById('opt-downscroll').checked = gameConfig.downscroll;
    }
    if (imp.camera) {
      cam.targetZoom = imp.camera.baseZoom || 0.9;
      cam.bopStrength = imp.camera.bopStrength || 0.04;
      cam.bopFreq = imp.camera.bopFreq || 4;
      cam.smartTracking = imp.camera.smartTracking !== false;
      document.getElementById('cam-base-zoom').value = cam.targetZoom;
      document.getElementById('cam-bop-strength').value = cam.bopStrength;
      document.getElementById('cam-bop-freq').value = cam.bopFreq;
      document.getElementById('cam-smart-toggle').checked = cam.smartTracking;
    }

    // 4. Rebuild StartPos & Events
    startPosTime = imp.startPos || 0;
    document.getElementById('lbl-startpos-time').textContent = `StartPos: ${formatTime(startPosTime)}`;
    const pct = (startPosTime / songDuration) * 100;
    document.getElementById('startposMarker').style.left = `${pct}%`;

    timelineEvents = imp.events || [];
    renderEventMarkers();

    // 5. Rebuild All Phases & Characters
    const reconstructedPhases = [];
    for (const p of imp.phases) {
      const newChars = createDefaultCharacters();

      for (const cid of ['dad', 'bf', 'gf']) {
        const charData = p.characters[cid];
        if (!charData) continue;
        newChars[cid].x = charData.x;
        newChars[cid].y = charData.y;
        newChars[cid].width = charData.width;
        newChars[cid].height = charData.height;
        newChars[cid].flipX = charData.flipX;
        newChars[cid].fps = charData.fps || 12;
        newChars[cid].danceFreq = charData.danceFreq || 2;
        newChars[cid].bouncePow = charData.bouncePow || 0.06;

        // Restore animation frames
        for (const [poseKey, frames] of Object.entries(charData.poses || {})) {
          newChars[cid].poses[poseKey] = [];
          for (const f of frames) {
            const img = await loadImageFromB64(f.imgB64);
            if (img) {
              newChars[cid].poses[poseKey].push({
                img: img, w: f.w, h: f.h, ox: f.ox, oy: f.oy
              });
            }
          }
        }
      }

      // Restore icons
      const dadNeutral = await loadImageFromB64(p.icons?.dad?.neutral);
      const dadLosing = await loadImageFromB64(p.icons?.dad?.losing);
      const bfNeutral = await loadImageFromB64(p.icons?.bf?.neutral);
      const bfLosing = await loadImageFromB64(p.icons?.bf?.losing);

      // Restore stage background
      let restoredBg = null;
      if (p.stageBg?.imgB64) {
        const bgImg = await loadImageFromB64(p.stageBg.imgB64);
        restoredBg = { ...p.stageBg, img: bgImg };
      }

      // Restore props
      const restoredProps = [];
      for (const pr of p.props || []) {
        if (pr.imgB64) {
          const propImg = await loadImageFromB64(pr.imgB64);
          restoredProps.push({ ...pr, img: propImg });
        }
      }

      reconstructedPhases.push({
        id: p.id,
        name: p.name,
        characters: newChars,
        icons: {
          dad: { neutral: dadNeutral, losing: dadLosing },
          bf:  { neutral: bfNeutral, losing: bfLosing }
        },
        stageBg: restoredBg,
        props: restoredProps
      });
    }

    phases = reconstructedPhases;
    activePhaseIndex = 0;
    renderPhaseTabs();
    selectTarget('bf');
    refreshPropsList();

    alert(`Successfully loaded mod package: "${imp.chart?.song?.song || 'Project'}"!`);
  } catch (err) {
    console.error(err);
    alert('Failed to import .imp package! Make sure the file is valid.');
  }
}

// Drag & Drop .imp directly onto window
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files[0]) {
    const f = e.dataTransfer.files[0];
    if (f.name.endsWith('.imp') || f.name.endsWith('.json')) {
      handleImportIMP({ target: { files: [f] } });
    }
  }
});

resizeCanvas();
setToolMode('move');
renderPhaseTabs();
requestAnimationFrame(render);
