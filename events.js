// --- events.js: Timeline, Draggable Events, Smart Blackout & .imp Import/Export ---

let startPosTime = 0;
let timelineEvents = [];
let activeTransition = null;
let transitionOverlayImg = null;

let isDraggingEventMarker = false;
let draggedEventIndex = -1;

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
  if (isDraggingEventMarker) return;
  const rect = document.getElementById('timelineTrack').getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  currentTime = pct * songDuration;
  document.getElementById('playhead').style.left = `${pct * 100}%`;
  document.getElementById('lbl-current-time').textContent = formatTime(currentTime);

  activeTransition = null;
  cam.flashAlpha = 0;

  if (isPlaying) startPlaybackAt(currentTime);
}

// Draggable Event Markers on Timeline
function renderEventMarkers() {
  const container = document.getElementById('eventMarkersContainer');
  container.innerHTML = '';
  timelineEvents.forEach((ev, idx) => {
    const pct = (ev.time / songDuration) * 100;
    const m = document.createElement('div');
    m.className = 'timeline-event-marker';
    m.style.left = `${pct}%`;
    m.title = `Event ${idx + 1}: ${formatTime(ev.time)} (Click & Drag to move)`;

    m.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isDraggingEventMarker = true;
      draggedEventIndex = idx;
    });

    container.appendChild(m);
  });
}

window.addEventListener('mousemove', (e) => {
  if (!isDraggingEventMarker || draggedEventIndex < 0) return;
  const track = document.getElementById('timelineTrack');
  const rect = track.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  timelineEvents[draggedEventIndex].time = Math.round(pct * songDuration);
  renderEventMarkers();
});

window.addEventListener('mouseup', () => {
  if (isDraggingEventMarker) {
    isDraggingEventMarker = false;
    draggedEventIndex = -1;
  }
});

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
    overlayImg: transitionOverlayImg,
    triggered: false
  });

  renderEventMarkers();
  closeTransitionModal();
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

// Full .imp Project Exporter and Importer
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

async function exportIMPPackage(btn) {
  if (btn) btn.textContent = '📦 Packaging .imp...';

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
        neutral: imageToBase64(p.icons?.dad?.neutral),
        losing:  imageToBase64(p.icons?.dad?.losing)
      },
      bf: {
        neutral: imageToBase64(p.icons?.bf?.neutral),
        losing:  imageToBase64(p.icons?.bf?.losing)
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
      downscroll: gameConfig.downscroll,
      pixelArt: gameConfig.pixelArt,
      scrollSpeed: gameConfig.scrollSpeed
    },
    camera: {
      baseZoom: cam.targetZoom,
      bopStrength: cam.bopStrength,
      bopFreq: cam.bopFreq,
      smartTracking: cam.smartTracking
    },
    audio: { inst: instB64, voices: voicesB64 },
    chart: chartData,
    phases: serializedPhases,
    events: timelineEvents
  };

  const blob = new Blob([JSON.stringify(impPackage)], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${chartData?.song?.song || 'my_mod'}.imp`;
  a.click();

  if (btn) btn.textContent = '📦 Export .imp Package';
}

function serializeCharacter(c) {
  const posesB64 = {};
  for (const [key, frames] of Object.entries(c.poses || {})) {
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

    if (imp.chart) {
      chartData = imp.chart;
      processChartData(chartData);
      document.getElementById('status-chart').textContent = '✓';
    }

    if (imp.config) {
      gameConfig.downscroll = !!imp.config.downscroll;
      document.getElementById('opt-downscroll').checked = gameConfig.downscroll;
      gameConfig.pixelArt = !!imp.config.pixelArt;
      document.getElementById('opt-pixel-art').checked = gameConfig.pixelArt;
      if (imp.config.scrollSpeed) updateScrollSpeed(imp.config.scrollSpeed);
    }
    if (imp.camera) {
      cam.targetZoom = imp.camera.baseZoom || 0.85;
      cam.baseZoom = cam.targetZoom;
      cam.bopStrength = imp.camera.bopStrength || 0.04;
      cam.bopFreq = imp.camera.bopFreq || 4;
      cam.smartTracking = imp.camera.smartTracking !== false;
      document.getElementById('cam-base-zoom').value = cam.targetZoom;
      document.getElementById('cam-bop-strength').value = cam.bopStrength;
      document.getElementById('cam-bop-freq').value = cam.bopFreq;
      document.getElementById('cam-smart-toggle').checked = cam.smartTracking;
    }

    startPosTime = imp.startPos || 0;
    document.getElementById('lbl-startpos-time').textContent = `StartPos: ${formatTime(startPosTime)}`;
    const pct = (startPosTime / songDuration) * 100;
    document.getElementById('startposMarker').style.left = `${pct}%`;

    timelineEvents = imp.events || [];
    renderEventMarkers();

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

      const dadNeutral = await loadImageFromB64(p.icons?.dad?.neutral);
      const dadLosing = await loadImageFromB64(p.icons?.dad?.losing);
      const bfNeutral = await loadImageFromB64(p.icons?.bf?.neutral);
      const bfLosing = await loadImageFromB64(p.icons?.bf?.losing);

      let restoredBg = null;
      if (p.stageBg?.imgB64) {
        const bgImg = await loadImageFromB64(p.stageBg.imgB64);
        restoredBg = { ...p.stageBg, img: bgImg };
      }

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
    renderObjectTree();
    refreshPropsList();

    alert(`Successfully loaded mod package: "${imp.chart?.song?.song || 'Project'}"!`);
  } catch (err) {
    console.error(err);
    alert('Failed to import .imp package! Make sure the file is valid.');
  }
}

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

// Initial Boot Sequence
resizeCanvas();
setToolMode('move');
renderPhaseTabs();
renderObjectTree();
requestAnimationFrame(render);
