# AGENTS.md — GrabGeistApp (BLE-Web-App)

## Zweck
PWA zur Steuerung von **GrabGeist** per **Web Bluetooth** (Nordic UART Service).

## Gegenstück
- Firmware: Repo **`GrabGeist`** (ESP32-S3).
- Datenfluss:
  ```
  Handy (diese PWA)  --BLE/NUS-->  ESP32  -->  Kinematics/ServoController --> Servos
  ```

## BLE-Schnittstelle
- Service:  `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- RX (Handy→ESP, write):  `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- TX (ESP→Handy, notify): `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
- Textprotokoll: `MOVE`, `PEEK`, `RAW`, `STOP`, `STATUS`, `MAP`, `RAMP`, `SPEED`,
  `RESETLOG`, `AUTO`, `RANDOM`, `REC`, `PLAY` sowie `SEQ_SET`/`SEQ_RUN`/`SEQ_STOP`/
  `SEQ_GET`/`SEQ_SAVE`/`SEQ_LIST`/`SEQ_LOAD`/`SEQ_DELETE`.

## Struktur
- `index.html` / `manifest.json` / `sw.js`
- `css/app.css`, `js/ble.js` (Transport), `js/app.js` (UI), `js/version.js` (Version),
  `js/update.js` (SW-Registrierung/Update), `icons/`

## Hosting & Betrieb
- GitHub Pages: `https://junk495.github.io/GrabGeistApp/`
- Relative Pfade; Service-Worker-Cache (Cache-Name aus der Version in `js/version.js`).
- Vanilla JS, kein Build; Android Chrome (Web Bluetooth).

## Versionierung & Updates
- SemVer `major.minor.patch` (eine zentrale Konstante `APP_VERSION` in `js/version.js`):
  - **major** (erste Stelle): großer Umbau
  - **minor** (mittlere Stelle): Funktionsänderung
  - **patch** (hintere Stelle): minimale/redaktionelle Änderung
- Bei Release `APP_VERSION` in `js/version.js` erhöhen (der Service Worker übernimmt sie
  für den Cache-Namen) und `version` in `manifest.json` gleichziehen.
- Die App prüft beim Start auf eine neue Service-Worker-Version und bietet unten ein
  Neuladen-Popup an (`js/update.js`).

## Regeln
- Bei Protokoll-Änderung die **Firmware** (`GrabGeist`) mit anpassen.
- Keine Geheimnisse, keine Build-Artefakte committen.
