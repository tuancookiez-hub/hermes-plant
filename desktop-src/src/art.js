// Draws the plant as an SVG string, in the manner of a blue ink engraving: paper-white shapes, ink
// outlines, and hatching on the side away from the light. Everything here is drawn by this file.

import { shape } from './engine.js'

export const INK = '#1717e0'
export const PAPER = '#fdfdff'

const VIEW = 100
const FLOOR = 95
const TOP = 3
const SIDE = 4
const MAX_SCALE = 1.7
const LINE = 0.95
const MAX_FLOWERS = 14
// A small plant is shown closer up. The frame never gets tighter than this many units.
const MIN_FRAME = 60
// Only the newest part of a stem keeps its leaves, so older wood shows as bare branches.
const LEAVES = 9
const CUT_LEAVES = 3
const POT_SHAPES = [
  { width: 20, height: 15, rim: 3 },
  { width: 25, height: 18, rim: 3.5 },
  { width: 30, height: 21, rim: 4 },
  { width: 36, height: 25, rim: 4.5 }
]

const n = value => String(Math.round(value * 10) / 10)
const DOWN = Math.PI / 2

// Leaves are 10 long and point along +x. The hatched half is +y.
const LEAF =
  `<path d="M0 0C2.5-3 7-2.6 10 0C7.5 2.4 3 3 0 0Z" fill="${PAPER}"/>` +
  '<path d="M0 0L9.3 0M2 .3L2.9 1.9M3.5 .3L4.5 2.1M5 .3L6 1.9M6.5 .3L7.4 1.4M8 .2L8.6.8M3-.2L4.2-1.7M5.6-.2L6.7-1.4" fill="none"/>'
// Small leaves carry less hatching, so a full plant doesn't fill in solid at a small size.
const SMALL_LEAF =
  `<path d="M0 0C2.5-3 7-2.6 10 0C7.5 2.4 3 3 0 0Z" fill="${PAPER}"/>` +
  '<path d="M0 0L9.3 0M3.2 .3L4.4 2M6 .3L7 1.6" fill="none"/>'
const SMALL_BELOW = 6.2
const LIMP_LEAF =
  `<path d="M0 0C2-2.2 7-1.6 10 1.6C7 3.2 3 2.7 0 0Z" fill="${PAPER}"/>` +
  '<path d="M0 0Q5 0 9.3 1.4M2 .4L2.8 1.8M3.6 .5L4.5 2.2M5.2 .7L6 2.3M6.8 1L7.5 2.1" fill="none"/>'
const PETAL = 'M0 0C-1.7-1.5-1.6-3.8 0-4.2C1.6-3.8 1.7-1.5 0 0Z'
const FLOWER =
  [0, 72, 144, 216, 288].map(turn => `<path d="${PETAL}" transform="rotate(${turn})" fill="${PAPER}"/>`).join('') +
  `<circle r="1" fill="${INK}" stroke="none"/>`
const BUD = `<path d="M0 0C-1.3-1-1.1-2.7 0-3.3C1.1-2.7 1.3-1 0 0Z" fill="${PAPER}"/><path d="M-.9-.6L0 0L.9-.6" fill="none"/>`

/** Lays the stems out, bending them for lean and droop, and lists the leaves and tips. */
function place({ side, stems }, view) {
  const droop = view.droop
  const lean = view.lean * side
  const paths = new Map()
  const leaves = []
  const tips = []
  const lines = []

  for (const stem of stems) {
    let { x, y } = stem.parent ? paths.get(stem.parent)[stem.at] : { x: 0, y: 0 }
    const points = [{ x, y }]
    stem.segments.forEach((segment, i) => {
      const height = Math.min(1, -y / 45)
      const outward = Math.abs(Math.cos(segment.angle)) < 0.12 ? side : Math.sign(Math.cos(segment.angle))
      const angle = segment.angle + lean * 0.38 * (0.35 + height) + outward * droop * 0.45 * (0.3 + height)
      x += Math.cos(angle) * segment.length
      y += Math.sin(angle) * segment.length
      points.push({ x, y })
      if (segment.leaf && stem.segments.length - i <= (stem.cut ? CUT_LEAVES : LEAVES)) {
        const out = angle + segment.leaf * 1.05
        const toDown = Math.atan2(Math.sin(DOWN - out), Math.cos(DOWN - out))
        leaves.push({ angle: out + toDown * droop * 0.7, size: 9 * segment.leafSize * Math.sqrt(stem.vigor), x, y })
      }
    })
    paths.set(stem, points)
    lines.push({ depth: stem.depth, points })
    if (!stem.cut && stem.segments.length) {
      const last = points.at(-1)
      const before = points.at(-2)
      tips.push({ angle: Math.atan2(last.y - before.y, last.x - before.x), x: last.x, y: last.y })
    }
  }
  return { leaves, lines, tips }
}

function bounds({ leaves, lines }) {
  const box = { left: -4, right: 4, top: -4, bottom: 0 }
  const grow = (x, y) => {
    box.left = Math.min(box.left, x)
    box.right = Math.max(box.right, x)
    box.top = Math.min(box.top, y)
    box.bottom = Math.max(box.bottom, y)
  }
  for (const line of lines) for (const p of line.points) grow(p.x, p.y)
  for (const leaf of leaves) grow(leaf.x + Math.cos(leaf.angle) * leaf.size, leaf.y + Math.sin(leaf.angle) * leaf.size)
  return box
}

function drawPot(cx, index) {
  const { width, height, rim } = POT_SHAPES[index]
  const top = FLOOR - height
  const neck = top + rim
  const foot = width * 0.68
  const edge = (t, y) => {
    const k = (y - neck) / (FLOOR - neck)
    const half = (width + (foot - width) * k) / 2
    return cx - half + 2 * half * t
  }
  const line = (t0, y0, t1, y1) => `M${n(edge(t0, y0))} ${n(y0)}L${n(edge(t1, y1))} ${n(y1)}`
  const band = y => `M${n(edge(0, y))} ${n(y)}Q${n(cx)} ${n(y + 1.6)} ${n(edge(1, y))} ${n(y)}`

  const shade = [0.6, 0.69, 0.78, 0.86, 0.93].map(t => line(t, neck + 0.8, t, FLOOR - 0.6))
  for (let y = neck + 2.4; y < FLOOR - 1; y += 2.6) shade.push(line(0.8, y, 0.97, y - 1.3))
  for (const t of [0.8, 0.87, 0.94]) shade.push(`M${n(cx - width / 2 - 1.6 + (width + 3.2) * t)} ${n(top + 0.7)}v${n(rim - 1.4)}`)

  const marks = []
  const body = FLOOR - neck
  if (index === 1) marks.push(band(neck + body * 0.4))
  if (index >= 2) marks.push(band(neck + body * 0.28), band(neck + body * 0.62))
  if (index === 3) {
    const y0 = neck + body * 0.36
    const y1 = neck + body * 0.56
    let zigzag = `M${n(edge(0.04, y1))} ${n(y1)}`
    for (let i = 1; i <= 8; i++) zigzag += `L${n(edge(0.04 + (0.5 * i) / 8, i % 2 ? y0 : y1))} ${n(i % 2 ? y0 : y1)}`
    marks.push(zigzag)
  }

  const dots = []
  for (let row = 0; row < 3; row++) {
    const y = FLOOR + 1.2 + row * 1.3
    const reach = foot / 2 + 7 - row * 2.5
    for (let x = -reach + (row % 2) * 0.9; x <= reach; x += 1.8) {
      const r = 0.62 * (1 - Math.abs(x) / (reach + 1.5)) * (1 - row * 0.22)
      if (r > 0.12) dots.push(`M${n(cx + 2.5 + x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`)
    }
  }

  const saucer =
    index >= 2
      ? `<path d="M${n(cx - foot / 2 - 3.2)} ${n(FLOOR - 1.4)}h${n(foot + 6.4)}l-1.3 2.6h${n(-(foot + 3.8))}Z" fill="${PAPER}"/>`
      : ''

  return {
    back:
      `<path d="${dots.join('')}" fill="${INK}" stroke="none"/>` +
      `<ellipse cx="${n(cx)}" cy="${n(top + 1)}" rx="${n(width / 2 + 0.4)}" ry="1.7" fill="${INK}"/>`,
    front:
      saucer +
      `<path d="M${n(cx - width / 2)} ${n(neck)}H${n(cx + width / 2)}L${n(cx + foot / 2)} ${n(FLOOR - 1)}Q${n(cx)} ${n(FLOOR + 0.9)} ${n(cx - foot / 2)} ${n(FLOOR - 1)}Z" fill="${PAPER}"/>` +
      `<path d="${shade.join('')}${marks.join('')}" fill="none" stroke-width="0.6"/>` +
      `<rect x="${n(cx - width / 2 - 1.6)}" y="${n(top)}" width="${n(width + 3.2)}" height="${n(rim)}" rx="1.2" fill="${PAPER}"/>`,
    top
  }
}

const trail = points => points.map((p, i) => `${i ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`).join('')

/**
 * `view` is what `describe` returns. `uid` keeps the SVG's ids apart when two plants share a page.
 */
export function drawPlant(plant, view, uid = 'hp') {
  const laid = place(shape(plant, view.nodes), view)
  const box = bounds(laid)
  const { top } = drawPot(0, view.pot)
  const room = top + 1 - TOP
  const scale = Math.min(MAX_SCALE, (VIEW - 2 * SIDE) / (box.right - box.left), room / Math.max(1, -box.top))
  const half = POT_SHAPES[view.pot].width / 2 + 5
  const cx = Math.min(VIEW - half, Math.max(half, Math.min(VIEW - SIDE - box.right * scale, Math.max(SIDE - box.left * scale, VIEW / 2))))
  const pot = drawPot(cx, view.pot)
  const limp = view.droop > 0.35
  const weight = LINE / scale
  const trunk = (1.3 + Math.min(1.4, view.nodes / 30)) / scale

  const stemParts = laid.lines
    .map(line => {
      const width = Math.max(weight * 1.25, trunk * 0.7 ** line.depth)
      const d = trail(line.points)
      const hollow = width * scale > 2.3 ? `<path d="${d}" stroke="${PAPER}" stroke-width="${n(width - 1.5 * weight)}"/>` : ''
      return [`<path d="${d}" stroke="${PAPER}" stroke-width="${n(width + 1.3 * weight)}"/>`, `<path d="${d}" stroke-width="${n(width)}"/>${hollow}`]
    })
  const stems = stemParts.map(part => part[0]).join('') + stemParts.map(part => part[1]).join('')

  const leaves = laid.leaves
    .map(leaf => {
      const size = leaf.size / 10
      const flip = Math.cos(leaf.angle) < 0 ? -1 : 1
      const kind = limp ? 'limp' : leaf.size * scale < SMALL_BELOW ? 'small' : 'leaf'
      return `<use href="#${uid}-${kind}" transform="translate(${n(leaf.x)} ${n(leaf.y)}) rotate(${n((leaf.angle * 180) / Math.PI)}) scale(${n(size)} ${n(size * flip)})" stroke-width="${n(weight / size)}"/>`
    })
    .join('')

  let tips = ''
  if (view.stage === 'flowering' && !limp) {
    const kind = view.mood === 'thirsty' ? 'bud' : 'flower'
    const size = (view.fed ? 1.15 : 1) * Math.min(1.2, 0.72 / scale + 0.35)
    tips = laid.tips
      .slice(0, MAX_FLOWERS)
      .map(tip => `<use href="#${uid}-${kind}" transform="translate(${n(tip.x)} ${n(tip.y)}) rotate(${n((tip.angle * 180) / Math.PI + 90)}) scale(${n(size)})" stroke-width="${n(weight / size)}"/>`)
      .join('')
  }

  const sparkle = (x, y, r) => `M${n(x)} ${n(y - r)}v${n(2 * r)}M${n(x - r)} ${n(y)}h${n(2 * r)}`
  const fed = view.fed ? `<path d="${sparkle(cx - half - 1, pot.top - 6, 2)}${sparkle(cx + half + 2, pot.top - 13, 1.4)}" fill="none" stroke-width="0.8"/>` : ''

  const reach = Math.max(cx - (cx + box.left * scale), cx + box.right * scale - cx, half) * 2 + 4
  const frame = Math.min(VIEW, Math.max(MIN_FRAME, VIEW - (pot.top + 1 + box.top * scale) + 3, reach))
  const frameX = Math.min(VIEW - frame, Math.max(0, cx - frame / 2))

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(frameX)} ${n(VIEW - frame)} ${n(frame)} ${n(frame)}" width="100%" height="100%" aria-hidden="true" stroke="${INK}" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round">` +
    `<defs><g id="${uid}-leaf">${LEAF}</g><g id="${uid}-small">${SMALL_LEAF}</g><g id="${uid}-limp">${LIMP_LEAF}</g><g id="${uid}-flower">${FLOWER}</g><g id="${uid}-bud">${BUD}</g></defs>` +
    pot.back +
    `<g class="hp-foliage"><g transform="translate(${n(cx)} ${n(pot.top + 1)}) scale(${Math.round(scale * 1000) / 1000})" fill="none">${stems}${leaves}${tips}</g></g>` +
    pot.front +
    fed +
    '</svg>'
  )
}

/** The plant's shape, measured, for tests. */
export const measure = (plant, view) => bounds(place(shape(plant, view.nodes), view))
