// The garden's rules. Pure functions over a small JSON record. plantcore/engine.py applies the same
// rules for the agent tools, and test/parity.json keeps the two in step. Growth is worked out from
// timestamps when the garden is read. Nothing simulates in the background.

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export const DROOP_FULL_MS = 3 * DAY
export const FED_MS = 2 * DAY
export const FEED_BOOST_MS = 8 * HOUR
export const LEAN_MS = 10 * DAY
export const LEAN_NOTICE = 0.6
export const REPOT_READY = 0.8
export const PICK_MS = 2 * DAY
export const BASE_NODES = 4
export const NODE_RATE = 12
export const MAX_NODES = 72
export const MAX_CUTS = 240
// A cut remembers which tip was chosen, as its place among the live tips, or -1 for the tallest.
export const MAX_PICK = 63
export const MAX_PLANTS = 6
export const MAX_FERTILIZER = 9
export const START_COINS = 20
export const START_FERTILIZER = 2
export const FERTILIZER_PRICE = 8
export const WATER_COINS = 2
export const BUG_COINS = 2
export const PICK_COINS = 12
export const BUG_MIN_MS = 3 * HOUR
export const BUG_SPAN_MS = 6 * HOUR

/**
 * The species. `rate` is growth speed in percent, `worth` is a percent applied to what a plant sells
 * for, and `clip` is the coins a pruning earns. `last` names the final stage.
 */
export const KINDS = {
  leafy: { name: 'leafy plant', price: 15, hydrated: 3 * DAY, thirsty: DAY, rate: 100, worth: 100, clip: 2, last: 'flowering' },
  fern: { name: 'fern', price: 25, hydrated: 2 * DAY, thirsty: 12 * HOUR, rate: 130, worth: 120, clip: 2, last: 'lush' },
  cactus: { name: 'cactus', price: 40, hydrated: 9 * DAY, thirsty: 2 * DAY, rate: 60, worth: 220, clip: 4, last: 'flowering' },
  bonsai: { name: 'little tree', price: 60, hydrated: 4 * DAY, thirsty: DAY, rate: 80, worth: 300, clip: 5, last: 'blossoming' }
}
export const KIND_IDS = ['leafy', 'fern', 'cactus', 'bonsai']

/** Each pot holds growth up to `days`. The last pot has no limit. */
export const POTS = [
  { name: 'seedling pot', days: 1 },
  { name: 'small pot', days: 4 },
  { name: 'medium pot', days: 10 },
  { name: 'large pot', days: null }
]

/** Stage 3 is named by the species. */
export const STAGES = [
  { name: 'seedling', days: 0 },
  { name: 'young', days: 1 },
  { name: 'grown', days: 4 },
  { name: null, days: 10 }
]

const own = (table, key) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined)
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const nodesAt = growthMs => Math.min(MAX_NODES, BASE_NODES + Math.floor(NODE_RATE * Math.sqrt(growthMs / DAY)))
const potFor = growthMs => POTS.findIndex(pot => pot.days === null || growthMs < pot.days * DAY)
const stageOf = growthMs => STAGES.findLastIndex(stage => growthMs >= stage.days * DAY)
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

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
    picks: [],
    fedUntil: 0,
    leanAt: 0,
    turnedAt: now,
    pot: 0,
    pickedAt: 0
  }
}

/** When the next bug lands. It depends only on the garden's seed and revision, so both engines agree. */
const nextBug = (seed, rev, now) => now + BUG_MIN_MS + (((Math.imul(rev, 0x9e3779b1) + seed) >>> 0) % BUG_SPAN_MS)

export function createGarden(now, seed) {
  const base = seed >>> 0
  return {
    v: 3,
    rev: 1,
    seed: base,
    updatedAt: now,
    coins: START_COINS,
    fertilizer: START_FERTILIZER,
    bugAt: nextBug(base, 1, now),
    nextId: 2,
    plants: [newPlant(1, 'leafy', base, now)]
  }
}

/** Version 1 grew a node every 12 hours. Its cut marks become version 2 node counts. */
function fromV1(raw) {
  if (raw?.v !== 1 || !Array.isArray(raw.cuts) || !Number.isFinite(raw.growthMs)) return raw
  const old = growthMs => BASE_NODES + Math.floor(6 * Math.sqrt(growthMs / DAY))
  return {
    ...raw,
    v: 2,
    rev: 1,
    cuts: raw.cuts.map(node => (Number.isInteger(node) ? old(Math.max(0, node - BASE_NODES) * 12 * HOUR) : node)),
    fedUntil: 0,
    leanAt: 0,
    turnedAt: raw.updatedAt,
    pot: 0
  }
}

/** Versions 1 and 2 held one plant. It becomes the first pot of a garden, and now grows twice as many nodes. */
function fromSinglePlant(input) {
  const raw = fromV1(input)
  if (raw?.v !== 2 || !Array.isArray(raw.cuts) || !Number.isFinite(raw.growthMs) || raw.growthMs < 0) return raw
  const seed = Number.isFinite(raw.seed) ? raw.seed >>> 0 : 0
  const rev = Number.isFinite(raw.rev) ? raw.rev : 1
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
        kind: 'leafy',
        cuts: raw.cuts.map(node => (Number.isInteger(node) && node > BASE_NODES ? BASE_NODES + 2 * (node - BASE_NODES) : node)),
        picks: raw.cuts.map(() => -1),
        pot: potFor(raw.growthMs),
        pickedAt: 0
      }
    ]
  }
}

function restorePlant(raw, now) {
  const kind = own(KINDS, raw?.kind)
  if (!kind || !Number.isInteger(raw.id) || raw.id < 1) return null
  if (!Array.isArray(raw.cuts) || raw.cuts.length > MAX_CUTS) return null
  const numbers = [raw.seed, raw.plantedAt, raw.updatedAt, raw.hydratedUntil, raw.growthMs, raw.fedUntil, raw.leanAt, raw.turnedAt, raw.pickedAt]
  if (!numbers.every(Number.isFinite)) return null
  if (!Number.isInteger(raw.pot) || raw.pot < 0 || raw.pot >= POTS.length) return null
  if (raw.growthMs < 0 || !raw.cuts.every(n => Number.isInteger(n) && n >= 0)) return null
  // Saves from before 1.2 have no picks: every one of their cuts took the tallest tip.
  const known = Array.isArray(raw.picks) && raw.picks.length === raw.cuts.length && raw.picks.every(pick => Number.isInteger(pick) && pick >= -1 && pick <= MAX_PICK)
  const picks = known ? raw.picks : raw.cuts.map(() => -1)
  const order = raw.cuts.map((_, i) => i).sort((a, b) => raw.cuts[a] - raw.cuts[b] || a - b)
  return {
    id: raw.id,
    kind: raw.kind,
    seed: raw.seed >>> 0,
    plantedAt: Math.min(raw.plantedAt, now),
    updatedAt: Math.min(raw.updatedAt, now),
    hydratedUntil: Math.min(raw.hydratedUntil, now + kind.hydrated),
    growthMs: Math.floor(raw.growthMs),
    cuts: order.map(i => raw.cuts[i]),
    picks: order.map(i => picks[i]),
    fedUntil: Math.min(raw.fedUntil, now + FED_MS),
    leanAt: clamp(raw.leanAt, -1, 1),
    turnedAt: Math.min(raw.turnedAt, now),
    pot: raw.pot,
    pickedAt: Math.min(raw.pickedAt, now)
  }
}

/** Turns stored data back into a valid garden, or returns null when it can't be trusted. */
export function restoreGarden(input, now) {
  const raw = fromSinglePlant(input)
  if (raw?.v !== 3 || !Array.isArray(raw.plants) || raw.plants.length < 1 || raw.plants.length > MAX_PLANTS) return null
  if (![raw.rev, raw.seed, raw.updatedAt, raw.coins, raw.fertilizer, raw.bugAt, raw.nextId].every(Number.isFinite)) return null
  if (raw.rev < 1 || raw.coins < 0 || raw.fertilizer < 0 || raw.bugAt < 0) return null
  const plants = raw.plants.map(plant => restorePlant(plant, now))
  if (plants.includes(null) || new Set(plants.map(plant => plant.id)).size !== plants.length) return null
  return {
    v: 3,
    rev: Math.floor(raw.rev),
    seed: raw.seed >>> 0,
    updatedAt: Math.min(raw.updatedAt, now),
    coins: Math.floor(raw.coins),
    fertilizer: Math.min(MAX_FERTILIZER, Math.floor(raw.fertilizer)),
    bugAt: Math.min(raw.bugAt, now + BUG_MIN_MS + BUG_SPAN_MS),
    nextId: Math.max(Math.floor(raw.nextId), ...plants.map(plant => plant.id + 1)),
    plants
  }
}

/** True when `a` is a later version of the garden than `b`. */
export const isNewer = (a, b) => a.rev > b.rev || (a.rev === b.rev && a.updatedAt > b.updatedAt)

const potLimit = plant => {
  const days = POTS[plant.pot].days
  return days === null ? Infinity : days * DAY
}

/**
 * Banks a plant's growth up to `now`. Only time spent watered counts, time spent fed counts half
 * again, the species sets the pace, the pot caps it, and a clock moved backwards adds none.
 */
export function settle(plant, now) {
  const end = Math.min(now, plant.hydratedUntil)
  const span = Math.max(0, end - plant.updatedAt)
  const fed = Math.max(0, Math.min(end, plant.fedUntil) - plant.updatedAt)
  const gain = Math.floor(((span + Math.floor(fed / 2)) * KINDS[plant.kind].rate) / 100)
  const growthMs = Math.min(potLimit(plant), plant.growthMs + gain)
  return { ...plant, growthMs: Math.max(plant.growthMs, growthMs), updatedAt: Math.max(plant.updatedAt, now) }
}

/** How far a plant leans toward the light: 0 is upright, 1 is as far as it goes. */
export const leanOf = (plant, now) => clamp(plant.leanAt + Math.max(0, now - plant.turnedAt) / LEAN_MS, -1, 1)

export const nodeCount = plant => nodesAt(plant.growthMs)

/** What a plant sells for: more as it grows, and more for the slower species. */
export function valueOf(plant) {
  const base = 5 + 20 * stageOf(plant.growthMs) + Math.floor((4 * plant.growthMs) / DAY)
  return Math.floor((base * KINDS[plant.kind].worth) / 100)
}

const canPick = (plant, now) => stageOf(plant.growthMs) === 3 && now < plant.hydratedUntil && now - plant.pickedAt >= PICK_MS

// Care rules. Each takes a settled plant and returns what changed, or `done: false` and why not.

function water(plant, now) {
  const kind = KINDS[plant.kind]
  const wasThirsty = plant.hydratedUntil - now <= kind.thirsty
  const days = kind.hydrated / DAY
  return { change: { hydratedUntil: now + kind.hydrated }, coins: wasThirsty ? WATER_COINS : 0, done: true, message: `Watered. Good for ${plural(days, 'day')}.` }
}

/**
 * Cuts one tip: the one chosen, counted among the plant's live tips, or the tallest when none is
 * chosen. New growth must appear between cuts, so a plant can't be pruned to nothing.
 */
function prune(plant, now, garden, tip) {
  const nodes = nodeCount(plant)
  if (plant.cuts.length >= MAX_CUTS || plant.cuts.at(-1) >= nodes) return { done: false, message: 'Nothing new to prune yet.' }
  const pick = Number.isInteger(tip) && tip >= 0 ? Math.min(tip, MAX_PICK) : -1
  return { change: { cuts: [...plant.cuts, nodes], picks: [...plant.picks, pick] }, coins: KINDS[plant.kind].clip, done: true, message: 'Pruned. New shoots will branch from the cut.' }
}

/** Turns the pot. The lean it had now points away from the light, and it grows back the other way. */
function rotate(plant, now) {
  return { change: { leanAt: -leanOf(plant, now), turnedAt: now }, done: true, message: 'Turned the pot. It will straighten up.' }
}

/** Uses one fertilizer: a jump of growth now, and faster growth for two days. */
function feed(plant, now, garden) {
  if (now < plant.fedUntil) return { done: false, message: 'Still using the last fertilizer.' }
  if (garden.fertilizer < 1) return { done: false, message: 'No fertilizer left. The shop sells it.' }
  const boost = Math.floor((FEED_BOOST_MS * KINDS[plant.kind].rate) / 100)
  return {
    change: { fedUntil: now + FED_MS, growthMs: Math.min(potLimit(plant), plant.growthMs + boost) },
    done: true,
    fertilizer: -1,
    message: 'Fertilized. A burst of growth now, and faster growth for two days.'
  }
}

function repot(plant) {
  if (plant.pot >= POTS.length - 1) return { done: false, message: 'Already in the largest pot.' }
  if (plant.growthMs < REPOT_READY * potLimit(plant)) return { done: false, message: 'The roots still have room.' }
  return { change: { pot: plant.pot + 1 }, done: true, message: `Moved to the ${POTS[plant.pot + 1].name}.` }
}

/** Picks what a fully grown plant has made. It needs two days to make more. */
function pick(plant, now) {
  if (stageOf(plant.growthMs) < 3) return { done: false, message: 'Nothing to pick until it is fully grown.' }
  if (now >= plant.hydratedUntil) return { done: false, message: 'Too dry to pick from. Water it first.' }
  if (now - plant.pickedAt < PICK_MS) return { done: false, message: 'Picked not long ago. Give it two days.' }
  return { change: { pickedAt: now }, coins: Math.floor((PICK_COINS * KINDS[plant.kind].worth) / 100), done: true, message: 'Picked and sold.' }
}

const CARE = { feed, pick, prune, repot, rotate, water }
export const CARE_ACTIONS = ['water', 'prune', 'rotate', 'feed', 'repot', 'pick']
export const ACTIONS = [...CARE_ACTIONS, 'sell', 'buy', 'shoo']
export const SHOP_ITEMS = [...KIND_IDS, 'fertilizer']

/** The plant an action should go to when none is named: the one that wants it most. */
export function choose(garden, action, now) {
  const plants = garden.plants.map(plant => settle(plant, now))
  const best = score => plants.reduce((found, plant, i) => (score(plant) > score(plants[found]) ? i : found), 0)
  const first = test => Math.max(0, plants.findIndex(test))
  if (action === 'water') return best(plant => -(plant.hydratedUntil - now))
  if (action === 'prune') return best(plant => nodeCount(plant) - (plant.cuts.at(-1) ?? 0))
  if (action === 'rotate') return best(plant => leanOf(plant, now))
  if (action === 'feed') return first(plant => now >= plant.fedUntil && now < plant.hydratedUntil)
  if (action === 'repot') return first(plant => plant.pot < POTS.length - 1 && plant.growthMs >= REPOT_READY * potLimit(plant))
  if (action === 'pick') return first(plant => canPick(plant, now))
  return -1
}

/** The id of the plant a bug is sitting on, or null. */
export function bugOn(garden, now) {
  if (now < garden.bugAt) return null
  return garden.plants[Math.floor(garden.bugAt / 60_000) % garden.plants.length].id
}

const fail = (garden, message, plant = null) => ({ garden, done: false, message, coins: 0, plant })

const commit = (garden, now, change) => {
  const rev = garden.rev + 1
  return { ...garden, ...change, rev, updatedAt: Math.max(garden.updatedAt, now) }
}

function buy(garden, item, now) {
  if (item === 'fertilizer') {
    if (garden.fertilizer >= MAX_FERTILIZER) return fail(garden, 'The shelf is full of fertilizer already.')
    if (garden.coins < FERTILIZER_PRICE) return fail(garden, `Fertilizer costs ${FERTILIZER_PRICE} coins. You have ${garden.coins}.`)
    return { garden: commit(garden, now, { coins: garden.coins - FERTILIZER_PRICE, fertilizer: garden.fertilizer + 1 }), done: true, message: 'Bought one fertilizer.', coins: -FERTILIZER_PRICE, plant: null }
  }
  const kind = own(KINDS, item)
  if (!kind) return fail(garden, `The shop sells: ${SHOP_ITEMS.join(', ')}.`)
  if (garden.plants.length >= MAX_PLANTS) return fail(garden, 'The garden is full. Sell a plant to make room.')
  if (garden.coins < kind.price) return fail(garden, `A ${kind.name} costs ${kind.price} coins. You have ${garden.coins}.`)
  const id = garden.nextId
  const seed = (Math.imul(id, 0x9e3779b1) + garden.seed) >>> 0
  const plants = [...garden.plants, newPlant(id, item, seed, now)]
  return { garden: commit(garden, now, { coins: garden.coins - kind.price, nextId: id + 1, plants }), done: true, message: `Planted a ${kind.name}.`, coins: -kind.price, plant: id }
}

function sell(garden, index, now) {
  if (garden.plants.length < 2) return fail(garden, 'This is your only plant. Keep it.', garden.plants[index].id)
  const plant = settle(garden.plants[index], now)
  const coins = valueOf(plant)
  const plants = garden.plants.filter((_, i) => i !== index)
  return { garden: commit(garden, now, { coins: garden.coins + coins, plants }), done: true, message: `Sold the ${KINDS[plant.kind].name} for ${plural(coins, 'coin')}.`, coins, plant: plant.id }
}

function shoo(garden, now) {
  const plant = bugOn(garden, now)
  if (plant === null) return fail(garden, 'No bugs about.')
  const next = commit(garden, now, { coins: garden.coins + BUG_COINS })
  next.bugAt = nextBug(garden.seed, next.rev, now)
  return { garden: next, done: true, message: `Shooed the bug away. +${plural(BUG_COINS, 'coin')}.`, coins: BUG_COINS, plant }
}

/**
 * Runs one action on the garden. `plant` is a plant id, and when it is left out the action goes to
 * the plant that wants it most. `item` is what to buy, and `tip` is which tip to prune. Returns the garden after, whether anything
 * happened, a line to show, the coins gained or spent, and the plant it touched.
 */
export function tend(garden, action, now, { plant: id = null, item = null, tip = null } = {}) {
  if (action === 'buy') return buy(garden, item, now)
  if (action === 'shoo') return shoo(garden, now)
  if (action !== 'sell' && !own(CARE, action)) return fail(garden, `Actions are: ${ACTIONS.join(', ')}.`)
  if (action === 'sell' && id === null) return fail(garden, 'Say which plant to sell.')
  const index = id === null ? choose(garden, action, now) : garden.plants.findIndex(plant => plant.id === id)
  if (index < 0) return fail(garden, 'There is no such plant.')
  if (action === 'sell') return sell(garden, index, now)

  const settled = settle(garden.plants[index], now)
  const result = CARE[action](settled, now, garden, tip)
  if (!result.done) return fail(garden, result.message, settled.id)
  const coins = result.coins ?? 0
  const plants = garden.plants.map((plant, i) => (i === index ? { ...settled, ...result.change } : plant))
  const change = { coins: garden.coins + coins, fertilizer: garden.fertilizer + (result.fertilizer ?? 0), plants }
  const message = coins ? `${result.message} +${plural(coins, 'coin')}.` : result.message
  return { garden: commit(garden, now, change), done: true, message, coins, plant: settled.id }
}

export function describePlant(plant, now) {
  const kind = KINDS[plant.kind]
  const settled = settle(plant, now)
  const days = settled.growthMs / DAY
  const left = plant.hydratedUntil - now
  const limit = potLimit(settled)
  const rootBound = settled.growthMs >= limit
  const lean = leanOf(plant, now)
  const dry = left <= 0
  const thirsty = left <= kind.thirsty
  const stage = stageOf(settled.growthMs)
  const mood = dry ? 'droopy' : thirsty ? 'thirsty' : rootBound ? 'root-bound' : lean >= LEAN_NOTICE ? 'leaning' : 'happy'
  const needs = []
  if (thirsty) needs.push('water')
  if (rootBound) needs.push('repot')
  if (lean >= LEAN_NOTICE) needs.push('rotate')
  const stageName = STAGES[stage].name ?? kind.last
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
    show: stage < 3 || dry ? 'none' : now - plant.pickedAt >= PICK_MS && !thirsty ? 'full' : 'bud',
    stage,
    stageName,
    value: valueOf(settled),
    waterHours: Math.max(0, Math.round(left / HOUR))
  }
}

export function describe(garden, now) {
  const plants = garden.plants.map(plant => describePlant(plant, now))
  return {
    bug: bugOn(garden, now),
    coins: garden.coins,
    fertilizer: garden.fertilizer,
    needy: plants.filter(plant => plant.needs.length).length,
    plants,
    room: MAX_PLANTS - plants.length
  }
}

const MOODS = {
  droopy: 'dry and drooping, growth paused',
  happy: 'happy',
  leaning: 'leaning toward the light',
  'root-bound': 'root-bound, growth paused',
  thirsty: 'getting thirsty'
}

/** One plain sentence about a plant, for labels and the chat. */
export const summarizePlant = view => `${view.name} in a ${view.potName}, ${MOODS[view.mood]}`

/** One plain sentence about the whole garden, for the status bar, the pet and the chat. */
export function summarize(view) {
  const plants = view.plants.map((plant, i) => `${i + 1}. ${summarizePlant(plant)}`).join('; ')
  const bug = view.bug === null ? '' : ' A bug is sitting on one of them.'
  return `${plural(view.plants.length, 'plant')}, ${plural(view.coins, 'coin')}, ${view.fertilizer} fertilizer. ${plants}.${bug}`
}
