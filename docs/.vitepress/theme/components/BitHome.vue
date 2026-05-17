<template>
  <div ref="container" class="bit-home">
    <canvas ref="canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

const container = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let mat: LineMaterial
let bgMat: LineMaterial
let rafId: number
let t = 0

const PALETTE = [0x1E6FD9, 0x2563EB, 0x3B82F6, 0x6366F1, 0x8B5CF6, 0x0EA5E9]

let letterGroups: THREE.Vector3[][] = [[], [], []]
let neighbours:   number[][][]      = [[], [], []]
let centroids:    THREE.Vector3[]   = []

// One independent Group per letter — each rotates around its own centroid
const letterMeshGroups: THREE.Group[] = []

interface FgTetData {
  mesh:      LineSegments2
  pos:       THREE.Vector3   // local space (relative to letter centroid)
  target:    THREE.Vector3   // local space
  repulse:   THREE.Vector3   // local space repulsion offset, decays each frame
  targetIdx: number
  groupIdx:  number
  lerpSpeed: number
  rotSpeed:  { x: number; y: number; z: number }
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

function buildLetterData() {
  const W = 600, H = 200, STEP = 5
  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const ctx = off.getContext('2d')!
  ctx.font = 'bold 140px Arial, sans-serif'
  ctx.textBaseline = 'middle'

  const totalW = ctx.measureText('BIT').width
  const bW     = ctx.measureText('B').width
  const iW     = ctx.measureText('I').width
  const drawX  = (W - totalW) / 2
  const iStart = drawX + bW
  const tStart = drawX + bW + iW

  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff'
  ctx.fillText('BIT', drawX, H / 2)

  const px = ctx.getImageData(0, 0, W, H).data
  const groups: THREE.Vector3[][] = [[], [], []]

  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      if (px[(y * W + x) * 4 + 3] > 128) {
        const li = x < iStart ? 0 : x < tStart ? 1 : 2
        groups[li].push(new THREE.Vector3(
          (x / W - 0.5) * 14,
          -(y / H - 0.5) * 6,
          0,
        ))
      }
    }
  }

  const xStep  = (STEP / W) * 14
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

  // Centroid of each letter (XY only; Z stays 0 for the group origin)
  centroids = groups.map(pool => {
    const c = new THREE.Vector3()
    pool.forEach(p => c.add(p))
    return c.divideScalar(pool.length)
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

function init() {
  const w = container.value!.clientWidth
  const h = container.value!.clientHeight

  renderer = new THREE.WebGLRenderer({ canvas: canvas.value!, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
  camera.position.z = 7

  const res = new THREE.Vector2(w, h)
  mat   = new LineMaterial({ vertexColors: true, linewidth: 3, resolution: res })
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

  render()
}

function render() {
  rafId = requestAnimationFrame(render)
  t += 0.005

  // Mouse world position on z=0 plane for repulsion
  raycaster.setFromCamera(new THREE.Vector2(mouseNx, -mouseNy), camera)
  raycaster.ray.intersectPlane(mousePlane, mouseWorld3D)

  const REPULSE_RADIUS = 0.8
  const REPULSE_STRENGTH = 0.022
  const REPULSE_DECAY = 0.92

  // Foreground — neighbour-graph walk in local space
  fgTets.forEach(tet => {
    tet.pos.lerp(tet.target, tet.lerpSpeed)

    // Repulsion: convert mouse world pos to this group's local space
    const mouseLocal = letterMeshGroups[tet.groupIdx].worldToLocal(mouseWorld3D.clone())
    const dx = tet.pos.x - mouseLocal.x
    const dy = tet.pos.y - mouseLocal.y
    const dist2D = Math.sqrt(dx * dx + dy * dy)
    if (dist2D < REPULSE_RADIUS && dist2D > 0.001) {
      const force = (1 - dist2D / REPULSE_RADIUS) * REPULSE_STRENGTH
      tet.repulse.x += (dx / dist2D) * force
      tet.repulse.y += (dy / dist2D) * force
    }
    tet.repulse.multiplyScalar(REPULSE_DECAY)

    tet.mesh.position.set(
      tet.pos.x + tet.repulse.x,
      tet.pos.y + tet.repulse.y,
      tet.pos.z,
    )

    if (tet.pos.distanceTo(tet.target) < 0.05) {
      const { target, idx } = pickTarget(tet.groupIdx, tet.targetIdx)
      tet.target    = target
      tet.targetIdx = idx
    }

    tet.mesh.rotation.x += tet.rotSpeed.x
    tet.mesh.rotation.y += tet.rotSpeed.y
    tet.mesh.rotation.z += tet.rotSpeed.z
  })

  // Each letter group rotates independently around its own centroid
  currentRotY += (targetRotY - currentRotY) * 0.06
  currentRotX += (targetRotX - currentRotX) * 0.06
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
    mesh.rotation.x += rotSpeed.x
    mesh.rotation.y += rotSpeed.y
    mesh.rotation.z += rotSpeed.z
  })

  renderer.render(scene, camera)
}

function onResize() {
  const w = container.value!.clientWidth
  const h = container.value!.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  mat.resolution.set(w, h)
  bgMat.resolution.set(w, h)
}

onMounted(() => {
  init()
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
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
</style>
