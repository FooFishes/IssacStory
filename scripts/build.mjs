// 构建：故事脚本 → dist/index.html，样式 + 生成的动画 CSS → dist/style.css，
// 游戏的位图字体 → 只含用到的字的像素字体（woff2），素材复制到 dist/assets。
// 产物里不允许出现任何 JavaScript（最后会检查一遍）。
//
//   node scripts/build.mjs            构建一次
//   node scripts/build.mjs --watch    监听 src/ 变化自动重建，并在 http://localhost:5173 提供预览
import { mkdir, readFile, writeFile, readdir, cp, rm, rename, access, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL, fileURLToPath as fileURLToPathSafe } from 'node:url'
import subsetFont from 'subset-font'
import { parseAnm2 } from './lib/anm2.mjs'
import { parseBMFont, toPixelFont } from './lib/bmfont.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const DIST = path.join(ROOT, 'dist')
// 先构建到临时目录，完成后再整体换上去：预览服务器永远不会读到构建了一半的 dist
const TMP = path.join(ROOT, 'dist.tmp')
const TBOI = path.join(ROOT, '.cache/tboi')
const RAW = 'https://raw.githubusercontent.com/Derugon/TBoIR-resources/latest/'

// 游戏自己的字体（中文版）：位图 BMFont，构建时转成像素矢量字
const FONTS = [
  { family: 'LanaPixel', out: 'lanapixel.woff2', fnt: 'resources/font/cjk/lanapixel.fnt', pages: ['resources/font/cjk/lanapixel_0.png'] },
  {
    family: 'TeamMeat', out: 'teammeat12.woff2', fnt: 'resources.zh/font/teammeatfontextended12.fnt',
    pages: ['resources.zh/font/teammeatfontextended12_0.png', 'resources.zh/font/teammeatfontextended12_1.png'],
  },
  {
    family: 'TeamMeatBold', out: 'teammeat16b.woff2', fnt: 'resources.zh/font/teammeatfontextended16bold.fnt',
    pages: ['resources.zh/font/teammeatfontextended16bold_0.png', 'resources.zh/font/teammeatfontextended16bold_1.png'],
  },
  {
    family: 'Upheaval', out: 'upheaval.woff2', fnt: 'resources.zh/font/upheavalextended.fnt',
    pages: ['resources.zh/font/upheavalextended_0.png', 'resources.zh/font/upheavalextended_1.png'],
  },
  // HUD 上的数字
  {
    family: 'PfTempesta', out: 'pftempesta.woff2', fnt: 'resources/font/pftempestasevencondensed.fnt',
    pages: ['resources/font/pftempestasevencondensed_0.png'],
  },
]

const STYLES = ['story.css']

const exists = (p) => access(p).then(() => true, () => false)

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

// watch 模式下每次都要拿到最新的模块：给 URL 加时间戳（只对入口文件有效，入口里的 import 也要跟着刷新）
const load = (file) => import(pathToFileURL(path.join(SRC, file)).href + `?t=${Date.now()}`)

async function ensureRaw(repoPath) {
  const dest = path.join(TBOI, repoPath)
  if (await exists(dest)) return dest
  await mkdir(path.dirname(dest), { recursive: true })
  console.log(`  下载 ${repoPath}（只需一次）…`)
  const res = await fetch(RAW + repoPath.split('/').map(encodeURIComponent).join('/'))
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${repoPath}`)
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}

const fontCache = new Map()
async function buildFonts(text) {
  const chars = [...new Set(text)].filter((c) => c.codePointAt(0) >= 32).sort().join('')
  const key = createHash('sha1').update(chars).digest('hex')
  await mkdir(path.join(TMP, 'assets/fonts'), { recursive: true })
  for (const f of FONTS) {
    const cacheKey = f.out + key
    if (!fontCache.has(cacheKey)) {
      for (const p of f.pages) await ensureRaw(p)
      const font = await parseBMFont(await ensureRaw(f.fnt))
      const ttf = await toPixelFont(font, chars, { family: f.family })
      fontCache.set(cacheKey, await subsetFont(ttf, chars, { targetFormat: 'woff2' }))
    }
    await writeFile(path.join(TMP, 'assets/fonts', f.out), fontCache.get(cacheKey))
  }
  return chars.length
}

// 产物里不许有 JS：<script>、内联事件、javascript: 链接、.js 文件都算
async function assertNoJs() {
  const problems = []
  for (const file of await walk(TMP)) {
    const rel = path.relative(TMP, file)
    if (/\.(m?js|cjs)$/i.test(file)) problems.push(`${rel}: 是 JS 文件`)
    if (!/\.(html|svg)$/i.test(file)) continue
    const text = await readFile(file, 'utf8')
    if (/<script\b/i.test(text)) problems.push(`${rel}: 含有 <script>`)
    if (/<[^>]+\son[a-z]+\s*=/i.test(text)) problems.push(`${rel}: 含有内联事件属性`)
    if (/javascript:/i.test(text)) problems.push(`${rel}: 含有 javascript: 链接`)
  }
  if (problems.length) throw new Error('产物中发现 JavaScript：\n' + problems.join('\n'))
}

// 把 dist.tmp 换成 dist（Windows 上文件可能正被预览服务器读取，失败就稍等重试）
async function swapIntoDist() {
  for (let i = 0; ; i++) {
    try {
      await rm(DIST, { recursive: true, force: true })
      await rename(TMP, DIST)
      return
    } catch (e) {
      if (i > 20) throw e
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

export async function build() {
  const t0 = performance.now()
  const manifest = JSON.parse(await readFile(path.join(SRC, 'assets/manifest.json'), 'utf8'))
  const docs = {}
  for (const [key, a] of Object.entries(manifest.anm2)) {
    docs[key] = parseAnm2(await readFile(path.join(SRC, 'assets', a.anm2), 'utf8'))
    docs[key].file = a.anm2
  }
  const { renderStory } = await load('story/page.mjs')
  const story = renderStory({ manifest, docs })

  await rm(TMP, { recursive: true, force: true })
  await mkdir(TMP, { recursive: true })

  // 注意：不要用 lightningcss 之类的压缩器——它们会把 animation 简写和 animation-timeline 合并成一条，
  // 滚动驱动动画就失效了。这里只去掉注释和多余空白。
  const css = (await Promise.all(STYLES.map((f) => readFile(path.join(SRC, 'styles', f), 'utf8')))).join('\n') + '\n' + story.css
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n')

  await writeFile(path.join(TMP, 'index.html'), story.html)
  await writeFile(path.join(TMP, 'style.css'), code)
  for (const dir of ['gfx', 'cut', 'rooms']) await cp(path.join(SRC, 'assets', dir), path.join(TMP, 'assets', dir), { recursive: true })

  const glyphs = await buildFonts(story.html + css)
  await assertNoJs()
  await swapIntoDist()

  const kb = (n) => (n / 1024).toFixed(1) + ' KB'
  const sizeOf = async (p) => (await stat(path.join(DIST, p))).size
  console.log(
    `✓ 构建完成 ${(performance.now() - t0).toFixed(0)}ms — index.html ${kb(await sizeOf('index.html'))}, ` +
    `style.css ${kb(code.length)}, 字体 ${glyphs} 个字符，0 行 JS`,
  )
}

function serve(port = 5173) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
    '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  }
  createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = path.join(DIST, url.endsWith('/') ? url + 'index.html' : url)
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return }
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  }).listen(port, () => console.log(`预览：http://localhost:${port}/`))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const watching = process.argv.includes('--watch')
  try {
    await build()
  } catch (e) {
    console.error(e)
    if (!watching) process.exit(1)
  }
  if (watching) {
    serve(Number(process.env.PORT) || 5173)
    // 每次重建都开一个新进程：ESM 的模块缓存清不掉，这样才能拿到 src/ 里所有模块的最新版本
    const { spawn } = await import('node:child_process')
    let timer, running = null
    // Windows 上读取文件也会触发 watch 事件：只有修改时间真的变了才重建
    const mtimes = new Map()
    watch(SRC, { recursive: true }, async (_, name) => {
      if (name) {
        const mtime = await stat(path.join(SRC, name)).then((s) => s.mtimeMs, () => -1)
        const prev = mtimes.get(name)
        mtimes.set(name, mtime)
        // 第一次见到的文件：最近 2 秒内改过才算真的修改
        if (prev === undefined ? mtime !== -1 && Date.now() - mtime > 2000 : prev === mtime) return
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        running?.kill()
        running = spawn(process.execPath, [fileURLToPathSafe(import.meta.url)], { stdio: 'inherit' })
      }, 150)
    })
  }
}
