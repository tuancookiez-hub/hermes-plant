// The plant on screen: a transparent fixed element above the app, drawn the same way as the Hermes
// pet. Hermes has no plugin area for this, so this file owns its DOM and removes it on dispose.

import { INK, PAPER } from './art.js'

const BOX = 200
const PLANT = 96
const RADIUS = 76
const TOP_LIMIT = 56
const BOTTOM_LIMIT = 20
const DEFAULT_POSITION = { right: 8, bottom: 72 }
const DRAG_START = 5
const MESSAGE_MS = 2600

const icon = path => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export const ACTIONS = [
  { id: 'water', label: 'Water', hint: 'lasts three days', icon: icon('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>') },
  { id: 'prune', label: 'Prune', hint: 'cut the tallest tip', icon: icon('<circle cx="6" cy="18" r="2.5"/><circle cx="6" cy="6" r="2.5"/><path d="M8 7.5 20 18M8 16.5 20 6"/>') },
  { id: 'rotate', label: 'Rotate', hint: 'turn it to the light', icon: icon('<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 3v5h-5"/>') },
  { id: 'feed', label: 'Feed', hint: 'faster growth for two days', icon: icon('<path d="M8 8h8l2 12H6z"/><path d="M9 8 8 4h8l-1 4"/><path d="M10 13h4"/>') },
  { id: 'repot', label: 'Repot', hint: 'a bigger pot, more room', icon: icon('<path d="M6 11h12l-1.5 9h-9z"/><path d="M4.5 8h15v3h-15z"/><path d="M12 8V4M12 4l-2 2M12 4l2 2"/>') },
  { id: 'ask', label: 'Ask Hermes', hint: 'sends a chat message', icon: icon('<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/>') }
]

const CSS = `
.hp-box{position:fixed;width:${BOX}px;height:${BOX}px;z-index:60;pointer-events:none;font-family:inherit}
.hp-box[hidden]{display:none}
.hp-plant{position:absolute;left:${(BOX - PLANT) / 2}px;top:${(BOX - PLANT) / 2}px;width:${PLANT}px;height:${PLANT}px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;pointer-events:auto;touch-action:none;user-select:none}
.hp-plant svg{display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.28))}
.hp-plant:focus-visible,.hp-action:focus-visible{outline:2px solid ${INK};outline-offset:2px;box-shadow:0 0 0 2px ${PAPER}}
.hp-foliage{transform-box:fill-box;transform-origin:50% 100%}
.hp-plant:hover .hp-foliage{animation:hp-sway 2.8s ease-in-out infinite}
.hp-done .hp-plant svg{animation:hp-bounce 420ms ease-out 1}
.hp-action{position:absolute;left:${BOX / 2 - 21}px;top:${BOX / 2 - 21}px;display:flex;align-items:center;justify-content:center;width:42px;height:42px;padding:0;border-radius:50%;border:1.5px solid ${INK};background:${PAPER};color:${INK};box-shadow:0 1px 5px rgba(0,0,0,.3);cursor:pointer;opacity:0;visibility:hidden;pointer-events:none;transform:scale(.6);transition:transform 180ms cubic-bezier(.2,.8,.2,1) var(--hp-delay),opacity 140ms linear var(--hp-delay),visibility 0s linear 200ms,background-color 100ms linear,color 100ms linear}
.hp-open .hp-action{opacity:1;visibility:visible;pointer-events:auto;transform:translate(var(--hp-x),var(--hp-y)) scale(1);transition:transform 180ms cubic-bezier(.2,.8,.2,1) var(--hp-delay),opacity 140ms linear var(--hp-delay),visibility 0s,background-color 100ms linear,color 100ms linear}
.hp-action:hover,.hp-action:focus-visible{background:${INK};color:${PAPER}}
.hp-need::after{content:"";position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;background:${INK};border:2px solid ${PAPER}}
.hp-message{position:absolute;left:50%;top:-26px;transform:translateX(-50%);max-width:260px;padding:2px 9px;border-radius:999px;border:1.5px solid ${INK};background:${PAPER};color:${INK};font-size:11px;font-weight:600;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity 140ms linear}
.hp-message.hp-show{opacity:1}
.hp-drop{position:absolute;left:var(--hp-drop-x);top:44px;width:6px;height:8px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;border:1.5px solid ${INK};background:${PAPER};opacity:0}
.hp-water .hp-drop{animation:hp-fall 640ms ease-in var(--hp-delay) 1}
@keyframes hp-fall{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(46px)}}
@keyframes hp-sway{0%,100%{transform:rotate(0deg)}30%{transform:rotate(1.6deg)}70%{transform:rotate(-1.6deg)}}
@keyframes hp-bounce{0%{transform:scale(1)}35%{transform:scale(1.07,.95)}70%{transform:scale(.98,1.03)}100%{transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.hp-action,.hp-open .hp-action,.hp-message{transition:none}.hp-water .hp-drop,.hp-plant:hover .hp-foliage,.hp-done .hp-plant svg{animation:none}}
`

/**
 * `onAction(id)` runs a care action and returns the line to show, or nothing when the line is
 * spoken somewhere else.
 */
export function createOverlay({ ctx, position, onAction, onMoved }) {
  const style = document.createElement('style')
  style.textContent = CSS

  const box = document.createElement('div')
  box.className = 'hp-box'
  box.dataset.hermesPlant = 'box'

  const plant = document.createElement('button')
  plant.type = 'button'
  plant.className = 'hp-plant'
  plant.dataset.hermesPlant = 'plant'
  plant.setAttribute('aria-haspopup', 'menu')
  plant.setAttribute('aria-expanded', 'false')

  const message = document.createElement('div')
  message.className = 'hp-message'
  message.setAttribute('role', 'status')

  const menu = document.createElement('div')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Plant care')

  const drops = [84, 97, 110].map((x, i) => {
    const drop = document.createElement('div')
    drop.className = 'hp-drop'
    drop.style.setProperty('--hp-drop-x', `${x}px`)
    drop.style.setProperty('--hp-delay', `${i * 90}ms`)
    return drop
  })

  let current = { ...DEFAULT_POSITION, ...position }
  let stopMessage = null
  let stopEffect = null
  let hint = ''

  const hideMessage = () => {
    stopMessage?.()
    stopMessage = null
    hint = ''
    message.classList.remove('hp-show')
  }

  /** Shows a line above the plant. With `ms` of 0 it stays until replaced or cleared. */
  const say = (text, ms = MESSAGE_MS) => {
    hideMessage()
    if (!text) return
    message.textContent = text
    message.classList.add('hp-show')
    if (ms) stopMessage = ctx.setTimeout(hideMessage, ms)
  }

  const showHint = text => {
    if (stopMessage) return
    say(text, 0)
    hint = text
  }

  const clearHint = () => {
    if (hint) hideMessage()
  }

  const place = () => {
    const x = window.innerWidth - BOX - current.right
    const y = window.innerHeight - BOX - current.bottom
    box.style.left = `${Math.min(Math.max(0, x), Math.max(0, window.innerWidth - BOX))}px`
    box.style.top = `${Math.min(Math.max(TOP_LIMIT, y), Math.max(TOP_LIMIT, window.innerHeight - BOX - BOTTOM_LIMIT))}px`
  }

  const isOpen = () => box.classList.contains('hp-open')

  const effect = name => {
    stopEffect?.()
    box.classList.remove('hp-water', 'hp-done')
    void box.offsetWidth
    box.classList.add(name)
    stopEffect = ctx.setTimeout(() => box.classList.remove(name), 1000)
  }

  const buttons = ACTIONS.map((action, i) => {
    const button = document.createElement('button')
    const angle = ((-90 + i * 60) * Math.PI) / 180
    const label = `${action.label}: ${action.hint}`
    button.type = 'button'
    button.className = 'hp-action'
    button.dataset.hermesPlant = action.id
    button.tabIndex = -1
    button.innerHTML = action.icon
    button.setAttribute('role', 'menuitem')
    button.setAttribute('aria-label', label)
    button.style.setProperty('--hp-x', `${Math.round(Math.cos(angle) * RADIUS)}px`)
    button.style.setProperty('--hp-y', `${Math.round(Math.sin(angle) * RADIUS)}px`)
    button.style.setProperty('--hp-delay', `${i * 12}ms`)
    button.addEventListener('pointerenter', () => showHint(label))
    button.addEventListener('pointerleave', clearHint)
    button.addEventListener('focus', () => showHint(label))
    button.addEventListener('blur', clearHint)
    button.addEventListener('click', () => {
      toggle(false, true)
      const result = onAction(action.id)
      say(result?.text)
      if (result?.done) effect(action.id === 'water' ? 'hp-water' : 'hp-done')
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

  function toggle(open, focusPlant) {
    hideMessage()
    box.classList.toggle('hp-open', open)
    plant.setAttribute('aria-expanded', String(open))
    for (const button of buttons) button.tabIndex = open ? 0 : -1
    if (open) buttons[0].focus({ preventScroll: true })
    else if (focusPlant) plant.focus({ preventScroll: true })
  }

  let drag = null

  plant.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    plant.setPointerCapture(event.pointerId)
    drag = { moved: false, x: event.clientX, y: event.clientY, left: box.offsetLeft, top: box.offsetTop }
  })

  plant.addEventListener('pointermove', event => {
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return
    drag.moved = true
    current = {
      bottom: window.innerHeight - BOX - (drag.top + dy),
      right: window.innerWidth - BOX - (drag.left + dx)
    }
    place()
  })

  plant.addEventListener('pointerup', () => {
    const finished = drag
    drag = null
    if (finished?.moved) {
      current = {
        bottom: window.innerHeight - BOX - box.offsetTop,
        right: window.innerWidth - BOX - box.offsetLeft
      }
      onMoved(current)
    } else if (finished) {
      toggle(!isOpen(), true)
    }
  })

  plant.addEventListener('pointercancel', () => {
    drag = null
  })

  plant.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle(!isOpen(), true)
    }
  })

  ctx.addEventListener(
    document,
    'pointerdown',
    event => {
      if (isOpen() && !box.contains(event.target)) toggle(false, false)
    },
    true
  )
  ctx.addEventListener(window, 'resize', place)

  place()
  menu.append(...buttons)
  box.append(...drops, plant, menu, message)
  document.body.append(style, box)
  ctx.onDispose(() => {
    box.remove()
    style.remove()
  })

  return {
    effect,
    render(svg, label) {
      plant.innerHTML = svg
      plant.title = label
      plant.setAttribute('aria-label', `${label}. Open plant care`)
    },
    say,
    setHidden(hidden) {
      if (hidden) toggle(false, false)
      box.hidden = hidden
    },
    /** Marks the actions the plant is waiting for with a dot. */
    setNeeds(needs) {
      for (const button of buttons) button.classList.toggle('hp-need', needs.includes(button.dataset.hermesPlant))
    },
    toggleWheel() {
      toggle(!isOpen(), true)
    }
  }
}
