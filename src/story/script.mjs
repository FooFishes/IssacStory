// 故事脚本：分镜 + 文字。
//
// 三种声音：
//   n  讲述（第三人称，像孩子在讲自己的故事）—— 手写像素字
//   i  以撒心里的话（第一人称）—— 小号像素字
//   d  爸爸 —— 只在最后出现
//
// 每一章是一段“黏住”的滚动：章节高度 = beats 的总长度（单位：屏）。
// 每个 beat 占一段滚动区间，画面和字幕都跟着滚动走。

export const TITLE = {
  whisper: ['我讲一个故事。', '你不要睡着。'],
}

export const CHAPTERS = [
  {
    id: 'house',
    no: '一',
    title: '山上的房子',
    kind: 'cutscene',
    cutscene: 'intro',
    beats: [
      { shot: 'house', n: '从前，山上有一座小房子。' },
      { shot: 'isaac-mom', n: '房子里住着以撒，和以撒的妈妈。', i: '就我们两个。一直是两个。' },
      { shot: 'drawing', n: '以撒每天画画，玩他的玩具。', i: '我画了好多个妈妈，每一个都在笑。' },
      { shot: 'tv', n: '妈妈每天坐在电视前面。电视里的人，一直在讲上帝。' },
      { shot: 'voice', n: '后来有一天，电视关着，那个声音却没有停。' },
      { shot: 'toys', n: '那个声音说，以撒脏了。', n2: '于是妈妈拿走了他的画，他的玩具，他的衣服。' },
      { shot: 'crying', i: '可是我洗过手的。' },
      { shot: 'locked', n: '然后，门锁上了。', i: '外面很安静。安静得能听见电视。' },
      { shot: 'listening', n: '那个声音又说话了。它说，还要一件礼物。' },
      { shot: 'knife', n: '妈妈说：好的，主。', i: '我知道礼物是谁。' },
      { shot: 'trapdoor', n: '地毯下面，有一扇小小的门。' },
      { shot: 'burst', n: '门被推开的时候——' },
      { shot: 'light', n: '以撒跳了下去。', i: '下面很黑。黑也没关系，黑里面没有声音。' },
    ],
  },
  {
    id: 'down',
    no: '二',
    title: '往下',
    kind: 'descent',
    floors: [
      {
        room: 'basement',
        stage: 'BASEMENT_NAME',
        i: '这里的墙是湿的。整座房子好像都在哭。',
        item: { key: 'THE_SAD_ONION_NAME', desc: 'THE_SAD_ONION_DESCRIPTION', img: 'itemSadOnion', line: '我唯一擅长的事，终于有用了。' },
        dream: { anim: 'nm2', i: '他们笑的时候，我也跟着笑。这样就没人看出来我在哭。' },
      },
      {
        room: 'caves',
        stage: 'CAVES_NAME',
        i: '越往下走，就越听不见楼上的电视。',
        item: { key: 'DEAD_CAT_NAME', desc: 'DEAD_CAT_DESCRIPTION', img: 'itemDeadCat', line: 'Guppy 有九条命。它一条也没给自己留。' },
        dream: { anim: 'nm4', i: '我把花送给她。她笑得好大声，大到我听不见我自己。' },
      },
      {
        room: 'depths',
        stage: 'DEPTHS_NAME',
        i: '这里的怪物，每一个我都认识。',
        item: { key: 'MOMS_KNIFE_NAME', desc: 'MOMS_KNIFE_DESCRIPTION', img: 'itemMomsKnife', line: '它原来在厨房里。现在它听我的。' },
        dream: { anim: 'nm9', i: '咔哒。咔哒。我数到十，高跟鞋就会走开。' },
      },
    ],
  },
  {
    id: 'mom',
    no: '三',
    title: '妈妈',
    kind: 'boss',
    beats: [
      { vs: true },
      { stomp: 1, i: '妈妈很大。大得像天花板。' },
      { stomp: 2, i: '我一直以为，打败她，就可以回家了。' },
      { stomp: 3, i: '可是，家就是她呀。' },
      { fallen: true, n: '妈妈的脚，再也没有落下来。' },
      { item: { key: 'THE_POLAROID_NAME', desc: 'THE_POLAROID_DESCRIPTION', img: 'itemPolaroid', line: '照片里有三个人。其中一个，很久没有回家了。' } },
    ],
  },
  {
    id: 'selves',
    no: '四',
    title: '很多个我',
    kind: 'selves',
    intro: '以撒有时候会假装自己是别人。',
    // anim = charactermenu.anm2 里的动画名；portrait = 大头像；name = stringtable 键
    selves: [
      { anim: '02_Magdalene', name: 'MAGDALENE_NAME', line: '如果我是个乖孩子——' },
      { anim: '03_Cain', name: 'CAIN_NAME', line: '如果弄丢了什么的人是我——' },
      { anim: '04_Judas', name: 'JUDAS_NAME', line: '如果出卖了谁的人是我——' },
      { anim: '06_Bluebaby', name: 'BLUEBABY_NAME', line: '如果我已经不在了——' },
      { anim: '05_Eve', name: 'EVE_NAME', line: '如果我越疼，就越厉害——' },
      { anim: '07_Samson', name: 'SAMSON_NAME', line: '如果我可以一直生气——' },
      { anim: '08_Azazel', name: 'AZAZEL_NAME', line: '如果我真的是魔鬼——' },
      { anim: '09_Lazarus', name: 'LAZARUS_NAME', line: '如果我还能再活一次——' },
      { anim: '10_Eden', name: 'EDEN_NAME', line: '如果我谁也不是——' },
      { anim: '11_TheLost', name: 'THE_LOST_NAME', line: '如果我什么都没有了——' },
      { anim: '12_Lilith', name: 'LILITH_NAME', line: '如果有人替我去打——' },
      { anim: '13_Keeper', name: 'KEEPER_NAME', line: '如果我只值一枚硬币——' },
      { anim: '15_Apollyon', name: 'APOLLYON_NAME', line: '如果我能把一切都吞下去——' },
      { anim: '16_TheForgotten', name: 'THE_FORGOTTEN_NAME', line: '如果我只剩下骨头——' },
      { anim: '17_Bethany', name: 'BETHANY_NAME', line: '如果我能替别人点一盏灯——' },
      { anim: '18_JacobEsau', name: 'JACOB_NAME', line: '如果我有一个哥哥——' },
      { anim: '01_Isaac', name: 'ISAAC_NAME', line: '……那我还是我吗？' },
    ],
    closet: '这些都是以撒。衣柜里，还有一个。',
    dream: { anim: 'nm1', i: '我不怕黑。我怕盖子合上以后，没有人来找我。' },
  },
  {
    id: 'up',
    no: '五',
    title: '往上',
    kind: 'cutscene',
    cutscene: 'final',
    beats: [
      { shot: 'rising', n: '然后，以撒开始往上飘。' },
      { shot: 'grief', n: '他看见妈妈抱着他的东西，哭得喘不过气。' },
      { shot: 'leaving', n: '他看见爸爸出门的时候，没有回头。' },
      { shot: 'purse', n: '他看见妈妈睡着以后，爸爸打开了她的钱包。' },
      { shot: 'fight', n: '他听见他们在夜里吵架。', i: '是因为我吗？' },
      { shot: 'curled', n: '很多个晚上，他都睡不着。', i: '一定是因为我。' },
      { shot: 'shadow', n: '衣柜里，他自己的影子，一直安安静静地等着他。' },
      { shot: 'fears', n: '然后，那些害怕，一个一个从他身上离开了。', n2: '羞耻也是。担心也是。' },
      { shot: 'guppy', n: '他看见 Guppy。它好好的。' },
      { shot: 'together', n: '他看见爸爸和妈妈站在一起，手牵着手。' },
      { shot: 'kiss', n: '他想起每次祷告完，妈妈都会亲一亲他的额头。' },
      { shot: 'birth', n: '他看见自己出生的那一天。每个人都在笑。' },
      { blank: true, n: '然后，他什么也看不见了。' },
    ],
  },
  {
    id: 'end',
    kind: 'ending',
    before: [
      '你确定，这就是你想要的结局吗，以撒？',
      '故事是你自己写的。它不一定要这样结束。',
      '我们换一种讲法，好不好？',
    ],
    answer: '好，爸爸。',
    after: [
      { d: '好。你困了吗？' },
      { i: '嗯。' },
      { d: '那……咳咳。' },
    ],
    story: '以撒和他的爸爸妈妈，住在山顶上的一座小房子里……',
    goodnight: '晚安，以撒。',
  },
]
