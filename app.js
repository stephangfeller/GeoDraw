/* ============================================================
 * GeoDraw – Formen lernen
 * ------------------------------------------------------------
 * Vanilla-JS PWA. Mobile-first, touch-optimiert.
 *
 * Architektur:
 *  - Drei Screens: setup / playing / finished
 *  - Beim Wechsel des Screens wird das DOM komplett neu erstellt
 *  - Während des Spiels werden die Canvas-Elemente direkt
 *    manipuliert (kein Re-Render des ganzen DOMs), damit das
 *    Zeichnen flüssig bleibt
 * ============================================================ */

// ---------- Shape Definitions ----------
const ShapeType = {
  SQUARE: "Quadrat",
  RECTANGLE: "Rechteck",
  TRIANGLE: "Dreieck",
  RIGHT_TRIANGLE: "Rechtwinkliges Dreieck",
  PARALLELOGRAM: "Parallelogramm",
};

const SHAPES = [
  {
    type: ShapeType.SQUARE,
    minPoints: 4,
    maxPoints: 4,
    description:
      "Vier gleich lange Seiten und vier rechte Winkel.",
    tip: "Ein Quadrat ist ein spezielles Rechteck, bei dem alle Seiten gleich lang sind.",
  },
  {
    type: ShapeType.RECTANGLE,
    minPoints: 4,
    maxPoints: 4,
    description:
      "Vier rechte Winkel, gegenüberliegende Seiten sind gleich lang.",
    tip: "Die Summe der Innenwinkel beträgt in jedem Viereck 360°.",
  },
  {
    type: ShapeType.TRIANGLE,
    minPoints: 3,
    maxPoints: 3,
    description: "Eine Form mit drei Ecken und drei Seiten.",
    tip: "Die Winkelsumme in einem Dreieck ist immer genau 180°.",
  },
  {
    type: ShapeType.RIGHT_TRIANGLE,
    minPoints: 3,
    maxPoints: 3,
    description: "Ein Dreieck mit einem Winkel von genau 90°.",
    tip: "Der Satz des Pythagoras gilt nur für rechtwinklige Dreiecke!",
  },
  {
    type: ShapeType.PARALLELOGRAM,
    minPoints: 4,
    maxPoints: 4,
    description:
      "Ein Viereck mit zwei Paaren paralleler, gleich langer Seiten.",
    tip: "In einem Parallelogramm sind gegenüberliegende Winkel immer gleich gross.",
  },
];

// ---------- Game State ----------
const state = {
  status: "setup", // 'setup' | 'playing' | 'finished'
  gameLength: 5,
  shapes: [], // array of ShapeDefinitions to play
  currentIndex: 0,
  score: 0,
  points: [], // currently drawn points
  startTime: null, // timestamp when first point was placed in current task
  feedback: null, // { type: 'success' | 'error', text: string, tip: string }
};

// Drawing-related state — kept outside main state for perf
const draw = {
  pointer: null, // { x, y } in svg coords, or null
  hover: null, // grid point currently snapped to, or null
  pointerActive: false, // whether pointer is currently down/over
  rafId: null, // requestAnimationFrame handle
};

// Grid layout — recomputed when canvas resizes
const grid = {
  cols: 7,
  rows: 7,
  cell: 60, // px in svg coords
  width: 0, // svg viewBox width
  height: 0, // svg viewBox height
  offsetX: 0, // padding from left
  offsetY: 0, // padding from top
};

// References to DOM nodes during play state — used for direct manipulation
const refs = {
  app: null,
  svg: null,
  layerDots: null, // <g> for grid dots
  layerShape: null, // <polyline/polygon> for completed shape outline
  layerPreview: null, // <line> dashed preview to next snap
  layerSnap: null, // <g> for snap halo + core
  layerPoints: null, // <g> for placed points
  taskShape: null, // task name in header
  description: null, // shape description badge
  timeValue: null, // time stat
  scoreValue: null, // score stat
  progress: null, // progress pip container
  finishBtn: null, // "Fertig" button
  resetBtn: null, // "Zurücksetzen" button
  ticker: null, // setInterval handle for timer
};

// ---------- Helpers ----------
const $app = document.getElementById("app");

const ICON = {
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0012 0V2z"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>`,
};

// SVG namespace
const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Shape Validation ----------
function validateShape(type, points) {
  // Hilfsfunktionen: Distanz², Skalarprodukt für Rechtwinkligkeit
  const len2 = (p, q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
  const eq = (a, b, tol = 1) => Math.abs(a - b) < tol;

  if (type === ShapeType.SQUARE) {
    if (points.length !== 4) return false;
    const s = [
      len2(points[0], points[1]),
      len2(points[1], points[2]),
      len2(points[2], points[3]),
      len2(points[3], points[0]),
    ];
    const d1 = len2(points[0], points[2]);
    const d2 = len2(points[1], points[3]);
    return (
      eq(s[0], s[1]) && eq(s[1], s[2]) && eq(s[2], s[3]) && eq(d1, d2)
    );
  }

  if (type === ShapeType.RECTANGLE) {
    if (points.length !== 4) return false;
    const s = [
      len2(points[0], points[1]),
      len2(points[1], points[2]),
      len2(points[2], points[3]),
      len2(points[3], points[0]),
    ];
    const d1 = len2(points[0], points[2]);
    const d2 = len2(points[1], points[3]);
    // Gegenüberliegende Seiten gleich, Diagonalen gleich,
    // aber NICHT alle Seiten gleich (sonst wäre es ein Quadrat)
    const isRect = eq(s[0], s[2]) && eq(s[1], s[3]) && eq(d1, d2);
    const isSquare = eq(s[0], s[1]);
    return isRect && !isSquare;
  }

  if (type === ShapeType.TRIANGLE) {
    if (points.length !== 3) return false;
    // Nicht kollinear: Fläche > 0
    const area2 = Math.abs(
      (points[1].x - points[0].x) * (points[2].y - points[0].y) -
        (points[2].x - points[0].x) * (points[1].y - points[0].y)
    );
    return area2 > 1;
  }

  if (type === ShapeType.RIGHT_TRIANGLE) {
    if (points.length !== 3) return false;
    // Drei Seitenvektoren — irgendeines Skalarprodukt-Paar muss 0 sein
    const v01 = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
    const v12 = { x: points[2].x - points[1].x, y: points[2].y - points[1].y };
    const v20 = { x: points[0].x - points[2].x, y: points[0].y - points[2].y };
    const tol = 1;
    const isRight =
      Math.abs(v01.x * v12.x + v01.y * v12.y) < tol ||
      Math.abs(v12.x * v20.x + v12.y * v20.y) < tol ||
      Math.abs(v20.x * v01.x + v20.y * v01.y) < tol;
    // Außerdem: nicht entartet
    const area2 = Math.abs(v01.x * (-v20.y) - (-v20.x) * v01.y);
    return isRight && area2 > 1;
  }

  if (type === ShapeType.PARALLELOGRAM) {
    if (points.length !== 4) return false;
    // Vektoren der gegenüberliegenden Seiten müssen identisch sein
    const v01 = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };
    const v32 = { x: points[2].x - points[3].x, y: points[2].y - points[3].y };
    const v12 = { x: points[2].x - points[1].x, y: points[2].y - points[1].y };
    const v03 = { x: points[3].x - points[0].x, y: points[3].y - points[0].y };
    const tol = 1;
    const parallel =
      Math.abs(v01.x - v32.x) < tol &&
      Math.abs(v01.y - v32.y) < tol &&
      Math.abs(v12.x - v03.x) < tol &&
      Math.abs(v12.y - v03.y) < tol;
    if (!parallel) return false;
    // Nicht entartet (keine Linie) und kein Rechteck (sonst wär's ein Rechteck)
    const dot = v01.x * v12.x + v01.y * v12.y;
    return Math.abs(dot) > tol; // kein rechter Winkel = echtes Parallelogramm (nicht Rechteck)
  }

  return false;
}

// ---------- Setup random shapes for the game ----------
function pickShapes(length) {
  const out = [];
  for (let i = 0; i < length; i++) {
    out.push(SHAPES[Math.floor(Math.random() * SHAPES.length)]);
  }
  return out;
}

// ============================================================
// SETUP SCREEN
// ============================================================
function renderSetup() {
  $app.innerHTML = "";
  const root = document.createElement("section");
  root.className = "setup";
  root.innerHTML = `
    <div class="setup__icon">${ICON.grid}</div>
    <div>
      <h1 class="setup__title">GeoDraw</h1>
      <p class="setup__subtitle">Wie viele Figuren möchtest du heute zeichnen?</p>
    </div>
    <div class="length-picker">
      <button class="length-picker__btn" data-action="dec" aria-label="Weniger">−</button>
      <div class="length-picker__value" data-role="length">${state.gameLength}</div>
      <button class="length-picker__btn" data-action="inc" aria-label="Mehr">+</button>
    </div>
    <p class="length-picker__hint">Wähle zwischen 3 und 18 Figuren</p>
    <button class="btn-primary" data-action="start">Spiel starten</button>
  `;
  $app.appendChild(root);

  const valueEl = root.querySelector('[data-role="length"]');
  root.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "dec" && state.gameLength > 3) {
      state.gameLength -= 1;
      valueEl.textContent = state.gameLength;
    } else if (action === "inc" && state.gameLength < 18) {
      state.gameLength += 1;
      valueEl.textContent = state.gameLength;
    } else if (action === "start") {
      startGame();
    }
  });
}

function startGame() {
  state.shapes = pickShapes(state.gameLength);
  state.currentIndex = 0;
  state.score = 0;
  state.points = [];
  state.startTime = null;
  state.status = "playing";
  renderPlay();
}

// ============================================================
// PLAY SCREEN
// ============================================================
function renderPlay() {
  $app.innerHTML = "";

  const root = document.createElement("section");
  root.className = "play";
  root.innerHTML = `
    <header class="play__header">
      <div class="play__task">
        <span class="play__task-label" data-role="task-label">Aufgabe ${state.currentIndex + 1} von ${state.gameLength}</span>
        <span class="play__task-shape" data-role="task-shape"></span>
      </div>
      <div class="play__stats">
        <div class="stat">
          <span class="stat__label">Zeit</span>
          <span class="stat__value" data-role="time">0.0s</span>
        </div>
        <div class="stat stat--score">
          <span class="stat__label">Punkte</span>
          <span class="stat__value" data-role="score">0</span>
        </div>
      </div>
    </header>

    <div class="progress" data-role="progress"></div>

    <div class="canvas-wrap">
      <div class="canvas-description" data-role="description"></div>
      <svg class="canvas" data-role="canvas"></svg>
    </div>

    <div class="action-bar">
      <button class="btn-secondary" data-action="reset">${ICON.reset}<span>Zurücksetzen</span></button>
      <button class="btn-success" data-action="finish" disabled>${ICON.check}<span>Fertig</span></button>
    </div>
  `;
  $app.appendChild(root);

  // Cache references
  refs.app = root;
  refs.taskShape = root.querySelector('[data-role="task-shape"]');
  refs.description = root.querySelector('[data-role="description"]');
  refs.timeValue = root.querySelector('[data-role="time"]');
  refs.scoreValue = root.querySelector('[data-role="score"]');
  refs.progress = root.querySelector('[data-role="progress"]');
  refs.svg = root.querySelector('[data-role="canvas"]');
  refs.finishBtn = root.querySelector('[data-action="finish"]');
  refs.resetBtn = root.querySelector('[data-action="reset"]');

  // Build SVG layers (order matters: dots → preview → shape → snap → points)
  refs.layerDots = svgEl("g");
  refs.layerShape = svgEl("g");
  refs.layerPreview = svgEl("g");
  refs.layerSnap = svgEl("g");
  refs.layerPoints = svgEl("g");
  refs.svg.append(
    refs.layerDots,
    refs.layerShape,
    refs.layerPreview,
    refs.layerSnap,
    refs.layerPoints
  );

  // Set task info
  applyCurrentShape();
  applyProgress();
  applyScore();

  // Wire buttons
  refs.finishBtn.addEventListener("click", finishDrawing);
  refs.resetBtn.addEventListener("click", resetDrawing);

  // Setup canvas + listeners
  setupCanvas();
  attachPointerListeners();

  // Start the timer ticker
  refs.ticker = setInterval(updateTime, 100);
}

function applyCurrentShape() {
  const shape = state.shapes[state.currentIndex];
  refs.taskShape.textContent = shape.type;
  refs.description.textContent = shape.description;
  refs.app.querySelector('[data-role="task-label"]').textContent =
    `Aufgabe ${state.currentIndex + 1} von ${state.gameLength}`;
}

function applyProgress() {
  refs.progress.innerHTML = "";
  for (let i = 0; i < state.gameLength; i++) {
    const pip = document.createElement("div");
    pip.className = "progress__pip";
    if (i < state.currentIndex) pip.classList.add("progress__pip--done");
    else if (i === state.currentIndex)
      pip.classList.add("progress__pip--current");
    refs.progress.appendChild(pip);
  }
}

function applyScore() {
  refs.scoreValue.textContent = state.score.toLocaleString("de-CH");
}

function updateTime() {
  if (!state.startTime) {
    refs.timeValue.textContent = "0.0s";
    return;
  }
  const elapsed = (Date.now() - state.startTime) / 1000;
  refs.timeValue.textContent = elapsed.toFixed(1) + "s";
}

// ============================================================
// CANVAS LAYOUT
// ============================================================
function setupCanvas() {
  // Use ResizeObserver to keep grid in sync with element size
  const ro = new ResizeObserver(() => layoutGrid());
  ro.observe(refs.svg);
  layoutGrid();

  // Cleanup on screen change
  refs.app._ro = ro;
}

function layoutGrid() {
  if (!refs.svg) return;
  const rect = refs.svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  // Use the actual pixel dimensions as the SVG viewBox so 1 svg unit = 1 px.
  // This keeps interaction math simple and consistent.
  const W = Math.round(rect.width);
  const H = Math.round(rect.height);
  refs.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  refs.svg.setAttribute("preserveAspectRatio", "none");

  // Pick a grid that gives at least 6 cells across the shorter dimension,
  // with reasonable padding.
  const padding = 32;
  const usableW = W - 2 * padding;
  const usableH = H - 2 * padding;

  // Target cell size: roughly 60px on phones, can go larger on big screens
  const targetCell = Math.max(48, Math.min(90, Math.min(usableW, usableH) / 6));
  const cols = Math.max(4, Math.floor(usableW / targetCell));
  const rows = Math.max(4, Math.floor(usableH / targetCell));
  const cell = Math.min(usableW / cols, usableH / rows);

  grid.cols = cols;
  grid.rows = rows;
  grid.cell = cell;
  grid.width = W;
  grid.height = H;
  grid.offsetX = (W - cols * cell) / 2;
  grid.offsetY = (H - rows * cell) / 2;

  // Redraw all layers
  redrawDots();
  redrawShape();
  redrawPoints();
  redrawSnap();
  redrawPreview();
}

function redrawDots() {
  refs.layerDots.innerHTML = "";
  for (let r = 0; r <= grid.rows; r++) {
    for (let c = 0; c <= grid.cols; c++) {
      const cx = grid.offsetX + c * grid.cell;
      const cy = grid.offsetY + r * grid.cell;
      const dot = svgEl("circle", {
        cx,
        cy,
        r: 3,
        class: "dot",
      });
      refs.layerDots.appendChild(dot);
    }
  }
}

// ============================================================
// POINTER HANDLING
// ============================================================
function attachPointerListeners() {
  const svg = refs.svg;
  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);
  svg.addEventListener("pointerleave", onPointerLeave);
}

// Convert client coords to svg coords (1:1 because we use pixel viewBox)
function svgCoords(e) {
  const rect = refs.svg.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// Snap to nearest grid point if close enough
function snapToGrid(p) {
  const gx = Math.round((p.x - grid.offsetX) / grid.cell);
  const gy = Math.round((p.y - grid.offsetY) / grid.cell);
  if (gx < 0 || gx > grid.cols || gy < 0 || gy > grid.rows) return null;
  const sx = grid.offsetX + gx * grid.cell;
  const sy = grid.offsetY + gy * grid.cell;
  // Snap radius: 60% of cell — generous for finger-friendly use
  const radius = grid.cell * 0.6;
  if (Math.hypot(p.x - sx, p.y - sy) > radius) return null;
  return { x: sx, y: sy };
}

function onPointerDown(e) {
  e.preventDefault();
  refs.svg.setPointerCapture(e.pointerId);
  draw.pointerActive = true;
  draw.pointer = svgCoords(e);
  draw.hover = snapToGrid(draw.pointer);
  scheduleRedraw();
}

function onPointerMove(e) {
  // Update pointer position on every move (cheap), but redraw is rAF-throttled
  draw.pointer = svgCoords(e);
  draw.hover = snapToGrid(draw.pointer);
  scheduleRedraw();
}

function onPointerUp(e) {
  // On pointer-up, place a point if we were snapped
  if (draw.hover) placePoint(draw.hover);
  draw.pointerActive = false;
  draw.pointer = null;
  draw.hover = null;
  scheduleRedraw();
}

function onPointerLeave(e) {
  // Don't kill the snap during an active drag — let pointercapture keep tracking
  if (!draw.pointerActive) {
    draw.pointer = null;
    draw.hover = null;
    scheduleRedraw();
  }
}

// Throttle visual updates to next animation frame for smooth perf
function scheduleRedraw() {
  if (draw.rafId) return;
  draw.rafId = requestAnimationFrame(() => {
    draw.rafId = null;
    redrawSnap();
    redrawPreview();
  });
}

// ============================================================
// PLACE / FINISH / RESET
// ============================================================
function placePoint(p) {
  // Start timer on first point
  if (state.points.length === 0 && !state.startTime) {
    state.startTime = Date.now();
  }

  // Tap on first point closes the shape
  if (
    state.points.length >= 3 &&
    state.points[0].x === p.x &&
    state.points[0].y === p.y
  ) {
    finishDrawing();
    return;
  }

  // Avoid duplicate consecutive points
  const last = state.points[state.points.length - 1];
  if (last && last.x === p.x && last.y === p.y) return;

  state.points.push(p);

  // If we hit max points for the current shape, auto-finish
  const shape = state.shapes[state.currentIndex];
  if (shape.maxPoints && state.points.length === shape.maxPoints) {
    redrawShape();
    redrawPoints();
    refs.finishBtn.disabled = false;
    return;
  }

  redrawShape();
  redrawPoints();
  refs.finishBtn.disabled = state.points.length < 3;
}

function resetDrawing() {
  state.points = [];
  state.startTime = null;
  refs.finishBtn.disabled = true;
  redrawShape();
  redrawPoints();
}

function finishDrawing() {
  const shape = state.shapes[state.currentIndex];
  const ok = validateShape(shape.type, state.points);
  if (ok) {
    const elapsed = (Date.now() - (state.startTime || Date.now())) / 1000;
    const speedBonus = Math.max(0, Math.floor(100 - elapsed * 5));
    const earned = 100 + speedBonus;
    state.score += earned;
    showFeedback({
      type: "success",
      title: `Super! +${earned} Punkte`,
      tip: shape.tip,
    });
    setTimeout(advanceLevel, 1800);
  } else {
    showFeedback({
      type: "error",
      title: "Das war noch nicht ganz richtig.",
      tip: shape.description + " Versuch es nochmal!",
    });
    setTimeout(() => {
      hideFeedback();
      resetDrawing();
    }, 1800);
  }
}

function advanceLevel() {
  hideFeedback();
  state.currentIndex += 1;
  if (state.currentIndex >= state.gameLength) {
    teardownPlay();
    state.status = "finished";
    renderFinished();
    return;
  }
  state.points = [];
  state.startTime = null;
  refs.finishBtn.disabled = true;
  applyCurrentShape();
  applyProgress();
  applyScore();
  redrawShape();
  redrawPoints();
}

function teardownPlay() {
  if (refs.ticker) {
    clearInterval(refs.ticker);
    refs.ticker = null;
  }
  if (refs.app && refs.app._ro) {
    refs.app._ro.disconnect();
    refs.app._ro = null;
  }
}

// ============================================================
// LAYER REDRAWS — direct DOM manipulation, no virtual DOM
// ============================================================
function redrawShape() {
  refs.layerShape.innerHTML = "";
  if (state.points.length < 2) return;
  const pts = state.points.map((p) => `${p.x},${p.y}`).join(" ");
  // Use polyline for in-progress, polygon when shape would be closed?
  // We use polyline always so users can see what they've drawn.
  const poly = svgEl("polyline", {
    points: pts,
    class: "shape-fill",
    fill: state.points.length >= 3 ? "rgba(79,70,229,0.08)" : "none",
  });
  refs.layerShape.appendChild(poly);
}

function redrawPoints() {
  refs.layerPoints.innerHTML = "";
  state.points.forEach((p, i) => {
    const c = svgEl("circle", {
      cx: p.x,
      cy: p.y,
      r: 7,
      class: "placed-point",
    });
    refs.layerPoints.appendChild(c);
    // Highlight first point as a "close hint" once we have 3+ points
    if (i === 0 && state.points.length >= 3) {
      const halo = svgEl("circle", {
        cx: p.x,
        cy: p.y,
        r: 14,
        fill: "none",
        stroke: "var(--indigo-600)",
        "stroke-width": "2",
        "stroke-dasharray": "4 4",
        opacity: "0.5",
      });
      refs.layerPoints.insertBefore(halo, c);
    }
  });
}

function redrawSnap() {
  refs.layerSnap.innerHTML = "";
  if (!draw.hover) return;
  const halo = svgEl("circle", {
    cx: draw.hover.x,
    cy: draw.hover.y,
    r: Math.max(16, grid.cell * 0.35),
    class: "snap-halo",
  });
  const core = svgEl("circle", {
    cx: draw.hover.x,
    cy: draw.hover.y,
    r: 7,
    class: "snap-core",
  });
  refs.layerSnap.append(halo, core);
}

function redrawPreview() {
  refs.layerPreview.innerHTML = "";
  if (state.points.length === 0) return;
  if (!draw.pointer) return;
  const last = state.points[state.points.length - 1];
  const target = draw.hover || draw.pointer;
  const line = svgEl("line", {
    x1: last.x,
    y1: last.y,
    x2: target.x,
    y2: target.y,
    class: "line-preview",
  });
  refs.layerPreview.appendChild(line);
}

// ============================================================
// FEEDBACK OVERLAY
// ============================================================
let feedbackEl = null;

function showFeedback({ type, title, tip }) {
  hideFeedback();
  feedbackEl = document.createElement("div");
  feedbackEl.className = "feedback";
  feedbackEl.innerHTML = `
    <div class="feedback__card">
      <div class="feedback__icon feedback__icon--${type === "success" ? "success" : "error"}">
        ${type === "success" ? ICON.check : ICON.x}
      </div>
      <h2 class="feedback__title">${title}</h2>
      <div class="feedback__tip">${tip}</div>
    </div>
  `;
  document.body.appendChild(feedbackEl);
}

function hideFeedback() {
  if (feedbackEl) {
    feedbackEl.remove();
    feedbackEl = null;
  }
}

// ============================================================
// FINISHED SCREEN
// ============================================================
function renderFinished() {
  $app.innerHTML = "";
  const root = document.createElement("section");
  root.className = "finished";
  root.innerHTML = `
    <div class="finished__trophy">${ICON.trophy}</div>
    <div>
      <h1 class="finished__title">Grossartig gemacht!</h1>
      <p class="finished__subtitle">Du hast alle ${state.gameLength} Figuren gezeichnet.</p>
    </div>
    <div class="score-card">
      <div class="score-card__label">Deine Gesamtpunktzahl</div>
      <div class="score-card__value">${state.score.toLocaleString("de-CH")}</div>
    </div>
    <button class="btn-primary" data-action="restart">${ICON.reset}<span>Noch eine Runde</span></button>
  `;
  $app.appendChild(root);
  root.querySelector('[data-action="restart"]').addEventListener("click", () => {
    state.status = "setup";
    state.score = 0;
    renderSetup();
  });
}

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}

// ============================================================
// BOOT
// ============================================================
renderSetup();
