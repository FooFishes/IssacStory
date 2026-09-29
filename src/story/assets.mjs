// 故事要用到的游戏原始素材清单（路径都是游戏 resources 目录下的相对路径）。
// scripts/fetch-assets.mjs 读这份清单下载、加工，结果写进 src/assets/manifest.json。

const NIGHTMARE = (n, dlc3 = false) => ({ anm2: `${dlc3 ? 'resources-dlc3' : 'resources'}/gfx/ui/stage/nightmare${n}.anm2` })

export const STORY_ASSETS = {
  // 在浏览器里用 CSS 关键帧“原样”播放的 anm2 动画
  anm2: {
    title: { anm2: 'resources/gfx/ui/main menu/titlemenu.anm2' },
    menufly: { anm2: 'resources/gfx/ui/main menu/fly.anm2' },
    player: { anm2: 'resources/gfx/001.000_player.anm2' },
    streak: { anm2: 'resources/gfx/ui/ui_streak.anm2' },
    collectible: { anm2: 'resources/gfx/005.100_collectible.anm2' },
    trapdoor: { anm2: 'resources/gfx/grid/door_11_trapdoor.anm2' },
    door: { anm2: 'resources/gfx/grid/door_01_normaldoor.anm2' },
    fly: { anm2: 'resources/gfx/013.000_fly.anm2' },
    nightbg: { anm2: 'resources/gfx/ui/stage/nightmare_bg.anm2' },
    nm1: NIGHTMARE(1),
    nm2: NIGHTMARE(2),
    nm4: NIGHTMARE(4),
    nm9: NIGHTMARE(9),
    progress: { anm2: 'resources-dlc3/gfx/ui/stage/progress.anm2' },
    vs: {
      anm2: 'resources/gfx/ui/boss/versusscreen.anm2',
      // 对战画面里的聚光灯/头像/名字是游戏运行时按楼层和头目替换的：这里换成“深牢”的聚光灯
      sheets: { 2: 'gfx/ui/boss/bossspot_05_depths.png', 3: 'gfx/ui/boss/playerspot_05_depths.png' },
    },
    momstomp: { anm2: 'resources/gfx/045.010_mom stomp.anm2' },
    charmenu: { anm2: 'resources/gfx/ui/main menu/charactermenu.anm2' },
    portraits: { anm2: 'resources-dlc3/gfx/ui/main menu/characterportraits.anm2' },
    // 房间里的 HUD：红心、硬币/炸弹/钥匙、小地图
    hearts: { anm2: 'resources-dlc3/gfx/ui/ui_hearts.anm2' },
    hudpickups: { anm2: 'resources-dlc3/gfx/ui/hudpickups.anm2' },
    minimap: { anm2: 'resources/gfx/ui/minimap1.anm2' },
    charbg: { anm2: 'resources-dlc3/gfx/ui/main menu/charactermenubg.anm2' },
  },

  // 预渲染的过场动画镜头（t = 帧号，30fps）
  cutscenes: {
    intro: {
      anm2: 'resources.zh/gfx/cutscenes/intro.anm2',
      width: 432,
      height: 240,
      backgrounds: {
        bg: { t: 300, layers: ['shadow', 'background'] },
        top: { t: 300, layers: ['overlay'] },
      },
      notDrawing: ['shadow', 'background', 'overlay', 'nicalis', 'fade', 'intro6', 'intro7', 'intro8', 'intro9', 'intro10'],
      shots: [
        { t: 348, id: 'house' },
        { t: 240, id: 'isaac-mom' },
        { t: 450, id: 'drawing' },
        { t: 801, id: 'tv' },
        { t: 1149, id: 'voice' },
        { t: 1365, id: 'toys' },
        { t: 1449, id: 'crying' },
        { t: 2148, id: 'locked' },
        { t: 2799, id: 'listening' },
        { t: 3486, id: 'knife' },
        { t: 3957, id: 'trapdoor' },
        { t: 4158, id: 'burst' },
        { t: 4299, id: 'light' },
      ],
    },
    final: {
      anm2: 'resources/gfx/cutscenes/final.anm2',
      width: 432,
      height: 240,
      backgrounds: {
        bg: { t: 100, layers: ['shadow', 'background', 'paper'] },
        blank: { t: 3100, layers: ['shadow', 'background', 'paper'] },
        top: { t: 100, layers: ['overlay'] },
      },
      notDrawing: ['background', 'paper', 'shadow', 'fade', 'overlay'],
      shots: [
        { t: 684, id: 'rising' },
        { t: 807, id: 'grief' },
        { t: 933, id: 'leaving' },
        { t: 1080, id: 'purse' },
        { t: 1281, id: 'fight' },
        { t: 1464, id: 'curled' },
        { t: 1578, id: 'shadow' },
        { t: 1830, id: 'fears' },
        { t: 2082, id: 'guppy' },
        { t: 2214, id: 'together' },
        { t: 2406, id: 'kiss' },
        { t: 2640, id: 'birth' },
        { t: 3570, id: 'house' },
      ],
    },
  },

  // 用背景贴图拼出来的房间（每层楼一张）
  rooms: {
    basement: { sheet: 'gfx/backdrop/01_basement.png', variants: [[0, 0], [1, 0], [0, 1], [0, 0]] },
    caves: { sheet: 'gfx/backdrop/03_caves.png', variants: [[0, 0], [1, 0], [0, 1], [1, 0]] },
    depths: { sheet: 'gfx/backdrop/05_depths.png', variants: [[0, 0], [1, 0], [0, 1], [0, 0]] },
  },

  // 单张图片
  files: {
    menuoverlay: 'resources/gfx/ui/main menu/menuoverlay.png',
    heartsHud: 'resources/gfx/ui/ui_hearts.png',
    itemSadOnion: 'resources/gfx/items/collectibles/collectibles_001_thesadonion.png',
    itemDeadCat: 'resources/gfx/items/collectibles/collectibles_081_deadcat.png',
    itemMomsKnife: 'resources/gfx/items/collectibles/collectibles_114_momsknife.png',
    itemPolaroid: 'resources/gfx/items/collectibles/collectibles_327_thepolaroid.png',
    itemD6: 'resources/gfx/items/collectibles/collectibles_105_dice.png',
    portraitIsaacBig: 'resources/gfx/ui/stage/playerportraitbig_01_isaac.png',
    portraitTaintedIsaac: 'resources/gfx/ui/stage/playerportrait_isaac_b.png',
    vsIsaacName: 'resources.zh/gfx/ui/boss/playername_01_isaac.png',
    vsMomName: 'resources.zh/gfx/ui/boss/bossname_45.0_mom.png',
    vsMomPortrait: 'resources/gfx/ui/boss/portrait_45.0_mom.png',
    vsIsaacPortrait: 'resources/gfx/ui/boss/playerportrait_01_isaac.png',
  },

  // 官方简体中文文本
  strings: [
    'THE_SAD_ONION_NAME', 'DEAD_CAT_NAME', 'MOMS_KNIFE_NAME', 'THE_POLAROID_NAME',
    'THE_SAD_ONION_DESCRIPTION', 'DEAD_CAT_DESCRIPTION', 'MOMS_KNIFE_DESCRIPTION', 'THE_POLAROID_DESCRIPTION',
    'BASEMENT_NAME', 'CAVES_NAME', 'DEPTHS_NAME',
    'ISAAC_NAME', 'MAGDALENE_NAME', 'CAIN_NAME', 'JUDAS_NAME', 'BLUEBABY_NAME', 'EVE_NAME', 'SAMSON_NAME',
    'AZAZEL_NAME', 'LAZARUS_NAME', 'EDEN_NAME', 'THE_LOST_NAME', 'LILITH_NAME', 'KEEPER_NAME', 'APOLLYON_NAME',
    'THE_FORGOTTEN_NAME', 'BETHANY_NAME', 'JACOB_NAME',
  ],
}
