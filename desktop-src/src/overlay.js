// The garden on screen: a transparent fixed element above the app, drawn the same way as the Hermes
// pet. Hermes has no plugin area for this, so this file owns its DOM and removes it on dispose.

import { drawSample, INK, PAPER } from './art.js'
import { FERTILIZER_PRICE, KIND_IDS, KINDS, MAX_FERTILIZER } from './engine.js'

const HEIGHT = 200
const EDGE = 100
const RADIUS = 78
const TOP_LIMIT = 56
const BOTTOM_LIMIT = 20
const DEFAULT_POSITION = { right: 8, bottom: 72 }
const DRAG_START = 5
const MESSAGE_MS = 2600
const ARMED_MS = 4000
// Up to three plants are shown large. A fuller garden is drawn smaller so it stays out of the way.
const sizes = count => (count <= 3 ? { plant: 96, step: 82 } : { plant: 78, step: 64 })

const icon = path => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export const ACTIONS = [
  { id: 'water', label: 'Water', hint: view => `lasts ${KINDS[view.kind].hydrated / 86_400_000} days`, icon: icon('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>') },
  { id: 'prune', label: 'Prune', hint: () => 'cut the tallest tip, earn coins', icon: icon('<circle cx="6" cy="18" r="2.5"/><circle cx="6" cy="6" r="2.5"/><path d="M8 7.5 20 18M8 16.5 20 6"/>') },
  { id: 'rotate', label: 'Rotate', hint: () => 'turn it to the light', icon: icon('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 3v5h-5"/>') },
  { id: 'feed', label: 'Fertilize', hint: (view, garden) => `a burst of growth, ${garden.fertilizer} left`, icon: icon('<path d="M8 8h8l2 12H6z"/><path d="M9 8 8 4h8l-1 4"/><path d="M10 13h4"/>') },
  { id: 'repot', label: 'Repot', hint: () => 'a bigger pot, more room', icon: icon('<path d="M6 11h12l-1.5 9h-9z"/><path d="M4.5 8h15v3h-15z"/><path d="M12 8V4M12 4l-2 2M12 4l2 2"/>') },
  { id: 'pick', label: 'Pick', hint: () => 'sell what it has grown', icon: icon('<circle cx="12" cy="8" r="2"/><path d="M12 6V3.5M14 8h2.5M12 10v2.5M10 8H7.5M12 12.5V21M12 17c-3 0-4.5-1.5-4.5-4M12 19c3 0 4.5-1.5 4.5-4"/>') },
  { id: 'sell', label: 'Sell', hint: view => `the whole plant, for ${view.value} coins`, icon: icon('<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8M12 16v1.5"/>') },
  { id: 'ask', label: 'Ask Hermes', hint: () => 'sends a chat message', icon: icon('<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>') }
]

const TRAITS = {
  leafy: 'Easy. Water every 3 days.',
  fern: 'Fast and thirsty. Water every 2 days.',
  cactus: 'Slow. Water every 9 days. Sells well.',
  bonsai: 'A slow little tree. Sells best.'
}

const COIN = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 5v6" stroke-linecap="round"/></svg>'
const SCISSORS =
  '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
  `<g class="hp-blade-a" stroke="${INK}"><path d="M12 12 21 6.5M12 12 8 14.5"/><circle cx="6" cy="16" r="2.5" fill="${PAPER}"/></g>` +
  `<g class="hp-blade-b" stroke="${INK}"><path d="M12 12 21 17.5M12 12 8 9.5"/><circle cx="6" cy="8" r="2.5" fill="${PAPER}"/></g></svg>`
const CLIPPING = `<svg viewBox="-1 -4 12 8" width="16" height="11" stroke="${INK}" stroke-width="1" stroke-linejoin="round" aria-hidden="true"><path d="M0 0C2.5-3 7-2.6 10 0C7.5 2.4 3 3 0 0Z" fill="${PAPER}"/><path d="M0 0L9 0" fill="none"/></svg>`
const BUG =
  `<svg viewBox="0 0 20 20" width="20" height="20" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">` +
  `<path d="M4 7 1.5 5M4 11H1M4.5 14.5 2 16.5M16 7l2.5-2M16 11h3M15.5 14.5 18 16.5M8 4.5 6.5 2M12 4.5 13.5 2" fill="none"/>` +
  `<ellipse cx="10" cy="11" rx="5.5" ry="6.2" fill="${PAPER}"/><path d="M10 5v12" fill="none"/>` +
  `<path d="M5.5 7.5a5.5 4 0 0 1 9 0z" fill="${INK}"/><circle cx="7.5" cy="11" r="1.1" fill="${INK}" stroke="none"/><circle cx="12.5" cy="12.5" r="1.1" fill="${INK}" stroke="none"/><circle cx="8" cy="14.5" r=".9" fill="${INK}" stroke="none"/></svg>`

const CSS = `
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
`

const make = (tag, className, html) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html) node.innerHTML = html
  if (tag === 'button') node.type = 'button'
  return node
}

/**
 * `onAction(action, { plant, item })` runs an action and returns `{ done, text, coins, plant }`.
 * `text` is the line to show here, and is left out when the line is spoken somewhere else.
 */
export function createOverlay({ ctx, position, onAction, onMoved }) {
  const style = make('style')
  style.textContent = CSS

  const box = make('div', 'hp-box')
  box.dataset.hermesPlant = 'box'

  const message = make('div', 'hp-message')
  message.setAttribute('role', 'status')

  const menu = make('div', 'hp-menu')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Plant care')

  const purse = make('button', 'hp-purse')
  purse.dataset.hermesPlant = 'purse'
  purse.setAttribute('aria-haspopup', 'dialog')
  purse.setAttribute('aria-expanded', 'false')

  const bug = make('button', 'hp-bug', BUG)
  bug.dataset.hermesPlant = 'bug'
  bug.setAttribute('aria-label', 'A bug is on this plant. Shoo it away for coins')
  bug.title = 'Shoo the bug away'
  bug.hidden = true

  const shop = make('div', 'hp-shop')
  shop.dataset.hermesPlant = 'shop'
  shop.setAttribute('role', 'dialog')
  shop.setAttribute('aria-label', 'Garden shop')
  const shopCoins = make('span', 'hp-shop-coins')
  const shopHead = make('div', 'hp-shop-head', '<span>Garden shop</span>')
  shopHead.append(shopCoins)
  const shopNote = make('div', 'hp-shop-note')
  shopNote.setAttribute('role', 'status')

  let current = { ...DEFAULT_POSITION, ...position }
  let garden = { bug: null, coins: 0, fertilizer: 0, plants: [], room: 0 }
  let active = null
  let armed = null
  let stopMessage = null
  let stopArmed = null
  let hint = ''
  const plants = new Map()

  const viewOf = id => garden.plants.find(plant => plant.id === id)
  const width = () => 2 * EDGE + Math.max(0, garden.plants.length - 1) * sizes(garden.plants.length).step
  /** The x of a plant's middle inside the box. The first plant is on the right, and new ones go left. */
  const centerOf = id => {
    const index = Math.max(0, garden.plants.findIndex(plant => plant.id === id))
    return width() - EDGE - index * sizes(garden.plants.length).step
  }
  const anchor = () => (viewOf(active) ? active : garden.plants[0]?.id)

  const place = () => {
    const wide = width()
    const x = window.innerWidth - wide - current.right
    const y = window.innerHeight - HEIGHT - current.bottom
    const top = Math.min(Math.max(TOP_LIMIT, y), Math.max(TOP_LIMIT, window.innerHeight - HEIGHT - BOTTOM_LIMIT))
    box.style.width = `${wide}px`
    box.style.left = `${Math.min(Math.max(0, x), Math.max(0, window.innerWidth - wide))}px`
    box.style.top = `${top}px`
    shop.classList.toggle('hp-below', top < 330)
  }

  const hideMessage = () => {
    stopMessage?.()
    stopMessage = null
    hint = ''
    message.classList.remove('hp-show')
  }

  /** Shows a line above a plant. With `ms` of 0 it stays until replaced or cleared. */
  const say = (text, id = anchor(), ms = MESSAGE_MS) => {
    hideMessage()
    if (!text) return
    message.textContent = text
    message.classList.add('hp-show')
    // Keep the whole line inside the window, even for a plant at the screen's edge.
    const half = message.offsetWidth / 2 + 6
    const low = half - box.offsetLeft
    message.style.left = `${Math.max(low, Math.min(centerOf(id), window.innerWidth - half - box.offsetLeft))}px`
    if (ms) stopMessage = ctx.setTimeout(hideMessage, ms)
  }

  const showHint = text => {
    if (stopMessage) return
    say(text, active, 0)
    hint = text
  }

  const clearHint = () => {
    if (hint) hideMessage()
  }

  const disarm = () => {
    stopArmed?.()
    stopArmed = null
    armed = null
    for (const button of buttons) button.classList.remove('hp-armed')
  }

  const isOpen = () => box.classList.contains('hp-open')
  const isShopping = () => box.classList.contains('hp-shopping')

  /** Puts a short-lived element in the box and removes it when its animation is over. */
  const flash = (node, x, y, ms) => {
    node.style.left = `${x}px`
    node.style.top = `${y}px`
    box.append(node)
    ctx.setTimeout(() => node.remove(), ms)
  }

  const pulse = (node, name, ms = 1000) => {
    if (!node) return
    node.classList.remove(name)
    void node.offsetWidth
    node.classList.add(name)
    ctx.setTimeout(() => node.classList.remove(name), ms)
  }

  const floatCoins = (coins, x, y) => {
    if (!coins) return
    const node = make('div', 'hp-float')
    node.textContent = `${coins > 0 ? '+' : '−'}${Math.abs(coins)}`
    flash(node, x, y, 1200)
  }

  /** Where a plant's tallest tip was before its last redraw, inside the box. */
  const tipOf = id => {
    const entry = plants.get(id)
    const size = sizes(garden.plants.length).plant
    const tip = entry?.lastTip ?? { x: 0.5, y: 0.2 }
    return { x: centerOf(id) - size / 2 + tip.x * size, y: HEIGHT / 2 - size / 2 + tip.y * size }
  }

  /** Plays what an action looks like. `id` is the plant it touched, when there is one. */
  const effect = (action, id, coins = 0) => {
    const entry = plants.get(id)
    const x = entry ? centerOf(id) : purse.offsetLeft - purse.offsetWidth / 2
    const size = sizes(garden.plants.length).plant
    if (action === 'water' && entry) {
      ;[-13, 0, 13].forEach((dx, i) => {
        const drop = make('div', 'hp-drop')
        drop.style.setProperty('--hp-delay', `${i * 90}ms`)
        flash(drop, x + dx - 3, HEIGHT / 2 - size / 2 - 8, 900)
      })
      pulse(entry.button, 'hp-done')
    } else if (action === 'prune' && entry) {
      const tip = tipOf(id)
      flash(make('div', 'hp-snip', SCISSORS), tip.x, tip.y, 700)
      flash(make('div', 'hp-clip', CLIPPING), tip.x, tip.y, 1400)
      pulse(entry.button, 'hp-cut')
    } else if (action === 'shoo' && bug.dataset.x) {
      flash(make('div', 'hp-flown', BUG), Number(bug.dataset.x), Number(bug.dataset.y), 800)
    } else if (action === 'buy' && entry) {
      pulse(entry.button, 'hp-new')
    } else if (action === 'feed' || action === 'repot' || action === 'grow') {
      pulse(entry?.button, 'hp-grow')
    } else if (entry) {
      pulse(entry.button, 'hp-done')
    }
    if (coins) {
      floatCoins(coins, entry && action !== 'buy' ? x : purse.offsetLeft - purse.offsetWidth / 2, entry && action !== 'buy' ? HEIGHT / 2 - size / 2 - 6 : HEIGHT / 2 - 6)
      pulse(purse, 'hp-paid')
    }
  }

  const perform = (action, options) => {
    const result = onAction(action, options) ?? {}
    if (result.done) effect(action, result.plant ?? options.plant, result.coins)
    return result
  }

  const labelOf = action => {
    const view = viewOf(active)
    return view ? `${action.label}: ${action.hint(view, garden)}` : action.label
  }

  const buttons = ACTIONS.map((action, i) => {
    const button = make('button', 'hp-action', action.icon)
    const angle = ((-90 + (i * 360) / ACTIONS.length) * Math.PI) / 180
    button.dataset.hermesPlant = action.id
    button.tabIndex = -1
    button.setAttribute('role', 'menuitem')
    button.setAttribute('aria-label', action.label)
    button.style.setProperty('--hp-x', `${Math.round(Math.cos(angle) * RADIUS)}px`)
    button.style.setProperty('--hp-y', `${Math.round(Math.sin(angle) * RADIUS)}px`)
    button.style.setProperty('--hp-delay', `${i * 10}ms`)
    button.addEventListener('pointerenter', () => showHint(labelOf(action)))
    button.addEventListener('pointerleave', clearHint)
    button.addEventListener('focus', () => showHint(labelOf(action)))
    button.addEventListener('blur', clearHint)
    button.addEventListener('click', () => {
      const id = active
      // Selling can't be undone, so the first press only says the price.
      if (action.id === 'sell' && armed !== id && garden.plants.length > 1) {
        disarm()
        armed = id
        button.classList.add('hp-armed')
        stopArmed = ctx.setTimeout(disarm, ARMED_MS)
        say(`Sell for ${viewOf(id)?.value ?? 0} coins? Press again.`, id, ARMED_MS)
        return
      }
      disarm()
      toggle(false, action.id !== 'sell')
      const result = perform(action.id, { plant: id })
      say(result.text, result.done && action.id === 'sell' ? anchor() : id)
    })
    button.addEventListener('keydown', event => {
      const step = { ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1 }[event.key]
      if (step) {
        event.preventDefault()
        buttons[(i + step + buttons.length) % buttons.length].focus()
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        buttons.at(event.key === 'Home' ? 0 : -1).focus()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        toggle(false, true)
      }
    })
    return button
  })

  /** Marks the actions the active plant is waiting for, and dims the ones that would do nothing. */
  const markWheel = () => {
    const view = viewOf(active)
    if (!view) return
    const wanted = [...view.needs, ...(view.canPick ? ['pick'] : []), ...(view.canRepot ? ['repot'] : [])]
    const off = {
      feed: view.fed || garden.fertilizer < 1,
      pick: !view.canPick,
      prune: !view.canPrune,
      repot: !view.canRepot,
      sell: garden.plants.length < 2
    }
    for (const button of buttons) {
      button.classList.toggle('hp-need', wanted.includes(button.dataset.hermesPlant))
      button.classList.toggle('hp-off', !!off[button.dataset.hermesPlant])
    }
  }

  function toggle(open, focusPlant, id = active) {
    hideMessage()
    disarm()
    if (open) {
      toggleShop(false)
      active = viewOf(id) ? id : anchor()
      menu.style.left = `${centerOf(active)}px`
      markWheel()
    }
    box.classList.toggle('hp-open', open)
    for (const [plantId, entry] of plants) entry.button.setAttribute('aria-expanded', String(open && plantId === active))
    for (const button of buttons) button.tabIndex = open ? 0 : -1
    if (open) buttons[0].focus({ preventScroll: true })
    else if (focusPlant) plants.get(active)?.button.focus({ preventScroll: true })
  }

  // The shop.

  const rows = [...KIND_IDS, 'fertilizer'].map(item => {
    const kind = KINDS[item]
    const row = make('div', 'hp-row')
    const picture = kind
      ? make('div', 'hp-sample', drawSample(item, `hps-${item}`))
      : make('div', 'hp-sample', `<svg viewBox="0 0 24 24" width="40" height="40" fill="${PAPER}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M8 9h8l2 11H6z"/><path d="M9 9 8 5h8l-1 4"/><path d="M10 14h4M12 12v4" fill="none"/></svg>`)
    const text = make('div', 'hp-row-text')
    const name = make('div', 'hp-row-name')
    name.textContent = kind ? kind.name : 'fertilizer'
    const trait = make('div', 'hp-row-trait')
    trait.textContent = kind ? TRAITS[item] : ''
    text.append(name, trait)
    const price = kind ? kind.price : FERTILIZER_PRICE
    const buy = make('button', 'hp-buy', `${COIN}<span>${price}</span>`)
    buy.dataset.hermesPlant = `buy-${item}`
    buy.setAttribute('aria-label', `Buy ${kind ? `a ${kind.name}` : 'one fertilizer'} for ${price} coins`)
    buy.addEventListener('click', () => {
      const result = perform('buy', { item })
      shopNote.textContent = result.message ?? result.text ?? ''
    })
    row.append(picture, text, buy)
    return { buy, item, price, row, trait }
  })

  const markShop = () => {
    shopCoins.innerHTML = `${COIN}<span>${garden.coins}</span>`
    for (const row of rows) {
      const full = row.item === 'fertilizer' ? garden.fertilizer >= MAX_FERTILIZER : garden.room < 1
      row.buy.setAttribute('aria-disabled', String(full || garden.coins < row.price))
      if (row.item === 'fertilizer') row.trait.textContent = `A burst of growth. You have ${garden.fertilizer}.`
    }
  }

  function toggleShop(open) {
    if (open === isShopping()) return
    if (open) {
      toggle(false, false)
      shopNote.textContent = garden.room < 1 ? 'The garden is full. Sell a plant to make room.' : 'Coins come from pruning, picking, bugs and watering a thirsty plant.'
      markShop()
    }
    box.classList.toggle('hp-shopping', open)
    purse.setAttribute('aria-expanded', String(open))
    if (open) rows[0].buy.focus({ preventScroll: true })
  }

  purse.addEventListener('click', () => toggleShop(!isShopping()))
  shop.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    toggleShop(false)
    purse.focus({ preventScroll: true })
  })
  bug.addEventListener('click', () => {
    const result = perform('shoo', {})
    say(result.text, result.plant)
  })

  // Plants. Dragging any of them moves the whole garden.

  let drag = null

  const makePlant = id => {
    const button = make('button', 'hp-plant')
    button.dataset.hermesPlant = 'plant'
    button.dataset.plantId = String(id)
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      button.setPointerCapture(event.pointerId)
      drag = { moved: false, x: event.clientX, y: event.clientY, left: box.offsetLeft, top: box.offsetTop }
    })
    button.addEventListener('pointermove', event => {
      if (!drag) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return
      drag.moved = true
      current = { bottom: window.innerHeight - HEIGHT - (drag.top + dy), right: window.innerWidth - width() - (drag.left + dx) }
      place()
    })
    button.addEventListener('pointerup', () => {
      const finished = drag
      drag = null
      if (finished?.moved) {
        current = { bottom: window.innerHeight - HEIGHT - box.offsetTop, right: window.innerWidth - width() - box.offsetLeft }
        onMoved(current)
      } else if (finished) {
        toggle(!(isOpen() && active === id), true, id)
      }
    })
    button.addEventListener('pointercancel', () => {
      drag = null
    })
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggle(!(isOpen() && active === id), true, id)
      }
    })
    return button
  }

  ctx.addEventListener(
    document,
    'pointerdown',
    event => {
      if (box.contains(event.target)) return
      if (isOpen()) toggle(false, false)
      toggleShop(false)
    },
    true
  )
  ctx.addEventListener(window, 'resize', place)

  shop.append(shopHead, ...rows.map(row => row.row), shopNote)
  menu.append(...buttons)
  box.append(purse, menu, bug, message, shop)
  document.body.append(style, box)
  place()
  ctx.onDispose(() => {
    box.remove()
    style.remove()
  })

  return {
    effect,
    /** `view` is what `describe` returns. `drawings` maps a plant id to `{ svg, label }`. */
    render(view, drawings) {
      garden = view
      const size = sizes(view.plants.length)
      box.style.setProperty('--hp-size', `${size.plant}px`)
      for (const [id, entry] of plants) {
        if (viewOf(id)) continue
        entry.button.remove()
        plants.delete(id)
      }
      for (const plant of view.plants) {
        let entry = plants.get(plant.id)
        if (!entry) {
          entry = { button: makePlant(plant.id), lastTip: null, svg: '' }
          plants.set(plant.id, entry)
          box.insertBefore(entry.button, menu)
        }
        const drawing = drawings.get(plant.id)
        if (drawing && drawing.svg !== entry.svg) {
          const old = entry.button.firstElementChild
          entry.lastTip = old ? { x: Number(old.dataset.tipX), y: Number(old.dataset.tipY) } : null
          entry.button.innerHTML = drawing.svg
          entry.svg = drawing.svg
          entry.button.title = drawing.label
          entry.button.setAttribute('aria-label', `${drawing.label}. Open plant care`)
        }
        entry.button.style.left = `${centerOf(plant.id)}px`
        entry.button.classList.toggle('hp-needy', plant.needs.length > 0)
      }
      if (!viewOf(active)) {
        if (isOpen()) toggle(false, false)
        active = view.plants[0]?.id ?? null
      }
      const left = centerOf(view.plants.at(-1)?.id) - size.plant / 2
      purse.innerHTML = `${COIN}<span>${view.coins}</span>`
      purse.style.left = `${left + 6 - purse.offsetWidth}px`
      purse.title = `${view.coins} coins. Open the garden shop`
      purse.setAttribute('aria-label', `${view.coins} coins. Open the garden shop`)
      bug.hidden = view.bug === null
      if (view.bug !== null) {
        bug.dataset.x = String(centerOf(view.bug) + size.plant * 0.16)
        bug.dataset.y = String(HEIGHT / 2 - size.plant * 0.08)
        bug.style.left = `${bug.dataset.x}px`
        bug.style.top = `${bug.dataset.y}px`
      }
      menu.style.left = `${centerOf(active)}px`
      markWheel()
      markShop()
      place()
    },
    say,
    setHidden(hidden) {
      if (hidden) {
        toggle(false, false)
        toggleShop(false)
      }
      box.hidden = hidden
    },
    toggleShop() {
      toggleShop(!isShopping())
    },
    /** Opens or closes the care wheel, on plant `id` or on the last plant used. */
    toggleWheel(id = anchor()) {
      toggle(!(isOpen() && active === id), true, id)
    }
  }
}
