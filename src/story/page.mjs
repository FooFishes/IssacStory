// 把 script.mjs 的分镜渲染成 HTML + 生成的 CSS。
//
// 播放模型：“滚动只负责翻页，画面按时间播放”
//   - 每一章 <section class="ch"> 声明一条 view-timeline（--ch），舞台黏在视口里。
//   - 每个分镜（beat）是一个 .w 容器，只在自己的滚动区间里把 --on 置为 1（滚动驱动动画只做这一件事）。
//   - .w 里面的一切（anm2 动画、打字、出现/消失、镜头的淡入淡出）都写在 @container w style(--on: 1) 里，
//     按真实时间播放：滚到这一格，它就从头按原速演一遍，和滚轮快慢无关。
//   - 每个分镜有一个滚动吸附点（scroll-snap），滚轮一格 / 方向键 / 滑动一次 = 翻到下一个分镜。
import { TITLE, CHAPTERS } from './script.mjs'
import { anm2ToCss, ANM2_BASE_CSS } from '../../scripts/lib/anm2css.mjs'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const r2 = (n) => +n.toFixed(3)

// 每个分镜占多少屏的滚动 = 翻页的“阈值”：吸附点在分镜正中，
// 要滚过两个分镜之间的中线（约 PACE / 2 屏）才会翻到下一格，滚一点点会被弹回来
const PACE = 1.1
// 吸附点放在分镜区间里的位置（0.5 = 正中）
const SNAP_AT = 0.5
// 打字速度（秒/字）和行间停顿
const CPS = { n: 0.06, i: 0.05, d: 0.08, ink: 0.05 }
const LINE_GAP = 0.45

export function renderStory({ manifest, docs }) {
  const css = [ANM2_BASE_CSS]
  const S = (key) => manifest.strings[key] ?? key
  const url = (rel) => `assets/${rel}`
  const file = (key) => url(manifest.files[key])
  const size = (rel) => manifest.sizes[rel]
  const fileSrc = (key) => ({ url: file(key), size: size(manifest.files[key]) })

  // ─── anm2 实例 ───────────────────────────────────────────────────────────
  // 同样的（动画, 帧段, 播放方式, 延迟）只生成一次关键帧
  const generated = new Map()
  let uid = 0
  function anm(key, animName, { frames, layers, timing = 'trigger', loop, delay, x = 0, y = 0, cls = '', override = {}, layerStyle = {}, style = '' } = {}) {
    const doc = docs[key]
    if (!doc) throw new Error(`没有 anm2：${key}`)
    const sig = JSON.stringify([key, animName, frames, layers, timing, loop, delay])
    let g = generated.get(sig)
    if (!g) {
      const id = `a${(uid++).toString(36)}`
      const sheets = manifest.anm2[key].sheets
      const out = anm2ToCss(doc, animName, {
        id, frames, layers, timing, loop, delay,
        sheetUrl: (sid) => url(sheets[sid] ?? 'missing.png'),
        sheetSize: (sid) => size(sheets[sid]) ?? [1, 1],
      })
      css.push(out.css)
      g = { id, out, doc }
      generated.set(sig, g)
    }
    let html = g.out.html.replace(`class="a2 ${g.id}"`, `class="a2 ${g.id} ${cls}" style="left:${x}px;top:${y}px;${style}"`)
    // 按图层名追加行内样式：替换精灵图（道具台上的道具、对战画面的头像）、混合模式、染色……
    const styles = {}
    for (const [layerName, src] of Object.entries(override)) {
      const [w, h] = src.size
      styles[layerName] = `background-image:url(${src.url});background-size:${w}px ${h}px;` + (src.shift ? `translate:${src.shift[0]}px ${src.shift[1]}px;` : '')
    }
    for (const [layerName, extra] of Object.entries(layerStyle)) styles[layerName] = (styles[layerName] ?? '') + extra
    for (const [layerName, extra] of Object.entries(styles)) {
      const idx = g.doc.anims[animName ?? g.doc.defaultAnim].layers.findIndex((tr) => g.doc.layers[tr.layer].name === layerName)
      if (idx < 0) continue
      html = html.replace(`class="a2__l ${g.id}-l${idx}"`, `class="a2__l ${g.id}-l${idx}" style="${extra}"`)
    }
    return html
  }
  const anmFrames = (key, animName) => docs[key].anims[animName ?? docs[key].defaultAnim].frameNum
  const anmSeconds = (key, animName) => anmFrames(key, animName) / docs[key].fps

  // ─── 分镜容器 / 定时出现 / 打字 ───────────────────────────────────────────
  // 分镜：只在 [a, b] 的滚动区间里激活；fade = 进出场的淡入淡出时长（0 = 直接切）
  const W = ([a, b], inner, { cls = '', fade } = {}) =>
    `<div class="w ${cls}" style="--a:${a}%;--b:${b}%${fade != null ? `;--fade:${fade}s` : ''}"><div class="w__in">${inner}</div></div>`
  // 分镜激活后第 t0 秒出现、t1 秒消失；end = 分镜结束（淡出）时它是否还在画面上
  const AT = (inner, { t0 = 0, t1, end = false, cls = '' } = {}) =>
    `<div class="at${end ? ' at--end' : ''} ${cls}" style="--in:${r2(t0)}s${t1 != null ? `;--out:${r2(t1)}s` : ''}">${inner}</div>`
  // 一行字：每个字一个 span，按固定速度一个个打出来
  function typed(kind, text, delay, extra = '') {
    const n = [...text].length
    const html = `<p class="say say--${kind} ${extra}" style="--d:${r2(delay)}s;--cps:${CPS[kind]}s">${
      [...text].map((c, i) => `<span style="--i:${i}">${esc(c)}</span>`).join('')}</p>`
    return { html, end: delay + n * CPS[kind] }
  }
  // 几行字依次打出来
  function lines(parts, start = 0.5) {
    let t = start
    const html = parts.filter(Boolean).map(([kind, text, extra]) => {
      const r = typed(kind, text, t, extra)
      t = r.end + LINE_GAP
      return r.html
    }).join('')
    return { html, end: t }
  }

  // ─── 一章的滚动区间 ────────────────────────────────────────────────────
  const spans = (lens) => {
    const total = lens.reduce((s, l) => s + l, 0)
    let acc = 0
    return lens.map((l) => { const a = (acc / total) * 100; acc += l; return [r2(a), r2((acc / total) * 100)] })
  }
  const join2 = (r1, r2_) => [r1[0], r2_[1]]
  function section(cls, label, lens, stage) {
    const sp = spans(lens)
    const len = r2(lens.reduce((s, l) => s + l, 0) * PACE + 1)
    const snaps = sp.map(([a, b]) => `<i class="snap" style="--f:${r2((a + (b - a) * SNAP_AT) / 100)}"></i>`).join('')
    return `
<section class="ch ${cls}" style="--len:${len}" aria-label="${esc(label)}">
  <div class="ch__stage">${stage(sp)}</div>
  ${snaps}
</section>`
  }

  const card = (ch, range) => W(range, `<div class="card"><span class="card__no">第${ch.no}章</span><span class="card__title">${esc(ch.title)}</span></div>`, { cls: 'card-w' })

  const sections = []

  // ─── 序：标题画面 ──────────────────────────────────────────────────────
  sections.push(section('ch--title', '标题', [1.2, 0.9, 0.9], ([title, w1, w2]) => `
    ${W(title, `
      <div class="screen screen--cover title-screen"><div class="px480">
        ${anm('title', 'Idle', { timing: 'time', loop: true })}
        ${[0, 1, 2].map((i) => `<div class="title-fly title-fly--${i}">${anm('menufly', null, { timing: 'time', loop: true })}</div>`).join('')}
        <img class="overlay" src="${file('menuoverlay')}" alt="">
      </div></div>
      <div class="scroll-hint" aria-hidden="true"></div>`, { cls: 'title-w', fade: 1.3 })}
    <div class="whisper">
      ${W(w1, lines([['i', TITLE.whisper[0]]], 0.9).html)}
      ${W(w2, lines([['i', TITLE.whisper[1]]], 0.6).html)}
    </div>`))

  // ─── 过场动画章（纸上的画） ──────────────────────────────────────────────
  const SHOT_IDS = {
    intro: ['house', 'isaac-mom', 'drawing', 'tv', 'voice', 'toys', 'crying', 'locked', 'listening', 'knife', 'trapdoor', 'burst', 'light'],
    final: ['rising', 'grief', 'leaving', 'purse', 'fight', 'curled', 'shadow', 'fears', 'guppy', 'together', 'kiss', 'birth', 'house'],
  }
  function cutsceneChapter(ch) {
    const cut = manifest.cutscenes[ch.cutscene]
    const lens = [1, ...ch.beats.map((b) => (b.n2 || (b.n && b.i) ? 1.2 : 1))]
    return section(`ch--cut ch--${ch.id}`, ch.title, lens, (sp) => {
      const art = []
      const subs = []
      ch.beats.forEach((b, k) => {
        const range = sp[k + 1]
        if (b.shot) {
          const idx = SHOT_IDS[ch.cutscene].indexOf(b.shot)
          art.push(W(range, `<div class="shot" style="background-image:url(${url(`${cut.dir}/${String(idx).padStart(2, '0')}.png`)})"></div>`))
        }
        if (b.blank) art.push(W(range, `<img class="cut__blank" src="${url(`${cut.dir}/blank.png`)}" alt="">`))
        subs.push(W(range, lines([b.n && ['n', b.n], b.n2 && ['n', b.n2], b.i && ['i', b.i]], 0.9).html))
      })
      return `
        <div class="screen screen--cover cut">
          <div class="px432 cam">
            <img class="cut__bg" src="${url(`${cut.dir}/bg.png`)}" alt="">
            ${art.join('')}
            <img class="cut__top" src="${url(`${cut.dir}/top.png`)}" alt="">
          </div>
        </div>
        ${ch.id === 'up' ? '<div class="rays" aria-hidden="true"></div>' : ''}
        <div class="subs">${subs.join('')}</div>
        ${card(ch, sp[0])}`
    })
  }

  // ─── 游戏画面的零件 ────────────────────────────────────────────────────
  // 房间 468×312，放在 480×270 的屏幕里居中（和游戏一样上下墙被裁掉一点）
  const ROOM = (key) => `<img class="room" src="${url(manifest.rooms[key])}" alt="" style="left:6px;top:-21px">`
  const FEET = [240, 176] // 以撒站的位置（屏幕坐标）
  const ALTAR = [240, 132]
  const isaacIdle = () =>
    anm('player', 'WalkDown', { timing: 'time', frames: [0, 1], x: FEET[0], y: FEET[1] }) +
    anm('player', 'HeadDown', { timing: 'time', frames: [0, 1], x: FEET[0], y: FEET[1] })
  const isaacDo = (anim, delay = 0) => anm('player', anim, { x: FEET[0], y: FEET[1], delay })

  // 游戏的 HUD：左上角主动道具（以撒的 D6）、红心、硬币/炸弹/钥匙
  function hud(hearts = ['RedHeartFull', 'RedHeartFull', 'RedHeartFull'], counts = ['00', '01', '00']) {
    const d6 = fileSrc('itemD6')
    return `<div class="hud">
      <img src="${d6.url}" alt="" style="left:4px;top:3px;width:32px;height:32px">
      ${hearts.map((h, k) => anm('hearts', h, { timing: 'time', frames: [0, 1], x: 48 + k * 12, y: 12 })).join('')}
      ${[0, 2, 1].map((frame, k) => anm('hudpickups', 'Idle', { timing: 'time', frames: [frame, frame + 1], x: 6, y: 40 + k * 12 })).join('')}
      ${counts.map((c, k) => `<span class="hud__num" style="left:18px;top:${49 + k * 12}px">${c}</span>`).join('')}
    </div>`
  }

  // 拾取横幅：黑色墨迹上是白色的名字，下面小纸条上是游戏里的一句说明（延迟 delay 秒后出现）
  function streak(big, small, delay = 0.3, y = 64) {
    return `<div class="streak" style="--in:${delay}s">
      ${anm('streak', 'Text', { x: 240, y, delay })}
      <div class="streak-text streak-text--name" style="top:${y - 1}px">${esc(big)}</div>
      ${small ? `<div class="streak-text streak-text--desc" style="top:${y + 27}px">${esc(small)}</div>` : ''}
    </div>`
  }

  // 台子上的道具（空闲时轻轻浮动）
  const itemOnAltar = (it) => anm('collectible', 'Idle', { timing: 'time', loop: true, x: ALTAR[0], y: ALTAR[1], override: { head: fileSrc(it.img) } })
  const rock = () => anm('collectible', 'Alternates', { timing: 'time', frames: [0, 1], x: ALTAR[0], y: ALTAR[1] })

  // 拾取的一整段：以撒举起道具、道具在头顶闪、横幅
  const PICK_AT = 0.5
  function pickupBeat(it) {
    const lift = anmSeconds('player', 'Pickup')
    const src = fileSrc(it.img)
    return `
      ${AT(itemOnAltar(it), { t1: PICK_AT + 0.1 })}
      ${AT(isaacIdle(), { t1: PICK_AT })}
      ${AT(isaacDo('Pickup', PICK_AT), { t0: PICK_AT, end: true })}
      ${AT(`<img class="held__item" src="${src.url}" alt="" style="left:${FEET[0] - 16}px;top:${FEET[1] - 62}px">
            ${anm('collectible', 'PlayerPickupSparkle', { x: FEET[0], y: FEET[1] - 38, layers: ['sparkle'], delay: PICK_AT })}`,
        { t0: PICK_AT + 0.1, t1: PICK_AT + lift })}
      ${streak(S(it.key), S(it.desc), PICK_AT + 0.2)}`
  }

  function dreamScreen(anim) {
    return `<div class="screen screen--fit"><div class="px480">
      ${anm('nightbg', 'Loop', { timing: 'time', loop: true, x: 240, y: 135 })}
      ${anm(anim, null, { x: 240, y: 118, delay: 0.4 })}
    </div></div>`
  }

  // ─── 往下：楼层 / 道具 / 梦 ───────────────────────────────────────────────
  function descentChapter(ch) {
    const lens = [1]
    ch.floors.forEach(() => lens.push(1, 0.9, 1.2, 1, 1.3))
    return section(`ch--game ch--${ch.id}`, ch.title, lens, (sp) => {
      const out = []
      const subs = []
      ch.floors.forEach((f, k) => {
        const [arrive, think, item, down, dream] = sp.slice(1 + k * 5, 6 + k * 5)
        const appear = anmSeconds('player', 'Appear')
        const jumpAt = 0.9
        out.push(`<div class="screen screen--fit"><div class="px480">
          ${W(join2(arrive, down), `
            ${ROOM(f.room)}
            ${[0, 1].map((j) => `<div class="room-fly room-fly--${j}">${anm('fly', null, { timing: 'time', loop: true })}</div>`).join('')}
            ${rock()}
            ${hud()}`, { cls: 'floor' })}
          ${W(arrive, `
            ${itemOnAltar(f.item)}
            ${isaacDo('Appear', 0.2)}
            ${streak(`${S(f.stage)} I`, '', 0.2 + appear * 0.5, 50)}`, { fade: 0.35 })}
          ${W(think, `${itemOnAltar(f.item)}${isaacIdle()}`, { fade: 0 })}
          ${W(item, pickupBeat(f.item), { fade: 0 })}
          ${W(down, `
            ${anm('trapdoor', 'Open Animation', { x: FEET[0], y: FEET[1] + 4, delay: 0.2 })}
            ${AT(isaacIdle(), { t1: jumpAt })}
            ${AT(isaacDo('Trapdoor', jumpAt), { t0: jumpAt })}
            <div class="iris" style="--in:${jumpAt + 0.35}s"></div>`, { fade: 0 })}
        </div></div>
        ${W(dream, `${dreamScreen(f.dream.anim)}
          <div class="screen screen--fit"><div class="px480">${anm('progress', 'IsaacIndicator', { timing: 'time', loop: true, x: 180 + k * 60, y: 236 })}</div></div>`, { cls: 'dream' })}`)
        subs.push(W(think, lines([['i', f.i]], 0.4).html))
        subs.push(W(item, lines([['i', f.item.line]], PICK_AT + 1.6).html))
        subs.push(W(dream, lines([['i', f.dream.i, 'say--dream']], 2.4).html, { cls: 'dream-lines' }))
      })
      return `${out.join('')}<div class="subs">${subs.join('')}</div>${card(ch, sp[0])}`
    })
  }

  // ─── 妈妈 ──────────────────────────────────────────────────────────────
  function bossChapter(ch) {
    const lens = [1, 1.3, 1, 1, 1, 1, 1.2]
    return section(`ch--game ch--${ch.id}`, ch.title, lens, (sp) => {
      const [, vs, s1, s2, s3, fallen, item] = sp
      const hearts = ['RedHeartFull', 'RedHeartHalf', 'EmptyHeart']
      const itemBeat = ch.beats.find((b) => b.item).item
      const stompLen = anmSeconds('momstomp', 'Stomp')
      // 妈妈的脚在 Stomp 动画第 27 帧（共 75 帧）落地：那一刻整块屏幕震一下
      const hit = 0.35 + stompLen * (27 / 75)
      const stomp = (range, x, y, sad) => W(range, `
        <div class="shake" style="--hit:${r2(hit)}s">
          ${ROOM('depths')}
          ${hud(hearts)}
          ${sad ? isaacDo('Sad', 0.2) : isaacIdle()}
          ${anm('momstomp', 'Stomp', { x, y, delay: 0.35 })}
        </div>`, { fade: range === s1 ? 0.5 : 0 })
      const beatLines = (b, start) => lines([b.n && ['n', b.n], b.i && ['i', b.i]], start).html
      return `
        ${W(vs, `<div class="screen screen--fit"><div class="px480">
          ${anm('vs', 'Scene', { x: 240, y: 135, delay: 0.2,
            // 游戏按 bossportraits.xml 给每个头目设锚点：妈妈是 (82,172)，动画里默认的是 (96,132)
            override: {
              BossPortrait: { ...fileSrc('vsMomPortrait'), shift: [14, -40] },
              BossPortraitGround: { ...fileSrc('vsMomPortrait'), shift: [14, -40] },
              BossName: fileSrc('vsMomName'),
            },
            layerStyle: {
              // 底图是灰色的，游戏会按楼层染色；暗角层用“正片叠底”
              Background: 'filter:sepia(1) saturate(0.6) hue-rotate(180deg) brightness(0.55)',
              Overlay: 'mix-blend-mode:multiply',
            },
          })}
        </div></div>`)}
        <div class="screen screen--fit"><div class="px480">
          ${W(join2(s1, item), `${ROOM('depths')}${hud(hearts)}`, { cls: 'floor' })}
          ${stomp(s1, 168, 142, false)}
          ${stomp(s2, 318, 150, false)}
          ${stomp(s3, 240, 128, true)}
          ${W(fallen, isaacIdle(), { fade: 0 })}
          ${W(item, `${rock()}${pickupBeat(itemBeat)}`, { fade: 0 })}
        </div></div>
        <div class="subs">
          ${W(s1, beatLines(ch.beats[1], hit + 0.6))}
          ${W(s2, beatLines(ch.beats[2], hit + 0.6))}
          ${W(s3, beatLines(ch.beats[3], hit + 0.6))}
          ${W(fallen, beatLines(ch.beats[4], 0.6))}
          ${W(item, lines([['i', itemBeat.line]], PICK_AT + 1.6).html)}
        </div>
        ${card(ch, sp[0])}`
    })
  }

  // ─── 很多个我：游戏的角色选择页（“我是谁？”） ─────────────────────────────
  function selvesChapter(ch) {
    const n = ch.selves.length
    const lens = [1, 1, ...ch.selves.map(() => 0.7), 1, 1.3]
    return section(`ch--game ch--${ch.id}`, ch.title, lens, (sp) => {
      const intro = sp[1]
      const selfR = ch.selves.map((_, k) => sp[2 + k])
      const closet = sp[2 + n]
      const dream = sp[3 + n]
      // 头像转盘：滚动吸附在每个角色区间的开头附近，转动发生在区间交界处（翻页的滚动动画里）
      const step = 360 / n
      const stops = ['0%{--rot:0deg}']
      selfR.forEach(([a, b], k) => {
        stops.push(`${r2(a + (b - a) * 0.06)}%,${r2(b - (b - a) * 0.06)}%{--rot:${r2(-k * step)}deg;animation-timing-function:cubic-bezier(.5,0,.5,1)}`)
      })
      stops.push(`100%{--rot:${r2(-(n - 1) * step)}deg}`)
      css.push(`@keyframes ring-${ch.id}{${stops.join('')}}`)
      const portraits = ch.selves.map((s, k) => `<div class="pp" style="--k:${k}">${anm('portraits', s.anim, { timing: 'time', frames: [0, 1] })}</div>`).join('')
      return `
        <div class="screen screen--fit"><div class="px480">
          ${W(join2(intro, selfR[n - 1]), `
            ${anm('charbg', 'Idle', { timing: 'time', frames: [0, 1] })}
            ${anm('charmenu', '01_Isaac', { timing: 'time', frames: [0, 1], layers: ['Background', 'Left Arrow', 'Right Arrow'] })}
            <div class="ring" style="--n:${n}"><div class="ring__in" style="animation-name:ring-${ch.id}">${portraits}</div></div>`, { cls: 'floor' })}
          ${ch.selves.map((s, k) => W(selfR[k], `
            ${anm('charmenu', s.anim, { timing: 'time', frames: [0, 1], layers: ['Name'] })}
            <div class="paper-line">${lines([['ink', s.line]], 0.45).html}</div>`, { fade: 0.3 })).join('')}
        </div></div>
        ${W(closet, `<div class="closet"><img class="px" src="${file('portraitTaintedIsaac')}" alt="" style="--w:${size(manifest.files.portraitTaintedIsaac)[0]};--h:${size(manifest.files.portraitTaintedIsaac)[1]}"></div>`)}
        ${W(dream, dreamScreen(ch.dream.anim), { cls: 'dream' })}
        <div class="subs">
          ${W(intro, lines([['n', ch.intro]], 0.6).html)}
          ${W(closet, lines([['n', ch.closet]], 0.9).html)}
          ${W(dream, lines([['i', ch.dream.i, 'say--dream']], 2.4).html, { cls: 'dream-lines' })}
        </div>
        ${card(ch, sp[0])}`
    })
  }

  // ─── 结局：爸爸 ────────────────────────────────────────────────────────
  function endingChapter(ch) {
    const cut = manifest.cutscenes.final
    return section('ch--end', '另一个结局', [1, 1, 1, 1], (sp) => {
      const chars = (text) => [...text].map((c, i) => `<span style="--i:${i}">${esc(c)}</span>`).join('')
      return `
        <div class="screen screen--cover cut">
          <div class="px432 cam">
            <img class="cut__bg" src="${url(`${cut.dir}/blank.png`)}" alt="">
            <div class="shot shot--house" style="background-image:url(${url(`${cut.dir}/12.png`)})"></div>
            <img class="cut__top" src="${url(`${cut.dir}/top.png`)}" alt="">
          </div>
        </div>
        <div class="dad">
          ${ch.before.map((t, k) => W(sp[k], lines([['d', t]], 0.6).html, { cls: 'dad-w' })).join('')}
          ${W([sp[3][0], 100], `<label class="answer" for="rewrite"><span>${esc(ch.answer)}</span></label>`, { cls: 'answer-w' })}
          <div class="after">
            ${ch.after.map((a, k) => `<p class="say say--${a.d ? 'd' : 'i'} say--t" style="--t:${k}">${chars(a.d ?? a.i)}</p>`).join('')}
            <p class="say say--n say--story" style="--t:3">${chars(ch.story)}</p>
          </div>
        </div>
        <p class="goodnight">${esc(ch.goodnight)}</p>`
    })
  }

  sections.push(...CHAPTERS.map((ch) => ({
    cutscene: cutsceneChapter, descent: descentChapter, boss: bossChapter, selves: selvesChapter, ending: endingChapter,
  })[ch.kind](ch)))

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>以撒 · 睡前故事</title>
<meta name="description" content="一个关于以撒的睡前故事。">
<meta name="color-scheme" content="dark">
<link rel="icon" href="${url(manifest.anm2.player.sheets['0'])}">
<link rel="stylesheet" href="style.css">
</head>
<body>
<input type="checkbox" id="rewrite" class="state">
<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false">
  ${[1, 2, 3].map((seed, i) => `<filter id="boil-${i}"><feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="2" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.5" xChannelSelector="R" yChannelSelector="G"/></filter>`).join('')}
</svg>
<p class="unsupported">这个故事需要支持“滚动驱动动画”的浏览器（最新版 Chrome / Edge）。</p>
<main>
${sections.join('\n')}
</main>
</body>
</html>
`
  return { html, css: css.join('\n') }
}
