// 从游戏的原始资源（GitHub: Derugon/TBoIR-resources，Repentance+ 最新版本）取素材，并加工成网页要用的样子：
//   - anm2 动画：复制 .anm2 + 它引用的精灵图（优先中文本地化版本），写一份清单给构建脚本
//   - 过场动画：把指定时刻的画面预先渲染成“线条抖动”的两帧长条图
//   - 房间：用背景贴图的左上角四分之一镜像拼出完整房间（原始分辨率）
//   - 文本：从 stringtable.sta 里取官方简体中文名称
// 加工结果提交在 src/assets 里，平时构建不需要跑这个脚本：npm run fetch-assets
import { mkdir, writeFile, readFile, access, copyFile, rm } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { loadAnm2, renderFrame } from './lib/anm2.mjs'
import { STORY_ASSETS } from '../src/story/assets.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const CACHE = path.join(ROOT, '.cache/tboi')
const OUT = path.join(ROOT, 'src/assets')
const RAW = 'https://raw.githubusercontent.com/Derugon/TBoIR-resources/latest/'
const TREE = 'https://api.github.com/repos/Derugon/TBoIR-resources/git/trees/latest?recursive=1'
const exists = (p) => access(p).then(() => true, () => false)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── 资源树：用来做大小写不敏感的路径查找 ────────────────────────────────────
let files
async function tree() {
  if (files) return files
  const cached = path.join(CACHE, 'tree.json')
  if (!(await exists(cached))) {
    await mkdir(CACHE, { recursive: true })
    // 未登录的 GitHub API 每小时只有 60 次；有 GITHUB_TOKEN 就带上
    const auth = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}
    const res = await fetch(TREE, { headers: { 'User-Agent': 'isaac-fan-page', ...auth } })
    if (!res.ok) throw new Error(`拿不到资源目录：${res.status}`)
    await writeFile(cached, await res.text())
  }
  const json = JSON.parse(await readFile(cached, 'utf8'))
  files = new Map(json.tree.filter((t) => t.type === 'blob').map((t) => [t.path.toLowerCase(), t.path]))
  return files
}

// 在 zh → dlc3 → 原版 里找一个资源（相对 resources 根目录的路径）
async function locate(rel, { prefer = ['resources.zh', 'resources-dlc3', 'resources'] } = {}) {
  const all = await tree()
  const clean = path.posix.normalize(rel.replaceAll('\\', '/')).toLowerCase()
  for (const base of prefer) {
    const hit = all.get(`${base}/${clean}`)
    if (hit) return hit
  }
  return null
}

async function download(repoPath) {
  const dest = path.join(CACHE, repoPath)
  if (await exists(dest)) return dest
  await mkdir(path.dirname(dest), { recursive: true })
  for (let i = 0; i < 4; i++) {
    const res = await fetch(RAW + repoPath.split('/').map(encodeURIComponent).join('/'))
    if (res.ok) {
      await writeFile(dest, Buffer.from(await res.arrayBuffer()))
      console.log('  下载', repoPath)
      return dest
    }
    await sleep(1500 * (i + 1))
  }
  throw new Error(`下载失败：${repoPath}`)
}

// 资源仓库里的路径 → src/assets 里的输出路径（小写、空格换成 -）
const assetName = (repoPath) => repoPath.replace(/^resources[^/]*\//, '').toLowerCase().replaceAll(' ', '-')

async function copyAsset(repoPath) {
  const src = await download(repoPath)
  const rel = assetName(repoPath)
  const dest = path.join(OUT, rel)
  await mkdir(path.dirname(dest), { recursive: true })
  if (rel.endsWith('.png')) await sharp(src).png({ compressionLevel: 9 }).toFile(dest)
  else await copyFile(src, dest)
  return rel
}

// ─── anm2 动画 ─────────────────────────────────────────────────────────────
async function prepareAnm2(key, spec) {
  const anmRepo = await locate(spec.anm2.replace(/^resources[^/]*\//, ''), { prefer: spec.prefer })
  if (!anmRepo) throw new Error(`找不到 ${spec.anm2}`)
  const local = await download(anmRepo)
  const doc = await loadAnm2(local)
  const dir = path.posix.dirname(anmRepo.replace(/^resources[^/]*\//, ''))
  const sheets = {}
  for (const [id, p] of Object.entries(doc.sheets)) {
    const override = spec.sheets?.[id]
    const repo = override ? await locate(override) : await locate(path.posix.join(dir, p.replaceAll('\\', '/')))
    if (!repo) { console.warn(`  [${key}] 精灵图 ${id} 找不到：${p}`); continue }
    sheets[id] = await copyAsset(repo)
  }
  const anmOut = `anm2/${key}.anm2`
  await mkdir(path.join(OUT, 'anm2'), { recursive: true })
  await copyFile(local, path.join(OUT, anmOut))
  return { anm2: anmOut, sheets }
}

// ─── 过场动画的镜头 ──────────────────────────────────────────────────────────
async function prepareCutscene(key, spec) {
  const repo = await locate(spec.anm2.replace(/^resources[^/]*\//, ''))
  const doc = await loadAnm2(await download(repo))
  const dir = path.posix.dirname(repo.replace(/^resources[^/]*\//, ''))
  const sheets = {}
  for (const [id, p] of Object.entries(doc.sheets)) {
    const hit = await locate(path.posix.join(dir, p))
    if (hit) sheets[id] = await download(hit)
  }
  const { width: W, height: H } = spec
  const outDir = path.join(OUT, 'cut', key)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const render = async (t, layers) =>
    renderFrame(doc, null, t, { width: W, height: H, sheets, layerFilter: (n) => layers(n.toLowerCase()) })
  const save = async (img, file) =>
    sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(outDir, file))

  // 背景（桌面和纸）与最上层的暗角各渲染一张
  for (const [name, { t, layers }] of Object.entries(spec.backgrounds)) {
    await save(await render(t, (n) => layers.includes(n)), `${name}.png`)
  }
  // 每个镜头：t 和 t+3 两帧（线条抖动），横向拼成一张长条
  const isDrawing = (n) => !spec.notDrawing.includes(n)
  for (const [i, shot] of spec.shots.entries()) {
    const a = await render(shot.t, isDrawing)
    const b = await render(shot.t + 3, isDrawing)
    const strip = Buffer.alloc(W * 2 * H * 4)
    for (let y = 0; y < H; y++) {
      a.data.copy(strip, y * W * 2 * 4, y * W * 4, (y + 1) * W * 4)
      b.data.copy(strip, (y * W * 2 + W) * 4, y * W * 4, (y + 1) * W * 4)
    }
    await sharp(strip, { raw: { width: W * 2, height: H, channels: 4 } }).png({ compressionLevel: 9 })
      .toFile(path.join(outDir, `${String(i).padStart(2, '0')}.png`))
  }
  return { dir: `cut/${key}`, width: W, height: H, shots: spec.shots.length }
}

// ─── 房间：用四分之一墙面镜像拼出 468×312 的完整房间 ───────────────────────────
async function prepareRoom(key, spec) {
  const src = await download(await locate(spec.sheet))
  const [qw, qh] = [234, 156]
  const variants = spec.variants ?? [[0, 0], [0, 0], [0, 0], [0, 0]]
  const piece = async ([vx, vy], flipX, flipY) => {
    let img = sharp(src).extract({ left: vx * qw, top: vy * qh, width: qw, height: qh })
    if (flipX) img = img.flop()
    if (flipY) img = img.flip()
    return img.png().toBuffer()
  }
  await mkdir(path.join(OUT, 'rooms'), { recursive: true })
  await sharp({ create: { width: qw * 2, height: qh * 2, channels: 4, background: '#000' } })
    .composite([
      { input: await piece(variants[0], false, false), left: 0, top: 0 },
      { input: await piece(variants[1], true, false), left: qw, top: 0 },
      { input: await piece(variants[2], false, true), left: 0, top: qh },
      { input: await piece(variants[3], true, true), left: qw, top: qh },
    ])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `rooms/${key}.png`))
  return `rooms/${key}.png`
}

// ─── 官方中文文本 ────────────────────────────────────────────────────────────
async function prepareStrings(keys) {
  const sta = await readFile(await download(await locate('stringtable.sta', { prefer: ['resources'] })), 'utf8')
  const langs = [...sta.matchAll(/<language [^>]*index="(\d+)" name="([^"]+)"/g)]
  const zhIndex = Number(langs.find((m) => m[2].startsWith('Chinese'))[1]) - 1 // 第 0 列是 Key，不在 <string> 里
  const out = {}
  for (const key of keys) {
    const m = sta.match(new RegExp(`<key name="${key}">([\\s\\S]*?)</key>`))
    if (!m) { console.warn('  找不到文本', key); continue }
    const strings = [...m[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map((s) => s[1])
    out[key] = strings[zhIndex]
  }
  return out
}

async function main() {
  const manifest = { anm2: {}, cutscenes: {}, rooms: {}, files: {}, strings: {} }
  console.log('> anm2 动画')
  for (const [key, spec] of Object.entries(STORY_ASSETS.anm2)) manifest.anm2[key] = await prepareAnm2(key, spec)
  console.log('> 过场动画镜头')
  for (const [key, spec] of Object.entries(STORY_ASSETS.cutscenes)) manifest.cutscenes[key] = await prepareCutscene(key, spec)
  console.log('> 房间')
  for (const [key, spec] of Object.entries(STORY_ASSETS.rooms)) manifest.rooms[key] = await prepareRoom(key, spec)
  console.log('> 单张图片')
  for (const [key, repoPath] of Object.entries(STORY_ASSETS.files)) {
    const hit = await locate(repoPath.replace(/^resources[^/]*\//, ''))
    if (!hit) { console.warn('  找不到', repoPath); continue }
    manifest.files[key] = await copyAsset(hit)
  }
  console.log('> 中文文本')
  manifest.strings = await prepareStrings(STORY_ASSETS.strings)

  // 每张图的尺寸，模板要用
  manifest.sizes = {}
  const all = [...Object.values(manifest.files), ...Object.values(manifest.rooms), ...Object.values(manifest.anm2).flatMap((a) => Object.values(a.sheets))]
  for (const rel of new Set(all)) {
    const { width, height } = await sharp(path.join(OUT, rel)).metadata()
    manifest.sizes[rel] = [width, height]
  }
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('完成 ✓')
}

main().catch((e) => { console.error(e); process.exit(1) })
