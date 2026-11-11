// Hermes Plant 1.1.0, built from desktop-src/ (npm ci && npm run build). Do not edit.

// src/plugin.jsx
import { useSyncExternalStore } from "react";
import * as sdk from "@hermes/plugin-sdk";

// src/shape.js
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
var MIN_STEM = 2;
var HABITS = {
  leafy: { every: 1, segment: 4.4, wobble: 0.4, pull: 0.14, shootPull: 0.1, shootEvery: 5, shootAt: 3, maxTips: 6, shootRate: 0.62, turn: 0.95, turnSpan: 0.3, shootVigor: 0.85, cutBack: 2, spread: 0.55 },
  bonsai: { every: 1, segment: 3.3, wobble: 0.7, pull: 0.05, shootPull: 0.02, shootEvery: 4, shootAt: 2, maxTips: 10, shootRate: 0.85, turn: 0.8, turnSpan: 0.5, shootVigor: 0.9, cutBack: 1, spread: 0.7 },
  cactus: { every: 5, segment: 4.8, wobble: 0.1, pull: 0.5, shootPull: 0.5, shootEvery: 3, shootAt: 2, maxTips: 5, shootRate: 0.75, turn: 1.35, turnSpan: 0.15, shootVigor: 0.8, cutBack: 0, spread: 1.2 }
};
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
function grow(stem, rng, habit) {
  const last = stem.segments.at(-1)?.angle ?? stem.angle;
  const count = stem.segments.length;
  stem.segments.push({
    angle: last + (rng() - 0.5) * habit.wobble + (UP - last) * (stem.natural ? habit.shootPull : habit.pull),
    leaf: count > 0 || stem.depth > 0 ? count % 2 ? 1 : -1 : 0,
    leafSize: 0.8 + rng() * 0.45,
    length: habit.segment * stem.vigor * (0.85 + rng() * 0.3)
  });
}
function cutTallest(stems, rng, habit) {
  const tips = stems.filter((stem) => !stem.cut);
  const tallest = tips.reduce((best, stem) => pointOf(stem).y < pointOf(best).y ? stem : best);
  const keep = Math.max(MIN_STEM, tallest.hold, tallest.segments.length - habit.cutBack);
  tallest.segments.length = Math.min(tallest.segments.length, keep);
  tallest.cut = true;
  const angle = tallest.segments.at(-1)?.angle ?? tallest.angle;
  const spread = habit.spread + rng() * 0.25;
  const vigor = Math.max(0.6, tallest.vigor * 0.92);
  grow(addStem(stems, tallest, angle - spread, vigor, tallest.rate, habit === HABITS.cactus), rng, habit);
  grow(addStem(stems, tallest, angle + spread, vigor, tallest.rate, habit === HABITS.cactus), rng, habit);
}
function branching({ seed, cuts }, nodes, habit) {
  const rng = random(seed);
  const stems = [];
  addStem(stems, null, UP + (rng() - 0.5) * 0.24, 1, 1);
  const side = rng() < 0.5 ? -1 : 1;
  const steps = Math.max(1, Math.floor(nodes / habit.every));
  const pending = cuts.map((cut) => Math.floor(cut / habit.every));
  for (let step = 1; step <= steps; step++) {
    const tips = stems.filter((stem2) => !stem2.cut);
    const stem = nextTip(tips);
    grow(stem, rng, habit);
    const count = stem.segments.length;
    if (count % habit.shootEvery === habit.shootAt && tips.length < habit.maxTips) {
      const turn = (Math.floor(count / habit.shootEvery) % 2 ? 1 : -1) * side * (habit.turn + rng() * habit.turnSpan);
      grow(addStem(stems, stem, stem.segments.at(-1).angle + turn, Math.max(0.6, stem.vigor * habit.shootVigor), stem.rate * habit.shootRate, true), rng, habit);
    }
    while (pending[0] <= step) {
      pending.shift();
      cutTallest(stems, rng, habit);
    }
  }
  while (pending.length) {
    pending.shift();
    cutTallest(stems, rng, habit);
  }
  return { side, stems };
}
var FERN_SEGMENT = 4.2;
var MAX_FRONDS = 12;
function fern({ seed, cuts }, nodes) {
  const rng = random(seed);
  const side = rng() < 0.5 ? -1 : 1;
  const count = Math.min(MAX_FRONDS, 3 + Math.floor(nodes / 10) + cuts.length);
  const fronds = [];
  for (let i = 0; i < count; i++) {
    const rank = Math.floor(i / 2) + 1;
    const lean = (i % 2 ? 1 : -1) * side * Math.min(1.05, 0.14 + rank * 0.17 + (rng() - 0.5) * 0.14);
    fronds.push({ angle: UP + lean, at: 0, cut: false, depth: 0, hold: 0, length: 0, parent: null, rate: 1 - i * 0.045, segments: [], sway: 0.06 + rng() * 0.05, vigor: 1 });
  }
  let budget = nodes + 5;
  for (let round = 0; budget > 0 && round < 40; round++) {
    for (const frond of fronds) {
      if (budget <= 0) break;
      if (round < frond.rate * 40 * 0.5 + 2 && frond.length < 13) {
        frond.length++;
        budget--;
      }
    }
  }
  const recent = cuts.filter((cut) => nodes - cut < 6).length;
  const byLength = [...fronds].sort((a, b) => b.length - a.length);
  for (let i = 0; i < Math.min(recent, byLength.length); i++) {
    byLength[i].length = Math.min(byLength[i].length, 2 + i);
    byLength[i].cut = true;
  }
  for (const frond of fronds) {
    let angle = frond.angle;
    const out = Math.cos(frond.angle) < 0 ? -1 : 1;
    for (let i = 0; i < frond.length; i++) {
      angle += out * frond.sway * (0.25 + i * 0.2) + (rng() - 0.5) * 0.05;
      const along = i / Math.max(1, frond.length - 1);
      frond.segments.push({ angle, leaf: i === 0 ? 0 : 2, leafSize: 0.3 + 0.46 * Math.sin(Math.PI * Math.min(1, 0.12 + along * 0.95)), length: FERN_SEGMENT * (1 - along * 0.35) });
    }
  }
  return { side, stems: fronds.filter((frond) => frond.segments.length) };
}
function shape(plant, nodes) {
  if (plant.kind === "fern") return fern(plant, nodes);
  return branching(plant, nodes, HABITS[plant.kind] ?? HABITS.leafy);
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
var LOOKS = {
  leafy: { leaves: 9, cutLeaves: 3, leafSize: 9, out: 1.05, both: false, trunk: 1, taper: 0.7, droop: 1, column: 0 },
  fern: { leaves: 99, cutLeaves: 99, leafSize: 8.5, out: 1.2, both: true, trunk: 0.4, taper: 1, droop: 1, column: 0 },
  bonsai: { leaves: 4, cutLeaves: 2, leafSize: 5.4, out: 1.15, both: true, trunk: 2.5, taper: 0.66, droop: 0.6, column: 0 },
  cactus: { leaves: 0, cutLeaves: 0, leafSize: 0, out: 0, both: false, trunk: 1, taper: 1, droop: 0.22, column: 9 }
};
var LEAF_FORMS = [
  [1, 1],
  [0.86, 1.5],
  [1.22, 0.7]
];
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
var ROUND_LEAF = `<path d="M0 0C1.6-3.6 8.2-3.6 10 0C8.2 3.6 1.6 3.6 0 0Z" fill="${PAPER}"/><path d="M0 0L9 0M3.4 .4L4.4 2.4M6 .4L6.9 2" fill="none"/>`;
var PETAL = "M0 0C-1.7-1.5-1.6-3.8 0-4.2C1.6-3.8 1.7-1.5 0 0Z";
var FLOWER = [0, 72, 144, 216, 288].map((turn) => `<path d="${PETAL}" transform="rotate(${turn})" fill="${PAPER}"/>`).join("") + `<circle r="1" fill="${INK}" stroke="none"/>`;
var BUD = `<path d="M0 0C-1.3-1-1.1-2.7 0-3.3C1.1-2.7 1.3-1 0 0Z" fill="${PAPER}"/><path d="M-.9-.6L0 0L.9-.6" fill="none"/>`;
function place({ side, stems }, view, look) {
  const droop = view.droop * look.droop;
  const lean = view.lean * side;
  const paths = /* @__PURE__ */ new Map();
  const leaves = [];
  const tips = [];
  const lines = [];
  for (const stem of stems) {
    let { x, y } = stem.parent ? paths.get(stem.parent)[stem.at] : { x: 0, y: 0 };
    const points = [{ x, y }];
    const kept = stem.cut ? look.cutLeaves : look.leaves;
    stem.segments.forEach((segment, i) => {
      const height = Math.min(1, -y / 45);
      const outward = Math.abs(Math.cos(segment.angle)) < 0.12 ? side : Math.sign(Math.cos(segment.angle));
      const angle = segment.angle + lean * 0.38 * (0.35 + height) + outward * droop * 0.45 * (0.3 + height);
      x += Math.cos(angle) * segment.length;
      y += Math.sin(angle) * segment.length;
      points.push({ x, y });
      if (segment.leaf && stem.segments.length - i <= kept) {
        for (const turn of look.both || segment.leaf === 2 ? [1, -1] : [segment.leaf]) {
          const out = angle + turn * look.out;
          const toDown = Math.atan2(Math.sin(DOWN - out), Math.cos(DOWN - out));
          leaves.push({ angle: out + toDown * droop * 0.7, size: look.leafSize * segment.leafSize * Math.sqrt(stem.vigor), x, y });
        }
      }
    });
    paths.set(stem, points);
    lines.push({ depth: stem.depth, points, vigor: stem.vigor });
    if (!stem.cut && stem.segments.length) {
      const last = points.at(-1);
      const before = points.at(-2);
      tips.push({ angle: Math.atan2(last.y - before.y, last.x - before.x), x: last.x, y: last.y });
    }
  }
  return { leaves, lines, tips };
}
function bounds({ leaves, lines }, margin = 0) {
  const box = { left: -4, right: 4, top: -4, bottom: 0 };
  const grow2 = (x, y) => {
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  };
  for (const line of lines) {
    for (const p of line.points) {
      grow2(p.x - margin, p.y - margin);
      grow2(p.x + margin, p.y);
    }
  }
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
function drawStems(lines, look, weight, trunk, scale) {
  const parts = lines.map((line) => {
    const width = Math.max(weight * 1.25, trunk * look.trunk * look.taper ** line.depth);
    const d = trail(line.points);
    const hollow = width * scale > 2.3 ? `<path d="${d}" stroke="${PAPER}" stroke-width="${n(width - 1.5 * weight)}"/>` : "";
    return [`<path d="${d}" stroke="${PAPER}" stroke-width="${n(width + 1.3 * weight)}"/>`, `<path d="${d}" stroke-width="${n(width)}"/>${hollow}`];
  });
  return parts.map((part) => part[0]).join("") + parts.map((part) => part[1]).join("");
}
function drawColumns(lines, look, weight) {
  const outer = [];
  const fill = [];
  const ribs = [];
  let spines = "";
  for (const line of lines) {
    const width = look.column * line.vigor;
    const d = trail(line.points);
    const inner = trail(line.depth && line.points.length > 2 ? line.points.slice(1) : line.points);
    outer.push(`<path d="${d}" stroke-width="${n(width)}"/>`);
    fill.push(`<path d="${d}" stroke="${PAPER}" stroke-width="${n(width - 2 * weight)}"/>`);
    ribs.push(`<path d="${inner}" stroke-width="${n(width * 0.42)}"/><path d="${inner}" stroke="${PAPER}" stroke-width="${n(width * 0.42 - 1.3 * weight)}"/>`);
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1];
      const b = line.points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      for (const t of [0.3, 0.8]) {
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        for (const way of [1, -1]) {
          const edge = width / 2 * way;
          spines += `M${n(x - uy * edge)} ${n(y + ux * edge)}l${n(-uy * way * 1.5 + ux * 0.8)} ${n(ux * way * 1.5 + uy * 0.8)}`;
        }
      }
    }
  }
  return outer.join("") + fill.join("") + ribs.join("") + `<path d="${spines}" stroke-width="${n(weight * 0.8)}"/>`;
}
function drawPlant(plant, view, uid = "hp") {
  const look = LOOKS[plant.kind] ?? LOOKS.leafy;
  const laid = place(shape(plant, view.nodes), view, look);
  const box = bounds(laid, look.column ? look.column / 2 + 1.6 : 0);
  const { top } = drawPot(0, view.pot);
  const room = top + 1 - TOP;
  const scale = Math.min(MAX_SCALE, (VIEW - 2 * SIDE) / (box.right - box.left), room / Math.max(1, -box.top));
  const half = POT_SHAPES[view.pot].width / 2 + 5;
  const cx = Math.min(VIEW - half, Math.max(half, Math.min(VIEW - SIDE - box.right * scale, Math.max(SIDE - box.left * scale, VIEW / 2))));
  const pot = drawPot(cx, view.pot);
  const limp = view.droop > 0.35;
  const weight = LINE / scale;
  const trunk = (1.3 + Math.min(1.4, view.nodes / 30)) / scale;
  const stems = look.column ? drawColumns(laid.lines, look, weight) : drawStems(laid.lines, look, weight, trunk, scale);
  const [long, wide] = plant.kind === "leafy" ? LEAF_FORMS[plant.seed % LEAF_FORMS.length] : plant.kind === "fern" ? [1, 0.6] : [1, 1];
  const leaves = laid.leaves.map((leaf) => {
    const size = leaf.size / 10;
    const flip = Math.cos(leaf.angle) < 0 ? -1 : 1;
    const kind = limp ? "limp" : plant.kind === "bonsai" ? "round" : plant.kind === "fern" || leaf.size * scale < SMALL_BELOW ? "small" : "leaf";
    return `<use href="#${uid}-${kind}" transform="translate(${n(leaf.x)} ${n(leaf.y)}) rotate(${n(leaf.angle * 180 / Math.PI)}) scale(${n(size * long)} ${n(size * wide * flip)})" stroke-width="${n(weight / size)}"/>`;
  }).join("");
  let tips = "";
  if (view.show !== "none" && plant.kind !== "fern") {
    const kind = view.show === "bud" ? "bud" : "flower";
    const size = (view.fed ? 1.15 : 1) * Math.min(1.2, 0.72 / scale + 0.35) * (look.column ? 1.5 : 1);
    const lift = look.column / 2;
    tips = laid.tips.slice(0, MAX_FLOWERS).map((tip) => `<use href="#${uid}-${kind}" transform="translate(${n(tip.x + Math.cos(tip.angle) * lift)} ${n(tip.y + Math.sin(tip.angle) * lift)}) rotate(${n(tip.angle * 180 / Math.PI + 90)}) scale(${n(size)})" stroke-width="${n(weight / size)}"/>`).join("");
  }
  const sparkle = (x, y, r) => `M${n(x)} ${n(y - r)}v${n(2 * r)}M${n(x - r)} ${n(y)}h${n(2 * r)}`;
  const fed = view.fed ? `<path d="${sparkle(cx - half - 1, pot.top - 6, 2)}${sparkle(cx + half + 2, pot.top - 13, 1.4)}" fill="none" stroke-width="0.8"/>` : "";
  const reach = Math.max(cx - (cx + box.left * scale), cx + box.right * scale - cx, half) * 2 + 4;
  const frame = Math.min(VIEW, Math.max(MIN_FRAME, VIEW - (pot.top + 1 + box.top * scale) + 3, reach));
  const frameX = Math.min(VIEW - frame, Math.max(0, cx - frame / 2));
  const highest = laid.tips.reduce((best, tip) => tip.y < best.y ? tip : best, { x: 0, y: box.top / 2 });
  const tipX = (cx + highest.x * scale - frameX) / frame;
  const tipY = (pot.top + 1 + highest.y * scale - (VIEW - frame)) / frame;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(frameX)} ${n(VIEW - frame)} ${n(frame)} ${n(frame)}" width="100%" height="100%" aria-hidden="true" data-tip-x="${tipX.toFixed(3)}" data-tip-y="${tipY.toFixed(3)}" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"><defs><g id="${uid}-leaf">${LEAF}</g><g id="${uid}-small">${SMALL_LEAF}</g><g id="${uid}-limp">${LIMP_LEAF}</g><g id="${uid}-round">${ROUND_LEAF}</g><g id="${uid}-flower">${FLOWER}</g><g id="${uid}-bud">${BUD}</g></defs>` + pot.back + `<g class="hp-foliage"><g transform="translate(${n(cx)} ${n(pot.top + 1)}) scale(${Math.round(scale * 1e3) / 1e3})" fill="none">${stems}${leaves}${tips}</g></g>` + pot.front + fed + "</svg>";
}
function drawSample(kind, uid) {
  const plant = { kind, seed: 21, cuts: kind === "bonsai" ? [14] : [] };
  return drawPlant(plant, { droop: 0, fed: false, lean: 0, nodes: 30, pot: 1, show: kind === "fern" ? "none" : "full" }, uid);
}

// src/engine.js
var HOUR = 36e5;
var DAY = 24 * HOUR;
var DROOP_FULL_MS = 3 * DAY;
var FED_MS = 2 * DAY;
var FEED_BOOST_MS = 8 * HOUR;
var LEAN_MS = 10 * DAY;
var LEAN_NOTICE = 0.6;
var REPOT_READY = 0.8;
var PICK_MS = 2 * DAY;
var BASE_NODES = 4;
var NODE_RATE = 12;
var MAX_NODES = 72;
var MAX_CUTS = 240;
var MAX_PLANTS = 6;
var MAX_FERTILIZER = 9;
var START_COINS = 20;
var START_FERTILIZER = 2;
var FERTILIZER_PRICE = 8;
var WATER_COINS = 2;
var BUG_COINS = 2;
var PICK_COINS = 12;
var BUG_MIN_MS = 3 * HOUR;
var BUG_SPAN_MS = 6 * HOUR;
var KINDS = {
  leafy: { name: "leafy plant", price: 15, hydrated: 3 * DAY, thirsty: DAY, rate: 100, worth: 100, clip: 2, last: "flowering" },
  fern: { name: "fern", price: 25, hydrated: 2 * DAY, thirsty: 12 * HOUR, rate: 130, worth: 120, clip: 2, last: "lush" },
  cactus: { name: "cactus", price: 40, hydrated: 9 * DAY, thirsty: 2 * DAY, rate: 60, worth: 220, clip: 4, last: "flowering" },
  bonsai: { name: "little tree", price: 60, hydrated: 4 * DAY, thirsty: DAY, rate: 80, worth: 300, clip: 5, last: "blossoming" }
};
var KIND_IDS = ["leafy", "fern", "cactus", "bonsai"];
var POTS = [
  { name: "seedling pot", days: 1 },
  { name: "small pot", days: 4 },
  { name: "medium pot", days: 10 },
  { name: "large pot", days: null }
];
var STAGES = [
  { name: "seedling", days: 0 },
  { name: "young", days: 1 },
  { name: "grown", days: 4 },
  { name: null, days: 10 }
];
var own = (table, key) => typeof key === "string" && Object.hasOwn(table, key) ? table[key] : void 0;
var clamp = (value, low, high) => Math.min(high, Math.max(low, value));
var nodesAt = (growthMs) => Math.min(MAX_NODES, BASE_NODES + Math.floor(NODE_RATE * Math.sqrt(growthMs / DAY)));
var potFor = (growthMs) => POTS.findIndex((pot) => pot.days === null || growthMs < pot.days * DAY);
var stageOf = (growthMs) => STAGES.findLastIndex((stage) => growthMs >= stage.days * DAY);
var plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
function newPlant(id, kind, seed, now) {
  return {
    id,
    kind,
    seed: seed >>> 0,
    plantedAt: now,
    updatedAt: now,
    hydratedUntil: now + KINDS[kind].hydrated,
    growthMs: 0,
    cuts: [],
    fedUntil: 0,
    leanAt: 0,
    turnedAt: now,
    pot: 0,
    pickedAt: 0
  };
}
var nextBug = (seed, rev, now) => now + BUG_MIN_MS + (Math.imul(rev, 2654435761) + seed >>> 0) % BUG_SPAN_MS;
function createGarden(now, seed) {
  const base = seed >>> 0;
  return {
    v: 3,
    rev: 1,
    seed: base,
    updatedAt: now,
    coins: START_COINS,
    fertilizer: START_FERTILIZER,
    bugAt: nextBug(base, 1, now),
    nextId: 2,
    plants: [newPlant(1, "leafy", base, now)]
  };
}
function fromV1(raw) {
  if (raw?.v !== 1 || !Array.isArray(raw.cuts) || !Number.isFinite(raw.growthMs)) return raw;
  const old = (growthMs) => BASE_NODES + Math.floor(6 * Math.sqrt(growthMs / DAY));
  return {
    ...raw,
    v: 2,
    rev: 1,
    cuts: raw.cuts.map((node) => Number.isInteger(node) ? old(Math.max(0, node - BASE_NODES) * 12 * HOUR) : node),
    fedUntil: 0,
    leanAt: 0,
    turnedAt: raw.updatedAt,
    pot: 0
  };
}
function fromSinglePlant(input) {
  const raw = fromV1(input);
  if (raw?.v !== 2 || !Array.isArray(raw.cuts) || !Number.isFinite(raw.growthMs) || raw.growthMs < 0) return raw;
  const seed = Number.isFinite(raw.seed) ? raw.seed >>> 0 : 0;
  const rev = Number.isFinite(raw.rev) ? raw.rev : 1;
  return {
    v: 3,
    rev,
    seed,
    updatedAt: raw.updatedAt,
    coins: START_COINS,
    fertilizer: START_FERTILIZER,
    bugAt: nextBug(seed, Math.floor(rev), Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0),
    nextId: 2,
    plants: [
      {
        ...raw,
        id: 1,
        kind: "leafy",
        cuts: raw.cuts.map((node) => Number.isInteger(node) && node > BASE_NODES ? BASE_NODES + 2 * (node - BASE_NODES) : node),
        pot: potFor(raw.growthMs),
        pickedAt: 0
      }
    ]
  };
}
function restorePlant(raw, now) {
  const kind = own(KINDS, raw?.kind);
  if (!kind || !Number.isInteger(raw.id) || raw.id < 1) return null;
  if (!Array.isArray(raw.cuts) || raw.cuts.length > MAX_CUTS) return null;
  const numbers = [raw.seed, raw.plantedAt, raw.updatedAt, raw.hydratedUntil, raw.growthMs, raw.fedUntil, raw.leanAt, raw.turnedAt, raw.pickedAt];
  if (!numbers.every(Number.isFinite)) return null;
  if (!Number.isInteger(raw.pot) || raw.pot < 0 || raw.pot >= POTS.length) return null;
  if (raw.growthMs < 0 || !raw.cuts.every((n2) => Number.isInteger(n2) && n2 >= 0)) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    seed: raw.seed >>> 0,
    plantedAt: Math.min(raw.plantedAt, now),
    updatedAt: Math.min(raw.updatedAt, now),
    hydratedUntil: Math.min(raw.hydratedUntil, now + kind.hydrated),
    growthMs: Math.floor(raw.growthMs),
    cuts: [...raw.cuts].sort((a, b) => a - b),
    fedUntil: Math.min(raw.fedUntil, now + FED_MS),
    leanAt: clamp(raw.leanAt, -1, 1),
    turnedAt: Math.min(raw.turnedAt, now),
    pot: raw.pot,
    pickedAt: Math.min(raw.pickedAt, now)
  };
}
function restoreGarden(input, now) {
  const raw = fromSinglePlant(input);
  if (raw?.v !== 3 || !Array.isArray(raw.plants) || raw.plants.length < 1 || raw.plants.length > MAX_PLANTS) return null;
  if (![raw.rev, raw.seed, raw.updatedAt, raw.coins, raw.fertilizer, raw.bugAt, raw.nextId].every(Number.isFinite)) return null;
  if (raw.rev < 1 || raw.coins < 0 || raw.fertilizer < 0 || raw.bugAt < 0) return null;
  const plants = raw.plants.map((plant) => restorePlant(plant, now));
  if (plants.includes(null) || new Set(plants.map((plant) => plant.id)).size !== plants.length) return null;
  return {
    v: 3,
    rev: Math.floor(raw.rev),
    seed: raw.seed >>> 0,
    updatedAt: Math.min(raw.updatedAt, now),
    coins: Math.floor(raw.coins),
    fertilizer: Math.min(MAX_FERTILIZER, Math.floor(raw.fertilizer)),
    bugAt: Math.min(raw.bugAt, now + BUG_MIN_MS + BUG_SPAN_MS),
    nextId: Math.max(Math.floor(raw.nextId), ...plants.map((plant) => plant.id + 1)),
    plants
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
  const gain = Math.floor((span + Math.floor(fed / 2)) * KINDS[plant.kind].rate / 100);
  const growthMs = Math.min(potLimit(plant), plant.growthMs + gain);
  return { ...plant, growthMs: Math.max(plant.growthMs, growthMs), updatedAt: Math.max(plant.updatedAt, now) };
}
var leanOf = (plant, now) => clamp(plant.leanAt + Math.max(0, now - plant.turnedAt) / LEAN_MS, -1, 1);
var nodeCount = (plant) => nodesAt(plant.growthMs);
function valueOf(plant) {
  const base = 5 + 20 * stageOf(plant.growthMs) + Math.floor(4 * plant.growthMs / DAY);
  return Math.floor(base * KINDS[plant.kind].worth / 100);
}
var canPick = (plant, now) => stageOf(plant.growthMs) === 3 && now < plant.hydratedUntil && now - plant.pickedAt >= PICK_MS;
function water(plant, now) {
  const kind = KINDS[plant.kind];
  const wasThirsty = plant.hydratedUntil - now <= kind.thirsty;
  const days = kind.hydrated / DAY;
  return { change: { hydratedUntil: now + kind.hydrated }, coins: wasThirsty ? WATER_COINS : 0, done: true, message: `Watered. Good for ${plural(days, "day")}.` };
}
function prune(plant) {
  const nodes = nodeCount(plant);
  if (plant.cuts.length >= MAX_CUTS || plant.cuts.at(-1) >= nodes) return { done: false, message: "Nothing new to prune yet." };
  return { change: { cuts: [...plant.cuts, nodes] }, coins: KINDS[plant.kind].clip, done: true, message: "Pruned. New shoots will branch from the cut." };
}
function rotate(plant, now) {
  return { change: { leanAt: -leanOf(plant, now), turnedAt: now }, done: true, message: "Turned the pot. It will straighten up." };
}
function feed(plant, now, garden) {
  if (now < plant.fedUntil) return { done: false, message: "Still using the last fertilizer." };
  if (garden.fertilizer < 1) return { done: false, message: "No fertilizer left. The shop sells it." };
  const boost = Math.floor(FEED_BOOST_MS * KINDS[plant.kind].rate / 100);
  return {
    change: { fedUntil: now + FED_MS, growthMs: Math.min(potLimit(plant), plant.growthMs + boost) },
    done: true,
    fertilizer: -1,
    message: "Fertilized. A burst of growth now, and faster growth for two days."
  };
}
function repot(plant) {
  if (plant.pot >= POTS.length - 1) return { done: false, message: "Already in the largest pot." };
  if (plant.growthMs < REPOT_READY * potLimit(plant)) return { done: false, message: "The roots still have room." };
  return { change: { pot: plant.pot + 1 }, done: true, message: `Moved to the ${POTS[plant.pot + 1].name}.` };
}
function pick(plant, now) {
  if (stageOf(plant.growthMs) < 3) return { done: false, message: "Nothing to pick until it is fully grown." };
  if (now >= plant.hydratedUntil) return { done: false, message: "Too dry to pick from. Water it first." };
  if (now - plant.pickedAt < PICK_MS) return { done: false, message: "Picked not long ago. Give it two days." };
  return { change: { pickedAt: now }, coins: Math.floor(PICK_COINS * KINDS[plant.kind].worth / 100), done: true, message: "Picked and sold." };
}
var CARE = { feed, pick, prune, repot, rotate, water };
var CARE_ACTIONS = ["water", "prune", "rotate", "feed", "repot", "pick"];
var ACTIONS = [...CARE_ACTIONS, "sell", "buy", "shoo"];
var SHOP_ITEMS = [...KIND_IDS, "fertilizer"];
function choose(garden, action, now) {
  const plants = garden.plants.map((plant) => settle(plant, now));
  const best = (score) => plants.reduce((found, plant, i) => score(plant) > score(plants[found]) ? i : found, 0);
  const first = (test) => Math.max(0, plants.findIndex(test));
  if (action === "water") return best((plant) => -(plant.hydratedUntil - now));
  if (action === "prune") return best((plant) => nodeCount(plant) - (plant.cuts.at(-1) ?? 0));
  if (action === "rotate") return best((plant) => leanOf(plant, now));
  if (action === "feed") return first((plant) => now >= plant.fedUntil && now < plant.hydratedUntil);
  if (action === "repot") return first((plant) => plant.pot < POTS.length - 1 && plant.growthMs >= REPOT_READY * potLimit(plant));
  if (action === "pick") return first((plant) => canPick(plant, now));
  return -1;
}
function bugOn(garden, now) {
  if (now < garden.bugAt) return null;
  return garden.plants[Math.floor(garden.bugAt / 6e4) % garden.plants.length].id;
}
var fail = (garden, message, plant = null) => ({ garden, done: false, message, coins: 0, plant });
var commit = (garden, now, change) => {
  const rev = garden.rev + 1;
  return { ...garden, ...change, rev, updatedAt: Math.max(garden.updatedAt, now) };
};
function buy(garden, item, now) {
  if (item === "fertilizer") {
    if (garden.fertilizer >= MAX_FERTILIZER) return fail(garden, "The shelf is full of fertilizer already.");
    if (garden.coins < FERTILIZER_PRICE) return fail(garden, `Fertilizer costs ${FERTILIZER_PRICE} coins. You have ${garden.coins}.`);
    return { garden: commit(garden, now, { coins: garden.coins - FERTILIZER_PRICE, fertilizer: garden.fertilizer + 1 }), done: true, message: "Bought one fertilizer.", coins: -FERTILIZER_PRICE, plant: null };
  }
  const kind = own(KINDS, item);
  if (!kind) return fail(garden, `The shop sells: ${SHOP_ITEMS.join(", ")}.`);
  if (garden.plants.length >= MAX_PLANTS) return fail(garden, "The garden is full. Sell a plant to make room.");
  if (garden.coins < kind.price) return fail(garden, `A ${kind.name} costs ${kind.price} coins. You have ${garden.coins}.`);
  const id = garden.nextId;
  const seed = Math.imul(id, 2654435761) + garden.seed >>> 0;
  const plants = [...garden.plants, newPlant(id, item, seed, now)];
  return { garden: commit(garden, now, { coins: garden.coins - kind.price, nextId: id + 1, plants }), done: true, message: `Planted a ${kind.name}.`, coins: -kind.price, plant: id };
}
function sell(garden, index, now) {
  if (garden.plants.length < 2) return fail(garden, "This is your only plant. Keep it.", garden.plants[index].id);
  const plant = settle(garden.plants[index], now);
  const coins = valueOf(plant);
  const plants = garden.plants.filter((_, i) => i !== index);
  return { garden: commit(garden, now, { coins: garden.coins + coins, plants }), done: true, message: `Sold the ${KINDS[plant.kind].name} for ${plural(coins, "coin")}.`, coins, plant: plant.id };
}
function shoo(garden, now) {
  const plant = bugOn(garden, now);
  if (plant === null) return fail(garden, "No bugs about.");
  const next = commit(garden, now, { coins: garden.coins + BUG_COINS });
  next.bugAt = nextBug(garden.seed, next.rev, now);
  return { garden: next, done: true, message: `Shooed the bug away. +${plural(BUG_COINS, "coin")}.`, coins: BUG_COINS, plant };
}
function tend(garden, action, now, { plant: id = null, item = null } = {}) {
  if (action === "buy") return buy(garden, item, now);
  if (action === "shoo") return shoo(garden, now);
  if (action !== "sell" && !own(CARE, action)) return fail(garden, `Actions are: ${ACTIONS.join(", ")}.`);
  if (action === "sell" && id === null) return fail(garden, "Say which plant to sell.");
  const index = id === null ? choose(garden, action, now) : garden.plants.findIndex((plant) => plant.id === id);
  if (index < 0) return fail(garden, "There is no such plant.");
  if (action === "sell") return sell(garden, index, now);
  const settled = settle(garden.plants[index], now);
  const result = CARE[action](settled, now, garden);
  if (!result.done) return fail(garden, result.message, settled.id);
  const coins = result.coins ?? 0;
  const plants = garden.plants.map((plant, i) => i === index ? { ...settled, ...result.change } : plant);
  const change = { coins: garden.coins + coins, fertilizer: garden.fertilizer + (result.fertilizer ?? 0), plants };
  const message = coins ? `${result.message} +${plural(coins, "coin")}.` : result.message;
  return { garden: commit(garden, now, change), done: true, message, coins, plant: settled.id };
}
function describePlant(plant, now) {
  const kind = KINDS[plant.kind];
  const settled = settle(plant, now);
  const days = settled.growthMs / DAY;
  const left = plant.hydratedUntil - now;
  const limit = potLimit(settled);
  const rootBound = settled.growthMs >= limit;
  const lean = leanOf(plant, now);
  const dry = left <= 0;
  const thirsty = left <= kind.thirsty;
  const stage = stageOf(settled.growthMs);
  const mood = dry ? "droopy" : thirsty ? "thirsty" : rootBound ? "root-bound" : lean >= LEAN_NOTICE ? "leaning" : "happy";
  const needs = [];
  if (thirsty) needs.push("water");
  if (rootBound) needs.push("repot");
  if (lean >= LEAN_NOTICE) needs.push("rotate");
  const stageName = STAGES[stage].name ?? kind.last;
  return {
    id: plant.id,
    kind: plant.kind,
    kindName: kind.name,
    canPick: canPick(settled, now),
    canPrune: settled.cuts.length < MAX_CUTS && !(settled.cuts.at(-1) >= nodeCount(settled)),
    canRepot: settled.pot < POTS.length - 1 && settled.growthMs >= REPOT_READY * limit,
    days,
    droop: dry ? 0.2 + 0.8 * Math.min(1, -left / DROOP_FULL_MS) : thirsty ? 0.1 : 0,
    fed: now < plant.fedUntil,
    growing: !dry && !rootBound,
    lean,
    mood,
    name: `${stageName} ${kind.name}`,
    needs,
    nodes: nodeCount(settled),
    pot: settled.pot,
    potName: POTS[settled.pot].name,
    // A fully grown plant shows what it has made, then buds while it makes more.
    show: stage < 3 || dry ? "none" : now - plant.pickedAt >= PICK_MS && !thirsty ? "full" : "bud",
    stage,
    stageName,
    value: valueOf(settled),
    waterHours: Math.max(0, Math.round(left / HOUR))
  };
}
function describe(garden, now) {
  const plants = garden.plants.map((plant) => describePlant(plant, now));
  return {
    bug: bugOn(garden, now),
    coins: garden.coins,
    fertilizer: garden.fertilizer,
    needy: plants.filter((plant) => plant.needs.length).length,
    plants,
    room: MAX_PLANTS - plants.length
  };
}
var MOODS = {
  droopy: "dry and drooping, growth paused",
  happy: "happy",
  leaning: "leaning toward the light",
  "root-bound": "root-bound, growth paused",
  thirsty: "getting thirsty"
};
var summarizePlant = (view) => `${view.name} in a ${view.potName}, ${MOODS[view.mood]}`;
function summarize(view) {
  const plants = view.plants.map((plant, i) => `${i + 1}. ${summarizePlant(plant)}`).join("; ");
  const bug = view.bug === null ? "" : " A bug is sitting on one of them.";
  return `${plural(view.plants.length, "plant")}, ${plural(view.coins, "coin")}, ${view.fertilizer} fertilizer. ${plants}.${bug}`;
}

// src/overlay.js
var HEIGHT = 200;
var EDGE = 100;
var RADIUS = 78;
var TOP_LIMIT = 56;
var BOTTOM_LIMIT = 20;
var DEFAULT_POSITION = { right: 8, bottom: 72 };
var DRAG_START = 5;
var MESSAGE_MS = 2600;
var ARMED_MS = 4e3;
var sizes = (count) => count <= 3 ? { plant: 96, step: 82 } : { plant: 78, step: 64 };
var icon = (path) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
var ACTIONS2 = [
  { id: "water", label: "Water", hint: (view) => `lasts ${KINDS[view.kind].hydrated / 864e5} days`, icon: icon('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>') },
  { id: "prune", label: "Prune", hint: () => "cut the tallest tip, earn coins", icon: icon('<circle cx="6" cy="18" r="2.5"/><circle cx="6" cy="6" r="2.5"/><path d="M8 7.5 20 18M8 16.5 20 6"/>') },
  { id: "rotate", label: "Rotate", hint: () => "turn it to the light", icon: icon('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 3v5h-5"/>') },
  { id: "feed", label: "Fertilize", hint: (view, garden) => `a burst of growth, ${garden.fertilizer} left`, icon: icon('<path d="M8 8h8l2 12H6z"/><path d="M9 8 8 4h8l-1 4"/><path d="M10 13h4"/>') },
  { id: "repot", label: "Repot", hint: () => "a bigger pot, more room", icon: icon('<path d="M6 11h12l-1.5 9h-9z"/><path d="M4.5 8h15v3h-15z"/><path d="M12 8V4M12 4l-2 2M12 4l2 2"/>') },
  { id: "pick", label: "Pick", hint: () => "sell what it has grown", icon: icon('<circle cx="12" cy="8" r="2"/><path d="M12 6V3.5M14 8h2.5M12 10v2.5M10 8H7.5M12 12.5V21M12 17c-3 0-4.5-1.5-4.5-4M12 19c3 0 4.5-1.5 4.5-4"/>') },
  { id: "sell", label: "Sell", hint: (view) => `the whole plant, for ${view.value} coins`, icon: icon('<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8M12 16v1.5"/>') },
  { id: "ask", label: "Ask Hermes", hint: () => "sends a chat message", icon: icon('<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>') }
];
var TRAITS = {
  leafy: "Easy. Water every 3 days.",
  fern: "Fast and thirsty. Water every 2 days.",
  cactus: "Slow. Water every 9 days. Sells well.",
  bonsai: "A slow little tree. Sells best."
};
var COIN = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 5v6" stroke-linecap="round"/></svg>';
var SCISSORS = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><g class="hp-blade-a" stroke="${INK}"><path d="M12 12 21 6.5M12 12 8 14.5"/><circle cx="6" cy="16" r="2.5" fill="${PAPER}"/></g><g class="hp-blade-b" stroke="${INK}"><path d="M12 12 21 17.5M12 12 8 9.5"/><circle cx="6" cy="8" r="2.5" fill="${PAPER}"/></g></svg>`;
var CLIPPING = `<svg viewBox="-1 -4 12 8" width="16" height="11" stroke="${INK}" stroke-width="1" stroke-linejoin="round" aria-hidden="true"><path d="M0 0C2.5-3 7-2.6 10 0C7.5 2.4 3 3 0 0Z" fill="${PAPER}"/><path d="M0 0L9 0" fill="none"/></svg>`;
var BUG = `<svg viewBox="0 0 20 20" width="20" height="20" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M4 7 1.5 5M4 11H1M4.5 14.5 2 16.5M16 7l2.5-2M16 11h3M15.5 14.5 18 16.5M8 4.5 6.5 2M12 4.5 13.5 2" fill="none"/><ellipse cx="10" cy="11" rx="5.5" ry="6.2" fill="${PAPER}"/><path d="M10 5v12" fill="none"/><path d="M5.5 7.5a5.5 4 0 0 1 9 0z" fill="${INK}"/><circle cx="7.5" cy="11" r="1.1" fill="${INK}" stroke="none"/><circle cx="12.5" cy="12.5" r="1.1" fill="${INK}" stroke="none"/><circle cx="8" cy="14.5" r=".9" fill="${INK}" stroke="none"/></svg>`;
var CSS = `
.hp-box{position:fixed;height:${HEIGHT}px;z-index:60;pointer-events:none;font-family:inherit;color:${INK}}
.hp-box[hidden]{display:none}
.hp-plant{position:absolute;top:calc(${HEIGHT / 2}px - var(--hp-size) / 2);width:var(--hp-size);height:var(--hp-size);margin-left:calc(var(--hp-size) / -2);padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;pointer-events:auto;touch-action:none;user-select:none}
.hp-plant svg{display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))}
.hp-plant:focus-visible,.hp-action:focus-visible,.hp-purse:focus-visible,.hp-buy:focus-visible,.hp-bug:focus-visible{outline:2px solid ${INK};outline-offset:2px;box-shadow:0 0 0 2px ${PAPER}}
.hp-foliage{transform-box:fill-box;transform-origin:50% 100%}
.hp-plant:hover .hp-foliage{animation:hp-sway 2.8s ease-in-out infinite}
.hp-plant.hp-done svg{animation:hp-bounce 420ms ease-out 1}
.hp-plant.hp-grow svg{animation:hp-grow 700ms cubic-bezier(.2,.8,.2,1) 1}
.hp-plant.hp-new svg{animation:hp-new 520ms cubic-bezier(.2,.8,.2,1) 1}
.hp-plant.hp-cut .hp-foliage{animation:hp-shiver 420ms ease-out 180ms 1}
.hp-plant.hp-needy::after{content:"";position:absolute;right:14%;top:8%;width:9px;height:9px;border-radius:50%;background:${INK};border:2px solid ${PAPER};animation:hp-pulse 2.4s ease-in-out infinite}
.hp-menu{position:absolute;top:${HEIGHT / 2}px;width:0;height:0}
.hp-action{position:absolute;left:-21px;top:-21px;display:flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border-radius:50%;border:1.5px solid ${INK};background:${PAPER};color:${INK};box-shadow:0 1px 5px rgba(0,0,0,.3);cursor:pointer;opacity:0;visibility:hidden;pointer-events:none;transform:scale(.6);transition:transform 180ms cubic-bezier(.2,.8,.2,1) var(--hp-delay),opacity 140ms linear var(--hp-delay),visibility 0s linear 200ms,background-color 100ms linear,color 100ms linear}
.hp-open .hp-action{opacity:1;visibility:visible;pointer-events:auto;transform:translate(var(--hp-x),var(--hp-y)) scale(1);transition:transform 180ms cubic-bezier(.2,.8,.2,1) var(--hp-delay),opacity 140ms linear var(--hp-delay),visibility 0s,background-color 100ms linear,color 100ms linear}
.hp-action:hover,.hp-action:focus-visible,.hp-action.hp-armed{background:${INK};color:${PAPER}}
.hp-action.hp-off{opacity:.45}
.hp-open .hp-action.hp-off{opacity:.45}
.hp-need::after{content:"";position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;background:${INK};border:2px solid ${PAPER}}
.hp-message{position:absolute;top:-26px;transform:translateX(-50%);max-width:min(440px,calc(100vw - 16px));padding:2px 9px;border-radius:999px;border:1.5px solid ${INK};background:${PAPER};color:${INK};font-size:11px;font-weight:600;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity 140ms linear}
.hp-message.hp-show{opacity:1}
.hp-purse{position:absolute;top:${HEIGHT / 2 + 16}px;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px 0 7px;border-radius:999px;border:1.5px solid ${INK};background:${PAPER};color:${INK};font:inherit;font-size:11px;font-weight:700;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.3);cursor:pointer;pointer-events:auto}
.hp-purse:hover,.hp-purse[aria-expanded="true"]{background:${INK};color:${PAPER}}
.hp-purse.hp-paid{animation:hp-bounce 420ms ease-out 1}
.hp-shop{position:absolute;right:0;bottom:${HEIGHT / 2 + 58}px;width:268px;max-width:calc(100vw - 16px);padding:10px;border-radius:12px;border:1.5px solid ${INK};background:${PAPER};color:${INK};box-shadow:0 4px 18px rgba(0,0,0,.35);font-size:12px;line-height:1.35;pointer-events:auto;opacity:0;visibility:hidden;transform:translateY(6px);transition:opacity 140ms linear,transform 160ms ease-out,visibility 0s linear 160ms}
.hp-shop.hp-below{bottom:auto;top:${HEIGHT / 2 + 58}px}
.hp-shopping .hp-shop{opacity:1;visibility:visible;transform:none;transition:opacity 140ms linear,transform 160ms ease-out,visibility 0s}
.hp-shop-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-weight:700;font-size:13px}
.hp-shop-coins{display:inline-flex;align-items:center;gap:4px}
.hp-row{display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid rgba(23,23,224,.18)}
.hp-row svg{flex:none}
.hp-sample{flex:none;width:40px;height:40px}
.hp-row-text{flex:1;min-width:0}
.hp-row-name{font-weight:700;text-transform:capitalize}
.hp-row-trait{opacity:.8;font-size:11px}
.hp-buy{flex:none;display:inline-flex;align-items:center;gap:3px;min-width:46px;justify-content:center;height:26px;padding:0 8px;border-radius:999px;border:1.5px solid ${INK};background:${PAPER};color:${INK};font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.hp-buy:hover{background:${INK};color:${PAPER}}
.hp-buy[aria-disabled="true"]{opacity:.45}
.hp-shop-note{margin-top:6px;padding-top:6px;border-top:1px solid rgba(23,23,224,.18);font-size:11px;min-height:15px}
.hp-drop{position:absolute;top:44px;width:6px;height:8px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;border:1.5px solid ${INK};background:${PAPER};opacity:0;animation:hp-fall 640ms ease-in var(--hp-delay) 1}
.hp-float{position:absolute;transform:translateX(-50%);padding:0 6px;border-radius:999px;background:${INK};color:${PAPER};font-size:11px;font-weight:700;line-height:16px;white-space:nowrap;animation:hp-rise 1100ms ease-out 1 forwards}
.hp-snip{position:absolute;width:26px;height:26px;margin:-13px 0 0 -23px;animation:hp-snip 620ms ease-out 1 forwards}
.hp-snip .hp-blade-a,.hp-snip .hp-blade-b{transform-origin:12px 12px;animation:hp-blade-a 300ms ease-in 120ms 1 both}
.hp-snip .hp-blade-b{animation-name:hp-blade-b}
.hp-clip{position:absolute;width:16px;height:11px;margin:-5px 0 0 -8px;opacity:0;animation:hp-clip 900ms ease-in 380ms 1 forwards}
.hp-bug{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;padding:0;border:0;background:transparent;cursor:pointer;pointer-events:auto;animation:hp-crawl 2.6s ease-in-out infinite}
.hp-bug[hidden]{display:none}
.hp-bug svg{display:block;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
.hp-flown{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;animation:hp-fly 700ms ease-in 1 forwards}
@keyframes hp-fall{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(46px)}}
@keyframes hp-sway{0%,100%{transform:rotate(0deg)}30%{transform:rotate(1.6deg)}70%{transform:rotate(-1.6deg)}}
@keyframes hp-shiver{0%,100%{transform:rotate(0deg)}20%{transform:rotate(3deg)}45%{transform:rotate(-2.4deg)}70%{transform:rotate(1.2deg)}}
@keyframes hp-bounce{0%{transform:scale(1)}35%{transform:scale(1.07,.95)}70%{transform:scale(.98,1.03)}100%{transform:scale(1)}}
@keyframes hp-grow{0%{transform:scale(1)}30%{transform:scale(.94,1.12)}60%{transform:scale(1.06,.97)}100%{transform:scale(1)}}
@keyframes hp-new{0%{transform:scale(.2);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes hp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
@keyframes hp-rise{0%{opacity:0;margin-top:6px}15%{opacity:1}75%{opacity:1}100%{opacity:0;margin-top:-22px}}
@keyframes hp-snip{0%{opacity:0;transform:translateX(-10px)}18%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateX(-4px)}}
@keyframes hp-blade-a{0%{transform:rotate(-16deg)}100%{transform:rotate(9deg)}}
@keyframes hp-blade-b{0%{transform:rotate(16deg)}100%{transform:rotate(-9deg)}}
@keyframes hp-clip{0%{opacity:1;transform:none}100%{opacity:0;transform:translate(14px,58px) rotate(150deg)}}
@keyframes hp-crawl{0%,100%{transform:translate(0,0) rotate(-8deg)}25%{transform:translate(3px,-2px) rotate(6deg)}50%{transform:translate(5px,1px) rotate(14deg)}75%{transform:translate(1px,2px) rotate(-2deg)}}
@keyframes hp-fly{0%{opacity:1;transform:none}100%{opacity:0;transform:translate(46px,-70px) rotate(40deg) scale(.6)}}
@media (prefers-reduced-motion: reduce){.hp-action,.hp-open .hp-action,.hp-message,.hp-shop,.hp-shopping .hp-shop{transition:none}.hp-plant:hover .hp-foliage,.hp-plant svg,.hp-plant .hp-foliage,.hp-plant.hp-needy::after,.hp-bug,.hp-purse.hp-paid{animation:none!important}.hp-drop,.hp-snip,.hp-clip,.hp-flown{display:none}.hp-float{animation-duration:1ms;animation-delay:1500ms;animation-fill-mode:both}}
`;
var make = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  if (tag === "button") node.type = "button";
  return node;
};
function createOverlay({ ctx, position, onAction, onMoved }) {
  const style = make("style");
  style.textContent = CSS;
  const box = make("div", "hp-box");
  box.dataset.hermesPlant = "box";
  const message = make("div", "hp-message");
  message.setAttribute("role", "status");
  const menu = make("div", "hp-menu");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Plant care");
  const purse = make("button", "hp-purse");
  purse.dataset.hermesPlant = "purse";
  purse.setAttribute("aria-haspopup", "dialog");
  purse.setAttribute("aria-expanded", "false");
  const bug = make("button", "hp-bug", BUG);
  bug.dataset.hermesPlant = "bug";
  bug.setAttribute("aria-label", "A bug is on this plant. Shoo it away for coins");
  bug.title = "Shoo the bug away";
  bug.hidden = true;
  const shop = make("div", "hp-shop");
  shop.dataset.hermesPlant = "shop";
  shop.setAttribute("role", "dialog");
  shop.setAttribute("aria-label", "Garden shop");
  const shopCoins = make("span", "hp-shop-coins");
  const shopHead = make("div", "hp-shop-head", "<span>Garden shop</span>");
  shopHead.append(shopCoins);
  const shopNote = make("div", "hp-shop-note");
  shopNote.setAttribute("role", "status");
  let current = { ...DEFAULT_POSITION, ...position };
  let garden = { bug: null, coins: 0, fertilizer: 0, plants: [], room: 0 };
  let active = null;
  let armed = null;
  let stopMessage = null;
  let stopArmed = null;
  let hint = "";
  const plants = /* @__PURE__ */ new Map();
  const viewOf = (id) => garden.plants.find((plant) => plant.id === id);
  const width = () => 2 * EDGE + Math.max(0, garden.plants.length - 1) * sizes(garden.plants.length).step;
  const centerOf = (id) => {
    const index = Math.max(0, garden.plants.findIndex((plant) => plant.id === id));
    return width() - EDGE - index * sizes(garden.plants.length).step;
  };
  const anchor = () => viewOf(active) ? active : garden.plants[0]?.id;
  const place2 = () => {
    const wide = width();
    const x = window.innerWidth - wide - current.right;
    const y = window.innerHeight - HEIGHT - current.bottom;
    const top = Math.min(Math.max(TOP_LIMIT, y), Math.max(TOP_LIMIT, window.innerHeight - HEIGHT - BOTTOM_LIMIT));
    box.style.width = `${wide}px`;
    box.style.left = `${Math.min(Math.max(0, x), Math.max(0, window.innerWidth - wide))}px`;
    box.style.top = `${top}px`;
    shop.classList.toggle("hp-below", top < 330);
  };
  const hideMessage = () => {
    stopMessage?.();
    stopMessage = null;
    hint = "";
    message.classList.remove("hp-show");
  };
  const say = (text, id = anchor(), ms = MESSAGE_MS) => {
    hideMessage();
    if (!text) return;
    message.textContent = text;
    message.classList.add("hp-show");
    const half = message.offsetWidth / 2 + 6;
    const low = half - box.offsetLeft;
    message.style.left = `${Math.max(low, Math.min(centerOf(id), window.innerWidth - half - box.offsetLeft))}px`;
    if (ms) stopMessage = ctx.setTimeout(hideMessage, ms);
  };
  const showHint = (text) => {
    if (stopMessage) return;
    say(text, active, 0);
    hint = text;
  };
  const clearHint = () => {
    if (hint) hideMessage();
  };
  const disarm = () => {
    stopArmed?.();
    stopArmed = null;
    armed = null;
    for (const button of buttons) button.classList.remove("hp-armed");
  };
  const isOpen = () => box.classList.contains("hp-open");
  const isShopping = () => box.classList.contains("hp-shopping");
  const flash = (node, x, y, ms) => {
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    box.append(node);
    ctx.setTimeout(() => node.remove(), ms);
  };
  const pulse = (node, name, ms = 1e3) => {
    if (!node) return;
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
    ctx.setTimeout(() => node.classList.remove(name), ms);
  };
  const floatCoins = (coins, x, y) => {
    if (!coins) return;
    const node = make("div", "hp-float");
    node.textContent = `${coins > 0 ? "+" : "\u2212"}${Math.abs(coins)}`;
    flash(node, x, y, 1200);
  };
  const tipOf = (id) => {
    const entry = plants.get(id);
    const size = sizes(garden.plants.length).plant;
    const tip = entry?.lastTip ?? { x: 0.5, y: 0.2 };
    return { x: centerOf(id) - size / 2 + tip.x * size, y: HEIGHT / 2 - size / 2 + tip.y * size };
  };
  const effect = (action, id, coins = 0) => {
    const entry = plants.get(id);
    const x = entry ? centerOf(id) : purse.offsetLeft - purse.offsetWidth / 2;
    const size = sizes(garden.plants.length).plant;
    if (action === "water" && entry) {
      ;
      [-13, 0, 13].forEach((dx, i) => {
        const drop = make("div", "hp-drop");
        drop.style.setProperty("--hp-delay", `${i * 90}ms`);
        flash(drop, x + dx - 3, HEIGHT / 2 - size / 2 - 8, 900);
      });
      pulse(entry.button, "hp-done");
    } else if (action === "prune" && entry) {
      const tip = tipOf(id);
      flash(make("div", "hp-snip", SCISSORS), tip.x, tip.y, 700);
      flash(make("div", "hp-clip", CLIPPING), tip.x, tip.y, 1400);
      pulse(entry.button, "hp-cut");
    } else if (action === "shoo" && bug.dataset.x) {
      flash(make("div", "hp-flown", BUG), Number(bug.dataset.x), Number(bug.dataset.y), 800);
    } else if (action === "buy" && entry) {
      pulse(entry.button, "hp-new");
    } else if (action === "feed" || action === "repot" || action === "grow") {
      pulse(entry?.button, "hp-grow");
    } else if (entry) {
      pulse(entry.button, "hp-done");
    }
    if (coins) {
      floatCoins(coins, entry && action !== "buy" ? x : purse.offsetLeft - purse.offsetWidth / 2, entry && action !== "buy" ? HEIGHT / 2 - size / 2 - 6 : HEIGHT / 2 - 6);
      pulse(purse, "hp-paid");
    }
  };
  const perform = (action, options) => {
    const result = onAction(action, options) ?? {};
    if (result.done) effect(action, result.plant ?? options.plant, result.coins);
    return result;
  };
  const labelOf = (action) => {
    const view = viewOf(active);
    return view ? `${action.label}: ${action.hint(view, garden)}` : action.label;
  };
  const buttons = ACTIONS2.map((action, i) => {
    const button = make("button", "hp-action", action.icon);
    const angle = (-90 + i * 360 / ACTIONS2.length) * Math.PI / 180;
    button.dataset.hermesPlant = action.id;
    button.tabIndex = -1;
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", action.label);
    button.style.setProperty("--hp-x", `${Math.round(Math.cos(angle) * RADIUS)}px`);
    button.style.setProperty("--hp-y", `${Math.round(Math.sin(angle) * RADIUS)}px`);
    button.style.setProperty("--hp-delay", `${i * 10}ms`);
    button.addEventListener("pointerenter", () => showHint(labelOf(action)));
    button.addEventListener("pointerleave", clearHint);
    button.addEventListener("focus", () => showHint(labelOf(action)));
    button.addEventListener("blur", clearHint);
    button.addEventListener("click", () => {
      const id = active;
      if (action.id === "sell" && armed !== id && garden.plants.length > 1) {
        disarm();
        armed = id;
        button.classList.add("hp-armed");
        stopArmed = ctx.setTimeout(disarm, ARMED_MS);
        say(`Sell for ${viewOf(id)?.value ?? 0} coins? Press again.`, id, ARMED_MS);
        return;
      }
      disarm();
      toggle(false, action.id !== "sell");
      const result = perform(action.id, { plant: id });
      say(result.text, result.done && action.id === "sell" ? anchor() : id);
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
  const markWheel = () => {
    const view = viewOf(active);
    if (!view) return;
    const wanted = [...view.needs, ...view.canPick ? ["pick"] : [], ...view.canRepot ? ["repot"] : []];
    const off = {
      feed: view.fed || garden.fertilizer < 1,
      pick: !view.canPick,
      prune: !view.canPrune,
      repot: !view.canRepot,
      sell: garden.plants.length < 2
    };
    for (const button of buttons) {
      button.classList.toggle("hp-need", wanted.includes(button.dataset.hermesPlant));
      button.classList.toggle("hp-off", !!off[button.dataset.hermesPlant]);
    }
  };
  function toggle(open, focusPlant, id = active) {
    hideMessage();
    disarm();
    if (open) {
      toggleShop(false);
      active = viewOf(id) ? id : anchor();
      menu.style.left = `${centerOf(active)}px`;
      markWheel();
    }
    box.classList.toggle("hp-open", open);
    for (const [plantId, entry] of plants) entry.button.setAttribute("aria-expanded", String(open && plantId === active));
    for (const button of buttons) button.tabIndex = open ? 0 : -1;
    if (open) buttons[0].focus({ preventScroll: true });
    else if (focusPlant) plants.get(active)?.button.focus({ preventScroll: true });
  }
  const rows = [...KIND_IDS, "fertilizer"].map((item) => {
    const kind = KINDS[item];
    const row = make("div", "hp-row");
    const picture = kind ? make("div", "hp-sample", drawSample(item, `hps-${item}`)) : make("div", "hp-sample", `<svg viewBox="0 0 24 24" width="40" height="40" fill="${PAPER}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M8 9h8l2 11H6z"/><path d="M9 9 8 5h8l-1 4"/><path d="M10 14h4M12 12v4" fill="none"/></svg>`);
    const text = make("div", "hp-row-text");
    const name = make("div", "hp-row-name");
    name.textContent = kind ? kind.name : "fertilizer";
    const trait = make("div", "hp-row-trait");
    trait.textContent = kind ? TRAITS[item] : "";
    text.append(name, trait);
    const price = kind ? kind.price : FERTILIZER_PRICE;
    const buy2 = make("button", "hp-buy", `${COIN}<span>${price}</span>`);
    buy2.dataset.hermesPlant = `buy-${item}`;
    buy2.setAttribute("aria-label", `Buy ${kind ? `a ${kind.name}` : "one fertilizer"} for ${price} coins`);
    buy2.addEventListener("click", () => {
      const result = perform("buy", { item });
      shopNote.textContent = result.message ?? result.text ?? "";
    });
    row.append(picture, text, buy2);
    return { buy: buy2, item, price, row, trait };
  });
  const markShop = () => {
    shopCoins.innerHTML = `${COIN}<span>${garden.coins}</span>`;
    for (const row of rows) {
      const full = row.item === "fertilizer" ? garden.fertilizer >= MAX_FERTILIZER : garden.room < 1;
      row.buy.setAttribute("aria-disabled", String(full || garden.coins < row.price));
      if (row.item === "fertilizer") row.trait.textContent = `A burst of growth. You have ${garden.fertilizer}.`;
    }
  };
  function toggleShop(open) {
    if (open === isShopping()) return;
    if (open) {
      toggle(false, false);
      shopNote.textContent = garden.room < 1 ? "The garden is full. Sell a plant to make room." : "Coins come from pruning, picking, bugs and watering a thirsty plant.";
      markShop();
    }
    box.classList.toggle("hp-shopping", open);
    purse.setAttribute("aria-expanded", String(open));
    if (open) rows[0].buy.focus({ preventScroll: true });
  }
  purse.addEventListener("click", () => toggleShop(!isShopping()));
  shop.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    toggleShop(false);
    purse.focus({ preventScroll: true });
  });
  bug.addEventListener("click", () => {
    const result = perform("shoo", {});
    say(result.text, result.plant);
  });
  let drag = null;
  const makePlant = (id) => {
    const button = make("button", "hp-plant");
    button.dataset.hermesPlant = "plant";
    button.dataset.plantId = String(id);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      button.setPointerCapture(event.pointerId);
      drag = { moved: false, x: event.clientX, y: event.clientY, left: box.offsetLeft, top: box.offsetTop };
    });
    button.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return;
      drag.moved = true;
      current = { bottom: window.innerHeight - HEIGHT - (drag.top + dy), right: window.innerWidth - width() - (drag.left + dx) };
      place2();
    });
    button.addEventListener("pointerup", () => {
      const finished = drag;
      drag = null;
      if (finished?.moved) {
        current = { bottom: window.innerHeight - HEIGHT - box.offsetTop, right: window.innerWidth - width() - box.offsetLeft };
        onMoved(current);
      } else if (finished) {
        toggle(!(isOpen() && active === id), true, id);
      }
    });
    button.addEventListener("pointercancel", () => {
      drag = null;
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle(!(isOpen() && active === id), true, id);
      }
    });
    return button;
  };
  ctx.addEventListener(
    document,
    "pointerdown",
    (event) => {
      if (box.contains(event.target)) return;
      if (isOpen()) toggle(false, false);
      toggleShop(false);
    },
    true
  );
  ctx.addEventListener(window, "resize", place2);
  shop.append(shopHead, ...rows.map((row) => row.row), shopNote);
  menu.append(...buttons);
  box.append(purse, menu, bug, message, shop);
  document.body.append(style, box);
  place2();
  ctx.onDispose(() => {
    box.remove();
    style.remove();
  });
  return {
    effect,
    /** `view` is what `describe` returns. `drawings` maps a plant id to `{ svg, label }`. */
    render(view, drawings) {
      garden = view;
      const size = sizes(view.plants.length);
      box.style.setProperty("--hp-size", `${size.plant}px`);
      for (const [id, entry] of plants) {
        if (viewOf(id)) continue;
        entry.button.remove();
        plants.delete(id);
      }
      for (const plant of view.plants) {
        let entry = plants.get(plant.id);
        if (!entry) {
          entry = { button: makePlant(plant.id), lastTip: null, svg: "" };
          plants.set(plant.id, entry);
          box.insertBefore(entry.button, menu);
        }
        const drawing = drawings.get(plant.id);
        if (drawing && drawing.svg !== entry.svg) {
          const old = entry.button.firstElementChild;
          entry.lastTip = old ? { x: Number(old.dataset.tipX), y: Number(old.dataset.tipY) } : null;
          entry.button.innerHTML = drawing.svg;
          entry.svg = drawing.svg;
          entry.button.title = drawing.label;
          entry.button.setAttribute("aria-label", `${drawing.label}. Open plant care`);
        }
        entry.button.style.left = `${centerOf(plant.id)}px`;
        entry.button.classList.toggle("hp-needy", plant.needs.length > 0);
      }
      if (!viewOf(active)) {
        if (isOpen()) toggle(false, false);
        active = view.plants[0]?.id ?? null;
      }
      const left = centerOf(view.plants.at(-1)?.id) - size.plant / 2;
      purse.innerHTML = `${COIN}<span>${view.coins}</span>`;
      purse.style.left = `${left + 6 - purse.offsetWidth}px`;
      purse.title = `${view.coins} coins. Open the garden shop`;
      purse.setAttribute("aria-label", `${view.coins} coins. Open the garden shop`);
      bug.hidden = view.bug === null;
      if (view.bug !== null) {
        bug.dataset.x = String(centerOf(view.bug) + size.plant * 0.16);
        bug.dataset.y = String(HEIGHT / 2 - size.plant * 0.08);
        bug.style.left = `${bug.dataset.x}px`;
        bug.style.top = `${bug.dataset.y}px`;
      }
      menu.style.left = `${centerOf(active)}px`;
      markWheel();
      markShop();
      place2();
    },
    say,
    setHidden(hidden) {
      if (hidden) {
        toggle(false, false);
        toggleShop(false);
      }
      box.hidden = hidden;
    },
    toggleShop() {
      toggleShop(!isShopping());
    },
    /** Opens or closes the care wheel, on plant `id` or on the last plant used. */
    toggleWheel(id = anchor()) {
      toggle(!(isOpen() && active === id), true, id);
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
  repot: (name) => `The ${name} has filled its pot. Repot it and it can keep growing.`,
  rotate: (name) => `The ${name} is leaning toward the light. Rotate it to straighten up.`,
  water: (name) => `The ${name} is getting thirsty.`
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
var label = (view) => `Garden: ${view.plants.length === 1 ? summarizePlant(view.plants[0]) : `${view.plants.length} plants`}, ${view.coins} coins`;
function Sprout({ store, onToggle }) {
  const { hidden, note, view } = useSyncExternalStore(store.subscribe, store.get);
  const waiting = view.needy ? view.plants.length === 1 ? view.plants[0].mood : `${view.needy} need care` : view.bug !== null ? "a bug!" : "";
  const text = note || waiting;
  return /* @__PURE__ */ jsxs(
    "button",
    {
      "aria-label": `${label(view)}. ${hidden ? "Show" : "Hide"} garden`,
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
  description: "A calm little garden that grows in real time.",
  register(ctx) {
    if (!isMainWindow()) return;
    const start = Date.now();
    let garden = restoreGarden(ctx.storage.get("garden", null), start) ?? restoreGarden(ctx.storage.get("plant", null), start);
    if (!garden) garden = createGarden(start, crypto.getRandomValues(new Uint32Array(1))[0]);
    ctx.storage.set("garden", garden);
    let ui = ctx.storage.get("ui", {});
    if (typeof ui !== "object" || ui === null) ui = {};
    const saveUi = (change) => {
      ui = { ...ui, ...change };
      ctx.storage.set("ui", ui);
    };
    const store = createStore({ hidden: ui.hidden === true, note: "", view: describe(garden, start) });
    const drawn = /* @__PURE__ */ new Map();
    let disposed = false;
    let lastSignature = "";
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
    const reply = (text, plant) => {
      if (petVisible()) ctx.pet.say(text, { id: "plant", ttlMs: NOTE_MS });
      else if (store.get().hidden) statusNote(text);
      else overlay.say(text, plant);
    };
    const notice = (view2) => {
      const told = typeof ui.told === "object" && ui.told !== null ? ui.told : {};
      const stages = typeof ui.stages === "object" && ui.stages !== null ? ui.stages : {};
      const nextTold = {};
      const nextStages = {};
      let line = "";
      for (const plant of view2.plants) {
        const before = String(told[plant.id] ?? "").split(",");
        const fresh = plant.needs.find((need) => !before.includes(need));
        nextTold[plant.id] = plant.needs.join(",");
        nextStages[plant.id] = plant.stage;
        if (fresh && !line) line = plant.mood === "droopy" && fresh === "water" ? `The ${plant.kindName} has dried out and stopped growing. Water it.` : NEED_LINES[fresh](plant.kindName);
        if (stages[plant.id] !== void 0 && plant.stage > stages[plant.id]) {
          line ||= `The ${plant.kindName} has grown. It is now a ${plant.name}.`;
          if (!store.get().hidden) overlay.effect("grow", plant.id);
        }
      }
      if (view2.bug !== null && ui.bugAt !== garden.bugAt) {
        const plant = view2.plants.find((item) => item.id === view2.bug);
        line ||= `A bug has landed on the ${plant.kindName}. Click it away for coins.`;
      }
      const changed = JSON.stringify([nextTold, nextStages]) !== JSON.stringify([told, stages]) || view2.bug !== null && ui.bugAt !== garden.bugAt;
      if (changed) saveUi({ bugAt: view2.bug !== null ? garden.bugAt : ui.bugAt, stages: nextStages, told: nextTold });
      if (line) announce(line);
    };
    const refresh = () => {
      if (disposed) return;
      const view2 = describe(garden, Date.now());
      const drawings = /* @__PURE__ */ new Map();
      for (const [id] of drawn) if (!view2.plants.some((plant) => plant.id === id)) drawn.delete(id);
      view2.plants.forEach((plant, i) => {
        const record = garden.plants[i];
        const signature2 = JSON.stringify([record.cuts.length, plant.nodes, plant.droop.toFixed(2), plant.lean.toFixed(2), plant.fed, plant.pot, plant.show]);
        let drawing = drawn.get(plant.id);
        if (drawing?.signature !== signature2) {
          drawing = { signature: signature2, svg: drawPlant(record, plant, `hp${plant.id}`) };
          drawn.set(plant.id, drawing);
        }
        drawings.set(plant.id, { label: `${summarizePlant(plant)}. Sells for ${plant.value} coins`, svg: drawing.svg });
      });
      const signature = JSON.stringify([garden.rev, view2.bug, view2.plants.map((plant) => [drawn.get(plant.id).signature, plant.mood, plant.stage, plant.needs, plant.canPick, plant.canPrune, plant.canRepot, plant.value])]);
      if (signature === lastSignature) return;
      lastSignature = signature;
      overlay.render(view2, drawings);
      store.set({ view: view2 });
      notice(view2);
    };
    const save = (next) => {
      garden = next;
      ctx.storage.set("garden", garden);
    };
    const push = async () => {
      if (backend !== true) return;
      try {
        await ctx.rest("/state", { method: "POST", body: { garden } });
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
        const remote = restoreGarden(result.garden, Date.now());
        if (remote && isNewer(remote, garden)) {
          save(remote);
          refresh();
          return true;
        }
        if (!remote || isNewer(garden, remote)) await push();
      } catch {
        backend = false;
      }
      return false;
    };
    const ask = (plant) => {
      const view2 = describe(garden, Date.now());
      const one = view2.plants.find((item) => item.id === plant);
      const subject = one && view2.plants.length > 1 ? ` I am asking about plant ${view2.plants.indexOf(one) + 1}, the ${one.kindName}.` : "";
      const text = `How is my garden doing? Right now: ${summarize(view2)}${subject}`;
      let sent = false;
      try {
        const sessions = [sdk.host?.state?.focusedSessionId?.get?.(), null];
        sent = sessions.some((id) => id !== void 0 && sdk.host.composer.submit(id, text));
      } catch {
        sent = false;
      }
      return { coins: 0, done: sent, message: sent ? "Asked Hermes." : "Open a chat first, then ask again.", plant: plant ?? null };
    };
    const run = (action, options = {}) => {
      if (action === "ask") return ask(options.plant);
      const result = tend(garden, action, Date.now(), options);
      if (result.done) {
        save(result.garden);
        refresh();
        void push();
      }
      return result;
    };
    const overlay = createOverlay({
      ctx,
      position: ui.position,
      onMoved: (position) => saveUi({ position }),
      onAction: (action, options) => {
        const result = run(action, options);
        const shown = { coins: result.coins, done: result.done, message: result.message, plant: result.plant };
        if (!petVisible() || action === "buy") return { ...shown, text: result.message };
        reply(result.message, result.plant);
        return shown;
      }
    });
    const setHidden = (hidden) => {
      saveUi({ hidden });
      overlay.setHidden(hidden);
      store.set({ hidden });
    };
    const command = (action) => {
      const result = run(action);
      reply(result.message, result.plant);
      if (result.done && action !== "ask" && !store.get().hidden) overlay.effect(action, result.plant, result.coins);
    };
    const show = () => {
      if (store.get().hidden) setHidden(false);
    };
    const openWheel = () => {
      show();
      overlay.toggleWheel();
    };
    const openShop = () => {
      show();
      overlay.toggleShop();
    };
    overlay.setHidden(store.get().hidden);
    refresh();
    const view = () => store.get().view;
    const details = {
      feed: () => `${view().fertilizer} fertilizer`,
      pick: () => view().plants.some((plant) => plant.canPick) ? "ready" : "nothing ready",
      repot: () => view().plants.some((plant) => plant.canRepot) ? "ready" : "not needed",
      water: () => `${Math.min(...view().plants.map((plant) => plant.waterHours))} h of water left`
    };
    const commands = [
      ...ACTIONS2.filter((action) => CARE_ACTIONS.includes(action.id) || action.id === "ask").map((action) => ({ id: action.id, label: action.label.toLowerCase(), run: () => command(action.id) })),
      { id: "shoo", label: "shoo the bug away", run: () => command("shoo") },
      { id: "shop", label: "open the shop", run: openShop }
    ];
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
          label: "Houseplant: show or hide the garden",
          detail: () => store.get().hidden ? "hidden" : "shown",
          detailVariant: "state",
          keepOpen: true,
          keywords: ["plant", "houseplant", "garden", "hide", "show"],
          run: () => setHidden(!store.get().hidden)
        }
      },
      ...commands.map((item) => ({
        area: PALETTE_AREA2,
        id: `palette-${item.id}`,
        data: {
          id: `${ID}.${item.id}`,
          action: `${ID}.${item.id}`,
          label: `Houseplant: ${item.label}`,
          detail: details[item.id] ?? (item.id === "shop" ? () => `${view().coins} coins` : void 0),
          keywords: ["plant", "houseplant", "garden", item.id],
          run: item.run
        }
      })),
      { area: KEYBINDS_AREA2, id: "key-wheel", data: { id: `${ID}.wheel`, category: "view", defaults: DEFAULT_KEYS.wheel, label: "Houseplant: open care wheel", run: openWheel } },
      ...commands.map((item) => ({
        area: KEYBINDS_AREA2,
        id: `key-${item.id}`,
        data: { id: `${ID}.${item.id}`, category: "view", defaults: DEFAULT_KEYS[item.id] ?? [], label: `Houseplant: ${item.label}`, run: item.run }
      }))
    ]);
    ctx.onEvent?.(`plugin.${ID}.changed`, (event) => {
      void pull(true).then((changed) => {
        const action = event?.payload?.action;
        if (!changed || store.get().hidden || !CARE_ACTIONS.includes(action)) return;
        const touched = garden.plants.reduce((best, plant) => plant.updatedAt > best.updatedAt ? plant : best);
        overlay.effect(action, touched.id);
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
