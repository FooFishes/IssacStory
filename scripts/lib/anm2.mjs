// 以撒的 .anm2 动画文件：解析、按时间取帧、以及（构建时）光栅化成 PNG。
// .anm2 是一个很小的 XML：若干张精灵图（Spritesheet）、若干图层（Layer），
// 每个动画（Animation）里每个图层是一串帧（Frame），帧上有裁剪区域、锚点、位移、缩放、旋转、色调和持续帧数（Delay）。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const NUM = [
  'XPosition', 'YPosition', 'XPivot', 'YPivot', 'XCrop', 'YCrop', 'Width', 'Height', 'XScale', 'YScale',
  'Delay', 'RedTint', 'GreenTint', 'BlueTint', 'AlphaTint', 'RedOffset', 'GreenOffset', 'BlueOffset', 'Rotation',
]
// 插值时参与线性过渡的属性（裁剪/锚点/尺寸永远取当前帧）
const LERP = ['XPosition', 'YPosition', 'XScale', 'YScale', 'Rotation', 'RedTint', 'GreenTint', 'BlueTint', 'AlphaTint', 'RedOffset', 'GreenOffset', 'BlueOffset']

function attrs(s) {
  const out = {}
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

function frame(a) {
  const f = { visible: a.Visible !== 'false', interpolated: a.Interpolated === 'true' }
  for (const k of NUM) f[k] = a[k] === undefined ? (k.endsWith('Scale') ? 100 : k.endsWith('Tint') ? 255 : 0) : Number(a[k])
  if (!f.Delay) f.Delay = 1
  return f
}

export function parseAnm2(xml) {
  const doc = { fps: 30, sheets: {}, layers: {}, nulls: {}, anims: {}, defaultAnim: null }
  let anim = null, track = null
  for (const m of xml.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, selfClose] = m
    const a = attrs(rest)
    if (close) {
      if (tag === 'Animation') anim = null
      if (['RootAnimation', 'LayerAnimation', 'NullAnimation'].includes(tag)) track = null
      continue
    }
    switch (tag) {
      case 'Info': doc.fps = Number(a.Fps ?? 30); break
      case 'Spritesheet': doc.sheets[a.Id] = a.Path; break
      case 'Layer': doc.layers[a.Id] = { name: a.Name, sheet: a.SpritesheetId }; break
      case 'Null': doc.nulls[a.Id] = { name: a.Name }; break
      case 'Animations': doc.defaultAnim = a.DefaultAnimation; break
      case 'Animation':
        anim = { name: a.Name, frameNum: Number(a.FrameNum), loop: a.Loop === 'true', root: [], layers: [], nulls: [] }
        doc.anims[a.Name] = anim
        break
      case 'RootAnimation':
        track = anim.root
        break
      case 'LayerAnimation':
        track = { layer: a.LayerId, visible: a.Visible !== 'false', frames: [] }
        anim.layers.push(track)
        if (selfClose) track = null
        break
      case 'NullAnimation':
        track = { nullId: a.NullId, visible: a.Visible !== 'false', frames: [] }
        anim.nulls.push(track)
        if (selfClose) track = null
        break
      case 'Frame':
        if (!track) break
        ;(Array.isArray(track) ? track : track.frames).push(frame(a))
        break
    }
  }
  return doc
}

export async function loadAnm2(file) {
  const doc = parseAnm2(await readFile(file, 'utf8'))
  doc.file = file
  doc.dir = path.dirname(file)
  return doc
}

export const trackLength = (frames) => frames.reduce((n, f) => n + f.Delay, 0)

// 取某个时刻（单位：帧）的帧数据，处理插值
export function sample(frames, t) {
  let start = 0
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    if (t < start + f.Delay) {
      const next = frames[i + 1]
      if (!f.interpolated || !next) return f
      const p = (t - start) / f.Delay
      const out = { ...f }
      for (const k of LERP) out[k] = f[k] + (next[k] - f[k]) * p
      return out
    }
    start += f.Delay
  }
  // 轨道比动画短时，引擎会停在最后一帧
  return frames.length ? frames[frames.length - 1] : null
}

// ─── 光栅化（构建时用，把某一帧画成 RGBA） ───────────────────────────────
const sheetCache = new Map()
export async function loadSheet(file) {
  if (!sheetCache.has(file)) {
    sheetCache.set(file, sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({ data, width: info.width, height: info.height })))
  }
  return sheetCache.get(file)
}

// 找精灵图：anm2 里的路径大小写不一定对，还可能引用本地化目录
export async function resolveSheet(doc, sheetPath, { roots = [] } = {}) {
  const { readdir } = await import('node:fs/promises')
  const candidates = [path.join(doc.dir, sheetPath), ...roots.map((r) => path.join(r, sheetPath))]
  for (const c of candidates) {
    const dir = path.dirname(c)
    try {
      const names = await readdir(dir)
      const hit = names.find((n) => n.toLowerCase() === path.basename(c).toLowerCase())
      if (hit) return path.join(dir, hit)
    } catch {}
  }
  return null
}

const rad = (d) => (d * Math.PI) / 180

/**
 * 把动画在时刻 t 画到一张画布上。
 * opts: { width, height, originX, originY, sheets: {id: filePath}, layerFilter?(name) }
 */
export async function renderFrame(doc, animName, t, opts) {
  const anim = doc.anims[animName ?? doc.defaultAnim]
  const { width, height, originX = 0, originY = 0 } = opts
  const out = new Float32Array(width * height * 4)
  const root = sample(anim.root, t) ?? anim.root[anim.root.length - 1] ?? frame({})
  if (!root.visible) return toBuffer(out, width, height)

  for (const tr of anim.layers) {
    if (!tr.visible) continue
    const layer = doc.layers[tr.layer]
    if (opts.layerFilter && !opts.layerFilter(layer.name)) continue
    const f = sample(tr.frames, t)
    if (!f || !f.visible || f.Width <= 0 || f.Height <= 0) continue
    const file = opts.sheets[layer.sheet]
    if (!file) continue
    const sheet = await loadSheet(file)
    drawLayer(out, width, height, originX, originY, root, f, sheet)
  }
  return toBuffer(out, width, height)
}

function drawLayer(out, W, H, ox, oy, root, f, sheet) {
  const rs = [root.XScale / 100, root.YScale / 100]
  const ls = [f.XScale / 100, f.YScale / 100]
  if (!rs[0] || !rs[1] || !ls[0] || !ls[1]) return
  const rr = rad(root.Rotation), lr = rad(f.Rotation)
  // 局部（裁剪区内像素坐标） -> 世界
  const toWorld = (u, v) => {
    let x = (u - f.XPivot) * ls[0], y = (v - f.YPivot) * ls[1]
    ;[x, y] = [x * Math.cos(lr) - y * Math.sin(lr), x * Math.sin(lr) + y * Math.cos(lr)]
    x += f.XPosition; y += f.YPosition
    x *= rs[0]; y *= rs[1]
    ;[x, y] = [x * Math.cos(rr) - y * Math.sin(rr), x * Math.sin(rr) + y * Math.cos(rr)]
    return [x + root.XPosition + ox, y + root.YPosition + oy]
  }
  const toLocal = (X, Y) => {
    let x = X - ox - root.XPosition, y = Y - oy - root.YPosition
    ;[x, y] = [x * Math.cos(-rr) - y * Math.sin(-rr), x * Math.sin(-rr) + y * Math.cos(-rr)]
    x /= rs[0]; y /= rs[1]
    x -= f.XPosition; y -= f.YPosition
    ;[x, y] = [x * Math.cos(-lr) - y * Math.sin(-lr), x * Math.sin(-lr) + y * Math.cos(-lr)]
    return [x / ls[0] + f.XPivot, y / ls[1] + f.YPivot]
  }
  const corners = [[0, 0], [f.Width, 0], [0, f.Height], [f.Width, f.Height]].map(([u, v]) => toWorld(u, v))
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))))
  const x1 = Math.min(W, Math.ceil(Math.max(...corners.map((c) => c[0]))))
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))))
  const y1 = Math.min(H, Math.ceil(Math.max(...corners.map((c) => c[1]))))
  const tint = [f.RedTint * root.RedTint / 65025, f.GreenTint * root.GreenTint / 65025, f.BlueTint * root.BlueTint / 65025]
  const offset = [(f.RedOffset + root.RedOffset) / 255, (f.GreenOffset + root.GreenOffset) / 255, (f.BlueOffset + root.BlueOffset) / 255]
  const alpha = (f.AlphaTint / 255) * (root.AlphaTint / 255)
  if (alpha <= 0) return
  for (let Y = y0; Y < y1; Y++) {
    for (let X = x0; X < x1; X++) {
      const [u, v] = toLocal(X + 0.5, Y + 0.5)
      if (u < 0 || v < 0 || u >= f.Width || v >= f.Height) continue
      const sx = f.XCrop + Math.floor(u), sy = f.YCrop + Math.floor(v)
      if (sx < 0 || sy < 0 || sx >= sheet.width || sy >= sheet.height) continue
      const s = (sy * sheet.width + sx) * 4
      const a = (sheet.data[s + 3] / 255) * alpha
      if (a <= 0) continue
      const d = (Y * W + X) * 4
      for (let c = 0; c < 3; c++) {
        const src = Math.min(1, (sheet.data[s + c] / 255) * tint[c] + offset[c])
        out[d + c] = src * a + out[d + c] * (1 - a)
      }
      out[d + 3] = a + out[d + 3] * (1 - a)
    }
  }
}

function toBuffer(out, width, height) {
  const buf = Buffer.alloc(width * height * 4)
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3]
    buf[i + 3] = Math.round(a * 255)
    // out 里的颜色已经按“源在上”混合过（非预乘），直接写回
    for (let c = 0; c < 3; c++) buf[i + c] = Math.round(Math.min(1, out[i + c] / (a || 1)) * 255 * (a ? 1 : 0))
  }
  return { data: buf, width, height }
}
