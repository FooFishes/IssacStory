// 把 .anm2 动画翻译成 HTML + CSS 关键帧，在浏览器里“原样”播放游戏动画（不需要任何脚本）。
//
// 结构：
//   <div class="a2 {id}">            ← 定位用的零尺寸容器（以动画原点为锚点）
//     <div class="a2__root">         ← 根节点动画（整体位移/缩放/旋转/透明度）
//       <i class="a2__l {id}-l0"></i> ← 每个图层一个元素，背景图是精灵图，裁剪 = background-position
//
// 每个图层两套关键帧：
//   {id}-l{n}-c  裁剪/尺寸/可见性，永远是“跳帧”（step-end）
//   {id}-l{n}-t  位移/旋转/缩放/透明度，按 anm2 的 Interpolated 决定线性插值或跳帧
// 时间轴可以是时间（秒）也可以是滚动时间轴（scroll-driven），由调用方决定。
import { sample, trackLength } from './anm2.mjs'

const r = (n) => +n.toFixed(3)
const pct = (t, total) => `${r((t / total) * 100)}%`

function transformOf(f, withPivot = true) {
  const parts = [`translate(${r(f.XPosition)}px,${r(f.YPosition)}px)`]
  parts.push(`rotate(${r(f.Rotation)}deg)`)
  parts.push(`scale(${r(f.XScale / 100)},${r(f.YScale / 100)})`)
  if (withPivot) parts.push(`translate(${r(-f.XPivot)}px,${r(-f.YPivot)}px)`)
  return parts.join(' ')
}

function tintFilter(f) {
  // anm2 的颜色偏移（Offset）常用来做“闪白”，用 brightness 近似；RGB 染色很少用，忽略
  const off = Math.max(f.RedOffset, f.GreenOffset, f.BlueOffset)
  return off > 0 ? `brightness(${r(1 + off / 128)})` : 'none'
}

/**
 * 把一个动画转成 { html, css }。
 * opts:
 *   id           唯一类名
 *   sheetUrl(id) 精灵图的 URL
 *   sheetSize(id)[w,h]
 *   frames       只取 [start, end) 这一段帧（默认整段）
 *   layers       只要这些图层名（默认全部）
 *   timing       'time'    一直按 fps 播放（循环动画用）
 *                'trigger' 所在的分镜被激活时才从头按 fps 播放一次：
 *                          动画挂在 @container <container> style(--on: 1) 里；
 *                          没激活时元素停在最后一帧（淡出时不会跳回第一帧）
 *                'scroll'  不写时长，由外部 animation-timeline 驱动
 *   loop         是否循环（默认按 anm2 的 Loop）
 *   delay        延迟（秒）
 *   container    trigger 模式查询的容器名（默认 w）
 */
export function anm2ToCss(doc, animName, opts) {
  const anim = doc.anims[animName ?? doc.defaultAnim]
  if (!anim) throw new Error(`动画不存在：${animName} @ ${doc.file}`)
  const { id } = opts
  const [start, end] = opts.frames ?? [0, anim.frameNum]
  const total = Math.max(1, end - start)
  const css = []
  const triggered = []
  const html = []
  const timing = opts.timing ?? 'time'
  const loop = opts.loop ?? anim.loop
  const dur = r(total / doc.fps)
  const shorthand = (names) => `animation:${names.map((n) => `${n} ${dur}s ${opts.delay ?? 0}s ${loop ? 'infinite' : '1'} both`).join(',')};`
  // 返回写进基础规则的动画声明；trigger 模式下另外收集到容器查询里
  const anims = (sel, names) => {
    if (timing === 'scroll') return `animation-name:${names.join(',')};`
    if (timing === 'trigger') { triggered.push(`${sel}{${shorthand(names)}}`); return '' }
    return shorthand(names)
  }

  // 把一条轨道在 [start, end) 内的关键帧“切片”出来：返回 [{t, frame}]，t 相对 start
  const slice = (frames) => {
    const out = []
    let t = 0
    for (const f of frames) {
      const s = t, e = t + f.Delay
      t = e
      if (e <= start || s >= end) continue
      out.push({ t: Math.max(0, s - start), f: s < start ? sample(frames, start) : f })
    }
    // 轨道结束后引擎会停在最后一帧
    if (t < end && frames.length) {
      const last = frames[frames.length - 1]
      if (!out.length || out[out.length - 1].t < Math.max(0, t - start)) out.push({ t: Math.max(0, t - start), f: last })
    }
    return out
  }

  const keyframes = (name, keys, props, interp) => {
    const lines = []
    keys.forEach(({ t, f }, i) => {
      const next = keys[i + 1]
      const tf = interp && f.interpolated && next ? 'linear' : 'step-end'
      lines.push(`${pct(t, total)}{${props(f)}animation-timing-function:${tf}}`)
    })
    const last = keys[keys.length - 1]
    if (last && last.t < total) lines.push(`100%{${props(last.f)}}`)
    css.push(`@keyframes ${name}{${lines.join('')}}`)
  }

  // 根节点
  const rootKeys = slice(anim.root)
  const rootStatic = rootKeys.length <= 1
  if (rootKeys.length) {
    const f0 = rootKeys[0].f
    const rootProps = (f) => `transform:${transformOf(f, false)};opacity:${r(f.AlphaTint / 255)};visibility:${f.visible ? 'visible' : 'hidden'};`
    if (rootStatic) css.push(`.${id}>.a2__root{${rootProps(f0)}}`)
    else {
      keyframes(`${id}-root`, rootKeys, rootProps, true)
      const sel = `.${id}>.a2__root`
      const rest = timing === 'trigger' ? rootProps(rootKeys[rootKeys.length - 1].f) : ''
      css.push(`${sel}{${rest}${anims(sel, [`${id}-root`])}}`)
    }
  }

  const want = opts.layers ? new Set(opts.layers) : null
  anim.layers.forEach((tr, n) => {
    const layer = doc.layers[tr.layer]
    if (!tr.visible || (want && !want.has(layer.name))) return
    const keys = slice(tr.frames)
    if (!keys.length) return
    const cls = `${id}-l${n}`
    const [sw, sh] = opts.sheetSize(layer.sheet)
    html.push(`<i class="a2__l ${cls}"></i>`)
    const crop = (f) => `width:${f.Width}px;height:${f.Height}px;background-position:${-f.XCrop}px ${-f.YCrop}px;visibility:${f.visible && f.Width > 0 ? 'visible' : 'hidden'};`
    // 只有真的用到颜色偏移（闪白）的图层才写 filter，免得盖掉外面给图层加的滤镜
    const usesOffset = keys.some(({ f }) => f.RedOffset || f.GreenOffset || f.BlueOffset)
    const xf = (f) => `transform:${transformOf(f)};opacity:${r(f.AlphaTint / 255)};${usesOffset ? `filter:${tintFilter(f)};` : ''}`
    const base = [`background-image:url(${opts.sheetUrl(layer.sheet)})`, `background-size:${sw}px ${sh}px`]
    const names = []
    const lastKey = keys[keys.length - 1].f
    const cropKeys = keys.filter((k, i) => i === 0 || crop(k.f) !== crop(keys[i - 1].f))
    if (cropKeys.length === 1) base.push(crop(keys[0].f).slice(0, -1))
    else {
      keyframes(`${cls}-c`, cropKeys, crop, false); names.push(`${cls}-c`)
      if (timing === 'trigger') base.push(crop(lastKey).slice(0, -1))
    }
    const xfKeys = keys.filter((k, i) => i === 0 || xf(k.f) !== xf(keys[i - 1].f) || k.f.interpolated !== keys[i - 1].f.interpolated)
    if (xfKeys.length === 1 && !xfKeys[0].f.interpolated) base.push(xf(keys[0].f).slice(0, -1))
    else {
      keyframes(`${cls}-t`, xfKeys, xf, true); names.push(`${cls}-t`)
      if (timing === 'trigger') base.push(xf(lastKey).slice(0, -1))
    }
    css.push(`.${cls}{${base.join(';')};${names.length ? anims(`.${cls}`, names) : ''}}`)
  })

  if (triggered.length) css.push(`@container ${opts.container ?? 'w'} style(--on: 1){${triggered.join('')}}`)

  return {
    html: `<div class="a2 ${id}" aria-hidden="true"><div class="a2__root">${html.join('')}</div></div>`,
    css: css.join('\n'),
    duration: dur,
    frames: total,
  }
}

// 公共样式：所有 anm2 动画共用
export const ANM2_BASE_CSS = `
.a2{position:absolute;width:0;height:0}
.a2__root{position:absolute;left:0;top:0;transform-origin:0 0}
.a2__l{position:absolute;left:0;top:0;display:block;transform-origin:0 0;background-repeat:no-repeat;image-rendering:pixelated}
`
