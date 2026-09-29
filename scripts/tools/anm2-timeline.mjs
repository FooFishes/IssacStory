// 打印 anm2 动画的时间线概况：根节点（镜头）变化、每个图层可见的时间段
import path from 'node:path'
import { loadAnm2 } from '../lib/anm2.mjs'
const [, , file, animArg = '-'] = process.argv
const doc = await loadAnm2(path.resolve(file))
const anim = doc.anims[animArg === '-' ? doc.defaultAnim : animArg]
console.log('frames', anim.frameNum, 'fps', doc.fps)
let t = 0
console.log('ROOT:', anim.root.map((f) => { const s = `${t}:${f.XPosition},${f.YPosition} s${f.XScale}/${f.YScale} a${f.AlphaTint}${f.interpolated ? '~' : ''}`; t += f.Delay; return s }).join(' | ').slice(0, 1500))
for (const tr of anim.layers) {
  const name = doc.layers[tr.layer].name
  let t = 0, spans = [], cur = null
  for (const f of tr.frames) {
    const vis = f.visible && f.AlphaTint > 0 && f.Width > 0
    if (vis && !cur) cur = [t, t]
    if (vis) cur[1] = t + f.Delay
    if (!vis && cur) { spans.push(cur); cur = null }
    t += f.Delay
  }
  if (cur) spans.push(cur)
  const crops = new Set(tr.frames.map((f) => `${f.XCrop},${f.YCrop}`)).size
  console.log(name.padEnd(12), `frames=${tr.frames.length} crops=${crops}`, spans.map(([a, b]) => `${a}-${b}`).join(' ').slice(0, 600))
}
