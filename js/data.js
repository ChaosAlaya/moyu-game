/* 摸鱼大作战 - 全部内容数据（数据驱动，10 层版本）
 * UMD 风格挂全局，浏览器与 Node 测试均可加载
 *
 * 【卡面美术接口】卡牌定义支持可选字段：
 *   art:    卡面图路径（相对 index.html，如 "assets/cardart/rua.png"）
 *   artFit: "cover"（矩形图块填满裁切，默认）或 "contain"（透明贴纸完整居中）
 * 没有 art 的牌保持纯文字卡样式。AI 补图升级方式：
 *   把图放进 assets/cardart/，然后在下方 CARD_ART 映射表加一行（或直接在卡牌定义里加 art 字段）即可。
 */
(function (g) {
  'use strict';

  // 合法的关键词/效果操作符（测试校验用）
  var KEYWORDS = ['力量', '虚弱', '易伤', '消耗', '格挡', '能量', '抽牌', '回复'];
  var EFFECT_OPS = [
    'damage', 'block', 'draw', 'heal', 'energy', 'weak', 'vulnerable',
    'strength', 'selfDamage', 'skipEnemy', 'power', 'special', 'goldDamage'
  ];

  /* ---------------- 卡牌 ----------------
   * type: attack / skill / power
   * rarity: common / uncommon / rare
   * effects: 效果数组，引擎按序执行
   * up: 升级版本覆盖（数值约 +30%）
   * char: 若存在则只有该角色能拿到
   */
  var cards = {
    /* ---- 攻击 ---- */
    strike_moyu: {
      name: '摸鱼一击', cost: 1, type: 'attack', rarity: 'common',
      desc: '造成 6 点伤害。',
      effects: [{ op: 'damage', value: 6 }],
      up: { desc: '造成 9 点伤害。', effects: [{ op: 'damage', value: 9 }] }
    },
    squat: {
      name: '带薪蹲坑', cost: 1, type: 'attack', rarity: 'common',
      desc: '造成 5 点伤害，获得 4 点格挡。',
      effects: [{ op: 'damage', value: 5 }, { op: 'block', value: 4 }],
      up: { desc: '造成 7 点伤害，获得 6 点格挡。',
        effects: [{ op: 'damage', value: 7 }, { op: 'block', value: 6 }] }
    },
    keyboard: {
      name: '键盘连击', cost: 1, type: 'attack', rarity: 'common',
      desc: '造成 3 点伤害 2 次。',
      effects: [{ op: 'damage', value: 3, times: 2 }],
      up: { desc: '造成 4 点伤害 2 次。',
        effects: [{ op: 'damage', value: 4, times: 2 }] }
    },
    keystorm: {
      name: '键盘风暴', cost: 1, type: 'attack', rarity: 'common',
      desc: '造成 2 点伤害 3 次。',
      effects: [{ op: 'damage', value: 2, times: 3 }],
      up: { desc: '造成 3 点伤害 3 次。',
        effects: [{ op: 'damage', value: 3, times: 3 }] }
    },
    rua: {
      name: 'RUA!', cost: 1, type: 'attack', rarity: 'uncommon',
      desc: '造成 4 点伤害，本场战斗每打出过 1 张攻击牌 +2。',
      effects: [{ op: 'special', kind: 'rua', base: 4, per: 2 }],
      up: { desc: '造成 6 点伤害，本场战斗每打出过 1 张攻击牌 +2。',
        effects: [{ op: 'special', kind: 'rua', base: 6, per: 2 }] }
    },
    darksword: {
      name: '黑暗之剑', cost: 2, type: 'attack', rarity: 'uncommon',
      desc: '造成 7 点伤害，本场战斗每打出过一次此牌 +3。',
      effects: [{ op: 'special', kind: 'darksword', base: 7, per: 3 }],
      up: { desc: '造成 10 点伤害，本场战斗每打出过一次此牌 +3。',
        effects: [{ op: 'special', kind: 'darksword', base: 10, per: 3 }] }
    },
    sword22: {
      name: '不存在的22剑', cost: 0, type: 'attack', rarity: 'rare',
      desc: '造成 3 点伤害 3 次。它真的存在了！',
      flavor: '它真的存在了！',
      effects: [{ op: 'damage', value: 3, times: 3 }],
      up: { desc: '造成 4 点伤害 3 次。它真的存在了！',
        effects: [{ op: 'damage', value: 4, times: 3 }] }
    },
    pie: {
      name: '老板画的饼', cost: 0, type: 'attack', rarity: 'common',
      desc: '造成 2 点伤害，抽 1 张牌。',
      effects: [{ op: 'damage', value: 2 }, { op: 'draw', value: 1 }],
      up: { desc: '造成 3 点伤害，抽 1 张牌。',
        effects: [{ op: 'damage', value: 3 }, { op: 'draw', value: 1 }] }
    },
    weekly: {
      name: '周报轰炸', cost: 2, type: 'attack', rarity: 'uncommon',
      desc: '造成 12 点伤害。',
      effects: [{ op: 'damage', value: 12 }],
      up: { desc: '造成 16 点伤害。', effects: [{ op: 'damage', value: 16 }] }
    },
    breakdown: {
      name: '深夜破防', cost: 1, type: 'attack', rarity: 'uncommon',
      desc: '造成等同于你本场战斗已损失精力 30% 的伤害（最低 4）。',
      effects: [{ op: 'special', kind: 'breakdown', pct: 0.3, min: 4 }],
      up: { desc: '造成等同于你本场战斗已损失精力 40% 的伤害（最低 6）。',
        effects: [{ op: 'special', kind: 'breakdown', pct: 0.4, min: 6 }] }
    },
    shuangdao: {
      name: '爽到', cost: 1, type: 'attack', rarity: 'uncommon',
      desc: '造成 6 点伤害；若敌人意图不是攻击，+4。',
      effects: [{ op: 'special', kind: 'shuangdao', base: 6, bonus: 4 }],
      up: { desc: '造成 8 点伤害；若敌人意图不是攻击，+5。',
        effects: [{ op: 'special', kind: 'shuangdao', base: 8, bonus: 5 }] }
    },
    ultimate: {
      name: '终极摸鱼', cost: 3, type: 'attack', rarity: 'rare',
      desc: '造成 18 点伤害，获得 8 点格挡。',
      effects: [{ op: 'damage', value: 18 }, { op: 'block', value: 8 }],
      up: { desc: '造成 24 点伤害，获得 10 点格挡。',
        effects: [{ op: 'damage', value: 24 }, { op: 'block', value: 10 }] }
    },

    /* ---- 技能 ---- */
    defend_moyu: {
      name: '摸鱼', cost: 1, type: 'skill', rarity: 'common',
      desc: '获得 5 点格挡。',
      effects: [{ op: 'block', value: 5 }],
      up: { desc: '获得 8 点格挡。', effects: [{ op: 'block', value: 8 }] }
    },
    fakebusy: {
      name: '装忙', cost: 1, type: 'skill', rarity: 'common',
      desc: '获得 7 点格挡。',
      effects: [{ op: 'block', value: 7 }],
      up: { desc: '获得 10 点格挡。', effects: [{ op: 'block', value: 10 }] }
    },
    spiritwin: {
      name: '精神胜利法', cost: 1, type: 'skill', rarity: 'common',
      desc: '获得 4 点格挡，抽 1 张牌。',
      effects: [{ op: 'block', value: 4 }, { op: 'draw', value: 1 }],
      up: { desc: '获得 6 点格挡，抽 1 张牌。',
        effects: [{ op: 'block', value: 6 }, { op: 'draw', value: 1 }] }
    },
    paidpoop: {
      name: '带薪拉屎', cost: 1, type: 'skill', rarity: 'common',
      desc: '获得 6 点格挡，回复 2 点精力。',
      effects: [{ op: 'block', value: 6 }, { op: 'heal', value: 2 }],
      up: { desc: '获得 8 点格挡，回复 3 点精力。',
        effects: [{ op: 'block', value: 8 }, { op: 'heal', value: 3 }] }
    },
    latenight: {
      name: '深夜外卖', cost: 1, type: 'skill', rarity: 'common',
      desc: '回复 3 点精力，抽 1 张牌。',
      effects: [{ op: 'heal', value: 3 }, { op: 'draw', value: 1 }],
      up: { desc: '回复 4 点精力，抽 1 张牌。',
        effects: [{ op: 'heal', value: 4 }, { op: 'draw', value: 1 }] }
    },
    stealth: {
      name: '隐身术', cost: 2, type: 'skill', rarity: 'uncommon',
      desc: '获得 12 点格挡。',
      effects: [{ op: 'block', value: 12 }],
      up: { desc: '获得 16 点格挡。', effects: [{ op: 'block', value: 16 }] }
    },
    vacation: {
      name: '带薪年假', cost: 2, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 8 点精力。消耗。',
      effects: [{ op: 'heal', value: 8 }],
      up: { desc: '回复 11 点精力。消耗。', effects: [{ op: 'heal', value: 11 }] }
    },
    chicken: {
      name: '香香鸡', cost: 1, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 5 点精力。消耗。',
      effects: [{ op: 'heal', value: 5 }],
      up: { desc: '回复 7 点精力。消耗。', effects: [{ op: 'heal', value: 7 }] }
    },
    chicken_bucket_card: {
      name: '香香鸡全家桶', cost: 2, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 8 点精力，获得 4 点格挡。消耗。',
      effects: [{ op: 'heal', value: 8 }, { op: 'block', value: 4 }],
      up: { desc: '回复 11 点精力，获得 6 点格挡。消耗。',
        effects: [{ op: 'heal', value: 11 }, { op: 'block', value: 6 }] }
    },
    noodle: {
      name: '重庆小面', cost: 1, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 4 点精力。消耗。',
      effects: [{ op: 'heal', value: 4 }],
      up: { desc: '回复 6 点精力。消耗。', effects: [{ op: 'heal', value: 6 }] }
    },
    tarot: {
      name: '獭罗牌占卜', cost: 0, type: 'skill', rarity: 'uncommon',
      desc: '抽 1 张牌；若敌人意图是攻击，获得 4 点格挡。',
      effects: [{ op: 'special', kind: 'tarot', draw: 1, blk: 4 }],
      up: { desc: '抽 1 张牌；若敌人意图是攻击，获得 6 点格挡。',
        effects: [{ op: 'special', kind: 'tarot', draw: 1, blk: 6 }] }
    },
    bigbook: {
      name: '大书库', cost: 2, type: 'skill', rarity: 'uncommon',
      desc: '抽 3 张牌。',
      effects: [{ op: 'draw', value: 3 }],
      up: { desc: '抽 4 张牌。', effects: [{ op: 'draw', value: 4 }] }
    },
    quantum: {
      name: '量子波动速读', cost: 0, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '抽 2 张牌。消耗。',
      effects: [{ op: 'draw', value: 2 }],
      up: { desc: '抽 3 张牌。消耗。', effects: [{ op: 'draw', value: 3 }] }
    },
    playdead: {
      name: '装死', cost: 2, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '获得 14 点格挡。消耗。',
      effects: [{ op: 'block', value: 14 }],
      up: { desc: '获得 18 点格挡。消耗。', effects: [{ op: 'block', value: 18 }] }
    },
    radar: {
      name: '摸鱼雷达', cost: 1, type: 'skill', rarity: 'uncommon',
      desc: '给予敌人 1 回合虚弱和 1 回合易伤。',
      effects: [{ op: 'weak', value: 1 }, { op: 'vulnerable', value: 1 }],
      up: { desc: '给予敌人 2 回合虚弱和 2 回合易伤。',
        effects: [{ op: 'weak', value: 2 }, { op: 'vulnerable', value: 2 }] }
    },
    coffee: {
      name: '咖啡因续命', cost: 0, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '获得 1 点能量。消耗。',
      effects: [{ op: 'energy', value: 1 }],
      up: { desc: '获得 2 点能量。消耗。', effects: [{ op: 'energy', value: 2 }] }
    },
    procrastinate: {
      name: '拖延症', cost: 1, type: 'skill', rarity: 'common',
      desc: '给予敌人 2 回合虚弱。',
      effects: [{ op: 'weak', value: 2 }],
      up: { desc: '给予敌人 3 回合虚弱。', effects: [{ op: 'weak', value: 3 }] }
    },
    clockout: {
      name: '下班打卡', cost: 1, type: 'skill', rarity: 'common',
      desc: '给予敌人 2 回合易伤。',
      effects: [{ op: 'vulnerable', value: 2 }],
      up: { desc: '给予敌人 3 回合易伤。', effects: [{ op: 'vulnerable', value: 3 }] }
    },
    noding: {
      name: '摸鱼禁止', cost: 2, type: 'skill', rarity: 'rare',
      exhaust: true,
      desc: '敌人跳过下一次行动。消耗。',
      effects: [{ op: 'skipEnemy', value: 1 }],
      up: { cost: 1, desc: '敌人跳过下一次行动。消耗。',
        effects: [{ op: 'skipEnemy', value: 1 }] }
    },
    assemble: {
      name: '猛男寨集结', cost: 2, type: 'skill', rarity: 'rare',
      exhaust: true,
      desc: '力量 +2，抽 2 张牌。消耗。',
      effects: [{ op: 'strength', value: 2 }, { op: 'draw', value: 2 }],
      up: { desc: '力量 +3，抽 2 张牌。消耗。',
        effects: [{ op: 'strength', value: 3 }, { op: 'draw', value: 2 }] }
    },

    /* ---- 能力 ---- */
    scarf_power: {
      name: '红围巾', cost: 2, type: 'power', rarity: 'uncommon',
      desc: '每回合开始时获得 3 点格挡。',
      effects: [{ op: 'power', id: 'scarf_power', value: 3 }],
      up: { desc: '每回合开始时获得 4 点格挡。',
        effects: [{ op: 'power', id: 'scarf_power', value: 4 }] }
    },
    guide: {
      name: '机皇的攻略', cost: 1, type: 'power', rarity: 'uncommon',
      desc: '力量 +1。',
      effects: [{ op: 'strength', value: 1 }],
      up: { desc: '力量 +2。', effects: [{ op: 'strength', value: 2 }] }
    },
    leftover_shield: {
      name: '剩饭护体', cost: 1, type: 'power', rarity: 'uncommon',
      desc: '每次被攻击时反弹 3 点伤害。',
      effects: [{ op: 'power', id: 'leftover_shield', value: 3 }],
      up: { desc: '每次被攻击时反弹 4 点伤害。',
        effects: [{ op: 'power', id: 'leftover_shield', value: 4 }] }
    },
    realm: {
      name: '摸鱼境界', cost: 2, type: 'power', rarity: 'rare',
      desc: '每打出第 3 张牌时，抽 1 张牌。',
      effects: [{ op: 'power', id: 'realm', value: 3 }],
      up: { cost: 1, desc: '每打出第 3 张牌时，抽 1 张牌。',
        effects: [{ op: 'power', id: 'realm', value: 3 }] }
    },
    rebound: {
      name: '反弹式离职', cost: 2, type: 'power', rarity: 'rare',
      desc: '每次被攻击反弹 4 点伤害；每回合开始获得 2 点格挡。',
      effects: [{ op: 'power', id: 'leftover_shield', value: 4 },
        { op: 'power', id: 'scarf_power', value: 2 }],
      up: { desc: '每次被攻击反弹 5 点伤害；每回合开始获得 3 点格挡。',
        effects: [{ op: 'power', id: 'leftover_shield', value: 5 },
          { op: 'power', id: 'scarf_power', value: 3 }] }
    },
    master: {
      name: '摸鱼宗师', cost: 3, type: 'power', rarity: 'rare',
      desc: '力量 +1；每回合开始获得 4 点格挡。',
      effects: [{ op: 'strength', value: 1 },
        { op: 'power', id: 'scarf_power', value: 4 }],
      up: { desc: '力量 +1；每回合开始获得 6 点格挡。',
        effects: [{ op: 'strength', value: 1 },
          { op: 'power', id: 'scarf_power', value: 6 }] }
    },

    /* ---- 角色专属 ---- */
    ganfan: {
      name: '干饭', cost: 1, type: 'skill', rarity: 'common', char: 'shengfan',
      desc: '回复 3 点精力，获得 4 点格挡。',
      effects: [{ op: 'heal', value: 3 }, { op: 'block', value: 4 }],
      up: { desc: '回复 4 点精力，获得 6 点格挡。',
        effects: [{ op: 'heal', value: 4 }, { op: 'block', value: 6 }] }
    },
    binge: {
      name: '暴食', cost: 2, type: 'attack', rarity: 'uncommon', char: 'shengfan',
      desc: '造成 12 点伤害，自己损失 2 点精力。',
      effects: [{ op: 'damage', value: 12 }, { op: 'selfDamage', value: 2 }],
      up: { desc: '造成 16 点伤害，自己损失 2 点精力。',
        effects: [{ op: 'damage', value: 16 }, { op: 'selfDamage', value: 2 }] }
    },
    calc: {
      name: '严谨计算', cost: 1, type: 'attack', rarity: 'common', char: 'jihuang',
      desc: '造成 6 点伤害；若敌人意图是攻击，获得 5 点格挡。',
      effects: [{ op: 'special', kind: 'calc', dmg: 6, blk: 5 }],
      up: { desc: '造成 8 点伤害；若敌人意图是攻击，获得 7 点格挡。',
        effects: [{ op: 'special', kind: 'calc', dmg: 8, blk: 7 }] }
    },
    optimize: {
      name: '链路优化', cost: 1, type: 'skill', rarity: 'common', char: 'jihuang',
      desc: '抽 2 张牌。',
      effects: [{ op: 'draw', value: 2 }],
      up: { desc: '抽 3 张牌。', effects: [{ op: 'draw', value: 3 }] }
    },
    money: {
      name: '钞能力', cost: 2, type: 'attack', rarity: 'uncommon', char: 'shuanglaoya',
      desc: '造成 12 点伤害；若金币 ≥ 50，再 +8。',
      effects: [{ op: 'goldDamage', value: 12, gte: 50, bonus: 8 }],
      up: { desc: '造成 15 点伤害；若金币 ≥ 50，再 +10。',
        effects: [{ op: 'goldDamage', value: 15, gte: 50, bonus: 10 }] }
    },
    shades: {
      name: '墨镜威吓', cost: 1, type: 'skill', rarity: 'common', char: 'shuanglaoya',
      desc: '给予敌人 1 回合虚弱和 1 回合易伤。',
      effects: [{ op: 'weak', value: 1 }, { op: 'vulnerable', value: 1 }],
      up: { desc: '给予敌人 2 回合虚弱和 2 回合易伤。',
        effects: [{ op: 'weak', value: 2 }, { op: 'vulnerable', value: 2 }] }
    }
  };

  /* ---------------- 角色 ----------------
   * unlock: 需要通关的层数（0 = 默认解锁） */
  var characters = {
    xiaoq: {
      name: '摸鱼奎恩', title: '摸鱼之道', img: 'xiaoq',
      avatar: 'assets/v2/avatar/xiaoq.jpg',
      maxHp: 75, gold: 99,
      passive: '每场战斗的第一回合多抽 2 张牌。',
      passiveId: 'firstDraw2',
      unlock: 0,
      deck: ['strike_moyu', 'strike_moyu', 'strike_moyu', 'strike_moyu',
        'defend_moyu', 'defend_moyu', 'defend_moyu', 'defend_moyu',
        'chicken', 'squat']
    },
    shengfan: {
      name: '北极熊剩饭', title: '干饭人', img: 'shengfan',
      avatar: 'assets/v2/avatar/shengfan.jpg',
      maxHp: 90, gold: 99,
      passive: '最大精力 +15，战斗胜利后额外回复 4 点精力。',
      passiveId: 'foodie',
      unlock: 2,
      deck: ['strike_moyu', 'strike_moyu', 'strike_moyu',
        'defend_moyu', 'defend_moyu', 'defend_moyu',
        'squat', 'ganfan', 'ganfan', 'binge']
    },
    jihuang: {
      name: '企鹅机皇', title: '攻略制定', img: 'jihuang',
      avatar: 'assets/v2/avatar/jihuang.jpg',
      maxHp: 70, gold: 99,
      passive: '每回合多抽 1 张牌。',
      passiveId: 'extraDraw1',
      unlock: 4,
      deck: ['strike_moyu', 'strike_moyu', 'strike_moyu',
        'defend_moyu', 'defend_moyu', 'defend_moyu',
        'calc', 'calc', 'optimize', 'spiritwin']
    },
    shuanglaoya: {
      name: '爽老鸭', title: '财力支柱', img: 'shuanglaoya',
      avatar: 'assets/v2/avatar/shuanglaoya.jpg',
      maxHp: 80, gold: 120,
      passive: '商店卡牌商品 +1 格，每场战斗开始获得 10 金币。',
      passiveId: 'moneybags',
      unlock: 7,
      deck: ['strike_moyu', 'strike_moyu', 'strike_moyu',
        'defend_moyu', 'defend_moyu', 'defend_moyu',
        'money', 'money', 'shades', 'shades']
    }
  };

  /* ---------------- 卡面美术映射 ----------------
   * id → [图片路径, 适配方式]。fit 省略时默认 "cover"（矩形图块）；
   * 透明贴纸与角色立绘用 "contain"。 */
  var CARD_ART = {
    darksword: ['assets/cardart/bubble_darksword.png', 'contain'],
    noding: ['assets/cardart/bubble_moyuforbid.png', 'contain'],
    defend_moyu: ['assets/cardart/bubble_moyumei.png', 'contain'],
    quantum: ['assets/cardart/charm_gamelost.png', 'contain'],
    playdead: ['assets/cardart/bubble_sneakdog.png', 'contain'],
    rua: ['assets/cardart/rua.png'],
    sword22: ['assets/cardart/stand_22sword.png'],
    chicken: ['assets/cardart/chicken_soup.png'],
    noodle: ['assets/cardart/noodle_box.png'],
    ganfan: ['assets/cardart/eatnoodle.png'],
    binge: ['assets/cardart/bear_fire.png'],
    tarot: ['assets/cardart/tarot_3.png'],
    assemble: ['assets/cardart/studio.png'],
    master: ['assets/cardart/moyu_souls.png'],
    radar: ['assets/cardart/camera.png'],
    shuangdao: ['assets/cardart/thumbsup.png'],
    rebound: ['assets/cardart/point.png'],
    latenight: ['assets/cardart/drive.png'],
    ultimate: ['assets/cardart/kenni_sword.png'],
    money: ['assets/cardart/duck_suit.png'],
    shades: ['assets/cardart/duck_cry.png'],
    /* Lovart 新美术：整卡设计图裁出的插画（v2，cover） */
    strike_moyu: ['assets/v2/card/strike_moyu.jpg'],
    squat: ['assets/v2/card/squat.jpg'],
    keyboard: ['assets/v2/card/keyboard.jpg'],
    keystorm: ['assets/v2/card/keystorm.jpg'],
    pie: ['assets/v2/card/pie.jpg'],
    weekly: ['assets/v2/card/weekly.jpg'],
    breakdown: ['assets/v2/card/breakdown.jpg'],
    fakebusy: ['assets/v2/card/fakebusy.jpg'],
    spiritwin: ['assets/v2/card/spiritwin.jpg'],
    paidpoop: ['assets/v2/card/paidpoop.jpg'],
    stealth: ['assets/v2/card/stealth.jpg'],
    vacation: ['assets/v2/card/vacation.jpg'],
    procrastinate: ['assets/v2/card/procrastinate.jpg'],
    clockout: ['assets/v2/card/clockout.jpg'],
    coffee: ['assets/v2/card/coffee.jpg'],
    bigbook: ['assets/v2/card/bigbook.jpg'],
    realm: ['assets/v2/card/realm.jpg'],
    chicken_bucket_card: ['assets/v2/card/chicken_bucket_card.jpg'],
    /* 角色专属牌卡面用新头像 */
    scarf_power: ['assets/v2/avatar/xiaoq.jpg', 'contain'],
    guide: ['assets/v2/avatar/jihuang.jpg', 'contain'],
    optimize: ['assets/v2/avatar/jihuang.jpg', 'contain'],
    calc: ['assets/v2/avatar/jihuang.jpg', 'contain'],
    leftover_shield: ['assets/v2/avatar/shengfan.jpg', 'contain']
  };
  for (var artId in CARD_ART) {
    if (cards[artId]) {
      cards[artId].art = CARD_ART[artId][0];
      if (CARD_ART[artId][1]) cards[artId].artFit = CARD_ART[artId][1];
    }
  }

  /* ---------------- 敌人 ----------------
   * moves: type: attack/block/debuff/buff/charge/heal
   *   value=伤害/格挡/回血, times=攻击次数, weak/vulnerable=给予玩家的回合数
   *   strength=自身加力量, w=权重（随机模式）, every=每 N 回合使用一次（优先）
   * ai: 'random'（按权重） 或 'loop'（循环）
   * phases: 可选，血量比例低于 until 时切换 moves
   * 精英会随当前层数获得 HP/攻击加成（引擎处理）
   */
  var enemies = {
    /* Act 1 一楼·工位区 */
    group_at: {
      name: '工作群@所有人', hp: 18, act: 1, img: 'kenni',
      moves: [
        { name: '全员@', type: 'attack', value: 5, w: 3 },
        { name: '收到请回复', type: 'debuff', weak: 1, w: 2 }
      ]
    },
    punchclock: {
      name: '考勤机', hp: 24, act: 1, img: 'jihuang',
      moves: [
        { name: '打卡警告', type: 'attack', value: 7, w: 3 },
        { name: '铁面无私', type: 'block', value: 5, w: 2 }
      ]
    },
    tempneed: {
      name: '临时需求', hp: 15, act: 1, img: 'shuanglaoya',
      moves: [
        { name: '小改动', type: 'attack', value: 4, w: 3 },
        { name: '紧急上线', type: 'attack', value: 6, w: 2 }
      ]
    },
    /* Act 2 二楼·会议室 */
    weeklyrep: {
      name: '周报', hp: 30, act: 2, img: 'taer',
      moves: [
        { name: '字数考核', type: 'attack', value: 8, w: 3 },
        { name: '灵魂拷问', type: 'debuff', vulnerable: 1, w: 2 }
      ]
    },
    reqchange: {
      name: '需求变更', hp: 34, act: 2, img: 'shuanglaoya',
      moves: [
        { name: '还是第一版好', type: 'attack', value: 6, weak: 1, w: 3 },
        { name: '推倒重来', type: 'attack', value: 10, w: 2 }
      ]
    },
    tempmeeting: {
      name: '临时会议', hp: 28, act: 2, img: 'kenni', ai: 'loop',
      moves: [
        { name: '议题轰炸', type: 'attack', value: 3, times: 3 },
        { name: '会议蓄力', type: 'charge' },
        { name: '结论输出', type: 'attack', value: 12 }
      ]
    },
    /* Act 3 三楼·茶水间 */
    milktea: {
      name: '拼单奶茶', hp: 29, act: 3, img: 'taer',
      moves: [
        { name: '糖分冲击', type: 'attack', value: 7, w: 3 },
        { name: '满血复活', type: 'heal', value: 6, w: 2 }
      ]
    },
    gossip_squad: {
      name: '八卦小队', hp: 27, act: 3, img: 'taer',
      moves: [
        { name: '窃窃私语', type: 'attack', value: 5, times: 2, w: 3 },
        { name: '指指点点', type: 'debuff', weak: 1, w: 2 }
      ]
    },
    microwave: {
      name: '微波炉排队', hp: 33, act: 3, img: 'shengfan',
      moves: [
        { name: '还要等三分钟', type: 'attack', value: 9, w: 3 },
        { name: '插队失败', type: 'block', value: 6, w: 2 }
      ]
    },
    /* Act 4 四楼·财务部 */
    reimb: {
      name: '报销单', hp: 34, act: 4, img: 'kenni',
      moves: [
        { name: '贴票规范', type: 'attack', value: 8, w: 3 },
        { name: '连号发票', type: 'attack', value: 5, times: 2, w: 2 }
      ]
    },
    invoice: {
      name: '发票审核', hp: 38, act: 4, img: 'jihuang',
      moves: [
        { name: '驳回', type: 'attack', value: 10, w: 3 },
        { name: '重点关照', type: 'debuff', vulnerable: 1, w: 2 }
      ]
    },
    budget: {
      name: '预算削减', hp: 36, act: 4, img: 'shuanglaoya',
      moves: [
        { name: '砍预算', type: 'attack', value: 9, w: 2 },
        { name: '节流转嫁', type: 'heal', value: 8, w: 2 },
        { name: '冻结', type: 'block', value: 8, w: 1 }
      ]
    },
    /* Act 5 五楼·服务器机房 */
    downtime: {
      name: '宕机警报', hp: 39, act: 5, img: 'jihuang',
      moves: [
        { name: '红色告警', type: 'attack', value: 6, times: 2, w: 3 },
        { name: '全线崩溃', type: 'attack', value: 11, w: 2 }
      ]
    },
    incident: {
      name: '线上事故', hp: 43, act: 5, img: 'kenni',
      moves: [
        { name: 'P0 事故', type: 'attack', value: 12, w: 3 },
        { name: '复盘大会', type: 'debuff', weak: 1, vulnerable: 1, w: 2 }
      ]
    },
    logerr: {
      name: '日志报错', hp: 38, act: 5, img: 'taer',
      moves: [
        { name: '刷屏', type: 'attack', value: 4, times: 3, w: 3 },
        { name: '堆栈溢出', type: 'attack', value: 9, w: 2 }
      ]
    },
    /* Act 6 六楼·市场部 */
    kpicurve: {
      name: 'KPI曲线', hp: 44, act: 6, img: 'taer',
      moves: [
        { name: '环比增长', type: 'attack', value: 13, w: 3 },
        { name: '打鸡血', type: 'buff', strength: 2, w: 2 }
      ]
    },
    client: {
      name: '甲方爸爸', hp: 48, act: 6, img: 'shuanglaoya',
      moves: [
        { name: '我觉得不行', type: 'attack', value: 9, times: 2, w: 3 },
        { name: '五彩斑斓的黑', type: 'debuff', vulnerable: 1, w: 2 }
      ]
    },
    plan18: {
      name: '方案第18版', hp: 42, act: 6, img: 'kenni',
      moves: [
        { name: '再改一版', type: 'attack', value: 7, times: 2, w: 2 },
        { name: '用第一版吧', type: 'attack', value: 14, w: 1 }
      ]
    },
    /* Act 7 七楼·人力资源部 */
    spotcheck: {
      name: '考勤抽查', hp: 49, act: 7, img: 'jihuang',
      moves: [
        { name: '迟到记录', type: 'attack', value: 12, w: 3 },
        { name: '通报批评', type: 'debuff', weak: 1, w: 2 }
      ]
    },
    teambuild: {
      name: '团建通知', hp: 46, act: 7, img: 'taer',
      moves: [
        { name: '周末团建', type: 'attack', value: 6, times: 3, w: 3 },
        { name: '经费回收', type: 'heal', value: 10, w: 2 }
      ]
    },
    optlist: {
      name: '优化名单', hp: 52, act: 7, img: 'kenni',
      moves: [
        { name: '榜上有名', type: 'attack', value: 14, w: 3 },
        { name: '死亡凝视', type: 'debuff', vulnerable: 1, weak: 1, w: 2 }
      ]
    },
    /* Act 8 八楼·高管层 */
    align: {
      name: '战略对齐', hp: 54, act: 8, img: 'kenni',
      moves: [
        { name: '拉通对齐', type: 'attack', value: 13, w: 3 },
        { name: '统一思想', type: 'buff', strength: 3, w: 2 }
      ]
    },
    loopfu: {
      name: '闭环赋能', hp: 58, act: 8, img: 'taer',
      moves: [
        { name: '赋能输出', type: 'attack', value: 9, times: 2, w: 3 },
        { name: '形成闭环', type: 'block', value: 12, w: 2 }
      ]
    },
    grabcombo: {
      name: '抓手组合拳', hp: 55, act: 8, img: 'jihuang', ai: 'loop',
      moves: [
        { name: '组合拳', type: 'attack', value: 5, times: 3 },
        { name: '找到抓手', type: 'charge' },
        { name: '落地重锤', type: 'attack', value: 18 }
      ]
    },
    /* Act 9 九楼·董事长套间 */
    ipo: {
      name: '上市计划', hp: 60, act: 9, img: 'shuanglaoya',
      moves: [
        { name: '敲钟幻想', type: 'attack', value: 14, w: 3 },
        { name: '估值泡沫', type: 'buff', strength: 2, w: 2 }
      ]
    },
    gamble: {
      name: '对赌协议', hp: 58, act: 9, img: 'kenni',
      moves: [
        { name: '业绩对赌', type: 'attack', value: 18, w: 2 },
        { name: '分期收割', type: 'attack', value: 8, times: 2, w: 2 },
        { name: '回购条款', type: 'heal', value: 12, w: 1 }
      ]
    },
    spy: {
      name: '老板的眼线', hp: 56, act: 9, img: 'taer',
      moves: [
        { name: '打小报告', type: 'attack', value: 12, w: 3 },
        { name: '暗中观察', type: 'debuff', vulnerable: 1, w: 2 },
        { name: '背后议论', type: 'debuff', weak: 1, w: 1 }
      ]
    },
    /* Act 10 十楼·天台 */
    assistant: {
      name: '私人助理', hp: 62, act: 10, img: 'taer',
      moves: [
        { name: '行程安排', type: 'attack', value: 15, w: 3 },
        { name: '端茶倒水', type: 'heal', value: 12, w: 2 }
      ]
    },
    fengshui: {
      name: '风水大师', hp: 60, act: 10, img: 'jihuang',
      moves: [
        { name: '你工位犯冲', type: 'attack', value: 10, times: 2, w: 2 },
        { name: '印堂发黑', type: 'debuff', weak: 1, vulnerable: 1, w: 2 }
      ]
    },
    driver: {
      name: '老板的司机', hp: 68, act: 10, img: 'shengfan',
      moves: [
        { name: '地板油', type: 'attack', value: 17, w: 3 },
        { name: '急刹', type: 'block', value: 14, w: 2 }
      ]
    },
    /* 精英（HP/攻击随层数加成） */
    overtime: {
      name: '加班', hp: 48, act: 0, elite: true, img: 'jihuang',
      moves: [
        { name: '连续输出', type: 'attack', value: 8, times: 2, w: 1 }
      ]
    },
    bigsmall: {
      name: '大小周', hp: 52, act: 0, elite: true, img: 'shengfan',
      moves: [
        { name: '大周冲击', type: 'attack', value: 18, every: 3 },
        { name: '小周压榨', type: 'attack', value: 12, w: 1 }
      ]
    },
    eliminate: {
      name: '末位淘汰', hp: 50, act: 0, elite: true, img: 'kenni',
      moves: [
        { name: '淘汰名单公布', type: 'attack', value: 20, every: 4 },
        { name: '绩效面谈', type: 'attack', value: 10, w: 2 },
        { name: '危机感', type: 'debuff', vulnerable: 1, weak: 1, w: 2 }
      ]
    },
    defense: {
      name: '述职答辩', hp: 55, act: 0, elite: true, img: 'taer', ai: 'loop',
      moves: [
        { name: 'PPT 轰炸', type: 'attack', value: 7, times: 2 },
        { name: '数据兜底', type: 'block', value: 10 },
        { name: '灵魂提问', type: 'attack', value: 14 },
        { name: '评委皱眉', type: 'debuff', weak: 1 }
      ]
    },
    /* BOSS */
    boss1: {
      name: '部门主管', hp: 76, act: 1, boss: true, img: 'kenni',
      moves: [
        { name: '单独谈话', type: 'attack', value: 9, w: 3 },
        { name: '画饼激励', type: 'buff', strength: 2, w: 2 },
        { name: '精神打压', type: 'debuff', weak: 1, w: 2 }
      ]
    },
    boss_pm: {
      name: '项目经理·改需求狂魔', hp: 92, act: 2, boss: true, img: 'shuanglaoya',
      moves: [
        { name: '需求又变了', type: 'attack', value: 11, w: 3 },
        { name: '紧急加需求', type: 'attack', value: 6, times: 2, w: 2 },
        { name: '这很简单', type: 'debuff', weak: 1, w: 2 }
      ]
    },
    boss_admin: {
      name: '行政主管', hp: 105, act: 3, boss: true, img: 'taer',
      moves: [
        { name: '卫生检查', type: 'attack', value: 10, w: 3 },
        { name: '零食没收', type: 'buff', strength: 2, w: 2 },
        { name: '通报批评', type: 'debuff', weak: 1, w: 2 }
      ]
    },
    boss_fin: {
      name: '财务总监', hp: 120, act: 4, boss: true, img: 'kenni',
      moves: [
        { name: '驳回一切', type: 'attack', value: 12, w: 3 },
        { name: '双面账单', type: 'attack', value: 7, times: 2, w: 2 },
        { name: '资金回笼', type: 'heal', value: 10, w: 1 }
      ]
    },
    boss_tech: {
      name: '技术总监·996守护神', hp: 135, act: 5, boss: true, img: 'jihuang', ai: 'loop',
      moves: [
        { name: '福报洗礼', type: 'attack', value: 8, times: 2 },
        { name: '服务器护盾', type: 'block', value: 10 },
        { name: '上线冲刺', type: 'attack', value: 16 },
        { name: '狼性加持', type: 'buff', strength: 2 }
      ]
    },
    boss_mkt: {
      name: '市场总监', hp: 150, act: 6, boss: true, img: 'shuanglaoya',
      moves: [
        { name: '增长黑客', type: 'attack', value: 13, w: 3 },
        { name: '全渠道投放', type: 'attack', value: 8, times: 2, w: 2 },
        { name: '品牌调性', type: 'buff', strength: 2, w: 2 }
      ]
    },
    boss2: {
      name: 'HR·裁员面谈', hp: 165, act: 7, boss: true, img: 'taer',
      moves: [
        { name: '优化', type: 'attack', value: 26, every: 3 },
        { name: '绩效沟通', type: 'attack', value: 14, w: 1 }
      ]
    },
    boss_vp: {
      name: '副总裁', hp: 180, act: 8, boss: true, img: 'kenni',
      moves: [
        { name: '降维打击', type: 'attack', value: 15, w: 3 },
        { name: '双管齐下', type: 'attack', value: 10, times: 2, w: 2 },
        { name: '格局打开', type: 'debuff', weak: 1, vulnerable: 1, w: 2 }
      ]
    },
    boss_sec: {
      name: '董事长秘书', hp: 190, act: 9, boss: true, img: 'taer',
      moves: [
        { name: '传达圣旨', type: 'attack', value: 22, every: 3 },
        { name: '日程碾压', type: 'attack', value: 16, w: 3 },
        { name: '行程保护', type: 'block', value: 12, w: 2 }
      ]
    },
    boss3: {
      name: '老板', hp: 200, act: 10, boss: true, img: 'kenni',
      phases: [
        {
          until: 0.5,
          moves: [
            { name: '战略部署', type: 'attack', value: 13, w: 3 },
            { name: '公司是我家', type: 'block', value: 10, w: 1 },
            { name: '狼性文化', type: 'attack', value: 9, weak: 1, w: 2 }
          ]
        },
        {
          until: 0, phaseName: '都给我加班',
          moves: [
            { name: '周末加班通知', type: 'attack', value: 22, every: 4 },
            { name: '都给我加班', type: 'attack', value: 9, times: 2, strength: 1, w: 1 }
          ]
        }
      ],
      moves: [] // 由 phases 接管
    }
  };

  /* ---------------- 遗物 ---------------- */
  var relics = {
    scarf_relic: { name: '红围巾', desc: '每场战斗第一次受到的伤害为 0。', price: 150, img: 'xiaoq' },
    glasses: { name: '肯尼的镜片', desc: '敌人意图显示精确数值。', price: 130, img: 'kenni' },
    sunglasses: { name: '爽老鸭的墨镜', desc: '商店所有商品 8 折。', price: 160, img: 'shuanglaoya' },
    gamepad: { name: '机皇手柄', desc: '每回合打出的第一张技能牌费用 -1。', price: 150, img: 'jihuang' },
    bowl: { name: '搪瓷碗', desc: '休息时回复额外 +10 点精力。', price: 120, img: 'shengfan' },
    membercard: { name: '小卖铺会员卡', desc: '商店删牌首次免费。', price: 140, img: 'shuanglaoya' },
    doll: { name: '玩偶小Q', desc: '每场战斗开始时获得 4 点格挡。', price: 110, img: 'xiaoq' },
    chicken_bucket: { name: '香香鸡全家桶', desc: '战斗胜利后回复 2 点精力。', price: 130, img: 'taer' },
    sword_hilt: { name: '黑暗剑柄', desc: 'BOSS 战中力量 +2。', price: 150, img: 'jihuang' },
    ear_charm: { name: '耳鸣星护符', desc: '每场战斗一次，致命伤害会保留 1 点精力。', price: 170, img: 'taer' },
    noodle_god: { name: '小面仙人', desc: '卡牌的回复效果 +2。', price: 140, img: 'shengfan' },
    badge: { name: '猛男寨徽章', desc: '每场战斗开始力量 +1。', price: 160, img: 'xiaoq' },
    cyberdesk: { name: '赛博工位', desc: '每回合打出的第一张攻击牌费用 -1。', price: 150, img: 'jihuang' },
    keyboard_rel: { name: '键盘', desc: '攻击牌每段伤害 +1。', price: 140, img: 'jihuang' },
    mousepad: { name: '鼠标垫', desc: '技能牌获得的格挡 +2。', price: 130, img: 'xiaoq' },
    pegboard: { name: '洞洞板', desc: '每场战斗的第一回合多抽 1 张牌。', price: 120, img: 'taer' },
    sword_tassel: { name: '黑暗剑穗', desc: '对精英和 BOSS 造成的伤害 +2。', price: 160, img: 'kenni' },
    tarot_rel: { name: '獭罗牌', desc: '每场战斗的第一回合能量 +1。', price: 150, img: 'taer' }
  };

  /* ---------------- 事件 ----------------
   * options: { text, effect: 引擎事件效果标识, gold: 可选花费 }
   */
  var events = {
    shop_event: {
      name: '秦国小卖铺', img: 'shuanglaoya',
      text: '路过熟悉的秦国小卖铺，老板热情招呼：「香香鸡，香喷喷的香香鸡，25 金币一只！」',
      options: [
        { text: '花 25 金币买一只香香鸡（获得卡牌「香香鸡」）', effect: 'buyChicken', gold: 25 },
        { text: '离开', effect: 'leave' }
      ]
    },
    ear_call: {
      name: '耳鸣星来电', img: 'taer',
      text: '手机震动，是耳鸣星打来的电话。响个不停，整个办公室都听得见。',
      options: [
        { text: '「我在我在」（回复 10 点精力）', effect: 'heal10' },
        { text: '挂断后继续摸鱼（获得 1 张随机牌）', effect: 'randomCard' }
      ]
    },
    studio: {
      name: '赛博演播室', img: 'jihuang',
      text: '误入一间赛博演播室，导播说可以免费帮你「包装」一下。',
      options: [
        { text: '升级随机 2 张牌', effect: 'upgrade2' },
        { text: '变换 1 张随机牌', effect: 'transform1' }
      ]
    },
    slogan: {
      name: '摸鱼禁止标语', img: 'kenni',
      text: '墙上贴着鲜红的标语：「摸鱼禁止！」盯着看它让你的良心隐隐作痛。',
      options: [
        { text: '撕下标语（失去 5 点精力，获得 1 张稀有牌）', effect: 'lose5getRare' },
        { text: '假装没看见，离开', effect: 'leave' }
      ]
    },
    gossip: {
      name: '茶水间八卦', img: 'taer',
      text: '茶水间里同事正在聊八卦，你也凑了过去。',
      options: [
        { text: '吐槽老板（免费移除 1 张牌）', effect: 'removeCard' },
        { text: '交换摸鱼心得（获得 1 张随机牌）', effect: 'randomCard' }
      ]
    },
    noodles: {
      name: '楼下重庆小面', img: 'shengfan',
      text: '楼下的重庆小面香味飘了上来，老板问你：「加不加辣？」',
      options: [
        { text: '来一碗（回复 12 点精力）', effect: 'heal12' },
        { text: '加辣加蛋（最大精力 +4）', effect: 'maxHp4' }
      ]
    },
    gameexpo: {
      name: '核聚变游戏展', img: 'jihuang',
      text: '公司楼下居然在办核聚变游戏展！排队的人流里全是熟悉的面孔。',
      options: [
        { text: '试玩新游（获得 1 张随机罕见牌）', effect: 'randomUncommon' },
        { text: '买限定周边（花 30 金币获得随机遗物）', effect: 'buyRelic', gold: 30 }
      ]
    },
    netbar: {
      name: '楼下网吧', img: 'jihuang',
      text: '楼下网吧的招牌闪着RGB灯光，网管朝你招手：「包时特惠！」',
      options: [
        { text: '开黑一局（回复 6 点精力，获得 1 张随机牌）', effect: 'heal6randomCard' },
        { text: '通宵上分（失去 4 点精力，升级随机 2 张牌）', effect: 'lose4upgrade2' }
      ]
    },
    takeout: {
      name: '外卖到了', img: 'shengfan',
      text: '外卖小哥打电话：「您的外卖到了，放前台了。」全楼层都闻到了香味。',
      options: [
        { text: '奶茶拼单（回复 8 点精力）', effect: 'heal8' },
        { text: '加份香香鸡（获得卡牌「香香鸡」）', effect: 'getChicken' }
      ]
    },
    bosspatrol: {
      name: '老板巡视', img: 'kenni',
      text: '老板突然从背后走过！你的屏幕上还开着游戏……',
      options: [
        { text: '瞬间装忙（无事发生）', effect: 'nothing' },
        { text: '硬刚到底（失去 5 点精力，获得 1 张随机攻击牌）', effect: 'lose5getAttack' }
      ]
    }
  };

  /* ---------------- 楼层配置（10 层） ---------------- */
  var acts = [
    { act: 1, name: '一楼·工位区', pool: ['group_at', 'punchclock', 'tempneed'], boss: 'boss1' },
    { act: 2, name: '二楼·会议室', pool: ['weeklyrep', 'reqchange', 'tempmeeting'], boss: 'boss_pm' },
    { act: 3, name: '三楼·茶水间', pool: ['milktea', 'gossip_squad', 'microwave'], boss: 'boss_admin' },
    { act: 4, name: '四楼·财务部', pool: ['reimb', 'invoice', 'budget'], boss: 'boss_fin' },
    { act: 5, name: '五楼·服务器机房', pool: ['downtime', 'incident', 'logerr'], boss: 'boss_tech' },
    { act: 6, name: '六楼·市场部', pool: ['kpicurve', 'client', 'plan18'], boss: 'boss_mkt' },
    { act: 7, name: '七楼·人力资源部', pool: ['spotcheck', 'teambuild', 'optlist'], boss: 'boss2' },
    { act: 8, name: '八楼·高管层', pool: ['align', 'loopfu', 'grabcombo'], boss: 'boss_vp' },
    { act: 9, name: '九楼·董事长套间', pool: ['ipo', 'gamble', 'spy'], boss: 'boss_sec' },
    { act: 10, name: '十楼·天台', pool: ['assistant', 'fengshui', 'driver'], boss: 'boss3' }
  ];
  var elites = ['overtime', 'bigsmall', 'eliminate', 'defense'];
  var STEPS_PER_ACT = 5;
  var TOTAL_ACTS = acts.length;

  // 节点类型权重：小怪 / 精英 / 事件 / 商店 / 休息
  var NODE_WEIGHTS = [
    { type: 'monster', w: 45 },
    { type: 'event', w: 20 },
    { type: 'shop', w: 12 },
    { type: 'rest', w: 10 },
    { type: 'elite', w: 13 }
  ];
  var NODE_NAMES = {
    monster: '小怪', elite: '精英', event: '事件', shop: '秦国小卖铺', rest: '茶水间', boss: 'BOSS'
  };

  g.GameData = {
    KEYWORDS: KEYWORDS,
    EFFECT_OPS: EFFECT_OPS,
    cards: cards,
    characters: characters,
    enemies: enemies,
    relics: relics,
    events: events,
    acts: acts,
    elites: elites,
    STEPS_PER_ACT: STEPS_PER_ACT,
    TOTAL_ACTS: TOTAL_ACTS,
    NODE_WEIGHTS: NODE_WEIGHTS,
    NODE_NAMES: NODE_NAMES
  };
})(typeof window !== 'undefined' ? window : globalThis);
