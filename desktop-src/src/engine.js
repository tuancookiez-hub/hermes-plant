// The plant's rules. Pure functions over a small JSON record. plantcore/engine.py applies the same
// rules for the agent tools, and test/parity.json keeps the two in step. Growth is worked out from
// timestamps when the plant is read. Nothing simulates in the background.

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export const HYDRATED_MS = 3 * DAY
export const THIRSTY_MS = DAY
export const DROOP_FULL_MS = 3 * DAY
export const FED_MS = 2 * DAY
export const LEAN_MS = 10 * DAY
export const LEAN_NOTICE = 0.6
export const REPOT_READY = 0.8
export const BASE_NODES = 4
export const NODE_RATE = 6
export const MAX_CUTS = 240

/** Each pot holds growth up to `days`. The last pot has no limit. */
export const POTS = [
  { name: 'seedling pot', days: 7 },
  { name: 'small pot', days: 21 },
  { name: 'medium pot', days: 45 },
  { name: 'large pot', days: null }
]

export const STAGES = [
  { name: 'sapling', days: 0 },
  { name: 'young plant', days: 7 },
  { name: 'mature plant', days: 21 },
  { name: 'flowering', days: 45 }
]

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const nodesAt = growthMs => BASE_NODES + Math.floor(NODE_RATE * Math.sqrt(growthMs / DAY))

export function createPlant(now, seed) {
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
  }
}

/** Version 1 grew a node every 12 hours and had no pots, feeding or leaning. */
function upgrade(raw, now) {
  if (raw?.v !== 1 || !Array.isArray(raw.cuts) || !Number.isFinite(raw.growthMs)) return raw
  const days = raw.growthMs / DAY
  const pot = POTS.findIndex(item => item.days === null || days < item.days)
  return {
    ...raw,
    v: 2,
    rev: 1,
    cuts: raw.cuts.map(node => (Number.isInteger(node) ? nodesAt(Math.max(0, node - BASE_NODES) * 12 * HOUR) : node)),
    fedUntil: 0,
    leanAt: 0,
    turnedAt: now,
    pot
  }
}

/** Turns stored data back into a valid plant, or returns null when it can't be trusted. */
export function restorePlant(input, now) {
  const raw = upgrade(input, now)
  if (raw?.v !== 2 || !Array.isArray(raw.cuts) || raw.cuts.length > MAX_CUTS) return null
  const numbers = [raw.rev, raw.seed, raw.plantedAt, raw.updatedAt, raw.hydratedUntil, raw.growthMs, raw.fedUntil, raw.leanAt, raw.turnedAt]
  if (!numbers.every(Number.isFinite)) return null
  if (!Number.isInteger(raw.pot) || raw.pot < 0 || raw.pot >= POTS.length) return null
  if (raw.growthMs < 0 || raw.rev < 1 || !raw.cuts.every(n => Number.isInteger(n) && n >= 0)) return null
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
  }
}

/** True when `a` is a later version of the plant than `b`. */
export const isNewer = (a, b) => a.rev > b.rev || (a.rev === b.rev && a.updatedAt > b.updatedAt)

const potLimit = plant => {
  const days = POTS[plant.pot].days
  return days === null ? Infinity : days * DAY
}

/**
 * Banks growth up to `now`. Only time spent watered counts, time spent fed counts half again, the
 * pot caps it, and a clock moved backwards adds none.
 */
export function settle(plant, now) {
  const end = Math.min(now, plant.hydratedUntil)
  const span = Math.max(0, end - plant.updatedAt)
  const fed = Math.max(0, Math.min(end, plant.fedUntil) - plant.updatedAt)
  const growthMs = Math.min(potLimit(plant), plant.growthMs + span + Math.floor(fed / 2))
  return { ...plant, growthMs: Math.max(plant.growthMs, growthMs), updatedAt: Math.max(plant.updatedAt, now) }
}

/** How far the plant leans toward the light: 0 is upright, 1 is as far as it goes. */
export const leanOf = (plant, now) => clamp(plant.leanAt + Math.max(0, now - plant.turnedAt) / LEAN_MS, -1, 1)

export const nodeCount = plant => nodesAt(plant.growthMs)

const act = (plant, now, change) => ({ ...settle(plant, now), ...change, rev: plant.rev + 1 })

export function water(plant, now) {
  return { plant: act(plant, now, { hydratedUntil: now + HYDRATED_MS }), done: true, message: 'Watered. Good for three days.' }
}

/** Cuts the tallest tip. New growth must appear between cuts, so it can't be pruned to nothing. */
export function prune(plant, now) {
  const settled = settle(plant, now)
  const nodes = nodeCount(settled)
  if (settled.cuts.length >= MAX_CUTS || settled.cuts.at(-1) >= nodes) {
    return { plant, done: false, message: 'Nothing new to prune yet.' }
  }
  return { plant: act(plant, now, { cuts: [...settled.cuts, nodes] }), done: true, message: 'Pruned. Two new shoots will branch from the cut.' }
}

/** Turns the pot. The lean it had now points away from the light, and it grows back the other way. */
export function rotate(plant, now) {
  return { plant: act(plant, now, { leanAt: -leanOf(plant, now), turnedAt: now }), done: true, message: 'Turned the pot. It will straighten up.' }
}

export function feed(plant, now) {
  if (now < plant.fedUntil) return { plant, done: false, message: 'Still using the last feed.' }
  return { plant: act(plant, now, { fedUntil: now + FED_MS }), done: true, message: 'Fed. It grows faster for two days.' }
}

export function repot(plant, now) {
  const settled = settle(plant, now)
  if (settled.pot >= POTS.length - 1) return { plant, done: false, message: 'Already in the largest pot.' }
  if (settled.growthMs < REPOT_READY * potLimit(settled)) return { plant, done: false, message: 'The roots still have room.' }
  const pot = settled.pot + 1
  return { plant: act(plant, now, { pot }), done: true, message: `Moved to the ${POTS[pot].name}.` }
}

export const ACTIONS = { feed, prune, repot, rotate, water }

export function describe(plant, now) {
  const settled = settle(plant, now)
  const days = settled.growthMs / DAY
  const left = plant.hydratedUntil - now
  const limit = potLimit(settled)
  const rootBound = settled.growthMs >= limit
  const lean = leanOf(plant, now)
  const dry = left <= 0
  const mood = dry ? 'droopy' : left <= THIRSTY_MS ? 'thirsty' : rootBound ? 'root-bound' : lean >= LEAN_NOTICE ? 'leaning' : 'happy'
  const needs = []
  if (left <= THIRSTY_MS) needs.push('water')
  if (rootBound) needs.push('repot')
  if (lean >= LEAN_NOTICE) needs.push('rotate')
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
    stage: STAGES.findLast(stage => days >= stage.days).name,
    waterHours: Math.max(0, Math.round(left / HOUR))
  }
}

/** One plain sentence about the plant, for the status bar, the pet and the chat. */
export function summarize(view) {
  const state = {
    droopy: 'dry and drooping, growth paused',
    happy: 'happy',
    leaning: 'leaning toward the light',
    'root-bound': 'root-bound, growth paused',
    thirsty: 'getting thirsty'
  }[view.mood]
  return `${view.stage} in a ${view.potName}, ${state}`
}

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
const SEGMENT = 4.4
const MIN_STEM = 2
const CUT_NODES = 2
const SHOOT_EVERY = 5
const MAX_NATURAL_TIPS = 6
const SHOOT_RATE = 0.62

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

function grow(stem, rng) {
  const last = stem.segments.at(-1)?.angle ?? stem.angle
  const count = stem.segments.length
  stem.segments.push({
    angle: last + (rng() - 0.5) * 0.4 + (UP - last) * (stem.natural ? 0.1 : 0.14),
    leaf: count > 0 || stem.depth > 0 ? (count % 2 ? 1 : -1) : 0,
    leafSize: 0.8 + rng() * 0.45,
    length: SEGMENT * stem.vigor * (0.85 + rng() * 0.3)
  })
}

function cutTallest(stems, rng) {
  const tips = stems.filter(stem => !stem.cut)
  const tallest = tips.reduce((best, stem) => (pointOf(stem).y < pointOf(best).y ? stem : best))
  const keep = Math.max(MIN_STEM, tallest.hold, tallest.segments.length - CUT_NODES)
  tallest.segments.length = Math.min(tallest.segments.length, keep)
  tallest.cut = true
  const angle = tallest.segments.at(-1)?.angle ?? tallest.angle
  const spread = 0.55 + rng() * 0.25
  const vigor = Math.max(0.6, tallest.vigor * 0.92)
  grow(addStem(stems, tallest, angle - spread, vigor, tallest.rate), rng)
  grow(addStem(stems, tallest, angle + spread, vigor, tallest.rate), rng)
}

/**
 * Replays the plant's whole life. The same seed and cuts always give the same shape. A plant left
 * alone grows tall with a few side shoots. Each cut stops the tallest tip and starts two more.
 */
export function shape({ seed, cuts }, nodes) {
  const rng = random(seed)
  const stems = []
  addStem(stems, null, UP + (rng() - 0.5) * 0.24, 1, 1)
  const side = rng() < 0.5 ? -1 : 1
  const pending = [...cuts]
  for (let node = 1; node <= nodes; node++) {
    const tips = stems.filter(stem => !stem.cut)
    const stem = nextTip(tips)
    grow(stem, rng)
    const count = stem.segments.length
    if (count % SHOOT_EVERY === 3 && tips.length < MAX_NATURAL_TIPS) {
      const turn = (Math.floor(count / SHOOT_EVERY) % 2 ? 1 : -1) * (0.95 + rng() * 0.3)
      grow(addStem(stems, stem, stem.segments.at(-1).angle + turn, Math.max(0.6, stem.vigor * 0.85), stem.rate * SHOOT_RATE, true), rng)
    }
    while (pending[0] <= node) {
      pending.shift()
      cutTallest(stems, rng)
    }
  }
  while (pending.length) {
    pending.shift()
    cutTallest(stems, rng)
  }
  return { side, stems }
}
