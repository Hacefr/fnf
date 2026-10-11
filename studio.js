// --- FNF Studio Engine: Phases, Isolated Sprites, StartPos & Transitions ---
const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('stage-canvas-container');

function resizeCanvas() {
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// Camera System
const cam = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  zoom: 0.9,
  shakeIntensity: 0,
  shakeDuration: 0,
  flashColor: '#ffffff',
  flashAlpha: 0
};

// =========================================================================
// --- ISOLATED PHASES DATA ARCHITECTURE ---
// =========================================================================

function createEmptyPoses() {
  return { idle: [], singUP: [], singDOWN: [], singLEFT: [], singRIGHT: [] };
}

function createDefaultCharacters() {
  return {
    dad: { id: 'dad', name: 'Opponent (Lime)', x: -380, y: 80, width: 220, height: 380, flipX: false, color: '#39ff14', currentPose: 'idle', fps: 12, animTimer: 0, poses: createEmptyPoses() },
    gf:  { id: 'gf',  name: 'Girlfriend',      x: 0,    y: 10, width: 240, height: 320, flipX: false, color: '#a855f7', currentPose: 'idle', fps: 12, animTimer: 0, poses: createEmptyPoses() },
    bf:  { id: 'bf',  name: 'Boyfriend',       x: 360,  y: 90, width: 200, height: 320, flipX: false, color: '#00ffff', currentPose: 'idle', fps: 12, animTimer: 0, poses: createEmptyPoses() }
  };
}

// Multi-Phase State
const phases = [
  {
    id: 'phase_1',
    name: 'Phase 1',
    characters: createDefaultCharacters(),
    props: [],
    stageBg: null
  }
];

let activePhaseIndex = 0;
function getCurPhase() { return phases[activePhaseIndex]; }

let activeTargetId = 'bf'; // 'bf', 'dad', 'gf', or prop id
let toolMode = 'move';     // 'move', 'resize', or 'cam'

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

  // Create isolated characters for the new phase (carries over position baseline, but separate sprites!)
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
    props: JSON.parse(JSON.stringify(prevPhase.props)),
    stageBg: prevPhase.stageBg
  });

  switchPhase(phases.length - 1);
}

// =========================================================================
// --- TIMELINE, STARTPOS & TRANSITION BLACKOUT ENGINE ---
// =========================================================================

let songDuration = 120000; // 2 minutes default (or audio track length)
let currentTime = 0;
let startPosTime = 0;
let isPlaying = false;

// Transition State
const timelineEvents = []; // [{ time, targetPhaseIndex, fadeOut, hold, fadeIn, overlayImg }]
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
  isPlaying = true;
}

function scrubTimeline(e) {
  const rect = document.getElementById('timelineTrack').getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  currentTime = pct * songDuration;
  document.getElementById('playhead').style.left = `${pct * 100}%`;
  document.getElementById('lbl-current-time').textContent = formatTime(currentTime);
}

// Blackout & Transition Logic
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
  const fadeOut = parseFloat(document.getElementById('trans-fade-out').value) || 0.4;
  const hold = parseFloat(document.getElementById('trans-hold').value) || 1.2;
  const fadeIn = parseFloat(document.getElementById('trans-fade-in').value) || 0.5;

  timelineEvents.push({
    time: currentTime,
    targetPhaseIndex: targetPhase,
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

// Live Transition Previewer
function previewCurrentTransition() {
  const nextIdx = (activePhaseIndex + 1) % phases.length;
  triggerBlackoutTransition({
    fadeOut: 0.4,
    hold: 1.2,
    fadeIn: 0.5,
    targetPhaseIndex: nextIdx,
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
  }
  const t = getActiveTarget();
  document.getElementById('lbl-selected').textContent = t ? (t.name || t.id) : 'none';
}

function updateSelectedTransform() {
  const t = getActiveTarget();
  if (t && t.flipX !== undefined) {
    t.flipX = document.getElementById('char-flip').checked;
  }
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
      id: 'prop_' + Date.now(),
      name: file.name.split('.')[0] || 'Prop',
      img: img,
      x: 0, y: 0,
      width: img.width || 200,
      height: img.height || 200
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
  if (cp.stageBg) {
    list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('bg')">🖼️ Main Background</div>`;
  }
  cp.props.forEach(p => {
    list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('${p.id}')">📦 ${p.name}</div>`;
  });
}

function triggerFlash(col, a) { cam.flashColor = col; cam.flashAlpha = a; }
function triggerShake(amt, d) { cam.shakeIntensity = amt; cam.shakeDuration = d; }

// =========================================================================
// --- FRAME STUDIO (Operating on Current Isolated Phase) ---
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

// =========================================================================
// --- SPRITESHEET SLICER ---
// =========================================================================

let rawSlicerImg = null;
function openSlicerModal() { document.getElementById('slicer-modal').style.display = 'flex'; }
function closeSlicerModal() { document.getElementById('slic
