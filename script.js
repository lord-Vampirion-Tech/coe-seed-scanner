'use strict';

// ─── Константы ───
const VEINS = [
  { id: "coal", label: "Уголь", dimension: "overworld", spacing: 128, separation: 8, salt: 1042639205, priority: 0, color: "#70777f", texture: "assets/veins/coal.png" },
  { id: "copper", label: "Медь", dimension: "overworld", spacing: 128, separation: 8, salt: 277506605, priority: 0, color: "#d47b4b", texture: "assets/veins/copper_ingot.png" },
  { id: "diamond", label: "Алмаз", dimension: "overworld", spacing: 256, separation: 64, salt: 2078084124, priority: 0, color: "#54e8e1", texture: "assets/veins/diamond.png" },
  { id: "emerald", label: "Изумруд", dimension: "overworld", spacing: 256, separation: 64, salt: 551829032, priority: 0, color: "#45e68a", texture: "assets/veins/emerald.png" },
  { id: "gold", label: "Золото", dimension: "overworld", spacing: 128, separation: 32, salt: 1523235716, priority: 0, color: "#f4c542", texture: "assets/veins/gold_ingot.png" },
  { id: "hardenedDiamond", label: "Закалённый алмаз", dimension: "overworld", spacing: 512, separation: 128, salt: 244884670, priority: 0, color: "#b58cff", texture: "assets/veins/diamond.png" },
  { id: "iron", label: "Железо", dimension: "overworld", spacing: 128, separation: 8, salt: 1544847576, priority: 0, color: "#c5c9cf", texture: "assets/veins/iron_ingot.png" },
  { id: "lapis", label: "Лазурит", dimension: "overworld", spacing: 128, separation: 8, salt: 551334445, priority: 0, color: "#467cff", texture: "assets/veins/lapis_lazuli.png" },
  { id: "redstone", label: "Редстоун", dimension: "overworld", spacing: 128, separation: 16, salt: 473161052, priority: 0, color: "#f04444", texture: "assets/veins/redstone.png" },
  { id: "zinc", label: "Цинк", dimension: "overworld", spacing: 128, separation: 8, salt: 1768524180, priority: 0, color: "#82b4c9", texture: "assets/veins/zinc_ingot.png" },
  { id: "glowstone", label: "Светокамень", dimension: "nether", spacing: 128, separation: 8, salt: 642680510, priority: 0, color: "#ffe477", texture: "assets/veins/glowstone_dust.png" },
  { id: "ancient_debris", label: "Древние обломки", dimension: "nether", spacing: 512, separation: 128, salt: 408736440, priority: 0, color: "#8f5b48", texture: "assets/veins/netherite_scrap.png" },
  { id: "quartz", label: "Кварц", dimension: "nether", spacing: 128, separation: 8, salt: 1434658661, priority: 0, color: "#eee2d0", texture: "assets/veins/quartz.png" },
];

const DIM_LABEL = { overworld: "ВЕРХНИЙ", nether: "НИЖНИЙ" };
const DIM_BORDER_COLOR = { overworld: "#4ade80", nether: "#ff4500" };
const DIM_GRID_COLOR = { overworld: "rgba(74,222,128,", nether: "rgba(255,69,0," };
const MASK48 = (1n << 48n) - 1n;
const MULTIPLIER = 25214903917n;
const INCREMENT = 11n;
const REGION_X_MULT = 341873128712n;
const REGION_Z_MULT = 132897987541n;

// ─── DOM ───
const $ = id => document.getElementById(id);
const canvas = $("canvas"), ctx = canvas.getContext("2d"), mapWrap = $("mapWrap");
const tooltip = $("tooltip"), veinList = $("veinList"), selectionInfo = $("selectionInfo");
const statusText = $("statusText"), dimBadge = $("dimBadge");

const mapImageInputOW = $("mapImageInputOW"), mapImageNameOW = $("mapImageNameOW");
const owUploadLabel = $("owUploadLabel"), owUploadText = $("owUploadText");
const mapImageInputNether = $("mapImageInputNether"), mapImageNameNether = $("mapImageNameNether");
const netherUploadLabel = $("netherUploadLabel"), netherUploadText = $("netherUploadText");
const mapCenterX = $("mapCenterX"), mapCenterZ = $("mapCenterZ");
const mapOpacity = $("mapOpacity"), mapOpacityValue = $("mapOpacityValue");

// ─── Состояние ───
let currentDimension = "overworld";
let scanMode = "center";
let results = [];
let pointGroups = new Map();
let selectedGroupKey = null;
let hoverGroupKey = null;
let drag = null;
let size = { w: 0, h: 0, dpr: 1 };
let view = { scale: 2, offsetX: 0, offsetZ: 0 };
let rafPending = false;

const maps = {
  overworld: { image: null, url: null, input: mapImageInputOW, nameEl: mapImageNameOW, uploadLabel: owUploadLabel, uploadText: owUploadText },
  nether: { image: null, url: null, input: mapImageInputNether, nameEl: mapImageNameNether, uploadLabel: netherUploadLabel, uploadText: netherUploadText }
};

// ─── Java Random ───
class JavaRandom {
  constructor(seed) { this.setSeed(seed) }
  setSeed(seed) { this.state = (BigInt(seed) ^ MULTIPLIER) & MASK48 }
  next(bits) {
    this.state = (this.state * MULTIPLIER + INCREMENT) & MASK48;
    return Number(this.state >> BigInt(48 - bits));
  }
  nextInt(bound) {
    const m = bound - 1;
    let r = this.next(31);
    if ((bound & m) === 0) return Number((BigInt(bound) * BigInt(r)) >> 31n);
    let u = r, rem = u % bound;
    while (u - rem + m < 0) { u = this.next(31); rem = u % bound; }
    return rem;
  }
}

// ─── Утилиты ───
function parseSeed(v) {
  v = String(v).trim();
  if (!/^-?\d+$/.test(v)) throw new Error("Сид должен быть целым числом");
  return BigInt(v);
}
const floorDiv = (a, b) => Math.floor(a / b);
function regionSeed(seed, rx, rz, salt) {
  return BigInt(rx) * REGION_X_MULT + BigInt(rz) * REGION_Z_MULT + BigInt(seed) + BigInt(salt);
}
function getStartChunk(seed, cx, cz, v) {
  const rx = floorDiv(cx, v.spacing), rz = floorDiv(cz, v.spacing);
  const rng = new JavaRandom(regionSeed(seed, rx, rz, v.salt));
  const range = v.spacing - v.separation;
  const ox = rng.nextInt(range), oz = rng.nextInt(range);
  return { chunkX: rx * v.spacing + ox, chunkZ: rz * v.spacing + oz, regionX: rx, regionZ: rz, offsetX: ox, offsetZ: oz };
}

function getScanBounds() {
  if (scanMode === "center") {
    const cx = Number($("centerX").value), cz = Number($("centerZ").value), r = Number($("radius").value);
    if (![cx, cz, r].every(Number.isInteger) || r < 0) throw new Error("Центр и радиус — целые числа");
    return { minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r };
  }
  const minX = Number($("cornerMinX").value), minZ = Number($("cornerMinZ").value);
  const maxX = Number($("cornerMaxX").value), maxZ = Number($("cornerMaxZ").value);
  if (![minX, minZ, maxX, maxZ].every(Number.isInteger)) throw new Error("Границы — целые числа");
  if (minX > maxX || minZ > maxZ) throw new Error("ЛВ не может быть правее ПН");
  return { minX, maxX, minZ, maxZ };
}

function selectedVeins() {
  const set = new Set();
  document.querySelectorAll(".vein input").forEach(x => { if (x.checked) set.add(x.dataset.id) });
  return set;
}

function scan() {
  try {
    const seed = parseSeed($("seed").value);
    const b = getScanBounds();
    const enabled = selectedVeins();
    const out = [];

    for (const v of VEINS) {
      if (!enabled.has(v.id) || v.dimension !== currentDimension) continue;
      const minRx = floorDiv(b.minX, v.spacing) - 1, maxRx = floorDiv(b.maxX, v.spacing) + 1;
      const minRz = floorDiv(b.minZ, v.spacing) - 1, maxRz = floorDiv(b.maxZ, v.spacing) + 1;
      for (let rz = minRz; rz <= maxRz; rz++) {
        for (let rx = minRx; rx <= maxRx; rx++) {
          const p = getStartChunk(seed, rx * v.spacing, rz * v.spacing, v);
          if (p.chunkX < b.minX || p.chunkX > b.maxX || p.chunkZ < b.minZ || p.chunkZ > b.maxZ) continue;
          out.push({
            ...p, id: v.id, label: v.label, dimension: v.dimension,
            priority: v.priority, spacing: v.spacing, separation: v.separation,
            salt: v.salt, color: v.color,
            blockX: p.chunkX * 16 + 8, blockZ: p.chunkZ * 16 + 8
          });
        }
      }
    }

    results = out;
    buildGroups();
    updateCounts();
    fitToScanRectangle();
    updateStatus();
    scheduleDraw();
    selectionInfo.textContent = "Нажми ЛКМ по метке";
  } catch (e) {
    statusText.textContent = "Ошибка: " + e.message;
    console.error(e);
  }
}

function buildGroups() {
  pointGroups = new Map();
  for (const r of results) {
    const key = `${r.dimension}|${r.chunkX}|${r.chunkZ}`;
    let g = pointGroups.get(key);
    if (!g) {
      g = { key, dimension: r.dimension, chunkX: r.chunkX, chunkZ: r.chunkZ, blockX: r.blockX, blockZ: r.blockZ, veins: [] };
      pointGroups.set(key, g);
    }
    g.veins.push(r);
  }
  for (const g of pointGroups.values()) {
    g.veins.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  }
}

function updateCounts() {
  const counts = new Map();
  for (const r of results) counts.set(r.id, (counts.get(r.id) || 0) + 1);
  document.querySelectorAll(".vein").forEach(row => {
    const id = row.querySelector("input").dataset.id;
    row.querySelector(".count").textContent = counts.get(id) || 0;
  });
}

function updateStatus() {
  statusText.textContent = `Точек: ${pointGroups.size} · Кандидатов: ${results.length}`;
  dimBadge.textContent = DIM_LABEL[currentDimension];
  dimBadge.classList.toggle("nether", currentDimension === "nether");
}

// ─── Преобразования ───
function worldToScreen(x, z) {
  return { x: size.w / 2 + (x - view.offsetX) * view.scale, y: size.h / 2 + (z - view.offsetZ) * view.scale };
}
function screenToWorld(px, py) {
  return { x: view.offsetX + (px - size.w / 2) / view.scale, z: view.offsetZ + (py - size.h / 2) / view.scale };
}
function fitToScanRectangle() {
  const b = getScanBounds();
  view.offsetX = (b.minX + b.maxX + 1) / 2;
  view.offsetZ = (b.minZ + b.maxZ + 1) / 2;
  const w = b.maxX - b.minX + 1, h = b.maxZ - b.minZ + 1;
  view.scale = Math.max(.12, Math.min(size.w / (w * 1.12), size.h / (h * 1.12), 50));
}
function getMapCenter() {
  const x = Number(mapCenterX.value), z = Number(mapCenterZ.value);
  if (!Number.isInteger(x) || !Number.isInteger(z)) throw new Error("Центр PNG — целые координаты");
  return { x, z };
}

// ─── Отрисовка ───
function scheduleDraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; draw(); });
}

function drawMapImage() {
  const map = maps[currentDimension];
  if (!map.image) return;
  const c = getMapCenter();
  const widthChunks = map.image.naturalWidth / 16;
  const heightChunks = map.image.naturalHeight / 16;
  if (!widthChunks || !heightChunks) return;
  const left = c.x + .5 - widthChunks / 2;
  const top = c.z + .5 - heightChunks / 2;
  const tl = worldToScreen(left, top);
  const br = worldToScreen(left + widthChunks, top + heightChunks);
  ctx.save();
  ctx.globalAlpha = Number(mapOpacity.value) / 100;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(map.image, Math.round(tl.x), Math.round(tl.y), Math.round(br.x - tl.x), Math.round(br.y - tl.y));
  ctx.restore();
}

function drawGrid(minX, maxX, minZ, maxZ) {
  const tl = worldToScreen(minX, minZ), br = worldToScreen(maxX + 1, maxZ + 1);
  const gc = DIM_GRID_COLOR[currentDimension];
  ctx.save();

  ctx.fillStyle = gc + ".04)";
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  ctx.strokeStyle = DIM_BORDER_COLOR[currentDimension];
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.shadowColor = DIM_BORDER_COLOR[currentDimension];
  ctx.shadowBlur = 12;
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);

  const left = Math.floor(screenToWorld(0, 0).x) - 2, right = Math.ceil(screenToWorld(size.w, 0).x) + 2;
  const top = Math.floor(screenToWorld(0, 0).z) - 2, bottom = Math.ceil(screenToWorld(0, size.h).z) + 2;
  const step = view.scale >= 16 ? 1 : view.scale >= 6 ? 4 : view.scale >= 2 ? 8 : view.scale >= .8 ? 16 : view.scale >= .35 ? 32 : 64;

  for (let x = Math.floor(left / step) * step; x <= right; x += step) {
    const sx = worldToScreen(x, 0).x;
    const isMajor = x % (step * 4) === 0;
    ctx.strokeStyle = isMajor ? gc + ".15)" : gc + ".05)";
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, size.h); ctx.stroke();
  }
  for (let z = Math.floor(top / step) * step; z <= bottom; z += step) {
    const sy = worldToScreen(0, z).y;
    const isMajor = z % (step * 4) === 0;
    ctx.strokeStyle = isMajor ? gc + ".15)" : gc + ".05)";
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(size.w, sy); ctx.stroke();
  }

  const ax = worldToScreen(0, 0).x, az = worldToScreen(0, 0).y;
  ctx.strokeStyle = "rgba(0,240,255,.4)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(0,240,255,.6)";
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, size.h); ctx.moveTo(0, az); ctx.lineTo(size.w, az); ctx.stroke();
  ctx.shadowBlur = 0;

  if (scanMode === "center") {
    const cx = Number($("centerX").value), cz = Number($("centerZ").value);
    const p = worldToScreen(cx + .5, cz + .5);
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ffd700";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
    ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function hexToRgba(hex, a) {
  const v = hex.replace("#", "");
  return `rgba(${parseInt(v.slice(0, 2), 16)},${parseInt(v.slice(2, 4), 16)},${parseInt(v.slice(4, 6), 16)},${a})`;
}

function drawPoint(g) {
  const tl = worldToScreen(g.chunkX, g.chunkZ), br = worldToScreen(g.chunkX + 1, g.chunkZ + 1);
  const width = br.x - tl.x, height = br.y - tl.y;
  const inset = Math.max(.75, Math.min(2, Math.min(width, height) * .08));
  const x = tl.x + inset, y = tl.y + inset;
  const w = Math.max(1, width - inset * 2), h = Math.max(1, height - inset * 2);
  const colors = [...new Set(g.veins.map(v => v.color))];

  ctx.save();

  if (colors.length === 1) {
    ctx.fillStyle = hexToRgba(colors[0], .25);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = Math.max(1, Math.min(2.5, Math.min(width, height) * .06));
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = 8;
    ctx.strokeRect(x, y, w, h);
  } else {
    const part = w / colors.length;
    colors.forEach((color, i) => {
      ctx.fillStyle = hexToRgba(color, .25);
      ctx.fillRect(x + i * part, y, part, h);
    });
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = 1;
    for (let i = 1; i < colors.length; i++) {
      const px = x + i * part;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
    }
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = Math.max(1, Math.min(2.5, Math.min(width, height) * .06));
    ctx.shadowColor = colors[0];
    ctx.shadowBlur = 8;
    ctx.strokeRect(x, y, w, h);
  }

  ctx.shadowBlur = 0;

  if (g.key === hoverGroupKey) {
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = Math.max(2, Math.min(3, Math.min(width, height) * .1));
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 16;
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    ctx.shadowBlur = 0;
  }
  if (g.key === selectedGroupKey) {
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = Math.max(2, Math.min(4, Math.min(width, height) * .12));
    ctx.shadowColor = "#ffd700";
    ctx.shadowBlur = 20;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function draw() {
  if (!size.w || !size.h) return;
  ctx.clearRect(0, 0, size.w, size.h);

  ctx.fillStyle = "#050508";
  ctx.fillRect(0, 0, size.w, size.h);

  const grad = ctx.createRadialGradient(size.w / 2, size.h / 2, 0, size.w / 2, size.h / 2, Math.max(size.w, size.h) * .7);
  grad.addColorStop(0, currentDimension === "nether" ? "rgba(255,69,0,.06)" : "rgba(0,240,255,.06)");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size.w, size.h);

  drawMapImage();
  const b = getScanBounds();
  drawGrid(b.minX, b.maxX, b.minZ, b.maxZ);
  for (const g of pointGroups.values()) drawPoint(g);
}

// ─── Выбор точки ───
function setSelection(g) {
  selectedGroupKey = g.key;
  const v = g.veins[0];
  const dimLabel = v.dimension === "overworld" ? "overworld" : "nether";
  let html = `<div class="selection">`;
  html += `<div><strong>Chunk:</strong> <span class="mono">${g.chunkX}, ${g.chunkZ}</span></div>`;
  html += `<div><strong>Block:</strong> <span class="mono">${g.blockX}, ${g.blockZ}</span></div>`;
  html += `<div style="margin-top:8px"><strong>Жила:</strong> `;
  html += `<span style="display:inline-block;width:10px;height:10px;background:${escapeHtml(v.color)};border:1px solid rgba(255,255,255,.5);border-radius:2px;vertical-align:middle;margin-right:6px;box-shadow:0 0 8px ${escapeHtml(v.color)}"></span>`;
  html += `<span style="vertical-align:middle">${escapeHtml(v.label)} (${dimLabel})</span></div>`;
  html += `<div style="margin-top:10px" class="mono">/tp @s ${g.blockX} ~ ${g.blockZ}</div>`;
  html += `</div>`;
  selectionInfo.innerHTML = html;
  scheduleDraw();
}

function showTooltip(g, clientX, clientY) {
  const v = g.veins[0];
  const dimLabel = v.dimension === "overworld" ? "overworld" : "nether";
  tooltip.innerHTML = `<div class="title">${escapeHtml(v.label)}</div>`;
  tooltip.innerHTML += `<div class="muted">${dimLabel}</div>`;
  tooltip.innerHTML += `<div>Chunk: <span class="mono">${g.chunkX}, ${g.chunkZ}</span></div>`;
  tooltip.innerHTML += `<div>Block: <span class="mono">${g.blockX}, ${g.blockZ}</span></div>`;
  const r = mapWrap.getBoundingClientRect();
  let x = clientX - r.left + 16, y = clientY - r.top + 16;
  x = Math.min(x, r.width - 320);
  y = Math.min(y, r.height - 120);
  tooltip.style.left = Math.max(8, x) + "px";
  tooltip.style.top = Math.max(8, y) + "px";
  tooltip.style.display = "block";
}

function hideTooltip() { tooltip.style.display = "none"; }

function findGroupAt(px, py) {
  const p = screenToWorld(px, py);
  for (const g of pointGroups.values()) {
    if (p.x >= g.chunkX && p.x < g.chunkX + 1 && p.z >= g.chunkZ && p.z < g.chunkZ + 1) return g;
  }
  return null;
}

function resizeCanvas() {
  const r = mapWrap.getBoundingClientRect();
  size.dpr = window.devicePixelRatio || 1;
  size.w = r.width;
  size.h = r.height;
  canvas.width = Math.floor(size.w * size.dpr);
  canvas.height = Math.floor(size.h * size.dpr);
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  scheduleDraw();
}

function zoomAt(clientX, clientY, factor) {
  const r = mapWrap.getBoundingClientRect();
  const px = clientX - r.left, py = clientY - r.top;
  const before = screenToWorld(px, py);
  view.scale = Math.max(.08, Math.min(80, view.scale * factor));
  const after = screenToWorld(px, py);
  view.offsetX += before.x - after.x;
  view.offsetZ += before.z - after.z;
  scheduleDraw();
}

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function setScanMode(mode) {
  scanMode = mode;
  $("modeCenter").classList.toggle("active", mode === "center");
  $("modeCorners").classList.toggle("active", mode === "corners");
  $("centerMode").classList.toggle("active", mode === "center");
  $("cornersMode").classList.toggle("active", mode === "corners");
  scan();
}

// ─── События ───
document.querySelectorAll(".dimension button").forEach(button => {
  button.addEventListener("click", () => {
    currentDimension = button.dataset.dim;
    document.querySelectorAll(".dimension button").forEach(x => x.classList.remove("active"));
    button.classList.add("active");
    scan();
  });
});

$("modeCenter").onclick = () => setScanMode("center");
$("modeCorners").onclick = () => setScanMode("corners");
$("scan").onclick = scan;
$("resetView").onclick = () => { fitToScanRectangle(); scheduleDraw(); };

$("allOn").onclick = () => {
  document.querySelectorAll(".vein input").forEach(x => x.checked = true);
  scan();
};
$("allOff").onclick = () => {
  document.querySelectorAll(".vein input").forEach(x => x.checked = false);
  scan();
};

$("savePng").onclick = () => {
  const a = document.createElement("a");
  a.download = "coe-map.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
};

$("resetAll").onclick = () => {
  if (confirm("Сбросить все настройки?")) location.reload();
};

["seed", "centerX", "centerZ", "radius", "cornerMinX", "cornerMinZ", "cornerMaxX", "cornerMaxZ"]
  .forEach(id => {
    $(id).addEventListener("keydown", e => { if (e.key === "Enter") scan(); });
  });

canvas.addEventListener("mousedown", e => {
  if (e.button !== 0) return;
  const r = canvas.getBoundingClientRect();
  const hit = findGroupAt(e.clientX - r.left, e.clientY - r.top);
  if (hit) { setSelection(hit); return; }
  drag = { x: e.clientX, y: e.clientY, ox: view.offsetX, oz: view.offsetZ };
  canvas.classList.add("dragging");
  hideTooltip();
});

window.addEventListener("mousemove", e => {
  if (drag) {
    view.offsetX = drag.ox - (e.clientX - drag.x) / view.scale;
    view.offsetZ = drag.oz - (e.clientY - drag.y) / view.scale;
    scheduleDraw();
    return;
  }
  const r = canvas.getBoundingClientRect();
  const hit = findGroupAt(e.clientX - r.left, e.clientY - r.top);
  const key = hit?.key || null;
  if (key !== hoverGroupKey) { hoverGroupKey = key; scheduleDraw(); }
  if (hit) showTooltip(hit, e.clientX, e.clientY); else hideTooltip();
});

window.addEventListener("mouseup", () => {
  drag = null;
  canvas.classList.remove("dragging");
});

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.14 : 1 / 1.14);
}, { passive: false });

canvas.addEventListener("dblclick", e => {
  if (scanMode !== "center") return;
  const r = canvas.getBoundingClientRect();
  const p = screenToWorld(e.clientX - r.left, e.clientY - r.top);
  $("centerX").value = Math.floor(p.x);
  $("centerZ").value = Math.floor(p.z);
  scan();
});

window.addEventListener("resize", resizeCanvas);

// ─── Список жил ───
for (const v of VEINS) {
  const row = document.createElement("label");
  row.className = "vein";
  row.innerHTML = `<input type="checkbox" data-id="${v.id}" checked>
    <img class="vein-color" src="${escapeHtml(v.texture)}" alt="" title="${escapeHtml(v.label)}" loading="lazy" decoding="async" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'; this.nextElementSibling.style.background='${escapeHtml(v.color)}'">
    <span class="texture-fallback" style="background:${escapeHtml(v.color)}"></span>
    <span class="name">${escapeHtml(v.label)}</span>
    <span class="count">0</span>`;
  row.querySelector("input").addEventListener("change", scan);
  veinList.appendChild(row);
}

// ─── Загрузка карт ───
function setupMapUpload(map, dimKey) {
  map.input.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") {
      alert("Нужно выбрать PNG-файл");
      map.input.value = "";
      return;
    }
    if (map.url) URL.revokeObjectURL(map.url);
    map.url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      map.image = image;
      map.nameEl.textContent = `${file.name} · ${image.naturalWidth}×${image.naturalHeight}px`;
      map.uploadText.textContent = file.name.length > 15 ? file.name.slice(0, 12) + "…" : file.name;
      map.uploadLabel.classList.add("has-file");
      if (currentDimension === dimKey) scheduleDraw();
    };
    image.onerror = () => {
      map.image = null;
      map.nameEl.textContent = "Ошибка загрузки";
      URL.revokeObjectURL(map.url);
      map.url = null;
      map.input.value = "";
      map.uploadLabel.classList.remove("has-file");
      map.uploadText.textContent = "Загрузить";
      if (currentDimension === dimKey) scheduleDraw();
    };
    image.src = map.url;
  });
}

function clearMap(map, dimKey) {
  map.image = null;
  if (map.url) URL.revokeObjectURL(map.url);
  map.url = null;
  map.input.value = "";
  map.nameEl.textContent = "Файл не выбран";
  map.uploadText.textContent = "Загрузить";
  map.uploadLabel.classList.remove("has-file");
  if (currentDimension === dimKey) scheduleDraw();
}

setupMapUpload(maps.overworld, "overworld");
setupMapUpload(maps.nether, "nether");
$("mapClearOW").addEventListener("click", () => clearMap(maps.overworld, "overworld"));
$("mapClearNether").addEventListener("click", () => clearMap(maps.nether, "nether"));
$("mapUseScanCenter").addEventListener("click", () => {
  try {
    const b = getScanBounds();
    mapCenterX.value = Math.floor((b.minX + b.maxX) / 2);
    mapCenterZ.value = Math.floor((b.minZ + b.maxZ) / 2);
    scheduleDraw();
  } catch (e) { alert(e.message); }
});
mapCenterX.addEventListener("change", scheduleDraw);
mapCenterZ.addEventListener("change", scheduleDraw);
mapOpacity.addEventListener("input", () => {
  mapOpacityValue.textContent = `${mapOpacity.value}%`;
  scheduleDraw();
});

// ─── Инициализация ───
resizeCanvas();
scan();