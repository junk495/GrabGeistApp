// Web-Bluetooth-Transport (Nordic UART Service).
// Bietet Verbinden/Trennen/Senden/Empfangen inkl. automatischem Wiederverbinden.

const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Handy -> ESP (write)
const TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ESP -> Handy (notify)

const Ble = {
  device: null,
  rxChar: null,
  txChar: null,
  rxBuffer: '',
  connected: false,
  autoReconnect: true,     // vom Nutzer über die UI schaltbar
  manualDisconnect: false, // aktives Trennen -> kein Auto-Reconnect
  reconnectTimer: null,
  onLine: null,            // (line) => {}
  onStatus: null,          // (text) => {}
  _onDisconnectBound: null,

  async connect() {
    // Erstverbindung über den System-Dialog (Web Bluetooth verlangt das).
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });
    return this._connectDevice(device);
  },

  async connectTo(device) {
    // Verbindung zu einem bereits bekannten Gerät (ohne Dialog).
    return this._connectDevice(device);
  },

  async _connectDevice(device) {
    try {
      this.manualDisconnect = false;
      this._clearReconnect();
      this.device = device;

      if (!this._onDisconnectBound) {
        this._onDisconnectBound = () => this._onDisconnect();
      }
      device.removeEventListener('gattserverdisconnected', this._onDisconnectBound);
      device.addEventListener('gattserverdisconnected', this._onDisconnectBound);

      const server = await device.gatt.connect();
      await this._setup(server);

      this.connected = true;
      this._status('verbunden');
      return true;
    } catch (err) {
      this.connected = false;
      this.rxChar = null;
      this.txChar = null;
      this._status('Fehler: ' + err);
      return false;
    }
  },

  async listDevices() {
    try {
      return await navigator.bluetooth.getDevices();
    } catch (err) {
      return [];
    }
  },

  async _setup(server) {
    const service = await server.getPrimaryService(SERVICE_UUID);
    this.rxChar = await service.getCharacteristic(RX_UUID);
    this.txChar = await service.getCharacteristic(TX_UUID);
    await this.txChar.startNotifications();
    this.txChar.addEventListener('characteristicvaluechanged', (e) => this._onData(e));
    this.rxBuffer = '';
  },

  async disconnect() {
    this.manualDisconnect = true;
    this._clearReconnect();
    this.connected = false;
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      try { await this.device.gatt.disconnect(); } catch (e) { /* ignore */ }
    }
    this.rxChar = null;
    this.txChar = null;
    this._status('getrennt');
  },

  async send(line) {
    if (!this.rxChar) {
      throw new Error('nicht verbunden');
    }
    const data = new TextEncoder().encode(line + '\n');
    // In MTU-gerechte Stücke zerlegen. Web Bluetooth / NimBLE kann lange
    // "Write Long"-Writes nicht zuverlässig verarbeiten; ab ca. 4
    // Sequenz-Schritten würde das JSON sonst die 244-Byte-Grenze
    // überschreiten. Die Firmware setzt die Teile im Zeilenpuffer wieder
    // zusammen (Zeilenende erst im letzten Stück).
    const CHUNK = 180;
    for (let i = 0; i < data.length; i += CHUNK) {
      await this.rxChar.writeValue(data.slice(i, Math.min(i + CHUNK, data.length)));
    }
  },

  _onData(event) {
    this.rxBuffer += new TextDecoder().decode(event.target.value);
    let nl;
    while ((nl = this.rxBuffer.indexOf('\n')) !== -1) {
      const line = this.rxBuffer.slice(0, nl).replace(/\r$/, '');
      this.rxBuffer = this.rxBuffer.slice(nl + 1);
      if (this.onLine) this.onLine(line);
    }
  },

  _onDisconnect() {
    this.connected = false;
    this.rxChar = null;
    this.txChar = null;

    if (this.manualDisconnect) {
      this._status('getrennt');
      return;
    }
    if (this.autoReconnect) {
      this._status('Verbindung verloren — verbinde neu…');
      this._scheduleReconnect();
    } else {
      this._status('getrennt');
    }
  },

  _scheduleReconnect() {
    this._clearReconnect();
    this.reconnectTimer = setTimeout(() => this._tryReconnect(), 1500);
  },

  async _tryReconnect() {
    if (this.connected || this.manualDisconnect || !this.device) return;
    const ok = await this._connectDevice(this.device);
    if (!ok) this._scheduleReconnect();
  },

  _clearReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  },

  _status(text) {
    if (this.onStatus) this.onStatus(text);
  }
};
