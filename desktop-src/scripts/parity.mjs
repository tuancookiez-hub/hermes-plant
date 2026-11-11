// Writes test/parity.json: actions at set times with the garden and its description after each one,
// taken from engine.js. tests/test_parity.py replays the file through plantcore/engine.py, and
// test/engine.test.mjs checks that the file is current. Run `npm run parity` after changing a rule.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createGarden, DAY, describe, HOUR, restoreGarden, SHOP_ITEMS, summarize, tend } from '../src/engine.js'

const T0 = 1_800_000_000_000
const NAMES = ['water', 'water', 'water', 'prune', 'prune', 'rotate', 'feed', 'repot', 'pick', 'sell', 'buy', 'buy', 'shoo', 'shoo', null]
// Every other scenario is an attentive gardener, so plants live long enough to be repotted and picked.
const ATTENTIVE = ['water', 'water', 'water', 'water', 'repot', 'repot', 'pick', 'pick', 'prune', 'feed', 'buy', 'shoo', 'sell', null]

function random(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Saves from the two older versions, which held a single plant. Both engines must upgrade them alike. */
const OLD_SAVES = [
  { v: 1, seed: 77, plantedAt: T0 - 9 * DAY, updatedAt: T0 - DAY, hydratedUntil: T0 + DAY, growthMs: 5 * DAY, cuts: [6, 9] },
  { v: 2, rev: 14, seed: 4242, plantedAt: T0 - 30 * DAY, updatedAt: T0 - 2 * HOUR, hydratedUntil: T0 + 2 * DAY, growthMs: 12 * DAY, cuts: [8, 15, 22], fedUntil: T0 + DAY, leanAt: 0.3, turnedAt: T0 - 3 * DAY, pot: 1 },
  { v: 3, rev: 9, seed: 5, updatedAt: T0, coins: 31, fertilizer: 1, bugAt: T0 + HOUR, nextId: 3, plants: [{ id: 2, kind: 'fern', seed: 8, plantedAt: T0 - DAY, updatedAt: T0, hydratedUntil: T0 + DAY, growthMs: 3 * DAY, cuts: [9, 6, 6], fedUntil: 0, leanAt: 0, turnedAt: T0, pot: 1, pickedAt: 0 }] },
  { v: 3, rev: 9, seed: 5, updatedAt: T0, coins: 31, fertilizer: 1, bugAt: T0 + HOUR, nextId: 3, plants: [{ id: 2, kind: 'leafy', seed: 8, plantedAt: T0 - DAY, updatedAt: T0, hydratedUntil: T0 + DAY, growthMs: 3 * DAY, cuts: [9, 6, 6], picks: [2, -1, 5], fedUntil: 0, leanAt: 0, turnedAt: T0, pot: 1, pickedAt: 0 }] },
  { v: 2, rev: 3, seed: 9, plantedAt: T0 - DAY, updatedAt: T0 - DAY, hydratedUntil: T0 - HOUR, growthMs: 0, cuts: [], fedUntil: 0, leanAt: 0, turnedAt: T0 - DAY, pot: 0 }
]

export function buildParity() {
  const scenarios = []
  for (let seed = 1; seed <= 8; seed++) {
    const names = seed % 2 ? NAMES : ATTENTIVE
    const rng = random(seed)
    let garden = createGarden(T0, seed * 7919)
    let now = T0
    const steps = []
    for (let i = 0; i < 70; i++) {
      // Mostly short gaps with the odd long absence, and now and then a clock that went backwards.
      const roll = rng()
      now += roll < 0.05 ? -Math.floor(rng() * 6 * HOUR) : roll < 0.85 || names === ATTENTIVE ? Math.floor(rng() * 1.5 * DAY) : Math.floor(rng() * 9 * DAY)
      const action = names[Math.floor(rng() * names.length)]
      // Half the time the action names a plant, and sometimes one that isn't there.
      const pickRoll = rng()
      const plant = action === 'sell' || pickRoll < 0.5 ? (pickRoll < 0.04 ? 99 : garden.plants[Math.floor(rng() * garden.plants.length)].id) : null
      const item = action === 'buy' ? (rng() < 0.08 ? 'gnome' : SHOP_ITEMS[Math.floor(rng() * SHOP_ITEMS.length)]) : null
      // Some cuts choose a tip, and now and then a tip that makes no sense.
      const tipRoll = action === 'prune' ? rng() : 1
      const tip = tipRoll < 0.5 ? Math.floor(rng() * 9) : tipRoll < 0.56 ? [-3, 2.5, 500, 'top'][Math.floor(rng() * 4)] : null
      let result = null
      if (action) {
        const outcome = tend(garden, action, now, { item, plant, tip })
        garden = outcome.garden
        result = { coins: outcome.coins, done: outcome.done, message: outcome.message, plant: outcome.plant }
      }
      const view = describe(garden, now)
      steps.push({ now, action, plant, item, tip, result, garden, view, summary: summarize(view) })
    }
    scenarios.push({ start: T0, seed: seed * 7919, steps })
  }
  const upgrades = OLD_SAVES.map(save => ({ now: T0, save, garden: restoreGarden(save, T0) }))
  return `${JSON.stringify({ scenarios, upgrades })}\n`
}

export const PARITY_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'parity.json')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(PARITY_FILE, buildParity())
  console.log(`wrote ${PARITY_FILE}`)
}
