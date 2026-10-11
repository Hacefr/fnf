// --- studio.js: Phase Management, Frame Studio, Hierarchy Tree & Resizer ---

function createEmptyPoses() {
  return { idle: [], singUP: [], singDOWN: [], singLEFT: [], singRIGHT: [] };
}

function createDefaultCharacters() {
  return {
    dad: {
      id: 'dad', name: 'Opponent (Lime)', x: -300, y: 20, width: 180, height: 280,
      flipX: false, color: '#39ff14', currentPose: 'idle', fps: 12, animTimer: 0,
      danceFreq: 2, bouncePow: 0.06, bounceScale: 1.0, poses: createEmptyPoses()
    },
    gf: {
      id: 'gf', name: 'Girlfriend', x: 0, y: -40, width: 200, height: 220,
      flipX: false, color: '#c026d3', currentPose: 'idle', fps: 12, animTimer: 0,
      danceFreq: 2, bouncePow: 0.06, bounceScale: 1.0, poses: createEmptyPoses()
    },
    bf: {
      id: 'bf', name: 'Boyfriend', x: 300, y: 30, width: 170, height: 260,
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
function getCurPhase() { return phases[activePhaseIndex] || phases[0]; }

let activeTargetId = 'bf';
let toolMode = 'move';

let isInteracting = false;
let activeHandle = null;
let dragStartX = 0, dragStartY = 0;
let initX = 0, initY = 0, initW = 0, initH = 0;

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

function renderPhaseTabs() {
  const container = document.getElementById('phase-tabs-container');
  if (!container) return;
  container.innerHTML = '';
  phases.forEach((p, idx) => {
    const tab = document.createElement('div');
    tab.className = `phase-tab ${idx === activePhaseIndex ? 'active' : ''}`;
    tab.textContent = p.name;
    tab.onclick = () => switchPhase(idx);
    container.appendChild(tab);
  });
  const lblName = document.getElementById('lbl-phase-name');
  if (lblName) lblName.textContent = getCurPhase().name;
  const lblIcon = document.getElementById('lbl-icon-phase');
  if (lblIcon) lblIcon.textContent = getCurPhase().name;
}

function switchPhase(idx) {
  activePhaseIndex = idx;
  renderPhaseTabs();
  selectTarget(activeTargetId);
  renderObjectTree();
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

// Scene Hierarchy / Object Tree (Selects objects behind other objects)
function renderObjectTree() {
  const container = document.getElementById('object-tree-container');
  if (!container) return;
  container.innerHTML = '';

  const cp = getCurPhase();
  const items = [
    { id: 'dad', label: '😈 Opponent (Lime)', type: 'char' },
    { id: 'gf',  label: '💃 Girlfriend',       type: 'char' },
    { id: 'bf',  label: '🎤 Boyfriend',        type: 'char' }
  ];

  if (cp.stageBg) {
    items.unshift({ id: 'bg', label: '🖼️ Stage Background', type: 'bg' });
  }

  cp.props.forEach(p => {
    items.push({ id: p.id, label: `📦 Prop: ${p.name}`, type: 'prop' });
  });

  items.forEach(it => {
    const div = document.createElement('div');
    div.className = `object-tree-item ${activeTargetId === it.id ? 'selected' : ''}`;
    div.textContent = it.label;
    div.onclick = () => selectTarget(it.id);
    container.appendChild(div);
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
  renderObjectTree();
}

function updateSelectedTransform() {
  const t = getActiveTarget();
  if (t && t.flipX !== undefined) t.flipX = document.getElementById('char-flip').checked;
}

function setToolMode(mode) {
  toolMode = mode;
  document.getElementById('lbl-mode').textContent = mode;
  ['move', 'resize', 'cam'].forEach(m => {
    const btn = document.getElementById(`btn-mode-${m}`);
    if (btn) btn.className = (m === mode) ? 'btn btn-active' : 'btn btn-gray';
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel-content').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(`tab-${tab}`);
  if (panel) panel.style.display = 'flex';
  const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tab));
  if (btn) btn.classList.add('active');
}

function triggerPose(pose) {
  const t = getActiveTarget();
  if (t && t.poses) { t.currentPose = pose; t.animTimer = 0; }
}

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

function loadBackground(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    getCurPhase().stageBg = { id: 'bg', name: 'Background', img: img, x: 0, y: 0, width: img.width, height: img.height };
    renderObjectTree();
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
    renderObjectTree();
    refreshPropsList();
  };
}

function refreshPropsList() {
  const list = document.getElementById('props-list');
  if (!list) return;
  list.innerHTML = '';
  const cp = getCurPhase();
  if (cp.stageBg) list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('bg')">🖼️ Main Background</div>`;
  cp.props.forEach(p => {
    list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('${p.id}')">📦 ${p.name}</div>`;
  });
}

// Mouse Drag & 4-Side Resizer Interaction
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

// Frame Studio Modal Logic
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
