// Writes test/parity.json: care actions at set times with the plant and its description after each
// one, taken from engine.js. tests/test_parity.py replays the file through plantcore/engine.py, and
// test/engine.test.mjs checks that the file is current. Run `npm run parity` after changing a rule.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ACTIONS, createPlant, DAY, describe, HOUR, summarize } from '../src/engine.js'

const T0 = 1_800_000_000_000
const NAMES = ['water', 'water', 'water', 'prune', 'rotate', 'feed', 'repot', null]

function random(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function buildParity() {
  const scenarios = []
  for (let seed = 1; seed <= 12; seed++) {
    const rng = random(seed)
    let plant = createPlant(T0, seed * 7919)
    let now = T0
    const steps = []
    for (let i = 0; i < 60; i++) {
      // Mostly short gaps with the odd long absence, and now and then a clock that went backwards.
      const roll = rng()
      now += roll < 0.05 ? -Math.floor(rng() * 6 * HOUR) : roll < 0.85 ? Math.floor(rng() * 2 * DAY) : Math.floor(rng() * 9 * DAY)
      const action = NAMES[Math.floor(rng() * NAMES.length)]
      let done = null
      let message = null
      if (action) {
        const result = ACTIONS[action](plant, now)
        plant = result.plant
        done = result.done
        message = result.message
      }
      const view = describe(plant, now)
      steps.push({ now, action, done, message, plant, view, summary: summarize(view) })
    }
    scenarios.push({ start: T0, seed: seed * 7919, steps })
  }
  return `${JSON.stringify({ scenarios })}\n`
}

export const PARITY_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'parity.json')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(PARITY_FILE, buildParity())
  console.log(`wrote ${PARITY_FILE}`)
}
