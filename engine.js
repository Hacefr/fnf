// --- engine.js: Core Canvas, Smart Camera (Duet-Zoom), Audio & V-Slice Mobile Controls ---
const canvas = document.getElementById('stageCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('stage-canvas-container');

function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  canvas.width = Math.max(320, rect.width || window.innerWidth - 340);
  canvas.height = Math.max(240, rect.height || window.innerHeight - 200);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);

// Global Configuration
const gameConfig = {
  downscroll: false,
  mobileTouch: false,
  pixelArt: false,
  scrollSpeed: 2.2
};

function togglePixelArt(enabled) {
  gameConfig.pixelArt = enabled;
  ctx.imageSmoothingEnabled = !enabled;
}

function updateScrollSpeed(val) {
  gameConfig.scrollSpeed = parseFloat(val) || 2.2;
  document.getElementById('lbl-scroll-speed').textContent = `${gameConfig.scrollSpeed.toFixed(1)}x`;
}

// Camera System (Smart Duet Zoom & Bop)
const cam = {
  x: 0, y: 0,
  targetX: 0, targetY: 0,
  zoom: 0.85, targetZoom: 0.85, baseZoom: 0.85,
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
let isPlaying = false;
let audioStartContextTime = 0;
let audioSeekOffset = 0;

let curBeat = 0;
let lastBeat = -1;

const ARROW_COLORS = ['#C24B99', '#00FFFF', '#12FA05', '#F9393F'];
const playerReceptors = [0, 0, 0, 0];
const receptorGlowTimer = [0, 0, 0, 0];

// Screen <-> World Space Coordinates
function screenToWorld(sx, sy) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return {
    x: (sx - cx) / cam.zoom + cam.x,
    y: (sy - cy) / cam.zoom + cam.y
  };
}

// V-Slice Mobile Touch Controls with Smooth Drag-Across
function toggleMobileTouchLayer(enabled) {
  gameConfig.mobileTouch = enabled;
  document.getElementById('mobile-touch-layer').style.display = enabled ? 'block' : 'none';
}

const mobileTouchLayer = document.getElementById('mobile-touch-layer');
const hitboxes = document.querySelectorAll('.touch-hitbox');

function updateMobileTouches(e) {
  e.preventDefault();
  const activeLanes = [false, false, false, false];

  for (let i = 0; i < e.touches.length; i++) {
    const touch = e.touches[i];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.dataset.lane !== undefined) {
      const lane = parseInt(el.dataset.lane);
      activeLanes[lane] = true;
    }
  }

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
  playerReceptors[lane] = 2;
  receptorGlowTimer[lane] = currentTime + 140;

  const dirPoses = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];
  const bf = getCurPhase().characters.bf;
  bf.currentPose = dirPoses[lane];
  bf.animTimer = 0;
}

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

// Audio Track Loaders
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
  gameConfig.scrollSpeed = songSpeed;
  document.getElementById('opt-scroll-speed').value = songSpeed;
  document.getElementById('lbl-scroll-speed').textContent = `${songSpeed.toFixed(1)}x`;

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
  document.getElementById('btn-play-pause-main').textContent = '⏸ Pause';
  document.getElementById('btn-play-pause-side').textContent = '⏸ Pause';
  document.getElementById('btn-play-pause-main').classList.replace('btn-green', 'btn-gray');
  document.getElementById('btn-play-pause-side').classList.replace('btn-green', 'btn-gray');
}

function stopPlayback() {
  isPlaying = false;
  stopAudioSources();
  document.getElementById('btn-play-pause-main').textContent = '▶ Play';
  document.getElementById('btn-play-pause-side').textContent = '▶ Play';
  document.getElementById('btn-play-pause-main').classList.replace('btn-gray', 'btn-green');
  document.getElementById('btn-play-pause-side').classList.replace('btn-gray', 'btn-green');
}

function stopAudioSources() {
  if (instSource) { try { instSource.stop(); } catch(e){} instSource = null; }
  if (voicesSource) { try { voicesSource.stop(); } catch(e){} voicesSource = null; }
}

function triggerFlash(col, a) { cam.flashColor = col; cam.flashAlpha = a; }
function triggerShake(amt, d) { cam.shakeIntensity = amt; cam.shakeDuration = d; }

// --- Arrow & Strumline Renderer ---
function drawStrumlinesAndNotes(ctx) {
  const downscroll = gameConfig.downscroll;
  const isMobile = gameConfig.mobileTouch;
  const spacing = 48;
  const size = 19;
  const scrollFactor = 0.45 * gameConfig.scrollSpeed;

  // Dad Receptors (Left side: fixed at top)
  const dadY = downscroll ? (canvas.height - 75) : 60;
  for (let i = 0; i < 4; i++) {
    drawMiniArrow(ctx, 40 + i * spacing, dadY, size, i, ARROW_COLORS[i], 'stroke');
  }

  // BF Receptors: If mobile touch is active, snap directly over the mobile touch buttons!
  let bfY, bfStartX;
  if (isMobile) {
    const hitboxCont = document.querySelector('.touch-hitbox-container');
    const rect = hitboxCont.getBoundingClientRect();
    const cRect = canvas.getBoundingClientRect();
    bfY = (rect.top - cRect.top) - 25; // Directly above touch hitboxes
    bfStartX = (rect.left - cRect.left) + 20;
  } else {
    bfY = downscroll ? (canvas.height - 75) : 60;
    bfStartX = Math.max(260, canvas.width - (4 * spacing) - 40);
  }

  for (let i = 0; i < 4; i++) {
    const rx = bfStartX + i * (isMobile ? (spacing * 1.5) : spacing);
    const style = playerReceptors[i] === 2 ? 'glow' : (playerReceptors[i] === 1 ? 'fill' : 'stroke');
    drawMiniArrow(ctx, rx, bfY, size, i, ARROW_COLORS[i], style);
  }

  // Render scrolling notes
  if (isPlaying && parsedNotes.length > 0) {
    parsedNotes.forEach(n => {
      const timeDiff = n.time - currentTime;
      if (timeDiff < -200 || timeDiff > 1200) return;

      const noteX = n.isPlayer 
        ? (bfStartX + n.dir * (isMobile ? (spacing * 1.5) : spacing))
        : (40 + n.dir * spacing);
      const targetStrumY = n.isPlayer ? bfY : dadY;
      const noteY = downscroll ? (targetStrumY - timeDiff * scrollFactor) : (targetStrumY + timeDiff * scrollFactor);

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
    ctx.shadowBlur = 18;
    ctx.fill();
  } else {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawHealthBarWithIcons(ctx, phase) {
  const barW = Math.min(400, canvas.width - 80), barH = 12;
  const barX = (canvas.width - barW) / 2;
  const barY = gameConfig.downscroll ? 35 : (canvas.height - 35);

  ctx.fillStyle = '#ff1744';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#39ff14';
  ctx.fillRect(barX + barW / 2, barY, barW / 2, barH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(barX, barY, barW, barH);

  const iconBounce = Math.max(1.0, 1.0 + (cam.zoom - cam.targetZoom) * 1.2);
  const iconSize = 40 * iconBounce;

  const dadIcon = phase.icons?.dad?.neutral;
  if (dadIcon) {
    ctx.drawImage(dadIcon, barX + barW / 2 - iconSize - 8, barY - iconSize / 2, iconSize, iconSize);
  }

  const bfIcon = phase.icons?.bf?.neutral;
  if (bfIcon) {
    ctx.drawImage(bfIcon, barX + barW / 2 + 8, barY - iconSize / 2, iconSize, iconSize);
  }
}

// --- Main Engine Render Loop ---
let lastTime = performance.now();

function render() {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (canvas.width <= 0 || canvas.height <= 0) resizeCanvas();
  ctx.imageSmoothingEnabled = !gameConfig.pixelArt;

  // Audio / Internal Clock Sync
  if (isPlaying) {
    if (audioCtx && instSource) {
      currentTime = (audioCtx.currentTime - audioStartContextTime + audioSeekOffset) * 1000;
    } else {
      currentTime += dt * 1000;
    }

    if (currentTime >= songDuration) { stopPlayback(); currentTime = 0; }

    const pct = Math.min(100, (currentTime / songDuration) * 100);
    const playhead = document.getElementById('playhead');
    if (playhead) playhead.style.left = `${pct}%`;
    const curTimeLbl = document.getElementById('lbl-current-time');
    if (curTimeLbl) curTimeLbl.textContent = formatTime(currentTime);

    // Transitions
    timelineEvents.forEach(ev => {
      if (!ev.triggered && Math.abs(currentTime - ev.time) <= 120) {
        ev.triggered = true;
        triggerBlackoutTransition(ev);
      }
    });

    // Notes sing trigger
    const curSingNote = parsedNotes.find(n => Math.abs(n.time - currentTime) <= 80);
    if (curSingNote) {
      const charKey = curSingNote.isPlayer ? 'bf' : 'dad';
      const dirPoses = ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'];
      const targetChar = getCurPhase().characters[charKey];
      targetChar.currentPose = dirPoses[curSingNote.dir];
      targetChar.animTimer = 0;
    }
  }

  for (let i = 0; i < 4; i++) {
    if (playerReceptors[i] === 2 && currentTime > receptorGlowTimer[i]) {
      playerReceptors[i] = 0;
    }
  }

  // Musical Beat Bop
  const beatDuration = (60 / bpm) * 1000;
  curBeat = Math.floor(currentTime / beatDuration);

  if (curBeat !== lastBeat && curBeat >= 0) {
    lastBeat = curBeat;

    if (curBeat % cam.bopFreq === 0) {
      cam.zoom += cam.bopStrength;
    }

    const cp = getCurPhase();
    ['dad', 'bf', 'gf'].forEach(cid => {
      const ch = cp.characters[cid];
      if (curBeat % ch.danceFreq === 0) {
        ch.bounceScale = 1.0 + ch.bouncePow;
        if (!ch.currentPose.startsWith('sing')) ch.animTimer = 0;
      }
    });
  }

  // Smart Camera Duet Tracking (Zoom Out if Both Sing, Midpoint Pan)
  const cp = getCurPhase();
  if (cam.smartTracking && toolMode !== 'cam') {
    const dadSinging = parsedNotes.some(n => !n.isPlayer && Math.abs(n.time - currentTime) <= 220);
    const bfSinging = parsedNotes.some(n => n.isPlayer && Math.abs(n.time - currentTime) <= 220);

    if (dadSinging && bfSinging) {
      // Duet! Pan to center between them and zoom out
      cam.targetX = (cp.characters.dad.x + cp.characters.bf.x) / 2;
      cam.targetY = ((cp.characters.dad.y + cp.characters.bf.y) / 2) - 20;
      cam.targetZoom = cam.baseZoom * 0.82;
    } else if (dadSinging) {
      cam.targetX = cp.characters.dad.x;
      cam.targetY = cp.characters.dad.y - 20;
      cam.targetZoom = cam.baseZoom;
    } else if (bfSinging) {
      cam.targetX = cp.characters.bf.x;
      cam.targetY = cp.characters.bf.y - 20;
      cam.targetZoom = cam.baseZoom;
    } else {
      cam.targetX = 0;
      cam.targetY = 0;
      cam.targetZoom = cam.baseZoom;
    }
  } else if (toolMode === 'cam') {
    const target = getActiveTarget();
    cam.targetX = target.x;
    cam.targetY = target.y - 20;
  } else {
    cam.targetX = 0;
    cam.targetY = 0;
  }

  cam.x += (cam.targetX - cam.x) * 0.08;
  cam.y += (cam.targetY - cam.y) * 0.08;
  cam.zoom += (cam.targetZoom - cam.zoom) * 0.08;

  let shakeX = 0, shakeY = 0;
  if (cam.shakeDuration > 0) {
    cam.shakeDuration -= dt;
    shakeX = (Math.random() - 0.5) * cam.shakeIntensity * 2;
    shakeY = (Math.random() - 0.5) * cam.shakeIntensity * 2;
  }

  // Clear Canvas
  ctx.fillStyle = '#06070a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // LAYER 1: World
  ctx.save();
  ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  if (cp.stageBg && cp.stageBg.img) {
    ctx.drawImage(cp.stageBg.img, cp.stageBg.x - cp.stageBg.width / 2, cp.stageBg.y - cp.stageBg.height / 2, cp.stageBg.width, cp.stageBg.height);
  }

  cp.props.forEach(p => {
    if (p.img) ctx.drawImage(p.img, p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
  });

  // Characters (Only clean placeholders, NO fake ground/speakers!)
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
      if (curFrame.img) ctx.drawImage(curFrame.img, -fw / 2 + ox, -fh / 2 + oy, fw, fh);
    } else {
      ctx.fillStyle = c.color + '44';
      ctx.strokeStyle = c.color;
      ctx.lineWidth = (activeTargetId === id) ? 4 : 2;
      ctx.fillRect(-c.width / 2, -c.height / 2, c.width, c.height);
      ctx.strokeRect(-c.width / 2, -c.height / 2, c.width, c.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.name, 0, -10);
      ctx.font = '12px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`[${c.currentPose}]`, 0, 15);
    }
    ctx.restore();
  });

  // Transform Bounding Box
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

  // LAYER 2: Smart Blackout (World Only)
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

  // LAYER 3: Gameplay UI (Strumlines & Health Bar)
  drawStrumlinesAndNotes(ctx);
  drawHealthBarWithIcons(ctx, cp);

  // LAYER 4: Cinematic Blackout (Hide Everything)
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

  // LAYER 5: Intensity Flash FX
  if (cam.flashAlpha > 0) {
    ctx.fillStyle = cam.flashColor;
    ctx.globalAlpha = cam.flashAlpha;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    cam.flashAlpha = Math.max(0, cam.flashAlpha - dt * 1.5);
  }

  requestAnimationFrame(render);
}
