<template>
  <div class="iso-demo">
    <div class="iso-demo__preview">
      <canvas ref="canvasEl" :width="W" :height="H" class="iso-demo__canvas" />
    </div>

    <div class="iso-demo__controls">
      <!-- Rotary knob -->
      <div class="iso-demo__knob-wrap">
        <svg
          :width="KNOB_SIZE"
          :height="KNOB_SIZE"
          :viewBox="`0 0 ${KNOB_SIZE} ${KNOB_SIZE}`"
          class="iso-demo__knob-svg"
          @mousedown="onKnobMouseDown"
          @touchstart.prevent="onKnobTouchStart"
        >
          <defs>
            <!-- Dished face: subtle theme-aware dome, highlight toward top-left -->
            <radialGradient :id="`${uid}-face`" cx="38%" cy="30%" r="80%">
              <stop offset="0%"   style="stop-color: var(--vp-c-bg)" />
              <stop offset="58%"  style="stop-color: var(--vp-c-bg-soft)" />
              <stop offset="100%" style="stop-color: var(--vp-c-bg-mute)" />
            </radialGradient>
            <!-- Center cap: gentle inverse dome so it reads as a raised button -->
            <radialGradient :id="`${uid}-cap`" cx="42%" cy="34%" r="72%">
              <stop offset="0%"   style="stop-color: var(--vp-c-bg)" />
              <stop offset="100%" style="stop-color: var(--vp-c-bg-soft)" />
            </radialGradient>
            <!-- Soft neutral depth (no harsh chrome) -->
            <filter :id="`${uid}-shadow`" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="3.5"
                flood-color="rgb(15, 23, 42)" flood-opacity="0.16" />
            </filter>
          </defs>

          <!-- Track arc background -->
          <circle
            :cx="KC" :cy="KC" :r="TRACK_R"
            fill="none"
            stroke="var(--vp-c-divider)"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="`${ARC_LEN} ${FULL_CIRC - ARC_LEN}`"
            stroke-dashoffset="0"
            :transform="`rotate(225, ${KC}, ${KC})`"
          />
          <!-- Track arc filled (progress) -->
          <circle
            :cx="KC" :cy="KC" :r="TRACK_R"
            fill="none"
            stroke="var(--vp-c-brand-1)"
            stroke-width="3"
            stroke-linecap="round"
            :stroke-dasharray="`${filledArcLen} ${FULL_CIRC}`"
            stroke-dashoffset="0"
            :transform="`rotate(225, ${KC}, ${KC})`"
          />

          <!-- Tick marks + labels for each ISO stop -->
          <g v-for="(iso, i) in isoStops" :key="iso">
            <line
              :x1="tickInner(i).x" :y1="tickInner(i).y"
              :x2="tickOuter(i).x" :y2="tickOuter(i).y"
              :stroke="iso === descKey ? 'var(--vp-c-brand-1)' : 'var(--vp-c-divider)'"
              stroke-width="2"
              stroke-linecap="round"
            />
            <text
              :x="tickLabel(i).x" :y="tickLabel(i).y"
              text-anchor="middle" dominant-baseline="middle"
              :fill="iso === descKey ? 'var(--vp-c-brand-1)' : 'var(--vp-c-text-3)'"
              :font-weight="iso === descKey ? '600' : '400'"
              font-size="9.5"
              style="cursor:pointer; user-select:none"
              @click.stop="goToStop(i)"
            >{{ iso }}</text>
          </g>

          <!-- ── Refined dial (theme-aware) ──────────────── -->
          <!-- Bezel: soft surface ring with gentle depth -->
          <circle :cx="KC" :cy="KC" :r="KNOB_R + 4"
            fill="var(--vp-c-bg-soft)"
            stroke="var(--vp-c-divider)" stroke-width="1"
            :filter="`url(#${uid}-shadow)`" />

          <!-- Rotating group: grip marks + face + indicator turn with the dial -->
          <g :transform="`rotate(${knobRotation}, ${KC}, ${KC})`" style="cursor:grab">
            <!-- Subtle grip marks around the rim (the "turnable" affordance) -->
            <line
              v-for="(k, i) in knurls" :key="i"
              :x1="k.inner.x" :y1="k.inner.y"
              :x2="k.outer.x" :y2="k.outer.y"
              stroke="var(--vp-c-divider)"
              stroke-width="1"
              stroke-linecap="round"
              stroke-opacity="0.7"
            />
            <!-- Dished face -->
            <circle :cx="KC" :cy="KC" :r="KNOB_R - 2" :fill="`url(#${uid}-face)`"
              stroke="var(--vp-c-divider)" stroke-width="1" />
            <!-- Brand indicator bar pointing to the current value -->
            <line
              :x1="indicator.x1" :y1="indicator.y1"
              :x2="indicator.x2" :y2="indicator.y2"
              stroke="var(--vp-c-brand-1)"
              stroke-width="3.5"
              stroke-linecap="round"
            />
          </g>

          <!-- Raised center cap (stays upright) -->
          <circle :cx="KC" :cy="KC" :r="KNOB_R - 15" :fill="`url(#${uid}-cap)`"
            stroke="var(--vp-c-divider)" stroke-width="1" />

          <!-- ISO value readout -->
          <text
            :x="KC" :y="KC - 3"
            text-anchor="middle" dominant-baseline="middle"
            fill="var(--vp-c-text-1)"
            font-size="13"
            font-weight="700"
            style="user-select:none"
          >{{ displayIso }}</text>
          <text
            :x="KC" :y="KC + 11"
            text-anchor="middle" dominant-baseline="middle"
            fill="var(--vp-c-text-3)"
            font-size="7.5"
            font-weight="600"
            letter-spacing="1.5"
            style="user-select:none"
          >ISO</text>
        </svg>
      </div>
    </div>

    <p class="iso-demo__desc">{{ descMap[descKey] }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

// ── Canvas ──────────────────────────────────────────
const W = 640
const H = 240

const canvasEl = ref<HTMLCanvasElement>()

let baseData: ImageData | null = null
let rafId = 0
let lastTime = 0
const FPS = 15

// ── ISO data ─────────────────────────────────────────
// Reference stops shown as labels around the dial. The dial itself is stepless.
const isoStops = [100, 200, 400, 800, 1600, 3200, 6400]

// Stepless position along the arc, 0 (ISO 100) → 1 (ISO 6400).
// `frac` is the rendered position; `targetFrac` is where it eases toward.
const frac       = ref(0)
const targetFrac = ref(0)

const LOG_RANGE = Math.log2(6400 / 100)   // = 6 stops

// Continuous ISO on a geometric scale — feeds the noise/brightness math directly.
const currentIso = computed(() => 100 * Math.pow(2, frac.value * LOG_RANGE))

// Standard 1/3-stop values, for a camera-like center readout.
const STD_ISO = [
  100, 125, 160, 200, 250, 320, 400, 500, 640, 800,
  1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400,
]
function nearestLog(arr: number[], v: number) {
  let best = arr[0], bd = Infinity
  for (const s of arr) {
    const d = Math.abs(Math.log2(s) - Math.log2(v))
    if (d < bd) { bd = d; best = s }
  }
  return best
}
const displayIso = computed(() => nearestLog(STD_ISO, currentIso.value))
// Nearest major stop, used to pick the description text & highlight a label.
const descKey    = computed(() => nearestLog(isoStops, currentIso.value))

const descMap: Record<number, string> = {
  100:  '画质纯净，噪点几乎不可见。适合室外晴天等光线充足的场景。',
  200:  '极低噪点，与 ISO 100 差异微小，日常使用无感知。',
  400:  '暗部开始出现轻微亮度噪点，整体画质仍然干净。',
  800:  '暗部噪点可见，以亮度噪点（颗粒感）为主，整体仍可接受。',
  1600: '全区域噪点明显，暗部开始出现色彩噪点（彩色色斑）。',
  3200: '明显噪点与色斑，暗部细节损失较大，建议后期降噪处理。',
  6400: '严重噪点，仅在极端弱光下迫不得已使用，画质损失显著。',
}

// ── Knob geometry ────────────────────────────────────
const KNOB_SIZE = 200      // SVG viewport size (extra padding so edge labels don't clip)
const KC        = KNOB_SIZE / 2   // center
const TRACK_R   = 72       // track arc radius
const KNOB_R    = 44       // inner knob circle radius
const TICK_IN   = TRACK_R - 8
const TICK_OUT  = TRACK_R + 2
const LABEL_R   = TRACK_R + 16

// 270° arc: starts at -135° (-3π/4) going clockwise to +135°
const START_DEG = -135
const TOTAL_DEG = 270
const DEG_PER_STEP = TOTAL_DEG / (isoStops.length - 1)  // 45°

const FULL_CIRC = 2 * Math.PI * TRACK_R
const ARC_LEN   = (TOTAL_DEG / 360) * FULL_CIRC
// Arc starts at 225° from SVG 0° (east). We use transform="rotate(225, cx, cy)" on the circles
// so stroke naturally starts there; no dashoffset needed.

function degToRad(d: number) { return d * Math.PI / 180 }

// Angle for ISO index i, measured from SVG "right" (0°), clockwise positive
// Our -135° from top = 90° + 135° = 225° from SVG 0°
function angleForIdx(i: number): number {
  return 225 + i * DEG_PER_STEP  // degrees from SVG 0
}

function polar(r: number, angleDeg: number) {
  const a = degToRad(angleDeg)
  return { x: KC + r * Math.cos(a), y: KC + r * Math.sin(a) }
}

const filledArcLen = computed(() => frac.value * ARC_LEN)

// Knob rotation in degrees (0 at ISO 100 → 270 at ISO 6400)
const knobRotation = computed(() => frac.value * TOTAL_DEG)

function tickInner(i: number) { return polar(TICK_IN,  angleForIdx(i)) }
function tickOuter(i: number) { return polar(TICK_OUT, angleForIdx(i)) }
function tickLabel(i: number) { return polar(LABEL_R,  angleForIdx(i)) }

// ── Realistic dial geometry ──────────────────────────
// Unique suffix so gradient/filter IDs never collide with other demo instances
const uid = `iso-${Math.random().toString(36).slice(2, 8)}`

// Subtle grip marks around the rim (drawn at base orientation, rotated as a
// group with the knob so turning the dial is visible).
const KNURL_COUNT = 40
const knurls = Array.from({ length: KNURL_COUNT }, (_, i) => {
  const ang = (360 / KNURL_COUNT) * i
  return { inner: polar(KNOB_R - 1, ang), outer: polar(KNOB_R + 2, ang) }
})

// Brand indicator bar. Drawn at the arc-start orientation (225° = down-left);
// the whole group is rotated to the active value, so it points at the selection.
const indicator = computed(() => {
  const tip  = polar(KNOB_R - 4,  225)   // toward the rim
  const tail = polar(KNOB_R - 13, 225)   // just outside the center cap
  return { x1: tip.x, y1: tip.y, x2: tail.x, y2: tail.y }
})

// ── Knob interaction ─────────────────────────────────
let dragging = false

function angleFromEvent(e: MouseEvent | Touch, svgEl: SVGElement): number {
  const rect = svgEl.getBoundingClientRect()
  const scaleX = KNOB_SIZE / rect.width
  const scaleY = KNOB_SIZE / rect.height
  const x = (e.clientX - rect.left) * scaleX - KC
  const y = (e.clientY - rect.top)  * scaleY - KC
  // Angle from SVG 0° (right), clockwise
  let deg = Math.atan2(y, x) * 180 / Math.PI
  if (deg < 0) deg += 360
  return deg
}

function svgAngleToFrac(svgDeg: number): number {
  // Map SVG angle → stepless arc position [0,1].
  // Arc starts at 225° (down-left) and sweeps 270° clockwise to 135° (down-right).
  let rel = svgDeg - 225
  if (rel < 0) rel += 360
  // Past the end of the arc: snap to whichever terminal is closer.
  if (rel > TOTAL_DEG) rel = rel > TOTAL_DEG + 45 ? 0 : TOTAL_DEG
  return Math.max(0, Math.min(1, rel / TOTAL_DEG))
}

function onKnobMouseDown(e: MouseEvent) {
  dragging = true
  const svg = (e.currentTarget as SVGElement)
  const onMove = (ev: MouseEvent) => {
    if (!dragging) return
    targetFrac.value = svgAngleToFrac(angleFromEvent(ev, svg))
  }
  const onUp = () => { dragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  targetFrac.value = svgAngleToFrac(angleFromEvent(e, svg))
}

function onKnobTouchStart(e: TouchEvent) {
  const svg = e.currentTarget as SVGElement
  const onMove = (ev: TouchEvent) => {
    targetFrac.value = svgAngleToFrac(angleFromEvent(ev.touches[0], svg))
  }
  const onEnd = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd) }
  window.addEventListener('touchmove', onMove, { passive: false })
  window.addEventListener('touchend', onEnd)
  targetFrac.value = svgAngleToFrac(angleFromEvent(e.touches[0], svg))
}

// Click a label → ease smoothly to that stop.
function goToStop(i: number) {
  targetFrac.value = i / (isoStops.length - 1)
}

// ── Canvas rendering ─────────────────────────────────
// Starry-night mountain scene — the classic high-ISO low-light scenario.
// At ISO 100 it's clean but dark (underexposed); raising ISO brightens it
// while introducing the grain this demo is about.
interface Star { x: number; y: number; r: number; a: number }
const stars: Star[] = []

function drawBase(ctx: CanvasRenderingContext2D) {
  // Night sky
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0,    '#0a1024')
  sky.addColorStop(0.5,  '#111c38')
  sky.addColorStop(0.82, '#172541')
  sky.addColorStop(1,    '#1d2c4c')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Faint airglow near the horizon
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.74, 8, W * 0.5, H * 0.74, W * 0.55)
  glow.addColorStop(0, 'rgba(70, 100, 150, 0.22)')
  glow.addColorStop(1, 'rgba(70, 100, 150, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Stars
  stars.forEach(s => {
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${s.a})`
    ctx.fill()
  })

  // Moon (top-left) with soft halo
  const mx = W * 0.16, my = H * 0.22
  const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 36)
  halo.addColorStop(0, 'rgba(255, 246, 214, 0.30)')
  halo.addColorStop(1, 'rgba(255, 246, 214, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(mx, my, 36, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(mx, my, 14, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 248, 224, 0.92)'
  ctx.fill()

  // Distant ridge (lighter, hazy)
  ctx.beginPath()
  ctx.moveTo(0, H * 0.70)
  ctx.lineTo(W * 0.12, H * 0.60)
  ctx.lineTo(W * 0.24, H * 0.66)
  ctx.lineTo(W * 0.38, H * 0.55)
  ctx.lineTo(W * 0.52, H * 0.63)
  ctx.lineTo(W * 0.66, H * 0.54)
  ctx.lineTo(W * 0.80, H * 0.62)
  ctx.lineTo(W * 0.92, H * 0.57)
  ctx.lineTo(W, H * 0.63)
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath()
  ctx.fillStyle = '#15223f'
  ctx.fill()

  // Near ridge (darkest — where shadow noise shows most)
  ctx.beginPath()
  ctx.moveTo(0, H * 0.83)
  ctx.lineTo(W * 0.15, H * 0.74)
  ctx.lineTo(W * 0.30, H * 0.81)
  ctx.lineTo(W * 0.46, H * 0.72)
  ctx.lineTo(W * 0.60, H * 0.81)
  ctx.lineTo(W * 0.75, H * 0.73)
  ctx.lineTo(W * 0.90, H * 0.82)
  ctx.lineTo(W, H * 0.76)
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath()
  ctx.fillStyle = '#0a1226'
  ctx.fill()

  // A couple of distant cabin lights
  ctx.fillStyle = 'rgba(255, 200, 90, 0.8)'
  ctx.fillRect(W * 0.55, H * 0.80, 3, 3)
  ctx.fillRect(W * 0.585, H * 0.815, 3, 3)
  ctx.fillRect(W * 0.30, H * 0.83, 3, 3)
}

function drawHUD(ctx: CanvasRenderingContext2D, iso: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.34)'
  ctx.fillRect(0, H - 22, W, 22)
  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'

  ctx.textAlign = 'left'
  ctx.fillText(`感光度  ISO ${displayIso.value}`, 14, H - 7)

  ctx.textAlign = 'center'
  const gain = Math.log2(iso / 100)
  ctx.fillText(`信号增益 +${gain.toFixed(1)} EV`, W / 2, H - 7)

  ctx.textAlign = 'right'
  const lvl = iso <= 400 ? '极少' : iso <= 1600 ? '轻微' : iso <= 3200 ? '明显' : '严重'
  ctx.fillText(`噪点 ${lvl}`, W - 14, H - 7)
}

function renderFrame(iso: number) {
  const canvas = canvasEl.value
  if (!canvas || !baseData) return
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(baseData, 0, 0)

  if (iso > 100) {
    const id = ctx.getImageData(0, 0, W, H)
    const d  = id.data
    const luma   = Math.log2(iso / 100) * 9
    const chroma = Math.max(0, Math.log2(iso / 800) * 7)
    const brightnessFactor = Math.pow(iso / 100, 0.34)   // amplification lifts the night scene
    for (let i = 0; i < d.length; i += 4) {
      const n  = (Math.random() - 0.5) * luma * 2
      const br = Math.min(255, d[i]     * brightnessFactor)
      const bg = Math.min(255, d[i + 1] * brightnessFactor)
      const bb = Math.min(255, d[i + 2] * brightnessFactor)
      d[i]     = Math.max(0, Math.min(255, br + n + (Math.random() - 0.5) * chroma))
      d[i + 1] = Math.max(0, Math.min(255, bg + n + (Math.random() - 0.5) * chroma))
      d[i + 2] = Math.max(0, Math.min(255, bb + n + (Math.random() - 0.5) * chroma * 1.3))
    }
    ctx.putImageData(id, 0, 0)
  }
  drawHUD(ctx, iso)
}

function loop(ts: number) {
  rafId = requestAnimationFrame(loop)

  // Ease the knob toward its target every frame → smooth 60fps stepless motion.
  const diff = targetFrac.value - frac.value
  if (Math.abs(diff) > 0.0008) {
    frac.value += diff * 0.18
  } else if (frac.value !== targetFrac.value) {
    frac.value = targetFrac.value
  }

  // Throttle the (expensive) noise re-randomisation to keep a film-grain shimmer.
  if (ts - lastTime < 1000 / FPS) return
  lastTime = ts
  renderFrame(currentIso.value)
}

onMounted(() => {
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.62,
      r: Math.random() * 1.0 + 0.3,
      a: Math.random() * 0.6 + 0.3,
    })
  }
  const canvas = canvasEl.value!
  const ctx = canvas.getContext('2d')!
  drawBase(ctx)
  baseData = ctx.getImageData(0, 0, W, H)
  rafId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.iso-demo {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.iso-demo__canvas {
  display: block;
  width: 100%;
  height: auto;
}

.iso-demo__controls {
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
}

.iso-demo__knob-svg {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.iso-demo__knob-svg:active {
  cursor: grabbing;
}

.iso-demo__desc {
  margin: 0;
  padding: 10px 18px 14px;
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
  border-top: 1px solid var(--vp-c-divider);
  line-height: 1.6;
  text-align: center;
}
</style>
