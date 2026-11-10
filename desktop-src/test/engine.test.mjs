import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { drawPlant } from '../src/art.js'
import {
  BASE_NODES,
  createPlant,
  DAY,
  describe,
  feed,
  HOUR,
  HYDRATED_MS,
  isNewer,
  leanOf,
  MAX_CUTS,
  nodeCount,
  POTS,
  prune,
  repot,
  restorePlant,
  rotate,
  settle,
  shape,
  water
} from '../src/engine.js'
import { buildParity, PARITY_FILE } from '../scripts/parity.mjs'

const T0 = 1_800_000_000_000
const grown = (days, change = {}) => ({ ...createPlant(T0, 7), growthMs: days * DAY, ...change })

test('a new plant starts watered with no growth', () => {
  const plant = createPlant(T0, 7)
  const view = describe(plant, T0)
  assert.equal(view.mood, 'happy')
  assert.equal(view.stage, 'sapling')
  assert.deepEqual(view.needs, [])
  assert.equal(nodeCount(plant), BASE_NODES)
})

test('growth counts only while watered', () => {
  const plant = createPlant(T0, 7)
  assert.equal(settle(plant, T0 + DAY).growthMs, DAY)
  assert.equal(settle(plant, T0 + 10 * DAY).growthMs, HYDRATED_MS)
})

test('a clock moved backwards adds no growth and loses none', () => {
  const plant = settle(createPlant(T0, 7), T0 + DAY)
  assert.equal(settle(plant, T0).growthMs, DAY)
  assert.equal(settle(plant, T0).updatedAt, T0 + DAY)
})

test('moods follow the water: happy, thirsty, then droopy with growth paused', () => {
  const plant = createPlant(T0, 7)
  assert.equal(describe(plant, T0 + 2.5 * DAY).mood, 'thirsty')
  const dry = describe(plant, T0 + 4 * DAY)
  assert.equal(dry.mood, 'droopy')
  assert.equal(dry.growing, false)
  assert.deepEqual(dry.needs, ['water'])
  assert.ok(dry.droop > 0.2 && dry.droop <= 1)
  assert.equal(describe(plant, T0 + 400 * DAY).droop, 1)
})

test('watering a dry plant brings it back and keeps its growth', () => {
  const { plant, done } = water(createPlant(T0, 7), T0 + 5 * DAY)
  assert.equal(done, true)
  assert.equal(plant.growthMs, HYDRATED_MS)
  assert.equal(describe(plant, T0 + 5 * DAY).mood, 'happy')
  assert.equal(describe(plant, T0 + 5 * DAY).growing, true)
  assert.equal(plant.rev, 2)
})

test('feeding adds half again to growth for two days, and cannot be stacked', () => {
  const fed = feed(createPlant(T0, 7), T0)
  assert.equal(fed.done, true)
  assert.equal(settle(fed.plant, T0 + DAY).growthMs, 1.5 * DAY)
  assert.equal(settle(fed.plant, T0 + 3 * DAY).growthMs, 4 * DAY)
  assert.equal(feed(fed.plant, T0 + DAY).done, false)
  assert.equal(feed(fed.plant, T0 + 2 * DAY).done, true)
})

test('feeding a dry plant does nothing until it is watered', () => {
  const dry = feed(createPlant(T0, 7), T0 + 5 * DAY).plant
  assert.equal(settle(dry, T0 + 6 * DAY).growthMs, HYDRATED_MS)
})

test('the pot caps growth until the plant is repotted', () => {
  let plant = grown(6.9)
  plant = water(plant, T0).plant
  plant = water(plant, T0 + 2 * DAY).plant
  assert.equal(plant.growthMs, 7 * DAY)
  const view = describe(plant, T0 + 2 * DAY)
  assert.equal(view.mood, 'root-bound')
  assert.equal(view.growing, false)
  assert.deepEqual(view.needs, ['repot'])
  const moved = repot(plant, T0 + 2 * DAY)
  assert.equal(moved.done, true)
  assert.equal(moved.plant.pot, 1)
  assert.equal(settle(moved.plant, T0 + 3 * DAY).growthMs, 8 * DAY)
})

test('repotting waits until the roots have filled most of the pot, and stops at the largest', () => {
  assert.equal(repot(grown(2), T0).done, false)
  assert.equal(repot(grown(5.7), T0).done, true)
  assert.equal(repot(grown(300, { pot: POTS.length - 1 }), T0).done, false)
  assert.equal(describe(grown(300, { pot: POTS.length - 1 }), T0).growing, true)
})

test('a plant leans over ten days, and rotating swings it back', () => {
  const plant = createPlant(T0, 7)
  assert.equal(leanOf(plant, T0), 0)
  assert.equal(leanOf(plant, T0 + 5 * DAY), 0.5)
  assert.equal(leanOf(plant, T0 + 60 * DAY), 1)
  assert.deepEqual(describe(water(plant, T0 + 5 * DAY).plant, T0 + 5 * DAY).needs, [])
  assert.deepEqual(describe(water(plant, T0 + 7 * DAY).plant, T0 + 7 * DAY).needs, ['rotate'])
  const turned = rotate(plant, T0 + 10 * DAY).plant
  assert.equal(leanOf(turned, T0 + 10 * DAY), -1)
  assert.equal(leanOf(turned, T0 + 20 * DAY), 0)
})

test('pruning needs new growth between cuts', () => {
  const first = prune(grown(2), T0)
  assert.equal(first.done, true)
  assert.equal(prune(first.plant, T0).done, false)
  const later = prune(first.plant, T0 + DAY)
  assert.equal(later.done, true)
  assert.equal(later.plant.cuts.length, 2)
})

test('a refused action leaves the plant and its revision alone', () => {
  const plant = grown(2)
  for (const action of [repot, p => feed({ ...p, fedUntil: T0 + DAY }, T0)]) {
    const result = action(plant, T0)
    assert.equal(result.done, false)
    assert.equal(result.plant.rev, 1)
  }
})

test('stages come at 7, 21 and 45 days of growth', () => {
  const stage = days => describe(grown(days, { pot: 3 }), T0).stage
  assert.deepEqual([0, 6.9, 7, 21, 44.9, 45].map(stage), ['sapling', 'sapling', 'young plant', 'mature plant', 'mature plant', 'flowering'])
})

test('the same seed and cuts always give the same shape, and seeds differ', () => {
  const a = JSON.stringify(shape({ seed: 7, cuts: [10, 20] }, 30).stems.map(s => s.segments))
  const b = JSON.stringify(shape({ seed: 7, cuts: [10, 20] }, 30).stems.map(s => s.segments))
  const c = JSON.stringify(shape({ seed: 8, cuts: [10, 20] }, 30).stems.map(s => s.segments))
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('each cut stops one tip and starts two shoots, and no shoot is left hanging', () => {
  const count = cuts => {
    const stems = shape({ seed: 7, cuts }, 40).stems
    return { cut: stems.filter(stem => stem.cut).length, grownFromCuts: stems.filter(stem => stem.parent?.cut && !stem.natural).length }
  }
  assert.deepEqual(count([]), { cut: 0, grownFromCuts: 0 })
  assert.deepEqual(count([12]), { cut: 1, grownFromCuts: 2 })
  assert.deepEqual(count([12, 20, 28]), { cut: 3, grownFromCuts: 6 })
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const stem of shape({ seed, cuts: [5, 6, 7, 9, 12, 13, 20, 21, 22, 30] }, 44).stems) {
      if (stem.parent) assert.ok(stem.at <= stem.parent.segments.length)
    }
  }
})

test('stored data is checked before it is trusted', () => {
  const plant = createPlant(T0, 7)
  assert.deepEqual(restorePlant(JSON.parse(JSON.stringify(plant)), T0), plant)
  for (const bad of [null, 'x', {}, { ...plant, v: 9 }, { ...plant, pot: 4 }, { ...plant, pot: 0.5 }, { ...plant, cuts: 'no' }, { ...plant, growthMs: -1 }, { ...plant, rev: 0 }, { ...plant, leanAt: NaN }, { ...plant, cuts: Array(MAX_CUTS + 1).fill(1) }]) {
    assert.equal(restorePlant(bad, T0), null)
  }
})

test('stored times in the future are pulled back', () => {
  const plant = restorePlant({ ...createPlant(T0, 7), hydratedUntil: T0 + 900 * DAY, fedUntil: T0 + 900 * DAY, updatedAt: T0 + DAY, turnedAt: T0 + DAY }, T0)
  assert.equal(plant.hydratedUntil, T0 + HYDRATED_MS)
  assert.equal(plant.fedUntil, T0 + 2 * DAY)
  assert.equal(plant.updatedAt, T0)
  assert.equal(plant.turnedAt, T0)
})

test('a version 1 plant is carried over', () => {
  const old = { v: 1, seed: 7, plantedAt: T0 - 9 * DAY, hydratedUntil: T0 + DAY, growthMs: 8 * DAY, updatedAt: T0 - HOUR, cuts: [16] }
  const plant = restorePlant(old, T0)
  assert.equal(plant.v, 2)
  assert.equal(plant.pot, 1)
  assert.equal(plant.growthMs, 8 * DAY)
  assert.deepEqual(plant.cuts, [18])
  assert.equal(describe(plant, T0).growing, true)
})

test('the copy with the higher revision is the newer one', () => {
  const plant = createPlant(T0, 7)
  const watered = water(plant, T0 + HOUR).plant
  assert.equal(isNewer(watered, plant), true)
  assert.equal(isNewer(plant, watered), false)
  assert.equal(isNewer(plant, plant), false)
})

test('the drawing is valid for every stage, mood and pot, and stays a sensible size', () => {
  for (const days of [0, 3, 10, 30, 60, 200]) {
    for (const dry of [0, 2, 9]) {
      for (const cuts of [[], [8, 12, 16, 22, 30]]) {
        const plant = grown(days, { cuts, hydratedUntil: T0 - dry * DAY + (dry ? 0 : DAY * 2), fedUntil: days > 20 ? T0 + DAY : 0, pot: Math.min(3, Math.floor(days / 10)), leanAt: dry ? 1 : -0.4 })
        const svg = drawPlant(plant, describe(plant, T0))
        assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'))
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `bad number at ${days} days`)
        assert.ok(svg.length < 60_000, `drawing too large at ${days} days: ${svg.length}`)
      }
    }
  }
})

test('flowers appear only on a watered flowering plant', () => {
  const flowering = grown(50, { pot: 3 })
  assert.ok(drawPlant(flowering, describe(flowering, T0)).includes('#hp-flower"'))
  assert.ok(!drawPlant(flowering, describe(flowering, T0 + 9 * DAY)).includes('#hp-flower"'))
  const young = grown(10, { pot: 1 })
  assert.ok(!drawPlant(young, describe(young, T0)).includes('#hp-flower"'))
})

test('parity.json matches the rules (run `npm run parity` after changing one)', () => {
  assert.equal(readFileSync(PARITY_FILE, 'utf8'), buildParity())
})
