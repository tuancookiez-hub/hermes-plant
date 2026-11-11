import { useSyncExternalStore } from 'react'
import * as sdk from '@hermes/plugin-sdk'

import { drawPlant } from './art.js'
import { CARE_ACTIONS, createGarden, describe, isNewer, restoreGarden, summarize, summarizePlant, tend } from './engine.js'
import { ACTIONS as WHEEL, createOverlay } from './overlay.js'

const ID = 'hermes-plant'
const REFRESH_MS = 60_000
const NOTE_MS = 6000
const BACKEND_RETRY_MS = 5 * 60_000
const KEYBINDS_AREA = sdk.KEYBINDS_AREA ?? 'keybinds'
const PALETTE_AREA = sdk.PALETTE_AREA ?? 'palette'
const DEFAULT_KEYS = { wheel: ['mod+alt+h'], water: ['mod+alt+w'] }
const NEED_LINES = {
  repot: name => `The ${name} has filled its pot. Repot it and it can keep growing.`,
  rotate: name => `The ${name} is leaning toward the light. Rotate it to straighten up.`,
  water: name => `The ${name} is getting thirsty.`
}

/** Peer, secondary, HUD and browser windows share this storage, so only the main window has a garden. */
function isMainWindow() {
  const query = new URLSearchParams(window.location.search)
  return !query.get('win') && query.get('peer') !== '1' && query.get('watch') !== '1'
}

function createStore(initial) {
  let value = initial
  const listeners = new Set()
  return {
    get: () => value,
    set(change) {
      value = { ...value, ...change }
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

const label = view => `Garden: ${view.plants.length === 1 ? summarizePlant(view.plants[0]) : `${view.plants.length} plants`}, ${view.coins} coins`

function Sprout({ store, onToggle }) {
  const { hidden, note, view } = useSyncExternalStore(store.subscribe, store.get)
  const waiting = view.needy ? (view.plants.length === 1 ? view.plants[0].mood : `${view.needy} need care`) : view.bug !== null ? 'a bug!' : ''
  const text = note || waiting
  return (
    <button
      aria-label={`${label(view)}. ${hidden ? 'Show' : 'Hide'} garden`}
      data-hermes-plant="sprout"
      onClick={onToggle}
      style={{ alignItems: 'center', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', display: 'inline-flex', font: 'inherit', gap: 4, maxWidth: 320, padding: 0 }}
      title={`${label(view)}. Click to ${hidden ? 'show' : 'hide'}.`}
      type="button"
    >
      <svg aria-hidden="true" fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" viewBox="0 0 16 16" width="13">
        <path d="M8 15V7M8 9.5C4.5 9.5 2.5 7 2.5 4 6 4 8 6.5 8 9.5zM8 7c0-3 2-5 5.5-5 0 3-2 5-5.5 5z" />
      </svg>
      {text && (
        <span aria-live="polite" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {text}
        </span>
      )}
    </button>
  )
}

export default {
  id: ID,
  name: 'Houseplant',
  description: 'A calm little garden that grows in real time.',
  register(ctx) {
    if (!isMainWindow()) return

    const start = Date.now()
    // Versions before 1.1 kept a single plant under `plant`. It becomes the garden's first pot.
    let garden = restoreGarden(ctx.storage.get('garden', null), start) ?? restoreGarden(ctx.storage.get('plant', null), start)
    if (!garden) garden = createGarden(start, crypto.getRandomValues(new Uint32Array(1))[0])
    ctx.storage.set('garden', garden)
    let ui = ctx.storage.get('ui', {})
    if (typeof ui !== 'object' || ui === null) ui = {}

    const saveUi = change => {
      ui = { ...ui, ...change }
      ctx.storage.set('ui', ui)
    }

    const store = createStore({ hidden: ui.hidden === true, note: '', view: describe(garden, start) })
    const drawn = new Map()
    let disposed = false
    let lastSignature = ''
    let stopNote = null
    let backend = null
    let lastTry = 0
    ctx.onDispose(() => {
      disposed = true
    })

    const petVisible = () => {
      try {
        return !!ctx.pet?.visible?.get?.()
      } catch {
        return false
      }
    }

    const statusNote = text => {
      stopNote?.()
      store.set({ note: text })
      stopNote = ctx.setTimeout(() => store.set({ note: '' }), NOTE_MS)
    }

    /** Says a line through the pet when one is showing, and through the status bar otherwise. */
    const announce = text => {
      if (petVisible()) ctx.pet.say(text, { id: 'plant', ttlMs: NOTE_MS })
      else statusNote(text)
    }

    /** The reply to something the user just did: beside the plant when the garden is on screen. */
    const reply = (text, plant) => {
      if (petVisible()) ctx.pet.say(text, { id: 'plant', ttlMs: NOTE_MS })
      else if (store.get().hidden) statusNote(text)
      else overlay.say(text, plant)
    }

    /** Speaks up when a plant starts to need something, grows a stage, or gets a bug. One line at a time. */
    const notice = view => {
      const told = typeof ui.told === 'object' && ui.told !== null ? ui.told : {}
      const stages = typeof ui.stages === 'object' && ui.stages !== null ? ui.stages : {}
      const nextTold = {}
      const nextStages = {}
      let line = ''
      for (const plant of view.plants) {
        const before = String(told[plant.id] ?? '').split(',')
        const fresh = plant.needs.find(need => !before.includes(need))
        nextTold[plant.id] = plant.needs.join(',')
        nextStages[plant.id] = plant.stage
        if (fresh && !line) line = plant.mood === 'droopy' && fresh === 'water' ? `The ${plant.kindName} has dried out and stopped growing. Water it.` : NEED_LINES[fresh](plant.kindName)
        if (stages[plant.id] !== undefined && plant.stage > stages[plant.id]) {
          line ||= `The ${plant.kindName} has grown. It is now a ${plant.name}.`
          if (!store.get().hidden) overlay.effect('grow', plant.id)
        }
      }
      if (view.bug !== null && ui.bugAt !== garden.bugAt) {
        const plant = view.plants.find(item => item.id === view.bug)
        line ||= `A bug has landed on the ${plant.kindName}. Click it away for coins.`
      }
      const changed = JSON.stringify([nextTold, nextStages]) !== JSON.stringify([told, stages]) || (view.bug !== null && ui.bugAt !== garden.bugAt)
      if (changed) saveUi({ bugAt: view.bug !== null ? garden.bugAt : ui.bugAt, stages: nextStages, told: nextTold })
      if (line) announce(line)
    }

    const refresh = () => {
      if (disposed) return
      const view = describe(garden, Date.now())
      const drawings = new Map()
      for (const [id] of drawn) if (!view.plants.some(plant => plant.id === id)) drawn.delete(id)
      view.plants.forEach((plant, i) => {
        const record = garden.plants[i]
        const signature = JSON.stringify([record.cuts.length, plant.nodes, plant.droop.toFixed(2), plant.lean.toFixed(2), plant.fed, plant.pot, plant.show])
        let drawing = drawn.get(plant.id)
        if (drawing?.signature !== signature) {
          drawing = { signature, svg: drawPlant(record, plant, `hp${plant.id}`) }
          drawn.set(plant.id, drawing)
        }
        drawings.set(plant.id, { label: `${summarizePlant(plant)}. Sells for ${plant.value} coins`, svg: drawing.svg })
      })
      const signature = JSON.stringify([garden.rev, view.bug, view.plants.map(plant => [drawn.get(plant.id).signature, plant.mood, plant.stage, plant.needs, plant.canPick, plant.canPrune, plant.canRepot, plant.value])])
      if (signature === lastSignature) return
      lastSignature = signature
      overlay.render(view, drawings)
      store.set({ view })
      notice(view)
    }

    const save = next => {
      garden = next
      ctx.storage.set('garden', garden)
    }

    const push = async () => {
      if (backend !== true) return
      try {
        await ctx.rest('/state', { method: 'POST', body: { garden } })
      } catch {
        backend = false
      }
    }

    /** Agent tools change the garden in the backend. The copy with the higher revision wins. */
    const pull = async force => {
      const time = Date.now()
      if (typeof ctx.rest !== 'function' || (backend === false && !force && time - lastTry < BACKEND_RETRY_MS)) return false
      lastTry = time
      try {
        const result = await ctx.rest('/state')
        if (!result?.ok) throw new Error('backend off')
        backend = true
        if (disposed) return false
        const remote = restoreGarden(result.garden, Date.now())
        if (remote && isNewer(remote, garden)) {
          save(remote)
          refresh()
          return true
        }
        if (!remote || isNewer(garden, remote)) await push()
      } catch {
        backend = false
      }
      return false
    }

    const ask = plant => {
      const view = describe(garden, Date.now())
      const one = view.plants.find(item => item.id === plant)
      const subject = one && view.plants.length > 1 ? ` I am asking about plant ${view.plants.indexOf(one) + 1}, the ${one.kindName}.` : ''
      const text = `How is my garden doing? Right now: ${summarize(view)}${subject}`
      let sent = false
      try {
        const sessions = [sdk.host?.state?.focusedSessionId?.get?.(), null]
        sent = sessions.some(id => id !== undefined && sdk.host.composer.submit(id, text))
      } catch {
        sent = false
      }
      return { coins: 0, done: sent, message: sent ? 'Asked Hermes.' : 'Open a chat first, then ask again.', plant: plant ?? null }
    }

    /** Runs one action. With no plant named, a care action goes to the plant that wants it most. */
    const run = (action, options = {}) => {
      if (action === 'ask') return ask(options.plant)
      const result = tend(garden, action, Date.now(), options)
      if (result.done) {
        save(result.garden)
        refresh()
        void push()
      }
      return result
    }

    const overlay = createOverlay({
      ctx,
      position: ui.position,
      onMoved: position => saveUi({ position }),
      onAction: (action, options) => {
        const result = run(action, options)
        const shown = { coins: result.coins, done: result.done, message: result.message, plant: result.plant }
        if (!petVisible() || action === 'buy') return { ...shown, text: result.message }
        reply(result.message, result.plant)
        return shown
      }
    })

    const setHidden = hidden => {
      saveUi({ hidden })
      overlay.setHidden(hidden)
      store.set({ hidden })
    }

    /** An action from the palette or a key. */
    const command = action => {
      const result = run(action)
      reply(result.message, result.plant)
      if (result.done && action !== 'ask' && !store.get().hidden) overlay.effect(action, result.plant, result.coins)
    }

    const show = () => {
      if (store.get().hidden) setHidden(false)
    }

    const openWheel = () => {
      show()
      overlay.toggleWheel()
    }

    const openShop = () => {
      show()
      overlay.toggleShop()
    }

    overlay.setHidden(store.get().hidden)
    refresh()

    const view = () => store.get().view
    const details = {
      feed: () => `${view().fertilizer} fertilizer`,
      pick: () => (view().plants.some(plant => plant.canPick) ? 'ready' : 'nothing ready'),
      repot: () => (view().plants.some(plant => plant.canRepot) ? 'ready' : 'not needed'),
      water: () => `${Math.min(...view().plants.map(plant => plant.waterHours))} h of water left`
    }
    const commands = [
      ...WHEEL.filter(action => CARE_ACTIONS.includes(action.id) || action.id === 'ask').map(action => ({ id: action.id, label: action.label.toLowerCase(), run: () => command(action.id) })),
      { id: 'shoo', label: 'shoo the bug away', run: () => command('shoo') },
      { id: 'shop', label: 'open the shop', run: openShop }
    ]

    ctx.registerMany([
      { area: sdk.STATUSBAR_AREAS.right, id: 'sprout', render: () => <Sprout onToggle={() => setHidden(!store.get().hidden)} store={store} /> },
      {
        area: PALETTE_AREA,
        id: 'palette-wheel',
        data: { id: `${ID}.wheel`, action: `${ID}.wheel`, label: 'Houseplant: open care wheel', keywords: ['plant', 'houseplant', 'garden'], run: openWheel }
      },
      {
        area: PALETTE_AREA,
        id: 'palette-toggle',
        data: {
          id: `${ID}.toggle`,
          label: 'Houseplant: show or hide the garden',
          detail: () => (store.get().hidden ? 'hidden' : 'shown'),
          detailVariant: 'state',
          keepOpen: true,
          keywords: ['plant', 'houseplant', 'garden', 'hide', 'show'],
          run: () => setHidden(!store.get().hidden)
        }
      },
      ...commands.map(item => ({
        area: PALETTE_AREA,
        id: `palette-${item.id}`,
        data: {
          id: `${ID}.${item.id}`,
          action: `${ID}.${item.id}`,
          label: `Houseplant: ${item.label}`,
          detail: details[item.id] ?? (item.id === 'shop' ? () => `${view().coins} coins` : undefined),
          keywords: ['plant', 'houseplant', 'garden', item.id],
          run: item.run
        }
      })),
      { area: KEYBINDS_AREA, id: 'key-wheel', data: { id: `${ID}.wheel`, category: 'view', defaults: DEFAULT_KEYS.wheel, label: 'Houseplant: open care wheel', run: openWheel } },
      ...commands.map(item => ({
        area: KEYBINDS_AREA,
        id: `key-${item.id}`,
        data: { id: `${ID}.${item.id}`, category: 'view', defaults: DEFAULT_KEYS[item.id] ?? [], label: `Houseplant: ${item.label}`, run: item.run }
      }))
    ])

    ctx.onEvent?.(`plugin.${ID}.changed`, event => {
      void pull(true).then(changed => {
        const action = event?.payload?.action
        if (!changed || store.get().hidden || !CARE_ACTIONS.includes(action)) return
        // The event doesn't say which plant, so the one touched last is the best guess.
        const touched = garden.plants.reduce((best, plant) => (plant.updatedAt > best.updatedAt ? plant : best))
        overlay.effect(action, touched.id)
      })
    })
    ctx.setInterval(() => {
      refresh()
      if (document.visibilityState === 'visible') void pull(false)
    }, REFRESH_MS)
    ctx.addEventListener(window, 'focus', () => {
      refresh()
      void pull(false)
    })
    void pull(true)
  }
}
