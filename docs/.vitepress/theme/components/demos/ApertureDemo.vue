<template>
  <div class="aperture-demo">
    <div class="aperture-demo__preview">
      <canvas ref="canvasEl" :width="W" :height="H" class="aperture-demo__canvas" />
    </div>

    <div class="aperture-demo__controls">
      <div class="aperture-demo__knob-wrap">
        <svg
          :width="KNOB_SIZE"
          :height="KNOB_SIZE"
          :viewBox="`0 0 ${KNOB_SIZE} ${KNOB_SIZE}`"
          class="aperture-demo__knob-svg"
          @mousedown="onKnobMouseDown"
          @touchstart.prevent="onKnobTouchStart"
        >
          <defs>
            <radialGradient :id="`${uid}-face`" cx="38%" cy="30%" r="80%">
              <stop offset="0%"   style="stop-color: var(--vp-c-bg)" />
              <stop offset="58%"  style="stop-color: var(--vp-c-bg-soft)" />
              <stop offset="100%" style="stop-color: var(--vp-c-bg-mute)" />
            </radialGradient>
            <radialGradient :id="`${uid}-cap`" cx="42%" cy="34%" r="72%">
              <stop offset="0%"   style="stop-color: var(--vp-c-bg)" />
              <stop offset="100%" style="stop-color: var(--vp-c-bg-soft)" />
            </radialGradient>
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

          <!-- Ticks + labels -->
          <g v-for="(_, i) in fLabels" :key="i">
            <line
              :x1="tickInner(i).x" :y1="tickInner(i).y"
              :x2="tickOuter(i).x" :y2="tickOuter(i).y"
              :stroke="i === nearestMajorIdx ? 'var(--vp-c-brand-1)' : 'var(--vp-c-divider)'"
              stroke-width="2" stroke-linecap="round"
            />
            <text
              :x="tickLabel(i).x" :y="tickLabel(i).y"
              text-anchor="middle" dominant-baseline="middle"
              :fill="i === nearestMajorIdx ? 'var(--vp-c-brand-1)' : 'var(--vp-c-text-3)'"
              :font-weight="i === nearestMajorIdx ? '600' : '400'"
              font-size="8"
              style="cursor:pointer; user-select:none"
              @click.stop="goToStop(i)"
            >{{ fDenoms[i] }}</text>
          </g>

          <!-- ── Refined dial (theme-aware) ──────────────── -->
          <circle :cx="KC" :cy="KC" :r="KNOB_R + 4"
            fill="var(--vp-c-bg-soft)"
            stroke="var(--vp-c-divider)" stroke-width="1"
            :filter="`url(#${uid}-shadow)`" />

          <g :transform="`rotate(${knobRotation}, ${KC}, ${KC})`" style="cursor:grab">
            <line
              v-for="(k, i) in knurls" :key="i"
              :x1="k.inner.x" :y1="k.inner.y"
              :x2="k.outer.x" :y2="k.outer.y"
              stroke="var(--vp-c-divider)"
              stroke-width="1"
              stroke-linecap="round"
              stroke-opacity="0.7"
            />
            <circle :cx="KC" :cy="KC" :r="KNOB_R - 2" :fill="`url(#${uid}-face)`"
              stroke="var(--vp-c-divider)" stroke-width="1" />
            <line
              :x1="indicator.x1" :y1="indicator.y1"
              :x2="indicator.x2" :y2="indicator.y2"
              stroke="var(--vp-c-brand-1)"
              stroke-width="3.5"
              stroke-linecap="round"
            />
          </g>

          <circle :cx="KC" :cy="KC" :r="KNOB_R - 15" :fill="`url(#${uid}-cap)`"
            stroke="var(--vp-c-divider)" stroke-width="1" />

          <!-- Center readout -->
          <text
            :x="KC" :y="KC - 3"
            text-anchor="middle" dominant-baseline="middle"
            fill="var(--vp-c-text-1)"
            font-size="12" font-weight="700"
            style="user-select:none"
          >{{ displayF }}</text>
          <text
            :x="KC" :y="KC + 11"
            text-anchor="middle" dominant-baseline="middle"
            fill="var(--vp-c-text-3)"
            font-size="7" font-weight="600" letter-spacing="1"
            style="user-select:none"
          >光圈</text>
        </svg>
      </div>
    </div>

    <p class="aperture-demo__desc">{{ descMap[descLabel] }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const W = 640
const H = 240

const canvasEl = ref<HTMLCanvasElement>()

// ── Aperture data ────────────────────────────────────────
// Reference f-stops shown around the dial; the dial itself is stepless.
const fLabels = ['f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11', 'f/16']
const fDenoms = ['1.4',   '2',   '2.8',   '4',   '5.6',   '8',   '11',   '16']
const MAJOR_F = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16]

// Stepless position: 0 → f/1.4 (wide open), 1 → f/16 (stopped down).
const frac       = ref(0.29)   // ≈ f/2.8 to start (nice shallow look)
const targetFrac = ref(0.29)

const F_MIN     = 1.4    // frac 0 (widest)
const F_MAX     = 16     // frac 1 (narrowest)
const LOG_RANGE = Math.log2(F_MAX / F_MIN)   // ≈ 3.51 stops of aperture range

// Continuous f-number — drives depth of field AND exposure.
const fNumber = computed(() => F_MIN * Math.pow(2, frac.value * LOG_RANGE))

// Standard 1/3-stop f-numbers, for a camera-like readout.
const STD_F: [number, string][] = [
  [1.4, '1.4'], [1.6, '1.6'], [1.8, '1.8'], [2, '2'], [2.2, '2.2'], [2.5, '2.5'],
  [2.8, '2.8'], [3.2, '3.2'], [3.5, '3.5'], [4, '4'], [4.5, '4.5'], [5, '5'],
  [5.6, '5.6'], [6.3, '6.3'], [7.1, '7.1'], [8, '8'], [9, '9'], [10, '10'],
  [11, '11'], [13, '13'], [14, '14'], [16, '16'],
]
const displayF = computed(() => {
  const v = fNumber.value
  let best = STD_F[0], bd = Infinity
  for (const s of STD_F) {
    const d = Math.abs(Math.log2(s[0]) - Math.log2(v))
    if (d < bd) { bd = d; best = s }
  }
  return `f/${best[1]}`
})

// Nearest major stop → description + highlighted label.
const nearestMajorIdx = computed(() => {
  const v = fNumber.value
  let bi = 0, bd = Infinity
  for (let i = 0; i < MAJOR_F.length; i++) {
    const d = Math.abs(Math.log2(MAJOR_F[i]) - Math.log2(v))
    if (d < bd) { bd = d; bi = i }
  }
  return bi
})
const descLabel = computed(() => fLabels[nearestMajorIdx.value])

const descMap: Record<string, string> = {
  'f/1.4': '极大光圈，景深极浅，背景熔化为大片柔美光斑（焦外 / bokeh）；进光最多，弱光也能手持，但合焦范围极窄。',
  'f/2':   '大光圈，背景明显虚化、主体突出，进光充足，是人像的经典选择。',
  'f/2.8': '较大光圈，背景柔和虚化，兼顾进光与画质，纪实 / 人像常用。',
  'f/4':   '中等光圈，主体清晰、背景略糊，通用性强，日常拍摄稳妥。',
  'f/5.6': '景深加深，背景细节开始可辨，适合多人合影与小品。',
  'f/8':   '大部分场景清晰锐利，多数镜头此时画质最佳（最佳光圈）。',
  'f/11':  '深景深，前后景皆清晰，进光减少，适合风光与建筑。',
  'f/16':  '极深景深，全画面锐利；但进光极少且开始受衍射影响，画质略有下降。',
}

// ── Knob geometry ─────────────────────────────────────────
const KNOB_SIZE = 200
const KC        = KNOB_SIZE / 2
const TRACK_R   = 72
const KNOB_R    = 44
const TICK_IN   = TRACK_R - 8
const TICK_OUT  = TRACK_R + 2
const LABEL_R   = TRACK_R + 16

const TOTAL_DEG    = 270
const DEG_PER_STEP = TOTAL_DEG / (fLabels.length - 1)

const FULL_CIRC = 2 * Math.PI * TRACK_R
const ARC_LEN   = (TOTAL_DEG / 360) * FULL_CIRC

function degToRad(d: number) { return d * Math.PI / 180 }
function angleForIdx(i: number) { return 225 + i * DEG_PER_STEP }
function polar(r: number, angleDeg: number) {
  const a = degToRad(angleDeg)
  return { x: KC + r * Math.cos(a), y: KC + r * Math.sin(a) }
}

const filledArcLen = computed(() => frac.value * ARC_LEN)
const knobRotation = computed(() => frac.value * TOTAL_DEG)

function tickInner(i: number) { return polar(TICK_IN,  angleForIdx(i)) }
function tickOuter(i: number) { return polar(TICK_OUT, angleForIdx(i)) }
function tickLabel(i: number) { return polar(LABEL_R,  angleForIdx(i)) }

const uid = `ap-${Math.random().toString(36).slice(2, 8)}`

const KNURL_COUNT = 40
const knurls = Array.from({ length: KNURL_COUNT }, (_, i) => {
  const ang = (360 / KNURL_COUNT) * i
  return { inner: polar(KNOB_R - 1, ang), outer: polar(KNOB_R + 2, ang) }
})

const indicator = computed(() => {
  const tip  = polar(KNOB_R - 4,  225)
  const tail = polar(KNOB_R - 13, 225)
  return { x1: tip.x, y1: tip.y, x2: tail.x, y2: tail.y }
})

// ── Knob interaction ─────────────────────────────────────
function angleFromEvent(e: MouseEvent | Touch, svgEl: SVGElement): number {
  const rect  = svgEl.getBoundingClientRect()
  const scaleX = KNOB_SIZE / rect.width
  const scaleY = KNOB_SIZE / rect.height
  const x = (e.clientX - rect.left) * scaleX - KC
  const y = (e.clientY - rect.top)  * scaleY - KC
  let deg = Math.atan2(y, x) * 180 / Math.PI
  if (deg < 0) deg += 360
  return deg
}

function svgAngleToFrac(svgDeg: number): number {
  let rel = svgDeg - 225
  if (rel < 0) rel += 360
  if (rel > TOTAL_DEG) rel = rel > TOTAL_DEG + 45 ? 0 : TOTAL_DEG
  return Math.max(0, Math.min(1, rel / TOTAL_DEG))
}

function onKnobMouseDown(e: MouseEvent) {
  const svg = e.currentTarget as SVGElement
  const onMove = (ev: MouseEvent) => { targetFrac.value = svgAngleToFrac(angleFromEvent(ev, svg)) }
  const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  targetFrac.value = svgAngleToFrac(angleFromEvent(e, svg))
}

function onKnobTouchStart(e: TouchEvent) {
  const svg = e.currentTarget as SVGElement
  const onMove = (ev: TouchEvent) => { targetFrac.value = svgAngleToFrac(angleFromEvent(ev.touches[0], svg)) }
  const onEnd  = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd) }
  window.addEventListener('touchmove', onMove, { passive: false })
  window.addEventListener('touchend', onEnd)
  targetFrac.value = svgAngleToFrac(angleFromEvent(e.touches[0], svg))
}

function goToStop(i: number) {
  targetFrac.value = i / (fLabels.length - 1)
}

// ── Scene: bokeh light orbs (the depth-of-field stars of the show) ──
interface Orb { x: number; y: number; color: string; sizeMul: number; phase: number }
const ORBS: Orb[] = [
  { x: 0.10, y: 0.22, color: '255,210,130', sizeMul: 1.15, phase: 0.0 },
  { x: 0.20, y: 0.45, color: '255,150,180', sizeMul: 0.85, phase: 1.1 },
  { x: 0.30, y: 0.18, color: '150,225,255', sizeMul: 1.00, phase: 2.3 },
  { x: 0.44, y: 0.34, color: '255,235,170', sizeMul: 1.30, phase: 0.7 },
  { x: 0.54, y: 0.16, color: '200,170,255', sizeMul: 0.80, phase: 3.0 },
  { x: 0.50, y: 0.55, color: '150,255,200', sizeMul: 0.95, phase: 1.7 },
  { x: 0.64, y: 0.40, color: '255,190,120', sizeMul: 1.20, phase: 2.0 },
  { x: 0.72, y: 0.20, color: '255,160,190', sizeMul: 0.90, phase: 0.4 },
  { x: 0.80, y: 0.48, color: '170,210,255', sizeMul: 1.10, phase: 2.7 },
  { x: 0.88, y: 0.28, color: '255,240,190', sizeMul: 1.00, phase: 1.4 },
  { x: 0.92, y: 0.58, color: '255,180,150', sizeMul: 0.85, phase: 3.3 },
  { x: 0.36, y: 0.62, color: '210,180,255', sizeMul: 0.75, phase: 0.9 },
  { x: 0.16, y: 0.66, color: '255,225,150', sizeMul: 0.80, phase: 2.5 },
  { x: 0.68, y: 0.64, color: '160,235,255', sizeMul: 0.90, phase: 1.9 },
]

function drawBokeh(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0,    `rgba(${color},${0.85 * alpha})`)
  g.addColorStop(0.55, `rgba(${color},${0.45 * alpha})`)
  g.addColorStop(0.82, `rgba(${color},${0.22 * alpha})`)
  g.addColorStop(1,    `rgba(${color},0)`)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  // Bright ringed edge — the classic bokeh "donut" hint at larger sizes
  if (r > 9) {
    ctx.beginPath()
    ctx.arc(x, y, r * 0.92, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${color},${0.18 * alpha})`
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

// Sharp foreground subject — a little flower that stays crisp at every aperture.
function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Stem
  ctx.beginPath()
  ctx.moveTo(cx, cy + 6)
  ctx.quadraticCurveTo(cx - 10, cy + 50, cx - 4, H)
  ctx.strokeStyle = '#2f7d4f'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.stroke()
  // Leaf
  ctx.beginPath()
  ctx.ellipse(cx - 14, cy + 44, 13, 6, -0.7, 0, Math.PI * 2)
  ctx.fillStyle = '#3a9a5e'
  ctx.fill()

  // Petals
  const petals = 7
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2
    const px = cx + Math.cos(a) * 15
    const py = cy + Math.sin(a) * 15
    ctx.beginPath()
    ctx.ellipse(px, py, 11, 7, a, 0, Math.PI * 2)
    ctx.fillStyle = '#ff7aa8'
    ctx.fill()
    ctx.strokeStyle = 'rgba(200,40,90,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  // Center
  ctx.beginPath()
  ctx.arc(cx, cy, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#ffd23f'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx - 2.5, cy - 2.5, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fill()
}

// Iris-blades diagram — literally shows the aperture opening at the current f-stop.
function drawIris(ctx: CanvasRenderingContext2D, cx: number, cy: number, openFrac: number) {
  const housingR = 22
  const blades   = 8
  const openR    = 3 + openFrac * (housingR - 6)   // wide open vs. pinhole

  // Housing
  ctx.beginPath()
  ctx.arc(cx, cy, housingR, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(12,16,24,0.88)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,140,170,0.6)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Light coming through the opening
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, openR)
  g.addColorStop(0, 'rgba(255,244,205,0.95)')
  g.addColorStop(1, 'rgba(255,225,150,0.55)')
  ctx.beginPath()
  for (let i = 0; i <= blades; i++) {
    const a = (i / blades) * Math.PI * 2 - Math.PI / 2
    const px = cx + Math.cos(a) * openR
    const py = cy + Math.sin(a) * openR
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()

  // Blade edges radiating from the opening vertices to the housing
  ctx.strokeStyle = 'rgba(150,170,200,0.45)'
  ctx.lineWidth = 1
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * openR, cy + Math.sin(a) * openR)
    ctx.lineTo(cx + Math.cos(a + 0.35) * housingR, cy + Math.sin(a + 0.35) * housingR)
    ctx.stroke()
  }
}

// ── Exposure ──────────────────────────────────────────────
const REF_F = 5.6   // f-stop that yields a neutral exposure for this scene

// ── Render ────────────────────────────────────────────────
function renderFrame(ts: number) {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!

  const f = fNumber.value

  // Dreamy evening background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0,   '#241a3a')
  bg.addColorStop(0.5, '#2c2140')
  bg.addColorStop(1,   '#3a263a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // ① Bokeh — orb size grows as the aperture opens (∝ aperture diameter ∝ 1/f).
  //    Wide open → big soft discs (shallow DOF); stopped down → tiny sharp points.
  const orbR = 3 + 30 / f          // f/1.4 ≈ 24px, f/16 ≈ 5px
  ORBS.forEach(o => {
    const tw = 0.82 + 0.18 * Math.sin(ts / 900 + o.phase)   // gentle twinkle
    drawBokeh(ctx, o.x * W, o.y * H, orbR * o.sizeMul, o.color, tw)
  })

  // ② Sharp foreground subject (always in focus)
  drawFlower(ctx, W * 0.30, H * 0.60)

  // ③ Exposure overlay — wide aperture brightens, narrow aperture darkens.
  //    light ∝ (REF_F / f)²
  const lightFactor = (REF_F / f) * (REF_F / f)
  if (lightFactor < 1) {
    ctx.fillStyle = `rgba(8, 6, 16, ${Math.min(0.62, 1 - lightFactor)})`
    ctx.fillRect(0, 0, W, H)
  } else if (lightFactor > 1) {
    ctx.fillStyle = `rgba(255, 250, 235, ${Math.min(0.40, (lightFactor - 1) / 18)})`
    ctx.fillRect(0, 0, W, H)
  }

  // ④ Iris diagram (top-left) — the physical opening
  const openFrac = (Math.log2(F_MAX) - Math.log2(f)) / LOG_RANGE   // 1 wide … 0 narrow
  drawIris(ctx, 40, 40, openFrac)

  // HUD strip
  ctx.fillStyle = 'rgba(0,0,0,0.34)'
  ctx.fillRect(0, H - 22, W, 22)
  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.textAlign = 'left'
  ctx.fillText(`光圈  ${displayF.value}`, 14, H - 7)

  ctx.textAlign = 'center'
  const evStops = 2 * Math.log2(REF_F / f)
  const evTxt = evStops > 0.1 ? `过曝 +${evStops.toFixed(1)} EV`
              : evStops < -0.1 ? `欠曝 ${evStops.toFixed(1)} EV`
              : '曝光正常'
  ctx.fillText(evTxt, W / 2, H - 7)

  ctx.textAlign = 'right'
  const dof = f < 3.2 ? '浅（背景虚化）' : f <= 8 ? '中等' : '深（前后皆清晰）'
  ctx.fillText(`景深 ${dof}`, W - 14, H - 7)
}

// ── Loop ──────────────────────────────────────────────────
let rafId    = 0
let lastTime = 0
const FPS    = 30

function loop(ts: number) {
  rafId = requestAnimationFrame(loop)

  // Ease the knob toward its target every frame → smooth stepless motion.
  const diff = targetFrac.value - frac.value
  if (Math.abs(diff) > 0.0008) frac.value += diff * 0.18
  else if (frac.value !== targetFrac.value) frac.value = targetFrac.value

  if (ts - lastTime < 1000 / FPS) return
  lastTime = ts
  renderFrame(ts)
}

onMounted(() => {
  rafId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.aperture-demo {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.aperture-demo__canvas {
  display: block;
  width: 100%;
  height: auto;
}

.aperture-demo__controls {
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
}

.aperture-demo__knob-svg {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.aperture-demo__knob-svg:active {
  cursor: grabbing;
}

.aperture-demo__desc {
  margin: 0;
  padding: 10px 18px 14px;
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
  border-top: 1px solid var(--vp-c-divider);
  line-height: 1.6;
  text-align: center;
}
</style>
