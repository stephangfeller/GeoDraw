# GeoDraw – Formen lernen (PWA)

Eine schlanke, mobile-first Progressive Web App zum Lernen von geometrischen Grundformen durch Zeichnen auf einem Punktefeld.

## Eigenschaften

- **Touch-optimiert**: Pointer-Events mit `pointercapture`, Snapping-Radius 60% der Zellgrösse
- **Adaptives Punktegitter**: passt sich automatisch an Gerätegrösse und -orientierung an
- **Mobile-first**: Layout funktioniert von 320 px bis Desktop
- **Offline-fähig**: Service Worker cacht alle Assets, App läuft ohne Internet
- **Kein Build-Schritt**: Vanilla JS/CSS, direkt auf jedem Static-Host deploybar
- **Installierbar**: Manifest mit allen Icons, "Zum Startbildschirm hinzufügen" auf iOS/Android

## Deployment auf GitHub Pages

1. Repo erstellen, alle Dateien aus diesem Ordner ins Repo-Root committen
2. Settings → Pages → Source: `main` / root
3. URL ist dann `https://<user>.github.io/<repo>/`

Beim Verteilen via Teams Tab: einfach die GitHub-Pages-URL in einen Webseiten-Tab einbinden.

## Lokal testen

```bash
# Beliebiger Static-Server, z.B.:
python3 -m http.server 8000
# oder
npx serve .
```

Wichtig: Service Worker funktioniert nur über `https://` oder `http://localhost`.

## Dateistruktur

```
geodraw/
├── index.html              ← App-Skeleton + PWA Meta-Tags
├── style.css               ← Mobile-first Styling, Theme Tokens
├── app.js                  ← Spiel-Logik + Canvas-Handling
├── sw.js                   ← Service Worker (Cache-First)
├── manifest.webmanifest    ← PWA Manifest
├── icon.svg                ← App-Icon (Vektor)
├── icon-192.png            ← 192×192 für ältere Browser
├── icon-512.png            ← 512×512 für Splash-Screens
└── icon-maskable.png       ← Android Adaptive Icon
```

## Service-Worker-Update

Wenn du Code änderst und sicherstellen willst, dass alle Geräte die neue Version laden, erhöhe in `sw.js` die Konstante `CACHE`:

```js
const CACHE = "geodraw-v2";  // war v1
```

Beim nächsten Besuch der Seite registriert sich der neue SW, löscht den alten Cache und holt frische Dateien.

## Spielablauf

1. **Setup**: Anzahl Figuren zwischen 3 und 18 wählen
2. **Spielen**: Punkte auf dem Gitter antippen, um die Figur aufzuspannen
   - Bei 3+ Punkten erscheint ein Halo um den Startpunkt → antippen schliesst die Figur
   - Oder den **Fertig**-Button drücken
   - **Zurücksetzen** löscht die aktuelle Figur
3. **Validierung**: Geometrische Eigenschaften werden geprüft (gleiche Seitenlängen, rechte Winkel, Parallelität)
4. **Punktezahl**: 100 Basispunkte + Geschwindigkeitsbonus

## Erkannte Formen

- Quadrat (4 gleich lange Seiten, rechte Winkel)
- Rechteck (rechte Winkel, gegenüberliegende Seiten gleich, kein Quadrat)
- Dreieck (3 nicht-kollineare Punkte)
- Rechtwinkliges Dreieck (Dreieck mit einem 90°-Winkel)
- Parallelogramm (gegenüberliegende Seiten parallel und gleich lang, kein Rechteck)
