// GrabGeistApp — App-Logik (UI + BLE-Auswertung).
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const statusEl = $('status');
  const resetInfo = $('resetInfo');
  const connectBtn = $('connect');
  const disconnectBtn = $('disconnect');
  const mapCanvas = $('map');
  const mapCtx = mapCanvas.getContext('2d');

  const rampSlider = $('ramp');
  const rampVal = $('rampVal');
  const speedSlider = $('speed');
  const speedVal = $('speedVal');
  const rawLSlider = $('rawL');
  const rawRSlider = $('rawR');
  const rawLval = $('rawLval');
  const rawRval = $('rawRval');
  const showPos = $('showPos');

  let mapInfo = null;
  let mapRows = [];
  let mapComplete = false;
  let mapTimer = null;
  let mapRetries = 0;
  let lastRawInteract = 0;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function send(line) {
    if (!Ble.connected) {
      setStatus('Erst verbinden!');
      return Promise.reject(new Error('nicht verbunden'));
    }
    return Ble.send(line).catch((e) => setStatus('Senden fehlgeschlagen: ' + e));
  }

  function renderMap() {
    mapCanvas.width = mapInfo.w;
    mapCanvas.height = mapInfo.h;
    const img = mapCtx.createImageData(mapInfo.w, mapInfo.h);
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
    mapCtx.putImageData(img, 0, 0);
  }

  function clearMapTimeout() {
    if (mapTimer) { clearTimeout(mapTimer); mapTimer = null; }
  }

  function onMapTimeout() {
    if (mapComplete) return;
    if (mapRetries < 3) {
      mapRetries++;
      setStatus('Karte unvollständig (' + mapRows.length + '/' + (mapInfo ? mapInfo.h : '?') + ') — neu anfordern (' + mapRetries + '/3)…');
      send('MAP');
      mapTimer = setTimeout(onMapTimeout, 2500);
    } else {
      setStatus('Karte fehlgeschlagen — bitte neu verbinden');
    }
  }

  function handleRxLine(rawLine) {
    const line = rawLine.trim();

    if (line.startsWith('MAP ')) {
      const p = line.split(' ');
      mapInfo = { w: +p[1], h: +p[2], xMin: +p[3], yMin: +p[4], step: +p[5] };
      mapRows = [];
      mapComplete = false;
      setStatus('Karte empfangen…');
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
    } else if (line.startsWith('RANDOM ') || line.startsWith('REC ') || line.startsWith('PLAY ')) {
      setStatus(line);
    } else if (line.startsWith('ERR ')) {
      resetInfo.textContent = 'Fehler: ' + line.slice(4) + ' (Befehl unbekannt? Dann alte Firmware — neu flashen.)';
    } else if (mapInfo && !mapComplete) {
      if (line.length === 0) return;   // Leerzeilen nicht als Reihe zählen
      mapRows.push(line);
      setStatus('Karte empfangen… ' + mapRows.length + '/' + mapInfo.h);
      if (mapRows.length >= mapInfo.h) {
        mapComplete = true;
        clearMapTimeout();
        renderMap();
        setStatus('Karte geladen');
      }
    } else if (line.length > 0) {
      setStatus('RX: ' + line);
    }
  }

  function onTap(e) {
    if (!mapComplete || !mapInfo) return;
    const rect = mapCanvas.getBoundingClientRect();
    const px = Math.floor((e.clientX - rect.left) / rect.width * mapCanvas.width);
    const py = Math.floor((e.clientY - rect.top) / rect.height * mapCanvas.height);
    const cx = Math.max(0, Math.min(mapInfo.w - 1, px));
    const cy = Math.max(0, Math.min(mapInfo.h - 1, mapInfo.h - 1 - py)); // Y-Spiegelung
    const x = mapInfo.xMin + cx * mapInfo.step;
    const y = mapInfo.yMin + cy * mapInfo.step;
    send(`MOVE ${x.toFixed(0)} ${y.toFixed(0)}`);
  }

  function updateConnectUi() {
    connectBtn.disabled = Ble.connected;
    disconnectBtn.disabled = !Ble.connected;
  }

  // ---- BLE verdrahten ----
  Ble.onLine = handleRxLine;
  Ble.onStatus = (t) => { setStatus(t); updateConnectUi(); };

  connectBtn.onclick = async () => {
    const ok = await Ble.connect();
    if (ok) {
      mapRetries = 0;
      send('MAP');
      send('RESETLOG');
    }
    updateConnectUi();
  };
  disconnectBtn.onclick = () => Ble.disconnect();

  // ---- Controls ----
  mapCanvas.addEventListener('click', onTap);

  $('resetlog').onclick = () => { resetInfo.textContent = 'Reset-Log wird abgefragt…'; send('RESETLOG'); };
  $('stop').onclick = () => send('STOP');
  $('auto').onclick = () => send('AUTO');
  $('random').onclick = () => send('RANDOM');
  $('rec').onclick = () => send('REC');
  $('play').onclick = () => send('PLAY');
  $('statusBtn').onclick = () => send('STATUS');

  document.querySelectorAll('button[data-cmd]').forEach((b) => {
    b.onclick = () => send(b.dataset.cmd);
  });

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

  updateConnectUi();

  // ---- Service Worker registrieren (offline/installierbar) ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
