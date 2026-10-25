// GrabGeistApp — App-Logik (Tabs, Karte, Steuerung, Einstellungen, BLE).
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const connBadge = $('connBadge');
  const bleState = $('bleState');
  const connectBtn = $('connect');
  const disconnectBtn = $('disconnect');
  const autoReconnect = $('autoReconnect');
  const deviceList = $('deviceList');
  const keepAwake = $('keepAwake');
  const mapCanvas = $('map');
  const mapCtx = mapCanvas.getContext('2d');
  const resetInfo = $('resetInfo');
  const rampSlider = $('ramp');
  const rampVal = $('rampVal');
  const speedSlider = $('speed');
  const speedVal = $('speedVal');
  const rawLSlider = $('rawL');
  const rawRSlider = $('rawR');
  const rawLval = $('rawLval');
  const rawRval = $('rawRval');
  const showPos = $('showPos');
  const progMap = $('progMap');
  const progCtx = progMap.getContext('2d');
  const progAdd = $('progAdd');
  const progPending = $('progPending');
  const stepsEl = $('steps');
  const seqName = $('seqName');
  const seqSave = $('seqSave');
  const seqListEl = $('seqList');
  const seqExport = $('seqExport');
  const seqRefresh = $('seqRefresh');
  const seqImport = $('seqImport');
  const seqFile = $('seqFile');

  let mapInfo = null;
  let mapRows = [];
  let mapComplete = false;
  let mapTimer = null;
  let mapRetries = 0;
  let lastRawInteract = 0;
  let seq = [];            // Schrittliste (lokaler Entwurf)
  let pendingStep = null;  // zuletzt angefahrene, noch nicht uebernommene Position
  let seqLibrary = [];     // Namen der auf der ESP gespeicherten Ablaeufe
  let livePos = null;      // aktuelle Zielposition (fuer Karten-Marker)
  let activeStepIndex = -1; // aktiver Schritt beim Abspielen (-1 = keiner)

  function setConn(text, on) {
    connBadge.textContent = text;
    connBadge.classList.toggle('on', !!on);
  }

  function setBleState(text) {
    bleState.textContent = text;
  }

  function send(line) {
    if (!Ble.connected) {
      setBleState('Erst verbinden!');
      return Promise.reject(new Error('nicht verbunden'));
    }
    return Ble.send(line).catch((e) => setBleState('Senden fehlgeschlagen: ' + e));
  }

  function drawLiveMarker(img) {
    if (!livePos || !mapInfo) return;
    const cx = Math.round((livePos.x - mapInfo.xMin) / mapInfo.step);
    const cy = Math.round(mapInfo.h - 1 - (livePos.y - mapInfo.yMin) / mapInfo.step);
    if (cx < 0 || cx >= mapInfo.w || cy < 0 || cy >= mapInfo.h) return;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = cx + dx, py = cy + dy;
        if (px < 0 || px >= mapInfo.w || py < 0 || py >= mapInfo.h) continue;
        const idx = (py * mapInfo.w + px) * 4;
        img.data[idx]     = 255;
        img.data[idx + 1] = 220;
        img.data[idx + 2] = 0;
        img.data[idx + 3] = 255;
      }
    }
  }

  function renderMapTo(canvas, ctx) {
    canvas.width = mapInfo.w;
    canvas.height = mapInfo.h;
    const img = ctx.createImageData(mapInfo.w, mapInfo.h);
    for (let cy = 0; cy < mapInfo.h; cy++) {
      const row = mapRows[cy] || '';
      for (let cx = 0; cx < mapInfo.w; cx++) {
        const valid = (cx < row.length) && row[cx] === '1';
        const py = mapInfo.h - 1 - cy;   // Y-Spiegelung (oben = yMax)
        const idx = (py * mapInfo.w + cx) * 4;
        img.data[idx]     = valid ? 34  : 26;
        img.data[idx + 1] = valid ? 139 : 26;
        img.data[idx + 2] = valid ? 34  : 26;
        img.data[idx + 3] = 255;
      }
    }
    drawLiveMarker(img);
    ctx.putImageData(img, 0, 0);
  }

  function renderMap() {
    renderMapTo(mapCanvas, mapCtx);
    renderMapTo(progMap, progCtx);
  }

  function clearMapTimeout() {
    if (mapTimer) { clearTimeout(mapTimer); mapTimer = null; }
  }

  function onMapTimeout() {
    if (mapComplete) return;
    if (mapRetries < 3) {
      mapRetries++;
      setBleState('Karte unvollständig (' + mapRows.length + '/' + (mapInfo ? mapInfo.h : '?') + ') — neu anfordern (' + mapRetries + '/3)…');
      send('MAP');
      mapTimer = setTimeout(onMapTimeout, 2500);
    } else {
      setBleState('Karte fehlgeschlagen — bitte neu verbinden');
    }
  }

  function handleRxLine(rawLine) {
    const line = rawLine.trim();

    if (line.startsWith('MAP ')) {
      const p = line.split(' ');
      mapInfo = { w: +p[1], h: +p[2], xMin: +p[3], yMin: +p[4], step: +p[5] };
      mapRows = [];
      mapComplete = false;
      setBleState('Karte empfangen…');
      clearMapTimeout();
      mapTimer = setTimeout(onMapTimeout, 2500);
    } else if (line.startsWith('PWM ')) {
      const p = line.split(' ');
      if (showPos.checked && Date.now() - lastRawInteract > 300) {
        rawLSlider.value = p[1];
        rawRSlider.value = p[2];
        rawLval.textContent = p[1];
        rawRval.textContent = p[2];
      }
    } else if (line.startsWith('POS ')) {
      const p = line.split(' ');
      livePos = { x: +p[1], y: +p[2] };
      renderMap();
    } else if (line.startsWith('SEQ_STEP ')) {
      activeStepIndex = +line.slice(9);
      renderSteps();
    } else if (line.startsWith('RST ')) {
      resetInfo.textContent = 'Reset: ' + line.slice(4);
    } else if (line.startsWith('RAMP ')) {
      const v = Math.round(+line.split(' ')[1]);
      rampSlider.value = v;
      rampVal.textContent = v;
    } else if (line.startsWith('SPEED ')) {
      const v = Math.round(+line.split(' ')[1]);
      speedSlider.value = v;
      speedVal.textContent = v;
    } else if (line.startsWith('SEQ_STATE ')) {
      for (const kv of line.split(' ').slice(1)) {
        const [k, v] = kv.split('=');
        if (k === 'loop') $('seqLoop').checked = (v === '1');
        else if (k === 'autostart') $('seqAutostart').checked = (v === '1');
      }
    } else if (line.startsWith('SEQ_LISTJSON ')) {
      try {
        const arr = JSON.parse(line.slice(13));
        seqLibrary = Array.isArray(arr) ? arr : [];
      } catch (e) {
        seqLibrary = [];
      }
      renderSeqList();
      progPending.textContent = 'Liste: ' + seqLibrary.length + ' Einträge';
    } else if (line.startsWith('SEQ_JSON ')) {
      loadFromJson(line.slice(9));
    } else if (line === 'SEQ_SAVED') {
      progPending.textContent = 'Ablauf gespeichert.';
      requestSeqList();
    } else if (line === 'SEQ_DELETED') {
      progPending.textContent = 'Ablauf gelöscht.';
      requestSeqList();
    } else if (line.startsWith('SEQ_ERR ')) {
      progPending.textContent = 'Fehler: ' + line.slice(8);
    } else if (line.startsWith('RANDOM ') || line.startsWith('REC ') || line.startsWith('PLAY ')) {
      setBleState(line);
    } else if (line.startsWith('ERR ')) {
      resetInfo.textContent = 'Fehler: ' + line.slice(4) + ' (Befehl unbekannt? Dann alte Firmware — neu flashen.)';
    } else if (mapInfo && !mapComplete) {
      if (line.length === 0) return;   // Leerzeilen nicht als Reihe zählen
      mapRows.push(line);
      setBleState('Karte empfangen… ' + mapRows.length + '/' + mapInfo.h);
      if (mapRows.length >= mapInfo.h) {
        mapComplete = true;
        clearMapTimeout();
        renderMap();
        setBleState('Karte geladen');
      }
    } else if (line.length > 0) {
      setBleState('RX: ' + line);
    }
  }

  function tapToXY(e, canvas) {
    if (!mapComplete || !mapInfo) return null;
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor((e.clientX - rect.left) / rect.width * canvas.width);
    const py = Math.floor((e.clientY - rect.top) / rect.height * canvas.height);
    const cx = Math.max(0, Math.min(mapInfo.w - 1, px));
    const cy = Math.max(0, Math.min(mapInfo.h - 1, mapInfo.h - 1 - py)); // Y-Spiegelung
    return {
      x: mapInfo.xMin + cx * mapInfo.step,
      y: mapInfo.yMin + cy * mapInfo.step
    };
  }

  function onTap(e) {
    const p = tapToXY(e, mapCanvas);
    if (!p) return;
    send(`MOVE ${p.x.toFixed(0)} ${p.y.toFixed(0)}`);
  }

  function onProgTap(e) {
    const p = tapToXY(e, progMap);
    if (!p) return;
    send(`MOVE ${p.x.toFixed(0)} ${p.y.toFixed(0)}`);   // live hinfahren
    pendingStep = { type: 'move', x: Math.round(p.x), y: Math.round(p.y), speed: 100, holdMs: 0 };
    progPending.textContent = `Bereit: Move (${pendingStep.x}, ${pendingStep.y})`;
  }

  function updateButtons() {
    connectBtn.disabled = Ble.connected;
    disconnectBtn.disabled = !Ble.connected;
  }

  function switchView(name) {
    for (const view of document.querySelectorAll('.view')) {
      view.hidden = view.id !== `view-${name}`;
    }
    for (const btn of document.querySelectorAll('.bottom-nav button')) {
      btn.classList.toggle('active', btn.dataset.view === name);
    }
    if (name === 'program' && Ble.connected) requestSeqList();
  }

  // ---- Tabs ----
  document.querySelectorAll('.bottom-nav button').forEach((b) => {
    b.addEventListener('click', () => switchView(b.dataset.view));
  });

  function onConnected() {
    mapRetries = 0;
    send('MAP');
    send('RESETLOG');
    send('SEQ_GET');
    requestSeqList();
  }

  async function connectToDevice(device) {
    await Ble.connectTo(device);
    updateButtons();
    renderDevices();
  }

  function renderDevices() {
    Ble.listDevices().then((devices) => {
      deviceList.innerHTML = '';
      if (!devices.length) {
        deviceList.innerHTML = '<p class="muted">Noch keine gespeicherten Geräte.</p>';
        return;
      }
      devices.forEach((d) => {
        const row = document.createElement('div');
        row.className = 'device';

        const label = document.createElement('span');
        label.textContent = d.name || 'Unbenanntes Gerät';

        const isCurrent = Ble.device && Ble.device.id === d.id;
        const btn = document.createElement('button');
        if (isCurrent && Ble.connected) {
          btn.textContent = 'verbunden';
          btn.disabled = true;
        } else {
          btn.textContent = 'Verbinden';
          btn.onclick = () => connectToDevice(d);
        }

        row.appendChild(label);
        row.appendChild(btn);
        deviceList.appendChild(row);
      });
    });
  }

  // ---- BLE verdrahten ----
  Ble.onLine = handleRxLine;
  Ble.onStatus = (t) => {
    setBleState(t);
    setConn(t, Ble.connected);
    updateButtons();
    renderDevices();
    if (t === 'verbunden') onConnected();
  };

  connectBtn.onclick = async () => {
    await Ble.connect();
    updateButtons();
  };
  disconnectBtn.onclick = () => Ble.disconnect();

  autoReconnect.onchange = () => { Ble.autoReconnect = autoReconnect.checked; };

  // ---- Steuerung (Tab 1) ----
  mapCanvas.addEventListener('click', onTap);

  document.querySelectorAll('button[data-cmd]').forEach((b) => {
    b.onclick = () => send(b.dataset.cmd);
  });

  $('stop').onclick = () => send('STOP');
  $('auto').onclick = () => send('AUTO');
  $('random').onclick = () => send('RANDOM');
  $('rec').onclick = () => send('REC');
  $('play').onclick = () => send('PLAY');

  // ---- Programm (Tab 2): live anfahren -> uebernehmen ----
  progMap.addEventListener('click', onProgTap);

  progAdd.onclick = () => {
    if (!pendingStep) { progPending.textContent = 'Erst eine Position anfahren.'; return; }
    seq.push({ ...pendingStep });
    pendingStep = null;
    progPending.textContent = '';
    renderSteps();
  };

  function renderSteps() {
    stepsEl.innerHTML = '';
    if (!seq.length) {
      stepsEl.innerHTML = '<p class="muted">Noch keine Schritte.</p>';
      return;
    }
    seq.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'step' + (i === activeStepIndex ? ' active' : '');

      const fields = document.createElement('div');
      fields.className = 'step-fields';

      const xLabel = document.createElement('span');
      xLabel.className = 'stepunit'; xLabel.textContent = 'x';
      fields.appendChild(xLabel);
      const xEl = document.createElement('input');
      xEl.type = 'number'; xEl.step = 1; xEl.value = s.x;
      xEl.className = 'coord';
      xEl.addEventListener('input', () => { s.x = +xEl.value || 0; });
      fields.appendChild(xEl);

      const yLabel = document.createElement('span');
      yLabel.className = 'stepunit'; yLabel.textContent = 'y';
      fields.appendChild(yLabel);
      const yEl = document.createElement('input');
      yEl.type = 'number'; yEl.step = 1; yEl.value = s.y;
      yEl.className = 'coord';
      yEl.addEventListener('input', () => { s.y = +yEl.value || 0; });
      fields.appendChild(yEl);

      const spd = document.createElement('input');
      spd.type = 'number'; spd.min = 0; spd.max = 100; spd.step = 5; spd.value = s.speed;
      spd.addEventListener('input', () => { s.speed = Math.max(0, Math.min(100, +spd.value || 0)); });
      fields.appendChild(spd);
      const pct = document.createElement('span');
      pct.className = 'stepunit'; pct.textContent = '%';
      fields.appendChild(pct);

      const hold = document.createElement('input');
      hold.type = 'number'; hold.min = 0; hold.step = 100; hold.value = s.holdMs;
      hold.addEventListener('input', () => { s.holdMs = +hold.value || 0; });
      fields.appendChild(hold);
      const ms = document.createElement('span');
      ms.className = 'stepunit'; ms.textContent = 'ms';
      fields.appendChild(ms);

      row.appendChild(fields);

      const actions = document.createElement('div');
      actions.className = 'step-actions';
      const up = document.createElement('button');
      up.textContent = '↑';
      up.title = 'Nach oben';
      up.onclick = () => { if (i > 0) { [seq[i - 1], seq[i]] = [seq[i], seq[i - 1]]; renderSteps(); } };
      const down = document.createElement('button');
      down.textContent = '↓';
      down.title = 'Nach unten';
      down.onclick = () => { if (i < seq.length - 1) { [seq[i + 1], seq[i]] = [seq[i], seq[i + 1]]; renderSteps(); } };
      const copy = document.createElement('button');
      copy.textContent = '⧉';
      copy.title = 'Kopieren';
      copy.onclick = () => { seq.splice(i + 1, 0, { ...s }); renderSteps(); };
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Löschen';
      del.onclick = () => { seq.splice(i, 1); renderSteps(); };
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(copy);
      actions.appendChild(del);
      row.appendChild(actions);

      stepsEl.appendChild(row);
    });
  }

  renderSteps();

  $('seqRun').onclick = async () => {
    if (!seq.length) { progPending.textContent = 'Kein Ablauf definiert.'; return; }
    const payload = { version: 1, name: '', loop: $('seqLoop').checked, autostart: $('seqAutostart').checked, steps: seq };
    try {
      await send('SEQ_SET ' + JSON.stringify(payload));
      await send('SEQ_RUN');
      progPending.textContent = 'Ablauf gestartet.';
    } catch (e) {
      progPending.textContent = 'Fehler: ' + e.message;
    }
  };
  $('seqStop').onclick = () => send('SEQ_STOP');

  function requestSeqList() {
    seqLibrary = [];
    send('SEQ_LIST');
  }

  function renderSeqList() {
    seqListEl.innerHTML = '';
    if (!seqLibrary.length) {
      seqListEl.innerHTML = '<p class="muted">Noch keine Abläufe auf der ESP gespeichert.</p>';
      return;
    }
    seqLibrary.forEach((name) => {
      const row = document.createElement('div');
      row.className = 'device';

      const label = document.createElement('span');
      label.textContent = name;

      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Laden';
      loadBtn.onclick = () => { seqName.value = name; send('SEQ_LOAD ' + name); };

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Löschen';
      delBtn.onclick = () => { send('SEQ_DELETE ' + name); };

      row.appendChild(label);
      row.appendChild(loadBtn);
      row.appendChild(delBtn);
      seqListEl.appendChild(row);
    });
  }

  function loadFromJson(text) {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.steps)) throw new Error('steps fehlt');
      seq = data.steps.map((s) => ({
        type: s.type === 'preset' ? 'preset' : 'move',
        x: Math.round(+s.x || 0),
        y: Math.round(+s.y || 0),
        speed: Math.max(0, Math.min(100, +s.speed || 100)),
        holdMs: Math.max(0, +s.holdMs || 0)
      }));
      $('seqLoop').checked = !!data.loop;
      $('seqAutostart').checked = !!data.autostart;
      if (data.name) seqName.value = data.name;
      renderSteps();
      progPending.textContent = 'Ablauf geladen (' + seq.length + ' Schritte).';
      stepsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      progPending.textContent = 'Fehler beim Laden: ' + e.message;
    }
  }

  seqSave.onclick = () => {
    const name = seqName.value.trim();
    if (!name) { progPending.textContent = 'Name eingeben.'; return; }
    if (!seq.length) { progPending.textContent = 'Kein Ablauf definiert.'; return; }
    const payload = { version: 1, name, loop: $('seqLoop').checked, autostart: $('seqAutostart').checked, steps: seq };
    send('SEQ_SET ' + JSON.stringify(payload))
      .then(() => send('SEQ_SAVE ' + name));
  };

  seqRefresh.onclick = () => { if (Ble.connected) requestSeqList(); };

  seqImport.onclick = () => seqFile.click();
  seqFile.onchange = () => {
    const file = seqFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadFromJson(String(reader.result));
      seqFile.value = '';
    };
    reader.readAsText(file);
  };

  seqExport.onclick = () => {
    if (!seq.length) { progPending.textContent = 'Kein Ablauf definiert.'; return; }
    const name = seqName.value.trim() || 'grabgeist-ablauf';
    const payload = { version: 1, name, loop: $('seqLoop').checked, autostart: $('seqAutostart').checked, steps: seq };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[^a-z0-9_-]+/gi, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    progPending.textContent = 'JSON exportiert.';
  };

  // ---- Einstellungen (Tab 3) ----
  $('resetlog').onclick = () => { resetInfo.textContent = 'Reset-Log wird abgefragt…'; send('RESETLOG'); };
  $('statusBtn').onclick = () => send('STATUS');

  rampSlider.oninput = () => { rampVal.textContent = rampSlider.value; };
  rampSlider.onchange = () => send(`RAMP ${rampSlider.value}`);
  $('rampReset').onclick = () => {
    rampSlider.value = 1000;
    rampVal.textContent = '1000';
    send('RAMP 1000');
  };

  speedSlider.oninput = () => { speedVal.textContent = speedSlider.value; };
  speedSlider.onchange = () => send(`SPEED ${speedSlider.value}`);

  function sendRaw() { send(`RAW ${rawLSlider.value} ${rawRSlider.value}`); }
  rawLSlider.oninput = () => { rawLval.textContent = rawLSlider.value; lastRawInteract = Date.now(); };
  rawRSlider.oninput = () => { rawRval.textContent = rawRSlider.value; lastRawInteract = Date.now(); };
  rawLSlider.onchange = sendRaw;
  rawRSlider.onchange = sendRaw;
  $('rawSend').onclick = sendRaw;

  updateButtons();
  renderDevices();

  // ---- Bildschirm anlassen (Wake Lock): haelt die BLE-Verbindung stabil ----
  let wakeLock = null;
  async function applyWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (keepAwake.checked) {
      try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignorieren */ }
    } else if (wakeLock) {
      try { await wakeLock.release(); } catch (e) { /* ignorieren */ }
      wakeLock = null;
    }
  }
  keepAwake.onchange = applyWakeLock;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && keepAwake.checked) applyWakeLock();
  });
  applyWakeLock();

  // ---- Service Worker registrieren (offline/installierbar) ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
