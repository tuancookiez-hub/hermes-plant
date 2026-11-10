// Hermes Plant 1.0.0, built from desktop-src/ (npm ci && npm run build). Do not edit.

// src/plugin.jsx
import { useSyncExternalStore } from "react";
import * as sdk from "@hermes/plugin-sdk";

// src/engine.js
var HOUR = 36e5;
var DAY = 24 * HOUR;
var HYDRATED_MS = 3 * DAY;
var THIRSTY_MS = DAY;
var DROOP_FULL_MS = 3 * DAY;
var FED_MS = 2 * DAY;
var LEAN_MS = 10 * DAY;
var LEAN_NOTICE = 0.6;
var REPOT_READY = 0.8;
var BASE_NODES = 4;
var NODE_RATE = 6;
var MAX_CUTS = 240;
var POTS = [
  { name: "seedling pot", days: 7 },
  { name: "small pot", days: 21 },
  { name: "medium pot", days: 45 },
  { name: "large pot", days: null }
];
var STAGES = [
  { name: "sapling", days: 0 },
  { name: "young plant", days: 7 },
  { name: "mature plant", days: 21 },
  { name: "flowering", days: 45 }
];
var clamp = (value, low, high) => Math.min(high, Math.max(low, value));
var nodesAt = (growthMs) => BASE_NODES + Math.floor(NODE_RATE * Math.sqrt(growthMs / DAY));
function createPlant(now, seed) {
  return {
    v: 2,
    rev: 1,
    seed: seed >>> 0,
    plantedAt: now,
    updatedAt: now,
    hydratedUntil: now + HYDRATED_MS,
    growthMs: 0,
    cuts: [],
    fedUntil: 0,
    leanAt: 0,
    turnedAt: now,
    pot: 0
  };
}
function upgrade(raw, now) {
  if (raw?.v !== 1 || !Array.isArray(raw.cuts) || !Number.isFinite(raw.growthMs)) return raw;
  const days = raw.growthMs / DAY;
  const pot = POTS.findIndex((item) => item.days === null || days < item.days);
  return {
    ...raw,
    v: 2,
    rev: 1,
    cuts: raw.cuts.map((node) => Number.isInteger(node) ? nodesAt(Math.max(0, node - BASE_NODES) * 12 * HOUR) : node),
    fedUntil: 0,
    leanAt: 0,
    turnedAt: now,
    pot
  };
}
function restorePlant(input, now) {
  const raw = upgrade(input, now);
  if (raw?.v !== 2 || !Array.isArray(raw.cuts) || raw.cuts.length > MAX_CUTS) return null;
  const numbers = [raw.rev, raw.seed, raw.plantedAt, raw.updatedAt, raw.hydratedUntil, raw.growthMs, raw.fedUntil, raw.leanAt, raw.turnedAt];
  if (!numbers.every(Number.isFinite)) return null;
  if (!Number.isInteger(raw.pot) || raw.pot < 0 || raw.pot >= POTS.length) return null;
  if (raw.growthMs < 0 || raw.rev < 1 || !raw.cuts.every((n2) => Number.isInteger(n2) && n2 >= 0)) return null;
  return {
    v: 2,
    rev: Math.floor(raw.rev),
    seed: raw.seed >>> 0,
    plantedAt: Math.min(raw.plantedAt, now),
    updatedAt: Math.min(raw.updatedAt, now),
    hydratedUntil: Math.min(raw.hydratedUntil, now + HYDRATED_MS),
    growthMs: Math.floor(raw.growthMs),
    cuts: [...raw.cuts].sort((a, b) => a - b),
    fedUntil: Math.min(raw.fedUntil, now + FED_MS),
    leanAt: clamp(raw.leanAt, -1, 1),
    turnedAt: Math.min(raw.turnedAt, now),
    pot: raw.pot
  };
}
var isNewer = (a, b) => a.rev > b.rev || a.rev === b.rev && a.updatedAt > b.updatedAt;
var potLimit = (plant) => {
  const days = POTS[plant.pot].days;
  return days === null ? Infinity : days * DAY;
};
function settle(plant, now) {
  const end = Math.min(now, plant.hydratedUntil);
  const span = Math.max(0, end - plant.updatedAt);
  const fed = Math.max(0, Math.min(end, plant.fedUntil) - plant.updatedAt);
  const growthMs = Math.min(potLimit(plant), plant.growthMs + span + Math.floor(fed / 2));
  return { ...plant, growthMs: Math.max(plant.growthMs, growthMs), updatedAt: Math.max(plant.updatedAt, now) };
}
var leanOf = (plant, now) => clamp(plant.leanAt + Math.max(0, now - plant.turnedAt) / LEAN_MS, -1, 1);
var nodeCount = (plant) => nodesAt(plant.growthMs);
var act = (plant, now, change) => ({ ...settle(plant, now), ...change, rev: plant.rev + 1 });
function water(plant, now) {
  return { plant: act(plant, now, { hydratedUntil: now + HYDRATED_MS }), done: true, message: "Watered. Good for three days." };
}
function prune(plant, now) {
  const settled = settle(plant, now);
  const nodes = nodeCount(settled);
  if (settled.cuts.length >= MAX_CUTS || settled.cuts.at(-1) >= nodes) {
    return { plant, done: false, message: "Nothing new to prune yet." };
  }
  return { plant: act(plant, now, { cuts: [...settled.cuts, nodes] }), done: true, message: "Pruned. Two new shoots will branch from the cut." };
}
function rotate(plant, now) {
  return { plant: act(plant, now, { leanAt: -leanOf(plant, now), turnedAt: now }), done: true, message: "Turned the pot. It will straighten up." };
}
function feed(plant, now) {
  if (now < plant.fedUntil) return { plant, done: false, message: "Still using the last feed." };
  return { plant: act(plant, now, { fedUntil: now + FED_MS }), done: true, message: "Fed. It grows faster for two days." };
}
function repot(plant, now) {
  const settled = settle(plant, now);
  if (settled.pot >= POTS.length - 1) return { plant, done: false, message: "Already in the largest pot." };
  if (settled.growthMs < REPOT_READY * potLimit(settled)) return { plant, done: false, message: "The roots still have room." };
  const pot = settled.pot + 1;
  return { plant: act(plant, now, { pot }), done: true, message: `Moved to the ${POTS[pot].name}.` };
}
var ACTIONS = { feed, prune, repot, rotate, water };
function describe(plant, now) {
  const settled = settle(plant, now);
  const days = settled.growthMs / DAY;
  const left = plant.hydratedUntil - now;
  const limit = potLimit(settled);
  const rootBound = settled.growthMs >= limit;
  const lean = leanOf(plant, now);
  const dry = left <= 0;
  const mood = dry ? "droopy" : left <= THIRSTY_MS ? "thirsty" : rootBound ? "root-bound" : lean >= LEAN_NOTICE ? "leaning" : "happy";
  const needs = [];
  if (left <= THIRSTY_MS) needs.push("water");
  if (rootBound) needs.push("repot");
  if (lean >= LEAN_NOTICE) needs.push("rotate");
  return {
    canRepot: settled.pot < POTS.length - 1 && settled.growthMs >= REPOT_READY * limit,
    days,
    droop: dry ? 0.2 + 0.8 * Math.min(1, -left / DROOP_FULL_MS) : left <= THIRSTY_MS ? 0.1 : 0,
    fed: now < plant.fedUntil,
    growing: !dry && !rootBound,
    lean,
    mood,
    needs,
    nodes: nodeCount(settled),
    pot: settled.pot,
    potName: POTS[settled.pot].name,
    stage: STAGES.findLast((stage) => days >= stage.days).name,
    waterHours: Math.max(0, Math.round(left / HOUR))
  };
}
function summarize(view) {
  const state = {
    droopy: "dry and drooping, growth paused",
    happy: "happy",
    leaning: "leaning toward the light",
    "root-bound": "root-bound, growth paused",
    thirsty: "getting thirsty"
  }[view.mood];
  return `${view.stage} in a ${view.potName}, ${state}`;
}
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var UP = -Math.PI / 2;
var SEGMENT = 4.4;
var MIN_STEM = 2;
var CUT_NODES = 2;
var SHOOT_EVERY = 5;
var MAX_NATURAL_TIPS = 6;
var SHOOT_RATE = 0.62;
function nextTip(tips) {
  let total = 0;
  let best = tips[0];
  for (const tip of tips) {
    tip.credit += tip.rate;
    total += tip.rate;
    if (tip.credit > best.credit) best = tip;
  }
  best.credit -= total;
  return best;
}
function addStem(stems, parent, angle, vigor, rate, natural = false) {
  const at = parent ? parent.segments.length : 0;
  const stem = { angle, at, credit: 0, cut: false, depth: parent ? parent.depth + 1 : 0, hold: 0, natural, parent, rate, segments: [], vigor };
  if (parent) parent.hold = at;
  stems.push(stem);
  return stem;
}
function pointOf(stem, count = stem.segments.length) {
  let { x, y } = stem.parent ? pointOf(stem.parent, stem.at) : { x: 0, y: 0 };
  for (let i = 0; i < count; i++) {
    x += Math.cos(stem.segments[i].angle) * stem.segments[i].length;
    y += Math.sin(stem.segments[i].angle) * stem.segments[i].length;
  }
  return { x, y };
}
function grow(stem, rng) {
  const last = stem.segments.at(-1)?.angle ?? stem.angle;
  const count = stem.segments.length;
  stem.segments.push({
    angle: last + (rng() - 0.5) * 0.4 + (UP - last) * (stem.natural ? 0.1 : 0.14),
    leaf: count > 0 || stem.depth > 0 ? count % 2 ? 1 : -1 : 0,
    leafSize: 0.8 + rng() * 0.45,
    length: SEGMENT * stem.vigor * (0.85 + rng() * 0.3)
  });
}
function cutTallest(stems, rng) {
  const tips = stems.filter((stem) => !stem.cut);
  const tallest = tips.reduce((best, stem) => pointOf(stem).y < pointOf(best).y ? stem : best);
  const keep = Math.max(MIN_STEM, tallest.hold, tallest.segments.length - CUT_NODES);
  tallest.segments.length = Math.min(tallest.segments.length, keep);
  tallest.cut = true;
  const angle = tallest.segments.at(-1)?.angle ?? tallest.angle;
  const spread = 0.55 + rng() * 0.25;
  const vigor = Math.max(0.6, tallest.vigor * 0.92);
  grow(addStem(stems, tallest, angle - spread, vigor, tallest.rate), rng);
  grow(addStem(stems, tallest, angle + spread, vigor, tallest.rate), rng);
}
function shape({ seed, cuts }, nodes) {
  const rng = random(seed);
  const stems = [];
  addStem(stems, null, UP + (rng() - 0.5) * 0.24, 1, 1);
  const side = rng() < 0.5 ? -1 : 1;
  const pending = [...cuts];
  for (let node = 1; node <= nodes; node++) {
    const tips = stems.filter((stem2) => !stem2.cut);
    const stem = nextTip(tips);
    grow(stem, rng);
    const count = stem.segments.length;
    if (count % SHOOT_EVERY === 3 && tips.length < MAX_NATURAL_TIPS) {
      const turn = (Math.floor(count / SHOOT_EVERY) % 2 ? 1 : -1) * (0.95 + rng() * 0.3);
      grow(addStem(stems, stem, stem.segments.at(-1).angle + turn, Math.max(0.6, stem.vigor * 0.85), stem.rate * SHOOT_RATE, true), rng);
    }
    while (pending[0] <= node) {
      pending.shift();
      cutTallest(stems, rng);
    }
  }
  while (pending.length) {
    pending.shift();
    cutTallest(stems, rng);
  }
  return { side, stems };
}

// src/art.js
var INK = "#1717e0";
var PAPER = "#fdfdff";
var VIEW = 100;
var FLOOR = 95;
var TOP = 3;
var SIDE = 4;
var MAX_SCALE = 1.7;
var LINE = 0.95;
var MAX_FLOWERS = 14;
var MIN_FRAME = 60;
var LEAVES = 9;
var CUT_LEAVES = 3;
var POT_SHAPES = [
  { width: 20, height: 15, rim: 3 },
  { width: 25, height: 18, rim: 3.5 },
  { width: 30, height: 21, rim: 4 },
  { width: 36, height: 25, rim: 4.5 }
];
var n = (value) => String(Math.round(value * 10) / 10);
var DOWN = Math.PI / 2;
var LEAF = `<path d="M0 0C2.5-3 7-2.6 10 0C7.5 2.4 3 3 0 0Z" fill="${PAPER}"/><path d="M0 0L9.3 0M2 .3L2.9 1.9M3.5 .3L4.5 2.1M5 .3L6 1.9M6.5 .3L7.4 1.4M8 .2L8.6.8M3-.2L4.2-1.7M5.6-.2L6.7-1.4" fill="none"/>`;
var SMALL_LEAF = `<path d="M0 0C2.5-3 7-2.6 10 0C7.5 2.4 3 3 0 0Z" fill="${PAPER}"/><path d="M0 0L9.3 0M3.2 .3L4.4 2M6 .3L7 1.6" fill="none"/>`;
var SMALL_BELOW = 6.2;
var LIMP_LEAF = `<path d="M0 0C2-2.2 7-1.6 10 1.6C7 3.2 3 2.7 0 0Z" fill="${PAPER}"/><path d="M0 0Q5 0 9.3 1.4M2 .4L2.8 1.8M3.6 .5L4.5 2.2M5.2 .7L6 2.3M6.8 1L7.5 2.1" fill="none"/>`;
var PETAL = "M0 0C-1.7-1.5-1.6-3.8 0-4.2C1.6-3.8 1.7-1.5 0 0Z";
var FLOWER = [0, 72, 144, 216, 288].map((turn) => `<path d="${PETAL}" transform="rotate(${turn})" fill="${PAPER}"/>`).join("") + `<circle r="1" fill="${INK}" stroke="none"/>`;
var BUD = `<path d="M0 0C-1.3-1-1.1-2.7 0-3.3C1.1-2.7 1.3-1 0 0Z" fill="${PAPER}"/><path d="M-.9-.6L0 0L.9-.6" fill="none"/>`;
function place({ side, stems }, view) {
  const droop = view.droop;
  const lean = view.lean * side;
  const paths = /* @__PURE__ */ new Map();
  const leaves = [];
  const tips = [];
  const lines = [];
  for (const stem of stems) {
    let { x, y } = stem.parent ? paths.get(stem.parent)[stem.at] : { x: 0, y: 0 };
    const points = [{ x, y }];
    stem.segments.forEach((segment, i) => {
      const height = Math.min(1, -y / 45);
      const outward = Math.abs(Math.cos(segment.angle)) < 0.12 ? side : Math.sign(Math.cos(segment.angle));
      const angle = segment.angle + lean * 0.38 * (0.35 + height) + outward * droop * 0.45 * (0.3 + height);
      x += Math.cos(angle) * segment.length;
      y += Math.sin(angle) * segment.length;
      points.push({ x, y });
      if (segment.leaf && stem.segments.length - i <= (stem.cut ? CUT_LEAVES : LEAVES)) {
        const out = angle + segment.leaf * 1.05;
        const toDown = Math.atan2(Math.sin(DOWN - out), Math.cos(DOWN - out));
        leaves.push({ angle: out + toDown * droop * 0.7, size: 9 * segment.leafSize * Math.sqrt(stem.vigor), x, y });
      }
    });
    paths.set(stem, points);
    lines.push({ depth: stem.depth, points });
    if (!stem.cut && stem.segments.length) {
      const last = points.at(-1);
      const before = points.at(-2);
      tips.push({ angle: Math.atan2(last.y - before.y, last.x - before.x), x: last.x, y: last.y });
    }
  }
  return { leaves, lines, tips };
}
function bounds({ leaves, lines }) {
  const box = { left: -4, right: 4, top: -4, bottom: 0 };
  const grow2 = (x, y) => {
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  };
  for (const line of lines) for (const p of line.points) grow2(p.x, p.y);
  for (const leaf of leaves) grow2(leaf.x + Math.cos(leaf.angle) * leaf.size, leaf.y + Math.sin(leaf.angle) * leaf.size);
  return box;
}
function drawPot(cx, index) {
  const { width, height, rim } = POT_SHAPES[index];
  const top = FLOOR - height;
  const neck = top + rim;
  const foot = width * 0.68;
  const edge = (t, y) => {
    const k = (y - neck) / (FLOOR - neck);
    const half = (width + (foot - width) * k) / 2;
    return cx - half + 2 * half * t;
  };
  const line = (t0, y0, t1, y1) => `M${n(edge(t0, y0))} ${n(y0)}L${n(edge(t1, y1))} ${n(y1)}`;
  const band = (y) => `M${n(edge(0, y))} ${n(y)}Q${n(cx)} ${n(y + 1.6)} ${n(edge(1, y))} ${n(y)}`;
  const shade = [0.6, 0.69, 0.78, 0.86, 0.93].map((t) => line(t, neck + 0.8, t, FLOOR - 0.6));
  for (let y = neck + 2.4; y < FLOOR - 1; y += 2.6) shade.push(line(0.8, y, 0.97, y - 1.3));
  for (const t of [0.8, 0.87, 0.94]) shade.push(`M${n(cx - width / 2 - 1.6 + (width + 3.2) * t)} ${n(top + 0.7)}v${n(rim - 1.4)}`);
  const marks = [];
  const body = FLOOR - neck;
  if (index === 1) marks.push(band(neck + body * 0.4));
  if (index >= 2) marks.push(band(neck + body * 0.28), band(neck + body * 0.62));
  if (index === 3) {
    const y0 = neck + body * 0.36;
    const y1 = neck + body * 0.56;
    let zigzag = `M${n(edge(0.04, y1))} ${n(y1)}`;
    for (let i = 1; i <= 8; i++) zigzag += `L${n(edge(0.04 + 0.5 * i / 8, i % 2 ? y0 : y1))} ${n(i % 2 ? y0 : y1)}`;
    marks.push(zigzag);
  }
  const dots = [];
  for (let row = 0; row < 3; row++) {
    const y = FLOOR + 1.2 + row * 1.3;
    const reach = foot / 2 + 7 - row * 2.5;
    for (let x = -reach + row % 2 * 0.9; x <= reach; x += 1.8) {
      const r = 0.62 * (1 - Math.abs(x) / (reach + 1.5)) * (1 - row * 0.22);
      if (r > 0.12) dots.push(`M${n(cx + 2.5 + x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`);
    }
  }
  const saucer = index >= 2 ? `<path d="M${n(cx - foot / 2 - 3.2)} ${n(FLOOR - 1.4)}h${n(foot + 6.4)}l-1.3 2.6h${n(-(foot + 3.8))}Z" fill="${PAPER}"/>` : "";
  return {
    back: `<path d="${dots.join("")}" fill="${INK}" stroke="none"/><ellipse cx="${n(cx)}" cy="${n(top + 1)}" rx="${n(width / 2 + 0.4)}" ry="1.7" fill="${INK}"/>`,
    front: saucer + `<path d="M${n(cx - width / 2)} ${n(neck)}H${n(cx + width / 2)}L${n(cx + foot / 2)} ${n(FLOOR - 1)}Q${n(cx)} ${n(FLOOR + 0.9)} ${n(cx - foot / 2)} ${n(FLOOR - 1)}Z" fill="${PAPER}"/><path d="${shade.join("")}${marks.join("")}" fill="none" stroke-width="0.6"/><rect x="${n(cx - width / 2 - 1.6)}" y="${n(top)}" width="${n(width + 3.2)}" height="${n(rim)}" rx="1.2" fill="${PAPER}"/>`,
    top
  };
}
var trail = (points) => points.map((p, i) => `${i ? "L" : "M"}${n(p.x)} ${n(p.y)}`).join("");
function drawPlant(plant, view, uid = "hp") {
  const laid = place(shape(plant, view.nodes), view);
  const box = bounds(laid);
  const { top } = drawPot(0, view.pot);
  const room = top + 1 - TOP;
  const scale = Math.min(MAX_SCALE, (VIEW - 2 * SIDE) / (box.right - box.left), room / Math.max(1, -box.top));
  const half = POT_SHAPES[view.pot].width / 2 + 5;
  const cx = Math.min(VIEW - half, Math.max(half, Math.min(VIEW - SIDE - box.right * scale, Math.max(SIDE - box.left * scale, VIEW / 2))));
  const pot = drawPot(cx, view.pot);
  const limp = view.droop > 0.35;
  const weight = LINE / scale;
  const trunk = (1.3 + Math.min(1.4, view.nodes / 30)) / scale;
  const stemParts = laid.lines.map((line) => {
    const width = Math.max(weight * 1.25, trunk * 0.7 ** line.depth);
    const d = trail(line.points);
    const hollow = width * scale > 2.3 ? `<path d="${d}" stroke="${PAPER}" stroke-width="${n(width - 1.5 * weight)}"/>` : "";
    return [`<path d="${d}" stroke="${PAPER}" stroke-width="${n(width + 1.3 * weight)}"/>`, `<path d="${d}" stroke-width="${n(width)}"/>${hollow}`];
  });
  const stems = stemParts.map((part) => part[0]).join("") + stemParts.map((part) => part[1]).join("");
  const leaves = laid.leaves.map((leaf) => {
    const size = leaf.size / 10;
    const flip = Math.cos(leaf.angle) < 0 ? -1 : 1;
    const kind = limp ? "limp" : leaf.size * scale < SMALL_BELOW ? "small" : "leaf";
    return `<use href="#${uid}-${kind}" transform="translate(${n(leaf.x)} ${n(leaf.y)}) rotate(${n(leaf.angle * 180 / Math.PI)}) scale(${n(size)} ${n(size * flip)})" stroke-width="${n(weight / size)}"/>`;
  }).join("");
  let tips = "";
  if (view.stage === "flowering" && !limp) {
    const kind = view.mood === "thirsty" ? "bud" : "flower";
    const size = (view.fed ? 1.15 : 1) * Math.min(1.2, 0.72 / scale + 0.35);
    tips = laid.tips.slice(0, MAX_FLOWERS).map((tip) => `<use href="#${uid}-${kind}" transform="translate(${n(tip.x)} ${n(tip.y)}) rotate(${n(tip.angle * 180 / Math.PI + 90)}) scale(${n(size)})" stroke-width="${n(weight / size)}"/>`).join("");
  }
  const sparkle = (x, y, r) => `M${n(x)} ${n(y - r)}v${n(2 * r)}M${n(x - r)} ${n(y)}h${n(2 * r)}`;
  const fed = view.fed ? `<path d="${sparkle(cx - half - 1, pot.top - 6, 2)}${sparkle(cx + half + 2, pot.top - 13, 1.4)}" fill="none" stroke-width="0.8"/>` : "";
  const reach = Math.max(cx - (cx + box.left * scale), cx + box.right * scale - cx, half) * 2 + 4;
  const frame = Math.min(VIEW, Math.max(MIN_FRAME, VIEW - (pot.top + 1 + box.top * scale) + 3, reach));
  const frameX = Math.min(VIEW - frame, Math.max(0, cx - frame / 2));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(frameX)} ${n(VIEW - frame)} ${n(frame)} ${n(frame)}" width="100%" height="100%" aria-hidden="true" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"><defs><g id="${uid}-leaf">${LEAF}</g><g id="${uid}-small">${SMALL_LEAF}</g><g id="${uid}-limp">${LIMP_LEAF}</g><g id="${uid}-flower">${FLOWER}</g><g id="${uid}-bud">${BUD}</g></defs>` + pot.back + `<g class="hp-foliage"><g transform="translate(${n(cx)} ${n(pot.top + 1)}) scale(${Math.round(scale * 1e3) / 1e3})" fill="none">${stems}${leaves}${tips}</g></g>` + pot.front + fed + "</svg>";
}

// src/overlay.js
var BOX = 200;
var PLANT = 96;
var RADIUS = 76;
var TOP_LIMIT = 56;
var BOTTOM_LIMIT = 20;
var DEFAULT_POSITION = { right: 8, bottom: 72 };
var DRAG_START = 5;
var MESSAGE_MS = 2600;
var icon = (path) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
var ACTIONS2 = [
  { id: "water", label: "Water", hint: "lasts three days", icon: icon('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>') },
  { id: "prune", label: "Prune", hint: "cut the tallest tip", icon: icon('<circle cx="6" cy="18" r="2.5"/><circle cx="6" cy="6" r="2.5"/><path d="M8 7.5 20 18M8 16.5 20 6"/>') },
  { id: "rotate", label: "Rotate", hint: "turn it to the light", icon: icon('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 3v5h-5"/>') },
  { id: "feed", label: "Feed", hint: "faster growth for two days", icon: icon('<path d="M8 8h8l2 12H6z"/><path d="M9 8 8 4h8l-1 4"/><path d="M10 13h4"/>') },
  { id: "repot", label: "Repot", hint: "a bigger pot, more room", icon: icon('<path d="M6 11h12l-1.5 9h-9z"/><path d="M4.5 8h15v3h-15z"/><path d="M12 8V4M12 4l-2 2M12 4l2 2"/>') },
  { id: "ask", label: "Ask Hermes", hint: "sends a chat message", icon: icon('<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>') }
];
var CSS = `
.hp-box{position:fixed;width:${BOX}px;height:${BOX}px;z-index:60;pointer-events:none;font-family:inherit}
.hp-box[hidden]{display:none}
.hp-plant{position:absolute;left:${(BOX - PLANT) / 2}px;top:${(BOX - PLANT) / 2}px;width:${PLANT}px;height:${PLANT}px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;pointer-events:auto;touch-action:none;user-select:none}
.hp-plant svg{display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))}
.hp-plant:focus-visible,.hp-action:focus-visible{outline:2px solid ${INK};outline-offset:2px;box-shadow:0 0 0 2px ${PAPER}}
.hp-foliage{transform-box:fill-box;transform-origin:50% 100%}
.hp-plant:hover .hp-foliage{animation:hp-sway 2.8s ease-in-out infinite}
.hp-done .hp-plant svg{animation:hp-bounce 420ms ease-out 1}
.hp-action{position:absolute;left:${BOX / 2 - 21}px;top:${BOX / 2 - 21}px;display:flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border-radius:50%;border:1.5px solid ${INK};background:${PAPER};color:${INK};box-shadow:0 1px 5px rgba(0,0,0,.3);cursor:pointer;opacity:0;visibility:hidden;pointer-events:none;transform:scale(.6);transition:transform 180ms cubic-bezier(.2,.8,.2,1) var(--hp-delay),opacity 140ms linear var(--hp-delay),visibility 0s linear 200ms,background-color 100ms linear,color 100ms linear}
.hp-open .hp-action{opacity:1;visibility:visible;pointer-events:auto;transform:translate(var(--hp-x),var(--hp-y)) scale(1);transition:transform 180ms cubic-bezier(.2,.8,.2,1) var(--hp-delay),opacity 140ms linear var(--hp-delay),visibility 0s,background-color 100ms linear,color 100ms linear}
.hp-action:hover,.hp-action:focus-visible{background:${INK};color:${PAPER}}
.hp-need::after{content:"";position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;background:${INK};border:2px solid ${PAPER}}
.hp-message{position:absolute;left:50%;top:-26px;transform:translateX(-50%);max-width:260px;padding:2px 9px;border-radius:999px;border:1.5px solid ${INK};background:${PAPER};color:${INK};font-size:11px;font-weight:600;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity 140ms linear}
.hp-message.hp-show{opacity:1}
.hp-drop{position:absolute;left:var(--hp-drop-x);top:44px;width:6px;height:8px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;border:1.5px solid ${INK};background:${PAPER};opacity:0}
.hp-water .hp-drop{animation:hp-fall 640ms ease-in var(--hp-delay) 1}
@keyframes hp-fall{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(46px)}}
@keyframes hp-sway{0%,100%{transform:rotate(0deg)}30%{transform:rotate(1.6deg)}70%{transform:rotate(-1.6deg)}}
@keyframes hp-bounce{0%{transform:scale(1)}35%{transform:scale(1.07,.95)}70%{transform:scale(.98,1.03)}100%{transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.hp-action,.hp-open .hp-action,.hp-message{transition:none}.hp-water .hp-drop,.hp-plant:hover .hp-foliage,.hp-done .hp-plant svg{animation:none}}
`;
function createOverlay({ ctx, position, onAction, onMoved }) {
  const style = document.createElement("style");
  style.textContent = CSS;
  const box = document.createElement("div");
  box.className = "hp-box";
  box.dataset.hermesPlant = "box";
  const plant = document.createElement("button");
  plant.type = "button";
  plant.className = "hp-plant";
  plant.dataset.hermesPlant = "plant";
  plant.setAttribute("aria-haspopup", "menu");
  plant.setAttribute("aria-expanded", "false");
  const message = document.createElement("div");
  message.className = "hp-message";
  message.setAttribute("role", "status");
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Plant care");
  const drops = [84, 97, 110].map((x, i) => {
    const drop = document.createElement("div");
    drop.className = "hp-drop";
    drop.style.setProperty("--hp-drop-x", `${x}px`);
    drop.style.setProperty("--hp-delay", `${i * 90}ms`);
    return drop;
  });
  let current = { ...DEFAULT_POSITION, ...position };
  let stopMessage = null;
  let stopEffect = null;
  let hint = "";
  const hideMessage = () => {
    stopMessage?.();
    stopMessage = null;
    hint = "";
    message.classList.remove("hp-show");
  };
  const say = (text, ms = MESSAGE_MS) => {
    hideMessage();
    if (!text) return;
    message.textContent = text;
    message.classList.add("hp-show");
    if (ms) stopMessage = ctx.setTimeout(hideMessage, ms);
  };
  const showHint = (text) => {
    if (stopMessage) return;
    say(text, 0);
    hint = text;
  };
  const clearHint = () => {
    if (hint) hideMessage();
  };
  const place2 = () => {
    const x = window.innerWidth - BOX - current.right;
    const y = window.innerHeight - BOX - current.bottom;
    box.style.left = `${Math.min(Math.max(0, x), Math.max(0, window.innerWidth - BOX))}px`;
    box.style.top = `${Math.min(Math.max(TOP_LIMIT, y), Math.max(TOP_LIMIT, window.innerHeight - BOX - BOTTOM_LIMIT))}px`;
  };
  const isOpen = () => box.classList.contains("hp-open");
  const effect = (name) => {
    stopEffect?.();
    box.classList.remove("hp-water", "hp-done");
    void box.offsetWidth;
    box.classList.add(name);
    stopEffect = ctx.setTimeout(() => box.classList.remove(name), 1e3);
  };
  const buttons = ACTIONS2.map((action, i) => {
    const button = document.createElement("button");
    const angle = (-90 + i * 60) * Math.PI / 180;
    const label2 = `${action.label}: ${action.hint}`;
    button.type = "button";
    button.className = "hp-action";
    button.dataset.hermesPlant = action.id;
    button.tabIndex = -1;
    button.innerHTML = action.icon;
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", label2);
    button.style.setProperty("--hp-x", `${Math.round(Math.cos(angle) * RADIUS)}px`);
    button.style.setProperty("--hp-y", `${Math.round(Math.sin(angle) * RADIUS)}px`);
    button.style.setProperty("--hp-delay", `${i * 12}ms`);
    button.addEventListener("pointerenter", () => showHint(label2));
    button.addEventListener("pointerleave", clearHint);
    button.addEventListener("focus", () => showHint(label2));
    button.addEventListener("blur", clearHint);
    button.addEventListener("click", () => {
      toggle(false, true);
      const result = onAction(action.id);
      say(result?.text);
      if (result?.done) effect(action.id === "water" ? "hp-water" : "hp-done");
    });
    button.addEventListener("keydown", (event) => {
      const step = { ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1 }[event.key];
      if (step) {
        event.preventDefault();
        buttons[(i + step + buttons.length) % buttons.length].focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        buttons.at(event.key === "Home" ? 0 : -1).focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        toggle(false, true);
      }
    });
    return button;
  });
  function toggle(open, focusPlant) {
    hideMessage();
    box.classList.toggle("hp-open", open);
    plant.setAttribute("aria-expanded", String(open));
    for (const button of buttons) button.tabIndex = open ? 0 : -1;
    if (open) buttons[0].focus({ preventScroll: true });
    else if (focusPlant) plant.focus({ preventScroll: true });
  }
  let drag = null;
  plant.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    plant.setPointerCapture(event.pointerId);
    drag = { moved: false, x: event.clientX, y: event.clientY, left: box.offsetLeft, top: box.offsetTop };
  });
  plant.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return;
    drag.moved = true;
    current = {
      bottom: window.innerHeight - BOX - (drag.top + dy),
      right: window.innerWidth - BOX - (drag.left + dx)
    };
    place2();
  });
  plant.addEventListener("pointerup", () => {
    const finished = drag;
    drag = null;
    if (finished?.moved) {
      current = {
        bottom: window.innerHeight - BOX - box.offsetTop,
        right: window.innerWidth - BOX - box.offsetLeft
      };
      onMoved(current);
    } else if (finished) {
      toggle(!isOpen(), true);
    }
  });
  plant.addEventListener("pointercancel", () => {
    drag = null;
  });
  plant.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(!isOpen(), true);
    }
  });
  ctx.addEventListener(
    document,
    "pointerdown",
    (event) => {
      if (isOpen() && !box.contains(event.target)) toggle(false, false);
    },
    true
  );
  ctx.addEventListener(window, "resize", place2);
  place2();
  menu.append(...buttons);
  box.append(...drops, plant, menu, message);
  document.body.append(style, box);
  ctx.onDispose(() => {
    box.remove();
    style.remove();
  });
  return {
    effect,
    render(svg, label2) {
      plant.innerHTML = svg;
      plant.title = label2;
      plant.setAttribute("aria-label", `${label2}. Open plant care`);
    },
    say,
    setHidden(hidden) {
      if (hidden) toggle(false, false);
      box.hidden = hidden;
    },
    /** Marks the actions the plant is waiting for with a dot. */
    setNeeds(needs) {
      for (const button of buttons) button.classList.toggle("hp-need", needs.includes(button.dataset.hermesPlant));
    },
    toggleWheel() {
      toggle(!isOpen(), true);
    }
  };
}

// src/plugin.jsx
import { jsx, jsxs } from "react/jsx-runtime";
var ID = "hermes-plant";
var REFRESH_MS = 6e4;
var NOTE_MS = 6e3;
var BACKEND_RETRY_MS = 5 * 6e4;
var KEYBINDS_AREA2 = sdk.KEYBINDS_AREA ?? "keybinds";
var PALETTE_AREA2 = sdk.PALETTE_AREA ?? "palette";
var DEFAULT_KEYS = { wheel: ["mod+alt+h"], water: ["mod+alt+w"] };
var NEED_LINES = {
  repot: "My roots have filled this pot. Repot me and I can keep growing.",
  rotate: "I'm leaning toward the light. Rotate me to straighten up.",
  water: "I'm getting thirsty."
};
function isMainWindow() {
  const query = new URLSearchParams(window.location.search);
  return !query.get("win") && query.get("peer") !== "1" && query.get("watch") !== "1";
}
function createStore(initial) {
  let value = initial;
  const listeners = /* @__PURE__ */ new Set();
  return {
    get: () => value,
    set(change) {
      value = { ...value, ...change };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
var label = (view) => `Houseplant: ${summarize(view)}`;
function Sprout({ store, onToggle }) {
  const { hidden, note, view } = useSyncExternalStore(store.subscribe, store.get);
  const text = note || (hidden || view.mood !== "happy" ? view.mood : "");
  return /* @__PURE__ */ jsxs(
    "button",
    {
      "aria-label": `${label(view)}. ${hidden ? "Show" : "Hide"} plant`,
      "data-hermes-plant": "sprout",
      onClick: onToggle,
      style: { alignItems: "center", background: "none", border: 0, color: "inherit", cursor: "pointer", display: "inline-flex", font: "inherit", gap: 4, maxWidth: 320, padding: 0 },
      title: `${label(view)}. Click to ${hidden ? "show" : "hide"}.`,
      type: "button",
      children: [
        /* @__PURE__ */ jsx("svg", { "aria-hidden": "true", fill: "none", height: "13", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.4", viewBox: "0 0 16 16", width: "13", children: /* @__PURE__ */ jsx("path", { d: "M8 15V7M8 9.5C4.5 9.5 2.5 7 2.5 4 6 4 8 6.5 8 9.5zM8 7c0-3 2-5 5.5-5 0 3-2 5-5.5 5z" }) }),
        text && /* @__PURE__ */ jsx("span", { "aria-live": "polite", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: text })
      ]
    }
  );
}
var plugin_default = {
  id: ID,
  name: "Houseplant",
  description: "A calm houseplant that grows slowly in real time.",
  register(ctx) {
    if (!isMainWindow()) return;
    const start = Date.now();
    let plant = restorePlant(ctx.storage.get("plant", null), start);
    if (!plant) {
      plant = createPlant(start, crypto.getRandomValues(new Uint32Array(1))[0]);
      ctx.storage.set("plant", plant);
    }
    let ui = ctx.storage.get("ui", {});
    if (typeof ui !== "object" || ui === null) ui = {};
    const saveUi = (change) => {
      ui = { ...ui, ...change };
      ctx.storage.set("ui", ui);
    };
    const store = createStore({ hidden: ui.hidden === true, note: "", view: describe(plant, start) });
    let disposed = false;
    let drawn = "";
    let stopNote = null;
    let backend = null;
    let lastTry = 0;
    ctx.onDispose(() => {
      disposed = true;
    });
    const petVisible = () => {
      try {
        return !!ctx.pet?.visible?.get?.();
      } catch {
        return false;
      }
    };
    const statusNote = (text) => {
      stopNote?.();
      store.set({ note: text });
      stopNote = ctx.setTimeout(() => store.set({ note: "" }), NOTE_MS);
    };
    const announce = (text) => {
      if (petVisible()) ctx.pet.say(text, { id: "plant", ttlMs: NOTE_MS });
      else statusNote(text);
    };
    const reply = (text) => {
      if (petVisible()) ctx.pet.say(text, { id: "plant", ttlMs: NOTE_MS });
      else if (store.get().hidden) statusNote(text);
      else overlay.say(text);
    };
    const notice = (view) => {
      const needs = view.needs.join(",");
      if (needs !== (ui.told ?? "")) {
        const told = String(ui.told ?? "").split(",");
        const fresh = view.needs.find((need) => !told.includes(need));
        saveUi({ told: needs });
        if (fresh) announce(view.mood === "droopy" && fresh === "water" ? "I've dried out, so I've stopped growing. Water me." : NEED_LINES[fresh]);
      }
      if (view.stage !== ui.stage) {
        const rank = (name) => STAGES.findIndex((stage) => stage.name === name);
        if (ui.stage && rank(view.stage) > rank(ui.stage)) announce(`I've grown into a ${view.stage}.`);
        saveUi({ stage: view.stage });
      }
    };
    const refresh = () => {
      if (disposed) return;
      const view = describe(plant, Date.now());
      const signature = JSON.stringify([plant.rev, view.nodes, view.mood, view.stage, view.droop.toFixed(2), view.lean.toFixed(2), view.fed, view.pot]);
      if (signature === drawn) return;
      drawn = signature;
      overlay.render(drawPlant(plant, view), label(view));
      overlay.setNeeds(view.needs);
      store.set({ view });
      notice(view);
    };
    const push = async () => {
      if (backend !== true) return;
      try {
        await ctx.rest("/state", { method: "POST", body: { plant } });
      } catch {
        backend = false;
      }
    };
    const pull = async (force) => {
      const time = Date.now();
      if (typeof ctx.rest !== "function" || backend === false && !force && time - lastTry < BACKEND_RETRY_MS) return false;
      lastTry = time;
      try {
        const result = await ctx.rest("/state");
        if (!result?.ok) throw new Error("backend off");
        backend = true;
        if (disposed) return false;
        const remote = restorePlant(result.plant, Date.now());
        if (remote && isNewer(remote, plant)) {
          plant = remote;
          ctx.storage.set("plant", plant);
          refresh();
          return true;
        }
        if (!remote || isNewer(plant, remote)) await push();
      } catch {
        backend = false;
      }
      return false;
    };
    const ask = () => {
      const view = describe(plant, Date.now());
      const needs = view.needs.length ? ` It needs: ${view.needs.join(", ")}.` : "";
      const text = `How is my houseplant doing? Right now it is a ${summarize(view)}, with ${view.waterHours} hours of water left.${needs}`;
      let sent = false;
      try {
        const sessions = [sdk.host?.state?.focusedSessionId?.get?.(), null];
        sent = sessions.some((id) => id !== void 0 && sdk.host.composer.submit(id, text));
      } catch {
        sent = false;
      }
      return { done: sent, message: sent ? "Asked Hermes." : "Open a chat first, then ask again." };
    };
    const run = (id) => {
      if (id === "ask") return ask();
      const result = ACTIONS[id](plant, Date.now());
      if (result.done) {
        plant = result.plant;
        ctx.storage.set("plant", plant);
        refresh();
        void push();
      }
      return result;
    };
    const effect = (id, done) => {
      if (done && id !== "ask" && !store.get().hidden) overlay.effect(id === "water" ? "hp-water" : "hp-done");
    };
    const overlay = createOverlay({
      ctx,
      position: ui.position,
      onMoved: (position) => saveUi({ position }),
      onAction: (id) => {
        const result = run(id);
        if (!petVisible()) return { done: result.done, text: result.message };
        reply(result.message);
        return { done: result.done };
      }
    });
    const setHidden = (hidden) => {
      saveUi({ hidden });
      overlay.setHidden(hidden);
      store.set({ hidden });
    };
    const command = (id) => {
      const result = run(id);
      reply(result.message);
      effect(id, result.done);
    };
    const openWheel = () => {
      if (store.get().hidden) setHidden(false);
      overlay.toggleWheel();
    };
    overlay.setHidden(store.get().hidden);
    refresh();
    const details = {
      feed: () => store.get().view.fed ? "fed" : "not fed",
      repot: () => store.get().view.potName,
      water: () => `${store.get().view.waterHours} h of water left`
    };
    ctx.registerMany([
      { area: sdk.STATUSBAR_AREAS.right, id: "sprout", render: () => /* @__PURE__ */ jsx(Sprout, { onToggle: () => setHidden(!store.get().hidden), store }) },
      {
        area: PALETTE_AREA2,
        id: "palette-wheel",
        data: { id: `${ID}.wheel`, action: `${ID}.wheel`, label: "Houseplant: open care wheel", keywords: ["plant", "houseplant", "garden"], run: openWheel }
      },
      {
        area: PALETTE_AREA2,
        id: "palette-toggle",
        data: {
          id: `${ID}.toggle`,
          label: "Houseplant: show or hide",
          detail: () => store.get().hidden ? "hidden" : "shown",
          detailVariant: "state",
          keepOpen: true,
          keywords: ["plant", "houseplant", "hide", "show"],
          run: () => setHidden(!store.get().hidden)
        }
      },
      ...ACTIONS2.map((action) => ({
        area: PALETTE_AREA2,
        id: `palette-${action.id}`,
        data: {
          id: `${ID}.${action.id}`,
          action: `${ID}.${action.id}`,
          label: `Houseplant: ${action.label.toLowerCase()}`,
          detail: details[action.id],
          keywords: ["plant", "houseplant", action.id],
          run: () => command(action.id)
        }
      })),
      { area: KEYBINDS_AREA2, id: "key-wheel", data: { id: `${ID}.wheel`, category: "view", defaults: DEFAULT_KEYS.wheel, label: "Houseplant: open care wheel", run: openWheel } },
      ...ACTIONS2.map((action) => ({
        area: KEYBINDS_AREA2,
        id: `key-${action.id}`,
        data: { id: `${ID}.${action.id}`, category: "view", defaults: DEFAULT_KEYS[action.id] ?? [], label: `Houseplant: ${action.label.toLowerCase()}`, run: () => command(action.id) }
      }))
    ]);
    ctx.onEvent?.(`plugin.${ID}.changed`, (event) => {
      void pull(true).then((changed) => {
        if (changed) effect(event?.payload?.action, true);
      });
    });
    ctx.setInterval(() => {
      refresh();
      if (document.visibilityState === "visible") void pull(false);
    }, REFRESH_MS);
    ctx.addEventListener(window, "focus", () => {
      refresh();
      void pull(false);
    });
    void pull(true);
  }
};
export {
  plugin_default as default
};
