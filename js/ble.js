// Web-Bluetooth-Transport (Nordic UART Service).
// Stellt Verbinden/Senden/Empfangen als kleines Modul bereit.

const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Handy -> ESP (write)
const TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ESP -> Handy (notify)

const Ble = {
  device: null,
  rxChar: null,
  txChar: null,
  rxBuffer: '',
  connected: false,
  onLine: null,     // (line) => {}
  onStatus: null,   // (text) => {}

  async connect() {
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });
      this.device.addEventListener('gattserverdisconnected', () => this._onDisconnect());

      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      this.rxChar = await service.getCharacteristic(RX_UUID);
      this.txChar = await service.getCharacteristic(TX_UUID);

      await this.txChar.startNotifications();
      this.txChar.addEventListener('characteristicvaluechanged', (e) => this._onData(e));

      this.rxBuffer = '';
      this.connected = true;
      if (this.onStatus) this.onStatus('verbunden');
      return true;
    } catch (err) {
      this.connected = false;
      this.rxChar = null;
      this.txChar = null;
      if (this.onStatus) this.onStatus('Fehler: ' + err);
      return false;
    }
  },

  async disconnect() {
    this.connected = false;
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      try { await this.device.gatt.disconnect(); } catch (e) { /* ignore */ }
    }
    this.rxChar = null;
    this.txChar = null;
    if (this.onStatus) this.onStatus('getrennt');
  },

  send(line) {
    if (!this.rxChar) {
      return Promise.reject(new Error('nicht verbunden'));
    }
    return this.rxChar.writeValue(new TextEncoder().encode(line + '\n'));
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
    if (this.onStatus) this.onStatus('getrennt');
  }
};
