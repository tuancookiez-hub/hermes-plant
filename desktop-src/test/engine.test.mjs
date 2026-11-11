import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { drawPlant, drawSample, measure } from '../src/art.js'
import {
  BASE_NODES,
  BUG_COINS,
  bugOn,
  choose,
  createGarden,
  DAY,
  describe,
  describePlant,
  FED_MS,
  FERTILIZER_PRICE,
  HOUR,
  isNewer,
  KIND_IDS,
  KINDS,
  leanOf,
  MAX_PLANTS,
  nodeCount,
  PICK_MS,
  POTS,
  restoreGarden,
  settle,
  START_COINS,
  START_FERTILIZER,
  summarize,
  tend,
  valueOf
} from '../src/engine.js'
import { shape } from '../src/shape.js'
import { buildParity, PARITY_FILE } from '../scripts/parity.mjs'

const T0 = 1_800_000_000_000
const fresh = () => createGarden(T0, 7)
/** A garden whose first plant has been changed, and that has `coins`. */
const withPlant = (change, coins = START_COINS) => {
  const garden = fresh()
  return { ...garden, coins, plants: [{ ...garden.plants[0], ...change }] }
}
const first = (garden, now) => describePlant(garden.plants[0], now)

test('a new garden has one watered leafy plant, some coins and some fertilizer', () => {
  const garden = fresh()
  const view = describe(garden, T0)
  assert.equal(view.plants.length, 1)
  assert.equal(view.plants[0].name, 'seedling leafy plant')
  assert.equal(view.plants[0].mood, 'happy')
  assert.deepEqual(view.plants[0].needs, [])
  assert.equal(view.coins, START_COINS)
  assert.equal(view.fertilizer, START_FERTILIZER)
  assert.equal(view.bug, null)
  assert.equal(nodeCount(garden.plants[0]), BASE_NODES)
})

test('growth counts only while watered, at the pace of the species', () => {
  const leafy = fresh().plants[0]
  assert.equal(settle({ ...leafy, pot: 3 }, T0 + 10 * DAY).growthMs, 3 * DAY)
  const cactus = { ...leafy, kind: 'cactus', pot: 3, hydratedUntil: T0 + 9 * DAY }
  assert.equal(settle(cactus, T0 + 5 * DAY).growthMs, 3 * DAY)
})

test('a clock moved backwards adds no growth and loses none', () => {
  const plant = { ...fresh().plants[0], growthMs: DAY / 2 }
  assert.equal(settle(plant, T0 - DAY).growthMs, DAY / 2)
  assert.equal(settle(plant, T0 - DAY).updatedAt, T0)
})

test('moods follow the water: happy, thirsty, then droopy with growth paused', () => {
  const garden = fresh()
  assert.equal(first(garden, T0 + DAY).mood, 'root-bound')
  const roomy = withPlant({ pot: 3 })
  assert.equal(first(roomy, T0 + DAY).mood, 'happy')
  assert.equal(first(roomy, T0 + 2.5 * DAY).mood, 'thirsty')
  const dry = first(roomy, T0 + 4 * DAY)
  assert.equal(dry.mood, 'droopy')
  assert.equal(dry.growing, false)
  assert.ok(dry.droop > 0.2)
})

test('watering a thirsty plant pays, and watering a happy one does not', () => {
  const garden = fresh()
  assert.equal(tend(garden, 'water', T0 + HOUR).coins, 0)
  const late = tend(garden, 'water', T0 + 2.5 * DAY)
  assert.equal(late.coins, 2)
  assert.equal(late.garden.coins, START_COINS + 2)
  assert.equal(late.garden.plants[0].hydratedUntil, T0 + 2.5 * DAY + KINDS.leafy.hydrated)
  assert.match(late.message, /\+2 coins/)
})

test('fertilizer gives a jump of growth and two faster days, and is used up', () => {
  const garden = withPlant({ pot: 3 })
  const fed = tend(garden, 'feed', T0)
  assert.equal(fed.done, true)
  assert.equal(fed.garden.fertilizer, START_FERTILIZER - 1)
  assert.equal(fed.garden.plants[0].growthMs, 8 * HOUR)
  assert.equal(fed.garden.plants[0].fedUntil, T0 + FED_MS)
  assert.equal(settle(fed.garden.plants[0], T0 + 2 * DAY).growthMs, 8 * HOUR + 3 * DAY)
  assert.equal(tend(fed.garden, 'feed', T0 + HOUR).done, false)
  const empty = { ...garden, fertilizer: 0 }
  assert.match(tend(empty, 'feed', T0).message, /No fertilizer/)
})

test('the pot caps growth until the plant is repotted', () => {
  let garden = fresh()
  garden = tend(garden, 'water', T0 + 2 * DAY).garden
  assert.equal(garden.plants[0].growthMs, POTS[0].days * DAY)
  assert.deepEqual(first(garden, T0 + 2 * DAY).needs, ['repot'])
  const moved = tend(garden, 'repot', T0 + 2 * DAY)
  assert.equal(moved.done, true)
  assert.equal(moved.garden.plants[0].pot, 1)
  assert.equal(tend(moved.garden, 'repot', T0 + 2 * DAY).message, 'The roots still have room.')
  assert.equal(tend(withPlant({ pot: 3 }), 'repot', T0).message, 'Already in the largest pot.')
})

test('a plant leans over ten days, and rotating swings it back', () => {
  const garden = withPlant({ pot: 3 })
  assert.ok(Math.abs(leanOf(garden.plants[0], T0 + 5 * DAY) - 0.5) < 1e-9)
  assert.ok(first(garden, T0 + 7 * DAY).needs.includes('rotate'))
  const turned = tend(garden, 'rotate', T0 + 7 * DAY).garden
  assert.ok(Math.abs(leanOf(turned.plants[0], T0 + 7 * DAY) + 0.7) < 1e-9)
  assert.ok(Math.abs(leanOf(turned.plants[0], T0 + 14 * DAY)) < 1e-9)
})

test('pruning needs new growth between cuts, and pays for the clippings', () => {
  const garden = withPlant({ pot: 3 })
  const cut = tend(garden, 'prune', T0)
  assert.equal(cut.done, true)
  assert.equal(cut.coins, KINDS.leafy.clip)
  assert.deepEqual(cut.garden.plants[0].cuts, [BASE_NODES])
  assert.equal(tend(cut.garden, 'prune', T0).message, 'Nothing new to prune yet.')
  assert.equal(tend(cut.garden, 'prune', T0 + DAY).done, true)
})

test('a refused action leaves the garden and its revision alone', () => {
  const garden = fresh()
  for (const [action, options] of [['repot'], ['pick'], ['sell', { plant: 1 }], ['buy', { item: 'bonsai' }], ['shoo'], ['dance'], ['water', { plant: 42 }]]) {
    const result = tend(garden, action, T0 + HOUR, options)
    assert.equal(result.done, false, action)
    assert.equal(result.garden, garden, action)
    assert.equal(result.coins, 0, action)
  }
})

test('stages come at 1, 4 and 10 days of growth, and the species names the last one', () => {
  const name = (kind, days) => first(withPlant({ kind, growthMs: days * DAY, pot: 3 }), T0).name
  assert.deepEqual([0.9, 1, 4, 10].map(days => name('leafy', days)), ['seedling leafy plant', 'young leafy plant', 'grown leafy plant', 'flowering leafy plant'])
  assert.equal(name('fern', 10), 'lush fern')
  assert.equal(name('bonsai', 10), 'blossoming little tree')
})

test('the shop sells plants and fertilizer for coins, up to a full garden', () => {
  let garden = { ...fresh(), coins: 500 }
  const bought = tend(garden, 'buy', T0, { item: 'cactus' })
  assert.equal(bought.done, true)
  assert.equal(bought.coins, -KINDS.cactus.price)
  assert.equal(bought.plant, 2)
  assert.equal(bought.garden.plants[1].kind, 'cactus')
  assert.notEqual(bought.garden.plants[1].seed, garden.plants[0].seed)
  garden = bought.garden
  for (const item of ['fern', 'bonsai', 'leafy', 'fern']) garden = tend(garden, 'buy', T0, { item }).garden
  assert.equal(garden.plants.length, MAX_PLANTS)
  assert.equal(new Set(garden.plants.map(plant => plant.id)).size, MAX_PLANTS)
  assert.match(tend(garden, 'buy', T0, { item: 'leafy' }).message, /garden is full/)
  const more = tend(garden, 'buy', T0, { item: 'fertilizer' })
  assert.equal(more.garden.fertilizer, START_FERTILIZER + 1)
  assert.equal(more.coins, -FERTILIZER_PRICE)
  assert.match(tend(fresh(), 'buy', T0, { item: 'bonsai' }).message, /costs 60 coins. You have 20/)
  assert.equal(tend(garden, 'buy', T0, { item: 'constructor' }).done, false)
})

test('a plant sells for more as it grows, and the last plant is never sold', () => {
  assert.equal(tend(fresh(), 'sell', T0, { plant: 1 }).message, 'This is your only plant. Keep it.')
  let garden = tend({ ...fresh(), coins: 100 }, 'buy', T0, { item: 'bonsai' }).garden
  assert.equal(tend(garden, 'sell', T0).message, 'Say which plant to sell.')
  const young = valueOf({ ...garden.plants[1], growthMs: 0 })
  const old = valueOf({ ...garden.plants[1], growthMs: 12 * DAY })
  assert.ok(old > young * 5)
  const sold = tend(garden, 'sell', T0, { plant: 2 })
  assert.equal(sold.done, true)
  assert.equal(sold.coins, young)
  assert.deepEqual(sold.garden.plants.map(plant => plant.id), [1])
  garden = tend(sold.garden, 'buy', T0, { item: 'leafy' }).garden
  assert.equal(garden.plants[1].id, 3)
})

test('a fully grown, watered plant can be picked every two days', () => {
  const garden = withPlant({ growthMs: 11 * DAY, pot: 3 })
  assert.equal(first(garden, T0).show, 'full')
  const picked = tend(garden, 'pick', T0)
  assert.equal(picked.done, true)
  assert.equal(picked.coins, 12)
  assert.equal(first(picked.garden, T0 + HOUR).show, 'bud')
  assert.equal(tend(picked.garden, 'pick', T0 + DAY).done, false)
  assert.equal(tend(tend(picked.garden, 'water', T0 + PICK_MS).garden, 'pick', T0 + PICK_MS).done, true)
  assert.match(tend(garden, 'pick', T0 + 5 * DAY).message, /Too dry/)
  assert.match(tend(fresh(), 'pick', T0).message, /fully grown/)
})

test('a bug lands after a while, and shooing it pays and sends it away', () => {
  const garden = fresh()
  assert.ok(garden.bugAt > T0 + 3 * HOUR - 1 && garden.bugAt < T0 + 9 * HOUR)
  assert.equal(bugOn(garden, garden.bugAt - 1), null)
  assert.equal(bugOn(garden, garden.bugAt), 1)
  const shooed = tend(garden, 'shoo', garden.bugAt + HOUR)
  assert.equal(shooed.coins, BUG_COINS)
  assert.equal(shooed.plant, 1)
  assert.ok(shooed.garden.bugAt > garden.bugAt + HOUR)
  assert.equal(describe(shooed.garden, garden.bugAt + HOUR).bug, null)
})

test('an action with no plant named goes to the plant that wants it most', () => {
  let garden = { ...fresh(), coins: 500 }
  garden = tend(garden, 'buy', T0, { item: 'fern' }).garden
  garden = tend(garden, 'buy', T0, { item: 'cactus' }).garden
  assert.equal(choose(garden, 'water', T0 + DAY), 1)
  assert.equal(tend(garden, 'water', T0 + DAY).plant, 2)
  assert.equal(choose(garden, 'repot', T0 + 3 * DAY), 0)
  assert.equal(choose(garden, 'sell', T0), -1)
})

test('the same seed and cuts always give the same shape, and seeds and species differ', () => {
  const ends = plant => JSON.stringify(shape(plant, 40).stems.map(stem => stem.segments.length))
  for (const kind of KIND_IDS) {
    assert.equal(ends({ kind, seed: 5, cuts: [12, 20] }), ends({ kind, seed: 5, cuts: [12, 20] }))
    const drawings = new Set([1, 2, 3, 4, 5, 6].map(seed => drawPlant({ kind, seed, cuts: [] }, { droop: 0, fed: false, lean: 0, nodes: 40, pot: 2, show: 'none' })))
    assert.ok(drawings.size > 3, kind)
  }
  assert.notEqual(ends({ kind: 'leafy', seed: 5, cuts: [] }), ends({ kind: 'cactus', seed: 5, cuts: [] }))
})

test('each cut on a branching plant stops one tip and starts two shoots', () => {
  for (const kind of ['leafy', 'bonsai', 'cactus']) {
    const before = shape({ kind, seed: 9, cuts: [] }, 40).stems
    const after = shape({ kind, seed: 9, cuts: [20] }, 40).stems
    assert.equal(after.filter(stem => stem.cut).length, 1, kind)
    // A cactus stops making arms of its own once it has enough, so a cut may only keep the count level.
    assert.ok(after.filter(stem => !stem.cut).length >= before.filter(stem => !stem.cut).length, kind)
    assert.ok(after.length > before.length || kind === 'cactus', kind)
    for (const stem of after) if (stem.parent) assert.ok(stem.at <= stem.parent.segments.length, kind)
  }
  assert.ok(shape({ kind: 'fern', seed: 9, cuts: [20] }, 40).stems.length > shape({ kind: 'fern', seed: 9, cuts: [] }, 40).stems.length)
})

test('stored data is checked before it is trusted', () => {
  const garden = fresh()
  assert.deepEqual(restoreGarden(JSON.parse(JSON.stringify(garden)), T0), garden)
  const bad = [null, 'x', {}, { ...garden, v: 9 }, { ...garden, plants: [] }, { ...garden, coins: -1 }, { ...garden, coins: 'lots' }, { ...garden, bugAt: -5 }]
  bad.push({ ...garden, plants: [{ ...garden.plants[0], kind: 'toString' }] })
  bad.push({ ...garden, plants: [{ ...garden.plants[0], pot: 9 }] })
  bad.push({ ...garden, plants: [garden.plants[0], garden.plants[0]] })
  bad.push({ ...garden, plants: Array.from({ length: 7 }, (_, i) => ({ ...garden.plants[0], id: i + 1 })) })
  for (const item of bad) assert.equal(restoreGarden(item, T0), null)
})

test('stored times in the future are pulled back', () => {
  const garden = fresh()
  const later = { ...garden, updatedAt: T0 + DAY, plants: [{ ...garden.plants[0], hydratedUntil: T0 + 99 * DAY, updatedAt: T0 + DAY, fedUntil: T0 + 99 * DAY }] }
  const restored = restoreGarden(later, T0)
  assert.equal(restored.updatedAt, T0)
  assert.equal(restored.plants[0].updatedAt, T0)
  assert.equal(restored.plants[0].hydratedUntil, T0 + KINDS.leafy.hydrated)
  assert.equal(restored.plants[0].fedUntil, T0 + FED_MS)
})

test('a single plant from an older version becomes the first pot of a garden', () => {
  const old = { v: 2, rev: 6, seed: 99, plantedAt: T0 - 9 * DAY, updatedAt: T0, hydratedUntil: T0 + DAY, growthMs: 5 * DAY, cuts: [8, 12], fedUntil: 0, leanAt: 0.2, turnedAt: T0, pot: 0 }
  const garden = restoreGarden(old, T0)
  assert.equal(garden.rev, 6)
  assert.equal(garden.coins, START_COINS)
  assert.equal(garden.plants.length, 1)
  const plant = garden.plants[0]
  assert.equal(plant.kind, 'leafy')
  assert.equal(plant.growthMs, 5 * DAY)
  assert.equal(plant.pot, 2)
  assert.deepEqual(plant.cuts, [12, 20])
  assert.ok(plant.cuts.at(-1) <= nodeCount(plant))
  assert.equal(describePlant(plant, T0).name, 'grown leafy plant')
})

test('the copy with the higher revision is the newer one', () => {
  const garden = fresh()
  const watered = tend(garden, 'water', T0 + HOUR).garden
  assert.ok(isNewer(watered, garden))
  assert.ok(!isNewer(garden, watered))
  assert.ok(isNewer({ ...garden, updatedAt: T0 + 1 }, garden))
})

test('the drawing is valid for every species, stage, mood and pot, and stays a sensible size', () => {
  for (const kind of KIND_IDS) {
    for (const days of [0, 1, 4, 10, 36]) {
      for (const hydratedUntil of [T0 + DAY * 2, T0 + HOUR, T0 - 5 * DAY]) {
        const pot = POTS.findIndex(item => item.days === null || days < item.days)
        const plant = { ...fresh().plants[0], kind, growthMs: days * DAY, hydratedUntil, pot, cuts: days > 3 ? [10, 20] : [], leanAt: 0.8 }
        const view = describePlant(plant, T0)
        const svg = drawPlant(plant, view, 'x')
        assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), kind)
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${kind} ${days}`)
        assert.ok(svg.length < 60_000, `${kind} ${days}: ${svg.length}`)
        const box = measure(plant, view)
        assert.ok(box.top < 0 && box.right > box.left)
      }
    }
    assert.ok(drawSample(kind, 's').includes('data-tip-x'))
  }
})

test('flowers show on a watered, fully grown plant, buds after picking, and nothing when dry', () => {
  const garden = withPlant({ growthMs: 11 * DAY, pot: 3 })
  const draw = (plant, now) => drawPlant(plant, describePlant(plant, now), 'x')
  const uses = (svg, id) => svg.split(`href="#x-${id}"`).length - 1
  assert.ok(uses(draw(garden.plants[0], T0), 'flower') > 0)
  assert.equal(uses(draw({ ...garden.plants[0], pickedAt: T0 }, T0 + HOUR), 'flower'), 0)
  assert.ok(uses(draw({ ...garden.plants[0], pickedAt: T0 }, T0 + HOUR), 'bud') > 0)
  const dry = draw(garden.plants[0], T0 + 6 * DAY)
  assert.equal(uses(dry, 'flower') + uses(dry, 'bud'), 0)
  assert.equal(uses(draw({ ...garden.plants[0], growthMs: 5 * DAY }, T0), 'flower'), 0)
})

test('the summary names every plant, the coins and a waiting bug', () => {
  let garden = tend({ ...fresh(), coins: 50 }, 'buy', T0, { item: 'cactus' }).garden
  const text = summarize(describe(garden, garden.bugAt))
  assert.match(text, /^2 plants, 10 coins, 2 fertilizer\. 1\. seedling leafy plant in a seedling pot, .+; 2\. seedling cactus in a seedling pot, happy\. A bug/)
})

test('parity.json matches the rules (run `npm run parity` after changing one)', () => {
  assert.equal(readFileSync(PARITY_FILE, 'utf8'), buildParity())
})
