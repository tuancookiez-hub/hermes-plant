import { useSyncExternalStore } from 'react'
import * as sdk from '@hermes/plugin-sdk'

import { drawPlant } from './art.js'
import { ACTIONS, createPlant, describe, isNewer, restorePlant, STAGES, summarize } from './engine.js'
import { ACTIONS as WHEEL, createOverlay } from './overlay.js'

const ID = 'hermes-plant'
const REFRESH_MS = 60_000
const NOTE_MS = 6000
const BACKEND_RETRY_MS = 5 * 60_000
const KEYBINDS_AREA = sdk.KEYBINDS_AREA ?? 'keybinds'
const PALETTE_AREA = sdk.PALETTE_AREA ?? 'palette'
const DEFAULT_KEYS = { wheel: ['mod+alt+h'], water: ['mod+alt+w'] }
const NEED_LINES = {
  repot: 'My roots have filled this pot. Repot me and I can keep growing.',
  rotate: "I'm leaning toward the light. Rotate me to straighten up.",
  water: "I'm getting thirsty."
}

/** Peer, secondary, HUD and browser windows share this storage, so only the main window has a plant. */
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

const label = view => `Houseplant: ${summarize(view)}`

function Sprout({ store, onToggle }) {
  const { hidden, note, view } = useSyncExternalStore(store.subscribe, store.get)
  const text = note || (hidden || view.mood !== 'happy' ? view.mood : '')
  return (
    <button
      aria-label={`${label(view)}. ${hidden ? 'Show' : 'Hide'} plant`}
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
  description: 'A calm houseplant that grows slowly in real time.',
  register(ctx) {
    if (!isMainWindow()) return

    const start = Date.now()
    let plant = restorePlant(ctx.storage.get('plant', null), start)
    if (!plant) {
      plant = createPlant(start, crypto.getRandomValues(new Uint32Array(1))[0])
      ctx.storage.set('plant', plant)
    }
    let ui = ctx.storage.get('ui', {})
    if (typeof ui !== 'object' || ui === null) ui = {}

    const saveUi = change => {
      ui = { ...ui, ...change }
      ctx.storage.set('ui', ui)
    }

    const store = createStore({ hidden: ui.hidden === true, note: '', view: describe(plant, start) })
    let disposed = false
    let drawn = ''
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

    /** The reply to something the user just did: beside the plant when it is on screen. */
    const reply = text => {
      if (petVisible()) ctx.pet.say(text, { id: 'plant', ttlMs: NOTE_MS })
      else if (store.get().hidden) statusNote(text)
      else overlay.say(text)
    }

    const notice = view => {
      const needs = view.needs.join(',')
      if (needs !== (ui.told ?? '')) {
        const told = String(ui.told ?? '').split(',')
        const fresh = view.needs.find(need => !told.includes(need))
        saveUi({ told: needs })
        if (fresh) announce(view.mood === 'droopy' && fresh === 'water' ? "I've dried out, so I've stopped growing. Water me." : NEED_LINES[fresh])
      }
      if (view.stage !== ui.stage) {
        const rank = name => STAGES.findIndex(stage => stage.name === name)
        if (ui.stage && rank(view.stage) > rank(ui.stage)) announce(`I've grown into a ${view.stage}.`)
        saveUi({ stage: view.stage })
      }
    }

    const refresh = () => {
      if (disposed) return
      const view = describe(plant, Date.now())
      const signature = JSON.stringify([plant.rev, view.nodes, view.mood, view.stage, view.droop.toFixed(2), view.lean.toFixed(2), view.fed, view.pot])
      if (signature === drawn) return
      drawn = signature
      overlay.render(drawPlant(plant, view), label(view))
      overlay.setNeeds(view.needs)
      store.set({ view })
      notice(view)
    }

    const push = async () => {
      if (backend !== true) return
      try {
        await ctx.rest('/state', { method: 'POST', body: { plant } })
      } catch {
        backend = false
      }
    }

    /** Agent tools change the plant in the backend. The copy with the higher revision wins. */
    const pull = async force => {
      const time = Date.now()
      if (typeof ctx.rest !== 'function' || (backend === false && !force && time - lastTry < BACKEND_RETRY_MS)) return false
      lastTry = time
      try {
        const result = await ctx.rest('/state')
        if (!result?.ok) throw new Error('backend off')
        backend = true
        if (disposed) return false
        const remote = restorePlant(result.plant, Date.now())
        if (remote && isNewer(remote, plant)) {
          plant = remote
          ctx.storage.set('plant', plant)
          refresh()
          return true
        }
        if (!remote || isNewer(plant, remote)) await push()
      } catch {
        backend = false
      }
      return false
    }

    const ask = () => {
      const view = describe(plant, Date.now())
      const needs = view.needs.length ? ` It needs: ${view.needs.join(', ')}.` : ''
      const text = `How is my houseplant doing? Right now it is a ${summarize(view)}, with ${view.waterHours} hours of water left.${needs}`
      let sent = false
      try {
        const sessions = [sdk.host?.state?.focusedSessionId?.get?.(), null]
        sent = sessions.some(id => id !== undefined && sdk.host.composer.submit(id, text))
      } catch {
        sent = false
      }
      return { done: sent, message: sent ? 'Asked Hermes.' : 'Open a chat first, then ask again.' }
    }

    const run = id => {
      if (id === 'ask') return ask()
      const result = ACTIONS[id](plant, Date.now())
      if (result.done) {
        plant = result.plant
        ctx.storage.set('plant', plant)
        refresh()
        void push()
      }
      return result
    }

    const effect = (id, done) => {
      if (done && id !== 'ask' && !store.get().hidden) overlay.effect(id === 'water' ? 'hp-water' : 'hp-done')
    }

    const overlay = createOverlay({
      ctx,
      position: ui.position,
      onMoved: position => saveUi({ position }),
      onAction: id => {
        const result = run(id)
        if (!petVisible()) return { done: result.done, text: result.message }
        reply(result.message)
        return { done: result.done }
      }
    })

    const setHidden = hidden => {
      saveUi({ hidden })
      overlay.setHidden(hidden)
      store.set({ hidden })
    }

    /** A care action from the palette or a key. */
    const command = id => {
      const result = run(id)
      reply(result.message)
      effect(id, result.done)
    }

    const openWheel = () => {
      if (store.get().hidden) setHidden(false)
      overlay.toggleWheel()
    }

    overlay.setHidden(store.get().hidden)
    refresh()

    const details = {
      feed: () => (store.get().view.fed ? 'fed' : 'not fed'),
      repot: () => store.get().view.potName,
      water: () => `${store.get().view.waterHours} h of water left`
    }

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
          label: 'Houseplant: show or hide',
          detail: () => (store.get().hidden ? 'hidden' : 'shown'),
          detailVariant: 'state',
          keepOpen: true,
          keywords: ['plant', 'houseplant', 'hide', 'show'],
          run: () => setHidden(!store.get().hidden)
        }
      },
      ...WHEEL.map(action => ({
        area: PALETTE_AREA,
        id: `palette-${action.id}`,
        data: {
          id: `${ID}.${action.id}`,
          action: `${ID}.${action.id}`,
          label: `Houseplant: ${action.label.toLowerCase()}`,
          detail: details[action.id],
          keywords: ['plant', 'houseplant', action.id],
          run: () => command(action.id)
        }
      })),
      { area: KEYBINDS_AREA, id: 'key-wheel', data: { id: `${ID}.wheel`, category: 'view', defaults: DEFAULT_KEYS.wheel, label: 'Houseplant: open care wheel', run: openWheel } },
      ...WHEEL.map(action => ({
        area: KEYBINDS_AREA,
        id: `key-${action.id}`,
        data: { id: `${ID}.${action.id}`, category: 'view', defaults: DEFAULT_KEYS[action.id] ?? [], label: `Houseplant: ${action.label.toLowerCase()}`, run: () => command(action.id) }
      }))
    ])

    ctx.onEvent?.(`plugin.${ID}.changed`, event => {
      void pull(true).then(changed => {
        if (changed) effect(event?.payload?.action, true)
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
