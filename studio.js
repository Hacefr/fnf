// --- FNF Studio Engine (Canvas, Drag, 4-Side Resizer & Camera) ---
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

// Stage Background & Props
let stageBg = null;
const props = []; // Stage props: { id, name, img, x, y, width, height }

// Characters State
const characters = {
  dad: { id: 'dad', name: 'Opponent (Lime)', x: -380, y: 80, width: 220, height: 380, flipX: false, color: '#39ff14', currentPose: 'idle', poses: {} },
  gf:  { id: 'gf',  name: 'Girlfriend',      x: 0,    y: 10, width: 240, height: 320, flipX: false, color: '#a855f7', currentPose: 'idle', poses: {} },
  bf:  { id: 'bf',  name: 'Boyfriend',       x: 360,  y: 90, width: 200, height: 320, flipX: false, color: '#00ffff', currentPose: 'idle', poses: {} }
};

let activeTarget = characters.bf; // Currently selected object (char or prop)
let toolMode = 'move'; // 'move', 'resize', or 'cam'

// Transform & Drag State
let isInteracting = false;
let activeHandle = null; // 'body', 'tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'
let dragStartX = 0;
let dragStartY = 0;
let initX = 0, initY = 0, initW = 0, initH = 0;

// Coordinate transformation: Screen -> World
function screenToWorld(sx, sy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    x: (sx - cx) / cam.zoom + cam.x,
    y: (sy - cy) / cam.zoom + cam.y
  };
}

// Coordinate transformation: World -> Screen
function worldToScreen(wx, wy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    x: (wx - cam.x) * cam.zoom + cx,
    y: (wy - cam.y) * cam.zoom + cy
  };
}

// Bounding Box calculations
function getBounds(obj) {
  return {
    left: obj.x - obj.width / 2,
    right: obj.x + obj.width / 2,
    top: obj.y - obj.height / 2,
    bottom: obj.y + obj.height / 2
  };
}

// 8 Resizing Handles (4 Corners + 4 Sides)
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

// --- Mouse Interaction ---
canvas.addEventListener('mousedown', (e) => {
  if (toolMode === 'cam') return;

  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

  // 1. If in Resize Mode, check handle clicks on active target first
  if (toolMode === 'resize' && activeTarget) {
    const handles = getHandles(activeTarget);
    const handleThreshold = 12 / cam.zoom; // 12px screen radius

    for (const [key, pt] of Object.entries(handles)) {
      if (Math.hypot(world.x - pt.x, world.y - pt.y) <= handleThreshold) {
        isInteracting = true;
        activeHandle = key;
        dragStartX = world.x;
        dragStartY = world.y;
        initX = activeTarget.x;
        initY = activeTarget.y;
        initW = activeTarget.width;
        initH = activeTarget.height;
        return;
      }
    }
  }

  // 2. Object Selection Hit-Test (Check in order: BF -> Dad -> GF -> Props -> StageBg)
  const allObjects = [characters.bf, characters.dad, characters.gf, ...props.slice().reverse()];
  if (stageBg) allObjects.push(stageBg);

  for (const obj of allObjects) {
    const b = getBounds(obj);
    if (world.x >= b.left && world.x <= b.right && world.y >= b.top && world.y <= b.bottom) {
      selectTarget(obj.id);
      isInteracting = true;
      activeHandle = 'body';
      dragStartX = world.x;
      dragStartY = world.y;
      initX = obj.x;
      initY = obj.y;
      return;
    }
  }
});

window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

  // Update Mouse Cursors based on hover
  if (!isInteracting && toolMode === 'resize' && activeTarget) {
    const handles = getHandles(activeTarget);
    let matchedCursor = 'default';
    for (const pt of Object.values(handles)) {
      if (Math.hypot(world.x - pt.x, world.y - pt.y) <= 12 / cam.zoom) {
        matchedCursor = pt.cursor;
        break;
      }
    }
    canvas.style.cursor = matchedCursor;
  } else if (!isInteracting) {
    canvas.style.cursor = toolMode === 'move' ? 'grab' : 'default';
  }

  if (!isInteracting || !activeTarget) return;

  const dx = world.x - dragStartX;
  const dy = world.y - dragStartY;

  // Move body
  if (activeHandle === 'body') {
    canvas.style.cursor = 'grabbing';
    activeTarget.x = Math.round(initX + dx);
    activeTarget.y = Math.round(initY + dy);
    return;
  }

  // Handle 4 Sides & Corners Dynamic Resizing
  let newW = initW;
  let newH = initH;
  let newX = initX;
  let newY = initY;

  // Right side / Left side
  if (activeHandle.includes('r')) {
    newW = Math.max(20, initW + dx);
    newX = initX + (newW - initW) / 2;
  } else if (activeHandle.includes('l')) {
    newW = Math.max(20, initW - dx);
    newX = initX - (newW - initW) / 2;
  }

  // Bottom side / Top side
  if (activeHandle.includes('b')) {
    newH = Math.max(20, initH + dy);
    newY = initY + (newH - initH) / 2;
  } else if (activeHandle.includes('t')) {
    newH = Math.max(20, initH - dy);
    newY = initY - (newH - initH) / 2;
  }

  activeTarget.width = Math.round(newW);
  activeTarget.height = Math.round(newH);
  activeTarget.x = Math.round(newX);
  activeTarget.y = Math.round(newY);
});

window.addEventListener('mouseup', () => {
  isInteracting = false;
  activeHandle = null;
  canvas.style.cursor = 'default';
});

// --- Studio Selection & Modes ---
function setToolMode(mode) {
  toolMode = mode;
  document.getElementById('lbl-mode').textContent = mode;
  ['move', 'resize', 'cam'].forEach(m => {
    const btn = document.getElementById(`btn-mode-${m}`);
    btn.className = (m === mode) ? 'btn btn-active' : 'btn btn-gray';
  });
}

function selectTarget(id) {
  if (characters[id]) {
    activeTarget = characters[id];
    document.getElementById('char-select').value = id;
    document.getElementById('char-flip').checked = activeTarget.flipX;
  } else {
    const prop = props.find(p => p.id === id);
    if (prop) activeTarget = prop;
    else if (stageBg && stageBg.id === id) activeTarget = stageBg;
  }
  document.getElementById('lbl-selected').textContent = activeTarget ? activeTarget.name : 'none';
}

function updateSelectedTransform() {
  if (activeTarget && activeTarget.flipX !== undefined) {
    activeTarget.flipX = document.getElementById('char-flip').checked;
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel-content').forEach(p => p.style.display = 'none');
  document.getElementById(`tab-${tab}`).style.display = 'flex';
  event.target.classList.add('active');
}

// --- Asset Loaders ---
function loadPose(pose, evt) {
  const file = evt.target.files[0];
  if (!file || !activeTarget || !activeTarget.poses) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    activeTarget.poses[pose] = img;
    activeTarget.currentPose = pose;
  };
}

function triggerPose(pose) {
  if (activeTarget && activeTarget.poses) activeTarget.currentPose = pose;
}

function loadBackground(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = () => {
    stageBg = { id: 'bg', name: 'Background', img: img, x: 0, y: 0, width: img.width, height: img.height };
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
      x: 0,
      y: 0,
      width: img.width || 200,
      height: img.height || 200
    };
    props.push(p);
    selectTarget(p.id);
    refreshPropsList();
  };
}

function refreshPropsList() {
  const list = document.getElementById('props-list');
  list.innerHTML = '';
  if (stageBg) {
    list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('bg')">🖼️ Main Background</div>`;
  }
  props.forEach(p => {
    list.innerHTML += `<div style="padding:4px; cursor:pointer;" onclick="selectTarget('${p.id}')">📦 ${p.name}</div>`;
  });
}

// --- Visual FX ---
function triggerFlash(col, a) { cam.flashColor = col; cam.flashAlpha = a; }
function triggerShake(amt, d) { cam.shakeIntensity = amt; cam.shakeDuration = d; }

// --- Render Loop ---
let lastTime = performance.now();

function render() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Camera tracking
  if (toolMode === 'cam') {
    cam.targetX = activeTarget.x;
    cam.targetY = activeTarget.y - 40;
  } else {
    cam.targetX = 0;
    cam.targetY = 0;
  }
  cam.x += (cam.targetX - cam.x) * 0.1;
  cam.y += (cam.targetY - cam.y) * 0.1;

  // Shake
  let shakeX = 0, shakeY = 0;
  if (cam.shakeDuration > 0) {
    cam.shakeDuration -= dt;
    shakeX = (Math.random() - 0.5) * cam.shakeIntensity * 2;
    shakeY = (Math.random() - 0.5) * cam.shakeIntensity * 2;
  }

  ctx.fillStyle = '#06070a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // 1. Draw Main Background
  if (stageBg && stageBg.img) {
    ctx.drawImage(stageBg.img, stageBg.x - stageBg.width / 2, stageBg.y - stageBg.height / 2, stageBg.width, stageBg.height);
  } else {
    // Grid floor
    ctx.strokeStyle = '#161e2e';
    ctx.lineWidth = 2;
    for (let x = -1000; x <= 1000; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, 260); ctx.lineTo(x, 1000); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-1200, 260); ctx.lineTo(1200, 260); ctx.stroke();
  }

  // 2. Draw Props
  props.forEach(p => {
    ctx.drawImage(p.img, p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
  });

  // 3. Draw Characters (GF -> Dad -> BF)
  ['gf', 'dad', 'bf'].forEach(id => {
    const c = characters[id];
    const img = c.poses[c.currentPose] || c.poses['idle'];

    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.flipX) ctx.scale(-1, 1);

    if (img) {
      ctx.drawImage(img, -c.width / 2, -c.height / 2, c.width, c.height);
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
    }
    ctx.restore();
  });

  // 4. Draw Selection Bounding Box & 4-Side Handles
  if (activeTarget && toolMode !== 'cam') {
    const b = getBounds(activeTarget);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(b.left, b.top, activeTarget.width, activeTarget.height);
    ctx.setLineDash([]);

    // Draw handles if in Resize Mode
    if (toolMode === 'resize') {
      const handles = getHandles(activeTarget);
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

  // Screen Flash
  if (cam.flashAlpha > 0) {
    ctx.fillStyle = cam.flashColor;
    ctx.globalAlpha = cam.flashAlpha;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    cam.flashAlpha = Math.max(0, cam.flashAlpha - dt * 1.5);
  }

  requestAnimationFrame(render);
}

// Project Exporter
function exportProject() {
  const project = {
    characters: {
      dad: { x: characters.dad.x, y: characters.dad.y, w: characters.dad.width, h: characters.dad.height, flipX: characters.dad.flipX },
      bf:  { x: characters.bf.x,  y: characters.bf.y,  w: characters.bf.width,  h: characters.bf.height,  flipX: characters.bf.flipX },
      gf:  { x: characters.gf.x,  y: characters.gf.y,  w: characters.gf.width,  h: characters.gf.height,  flipX: characters.gf.flipX }
    },
    props: props.map(p => ({ name: p.name, x: p.x, y: p.y, w: p.width, h: p.height }))
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stage_layout.json';
  a.click();
}

resizeCanvas();
setToolMode('move');
requestAnimationFrame(render);
