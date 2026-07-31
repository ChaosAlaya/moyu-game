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
    'strength', 'selfDamage', 'skipEnemy', 'power', 'special', 'goldDamage',
    'maxHpUp', 'gainGold', 'loseGold', 'rerollIntent'
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
      desc: '造成 2 点伤害，获得 4 点格挡。',
      tags: ["block"],
      effects: [{ op: 'damage', value: 2 }, { op: 'block', value: 4 }],
      up: { desc: '造成 3 点伤害，获得 6 点格挡。',
        effects: [{ op: 'damage', value: 3 }, { op: 'block', value: 6 }] }
    },
    keyboard: {
      name: '键盘连击', cost: 1, type: 'attack', rarity: 'common',
      desc: '造成 3 点伤害 2 次。',
      effects: [{ op: 'damage', value: 3, times: 2 }],
      up: { desc: '造成 5 点伤害 2 次。',
        effects: [{ op: 'damage', value: 5, times: 2 }] }
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
      desc: '造成 5 点伤害，本场战斗每打出过 1 张攻击牌 +1。',
      tags: ["grow"],
      effects: [{ op: 'special', kind: 'rua', base: 5, per: 1 }],
      up: { desc: '造成 7 点伤害，本场战斗每打出过 1 张攻击牌 +2。',
        effects: [{ op: 'special', kind: 'rua', base: 7, per: 2 }] }
    },
    darksword: {
      name: '黑暗之剑', cost: 2, type: 'attack', rarity: 'uncommon',
      desc: '造成 8 点伤害，本场战斗每打出过一次此牌 +2。',
      tags: ["grow"],
      effects: [{ op: 'special', kind: 'darksword', base: 8, per: 2 }],
      up: { desc: '造成 10 点伤害，本场战斗每打出过一次此牌 +2。',
        effects: [{ op: 'special', kind: 'darksword', base: 10, per: 2 }] }
    },
    sword22: {
      name: '不存在的22剑', cost: 1, type: 'attack', rarity: 'rare',
      desc: '造成 2 点伤害 2 次。它真的存在了！',
      flavor: '它真的存在了！',
      effects: [{ op: 'damage', value: 2, times: 2 }],
      up: { cost: 3, desc: '造成 1 点伤害 22 次。它真的存在了！',
        effects: [{ op: 'damage', value: 1, times: 22 }] }
    },
    pie: {
      name: '老板画的饼', cost: 0, type: 'attack', rarity: 'rare',
      desc: '造成 2 点伤害，抽 1 张牌。',
      tags: ["draw"],
      effects: [{ op: 'damage', value: 2 }, { op: 'draw', value: 1 }],
      up: { cost: 1, desc: '造成 2 点伤害，抽 2 张牌。',
        effects: [{ op: 'damage', value: 2 }, { op: 'draw', value: 2 }] }
    },
    yiti: {
      name: '议题', cost: 1, type: 'skill', rarity: 'common', noReward: true,
      desc: '会议室秘书长塞进来的废牌，没有任何效果。',
      effects: []
    },
    weekly: {
      name: '周报轰炸', cost: 2, type: 'attack', rarity: 'uncommon',
      desc: '造成 12 点伤害。',
      effects: [{ op: 'damage', value: 12 }],
      up: { desc: '造成 18 点伤害。', effects: [{ op: 'damage', value: 18 }] }
    },
    breakdown: {
      name: '深夜破防', cost: 1, type: 'attack', rarity: 'uncommon',
      desc: '造成等同于你本场战斗已损失精力 30% 的伤害（最低 4）。',
      tags: ["selfhp"],
      effects: [{ op: 'special', kind: 'breakdown', pct: 0.3, min: 4 }],
      up: { desc: '造成等同于你本场战斗已损失精力 40% 的伤害（最低 6）。',
        effects: [{ op: 'special', kind: 'breakdown', pct: 0.4, min: 6 }] }
    },
    shuangdao: {
      name: '爽到', cost: 1, type: 'attack', rarity: 'uncommon',
      desc: '造成 6 点伤害；若敌人意图不是攻击，+4。',
      effects: [{ op: 'special', kind: 'shuangdao', base: 6, bonus: 4 }],
      up: { desc: '造成 9 点伤害；若敌人意图不是攻击，+6。',
        effects: [{ op: 'special', kind: 'shuangdao', base: 9, bonus: 6 }] }
    },
    ultimate: {
      name: '终极摸鱼', cost: 3, type: 'attack', rarity: 'rare',
      desc: '造成 18 点伤害，获得 8 点格挡。',
      tags: ["block"],
      effects: [{ op: 'damage', value: 18 }, { op: 'block', value: 8 }],
      up: { desc: '造成 24 点伤害，获得 12 点格挡。',
        effects: [{ op: 'damage', value: 24 }, { op: 'block', value: 12 }] }
    },

    /* ---- 技能 ---- */
    defend_moyu: {
      name: '摸鱼', cost: 1, type: 'skill', rarity: 'common',
      desc: '获得 5 点格挡。',
      tags: ["block"],
      effects: [{ op: 'block', value: 5 }],
      up: { desc: '获得 8 点格挡。', effects: [{ op: 'block', value: 8 }] }
    },
    fakebusy: {
      name: '装忙', cost: 2, type: 'skill', rarity: 'common',
      desc: '获得 10 点格挡。',
      tags: ["block"],
      effects: [{ op: 'block', value: 10 }],
      up: { desc: '获得 15 点格挡。', effects: [{ op: 'block', value: 15 }] }
    },
    spiritwin: {
      name: '精神胜利法', cost: 1, type: 'skill', rarity: 'common',
      desc: '获得 3 点格挡，抽 1 张牌。',
      tags: ["draw"],
      effects: [{ op: 'block', value: 3 }, { op: 'draw', value: 1 }],
      up: { desc: '获得 4 点格挡，抽 2 张牌。',
        effects: [{ op: 'block', value: 4 }, { op: 'draw', value: 2 }] }
    },
    paidpoop: {
      name: '带薪拉屎', cost: 1, type: 'skill', rarity: 'common',
      desc: '获得 3 点格挡，回复 2 点精力。',
      tags: ["heal"],
      effects: [{ op: 'block', value: 3 }, { op: 'heal', value: 2 }],
      up: { desc: '获得 4 点格挡，回复 3 点精力。',
        effects: [{ op: 'block', value: 4 }, { op: 'heal', value: 3 }] }
    },
    latenight: {
      name: '深夜外卖', cost: 1, type: 'skill', rarity: 'common',
      desc: '回复 3 点精力，抽 1 张牌。',
      tags: ["heal"],
      effects: [{ op: 'heal', value: 3 }, { op: 'draw', value: 1 }],
      up: { desc: '回复 4 点精力，抽 2 张牌。',
        effects: [{ op: 'heal', value: 4 }, { op: 'draw', value: 2 }] }
    },
    stealth: {
      name: '隐身术', cost: 2, type: 'skill', rarity: 'uncommon',
      desc: '获得 12 点格挡。',
      tags: ["block"],
      effects: [{ op: 'block', value: 12 }],
      up: { desc: '获得 16 点格挡。', effects: [{ op: 'block', value: 16 }] }
    },
    vacation: {
      name: '带薪年假', cost: 2, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 8 点精力，获得 4 点格挡。消耗。',
      tags: ["heal"],
      effects: [{ op: 'heal', value: 8 }, { op: 'block', value: 4 }],
      up: { desc: '回复 11 点精力，获得 6 点格挡。消耗。',
        effects: [{ op: 'heal', value: 11 }, { op: 'block', value: 6 }] }
    },
    chicken: {
      name: '香香鸡', cost: 1, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 5 点精力。消耗。',
      tags: ["heal"],
      effects: [{ op: 'heal', value: 5 }],
      up: { desc: '回复 7 点精力。消耗。', effects: [{ op: 'heal', value: 7 }] }
    },
    chicken_bucket_card: {
      name: '香香鸡全家桶', cost: 2, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 8 点精力。消耗。',
      tags: ["heal"],
      effects: [{ op: 'heal', value: 8 }],
      up: { desc: '回复 11 点精力。消耗。',
        effects: [{ op: 'heal', value: 11 }] }
    },
    noodle: {
      name: '重庆小面', cost: 1, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '回复 3 点精力。消耗。',
      tags: ["heal"],
      effects: [{ op: 'heal', value: 3 }],
      up: { desc: '回复 5 点精力。消耗。', effects: [{ op: 'heal', value: 5 }] }
    },
    tarot: {
      name: '獭罗牌占卜', cost: 0, type: 'skill', rarity: 'rare',
      desc: '抽 1 张牌；若敌人意图是攻击，获得 4 点格挡。',
      tags: ["block"],
      effects: [{ op: 'special', kind: 'tarot', draw: 1, blk: 4 }],
      up: { desc: '抽 2 张牌；若敌人意图是攻击，获得 6 点格挡。',
        effects: [{ op: 'special', kind: 'tarot', draw: 2, blk: 6 }] }
    },
    bigbook: {
      name: '大书库', cost: 2, type: 'skill', rarity: 'uncommon',
      desc: '抽 3 张牌。',
      tags: ["draw"],
      effects: [{ op: 'draw', value: 3 }],
      up: { desc: '抽 5 张牌。', effects: [{ op: 'draw', value: 5 }] }
    },
    quantum: {
      name: '量子波动速读', cost: 0, type: 'skill', rarity: 'rare',
      exhaust: true,
      desc: '抽 1 张牌。消耗。',
      tags: ["draw"],
      effects: [{ op: 'draw', value: 1 }],
      up: { desc: '抽 2 张牌。消耗。', effects: [{ op: 'draw', value: 2 }] }
    },
    playdead: {
      name: '装死', cost: 2, type: 'skill', rarity: 'uncommon',
      exhaust: true,
      desc: '获得 14 点格挡。消耗。',
      tags: ["block"],
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
      name: '咖啡因续命', cost: 0, type: 'skill', rarity: 'rare',
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
      name: '摸鱼禁止', cost: 3, type: 'skill', rarity: 'rare',
      exhaust: true,
      desc: '敌人跳过下一次行动。消耗。',
      effects: [{ op: 'skipEnemy', value: 1 }],
      up: { cost: 2, desc: '敌人跳过下一次行动。消耗。',
        effects: [{ op: 'skipEnemy', value: 1 }] }
    },
    interrupt: {
      name: '临时通知', cost: 1, type: 'skill', rarity: 'uncommon',
      desc: '打断敌人当前意图，重新随机一个行动。',
      effects: [{ op: 'rerollIntent' }],
      up: { desc: '打断敌人当前意图，重新随机一个行动；抽 1 张牌。',
        effects: [{ op: 'rerollIntent' }, { op: 'draw', value: 1 }] }
    },
    assemble: {
      name: '猛男寨集结', cost: 2, type: 'skill', rarity: 'rare',
      exhaust: true,
      desc: '力量 +2，抽 2 张牌。消耗。',
      tags: ["grow"],
      effects: [{ op: 'strength', value: 2 }, { op: 'draw', value: 2 }],
      up: { desc: '力量 +3，抽 2 张牌。消耗。',
        effects: [{ op: 'strength', value: 3 }, { op: 'draw', value: 2 }] }
    },

    /* ---- 能力 ---- */
    scarf_power: {
      name: '红围巾', cost: 2, type: 'power', rarity: 'uncommon',
      desc: '每回合开始时获得 3 点格挡，消耗。',
      tags: ["block"],
      effects: [{ op: 'power', id: 'scarf_power', value: 3 }],
      up: { desc: '每回合开始时获得 4 点格挡，消耗。',
        effects: [{ op: 'power', id: 'scarf_power', value: 4 }] }
    },
    guide: {
      name: '机皇的攻略', cost: 1, type: 'power', rarity: 'uncommon',
      desc: '力量 +1，消耗。',
      effects: [{ op: 'strength', value: 1 }],
      up: { desc: '力量 +2，消耗。', effects: [{ op: 'strength', value: 2 }] }
    },
    leftover_shield: {
      name: '剩饭护体', cost: 1, type: 'power', rarity: 'uncommon',
      desc: '每次被攻击时反弹 3 点伤害，消耗。',
      tags: ["block"],
      effects: [{ op: 'power', id: 'leftover_shield', value: 3 }],
      up: { desc: '每次被攻击时反弹 4 点伤害，消耗。',
        effects: [{ op: 'power', id: 'leftover_shield', value: 4 }] }
    },
    realm: {
      name: '摸鱼境界', cost: 2, type: 'power', rarity: 'rare',
      desc: '每打出 4 张牌后，抽 1 张牌，消耗。',
      effects: [{ op: 'power', id: 'realm', value: 4 }],
      up: { cost: 1, desc: '每打出 3 张牌后，抽 1 张牌，消耗。',
        effects: [{ op: 'power', id: 'realm', value: 3 }] }
    },
    rebound: {
      name: '反弹式离职', cost: 2, type: 'power', rarity: 'rare',
      desc: '每次被攻击反弹 4 点伤害；每回合开始获得 2 点格挡，消耗。',
      tags: ["block"],
      effects: [{ op: 'power', id: 'leftover_shield', value: 4 },
        { op: 'power', id: 'scarf_power', value: 2 }],
      up: { desc: '每次被攻击反弹 5 点伤害；每回合开始获得 3 点格挡，消耗。',
        effects: [{ op: 'power', id: 'leftover_shield', value: 5 },
          { op: 'power', id: 'scarf_power', value: 3 }] }
    },
    master: {
      name: '摸鱼宗师', cost: 3, type: 'power', rarity: 'rare',
      desc: '力量 +1；每回合开始获得 4 点格挡，消耗。',
      tags: ["grow"],
      effects: [{ op: 'strength', value: 1 },
        { op: 'power', id: 'scarf_power', value: 4 }],
      up: { desc: '力量 +1；每回合开始获得 6 点格挡，消耗。',
        effects: [{ op: 'strength', value: 1 },
          { op: 'power', id: 'scarf_power', value: 6 }] }
    },

    /* ---- 角色专属 ---- */
    ganfan: {
      name: '干饭', cost: 1, type: 'skill', rarity: 'common', char: 'shengfan',
      desc: '回复 2 点精力，获得 4 点格挡。',
      tags: ["heal"],
      effects: [{ op: 'heal', value: 2 }, { op: 'block', value: 4 }],
      up: { desc: '回复 3 点精力，获得 6 点格挡。',
        effects: [{ op: 'heal', value: 3 }, { op: 'block', value: 6 }] }
    },
    stockpile: {
      name: '囤粮', cost: 1, type: 'skill', rarity: 'common', char: 'shengfan',
      exhaust: true,
      desc: '最大精力 +4（永久有效）。消耗。',
      tags: ["selfhp"],
      effects: [{ op: 'maxHpUp', value: 4 }],
      up: { desc: '最大精力 +6（永久有效）。消耗。', effects: [{ op: 'maxHpUp', value: 6 }] }
    },
    feast: {
      name: '满汉全席', cost: 2, type: 'skill', rarity: 'uncommon', char: 'shengfan',
      exhaust: true,
      desc: '最大精力 +6 并回复 6 点精力。消耗。',
      tags: ["heal"],
      effects: [{ op: 'maxHpUp', value: 6 }, { op: 'heal', value: 6 }],
      up: { desc: '最大精力 +9 并回复 9 点精力。消耗。',
        effects: [{ op: 'maxHpUp', value: 9 }, { op: 'heal', value: 9 }] }
    },
    twicecooked: {
      name: '回锅肉', cost: 1, type: 'skill', rarity: 'common', char: 'shengfan',
      exhaust: true,
      desc: '回复 4 点精力。最大精力 +4。消耗。',
      tags: ["heal"],
      effects: [{ op: 'maxHpUp', value: 4 }, { op: 'heal', value: 4 }],
      up: { desc: '回复 6 点精力。最大精力 +6。消耗。',
        effects: [{ op: 'maxHpUp', value: 6 }, { op: 'heal', value: 6 }] }
    },
    bpmanage: {
      name: '血压管理', cost: 1, type: 'skill', rarity: 'uncommon', char: 'shengfan',
      desc: '失去 6 点精力，抽 2 张牌。',
      tags: ["selfhp"],
      effects: [{ op: 'selfDamage', value: 6 }, { op: 'draw', value: 2 }],
      up: { desc: '失去 4 点精力，抽 3 张牌。',
        effects: [{ op: 'selfDamage', value: 4 }, { op: 'draw', value: 3 }] }
    },
    hunger: {
      name: '饥饿咆哮', cost: 2, type: 'attack', rarity: 'uncommon', char: 'shengfan',
      desc: '造成本局累计已损失精力 20% 的伤害（最低 8）。',
      tags: ["selfhp"],
      effects: [{ op: 'special', kind: 'hunger', pct: 0.2, min: 8 }],
      up: { desc: '造成本局累计已损失精力 28% 的伤害（最低 10）。',
        effects: [{ op: 'special', kind: 'hunger', pct: 0.28, min: 10 }] }
    },
    holdstill: {
      name: '按兵不动', cost: 1, type: 'skill', rarity: 'common', char: 'jihuang',
      desc: '获得 5 点格挡，抽 1 张牌。',
      tags: ["draw"],
      effects: [{ op: 'block', value: 5 }, { op: 'draw', value: 1 }],
      up: { desc: '获得 8 点格挡，抽 2 张牌。',
        effects: [{ op: 'block', value: 8 }, { op: 'draw', value: 2 }] }
    },
    allout: {
      name: '全力以赴', cost: 2, type: 'attack', rarity: 'uncommon', char: 'jihuang',
      exhaust: true,
      desc: '造成当前手牌数 ×2 的伤害。消耗。',
      effects: [{ op: 'special', kind: 'allout', per: 2 }],
      up: { desc: '造成当前手牌数 ×3 的伤害。消耗。',
        effects: [{ op: 'special', kind: 'allout', per: 3 }] }
    },
    prepare: {
      name: '备战', cost: 0, type: 'skill', rarity: 'uncommon', char: 'jihuang',
      desc: '抽 2 张牌；若本回合只打出过这一张牌，再抽 1 张。',
      tags: ["draw"],
      effects: [{ op: 'special', kind: 'prepare', draw: 2, bonus: 1 }],
      up: { desc: '抽 3 张牌；若本回合只打出过这一张牌，再抽 2 张。',
        effects: [{ op: 'special', kind: 'prepare', draw: 3, bonus: 2 }] }
    },
    capitalop: {
      name: '资本运作', cost: 1, type: 'skill', rarity: 'uncommon', char: 'shuanglaoya',
      exhaust: true,
      desc: '获得 30 金币。消耗。',
      tags: ["gold"],
      effects: [{ op: 'gainGold', value: 30 }],
      up: { desc: '获得 40 金币。消耗。', effects: [{ op: 'gainGold', value: 40 }] }
    },
    spendall: {
      name: '挥金如土', cost: 1, type: 'attack', rarity: 'uncommon', char: 'shuanglaoya',
      desc: '失去当前 10% 金币，造成失去金币 ×1 的伤害。',
      tags: ["gold"],
      effects: [{ op: 'special', kind: 'spendall', pct: 0.1, per: 1 }],
      up: { desc: '失去当前 15% 金币，造成失去金币 ×1.5 的伤害。',
        effects: [{ op: 'special', kind: 'spendall', pct: 0.15, per: 1.5 }] }
    },
    binge: {
      name: '暴食', cost: 2, type: 'attack', rarity: 'uncommon', char: 'shengfan',
      desc: '造成 10 点伤害，自己损失 2 点精力。',
      tags: ["selfhp"],
      effects: [{ op: 'damage', value: 10 }, { op: 'selfDamage', value: 2 }],
      up: { desc: '造成 15 点伤害，自己损失 4 点精力。',
        effects: [{ op: 'damage', value: 15 }, { op: 'selfDamage', value: 4 }] }
    },
    calc: {
      name: '严谨计算', cost: 1, type: 'attack', rarity: 'common', char: 'jihuang',
      desc: '造成 8 点伤害；若敌人意图是攻击，获得 5 点格挡。',
      tags: ["block"],
      effects: [{ op: 'special', kind: 'calc', dmg: 8, blk: 5 }],
      up: { desc: '造成 10 点伤害；若敌人意图是攻击，获得 7 点格挡。',
        effects: [{ op: 'special', kind: 'calc', dmg: 10, blk: 7 }] }
    },
    optimize: {
      name: '链路优化', cost: 1, type: 'skill', rarity: 'common', char: 'jihuang',
      desc: '抽 2 张牌。',
      tags: ["draw"],
      effects: [{ op: 'draw', value: 2 }],
      up: { desc: '抽 3 张牌。', effects: [{ op: 'draw', value: 3 }] }
    },
    money: {
      name: '钞能力', cost: 2, type: 'attack', rarity: 'uncommon', char: 'shuanglaoya',
      desc: '造成 5 点伤害；每有 35 金币，伤害再 +1。',
      tags: ["gold"],
      effects: [{ op: 'goldDamage', value: 5, per: 35, bonus: 1 }],
      up: { desc: '造成 6 点伤害；每有 30 金币，伤害再 +1。',
        effects: [{ op: 'goldDamage', value: 6, per: 30, bonus: 1 }] }
    },
    shades: {
      name: '墨镜威吓', cost: 0, type: 'skill', rarity: 'common', char: 'shuanglaoya',
      desc: '给予敌人 1 回合虚弱和 1 回合易伤。',
      effects: [{ op: 'weak', value: 1 }, { op: 'vulnerable', value: 1 }],
      up: { desc: '给予敌人 2 回合虚弱和 2 回合易伤。',
        effects: [{ op: 'weak', value: 2 }, { op: 'vulnerable', value: 2 }] }
    },

    /* ---- 四角色新专属（0731 新卡设计 16 张） ---- */
    // 小Q：成长加速 / 连击收益
    pawflurry: {
      name: '狗爪乱拍', cost: 0, type: 'attack', rarity: 'common', char: 'xiaoq',
      desc: '造成 1 点伤害 2 次。',
      tags: ["grow"],
      effects: [{ op: 'damage', value: 1, times: 2 }],
      up: { desc: '造成 1 点伤害 3 次。',
        effects: [{ op: 'damage', value: 1, times: 3 }] }
    },
    comborua: {
      name: '连环RUA', cost: 1, type: 'attack', rarity: 'uncommon', char: 'xiaoq',
      desc: '造成 3 点伤害，本回合每打出过 1 张其他牌 +2。',
      tags: ["grow"],
      effects: [{ op: 'special', kind: 'combo', base: 3, per: 2 }],
      up: { desc: '造成 4 点伤害，本回合每打出过 1 张其他牌 +3。',
        effects: [{ op: 'special', kind: 'combo', base: 4, per: 3 }] }
    },
    paidcharge: {
      name: '带薪充电', cost: 1, type: 'skill', rarity: 'uncommon', char: 'xiaoq',
      exhaust: true,
      desc: '获得 1 点能量，抽 1 张牌。消耗。',
      tags: ["draw"],
      effects: [{ op: 'energy', value: 1 }, { op: 'draw', value: 1 }],
      up: { desc: '获得 1 点能量，抽 2 张牌。消耗。',
        effects: [{ op: 'energy', value: 1 }, { op: 'draw', value: 2 }] }
    },
    macho: {
      name: '猛男附体', cost: 2, type: 'power', rarity: 'uncommon', char: 'xiaoq',
      desc: '力量 +1；每回合开始获得 3 点格挡。',
      tags: ["grow", "block"],
      effects: [{ op: 'strength', value: 1 },
        { op: 'power', id: 'scarf_power', value: 3 }],
      up: { desc: '力量 +1；每回合开始获得 5 点格挡。',
        effects: [{ op: 'strength', value: 1 },
          { op: 'power', id: 'scarf_power', value: 5 }] }
    },
    // 剩饭：卖血流（启动/增伤/终结/润滑）
    cardio: {
      name: '空腹有氧', cost: 0, type: 'skill', rarity: 'uncommon', char: 'shengfan',
      exhaust: true,
      desc: '失去 3 点精力，获得 1 点能量，抽 1 张牌。消耗。',
      tags: ["selfhp", "draw"],
      effects: [{ op: 'selfDamage', value: 3 }, { op: 'energy', value: 1 }, { op: 'draw', value: 1 }],
      up: { desc: '失去 2 点精力，获得 1 点能量，抽 1 张牌。消耗。',
        effects: [{ op: 'selfDamage', value: 2 }, { op: 'energy', value: 1 }, { op: 'draw', value: 1 }] }
    },
    hangry: {
      name: '饿红眼', cost: 1, type: 'power', rarity: 'uncommon', char: 'shengfan',
      desc: '失去 3 点精力，力量 +2。',
      tags: ["selfhp", "grow"],
      effects: [{ op: 'selfDamage', value: 3 }, { op: 'strength', value: 2 }],
      up: { desc: '失去 3 点精力，力量 +3。',
        effects: [{ op: 'selfDamage', value: 3 }, { op: 'strength', value: 3 }] }
    },
    burnboats: {
      name: '破釜沉舟', cost: 2, type: 'attack', rarity: 'rare', char: 'shengfan',
      desc: '失去 4 点精力，造成已损失精力 35% 的伤害（最低 10）。',
      tags: ["selfhp"],
      effects: [{ op: 'selfDamage', value: 4 },
        { op: 'special', kind: 'hunger', pct: 0.35, min: 10 }],
      up: { desc: '失去 4 点精力，造成已损失精力 45% 的伤害（最低 13）。',
        effects: [{ op: 'selfDamage', value: 4 },
          { op: 'special', kind: 'hunger', pct: 0.45, min: 13 }] }
    },
    snatch: {
      name: '抢饭', cost: 1, type: 'attack', rarity: 'common', char: 'shengfan',
      desc: '造成 6 点伤害，回复 2 点精力。',
      tags: ["heal"],
      effects: [{ op: 'damage', value: 6 }, { op: 'heal', value: 2 }],
      up: { desc: '造成 7 点伤害，回复 3 点精力。',
        effects: [{ op: 'damage', value: 7 }, { op: 'heal', value: 3 }] }
    },
    // 机皇：手牌数收益 / 弃牌策略互动
    savebackup: {
      name: '备份存档', cost: 2, type: 'skill', rarity: 'uncommon', char: 'jihuang',
      desc: '抽 3 张牌，获得 3 点格挡。',
      tags: ["draw", "block"],
      effects: [{ op: 'draw', value: 3 }, { op: 'block', value: 3 }],
      up: { desc: '抽 4 张牌，获得 4 点格挡。',
        effects: [{ op: 'draw', value: 4 }, { op: 'block', value: 4 }] }
    },
    recyclebin: {
      name: '清空回收站', cost: 1, type: 'skill', rarity: 'uncommon', char: 'jihuang',
      desc: '弃掉所有手牌，抽回相同数量的牌。',
      tags: ["draw"],
      effects: [{ op: 'special', kind: 'discard', bonus: 0 }],
      up: { desc: '弃掉所有手牌，抽回相同数量 +1 的牌。',
        effects: [{ op: 'special', kind: 'discard', bonus: 1 }] }
    },
    ammo: {
      name: '弹药倾泻', cost: 1, type: 'attack', rarity: 'common', char: 'jihuang',
      desc: '造成当前手牌数 ×1 的伤害。',
      tags: ["grow"],
      effects: [{ op: 'special', kind: 'allout', per: 1 }],
      up: { desc: '造成当前手牌数 ×1 +3 的伤害。',
        effects: [{ op: 'special', kind: 'allout', base: 3, per: 1 }] }
    },
    loadstate: {
      name: '读档重来', cost: 1, type: 'skill', rarity: 'rare', char: 'jihuang',
      exhaust: true,
      desc: '获得 2 点能量，抽 1 张牌。消耗。',
      tags: ["draw"],
      effects: [{ op: 'energy', value: 2 }, { op: 'draw', value: 1 }],
      up: { desc: '获得 2 点能量，抽 2 张牌。消耗。',
        effects: [{ op: 'energy', value: 2 }, { op: 'draw', value: 2 }] }
    },
    // 爽老鸭：金币获取 × 消费新组合
    sidejob: {
      name: '副业收入', cost: 1, type: 'skill', rarity: 'common', char: 'shuanglaoya',
      desc: '获得 15 金币，抽 1 张牌。',
      tags: ["gold", "draw"],
      effects: [{ op: 'gainGold', value: 15 }, { op: 'draw', value: 1 }],
      up: { desc: '获得 20 金币，抽 1 张牌。',
        effects: [{ op: 'gainGold', value: 20 }, { op: 'draw', value: 1 }] }
    },
    throwmoney: {
      name: '撒币', cost: 1, type: 'attack', rarity: 'uncommon', char: 'shuanglaoya',
      desc: '失去 10 金币，造成 13 点伤害。',
      tags: ["gold"],
      effects: [{ op: 'loseGold', value: 10 }, { op: 'damage', value: 13 }],
      up: { desc: '失去 10 金币，造成 16 点伤害。',
        effects: [{ op: 'loseGold', value: 10 }, { op: 'damage', value: 16 }] }
    },
    insurance: {
      name: '买平安', cost: 1, type: 'skill', rarity: 'common', char: 'shuanglaoya',
      desc: '失去 5 金币，获得 9 点格挡。',
      tags: ["gold", "block"],
      effects: [{ op: 'loseGold', value: 5 }, { op: 'block', value: 9 }],
      up: { desc: '失去 5 金币，获得 12 点格挡。',
        effects: [{ op: 'loseGold', value: 5 }, { op: 'block', value: 12 }] }
    },
    wealth: {
      name: '财富自由', cost: 2, type: 'power', rarity: 'rare', char: 'shuanglaoya',
      desc: '力量 +1，获得 25 金币。',
      tags: ["gold", "grow"],
      effects: [{ op: 'strength', value: 1 }, { op: 'gainGold', value: 25 }],
      up: { desc: '力量 +1，获得 35 金币。',
        effects: [{ op: 'strength', value: 1 }, { op: 'gainGold', value: 35 }] }
    }
  };

  /* ---------------- 角色 ----------------
   * unlock: 需要通关的层数（0 = 默认解锁） */
  var characters = {
    xiaoq: {
      name: '摸鱼奎恩', title: '摸鱼之道', img: 'xiaoq',
      avatar: 'assets/v2/avatar/xiaoq.jpg',
      maxHp: 80, gold: 99,
      passive: '本场战斗每打出 5 张牌，恢复 1 点能量。',
      passiveId: 'energyCycle',
      unlock: 0,
      deck: ['strike_moyu', 'strike_moyu',
        'defend_moyu', 'defend_moyu', 'defend_moyu',
        'rua', 'rua', 'darksword', 'chicken', 'spiritwin']
    },
    shengfan: {
      name: '北极熊剩饭', title: '干饭人', img: 'shengfan',
      avatar: 'assets/v2/avatar/shengfan.jpg',
      maxHp: 65, gold: 99,
      passive: '每缺少 5 点精力，造成的伤害 +1（最多 +6）。',
      passiveId: 'bloodrage',
      unlock: 2,
      deck: ['strike_moyu', 'strike_moyu', 'strike_moyu',
        'defend_moyu', 'defend_moyu', 'defend_moyu',
        'ganfan', 'ganfan', 'binge', 'stockpile']
    },
    jihuang: {
      name: '企鹅机皇', title: '攻略制定', img: 'jihuang',
      avatar: 'assets/v2/avatar/jihuang.jpg',
      maxHp: 75, gold: 99,
      passive: '打出攻击牌时每有 2 张其他手牌伤害 +1；本回合未打出攻击牌则不弃牌。',
      passiveId: 'strategist',
      unlock: 4,
      deck: ['strike_moyu', 'strike_moyu',
        'defend_moyu', 'defend_moyu',
        'calc', 'calc', 'calc', 'optimize', 'holdstill', 'holdstill']
    },
    shuanglaoya: {
      name: '爽老鸭', title: '财力支柱', img: 'shuanglaoya',
      avatar: 'assets/v2/avatar/shuanglaoya.jpg',
      maxHp: 95, gold: 200,
      passive: '每有 50 金币造成的伤害 +1；商店卡牌商品 +1 格，开战获得 10 金币。',
      passiveId: 'moneyPower',
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
    /* 重设计新卡卡面（cardnew 素材） */
    stockpile: ['assets/v2/card/stockpile.jpg'],
    feast: ['assets/v2/card/feast.jpg'],
    twicecooked: ['assets/v2/card/twicecooked.jpg'],
    bpmanage: ['assets/v2/card/bpmanage.jpg'],
    hunger: ['assets/v2/card/hunger.jpg'],
    holdstill: ['assets/v2/card/holdstill.jpg'],
    allout: ['assets/v2/card/allout.jpg'],
    prepare: ['assets/v2/card/prepare.jpg'],
    capitalop: ['assets/v2/card/capitalop.jpg'],
    spendall: ['assets/v2/card/spendall.jpg'],
    /* 角色专属牌卡面用新头像 */
    scarf_power: ['assets/v2/avatar/xiaoq.jpg', 'contain'],
    guide: ['assets/v2/avatar/jihuang.jpg', 'contain'],
    optimize: ['assets/v2/avatar/jihuang.jpg', 'contain'],
    calc: ['assets/v2/avatar/jihuang.jpg', 'contain'],
    leftover_shield: ['assets/v2/avatar/shengfan.jpg', 'contain'],
    /* 0731 角色专属新卡卡面 */
    pawflurry: ['assets/v2/card/pawflurry.jpg'],
    comborua: ['assets/v2/card/comborua.jpg'],
    paidcharge: ['assets/v2/card/paidcharge.jpg'],
    macho: ['assets/v2/card/macho.jpg'],
    cardio: ['assets/v2/card/cardio.jpg'],
    hangry: ['assets/v2/card/hangry.jpg'],
    burnboats: ['assets/v2/card/burnboats.jpg'],
    snatch: ['assets/v2/card/snatch.jpg'],
    savebackup: ['assets/v2/card/savebackup.jpg'],
    recyclebin: ['assets/v2/card/recyclebin.jpg'],
    ammo: ['assets/v2/card/ammo.jpg'],
    loadstate: ['assets/v2/card/loadstate.jpg'],
    sidejob: ['assets/v2/card/sidejob.jpg'],
    throwmoney: ['assets/v2/card/throwmoney.jpg'],
    insurance: ['assets/v2/card/insurance.jpg'],
    wealth: ['assets/v2/card/wealth.jpg'],
    /* 补充卡面 */
    interrupt: ['assets/v2/card/interrupt.jpg'],
    yiti: ['assets/v2/card/yiti.jpg']
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
      interrupt50: true, // 半血打断：HP 首次跌破 50% 立即免费行动一轮
      moves: [
        { name: '驳回一切', type: 'attack', value: 12, w: 3 },
        { name: '双面账单', type: 'attack', value: 7, times: 2, w: 2 },
        { name: '资金回笼', type: 'heal', value: 10, w: 1 }
      ]
    },
    boss_tech: {
      name: '技术总监·996守护神', hp: 135, act: 5, boss: true, img: 'jihuang', ai: 'loop',
      interrupt50: true, // 半血打断
      moves: [
        { name: '福报洗礼', type: 'attack', value: 8, times: 2 },
        { name: '服务器护盾', type: 'block', value: 10 },
        { name: '上线冲刺', type: 'attack', value: 16 },
        { name: '狼性加持', type: 'buff', strength: 2 }
      ]
    },
    boss_mkt: {
      name: '市场总监', hp: 150, act: 6, boss: true, img: 'shuanglaoya',
      lastStand: true, // 残血不屈：首次致命伤害以 1 HP 存活并立即反击
      moves: [
        { name: '增长黑客', type: 'attack', value: 13, w: 3 },
        { name: '全渠道投放', type: 'attack', value: 8, times: 2, w: 2 },
        { name: '品牌调性', type: 'buff', strength: 2, w: 2 }
      ]
    },
    boss2: {
      name: 'HR·裁员面谈', hp: 165, act: 7, boss: true, img: 'taer',
      lastStand: true, // 残血不屈
      moves: [
        { name: '优化', type: 'attack', value: 26, every: 3 },
        { name: '绩效沟通', type: 'attack', value: 14, w: 1 }
      ]
    },
    boss_vp: {
      name: '副总裁', hp: 180, act: 8, boss: true, img: 'kenni',
      interrupt50: true, // 半血打断
      moves: [
        { name: '降维打击', type: 'attack', value: 15, w: 3 },
        { name: '双管齐下', type: 'attack', value: 10, times: 2, w: 2 },
        { name: '格局打开', type: 'debuff', weak: 1, vulnerable: 1, w: 2 }
      ]
    },
    boss_sec: {
      name: '秘书A先生', hp: 190, act: 9, boss: true, img: 'taer',
      lastStand: true, // 残血不屈
      moves: [
        { name: '传达圣旨', type: 'attack', value: 22, every: 3 },
        { name: '日程碾压', type: 'attack', value: 16, w: 3 },
        { name: '行程保护', type: 'block', value: 12, w: 2 }
      ]
    },
    boss3: {
      name: '摸鱼强总', hp: 200, act: 10, boss: true, img: 'kenni',
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

  /* ---------------- 圣物 ---------------- */
  var relics = {
    scarf_relic: { name: '红围巾', desc: '每场战斗第一次受到的伤害为 0。', price: 150, img: 'xiaoq' },
    glasses: { name: '肯尼的镜片', desc: '预见敌人未来 3 个回合的意图，并识破伪装。', price: 160, img: 'kenni' },
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
    tarot_rel: { name: '獭罗牌', desc: '每场战斗的第一回合能量 +1。', price: 150, img: 'taer' },
    coffee_can: { name: '红罐咖啡', desc: '能量上限 +1（每回合 4 点能量）。', price: 220, img: 'jihuang' }
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
        { text: '买限定周边（花 30 金币获得随机圣物）', effect: 'buyRelic', gold: 30 }
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
    teamvote: {
      name: '团建投票', img: 'taer',
      text: '行政发来团建投票接龙：爬山、聚餐、还是装死请假？全组都在等你这一票。',
      options: [
        { text: '爬山（最大精力 +3）', effect: 'maxHp3' },
        { text: '聚餐（回复 10 点精力）', effect: 'heal10' },
        { text: '请假（失去 5 点精力，获得 1 张随机牌）', effect: 'lose5randomCard' }
      ]
    },
    encourager: {
      name: '程序员鼓励师', img: 'taer',
      text: '公司新请的程序员鼓励师端着咖啡走过来：「看你最近加班辛苦了，需要点什么吗？」',
      options: [
        { text: '来句鼓励（升级随机 1 张牌）', effect: 'upgrade1' },
        { text: '要个拥抱（回复 6 点精力）', effect: 'heal6' }
      ]
    },
    lottery: {
      name: '楼下彩票站', img: 'shuanglaoya',
      text: '楼下彩票站老板热情地招呼：「20 金币一张，头奖 80！搏一搏，单车变摩托？」',
      options: [
        { text: '买一张（20 金币，50% 中 80 金币）', effect: 'lottery', gold: 20 },
        { text: '不买走人', effect: 'leave' }
      ]
    },
    charger: {
      name: '同事借充电器', img: 'kenni',
      text: '隔壁工位的同事探过头：「充电器借我用一下午呗？桌上那包小玩意你随便挑一个当谢礼。」',
      options: [
        { text: '借（失去 15 金币，获得随机圣物）', effect: 'buyRelic15', gold: 15 },
        { text: '不借，离开', effect: 'leave' }
      ]
    },
    senpai: {
      name: '摸鱼前辈的传承', img: 'jihuang',
      text: '即将离职的摸鱼前辈神秘兮兮地递来一个 U 盘：「这是我毕生摸鱼心得，10 金币就卖给你。」',
      options: [
        { text: '接受传承（10 金币，获得 1 张随机稀有牌）', effect: 'buyRare10', gold: 10 },
        { text: '婉拒离开', effect: 'leave' }
      ]
    },
    acremote: {
      name: '空调遥控器', img: 'jihuang',
      text: '全办公室争夺的空调遥控器就躺在无人桌上。拿走它，你就是今天最让人恨的人。',
      options: [
        { text: '抢走（失去 4 点精力，获得卡牌「摸鱼禁止」）', effect: 'lose4getNoding' },
        { text: '冷静离开', effect: 'leave' }
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
  /* 角色卡牌倾向权重（仅影响奖励/商店抽牌出现率，不改变卡池构成） */
  var CHAR_CARD_WEIGHTS = {
    xiaoq: { grow: 2.5, draw: 1.8 },
    shengfan: { heal: 1.7, selfhp: 1.7, block: 1.3 },
    jihuang: { draw: 2.2, block: 1.5 },
    shuanglaoya: { gold: 1.5 }
  };

  // 节点类型权重（随机池）：小怪 / 精英 / 事件；商店/茶水间为骨架固定位，不进随机池
  var NODE_WEIGHTS = [
    { type: 'monster', w: 45 },
    { type: 'event', w: 20 },
    { type: 'elite', w: 13 }
  ];
  // BOSS 前休整位随机池：茶水间 55 / 事件 20 / 商店 15 / 精英 10
  // （摇出商店时占用每层唯一商店名额，商店总数仍恰为 1）
  var PRE_BOSS_WEIGHTS = [
    { type: 'rest', w: 55 },
    { type: 'event', w: 20 },
    { type: 'shop', w: 15 },
    { type: 'elite', w: 10 }
  ];
  var NODE_NAMES = {
    monster: '小怪', elite: '精英', event: '事件', shop: '秦国小卖铺', rest: '茶水间', boss: 'BOSS'
  };

  /* ---------------- Boss Rush：总部连续作战 ----------------
   * 10 场 BOSS 连打（数值按策划案 v5）
   * 特殊招式类型（engine endTurn 处理）：
   *   stealGold: 偷玩家金币（不造成伤害）
   *   perGold: attack 附加属性，伤害 += floor(玩家金币/perGold)（销赃镜像）
   *   costUp: 随机 N 张玩家手牌本场费用 +1
   *   counter: 玩家本回合未造成伤害则打 value，否则打 fallback
   *   passiveStrength / passiveBlock: 敌人每回合开始自动加力量/格挡
   */
  /* Boss Rush 数值：策划案 v5 原始定稿（docs/摸鱼大作战-BossRush策划案.docx §三/§四） */
  var rushBosses = [
    {
      id: 'front', name: '总部前台·微笑杀手', hp: 220, ai: 'loop', mechanic: 'fakeIntent', // 【微笑欺骗】意图可能是假情报
      interrupt50: true, // 防秒杀：半血打断

      moves: [
        { name: '职业微笑', type: 'block', value: 8 },
        { name: '前台问候', type: 'attack', value: 10 },
        { name: '为您预约', type: 'charge' },
        { name: '预约已排满', type: 'attack', value: 18 }
      ]
    },
    {
      id: 'elevator', name: '电梯战神', hp: 260,
      lastStand: true, // 防秒杀：残血不屈
      moves: [
        { name: '急速下坠', type: 'attack', value: 22, every: 3, unblockable: true }, // 【急速下坠】必中重击
        { name: '负重深蹲', type: 'attack', value: 28, w: 2 },
        { name: '关门', type: 'charge', w: 2 }
      ]
    },
    {
      id: 'secretary', name: '会议室秘书长', hp: 300, mechanic: 'junkCard', // 【临时议题】每回合塞废牌
      interrupt50: true, // 防秒杀：半血打断

      moves: [
        { name: '议题发散', type: 'attack', value: 12, w: 3 },
        { name: '主持议程', type: 'buff', strength: 2, w: 2 },
        { name: '延长会议', type: 'heal', value: 15, w: 2 }
      ]
    },
    {
      id: 'thief', name: '神秘偷男', hp: 340, mechanic: 'stealCard', // 【妙手空空】偷手牌，击败归还
      lastStand: true, // 防秒杀：残血不屈（偷男专属，克制囤金流）

      moves: [
        { name: '顺手牵羊', type: 'stealGold', pct: 0.25, min: 15, w: 2 }, // 偷当前金币 25%（保底 15）
        { name: '黑吃黑', type: 'attack', value: 14, w: 3 },
        { name: '销赃', type: 'attack', value: 8, perGold: 50, w: 2 }
      ]
    },
    {
      id: 'findir', name: '财务总监', hp: 390, mechanic: 'budget', // 【预算审核】每回合费用合计≤4
      interrupt50: true, // 防秒杀：半血打断

      moves: [
        { name: '成本核算', type: 'costUp', value: 2, w: 2 },
        { name: '预算收紧', type: 'attack', value: 16, w: 3 },
        { name: '冻结报销', type: 'debuff', weak: 2, w: 2 }
      ]
    },
    {
      id: 'juan', name: '卷王之王', hp: 440, mechanic: 'juanAura', // 【内卷光环】玩家每出1牌力量+1
      lastStand: true, // 防秒杀：残血不屈

      moves: [
        { name: 'KPI 冲刺', type: 'attack', value: 32, every: 4 },
        { name: '凌晨四点', type: 'attack', value: 16, w: 3 }
      ]
    },
    {
      id: 'hrdir', name: '人力总监', hp: 500, mechanic: 'review', // 【绩效考核】每3回合结算
      interrupt50: true, // 防秒杀：半血打断

      moves: [
        { name: '绩效改进计划', type: 'attack', value: 18, w: 3 },
        { name: '微笑面谈', type: 'debuff', weak: 2, vulnerable: 1, w: 2 },
        { name: '最后一杯咖啡', type: 'heal', value: 15, w: 2 }
      ]
    },
    {
      id: 'vp', name: '高级VP', hp: 560, passiveBlock: 12, mechanic: 'mirror', // 【影子决策】复制上回合攻击牌
      lastStand: true, // 防秒杀：残血不屈

      moves: [
        { name: '代理决策', type: 'attack', value: 18, w: 3 },
        { name: '影子护卫', type: 'block', value: 12, w: 2 },
        { name: '秋后算账', type: 'counter', value: 34, fallback: 16, w: 2 }
      ]
    },
    {
      id: 'board', name: '董事会', hp: 550, multi: true, mechanic: 'rotate', // 【轮值主席】非轮值伤害减半
      interrupt50: true, // 防秒杀字段（1vN 集团战跳过不触发，仅为全员对齐）

      members: [
        {
          id: 'b_fin', name: '财务董事', hp: 180,
          moves: [
            { name: '做账', type: 'attack', value: 12, w: 3 },
            { name: '顺手牵羊', type: 'stealGold', value: 10, w: 2 },
            { name: '财报粉饰', type: 'block', value: 8, w: 1 }
          ]
        },
        {
          id: 'b_tech', name: '技术董事', hp: 200,
          moves: [
            { name: '迭代轰炸', type: 'attack', value: 5, times: 3, w: 3 },
            { name: '上线冲刺', type: 'attack', value: 18, w: 2 },
            { name: '架构护盾', type: 'block', value: 12, w: 2 }
          ]
        },
        {
          id: 'b_hr', name: '人力董事', hp: 170,
          moves: [
            { name: '优化', type: 'attack', value: 24, every: 3 },
            { name: '绩效面谈', type: 'debuff', weak: 1, vulnerable: 1, w: 2 },
            { name: '团建回血', type: 'heal', value: 10, w: 1 },
            { name: '例行谈话', type: 'attack', value: 10, w: 2 }
          ]
        }
      ]
    },
    {
      id: 'capital', name: '资本化身', hp: 999, mechanic: 'market', // 【市场波动】P3 牛/熊/平轮换
      lastStand: true, // 防秒杀：残血不屈

      phases: [
        {
          until: 0.66, phaseName: '市场规律',
          moves: [
            { name: '市场规律', type: 'attack', value: 16, strength: 1, w: 1 }
          ]
        },
        {
          until: 0.33, phaseName: '资本的力量',
          moves: [
            { name: '资本的力量', type: 'attack', value: 14, times: 2, strength: 2, w: 1 }
          ]
        },
        {
          until: 0, phaseName: '市场波动',
          moves: [
            { name: '牛市·猛攻', type: 'attack', value: 18, times: 2 },
            { name: '熊市·防御', type: 'block', value: 15 },
            { name: '平市·休整', type: 'heal', value: 15 }
          ]
        }
      ],
      moves: []
    }
  ];

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
    PRE_BOSS_WEIGHTS: PRE_BOSS_WEIGHTS,
    CHAR_CARD_WEIGHTS: CHAR_CARD_WEIGHTS,
    rushBosses: rushBosses,
    NODE_NAMES: NODE_NAMES
  };
})(typeof window !== 'undefined' ? window : globalThis);
