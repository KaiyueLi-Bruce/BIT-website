<template>
  <div class="shutter-demo">
    <div class="shutter-demo__preview">
      <canvas ref="canvasEl" :width="W" :height="H" class="shutter-demo__canvas" />
    </div>

    <div class="shutter-demo__controls">
      <div class="shutter-demo__knob-wrap">
        <svg
          :width="KNOB_SIZE"
          :height="KNOB_SIZE"
          :viewBox="`0 0 ${KNOB_SIZE} ${KNOB_SIZE}`"
          class="shutter-demo__knob-svg"
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
            <!-- Center cap: gentle dome so it reads as a raised button -->
            <radialGradient :id="`${uid}-cap`" cx="42%" cy="34%" r="72%">
              <stop offset="0%"   style="stop-color: var(--vp-c-bg)" />
              <stop offset="100%" style="stop-color: var(--vp-c-bg-soft)" />
            </radialGradient>
            <!-- Soft neutral depth -->
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
          <g v-for="(_, i) in shutterLabels" :key="i">
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
            >{{ shutterDenoms[i] }}</text>
          </g>

          <!-- ── Refined dial (theme-aware) ──────────────── -->
          <!-- Bezel -->
          <circle :cx="KC" :cy="KC" :r="KNOB_R + 4"
            fill="var(--vp-c-bg-soft)"
            stroke="var(--vp-c-divider)" stroke-width="1"
            :filter="`url(#${uid}-shadow)`" />

          <!-- Rotating group: grip marks + face + indicator -->
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

          <!-- Raised center cap (stays upright) -->
          <circle :cx="KC" :cy="KC" :r="KNOB_R - 15" :fill="`url(#${uid}-cap)`"
            stroke="var(--vp-c-divider)" stroke-width="1" />

          <!-- Center readout -->
          <text
            :x="KC" :y="KC - 3"
            text-anchor="middle" dominant-baseline="middle"
            fill="var(--vp-c-text-1)"
            font-size="12" font-weight="700"
            style="user-select:none"
          >{{ displayShutter }}</text>
          <text
            :x="KC" :y="KC + 11"
            text-anchor="middle" dominant-baseline="middle"
            fill="var(--vp-c-text-3)"
            font-size="7.5" font-weight="600" letter-spacing="1.5"
            style="user-select:none"
          >秒</text>
        </svg>
      </div>
    </div>

    <p class="shutter-demo__desc">{{ descMap[descLabel] }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const W = 640
const H = 240

const canvasEl = ref<HTMLCanvasElement>()

// ── Shutter data ─────────────────────────────────────────
// Reference labels shown around the dial; the dial itself is stepless.
const shutterLabels = ['1/1000', '1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8']
const shutterDenoms = ['1000',   '500',   '250',   '125',   '60',   '30',   '15',   '8']
const MAJOR_DENOM   = [1000, 500, 250, 125, 60, 30, 15, 8]

// Stepless position along the arc: 0 → 1/1000 (fast), 1 → 1/8 (slow).
const frac       = ref(0.57)   // ≈ 1/60 to start
const targetFrac = ref(0.57)

const SHUTTER_MIN = 1 / 1000   // frac 0  (fastest)
const SHUTTER_MAX = 1 / 8      // frac 1  (slowest)
const LOG_RANGE   = Math.log2(SHUTTER_MAX / SHUTTER_MIN)   // ≈ 6.97 stops

// Continuous shutter time (seconds) — drives both exposure and motion blur.
const shutterTime = computed(() => SHUTTER_MIN * Math.pow(2, frac.value * LOG_RANGE))

// Standard 1/3-stop shutter denominators, for a camera-like readout.
const STD_DENOM = [
  1000, 800, 640, 500, 400, 320, 250, 200, 160, 125, 100,
  80, 60, 50, 40, 30, 25, 20, 15, 13, 10, 8,
]
function nearestLog(arr: number[], v: number) {
  let best = arr[0], bd = Infinity
  for (const s of arr) {
    const d = Math.abs(Math.log2(s) - Math.log2(v))
    if (d < bd) { bd = d; best = s }
  }
  return best
}
const displayShutter = computed(() => `1/${nearestLog(STD_DENOM, 1 / shutterTime.value)}`)

// Nearest major reference stop → description text + highlighted label.
const nearestMajorIdx = computed(() => {
  const denom = 1 / shutterTime.value
  let bi = 0, bd = Infinity
  for (let i = 0; i < MAJOR_DENOM.length; i++) {
    const d = Math.abs(Math.log2(MAJOR_DENOM[i]) - Math.log2(denom))
    if (d < bd) { bd = d; bi = i }
  }
  return bi
})
const descLabel = computed(() => shutterLabels[nearestMajorIdx.value])

const descMap: Record<string, string> = {
  '1/1000': '极高速快门，飞碟运动完全凝固、边缘锐利；但进光极少，夜景几乎全黑，需要强补光。',
  '1/500':  '高速快门，运动清晰，曝光仍明显不足，适合光线充足时凝固快速主体。',
  '1/250':  '运动基本清晰，开始出现极轻微拖影，曝光偏暗。',
  '1/125':  '运动出现轻微拖尾，曝光偏暗，夜间需配合大光圈或高 ISO。',
  '1/60':   '可见运动模糊，曝光接近合理。手持注意防抖，建议开启 IBIS。',
  '1/30':   '明显运动拖影，夜景曝光基本正常；静止主体仍清晰。',
  '1/15':   '强烈运动模糊，画面变亮，飞碟拖出明显光带，静物需上三脚架。',
  '1/8':    '极长拖影，飞碟轨迹贯穿画面，场景趋于过曝，适合刻意的光绘 / 长曝创意。',
}

// ── Knob geometry ─────────────────────────────────────────
const KNOB_SIZE = 200      // extra padding so edge labels don't clip
const KC        = KNOB_SIZE / 2
const TRACK_R   = 72
const KNOB_R    = 44
const TICK_IN   = TRACK_R - 8
const TICK_OUT  = TRACK_R + 2
const LABEL_R   = TRACK_R + 16

const TOTAL_DEG    = 270
const DEG_PER_STEP = TOTAL_DEG / (shutterLabels.length - 1)  // ≈ 38.57°

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

// Unique suffix so gradient/filter IDs never collide with other demo instances.
const uid = `sh-${Math.random().toString(36).slice(2, 8)}`

// Subtle grip marks around the rim (rotate with the dial → turning is visible).
const KNURL_COUNT = 40
const knurls = Array.from({ length: KNURL_COUNT }, (_, i) => {
  const ang = (360 / KNURL_COUNT) * i
  return { inner: polar(KNOB_R - 1, ang), outer: polar(KNOB_R + 2, ang) }
})

// Brand indicator bar (drawn at 225°, rotated to the active value).
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

// Click a label → ease smoothly to that stop.
function goToStop(i: number) {
  targetFrac.value = i / (shutterLabels.length - 1)
}

// ── Scene ─────────────────────────────────────────────────
interface Star { x: number; y: number; r: number; a: number }
const stars: Star[] = []

// ── UFO ───────────────────────────────────────────────────
const UFO_SPEED  = 700   // px/s — also sets within-exposure blur distance
const UFO_BASE_Y = H * 0.38

let ufoX   = W * 0.3
let ufoDir = 1

// glowOnly: draw just the luminous parts (used for the motion-blur streak)
function drawUFO(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, glowOnly = false) {
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.translate(x, y)

  // Ambient glow
  const glow = ctx.createRadialGradient(0, 2, 4, 0, 2, 46)
  glow.addColorStop(0, 'rgba(80, 255, 140, 0.30)')
  glow.addColorStop(1, 'rgba(80, 255, 140, 0)')
  ctx.beginPath()
  ctx.ellipse(0, 2, 46, 28, 0, 0, Math.PI * 2)
  ctx.fillStyle = glow
  ctx.fill()

  if (!glowOnly) {
    // Tractor beam
    ctx.beginPath()
    ctx.moveTo(-9, 8)
    ctx.lineTo(-30, 58)
    ctx.lineTo(30, 58)
    ctx.lineTo(9, 8)
    ctx.closePath()
    const beam = ctx.createLinearGradient(0, 8, 0, 58)
    beam.addColorStop(0, 'rgba(140, 255, 140, 0.40)')
    beam.addColorStop(1, 'rgba(140, 255, 140, 0)')
    ctx.fillStyle = beam
    ctx.fill()

    // Main body
    ctx.beginPath()
    ctx.ellipse(0, 0, 34, 9, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#8fa4ba'
    ctx.fill()

    // Metallic sheen
    const sheen = ctx.createLinearGradient(0, -9, 0, 9)
    sheen.addColorStop(0,   'rgba(220, 240, 255, 0.55)')
    sheen.addColorStop(0.4, 'rgba(200, 225, 255, 0.10)')
    sheen.addColorStop(1,   'rgba(0,   10,  30,  0.45)')
    ctx.beginPath()
    ctx.ellipse(0, 0, 34, 9, 0, 0, Math.PI * 2)
    ctx.fillStyle = sheen
    ctx.fill()
    ctx.strokeStyle = 'rgba(180, 210, 240, 0.70)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Dome
    ctx.beginPath()
    ctx.ellipse(0, -2, 14, 12, 0, Math.PI, 0)
    ctx.fillStyle = 'rgba(130, 205, 255, 0.52)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(180, 235, 255, 0.55)'
    ctx.lineWidth = 0.8
    ctx.stroke()

    // Dome highlight
    ctx.beginPath()
    ctx.ellipse(-3, -8, 5, 3, -0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)'
    ctx.fill()
  }

  // Rim lights — luminous, so they form the colored streak in the trail.
  // NOTE: 8-digit #RRGGBBAA hex; the '+ "00"' makes a fully transparent edge.
  const rimColors = ['#33ff33', '#ffff33', '#33ffff', '#ff9933', '#ff3333', '#3399ff']
  const lr = glowOnly ? 4 : 5
  rimColors.forEach((color, i) => {
    const angle = (i / rimColors.length) * Math.PI * 2
    const lx    = Math.cos(angle) * 25
    const ly    = Math.sin(angle) * 6.5
    const lg    = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr)
    lg.addColorStop(0, color)
    lg.addColorStop(1, color + '00')
    ctx.beginPath()
    ctx.arc(lx, ly, lr, 0, Math.PI * 2)
    ctx.fillStyle = lg
    ctx.fill()
    ctx.beginPath()
    ctx.arc(lx, ly, glowOnly ? 1.6 : 2.2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  })

  ctx.restore()
}

// ── Exposure ──────────────────────────────────────────────
const REF_TIME = 1 / 60   // shutter that yields a "neutral" night exposure

// ── Render ────────────────────────────────────────────────
function renderFrame(ts: number) {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!

  // Fixed deep-night sky — brightness is handled by the exposure overlay below.
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0,    '#0a1430')
  sky.addColorStop(0.70, '#13213f')
  sky.addColorStop(1,    '#1d2f52')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // Moon
  ctx.beginPath()
  ctx.arc(W * 0.88, H * 0.14, 14, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 248, 220, 0.85)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W * 0.88 + 5, H * 0.14 - 2, 11, 0, Math.PI * 2)
  ctx.fillStyle = '#0b1325'
  ctx.fill()

  // Stars
  stars.forEach(s => {
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${s.a})`
    ctx.fill()
  })

  // City silhouette
  ctx.fillStyle = 'rgba(6, 11, 20, 0.96)'
  const buildings: [number, number, number, number][] = [
    [W*0.00, H*0.70, W*0.06, H*0.30],
    [W*0.06, H*0.60, W*0.05, H*0.40],
    [W*0.11, H*0.75, W*0.07, H*0.25],
    [W*0.19, H*0.55, W*0.05, H*0.45],
    [W*0.25, H*0.65, W*0.06, H*0.35],
    [W*0.32, H*0.50, W*0.04, H*0.50],
    [W*0.37, H*0.72, W*0.08, H*0.28],
    [W*0.46, H*0.58, W*0.05, H*0.42],
    [W*0.52, H*0.68, W*0.07, H*0.32],
    [W*0.60, H*0.48, W*0.06, H*0.52],
    [W*0.67, H*0.62, W*0.05, H*0.38],
    [W*0.73, H*0.72, W*0.08, H*0.28],
    [W*0.82, H*0.56, W*0.06, H*0.44],
    [W*0.89, H*0.68, W*0.11, H*0.32],
  ]
  buildings.forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h))

  // Windows
  ctx.fillStyle = 'rgba(255, 200, 80, 0.65)'
  const wins: [number, number][] = [
    [W*0.02,H*0.73],[W*0.02,H*0.79],[W*0.08,H*0.63],[W*0.08,H*0.70],
    [W*0.21,H*0.58],[W*0.21,H*0.65],[W*0.34,H*0.53],[W*0.34,H*0.62],
    [W*0.48,H*0.61],[W*0.48,H*0.68],[W*0.62,H*0.51],[W*0.62,H*0.60],
    [W*0.69,H*0.65],[W*0.75,H*0.75],[W*0.84,H*0.60],[W*0.84,H*0.68],
    [W*0.92,H*0.71],
  ]
  wins.forEach(([x, y]) => ctx.fillRect(x, y, 4, 3))

  // ① Exposure overlay on the BACKGROUND — the unmistakable brightness change.
  //    expF = how much light reaches the sensor vs. the neutral reference.
  const expF = shutterTime.value / REF_TIME
  if (expF < 1) {
    // Underexposed (fast shutter) → scene goes dark.
    ctx.fillStyle = `rgba(4, 8, 18, ${Math.min(0.93, 1 - expF)})`
    ctx.fillRect(0, 0, W, H)
  } else if (expF > 1) {
    // Overexposed (slow shutter) → scene washes toward white.
    ctx.fillStyle = `rgba(235, 244, 255, ${Math.min(0.52, (expF - 1) / 13)})`
    ctx.fillRect(0, 0, W, H)
  }

  // ② UFO motion blur + body — drawn on top (a glowing object stays visible).
  //    blurDist = how far the UFO travels while the shutter is open.
  const shutterT = shutterTime.value
  const blurDist = UFO_SPEED * shutterT
  const wobble   = Math.sin(ts / 950) * 7
  const ufoY     = UFO_BASE_Y + wobble

  if (blurDist > 2) {
    const nSamples = Math.max(4, Math.min(48, Math.round(blurDist / 3)))
    for (let s = 0; s < nSamples - 1; s++) {
      const t  = s / (nSamples - 1)            // 0 = tail, 1 = head
      const bx = ufoX - blurDist * ufoDir * (1 - t)
      drawUFO(ctx, bx, ufoY, 0.18 + 0.32 * t, true)   // glow-only streak
    }
  }
  drawUFO(ctx, ufoX, ufoY, 1.0)

  // HUD strip
  ctx.fillStyle = 'rgba(0,0,0,0.34)'
  ctx.fillRect(0, H - 22, W, 22)
  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.textAlign = 'left'
  ctx.fillText(`快门  ${displayShutter.value} s`, 14, H - 7)
  ctx.textAlign = 'center'
  const evStops = Math.log2(expF)
  const evTxt = evStops > 0.1 ? `过曝 +${evStops.toFixed(1)} EV`
              : evStops < -0.1 ? `欠曝 ${evStops.toFixed(1)} EV`
              : '曝光正常'
  ctx.fillText(evTxt, W / 2, H - 7)
  ctx.textAlign = 'right'
  const blurPx = blurDist < 2 ? '< 2 px（凝固）' : `~${Math.round(blurDist)} px`
  ctx.fillText(`运动拖影 ${blurPx}`, W - 14, H - 7)
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
  const dt = Math.min((ts - lastTime) / 1000, 0.05)
  lastTime = ts

  ufoX += UFO_SPEED * ufoDir * dt
  if (ufoX > W * 0.86) ufoDir = -1
  if (ufoX < W * 0.14) ufoDir =  1

  renderFrame(ts)
}

onMounted(() => {
  for (let i = 0; i < 65; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.70,
      r: Math.random() * 1.1 + 0.3,
      a: Math.random() * 0.55 + 0.30,
    })
  }
  rafId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.shutter-demo {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.shutter-demo__canvas {
  display: block;
  width: 100%;
  height: auto;
}

.shutter-demo__controls {
  display: flex;
  justify-content: center;
  padding: 16px 0 8px;
}

.shutter-demo__knob-svg {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.shutter-demo__knob-svg:active {
  cursor: grabbing;
}

.shutter-demo__desc {
  margin: 0;
  padding: 10px 18px 14px;
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
  border-top: 1px solid var(--vp-c-divider);
  line-height: 1.6;
  text-align: center;
}
</style>
