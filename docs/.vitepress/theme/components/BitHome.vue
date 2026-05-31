<template>
  <div ref="container" class="bit-home">
    <div ref="docLabel" class="doc-label">Documentation</div>
    <div ref="bulbCopy" class="bulb-copy">
      <span class="bulb-copy__tag">BCSSA · IT DEPT.</span>
      <h2 class="bulb-copy__headline">让知识<br>有迹可循</h2>
      <p class="bulb-copy__body">工作流程&nbsp;&nbsp;·&nbsp;&nbsp;技术教程&nbsp;&nbsp;·&nbsp;&nbsp;经验沉淀</p>
    </div>
    <div ref="towerCopy" class="tower-copy">
      <span class="tower-copy__tag">UC BERKELEY · BCSSA</span>
      <h2 class="tower-copy__headline">社团背后<br>的技术力量</h2>
      <p class="tower-copy__body">系统搭建&nbsp;&nbsp;·&nbsp;&nbsp;技术支持&nbsp;&nbsp;·&nbsp;&nbsp;数字化运营</p>
    </div>
    <div ref="fiatLuxSub" class="fiat-lux-sub">要有光</div>
    <div ref="footerEl" class="bit-home-footer">
      <SiteFooter />
    </div>
    <canvas ref="canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'
import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import SiteFooter from './SiteFooter.vue'

// Dark-mode bloom: tetrahedra get a faint fluorescent glow only at night.
const { isDark } = useData()

const container = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const docLabel = ref<HTMLDivElement>()
const bulbCopy = ref<HTMLDivElement>()
const towerCopy = ref<HTMLDivElement>()
const fiatLuxSub = ref<HTMLDivElement>()
const footerEl = ref<HTMLDivElement>()

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let mat: LineMaterial
let bgMat: LineMaterial
let rafId: number
let t = 0

let composer: EffectComposer
let bloomPass: UnrealBloomPass

const PALETTE = [0x1E6FD9, 0x2563EB, 0x3B82F6, 0x6366F1, 0x8B5CF6, 0x0EA5E9]

let letterGroups: THREE.Vector3[][] = []
let neighbours:   number[][][]      = []
let centroids:    THREE.Vector3[]   = []

// One independent Group per letter — each rotates around its own centroid
const letterMeshGroups: THREE.Group[] = []

interface FgTetData {
  mesh:           LineSegments2
  pos:            THREE.Vector3
  target:         THREE.Vector3
  repulse:        THREE.Vector3
  scatterTarget:  THREE.Vector3   // phase 1 explosion target
  bulbTarget:     THREE.Vector3   // phase 2 bulb formation target
  scatter2Target: THREE.Vector3   // phase 3 explosion target (from bulb)
  towerTarget:    THREE.Vector3   // phase 4 Sather Tower target
  scatter3Target: THREE.Vector3   // phase 5 explosion target (from tower)
  fiatLuxTarget:  THREE.Vector3   // phase 6 FIAT LUX formation target
  targetIdx:      number
  groupIdx:       number
  lerpSpeed:      number
  rotSpeed:       { x: number; y: number; z: number }
}

interface BgTetData {
  mesh:     LineSegments2
  base:     THREE.Vector3
  phase:    { x: number; y: number; z: number }
  speed:    number
  rotSpeed: { x: number; y: number; z: number }
}

const fgTets: FgTetData[] = []
const bgTets: BgTetData[] = []

let targetRotY = 0, targetRotX = 0
let currentRotY = 0, currentRotX = 0
let mouseNx = 0, mouseNy = 0
let scrollProgress  = 0   // scatter1:  letters → explode
let scrollProgress2 = 0   // bulb:      scatter1 → bulb
let scrollProgress3 = 0   // scatter2:  bulb    → explode
let scrollProgress4 = 0   // tower:     scatter2 → Sather Tower
let scrollProgress5 = 0   // scatter3:  tower   → explode
let scrollProgress6 = 0   // fiatLux:   scatter3 → FIAT LUX

// Smoothed scroll: onScroll records the target, render() eases toward it.
let targetScrollPct = 0
let smoothScrollPct = 0
let lastTime = 0

const raycaster = new THREE.Raycaster()
const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const mouseWorld3D = new THREE.Vector3()

function onMouseMove(e: MouseEvent) {
  const rect = container.value!.getBoundingClientRect()
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
  targetRotY = nx * 0.45
  targetRotX = ny * 0.25
  mouseNx = nx
  mouseNy = ny
}

function onScroll() {
  // Only record the *target*; render() eases toward it for buttery motion.
  targetScrollPct = window.scrollY / window.innerHeight
}

const easeInOut = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2

/** Map a (smoothed) scroll percentage to every phase progress + DOM overlay. */
function applyProgress(pct: number) {
  const clamp = (x: number) => Math.max(0, Math.min(1, x))
  scrollProgress  = clamp((pct - 0.30) / 1.20)  // 30%  → 150%
  scrollProgress2 = clamp((pct - 1.90) / 1.60)  // 190% → 350%
  scrollProgress3 = clamp((pct - 3.80) / 1.20)  // 380% → 500%
  scrollProgress4 = clamp((pct - 5.40) / 1.60)  // 540% → 700%
  scrollProgress5 = clamp((pct - 7.40) / 1.20)  // 740% → 860%
  scrollProgress6 = clamp((pct - 9.00) / 1.60)  // 900% → 1060%

  if (docLabel.value) {
    docLabel.value.style.opacity = String(Math.max(0, 0.5 - scrollProgress * 1.5))
  }
  if (bulbCopy.value) {
    const eased = easeInOut(scrollProgress2)
    const fadeOut = Math.max(0, 1 - scrollProgress3 * 3)
    bulbCopy.value.style.opacity = String(eased * fadeOut)
    bulbCopy.value.style.transform = `translateY(${(1 - eased) * 24}px)`
  }
  if (towerCopy.value) {
    const eased4 = easeInOut(scrollProgress4)
    const fadeOut5 = Math.max(0, 1 - scrollProgress5 * 3)
    towerCopy.value.style.opacity = String(eased4 * fadeOut5)
    towerCopy.value.style.transform = `translateY(${(1 - eased4) * 24}px)`
  }
  if (fiatLuxSub.value) {
    const e6 = easeInOut(scrollProgress6)
    fiatLuxSub.value.style.opacity = String(e6)
    fiatLuxSub.value.style.transform = `translateX(-50%) translateY(${(1 - e6) * 20}px)`
  }
  if (footerEl.value) {
    const fadeIn = Math.max(0, Math.min(1, (scrollProgress6 - 0.80) / 0.20))
    footerEl.value.style.opacity = String(fadeIn)
    footerEl.value.style.pointerEvents = fadeIn > 0 ? 'auto' : 'none'
  }
}

function buildLetterData() {
  const W = 1000, H = 200, STEP = 6
  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const ctx = off.getContext('2d')!
  ctx.font = 'bold 140px Arial, sans-serif'
  ctx.textBaseline = 'middle'

  const TEXT   = 'BCSSA IT'
  const totalW = ctx.measureText(TEXT).width
  const drawX  = (W - totalW) / 2

  // Compute x-boundary for each non-space character
  const charBounds: { xStart: number; xEnd: number; gi: number }[] = []
  let gi = 0
  for (let i = 0; i < TEXT.length; i++) {
    if (TEXT[i] === ' ') continue
    const xStart = drawX + ctx.measureText(TEXT.slice(0, i)).width
    const xEnd   = drawX + ctx.measureText(TEXT.slice(0, i + 1)).width
    charBounds.push({ xStart, xEnd, gi: gi++ })
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.fillText(TEXT, drawX, H / 2)

  const px = ctx.getImageData(0, 0, W, H).data
  const groups: THREE.Vector3[][] = Array.from({ length: gi }, () => [])

  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      if (px[(y * W + x) * 4 + 3] > 128) {
        let assignedGi = -1
        for (const b of charBounds) {
          if (x >= b.xStart && x < b.xEnd) { assignedGi = b.gi; break }
        }
        if (assignedGi === -1) continue
        groups[assignedGi].push(new THREE.Vector3(
          (x / W - 0.5) * 16,
          -(y / H - 0.5) * 5 + 1.5,
          0,
        ))
      }
    }
  }

  const xStep  = (STEP / W) * 16
  const yStep  = (STEP / H) * 5
  const radius = Math.sqrt(xStep * xStep + yStep * yStep) * 2.0

  letterGroups = groups
  neighbours   = groups.map(pool =>
    pool.map((p, i) =>
      pool.reduce<number[]>((acc, q, j) => {
        if (i !== j) {
          const dx = p.x - q.x, dy = p.y - q.y
          if (dx * dx + dy * dy < radius * radius) acc.push(j)
        }
        return acc
      }, [])
    )
  )

  centroids = groups.map(pool => {
    const c = new THREE.Vector3()
    pool.forEach(p => c.add(p))
    return c.divideScalar(pool.length || 1)
  })
}

/** Pick a neighbour target in local space (relative to the letter's centroid). */
function pickTarget(groupIdx: number, fromIdx: number): { target: THREE.Vector3; idx: number } {
  const pool = letterGroups[groupIdx]
  const nbrs = neighbours[groupIdx][fromIdx]
  const c    = centroids[groupIdx]
  const idx  = nbrs.length > 0
    ? nbrs[Math.floor(Math.random() * nbrs.length)]
    : Math.floor(Math.random() * pool.length)
  const p = pool[idx]
  return {
    target: new THREE.Vector3(p.x - c.x, p.y - c.y, (Math.random() - 0.5) * 1.2),
    idx,
  }
}

function makeLineSegGeo(basePositions: Float32Array): LineSegmentsGeometry {
  const shuffled = [...PALETTE].sort(() => Math.random() - 0.5)
  const posArr: number[] = [], colArr: number[] = []
  const c = new THREE.Color()
  for (let e = 0; e < 6; e++) {
    const i = e * 6
    posArr.push(
      basePositions[i],   basePositions[i+1], basePositions[i+2],
      basePositions[i+3], basePositions[i+4], basePositions[i+5],
    )
    c.set(shuffled[e])
    colArr.push(c.r, c.g, c.b, c.r, c.g, c.b)
  }
  const geo = new LineSegmentsGeometry()
  geo.setPositions(posArr)
  geo.setColors(colArr)
  return geo
}

/** Rasterise Sather Tower (UC Berkeley Campanile) silhouette.
 *
 *  Proportions modelled on the CSS reference:
 *    spire needle → wide pyramid roof → narrow belfry (lantern) →
 *    clock section → long main shaft (widest above base) → stepped base
 */
function buildTowerTargets(count: number): THREE.Vector3[] {
  const W = 280, H = 800, cx = 140
  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const ctx = off.getContext('2d')!

  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Half-widths (the SHAFT is wider than the belfry — Campanile's key proportion)
  const sHW    = 26   // main shaft (long column — widest active section)
  const roofHW = 26   // pyramid base (same width as shaft)
  const capHW  = 30   // cap ledge below pyramid (overhang, slightly wider)
  const bHW    = 22   // belfry / lantern (NARROWEST — sits inside the cap)
  const clkHW  = 25   // clock section
  const colHW  = 18   // collar between clock and shaft
  const baseHW = 32   // base block
  const s1HW   = 40   // step 1
  const s2HW   = 48   // step 2

  // Y positions — spire tip at top (y=small), steps at bottom (y=large)
  const yTip   = 10
  const ySpBase = 50   // spire needle → pyramid tip  (40px needle)
  const yRBase  = 130  // pyramid → cap ledge         (80px pyramid)
  const yCapBot = 148  // cap → belfry                (18px cap)
  const yBelBot = 213  // belfry bottom               (65px belfry)
  const yClkT   = 220  // clock section top
  const yClkB   = 282  // clock section bottom        (62px clock)
  const yColB   = 302  // collar → shaft              (20px collar)
  const yShB    = 720  // shaft bottom                (418px shaft ≈ 52% canvas)
  const yBcB    = 736  // base collar → base
  const yBotB   = 768  // base block bottom
  const yS1B    = 782  // step 1 bottom
  const yS2B    = 794  // step 2 bottom

  // ── Outer silhouette (one closed stroke) ──────────────────────
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(cx, yTip)

  // ── Right side ↓ ──────────────────────────────────────────────
  // Spire needle → pyramid right slope
  ctx.lineTo(cx + 1,      ySpBase)
  ctx.lineTo(cx + roofHW, yRBase)
  // Cap ledge (wider than roof base — creates an overhang line)
  ctx.lineTo(cx + capHW,  yRBase)
  ctx.lineTo(cx + capHW,  yCapBot)
  // Belfry: step IN (narrower than cap)
  ctx.lineTo(cx + bHW,    yCapBot + 2)
  ctx.lineTo(cx + bHW,    yBelBot)
  // Clock section: step OUT (wider than belfry)
  ctx.lineTo(cx + clkHW,  yClkT)
  ctx.lineTo(cx + clkHW,  yClkB)
  // Collar taper into shaft
  ctx.lineTo(cx + colHW,  yClkB + 5)
  ctx.lineTo(cx + sHW,    yColB)
  // Long shaft
  ctx.lineTo(cx + sHW,    yShB)
  // Base flare + stepped plinth
  ctx.lineTo(cx + baseHW, yBcB)
  ctx.lineTo(cx + baseHW, yBotB)
  ctx.lineTo(cx + s1HW,   yBotB)
  ctx.lineTo(cx + s1HW,   yS1B)
  ctx.lineTo(cx + s2HW,   yS1B)
  ctx.lineTo(cx + s2HW,   yS2B)

  // Bottom
  ctx.lineTo(cx - s2HW,   yS2B)

  // ── Left side ↑ (mirror) ──────────────────────────────────────
  ctx.lineTo(cx - s2HW,   yS1B)
  ctx.lineTo(cx - s1HW,   yS1B)
  ctx.lineTo(cx - s1HW,   yBotB)
  ctx.lineTo(cx - baseHW, yBotB)
  ctx.lineTo(cx - baseHW, yBcB)
  ctx.lineTo(cx - sHW,    yShB)
  ctx.lineTo(cx - sHW,    yColB)
  ctx.lineTo(cx - colHW,  yClkB + 5)
  ctx.lineTo(cx - clkHW,  yClkB)
  ctx.lineTo(cx - clkHW,  yClkT)
  ctx.lineTo(cx - bHW,    yBelBot)
  ctx.lineTo(cx - bHW,    yCapBot + 2)
  ctx.lineTo(cx - capHW,  yCapBot)
  ctx.lineTo(cx - capHW,  yRBase)
  ctx.lineTo(cx - roofHW, yRBase)
  ctx.lineTo(cx - 1,      ySpBase)
  ctx.closePath()
  ctx.stroke()

  // ── Internal horizontal lines ─────────────────────────────────
  ctx.lineWidth = 5
  const hLines: [number, number, number][] = [
    [cx - capHW,  cx + capHW,  yRBase],          // pyramid base / cap top
    [cx - capHW,  cx + capHW,  yCapBot],          // cap bottom / belfry top
    [cx - bHW,    cx + bHW,    yBelBot],          // belfry bottom
    [cx - clkHW,  cx + clkHW,  yClkT],            // clock section top
    [cx - colHW,  cx + colHW,  yColB - 6],        // shaft collar
    [cx - baseHW, cx + baseHW, yBcB],             // base top
    [cx - baseHW, cx + baseHW, yBotB - 20],       // base mid
  ]
  for (const [x1, x2, y] of hLines) {
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
  }

  // ── Two arched belfry openings ─────────────────────────────────
  // bHW=18 → 36px belfry; 2 arches of archHW=6 at cx±10 → 8px pillar, 2px walls
  ctx.lineWidth = 5
  const archHW     = 6
  const archCenX   = [cx - 10, cx + 10]
  const archChordY = yCapBot + 18   // base of semicircle (bottom chord of arch top)
  const archBotY   = yBelBot - 10  // open bottom of arch

  for (const ax of archCenX) {
    ctx.beginPath()
    ctx.moveTo(ax - archHW, archBotY)
    ctx.lineTo(ax - archHW, archChordY)
    ctx.arc(ax, archChordY, archHW, Math.PI, 0, true)  // true = curves upward
    ctx.lineTo(ax + archHW, archBotY)
    ctx.stroke()
  }

  // ── Three vertical pilaster lines on main shaft ────────────────
  ctx.lineWidth = 3
  for (const vx of [cx - 10, cx, cx + 10]) {
    ctx.beginPath()
    ctx.moveTo(vx, yColB + 20)
    ctx.lineTo(vx, yShB - 20)
    ctx.stroke()
  }

  // ── Clock face circle ──────────────────────────────────────────
  ctx.lineWidth = 5
  const clkCY = Math.round((yClkT + yClkB) / 2)
  ctx.beginPath()
  ctx.arc(cx, clkCY, 20, 0, Math.PI * 2)
  ctx.stroke()

  // ── Sample pixels ──────────────────────────────────────────────
  const px = ctx.getImageData(0, 0, W, H).data
  const pts: THREE.Vector3[] = []
  const STEP = 3

  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      if (px[(y * W + x) * 4 + 3] > 64) {
        pts.push(new THREE.Vector3(
          (x / W - 0.5) * 3.8 - 2.8,
          -(y / H - 0.5) * 7.0,
          -0.5,
        ))
      }
    }
  }

  if (pts.length === 0) return Array.from({ length: count }, () => new THREE.Vector3(-2.8, 0, 0))
  return Array.from({ length: count }, () =>
    pts[Math.floor(Math.random() * pts.length)].clone()
  )
}

/** Rasterise a light-bulb outline and return count world-space sample positions. */
function buildBulbTargets(count: number): THREE.Vector3[] {
  const W = 320, H = 460

  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const ctx = off.getContext('2d')!
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const cx  = W * 0.5
  const r   = W * 0.36          // dome radius
  const dcy = H * 0.30          // dome circle centre Y

  // geometry helpers
  const neckTopY  = dcy + r * 1.05
  const neckTopHW = r * 0.40
  const neckBotY  = neckTopY + r * 0.30
  const neckBotHW = r * 0.33
  const baseHW    = r * 0.44
  const baseBotY  = neckBotY + r * 0.62

  // ── Bulb outline ────────────────────────────────────────────
  ctx.beginPath()
  ctx.arc(cx, dcy, r, Math.PI * 0.62, Math.PI * 2.38)
  ctx.lineTo(cx + neckTopHW, neckTopY)
  ctx.lineTo(cx + neckBotHW, neckBotY)
  ctx.lineTo(cx + baseHW,    neckBotY)
  ctx.lineTo(cx + baseHW,    baseBotY)
  ctx.lineTo(cx - baseHW,    baseBotY)
  ctx.lineTo(cx - baseHW,    neckBotY)
  ctx.lineTo(cx - neckBotHW, neckBotY)
  ctx.lineTo(cx - neckTopHW, neckTopY)
  ctx.closePath()
  ctx.stroke()

  // ── Filament (Λ shape) ──────────────────────────────────────
  const filHW  = r * 0.22
  const filBot = dcy + r * 0.20
  const filTop = dcy - r * 0.28
  ctx.beginPath()
  ctx.moveTo(cx - filHW, filTop)
  ctx.lineTo(cx,         filBot)
  ctx.lineTo(cx + filHW, filTop)
  ctx.stroke()

  // lead wires from filament feet to neck
  ctx.beginPath()
  ctx.moveTo(cx - filHW, filTop)
  ctx.lineTo(cx - filHW * 0.4, dcy + r * 0.65)
  ctx.moveTo(cx + filHW, filTop)
  ctx.lineTo(cx + filHW * 0.4, dcy + r * 0.65)
  ctx.stroke()

  // ── Base separator lines ────────────────────────────────────
  const sep1 = neckBotY + (baseBotY - neckBotY) * 0.32
  const sep2 = neckBotY + (baseBotY - neckBotY) * 0.65
  ctx.beginPath()
  ctx.moveTo(cx - baseHW, sep1); ctx.lineTo(cx + baseHW, sep1)
  ctx.moveTo(cx - baseHW, sep2); ctx.lineTo(cx + baseHW, sep2)
  ctx.stroke()

  // ── Sample white pixels ─────────────────────────────────────
  const px = ctx.getImageData(0, 0, W, H).data
  const pts: THREE.Vector3[] = []

  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (px[(y * W + x) * 4 + 3] > 64) {
        pts.push(new THREE.Vector3(
          (x / W - 0.5) * 5.2 + 3.4,     // right side of scene
          -(y / H - 0.5) * 6.5 + 0.4,    // vertically centred, slight upward bias
          -0.3,
        ))
      }
    }
  }

  if (pts.length === 0) return Array.from({ length: count }, () => new THREE.Vector3(3.5, 0, 0))

  // Random sampling so every region of the bulb (dome + neck + base) is covered
  return Array.from({ length: count }, () =>
    pts[Math.floor(Math.random() * pts.length)].clone()
  )
}

/** Rasterise "FIAT LUX" — same style as the initial BCSSA IT formation. */
function buildFiatLuxTargets(count: number): THREE.Vector3[] {
  const W = 1000, H = 200, STEP = 6
  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const ctx = off.getContext('2d')!
  ctx.font = 'bold 140px Arial, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'

  const TEXT  = 'FIAT LUX'
  const totalW = ctx.measureText(TEXT).width
  ctx.fillText(TEXT, (W - totalW) / 2, H / 2)

  const px = ctx.getImageData(0, 0, W, H).data
  const pts: THREE.Vector3[] = []

  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      if (px[(y * W + x) * 4 + 3] > 128) {
        pts.push(new THREE.Vector3(
          (x / W - 0.5) * 16,
          -(y / H - 0.5) * 5 + 1.5,
          0,
        ))
      }
    }
  }

  if (pts.length === 0) return Array.from({ length: count }, () => new THREE.Vector3(0, 0, 0))
  return Array.from({ length: count }, () =>
    pts[Math.floor(Math.random() * pts.length)].clone()
  )
}

function init() {
  const w = container.value!.clientWidth
  const h = container.value!.clientHeight

  renderer = new THREE.WebGLRenderer({ canvas: canvas.value!, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.setClearColor(0x000000, 0)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
  camera.position.z = 9

  // Post-processing chain for the dark-mode glow (subtle bloom).
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  // strength, radius, threshold — kept gentle for a faint glow, not a neon sign
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.45, 0.0)
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

  const res = new THREE.Vector2(w, h)
  mat   = new LineMaterial({ vertexColors: true, linewidth: 3, resolution: res, transparent: false, opacity: 1 })
  bgMat = new LineMaterial({ vertexColors: true, linewidth: 2, resolution: res.clone(), transparent: true, opacity: 0.35 })

  const basePositions = (
    new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(0.08, 0))
  ).attributes.position.array as Float32Array

  buildLetterData()

  // One Group per letter, placed at its centroid so rotation is self-centred
  letterGroups.forEach((pool, gi) => {
    const c = centroids[gi]
    const g = new THREE.Group()
    g.position.set(c.x, c.y, 0)
    scene.add(g)
    letterMeshGroups.push(g)

    pool.forEach((worldPos, startIdx) => {
      // Convert to local space
      const localStart = new THREE.Vector3(
        worldPos.x - c.x,
        worldPos.y - c.y,
        (Math.random() - 0.5) * 1.2,
      )
      const { target, idx } = pickTarget(gi, startIdx)

      const mesh = new LineSegments2(makeLineSegGeo(basePositions), mat)
      mesh.position.copy(localStart)
      mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
      mesh.frustumCulled = false
      g.add(mesh)

      fgTets.push({
        mesh,
        pos: localStart.clone(),
        target,
        repulse: new THREE.Vector3(),
        scatterTarget: new THREE.Vector3(
          localStart.x * 4 + (Math.random() - 0.5) * 6,
          localStart.y * 4 + (Math.random() - 0.5) * 6,
          5 + Math.random() * 6,   // blast toward / past camera (camera at z=9)
        ),
        bulbTarget:     new THREE.Vector3(), // filled after all tets built
        scatter2Target: new THREE.Vector3(), // filled after bulbTarget assigned
        towerTarget:    new THREE.Vector3(), // filled after scatter2Target assigned
        scatter3Target: new THREE.Vector3(), // filled after towerTarget assigned
        fiatLuxTarget:  new THREE.Vector3(), // filled after scatter3Target assigned
        targetIdx: idx,
        groupIdx: gi,
        lerpSpeed: 0.004 + Math.random() * 0.005,
        rotSpeed: {
          x: (Math.random() - 0.5) * 0.025,
          y: (Math.random() - 0.5) * 0.035,
          z: (Math.random() - 0.5) * 0.015,
        },
      })
    })
  })

  // Background — free sinusoidal drift, direct children of scene
  for (let i = 0; i < 70; i++) {
    const base = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 14,
      -(0.5 + Math.random() * 3.5),
    )
    const mesh = new LineSegments2(makeLineSegGeo(basePositions), bgMat)
    mesh.position.copy(base)
    mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
    mesh.frustumCulled = false
    scene.add(mesh)

    bgTets.push({
      mesh,
      base: base.clone(),
      phase: { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2, z: Math.random() * Math.PI * 2 },
      speed: 0.15 + Math.random() * 0.3,
      rotSpeed: {
        x: (Math.random() - 0.5) * 0.025,
        y: (Math.random() - 0.5) * 0.035,
        z: (Math.random() - 0.5) * 0.015,
      },
    })
  }

  // Bulb targets
  const worldBulbPts = buildBulbTargets(fgTets.length)
  fgTets.forEach((tet, i) => {
    const c = centroids[tet.groupIdx]
    const wp = worldBulbPts[i]
    tet.bulbTarget.set(wp.x - c.x, wp.y - c.y, wp.z)
  })

  // scatter2Target: explode radially outward from each tet's bulb position
  fgTets.forEach(tet => {
    const bl = tet.bulbTarget
    const len = Math.sqrt(bl.x * bl.x + bl.y * bl.y)
    const dx = len > 0.01 ? bl.x / len : (Math.random() * 2 - 1)
    const dy = len > 0.01 ? bl.y / len : (Math.random() * 2 - 1)
    tet.scatter2Target.set(
      bl.x + dx * 7 + (Math.random() - 0.5) * 5,
      bl.y + dy * 7 + (Math.random() - 0.5) * 5,
      bl.z + 5 + Math.random() * 6,
    )
  })

  // Tower targets
  const worldTowerPts = buildTowerTargets(fgTets.length)
  fgTets.forEach((tet, i) => {
    const c = centroids[tet.groupIdx]
    const wp = worldTowerPts[i]
    tet.towerTarget.set(wp.x - c.x, wp.y - c.y, wp.z)
  })

  // scatter3Target: explode radially outward from each tet's tower position
  fgTets.forEach(tet => {
    const tl = tet.towerTarget
    const len = Math.sqrt(tl.x * tl.x + tl.y * tl.y)
    const dx = len > 0.01 ? tl.x / len : (Math.random() * 2 - 1)
    const dy = len > 0.01 ? tl.y / len : (Math.random() * 2 - 1)
    tet.scatter3Target.set(
      tl.x + dx * 7 + (Math.random() - 0.5) * 5,
      tl.y + dy * 7 + (Math.random() - 0.5) * 5,
      tl.z + 5 + Math.random() * 6,
    )
  })

  // FIAT LUX targets — same coordinate space as initial BCSSA IT letters
  const worldFiatLuxPts = buildFiatLuxTargets(fgTets.length)
  fgTets.forEach((tet, i) => {
    const c = centroids[tet.groupIdx]
    const wp = worldFiatLuxPts[i]
    tet.fiatLuxTarget.set(wp.x - c.x, wp.y - c.y, wp.z)
  })

  render()
}

function render() {
  rafId = requestAnimationFrame(render)

  // Frame time (seconds), clamped so a backgrounded tab doesn't lurch on return.
  const now = performance.now()
  let dt = (now - lastTime) / 1000
  lastTime = now
  if (dt > 0.1) dt = 0.1
  const f = dt * 60   // normalise per-frame increments to a 60fps baseline

  // Silky scroll: ease the smoothed value toward the real scroll position.
  // Exponential smoothing is frame-rate independent (driven by a time constant).
  const SMOOTH_TAU = 0.12
  smoothScrollPct += (targetScrollPct - smoothScrollPct) * (1 - Math.exp(-dt / SMOOTH_TAU))
  applyProgress(smoothScrollPct)

  t += 0.005 * f

  // Mouse world position on z=0 plane for repulsion
  raycaster.setFromCamera(new THREE.Vector2(mouseNx, -mouseNy), camera)
  raycaster.ray.intersectPlane(mousePlane, mouseWorld3D)

  const REPULSE_RADIUS = 0.8
  const REPULSE_STRENGTH = 0.022
  const REPULSE_DECAY = 0.92

  const sp  = scrollProgress
  const sp2 = scrollProgress2
  const sp3 = scrollProgress3
  const sp4 = scrollProgress4
  const sp5 = scrollProgress5
  const sp6 = scrollProgress6

  // Opacity across all phases
  mat.opacity = sp6 > 0 ? 0.35 + sp6 * 0.65   // rebuild to full for FIAT LUX
              : sp5 > 0 ? 0.85 - sp5 * 0.50
              : sp4 > 0 ? 0.35 + sp4 * 0.50
              : sp3 > 0 ? 0.90 - sp3 * 0.55
              : sp2 > 0 ? 0.35 + sp2 * 0.55
              :            1   - sp  * 0.65
  mat.transparent = true

  // Eased phase progresses (cubic in-out → zero velocity at phase edges = smooth)
  const spE  = easeInOut(sp)
  const sp2E = easeInOut(sp2)
  const sp3E = easeInOut(sp3)
  const sp4E = easeInOut(sp4)
  const sp5E = easeInOut(sp5)
  const sp6E = easeInOut(sp6)

  // Foreground — neighbour-graph walk in local space
  fgTets.forEach(tet => {
    tet.pos.lerp(tet.target, Math.min(1, tet.lerpSpeed * f))

    // Repulsion
    const mouseLocal = letterMeshGroups[tet.groupIdx].worldToLocal(mouseWorld3D.clone())
    const dx = tet.pos.x - mouseLocal.x
    const dy = tet.pos.y - mouseLocal.y
    const dist2D = Math.sqrt(dx * dx + dy * dy)
    if (dist2D < REPULSE_RADIUS && dist2D > 0.001) {
      const force = (1 - dist2D / REPULSE_RADIUS) * REPULSE_STRENGTH * f
      tet.repulse.x += (dx / dist2D) * force
      tet.repulse.y += (dy / dist2D) * force
    }
    tet.repulse.multiplyScalar(Math.pow(REPULSE_DECAY, f))

    const bx = tet.pos.x + tet.repulse.x
    const by = tet.pos.y + tet.repulse.y
    const bz = tet.pos.z

    // Phase 1 — scatter from letters
    const sx = bx + (tet.scatterTarget.x - bx) * spE
    const sy = by + (tet.scatterTarget.y - by) * spE
    const sz = bz + (tet.scatterTarget.z - bz) * spE

    // Phase 2 — bulb
    const buldX = sx + (tet.bulbTarget.x - sx) * sp2E
    const buldY = sy + (tet.bulbTarget.y - sy) * sp2E
    const buldZ = sz + (tet.bulbTarget.z - sz) * sp2E

    // Phase 3 — scatter from bulb
    const s2x = buldX + (tet.scatter2Target.x - buldX) * sp3E
    const s2y = buldY + (tet.scatter2Target.y - buldY) * sp3E
    const s2z = buldZ + (tet.scatter2Target.z - buldZ) * sp3E

    // Phase 4 — Sather Tower
    const s4x = s2x + (tet.towerTarget.x - s2x) * sp4E
    const s4y = s2y + (tet.towerTarget.y - s2y) * sp4E
    const s4z = s2z + (tet.towerTarget.z - s2z) * sp4E

    // Phase 5 — scatter from tower
    const s5x = s4x + (tet.scatter3Target.x - s4x) * sp5E
    const s5y = s4y + (tet.scatter3Target.y - s4y) * sp5E
    const s5z = s4z + (tet.scatter3Target.z - s4z) * sp5E

    // Phase 6 — FIAT LUX
    tet.mesh.position.set(
      s5x + (tet.fiatLuxTarget.x - s5x) * sp6E,
      s5y + (tet.fiatLuxTarget.y - s5y) * sp6E,
      s5z + (tet.fiatLuxTarget.z - s5z) * sp6E,
    )

    if (tet.pos.distanceTo(tet.target) < 0.05) {
      const { target, idx } = pickTarget(tet.groupIdx, tet.targetIdx)
      tet.target    = target
      tet.targetIdx = idx
    }

    tet.mesh.rotation.x += tet.rotSpeed.x * f
    tet.mesh.rotation.y += tet.rotSpeed.y * f
    tet.mesh.rotation.z += tet.rotSpeed.z * f
  })

  // Mouse rotation: suppressed during phases 1-5, gradually restored as FIAT LUX forms
  const suppressBase = Math.max(sp, sp2, sp3, sp4, sp5)
  const rotSuppression = suppressBase * (sp6 > 0 ? 1 - sp6 : 1)
  const rotEase = 0.06 * (1 - rotSuppression * 0.9) * f
  currentRotY += (targetRotY - currentRotY) * rotEase
  currentRotX += (targetRotX - currentRotX) * rotEase
  letterMeshGroups.forEach(g => {
    g.rotation.y = currentRotY
    g.rotation.x = currentRotX
  })

  // Background drift
  const bgAmp = 2.0
  bgTets.forEach(({ mesh, base, phase, speed, rotSpeed }) => {
    mesh.position.x = base.x + Math.sin(t * speed + phase.x) * bgAmp
    mesh.position.y = base.y + Math.cos(t * speed * 0.8 + phase.y) * bgAmp
    mesh.position.z = base.z + Math.sin(t * speed * 0.5 + phase.z) * bgAmp * 0.4
    mesh.rotation.x += rotSpeed.x * f
    mesh.rotation.y += rotSpeed.y * f
    mesh.rotation.z += rotSpeed.z * f
  })

  // Dark mode → bloom composer (glow); light mode → plain render (clean lines).
  // Read the theme live each frame so the glow appears as soon as VitePress
  // resolves the appearance (no manual refresh needed on first load).
  if (isDark.value) composer.render()
  else renderer.render(scene, camera)
}

function onResize() {
  const w = container.value!.clientWidth
  const h = container.value!.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer?.setSize(w, h)
  bloomPass?.setSize(w, h)
  mat.resolution.set(w, h)
  bgMat.resolution.set(w, h)
}

onMounted(() => {
  // Give the page scroll room to trigger the scatter animation
  document.body.style.minHeight = '1150vh'
  // Seed smoothing from the current scroll so a mid-page refresh doesn't sweep.
  targetScrollPct = smoothScrollPct = window.scrollY / window.innerHeight
  lastTime = performance.now()
  applyProgress(smoothScrollPct)
  init()
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  document.body.style.minHeight = ''
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('scroll', onScroll)
  composer?.dispose()
  renderer?.dispose()
})
</script>

<style scoped>
.bit-home {
  position: fixed;
  top: var(--vp-nav-height);
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  background: var(--vp-c-bg);
}

canvas {
  position: absolute;
  inset: 0;
}

.doc-label {
  position: absolute;
  bottom: 30%;
  left: 50%;
  transform: translateX(-50%);
  font-size: clamp(1.2rem, 2.8vw, 2.2rem);
  font-weight: 300;
  letter-spacing: 0.45em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
}

/* ── Bulb-phase copy ── */
.bulb-copy {
  position: absolute;
  left: 6%;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  pointer-events: none;
  user-select: none;
  will-change: opacity, transform;
}

.bulb-copy__tag {
  display: block;
  font-size: clamp(0.8rem, 1.4vw, 1.1rem);
  font-weight: 500;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 1.8rem;
}

.bulb-copy__headline {
  margin: 0 0 2rem;
  font-size: clamp(3.5rem, 7.5vw, 6.5rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--vp-c-text-1);
}

.bulb-copy__body {
  margin: 0;
  font-size: clamp(0.9rem, 1.6vw, 1.3rem);
  font-weight: 300;
  letter-spacing: 0.18em;
  color: var(--vp-c-text-2);
  opacity: 0.75;
}

/* ── Tower-phase copy ── */
.tower-copy {
  position: absolute;
  right: 6%;
  top: 50%;
  opacity: 0;
  text-align: right;
  pointer-events: none;
  user-select: none;
  will-change: opacity, transform;
}

.tower-copy__tag {
  display: block;
  font-size: clamp(0.8rem, 1.4vw, 1.1rem);
  font-weight: 500;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 1.8rem;
}

.tower-copy__headline {
  margin: 0 0 2rem;
  font-size: clamp(3.5rem, 7.5vw, 6.5rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--vp-c-text-1);
}

.tower-copy__body {
  margin: 0;
  font-size: clamp(0.9rem, 1.6vw, 1.3rem);
  font-weight: 300;
  letter-spacing: 0.18em;
  color: var(--vp-c-text-2);
  opacity: 0.75;
}

/* ── FIAT LUX subtitle ── */
.fiat-lux-sub {
  position: absolute;
  top: 62%;
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
  white-space: nowrap;
  font-size: clamp(1.1rem, 2.2vw, 1.8rem);
  font-weight: 300;
  letter-spacing: 0.55em;
  color: var(--vp-c-text-2);
  pointer-events: none;
  user-select: none;
  will-change: opacity, transform;
}

/* ── Home page footer ── */
.bit-home-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 0;
  pointer-events: none;
  will-change: opacity;
  z-index: 10;
}
</style>
