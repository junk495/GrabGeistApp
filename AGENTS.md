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
  `RESETLOG`, `AUTO`, `RANDOM`, `REC`, `PLAY` (Sequence-Befehle `SEQ_*` in Planung).

## Struktur
- `index.html` / `manifest.json` / `sw.js`
- `css/app.css`, `js/ble.js` (Transport), `js/app.js` (UI), `icons/`

## Hosting & Betrieb
- GitHub Pages: `https://junk495.github.io/GrabGeistApp/`
- Relative Pfade; Service-Worker-Cache (`CACHE` in `sw.js` bei Release erhöhen).
- Vanilla JS, kein Build; Android Chrome (Web Bluetooth).

## Regeln
- Bei Protokoll-Änderung die **Firmware** (`GrabGeist`) mit anpassen.
- Keine Geheimnisse, keine Build-Artefakte committen.
