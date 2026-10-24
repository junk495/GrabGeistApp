# GrabGeistApp

PWA (Progressive Web App) zur Steuerung des **GrabGeist** per **Web Bluetooth**.

Die App ist reiner Client-Code (HTML/CSS/JS, Vanilla — kein Build-Tool). Sie verbindet
sich über den **Nordic UART Service** mit der ESP32-Firmware (Repo `GrabGeist`) und
übermittelt die Steuerbefehle per Textprotokoll.

## Hosting

- GitHub Pages: `https://junk495.github.io/GrabGeistApp/`
- Die App läuft unter einem Unterpfad und verwendet deshalb **relative Pfade**.

## Erste Installation (Handy)

1. Auf dem Handy (Android Chrome) `https://junk495.github.io/GrabGeistApp/` öffnen.
2. „Verbinden“ → Gerät **GrabGeist** wählen (Web Bluetooth).
3. Über das Browser-Menü **„Zum Startbildschirm hinzufügen“** → App installieren.
4. Danach läuft die App **offline** und verbindet sich nur noch per BLE.

> Web Bluetooth wird von **iOS Safari nicht** unterstützt → Android Chrome oder
> Desktop Chrome/Edge verwenden.

## BLE-Schnittstelle (Vertrag mit der Firmware)

| Richtung | UUID |
|---|---|
| Service | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| RX (Handy → ESP, write) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| TX (ESP → Handy, notify) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |

Textbefehle (eine Zeile, `\n`-terminiert):
`MOVE <x> <y>`, `PEEK <left|right|top|hide>`, `RAW <l> <r>`, `STOP`, `STATUS`,
`MAP`, `RAMP [<us/s>]`, `SPEED [<%>]`, `RESETLOG`, `AUTO`, `RANDOM`, `REC`, `PLAY`.

## Struktur

```
index.html          App-Shell / UI
manifest.json       PWA-Manifest
sw.js               Service Worker (Offline-Cache)
css/app.css         Styles
js/ble.js           Web-Bluetooth-Transport (NUS)
js/app.js           App-Logik (Karte, Presets, Steuerung)
icons/icon.svg      App-Icon
```

## Updates

Neue Version: Dateien in diesem Repo ändern, `CACHE` in `sw.js` erhöhen, committen
und pushen. Die installierte App lädt die neue Version beim nächsten Öffnen.
