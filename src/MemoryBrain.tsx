// Hafıza beyni sayfası — hafiza-3d-onizleme.html'in siteye taşınmış hali.
// Sahne, renkler, nöron çizimi ve yerleştirme mantığı önizlemedekiyle aynıdır.
// Bu dosya ağır olan three.js'i kullanır; App.tsx onu sadece Memory sayfası
// açılınca yükler (React.lazy).

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import BRAIN from './brainData'
import { ST, STATUS_ORDER, fmtDate, MemoryStyles } from './memoryShared'
import type { MemoryItem, MemStatus } from './memoryShared'

// ─── Beyin verisini çöz ────────────────────────────────────────────────────────
function decodeBuffer(b64: string): ArrayBuffer {
  const s = atob(b64), u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u.buffer
}
const Pq = new Int16Array(decodeBuffer(BRAIN.p))
const BR = new Uint8Array(decodeBuffer(BRAIN.br))
const REG = new Uint8Array(decodeBuffer(BRAIN.reg))
const SUB = new Uint16Array(decodeBuffer(BRAIN.s))
const ED = new Uint16Array(decodeBuffer(BRAIN.e))
const NP = BR.length
const V: THREE.Vector3[] = []
for (let i = 0; i < NP; i++) V.push(new THREE.Vector3(Pq[i * 3] / 1000, Pq[i * 3 + 1] / 1000, Pq[i * 3 + 2] / 1000))

function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h += 0x6D2B79F5
    let t = h
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// ─── Yerleştirme: öğe → beyindeki nokta ────────────────────────────────────────
const cen = (k: number) => {
  const c = new THREE.Vector3()
  let n = 0
  for (let i = 0; i < NP; i++) if (REG[i] === k) { c.add(V[i]); n++ }
  return c.multiplyScalar(1 / Math.max(n, 1))
}
const REGC = { structure: cen(1), word: cen(2) }
const ORDER: Record<string, number[]> = {}
function orderFor(studentKey: string, type: 'word' | 'structure'): number[] {
  const key = studentKey + '|' + type
  if (ORDER[key]) return ORDER[key]
  const r = rng('order-' + key), c = REGC[type], arr: [number, number][] = []
  for (let i = 0; i < NP; i++) {
    if (BR[i] < 95 || Math.abs(V[i].z) < 0.1) continue
    arr.push([i, V[i].distanceTo(c) + r() * 0.9])
  }
  arr.sort((a, b) => a[1] - b[1])
  return ORDER[key] = arr.map(o => o[0])
}

export type PlacedItem = MemoryItem & { vi: number; pos: THREE.Vector3 }

// Bölgeye göre yumuşak sıralı, aralarında en az mesafe korunur; kalabalıklaştıkça
// mesafe kademeli daralır. Sıra tablo sırasına bağlı: satır eklemek eski öğelerin
// yerini değiştirmez.
export function assignPositions(list: MemoryItem[], studentKey: string): PlacedItem[] {
  const CELL = 0.13, grid = new Map<number, THREE.Vector3[]>(), used = new Uint8Array(NP), RS = [0.13, 0.10, 0.08, 0.065, 0.05]
  const kf = (x: number, y: number, z: number) => ((Math.floor(x / CELL) + 32) << 12) | ((Math.floor(y / CELL) + 32) << 6) | (Math.floor(z / CELL) + 32)
  const close = (p: THREE.Vector3, r: number) => {
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), cz = Math.floor(p.z / CELL)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(((cx + dx + 32) << 12) | ((cy + dy + 32) << 6) | (cz + dz + 32))
      if (a) for (let k = 0; k < a.length; k++) if (a[k].distanceTo(p) < r) return true
    }
    return false
  }
  const st = { word: { ph: 0, ptr: 0 }, structure: { ph: 0, ptr: 0 } }
  return list.map(it => {
    const order = orderFor(studentKey, it.type), Z = st[it.type]
    let vi = -1
    while (Z.ph < RS.length && vi < 0) {
      const r = RS[Z.ph]
      while (Z.ptr < order.length) {
        const idx = order[Z.ptr]
        if (used[idx] || close(V[idx], r)) { Z.ptr++; continue }
        vi = idx
        break
      }
      if (vi < 0) { Z.ph++; Z.ptr = 0 }
    }
    if (vi < 0) { for (let i = 0; i < NP; i++) if (!used[i]) { vi = i; break } }
    if (vi < 0) vi = 0
    used[vi] = 1
    const k = kf(V[vi].x, V[vi].y, V[vi].z)
    const cell = grid.get(k)
    if (cell) cell.push(V[vi]); else grid.set(k, [V[vi]])
    return { ...it, vi, pos: V[vi] }
  })
}

// ─── Sahne ─────────────────────────────────────────────────────────────────────
interface BrainNode extends PlacedItem {
  i: number; isNew: boolean; f: number; ft: number; scale: number
  rs: number; arrived: boolean; size0: number; pop: number | null
}
interface Callbacks {
  onSelect: (i: number | null) => void
  onCount: (words: number, structures: number) => void
}

const NODE_VS = `attribute vec3 col;attribute float size;attribute float alpha;varying vec3 vC;varying float vA;varying float vD;
uniform float pxScale;uniform float fogNear;uniform float fogFar;
void main(){vC=col;vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.0);vD=clamp((-mv.z-fogNear)/(fogFar-fogNear),0.0,1.0);
gl_PointSize=min(size*pxScale/(-mv.z),140.0);gl_Position=projectionMatrix*mv;}`
const DOT_FS = `uniform float glow;uniform float whiten;uniform float gain;varying vec3 vC;varying float vA;varying float vD;
void main(){vec2 p=gl_PointCoord-0.5;float d=length(p)*2.0;if(d>1.0)discard;
float core=smoothstep(0.30,0.12,d);float halo=pow(1.0-d,2.4)*glow;
float a=clamp(core+halo*0.6,0.0,1.0)*vA*gain*(1.0-0.75*vD);
gl_FragColor=vec4(mix(vC,vec3(1.0),core*whiten),a);}`
const RING_FS = `varying vec3 vC;varying float vA;varying float vD;
void main(){vec2 p=gl_PointCoord-0.5;float d=length(p)*2.0;if(d>1.0)discard;
float a=smoothstep(0.13,0.02,abs(d-0.62))*vA*(1.0-0.75*vD);gl_FragColor=vec4(vC,a);}`

function createEngine(space: HTMLElement, bubble: HTMLElement, cb: Callbacks) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  space.prepend(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0D0A22')
  scene.fog = new THREE.Fog(0x000000, 3, 6)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 100)
  camera.position.set(0, 0.05, 3.35)
  const ZMIN = 0.7, ZMAX = 8
  const brain = new THREE.Group()
  scene.add(brain)
  brain.rotation.set(0.1, -0.75, 0)
  const NODE_U = { pxScale: { value: 600 }, glow: { value: 1 }, whiten: { value: 0.55 }, gain: { value: 1 }, fogNear: { value: 3 }, fogFar: { value: 6 } }

  let composer: EffectComposer | null = null
  let bloomOn = false
  try {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.35, 0.28))
    bloomOn = true
  } catch { composer = null; bloomOn = false }

  function size() {
    const w = space.clientWidth
    if (!w) return
    const h = Math.min(Math.round(w * 0.95), 520)
    renderer.setSize(w, h, false)
    renderer.domElement.style.height = h + 'px'
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (composer) composer.setSize(w, h)
    NODE_U.pxScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360))
  }
  addEventListener('resize', size)
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => size()) : null
  if (ro) ro.observe(space)
  size()

  function tex(kind: 'glow' | 'core' | 'ring' | 'soft') {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    if (kind === 'ring') {
      g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.stroke()
    } else {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      r.addColorStop(0, 'rgba(255,255,255,1)')
      r.addColorStop(kind === 'core' ? .3 : .12, 'rgba(255,255,255,.8)')
      r.addColorStop(kind === 'soft' ? .3 : .45, 'rgba(255,255,255,.18)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = r; g.fillRect(0, 0, 128, 128)
    }
    return new THREE.CanvasTexture(c)
  }
  const T = { glow: tex('glow'), core: tex('core'), ring: tex('ring'), soft: tex('soft') }
  const COL: Record<MemStatus, THREE.Color> & { white: THREE.Color; pulse: THREE.Color } = {
    known: new THREE.Color(ST.known.hex), learning: new THREE.Color(ST.learning.hex), fading: new THREE.Color(ST.fading.hex),
    white: new THREE.Color('#FFFFFF'), pulse: new THREE.Color('#E9D8FF'),
  }
  function sprite(t: THREE.Texture, color: THREE.Color, scale: number, opacity: number) {
    const m = new THREE.SpriteMaterial({ map: t, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true })
    const s = new THREE.Sprite(m)
    s.scale.setScalar(scale)
    return s
  }

  // Beyin: nokta bulutu
  ;(function cloud() {
    const pos = new Float32Array(NP * 3), col = new Float32Array(NP * 3), base = new THREE.Color('#B7A8FF'), deep = new THREE.Color('#5A3FB8')
    for (let i = 0; i < NP; i++) {
      pos.set([V[i].x, V[i].y, V[i].z], i * 3)
      const b = BR[i] / 255
      const c = deep.clone().lerp(base, b).multiplyScalar(0.35 + 0.75 * b)
      col.set([c.r, c.g, c.b], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    brain.add(new THREE.Points(g, new THREE.PointsMaterial({ map: T.glow, size: 0.045, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })))
    const lp = new Float32Array(ED.length * 3)
    for (let k = 0; k < ED.length; k++) { const v = V[SUB[ED[k]]]; lp.set([v.x, v.y, v.z], k * 3) }
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3))
    brain.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#8C78F0', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })))
  })()

  // Sinir demetleri
  const FIB: THREE.Vector3[][] = []
  ;(function fibers() {
    const r = rng('fibers'), mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    const cA = new THREE.Color('#C58BFF')
    for (let k = 0; k < 46; k++) {
      const a = V[Math.floor(r() * NP)], b = V[Math.floor(r() * NP)]
      if (a.distanceTo(b) < 0.9) { k--; continue }
      const mid = a.clone().add(b).multiplyScalar(0.5).multiplyScalar(0.35)
      const pts: THREE.Vector3[] = [], cols: number[] = []
      for (let i = 0; i <= 28; i++) {
        const t = i / 28, u = 1 - t
        const p = new THREE.Vector3(u * u * a.x + 2 * u * t * mid.x + t * t * b.x, u * u * a.y + 2 * u * t * mid.y + t * t * b.y, u * u * a.z + 2 * u * t * mid.z + t * t * b.z)
        pts.push(p)
        const f = Math.sin(t * Math.PI) * 0.55
        cols.push(cA.r * f, cA.g * f, cA.b * f)
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts)
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
      brain.add(new THREE.Line(g, mat))
      FIB.push(pts)
    }
  })()

  // İç sis ve yıldız tozu
  ;([['#6A45D0', 2.6, 0.12, [0.1, 0.1, 0]], ['#B85FC8', 1.4, 0.06, [0.3, 0.2, 0.2]], ['#4E6BFF', 1.7, 0.06, [-0.4, -0.1, -0.2]]] as [string, number, number, number[]][]).forEach(([c, s, o, p]) => {
    const n = sprite(T.soft, new THREE.Color(c), s, o)
    n.position.set(p[0], p[1], p[2])
    n.material.fog = false
    brain.add(n)
  })
  ;(function dust() {
    const r = rng('dust'), a: number[] = []
    for (let i = 0; i < 260; i++) {
      const u = r() * 2 - 1, t = r() * Math.PI * 2, R = 4 + r() * 6, s = Math.sqrt(1 - u * u)
      a.push(s * Math.cos(t) * R, u * R, s * Math.sin(t) * R)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3))
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ map: T.glow, size: 0.05, color: '#6E62B8', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })))
  })()

  // Nöron çizimi: tek seferde binlerce nokta (shader)
  const mkMat = (fs: string) => new THREE.ShaderMaterial({ uniforms: NODE_U, vertexShader: NODE_VS, fragmentShader: fs, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const DOT_MAT = mkMat(DOT_FS), RING_MAT = mkMat(RING_FS)

  // Öğrenci katmanı
  let layer = new THREE.Group()
  brain.add(layer)
  let nodes: BrainNode[] = []
  type Pulse = { a?: THREE.Vector3; b?: THREE.Vector3; path?: THREE.Vector3[]; s: THREE.Sprite; phase: number; speed: number; boost: number; own: BrainNode | null }
  type Flight = { n: BrainNode; from: THREE.Vector3; ctrl: THREE.Vector3; start: number; dur: number; trail: THREE.Sprite[]; hist: THREE.Vector3[]; TL: number; done?: boolean }
  type Burst = { s: THREE.Sprite; start: number; flash?: boolean }
  let pulses: Pulse[] = [], flights: Flight[] = [], bursts: Burst[] = []
  let selected: BrainNode | null = null
  let LOD = 0
  let dotGeo: THREE.BufferGeometry | null = null, ringGeo: THREE.BufferGeometry | null = null, synGeo: THREE.BufferGeometry | null = null
  let synList: { n: BrainNode; a: THREE.Vector3; b: THREE.Vector3 }[] = []

  function disposeLayer() {
    layer.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g) g.dispose() })
    brain.remove(layer)
  }

  function emitCount() {
    const done = nodes.filter(n => n.arrived)
    const w = done.filter(n => n.type === 'word').length
    cb.onCount(w, done.length - w)
  }

  function build(list: MemoryItem[], studentKey: string) {
    disposeLayer()
    layer = new THREE.Group()
    brain.add(layer)
    pulses = []; flights = []; bursts = []; selected = null
    const last = list.reduce((m, x) => x.date > m ? x.date : m, '')
    nodes = assignPositions(list, studentKey).map((n, i) => ({ ...n, i, isNew: n.date === last, f: 1, ft: 1, scale: 1, rs: -1, arrived: true, size0: 0, pop: null }))
    const N = nodes.length
    LOD = Math.min(1, Math.max(0, (N - 60) / 300))
    NODE_U.glow.value = 1 - 0.85 * LOD
    NODE_U.whiten.value = 0.55 - 0.35 * LOD
    NODE_U.gain.value = 1 - 0.35 * LOD

    const r = rng('syn-' + studentKey)
    synList = []
    dotGeo = null; ringGeo = null; synGeo = null

    if (N > 0) {
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3)
      const rn = nodes.filter(n => n.type === 'structure'), rpos = new Float32Array(rn.length * 3), rcol = new Float32Array(rn.length * 3)
      nodes.forEach(n => {
        pos.set([n.pos.x, n.pos.y, n.pos.z], n.i * 3)
        const c = (n.isNew && n.status !== 'fading') ? COL[n.status].clone().lerp(COL.white, 0.3 - 0.2 * LOD) : COL[n.status]
        col.set([c.r, c.g, c.b], n.i * 3)
        n.size0 = 0.27 * (1 - 0.4 * LOD) * (n.isNew ? 1.15 : 1) * (n.status === 'fading' ? 0.75 : 1)
      })
      rn.forEach((n, k) => {
        n.rs = k
        rpos.set([n.pos.x, n.pos.y, n.pos.z], k * 3)
        const c = COL[n.status]
        rcol.set([c.r, c.g, c.b], k * 3)
      })
      dotGeo = new THREE.BufferGeometry()
      dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      dotGeo.setAttribute('col', new THREE.BufferAttribute(col, 3))
      dotGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage))
      dotGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage))
      const dotPts = new THREE.Points(dotGeo, DOT_MAT)
      dotPts.frustumCulled = false
      layer.add(dotPts)
      ringGeo = new THREE.BufferGeometry()
      ringGeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3))
      ringGeo.setAttribute('col', new THREE.BufferAttribute(rcol, 3))
      ringGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(rn.length), 1).setUsage(THREE.DynamicDrawUsage))
      ringGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(rn.length), 1).setUsage(THREE.DynamicDrawUsage))
      const ringPts = new THREE.Points(ringGeo, RING_MAT)
      ringPts.frustumCulled = false
      layer.add(ringPts)

      // sinapslar: tek çizgi parçası grubu (kalabalıklaştıkça öğe başına bağ sayısı azalır)
      const K = N <= 60 ? 3 : (N <= 300 ? 2 : 1)
      const sp: number[] = []
      nodes.forEach(n => {
        const near: number[] = []
        for (let i = 0; i < NP; i += 3) { const d = V[i].distanceTo(n.pos); if (d > 0.06 && d < 0.30) near.push(i) }
        for (let k = 0; k < K && near.length; k++) {
          const t = near.splice(Math.floor(r() * near.length), 1)[0]
          sp.push(n.pos.x, n.pos.y, n.pos.z, V[t].x, V[t].y, V[t].z)
          synList.push({ n, a: n.pos, b: V[t] })
        }
      })
      synGeo = new THREE.BufferGeometry()
      synGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp), 3))
      synGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sp.length), 3).setUsage(THREE.DynamicDrawUsage))
      const synSeg = new THREE.LineSegments(synGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }))
      synSeg.frustumCulled = false
      layer.add(synSeg)
    }

    // ışık darbeleri: en fazla ~60 sprite (yeni öğeler öncelikli), lifler boyunca ek darbeler
    const cand = synList.map((_s, i) => i).sort((a, b) => (Number(synList[b].n.isNew) - Number(synList[a].n.isNew)) || (r() - 0.5)).slice(0, 60)
    cand.forEach(i => {
      const s = sprite(T.core, COL.white, 0.05, 0)
      layer.add(s)
      pulses.push({ a: synList[i].a, b: synList[i].b, s, phase: r(), speed: 0.5 + r() * 0.4, boost: 0, own: synList[i].n })
    })
    const rf = rng('fp')
    FIB.forEach((pts, k) => {
      if (k % 2) return
      const s = sprite(T.core, COL.pulse, 0.07, 0)
      layer.add(s)
      pulses.push({ path: pts, s, phase: rf(), speed: 0.12 + rf() * 0.15, boost: 0, own: null })
    })

    setFilter('all')
    play()
  }

  function play() {
    flights.forEach(f => f.trail.forEach(t => layer.remove(t)))
    flights = []
    const fresh = nodes.filter(n => n.isNew)
    nodes.forEach(n => { n.arrived = true })
    if (reduce) { emitCount(); return }
    const now = performance.now(), fly = fresh.slice(0, 40), gap = Math.min(420, 7000 / Math.max(fly.length, 1)), TL = fly.length > 15 ? 8 : 16
    fly.forEach((n, k) => {
      n.arrived = false
      const a = k / Math.max(fly.length, 1) * Math.PI * 2
      const from = new THREE.Vector3(Math.cos(a) * 4.5, 2.4 + Math.sin(a * 2) * 1.1, Math.sin(a) * 4.5)
      const ctrl = from.clone().lerp(n.pos, 0.5).add(new THREE.Vector3(0, 1.2, 0))
      const trail: THREE.Sprite[] = []
      for (let i = 0; i < TL; i++) {
        const s = sprite(T.glow, i < 2 ? COL.white : COL[n.status], 0.18 * (1 - i / (TL + 2)), 0)
        s.material.fog = false
        layer.add(s)
        trail.push(s)
      }
      flights.push({ n, from, ctrl, start: now + 700 + k * gap, dur: 1500, trail, hist: [], TL })
    })
    emitCount()
  }
  const bez = (a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number) => {
    const u = 1 - t
    return new THREE.Vector3(u * u * a.x + 2 * u * c.x + t * t * b.x, u * u * a.y + 2 * u * c.y + t * t * b.y, u * u * a.z + 2 * u * c.z + t * t * b.z)
  }

  function setFilter(k: 'all' | MemStatus) {
    nodes.forEach(n => { n.ft = (k === 'all' || n.status === k) ? 1 : 0.08 })
    if (selected && selected.ft < 0.5) { selected = null; cb.onSelect(null) }
  }
  function select(i: number | null) {
    selected = i === null ? null : (nodes[i] ?? null)
  }

  // Etkileşim
  let drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null
  let pinch: { d: number; z: number } | null = null
  let autoSpin = !reduce, lastInteract = 0
  const pts = new Map<number, { x: number; y: number }>()
  const onDown = (e: PointerEvent) => {
    space.setPointerCapture(e.pointerId)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false }
    if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), z: camera.position.z }; drag = null }
    autoSpin = false; lastInteract = performance.now()
  }
  const onMove = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && pts.size === 2) {
      const [p, q] = [...pts.values()]
      const d = Math.hypot(p.x - q.x, p.y - q.y)
      camera.position.z = Math.min(ZMAX, Math.max(ZMIN, pinch.z * pinch.d / d))
      return
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.x = e.clientX; drag.y = e.clientY
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true
      brain.rotation.y += dx * 0.008
      brain.rotation.x = Math.max(-1, Math.min(1, brain.rotation.x + dy * 0.006))
    }
    lastInteract = performance.now()
  }
  const onUp = (e: PointerEvent) => {
    if (drag && !drag.moved && pts.size === 1) tap(e)
    pts.delete(e.pointerId)
    if (pts.size < 2) pinch = null
    if (pts.size === 0) drag = null
    lastInteract = performance.now()
  }
  const onCancel = (e: PointerEvent) => { pts.delete(e.pointerId); drag = null; pinch = null }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    camera.position.z = Math.min(ZMAX, Math.max(ZMIN, camera.position.z + e.deltaY * 0.004))
    autoSpin = false; lastInteract = performance.now()
  }
  space.addEventListener('pointerdown', onDown)
  space.addEventListener('pointermove', onMove)
  space.addEventListener('pointerup', onUp)
  space.addEventListener('pointercancel', onCancel)
  space.addEventListener('wheel', onWheel, { passive: false })

  const _wp = new THREE.Vector3()
  function tap(e: PointerEvent) {
    scene.updateMatrixWorld()
    const rect = renderer.domElement.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top
    let best: BrainNode | null = null, bd = 34
    const cd = brain.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position)
    nodes.forEach(n => {
      if (!n.arrived || n.ft < 0.5) return
      _wp.copy(n.pos)
      brain.localToWorld(_wp)
      const dist = _wp.distanceTo(camera.position)
      _wp.project(camera)
      const sx = (_wp.x + 1) / 2 * rect.width, sy = (1 - _wp.y) / 2 * rect.height, back = dist - cd > 0.1, d = Math.hypot(sx - mx, sy - my) + (back ? 24 : 0)
      if (d < bd && _wp.z < 1) { bd = d; best = n }
    })
    const hit = best as BrainNode | null
    selected = hit
    cb.onSelect(hit ? hit.i : null)
  }

  // Döngü
  let t0: number | null = null, frames = 0, raf = 0, disposed = false
  function loop(now: number) {
    if (disposed) return
    raf = requestAnimationFrame(loop)
    if (bloomOn) { if (t0 === null) t0 = now; frames++; if (now - t0 > 2500 && frames < (now - t0) / 34) { bloomOn = false } }
    if (!autoSpin && !reduce && now - lastInteract > 4000) autoSpin = true
    if (autoSpin) brain.rotation.y += 0.0022
    const cd = camera.position.z
    const fog = scene.fog as THREE.Fog
    fog.near = Math.max(0.1, cd - 0.9); fog.far = cd + 1.9
    NODE_U.fogNear.value = fog.near; NODE_U.fogFar.value = fog.far

    flights.forEach(f => {
      if (f.done) return
      const t = (now - f.start) / f.dur
      if (t < 0) return
      const e = t >= 1 ? 1 : 1 - Math.pow(1 - t, 3), p = bez(f.from, f.ctrl, f.n.pos, e)
      f.hist.unshift(p)
      if (f.hist.length > f.TL) f.hist.pop()
      f.trail.forEach((s, i) => { s.position.copy(f.hist[Math.min(i, f.hist.length - 1)]); s.material.opacity = t >= 1 ? 0 : (1 - i / f.TL) * 0.9 })
      if (t >= 1) {
        f.done = true
        f.trail.forEach(s => layer.remove(s))
        const n = f.n
        n.arrived = true; n.scale = 0.01; n.pop = now
        const b = sprite(T.ring, COL[n.status], 0.12, 1)
        b.position.copy(n.pos); layer.add(b); bursts.push({ s: b, start: now })
        const b2 = sprite(T.glow, COL.white, 0.14, 0.8)
        b2.position.copy(n.pos); layer.add(b2); bursts.push({ s: b2, start: now, flash: true })
        pulses.forEach(p2 => { if (p2.own === n) p2.boost = 1 })
        emitCount()
      }
    })

    if (dotGeo && ringGeo && synGeo) {
      const sz = dotGeo.attributes.size.array as Float32Array, al = dotGeo.attributes.alpha.array as Float32Array
      const rs = ringGeo.attributes.size.array as Float32Array, ra = ringGeo.attributes.alpha.array as Float32Array
      const sc = synGeo.attributes.color.array as Float32Array
      nodes.forEach(n => {
        if (n.pop) {
          const t = (now - n.pop) / 600
          if (t >= 1) { n.scale = 1; n.pop = null } else { n.scale = Math.max(0.01, t < 0.5 ? t * 2 * 1.6 : 1.6 - (t - 0.5) * 2 * 0.6) }
        }
        n.f += (n.ft - n.f) * 0.12
        const pulse = n.status === 'learning' ? 0.88 + 0.12 * Math.sin(now / 700 + n.pos.x * 6) : 1, vis = n.arrived ? 1 : 0, sel = n === selected ? 1.25 : 1
        const a = vis * n.f * pulse * (n.status === 'fading' ? 0.6 : 0.95)
        al[n.i] = a; sz[n.i] = n.size0 * n.scale * sel
        if (n.rs >= 0) { ra[n.rs] = vis * n.f * (n.status === 'fading' ? 0.5 : 0.85); rs[n.rs] = 0.21 * (1 - 0.4 * LOD) * n.scale * sel * (n.isNew ? 1.1 : 1) }
      })
      synList.forEach((s, i) => {
        const c = COL[s.n.status], k = (s.n.arrived ? s.n.f : 0) * (LOD > 0.5 ? 0.22 : 0.32)
        sc[i * 6] = sc[i * 6 + 3] = c.r * k
        sc[i * 6 + 1] = sc[i * 6 + 4] = c.g * k
        sc[i * 6 + 2] = sc[i * 6 + 5] = c.b * k
      })
      dotGeo.attributes.size.needsUpdate = true; dotGeo.attributes.alpha.needsUpdate = true
      ringGeo.attributes.size.needsUpdate = true; ringGeo.attributes.alpha.needsUpdate = true
      synGeo.attributes.color.needsUpdate = true
    }
    bursts = bursts.filter(b => {
      const t = (now - b.start) / (b.flash ? 500 : 900)
      if (t >= 1) { layer.remove(b.s); return false }
      b.s.scale.setScalar(b.flash ? 0.14 + t * 0.45 : 0.1 + t * 0.6)
      b.s.material.opacity = (1 - t) * 0.7
      return true
    })
    pulses.forEach(p => {
      p.phase = (p.phase + p.speed * 0.016 * (1 + p.boost * 2)) % 1
      if (p.path) {
        const k = p.phase * (p.path.length - 1), i = Math.floor(k)
        p.s.position.copy(p.path[i]).lerp(p.path[Math.min(i + 1, p.path.length - 1)], k - i)
        p.s.material.opacity = Math.sin(p.phase * Math.PI) * 0.8
      } else if (p.a && p.b && p.own) {
        p.s.position.copy(p.a).lerp(p.b, p.phase)
        const vis = p.own.arrived ? p.own.f : 0
        p.s.material.opacity = vis * Math.sin(p.phase * Math.PI) * (0.5 + p.boost * 0.5)
        p.s.scale.setScalar(0.05 + p.boost * 0.05)
        p.boost = Math.max(0, p.boost - 0.002)
      }
    })
    if (selected) {
      const wp = brain.localToWorld(selected.pos.clone()), cw = brain.getWorldPosition(new THREE.Vector3()), v = wp.clone().project(camera)
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight
      bubble.style.left = ((v.x + 1) / 2 * w) + 'px'
      bubble.style.top = ((1 - v.y) / 2 * h) + 'px'
      bubble.style.opacity = String((wp.distanceTo(camera.position) - cw.distanceTo(camera.position)) > 0.1 ? 0.45 : 1)
    }
    if (bloomOn && composer) composer.render(); else renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(loop)

  function dispose() {
    disposed = true
    cancelAnimationFrame(raf)
    removeEventListener('resize', size)
    if (ro) ro.disconnect()
    space.removeEventListener('pointerdown', onDown)
    space.removeEventListener('pointermove', onMove)
    space.removeEventListener('pointerup', onUp)
    space.removeEventListener('pointercancel', onCancel)
    space.removeEventListener('wheel', onWheel)
    scene.traverse(o => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else if (mat) mat.dispose()
    })
    Object.values(T).forEach(t => t.dispose())
    DOT_MAT.dispose(); RING_MAT.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }

  return {
    setItems: build,
    setFilter,
    select,
    replay: play,
    dispose,
  }
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────────
interface Props {
  students: string[]                    // seçilebilir öğrenci adları (birden fazlaysa seçim düğmeleri çıkar)
  studentName: string
  onSelectStudent: (name: string) => void
  items: MemoryItem[]
  skipped: number                       // okunamayan satır sayısı
  showDiagnostics: boolean              // sadece Owner görür
  status: 'loading' | 'ok' | 'error'
  unitTitles: Record<string, string>    // unit_id → ünite başlığı
}

type Engine = ReturnType<typeof createEngine>

export default function MemoryBrain({ students, studentName, onSelectStudent, items, skipped, showDiagnostics, status, unitTitles }: Props) {
  const spaceRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const replayRef = useRef<HTMLButtonElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const [webglFailed, setWebglFailed] = useState(false)
  const [filter, setFilterState] = useState<'all' | MemStatus>('all')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const wordsTotal = items.filter(n => n.type === 'word').length
  const [counts, setCounts] = useState({ w: wordsTotal, s: items.length - wordsTotal })

  // Yazı tipi (önizlemedeki gibi Nunito)
  useEffect(() => {
    if (document.getElementById('mb-nunito')) return
    const l = document.createElement('link')
    l.id = 'mb-nunito'
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800&display=swap'
    document.head.appendChild(l)
  }, [])

  // Sahneyi kur / söktür
  useEffect(() => {
    const space = spaceRef.current, bubble = bubbleRef.current, rp = replayRef.current
    if (!space || !bubble) return
    let engine: Engine
    try {
      engine = createEngine(space, bubble, {
        onSelect: i => setSelectedIdx(i),
        onCount: (w, s) => setCounts({ w, s }),
      })
    } catch {
      setWebglFailed(true)
      return
    }
    engineRef.current = engine
    const stop = (e: Event) => e.stopPropagation()
    const evs = ['pointerdown', 'pointerup', 'pointermove']
    if (rp) evs.forEach(ev => rp.addEventListener(ev, stop))
    return () => {
      if (rp) evs.forEach(ev => rp.removeEventListener(ev, stop))
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  // Öğeler ya da öğrenci değişince beyni yeniden kur
  useEffect(() => {
    const w = items.filter(n => n.type === 'word').length
    setCounts({ w, s: items.length - w })
    setFilterState('all')
    setSelectedIdx(null)
    if (engineRef.current) engineRef.current.setItems(items, studentName)
  }, [items, studentName])

  function applyFilter(k: 'all' | MemStatus) {
    setFilterState(k)
    if (engineRef.current) engineRef.current.setFilter(k)
    setSelectedIdx(cur => (cur !== null && k !== 'all' && items[cur]?.status !== k) ? null : cur)
  }
  function pick(i: number) {
    setSelectedIdx(i)
    if (engineRef.current) engineRef.current.select(i)
  }

  const last = items.reduce((m, x) => x.date > m ? x.date : m, '')
  const newCount = items.filter(n => n.date === last).length
  const selected = selectedIdx !== null ? items[selectedIdx] : null
  const unitName = (u: string) => unitTitles[u] || u
  const typeLabel = (t: string) => t === 'structure' ? 'Structure' : 'Word'
  const groups = (filter === 'all' ? STATUS_ORDER : [filter]).map(k => ({
    k,
    rows: items.map((it, i) => ({ it, i })).filter(x => x.it.status === k).sort((a, b) => a.it.date < b.it.date ? 1 : a.it.date > b.it.date ? -1 : 0),
  })).filter(g => g.rows.length > 0)

  return (
    <div className="mb-scope mb-root">
      <MemoryStyles />
      <h1>My Brain</h1>
      <p className="mb-sub">Every word and structure you learn lights up a neuron here.</p>

      {students.length > 1 && (
        <div className="mb-chips" role="group" aria-label="Student">
          {students.map(n => (
            <button key={n} type="button" className="mb-chip" aria-pressed={n === studentName} onClick={() => onSelectStudent(n)}>{n}</button>
          ))}
        </div>
      )}

      {status === 'loading' && <p className="mb-count">Loading your memory…</p>}
      {status === 'error' && <p className="mb-count">Your memory could not be loaded right now. Please try again a little later.</p>}
      {status === 'ok' && items.length > 0 && (
        <>
          <p className="mb-count">Your memory holds <b>{counts.w} words</b> and <b>{counts.s} structures</b>.</p>
          <p className="mb-newline">+{newCount} from your latest lesson ({fmtDate(last)}).</p>
        </>
      )}
      {status === 'ok' && items.length === 0 && (
        <p className="mb-count">Nothing here yet. The words and structures you learn will light up here.</p>
      )}
      {showDiagnostics && skipped > 0 && (
        <p className="mb-note">{skipped} {skipped === 1 ? 'row' : 'rows'} in the student's sheet could not be read (check date, type and status).</p>
      )}

      <div className="mb-space" ref={spaceRef}>
        <button className="mb-replay" ref={replayRef} type="button" onClick={() => engineRef.current?.replay()}>Recently Learned</button>
        <div className="mb-bubble" ref={bubbleRef} hidden={selected === null}>
          {selected && <><i className="mb-dot" style={{ background: ST[selected.status].hex }} />{selected.item}</>}
        </div>
        <div className="mb-hint3d">{webglFailed ? '3D view is not available on this device' : 'Drag to turn, pinch to zoom, tap a light'}</div>
      </div>

      <div className="mb-filters" role="group" aria-label="Filter by status">
        <button type="button" className="mb-chip" aria-pressed={filter === 'all'} onClick={() => applyFilter('all')}>All {items.length}</button>
        {STATUS_ORDER.map(k => (
          <button key={k} type="button" className="mb-chip" aria-pressed={filter === k} onClick={() => applyFilter(k)}>
            <i className="mb-dot" style={{ background: ST[k].css }} />{ST[k].label} {items.filter(n => n.status === k).length}
          </button>
        ))}
      </div>

      <div className="mb-legend">
        <span><i className="mb-dot" style={{ background: 'var(--mb-known)' }} />Known</span>
        <span><i className="mb-dot" style={{ background: 'var(--mb-learning)' }} />Learning</span>
        <span><i className="mb-dot" style={{ background: 'var(--mb-fading)' }} />Fading</span>
        <span><i className="mb-dot" style={{ border: '2px solid var(--mb-muted)', background: 'transparent' }} />Ring = structure</span>
      </div>

      <div className="mb-panel" aria-live="polite" style={{ marginTop: 12 }}>
        {selected ? (
          <>
            <p className="mb-item">{selected.item}</p>
            <p className="mb-meta"><i className="mb-dot" style={{ background: ST[selected.status].css }} />{ST[selected.status].label}, {typeLabel(selected.type)}</p>
            <p className="mb-meta">{unitName(selected.unit)}</p>
            <p className="mb-meta">Learned on {fmtDate(selected.date)}</p>
            {selected.date === last && <p className="mb-meta">From your latest lesson</p>}
          </>
        ) : <p className="mb-hint">Tap a light to see what it is.</p>}
      </div>

      <div className="mb-list" style={{ marginTop: 12 }}>
        {groups.length === 0 && <p style={{ padding: 12, color: 'var(--mb-muted)' }}>Nothing here yet.</p>}
        {groups.map(g => (
          <div key={g.k}>
            <div className="mb-gh"><i className="mb-dot" style={{ background: ST[g.k].css }} />{ST[g.k].label} ({g.rows.length})</div>
            {g.rows.map(({ it, i }) => (
              <button key={i} type="button" className="mb-row" onClick={() => pick(i)}>
                <span className="mb-nm">{it.item}</span>
                <span className="mb-mt">{typeLabel(it.type)}, {unitName(it.unit)}<br />{fmtDate(it.date)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="mb-credit">Brain shape derived from the MNI ICBM 2009a template. Copyright (C) 1993–2009 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University. Permission to use, copy, modify, and distribute this data for any purpose and without fee is hereby granted, provided that the above copyright notice appear in all copies.</p>
    </div>
  )
}
