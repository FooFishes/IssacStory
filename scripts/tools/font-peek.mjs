// 查看 BMFont 的基本信息，并把一段文字用位图字形拼出来（放大）看看效果
import sharp from 'sharp'
import { parseBMFont, glyphMask } from '../lib/bmfont.mjs'
const [, , file, text, out, scale = '4'] = process.argv
const f = await parseBMFont(file)
console.log(f.info, f.common, f.pages, 'chars', f.chars.size)
const S = +scale, H = f.common.lineHeight
let W = 0
const gs = []
for (const ch of text) { const g = await glyphMask(f, ch.codePointAt(0)); gs.push(g); W += g ? g.xadvance : 8 }
const img = Buffer.alloc(W * H * 4).fill(255)
let x0 = 0
for (const g of gs) {
  if (!g) { x0 += 8; continue }
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
    if (!g.mask[y * g.width + x]) continue
    const X = x0 + g.xoffset + x, Y = g.yoffset + y
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue
    const i = (Y * W + X) * 4; img[i] = img[i + 1] = img[i + 2] = 20
  }
  x0 += g.xadvance
}
await sharp(img, { raw: { width: W, height: H, channels: 4 } }).resize(W * S, H * S, { kernel: 'nearest' }).png().toFile(out)
