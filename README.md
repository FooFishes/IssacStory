# 以撒 · 睡前故事

一个《以撒的结合》同人网页：用游戏自己的画面，讲以撒的内心世界和他经历过的事。
像翻绘本一样往下翻：滚过大约半屏才会翻到下一个分镜，滚一点点会被弹回来；空格 / PageDown 正好翻一页。

**构建产物里没有一行 JavaScript。** 所有动画都是 CSS：
游戏原版的 `.anm2` 帧动画在构建时被翻译成 CSS 关键帧，按游戏原本的帧率播放。
构建脚本最后会检查一遍产物，发现 `<script>`、内联事件或 `.js` 文件就直接报错。

## 播放方式：滚动翻页，画面按时间播放

- 每个分镜正中有一个滚动吸附点（`scroll-snap-type: y proximity`，就近吸附）。
  没有用 `mandatory`：它在滚轮/触控板上是“按方向吸附”，动一点点就会跳到下一格。
  现在要滚过两个分镜之间的中线才会翻页（阈值 ≈ `PACE / 2` 屏），没过线会被弹回来。
- 滚动驱动动画只做一件事：在分镜自己的滚动区间里把 `--on` 置成 1。
- 分镜里的一切都写在 `@container w style(--on: 1)` 里——翻到这一格，它就从头按真实时间演一遍：
  anm2 动画按 30fps 播放、字按固定速度打出来、镜头之间用过渡淡入淡出。和滚轮滚得快慢无关。
- 翻走的时候画面停在最后一帧再淡出，不会跳回开头。
- 节奏参数都在 `src/story/page.mjs` 顶部：`PACE`（每格滚动距离）、`CPS`（打字速度）、`LINE_GAP`（行间停顿）。

## 使用

```bash
npm install
npm run build     # 产物在 dist/，双击 dist/index.html 也能看
npm run dev       # 监听 src/ 自动重建，预览 http://localhost:5173
```

需要支持滚动驱动动画的浏览器：**Chrome / Edge 115+**（Safari 26 也支持）。其它浏览器会看到一条提示。

第一次构建会从 GitHub 下载游戏的位图字体（约 20 MB，放在 `.cache/tboi`），之后只按页面实际用到的字生成像素字体。

## 分镜

| 章 | 画面（全部来自游戏原始资源） | 讲的是什么 |
| --- | --- | --- |
| 序 | 中文版标题画面 `titlemenu.anm2` + 菜单苍蝇 | 镜头钻进纸上的画里 |
| 一 · 山上的房子 | 开场动画 `intro.anm2` 的 13 个镜头，画在桌上的纸上，线条在“抖” | 家、电视、那个声音、锁上的门、地毯下的门 |
| 二 · 往下 | 用背景贴图拼出的地下室 / 洞穴 / 深牢，HUD，以撒的 `Appear / Pickup / Trapdoor` 动画，拾取横幅，楼层之间的“梦” `nightmare*.anm2` | 每往下一层，就捡起一样东西、做一个梦 |
| 三 · 妈妈 | 对战画面 `versusscreen.anm2`、妈妈的脚 `mom stomp.anm2`、全家福 | 家就是她 |
| 四 · 很多个我 | 角色选择页（纸上写着“我是谁？”）、17 个角色头像的 3D 转盘、堕化以撒 | 如果我是…… |
| 五 · 往上 | 最终结局 `final.anm2` 的画 | 他看见的那些事 |
| 结局 | 空白的纸 | 爸爸问：你确定这是你想要的结局吗？（可以回答） |

三种文字：讲述（第三人称，手写像素字）、以撒心里的话（第一人称，小号像素字）、爸爸（只在最后出现）。

## 实现

- **anm2 → CSS**：`scripts/lib/anm2css.mjs` 把每个图层的帧翻译成两套关键帧——裁剪/尺寸/可见性（跳帧）和位移/旋转/缩放/透明度（按原动画决定插值还是跳帧）。三种播放方式：一直循环（`time`）、分镜激活时播一次（`trigger`，没激活时停在最后一帧）、挂到滚动时间轴上（`scroll`）。
- **像素屏幕**：画面内部全部用游戏的原始像素坐标（480×270），整体用 `scale: tan(atan2(100cqw, 480px))` 按容器宽度等比放大（这个三角函数写法能把两个长度相除得到无单位的倍数），配合 `image-rendering: pixelated` 保持锐利。
- **过场动画**：`scripts/fetch-assets.mjs` 用 `scripts/lib/anm2.mjs` 里的光栅化器，把开场/结局动画的指定时刻渲染成两帧长条图（线条抖动），网页里用 `steps()` 来回切换，再用遮罩做出“铅笔画出来”的效果。
- **房间**：游戏的背景贴图只有房间左上角的四分之一，构建时镜像拼成完整房间（原始分辨率）。
- **字体**：游戏中文版用的是位图字体（LanaPixel、Team Meat 中文扩展、Upheaval、PF Tempesta），`scripts/lib/bmfont.mjs` 把用到的字形逐像素转成矢量方块，生成 woff2。
- **逐字出现的字幕**：每个字一个 `<span>`，`animation-delay` 用 `calc(行的起始时间 + 序号 × 打字速度)` 算出来。
- **结局的回答**：一个隐藏的复选框，`body:has(#rewrite:checked)` 切换到另一个结局。

## 目录

```
src/story/script.mjs      分镜和文字
src/story/page.mjs        把分镜渲染成 HTML + 生成的 CSS
src/story/assets.mjs      要用到的游戏资源清单
src/styles/story.css      手写样式
src/assets/               加工好的素材（npm run fetch-assets 生成）
scripts/build.mjs         构建
scripts/fetch-assets.mjs  下载并加工游戏资源
scripts/lib/              anm2 解析/光栅化、anm2 → CSS、BMFont → 像素字体
scripts/tools/            调试用：预览 anm2、自动切镜头、查看字体
```

## 素材

全部来自游戏《以撒的结合：忏悔》的原始资源（[Derugon/TBoIR-resources](https://github.com/Derugon/TBoIR-resources)），版权归 Edmund McMillen 与 Nicalis 所有。本仓库仅作个人技术探索。
