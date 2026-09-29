# 一个仿 以撒的结合 的同人网页

## 分镜

| 章 | 讲的是 |
| --- | --- |
| 序 | 镜头钻进纸上的画里 |
| 一 · 山上的房子 | 家、电视、那个声音、锁上的门、地毯下的门 |
| 二 · 往下 | 每往下一层，就捡起一样东西、做一个梦 |
| 三 · 妈妈 | 家就是她 |
| 四 · 很多个我 | 如果我是…… |
| 五 · 往上 |  他看见的那些事 |
| 结局 | 爸爸问：你确定这是你想要的结局吗？ |

## 实现

- **anm2 → CSS**：`scripts/lib/anm2css.mjs` 将 anm2 动画资源转换为 CSS
- **像素屏幕**：画面内部使用游戏的原始像素坐标, 按容器宽度等比放大
- **字体**：游戏中文版用的是位图字体（LanaPixel、Team Meat 中文扩展、Upheaval、PF Tempesta），`scripts/lib/bmfont.mjs` 把用到的字形逐像素转成矢量方块，生成 woff2
- **结局的回答**：一个隐藏的复选框，`body:has(#rewrite:checked)` 切换到另一个结局。

## 目录 

>  提交的是构建好的版本, 源代码在 https://github.com/FooFishes/IssacStory

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

## 素材声明

全部来自游戏《以撒的结合：忏悔》的原始资源（[Derugon/TBoIR-resources](https://github.com/Derugon/TBoIR-resources)），版权归 Edmund McMillen 与 Nicalis 所有。
