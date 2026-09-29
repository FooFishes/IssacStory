// 把 anm2 动画的若干帧渲染成一张拼图，方便查看（只用于开发，读 .cache/tboi 里的原始资源）
// node scripts/tools/preview-anm2.mjs <anm2> <anim|-> <w> <h> <ox> <oy> <out.png> <t1,t2,...|auto> [cols] [scale]
import sharp from 'sharp'
import path from 'node:path'
import { loadAnm2, renderFrame, resolveSheet } from '../lib/anm2.mjs'
const [, , file, animArg, w, h, ox, oy, out, times, cols = '4', scale = '1'] = process.argv
const doc = await loadAnm2(path.resolve(file))
const anim = animArg === '-' ? doc.defaultAnim : animArg
const R = path.resolve(import.meta.dirname, '../../.cache/tboi')
const sheets = {}
// 贴图优先用中文本地化版本，其次 Repentance（dlc3），最后原版
for (const [id, p] of Object.entries(doc.sheets)) {
  const rel = path.relative(R, path.join(doc.dir, p)).split(path.sep).join('/').replace(/^resources[^/]*\//, '')
  for (const base of ['resources.zh', 'resources-dlc3', 'resources']) {
    sheets[id] = await resolveSheet({ dir: path.join(R, base) }, rel)
    if (sheets[id]) break
  }
  sheets[id] ??= await resolveSheet(doc, p)
}
console.log('anims:', Object.entries(doc.anims).map(([k, a]) => `${k}(${a.frameNum})`).join(' '))
console.log('sheets:', sheets)
const ts = times === 'auto' ? Array.from({ length: 12 }, (_, i) => Math.floor(i * doc.anims[anim].frameNum / 12)) : times.split(',').map(Number)
const W = +w, H = +h, C = +cols, S = +scale
const tiles = []
for (const t of ts) {
  const img = await renderFrame(doc, anim, t, { width: W, height: H, originX: +ox, originY: +oy, sheets })
  tiles.push(await sharp(img.data, { raw: { width: W, height: H, channels: 4 } }).resize(W * S, H * S, { kernel: 'nearest' }).png().toBuffer())
}
const rows = Math.ceil(tiles.length / C)
await sharp({ create: { width: W * S * C, height: H * S * rows, channels: 4, background: '#3a3a44' } })
  .composite(tiles.map((b, i) => ({ input: b, left: (i % C) * W * S, top: Math.floor(i / C) * H * S })))
  .png().toFile(out)
console.log('times', ts.join(','))
