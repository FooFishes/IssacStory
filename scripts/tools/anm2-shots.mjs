// 自动把过场动画切成“镜头”：每 6 帧（一个线条抖动周期）采样一次，画面变化大就切一刀
import path from 'node:path'
import sharp from 'sharp'
import { loadAnm2, renderFrame, resolveSheet } from '../lib/anm2.mjs'
const [, , file, skipLayers = '', thr = '0.02'] = process.argv
const doc = await loadAnm2(path.resolve(file))
const sheets = {}
for (const [id, p] of Object.entries(doc.sheets)) sheets[id] = await resolveSheet(doc, p)
const skip = new Set(skipLayers.split(',').filter(Boolean))
const anim = doc.anims[doc.defaultAnim]
const W = 432, H = 240
async function sig(t) {
  const img = await renderFrame(doc, null, t, { width: W, height: H, sheets, layerFilter: (n) => !skip.has(n) })
  // 用两帧抖动的合成（取 max）抵消线条抖动，再缩小成 54x30 的“指纹”
  const img2 = await renderFrame(doc, null, t + 3, { width: W, height: H, sheets, layerFilter: (n) => !skip.has(n) })
  const a = Buffer.alloc(W * H)
  for (let i = 0; i < W * H; i++) a[i] = Math.max(img.data[i * 4 + 3], img2.data[i * 4 + 3])
  const small = await sharp(a, { raw: { width: W, height: H, channels: 1 } }).blur(2).resize(54, 30).raw().toBuffer()
  return small
}
const diff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length / 255 }
let prev = null, segStart = 0
const segs = []
for (let t = 0; t < anim.frameNum; t += 6) {
  const s = await sig(t)
  if (prev && diff(s, prev) > +thr) { segs.push([segStart, t]); segStart = t }
  prev = s
}
segs.push([segStart, anim.frameNum])
console.log(JSON.stringify(segs.map(([a, b]) => [a, b, +((b - a) / 30).toFixed(1)])))
