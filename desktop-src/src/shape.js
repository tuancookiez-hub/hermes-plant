// How each species grows into a shape. This is drawing logic only: the rules in engine.js decide how
// many nodes a plant has and where it was cut, and this file replays that into stems. The same seed,
// node count and cuts always give the same shape.

function random(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UP = -Math.PI / 2
const MIN_STEM = 2

/**
 * `every` nodes of the plant make one segment. `pull` is how hard a stem turns back upward, `wobble`
 * how much it wanders, and a side shoot starts every `shootEvery` segments until there are `maxTips`.
 */
const HABITS = {
  leafy: { every: 1, segment: 4.4, wobble: 0.4, pull: 0.14, shootPull: 0.1, shootEvery: 5, shootAt: 3, maxTips: 6, shootRate: 0.62, turn: 0.95, turnSpan: 0.3, shootVigor: 0.85, cutBack: 2, spread: 0.55 },
  bonsai: { every: 1, segment: 3.3, wobble: 0.7, pull: 0.05, shootPull: 0.02, shootEvery: 4, shootAt: 2, maxTips: 10, shootRate: 0.85, turn: 0.8, turnSpan: 0.5, shootVigor: 0.9, cutBack: 1, spread: 0.7 },
  cactus: { every: 5, segment: 4.8, wobble: 0.1, pull: 0.5, shootPull: 0.5, shootEvery: 3, shootAt: 2, maxTips: 5, shootRate: 0.75, turn: 1.35, turnSpan: 0.15, shootVigor: 0.8, cutBack: 0, spread: 1.2 }
}

/** Shares growth between the tips in proportion to their rates, so side shoots stay shorter. */
function nextTip(tips) {
  let total = 0
  let best = tips[0]
  for (const tip of tips) {
    tip.credit += tip.rate
    total += tip.rate
    if (tip.credit > best.credit) best = tip
  }
  best.credit -= total
  return best
}

function addStem(stems, parent, angle, vigor, rate, natural = false) {
  const at = parent ? parent.segments.length : 0
  const stem = { angle, at, credit: 0, cut: false, depth: parent ? parent.depth + 1 : 0, hold: 0, natural, parent, rate, segments: [], vigor }
  if (parent) parent.hold = at
  stems.push(stem)
  return stem
}

/** Where a stem is after `count` segments (all of them by default). Up is negative y. */
export function pointOf(stem, count = stem.segments.length) {
  let { x, y } = stem.parent ? pointOf(stem.parent, stem.at) : { x: 0, y: 0 }
  for (let i = 0; i < count; i++) {
    x += Math.cos(stem.segments[i].angle) * stem.segments[i].length
    y += Math.sin(stem.segments[i].angle) * stem.segments[i].length
  }
  return { x, y }
}

function grow(stem, rng, habit) {
  const last = stem.segments.at(-1)?.angle ?? stem.angle
  const count = stem.segments.length
  stem.segments.push({
    angle: last + (rng() - 0.5) * habit.wobble + (UP - last) * (stem.natural ? habit.shootPull : habit.pull),
    leaf: count > 0 || stem.depth > 0 ? (count % 2 ? 1 : -1) : 0,
    leafSize: 0.8 + rng() * 0.45,
    length: habit.segment * stem.vigor * (0.85 + rng() * 0.3)
  })
}

/** Cuts one live tip: the `pick`-th in the order they grew, or the tallest when `pick` is -1. */
function cutTip(stems, rng, habit, pick) {
  const tips = stems.filter(stem => !stem.cut)
  const tallest = pick >= 0 ? tips[pick % tips.length] : tips.reduce((best, stem) => (pointOf(stem).y < pointOf(best).y ? stem : best))
  const keep = Math.max(MIN_STEM, tallest.hold, tallest.segments.length - habit.cutBack)
  tallest.segments.length = Math.min(tallest.segments.length, keep)
  tallest.cut = true
  const angle = tallest.segments.at(-1)?.angle ?? tallest.angle
  const spread = habit.spread + rng() * 0.25
  const vigor = Math.max(0.6, tallest.vigor * 0.92)
  grow(addStem(stems, tallest, angle - spread, vigor, tallest.rate, habit === HABITS.cactus), rng, habit)
  grow(addStem(stems, tallest, angle + spread, vigor, tallest.rate, habit === HABITS.cactus), rng, habit)
}

/** A plant left alone grows tall with a few side shoots. Each cut stops one tip and starts two more. */
function branching({ seed, cuts, picks }, nodes, habit) {
  const rng = random(seed)
  const stems = []
  addStem(stems, null, UP + (rng() - 0.5) * 0.24, 1, 1)
  const side = rng() < 0.5 ? -1 : 1
  const steps = Math.max(1, Math.floor(nodes / habit.every))
  const pending = cuts.map((cut, i) => ({ at: Math.floor(cut / habit.every), pick: picks?.[i] ?? -1 }))
  for (let step = 1; step <= steps; step++) {
    const tips = stems.filter(stem => !stem.cut)
    const stem = nextTip(tips)
    grow(stem, rng, habit)
    const count = stem.segments.length
    if (count % habit.shootEvery === habit.shootAt && tips.length < habit.maxTips) {
      const turn = (Math.floor(count / habit.shootEvery) % 2 ? 1 : -1) * side * (habit.turn + rng() * habit.turnSpan)
      grow(addStem(stems, stem, stem.segments.at(-1).angle + turn, Math.max(0.6, stem.vigor * habit.shootVigor), stem.rate * habit.shootRate, true), rng, habit)
    }
    while (pending[0]?.at <= step) cutTip(stems, rng, habit, pending.shift().pick)
  }
  while (pending.length) cutTip(stems, rng, habit, pending.shift().pick)
  return { side, stems }
}

const FERN_SEGMENT = 4.2
const MAX_FRONDS = 12

/**
 * A fern has no trunk. Fronds rise from the crown and arch outward under their own weight. Each cut
 * takes a frond back to a stub (the chosen one, or the longest) and adds a new one, so a pruned fern
 * is fuller and lower.
 */
function fern({ seed, cuts, picks }, nodes) {
  const rng = random(seed)
  const side = rng() < 0.5 ? -1 : 1
  const count = Math.min(MAX_FRONDS, 3 + Math.floor(nodes / 10) + cuts.length)
  const fronds = []
  for (let i = 0; i < count; i++) {
    // Fronds alternate sides and fan wider as more are added. The oldest stand nearest the middle.
    const rank = Math.floor(i / 2) + 1
    const lean = (i % 2 ? 1 : -1) * side * Math.min(1.05, 0.14 + rank * 0.17 + (rng() - 0.5) * 0.14)
    fronds.push({ angle: UP + lean, at: 0, cut: false, depth: 0, hold: 0, length: 0, parent: null, rate: 1 - i * 0.045, segments: [], sway: 0.06 + rng() * 0.05, vigor: 1 })
  }
  // Share the growth out, older fronds first.
  let budget = nodes + 5
  for (let round = 0; budget > 0 && round < 40; round++) {
    for (const frond of fronds) {
      if (budget <= 0) break
      if (round < frond.rate * 40 * 0.5 + 2 && frond.length < 13) {
        frond.length++
        budget--
      }
    }
  }
  // Only recent cuts still show as stubs. Older ones have grown back.
  cuts.forEach((cut, i) => {
    if (nodes - cut >= 6) return
    const live = fronds.filter(frond => !frond.cut && frond.length > 0)
    if (live.length < 2) return
    const pick = picks?.[i] ?? -1
    const frond = pick >= 0 ? live[pick % live.length] : live.reduce((best, item) => (item.length > best.length ? item : best))
    frond.length = Math.min(frond.length, 2)
    frond.cut = true
  })
  for (const frond of fronds) {
    let angle = frond.angle
    const out = Math.cos(frond.angle) < 0 ? -1 : 1
    for (let i = 0; i < frond.length; i++) {
      angle += out * frond.sway * (0.25 + i * 0.2) + (rng() - 0.5) * 0.05
      const along = i / Math.max(1, frond.length - 1)
      frond.segments.push({ angle, leaf: i === 0 ? 0 : 2, leafSize: 0.3 + 0.46 * Math.sin(Math.PI * Math.min(1, 0.12 + along * 0.95)), length: FERN_SEGMENT * (1 - along * 0.35) })
    }
  }
  return { side, stems: fronds.filter(frond => frond.segments.length) }
}

/** The plant's stems: `{ side, stems }`, where `side` is the way it leans toward the light. */
export function shape(plant, nodes) {
  if (plant.kind === 'fern') return fern(plant, nodes)
  return branching(plant, nodes, HABITS[plant.kind] ?? HABITS.leafy)
}
