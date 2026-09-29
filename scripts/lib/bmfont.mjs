// 读取游戏里的 BMFont 位图字体（二进制 v3 格式），并把用到的字转成矢量“像素方块”字体。
// 游戏的中文界面就是用这些位图字渲染的，转成 TTF 之后网页上就能得到一模一样的像素字。
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import opentype from 'opentype.js'

export async function parseBMFont(file) {
  const buf = await readFile(file)
  if (buf.toString('latin1', 0, 3) !== 'BMF') throw new Error(`不是二进制 BMFont：${file}`)
  const font = { file, info: {}, common: {}, pages: [], chars: new Map(), kernings: [] }
  let p = 4
  while (p < buf.length) {
    const type = buf[p], size = buf.readUInt32LE(p + 1)
    const b = p + 5
    if (type === 1) {
      font.info = {
        size: buf.readInt16LE(b),
        bold: !!(buf[b + 2] & 0x10),
        name: buf.toString('utf8', b + 14, buf.indexOf(0, b + 14)),
      }
    } else if (type === 2) {
      font.common = {
        lineHeight: buf.readUInt16LE(b), base: buf.readUInt16LE(b + 2),
        scaleW: buf.readUInt16LE(b + 4), scaleH: buf.readUInt16LE(b + 6), pages: buf.readUInt16LE(b + 8),
        packed: !!(buf[b + 10] & 0x80),
      }
    } else if (type === 3) {
      let s = b
      while (s < b + size) {
        const e = buf.indexOf(0, s)
        font.pages.push(buf.toString('utf8', s, e))
        s = e + 1
      }
    } else if (type === 4) {
      for (let s = b; s < b + size; s += 20) {
        font.chars.set(buf.readUInt32LE(s), {
          x: buf.readUInt16LE(s + 4), y: buf.readUInt16LE(s + 6),
          width: buf.readUInt16LE(s + 8), height: buf.readUInt16LE(s + 10),
          xoffset: buf.readInt16LE(s + 12), yoffset: buf.readInt16LE(s + 14),
          xadvance: buf.readInt16LE(s + 16), page: buf[s + 18], chnl: buf[s + 19],
        })
      }
    } else if (type === 5) {
      for (let s = b; s < b + size; s += 10) {
        font.kernings.push({ first: buf.readUInt32LE(s), second: buf.readUInt32LE(s + 4), amount: buf.readInt16LE(s + 8) })
      }
    }
    p = b + size
  }
  return font
}

const pageCache = new Map()
async function loadPage(dir, name) {
  const key = path.join(dir, name)
  if (!pageCache.has(key)) {
    // 页面文件名大小写可能和磁盘不一致
    const { readdir } = await import('node:fs/promises')
    const hit = (await readdir(dir)).find((n) => n.toLowerCase() === name.toLowerCase())
    pageCache.set(key, sharp(path.join(dir, hit)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => ({ data, width: info.width })))
  }
  return pageCache.get(key)
}

// 取出一个字形的“墨水”遮罩：chnl 表示字形存在哪个颜色通道（1 蓝 2 绿 4 红 8 透明 15 全部）
export async function glyphMask(font, ch, threshold = 0.5) {
  const g = font.chars.get(ch)
  if (!g) return null
  const page = await loadPage(path.dirname(font.file), font.pages[g.page])
  const channel = { 1: 2, 2: 1, 4: 0, 8: 3 }[g.chnl] ?? 3
  const mask = new Uint8Array(g.width * g.height)
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const i = ((g.y + y) * page.width + g.x + x) * 4
      let v = page.data[i + channel] / 255
      // 没打包时：白字 + 透明底，或者（LanaPixel）不透明黑底白字——透明度 × 亮度 两种都能兼容
      if (g.chnl === 15 || !font.common.packed) {
        v = (page.data[i + 3] / 255) * (Math.max(page.data[i], page.data[i + 1], page.data[i + 2]) / 255)
      }
      mask[y * g.width + x] = v >= threshold ? 1 : 0
    }
  }
  return { ...g, mask }
}

/**
 * 把指定的字符转成像素方块矢量字体（TTF）。
 * 每个位图像素 = UNIT 个字体单位；em 大小 = 字号（像素）× UNIT。
 */
export async function toPixelFont(font, text, { family, threshold = 0.5, unit = 64 } = {}) {
  const size = Math.abs(font.info.size)
  const em = size * unit
  const ascent = font.common.base * unit
  const descent = -(font.common.lineHeight - font.common.base) * unit
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: Math.round(size / 2) * unit, path: new opentype.Path() })]
  const seen = new Set()
  for (const chr of text) {
    const code = chr.codePointAt(0)
    if (seen.has(code)) continue
    seen.add(code)
    const g = await glyphMask(font, code, threshold)
    if (!g) continue
    const p = new opentype.Path()
    // 每一行把连续的像素合并成一个矩形，减少轮廓数量
    for (let y = 0; y < g.height; y++) {
      let x = 0
      while (x < g.width) {
        if (!g.mask[y * g.width + x]) { x++; continue }
        let x2 = x
        while (x2 < g.width && g.mask[y * g.width + x2]) x2++
        const left = (g.xoffset + x) * unit, right = (g.xoffset + x2) * unit
        const top = (font.common.base - g.yoffset - y) * unit, bottom = top - unit
        p.moveTo(left, top); p.lineTo(left, bottom); p.lineTo(right, bottom); p.lineTo(right, top); p.close()
        x = x2
      }
    }
    glyphs.push(new opentype.Glyph({
      name: `u${code.toString(16)}`, unicode: code, advanceWidth: g.xadvance * unit, path: p,
    }))
  }
  const out = new opentype.Font({
    familyName: family, styleName: 'Regular', unitsPerEm: em, ascender: ascent, descender: descent, glyphs,
  })
  return Buffer.from(out.toArrayBuffer())
}
