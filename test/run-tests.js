/* 摸鱼大作战 - Node 无头测试（10 层版本）
 * 运行: node game/test/run-tests.js
 * 用 eval 加载 data.js / engine.js（UMD 挂 globalThis） */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
eval(fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'js', 'engine.js'), 'utf8'));

const D = globalThis.GameData;
const { Engine } = globalThis.GameEngine;

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function section(name) { console.log('\n== ' + name + ' =='); }

/* ---------- a) 数据完整性 ---------- */
section('a) 数据完整性');

const CARD_TYPES = ['attack', 'skill', 'power'];
const RARITIES = ['common', 'uncommon', 'rare'];
const SPECIAL_KINDS = ['rua', 'darksword', 'breakdown', 'calc', 'tarot', 'shuangdao'];

let cardCount = 0;
for (const id in D.cards) {
  cardCount++;
  const c = D.cards[id];
  ok(c.name && typeof c.name === 'string', `卡牌 ${id} 有中文名`);
  ok(Number.isInteger(c.cost) && c.cost >= 0, `卡牌 ${id} 费用合法`);
  ok(CARD_TYPES.includes(c.type), `卡牌 ${id} 类型合法`);
  ok(RARITIES.includes(c.rarity), `卡牌 ${id} 稀有度合法`);
  ok(c.desc && typeof c.desc === 'string', `卡牌 ${id} 有描述`);
  ok(Array.isArray(c.effects) && c.effects.length > 0, `卡牌 ${id} 有效果`);
  for (const ef of c.effects) {
    ok(D.EFFECT_OPS.includes(ef.op), `卡牌 ${id} 效果 op "${ef.op}" 合法`);
    if (ef.op === 'special') ok(SPECIAL_KINDS.includes(ef.kind), `卡牌 ${id} special kind "${ef.kind}" 合法`);
    if (ef.op === 'power') ok(!!D.cards[ef.id], `卡牌 ${id} power 引用的牌存在`);
    if (ef.op === 'goldDamage') ok((Number.isInteger(ef.per) && Number.isInteger(ef.bonus)) || (Number.isInteger(ef.gte) && Number.isInteger(ef.bonus)), `卡牌 ${id} goldDamage 参数完整`);
  }
  if (c.up) {
    ok(Array.isArray(c.up.effects) && c.up.effects.length > 0, `卡牌 ${id} 升级版有效果`);
    for (const ef of c.up.effects) ok(D.EFFECT_OPS.includes(ef.op), `卡牌 ${id} 升级效果 op "${ef.op}" 合法`);
    if (c.up.cost !== undefined) ok(Number.isInteger(c.up.cost) && c.up.cost >= 0, `卡牌 ${id} 升级费用合法`);
    ok(typeof c.up.desc === 'string', `卡牌 ${id} 升级版有描述`);
  }
  if (c.char) ok(!!D.characters[c.char], `卡牌 ${id} 专属角色 ${c.char} 存在`);
  if (c.art) {
    ok(typeof c.art === 'string' && fs.existsSync(path.join(root, c.art)), `卡牌 ${id} 卡面图存在: ${c.art}`);
    ok(!c.artFit || ['cover', 'contain'].includes(c.artFit), `卡牌 ${id} artFit 合法`);
  }
}
ok(cardCount >= 40, `卡牌总数 >= 40（实际 ${cardCount}）`);

for (const chId in D.characters) {
  const ch = D.characters[chId];
  ok(ch.deck.length === 10, `角色 ${chId} 初始牌组 10 张（实际 ${ch.deck.length}）`);
  ok(Number.isInteger(ch.maxHp) && ch.maxHp > 0, `角色 ${chId} 精力合法`);
  ok(Number.isInteger(ch.unlock) && ch.unlock >= 0 && ch.unlock < D.TOTAL_ACTS, `角色 ${chId} 解锁层数合法`);
  for (const cid of ch.deck) {
    ok(!!D.cards[cid], `角色 ${chId} 初始牌 ${cid} 存在`);
    if (D.cards[cid] && D.cards[cid].char) ok(D.cards[cid].char === chId, `专属牌 ${cid} 属于 ${chId}`);
  }
}
ok(Object.keys(D.characters).length === 4, '角色共 4 个');
ok(D.characters.shengfan.unlock === 2 && D.characters.jihuang.unlock === 4 && D.characters.shuanglaoya.unlock === 7, '解锁节奏 2/4/7');

const MOVE_TYPES = ['attack', 'block', 'debuff', 'buff', 'charge', 'heal'];
function checkMoves(eid, moves) {
  ok(Array.isArray(moves) && moves.length > 0, `敌人 ${eid} 有招式`);
  for (const mv of moves) {
    ok(MOVE_TYPES.includes(mv.type), `敌人 ${eid} 招式类型 "${mv.type}" 合法`);
    ok(mv.name && typeof mv.name === 'string', `敌人 ${eid} 招式有名`);
    if (mv.type === 'attack') ok(Number.isInteger(mv.value) && mv.value > 0, `敌人 ${eid} 攻击招有伤害值`);
  }
}
for (const eid in D.enemies) {
  const e = D.enemies[eid];
  ok(Number.isInteger(e.hp) && e.hp > 0, `敌人 ${eid} HP 合法`);
  if (e.phases) {
    for (const ph of e.phases) checkMoves(eid, ph.moves);
  } else {
    checkMoves(eid, e.moves);
  }
}
ok(D.acts.length === 10, '共 10 层');
ok(D.TOTAL_ACTS === 10, 'TOTAL_ACTS = 10');
ok(D.STEPS_PER_ACT === 5, '每层 5 步');
for (const actCfg of D.acts) {
  ok(actCfg.pool.length === 3, `Act${actCfg.act} 小怪池 3 个敌人`);
  ok(actCfg.pool.every(id => !!D.enemies[id]), `Act${actCfg.act} 小怪池引用存在`);
  ok(!!D.enemies[actCfg.boss] && D.enemies[actCfg.boss].boss, `Act${actCfg.act} BOSS 存在且标记 boss`);
}
ok(D.elites.length === 4 && D.elites.every(id => !!D.enemies[id] && D.enemies[id].elite), '精英池 4 个且标记 elite');
// 数值曲线抽查
ok(D.enemies.boss3.hp >= 180 && D.enemies.boss3.hp <= 220, `最终 BOSS HP≈200（实际 ${D.enemies.boss3.hp}）`);
ok(D.enemies.driver.hp >= 60, `第 10 层小怪 HP 达标（driver ${D.enemies.driver.hp}）`);

for (const rid in D.relics) {
  const r = D.relics[rid];
  ok(r.name && r.desc && Number.isInteger(r.price), `圣物 ${rid} 结构完整`);
}
ok(Object.keys(D.relics).length >= 18, `圣物 >= 18 个（实际 ${Object.keys(D.relics).length}）`);

const EVENT_EFFECTS = ['leave', 'buyChicken', 'heal10', 'heal12', 'maxHp4', 'randomCard',
  'lose5getRare', 'upgrade2', 'transform1', 'removeCard',
  'nothing', 'randomUncommon', 'buyRelic', 'heal6randomCard', 'lose4upgrade2', 'heal8',
  'getChicken', 'lose5getAttack'];
for (const evid in D.events) {
  const ev = D.events[evid];
  ok(ev.name && ev.text && Array.isArray(ev.options) && ev.options.length >= 2, `事件 ${evid} 结构完整`);
  for (const opt of ev.options) ok(EVENT_EFFECTS.includes(opt.effect), `事件 ${evid} 选项效果 "${opt.effect}" 合法`);
}
ok(Object.keys(D.events).length >= 10, `事件 >= 10 个（实际 ${Object.keys(D.events).length}）`);

/* ---------- 脚本化战斗策略 ---------- */
// 能出攻击就出攻击，否则技能/能力，都不行就结束回合
function scriptedCombat(engine, maxTurns, quiet) {
  const st = engine.state, c = st.combat;
  let turns = 0;
  while (!c.over && turns < maxTurns) {
    let played = true, guard = 0;
    while (played && !c.over && guard < 60) {
      played = false; guard++;
      for (let i = 0; i < c.hand.length; i++) {
        const def = Engine.cardDef(c.hand[i]);
        let cost = def.cost;
        if (def.type === 'skill' && engine.hasRelic('gamepad') && !c.flags.gamepadUsed) cost = Math.max(0, cost - 1);
        if (def.type === 'attack' && engine.hasRelic('cyberdesk') && !c.flags.attackPadUsed) cost = Math.max(0, cost - 1);
        if (cost > c.energy) continue;
        if (def.type !== 'attack' && c.hand.some(h => {
          const d2 = Engine.cardDef(h);
          let c2 = d2.cost;
          if (d2.type === 'skill' && engine.hasRelic('gamepad') && !c.flags.gamepadUsed) c2 = Math.max(0, c2 - 1);
          if (d2.type === 'attack' && engine.hasRelic('cyberdesk') && !c.flags.attackPadUsed) c2 = Math.max(0, c2 - 1);
          return d2.type === 'attack' && c2 <= c.energy;
        })) continue;
        const r = engine.playCard(i);
        if (!quiet) {
          ok(r.ok, '出牌成功');
          ok(c.energy >= 0, '能量不为负');
          ok(c.playerBlock >= 0, '玩家格挡不为负');
          ok(c.enemy.block >= 0, '敌人格挡不为负');
          ok(st.hp >= 0 && st.hp <= st.maxHp, `玩家精力在 [0,${st.maxHp}] 内（${st.hp}）`);
          ok(c.enemy.hp >= 0, '敌人 HP 不为负');
        }
        played = true;
        break;
      }
    }
    if (c.over) break;
    engine.endTurn();
    turns++;
  }
  if (!quiet) ok(c.over, `战斗在 ${maxTurns} 回合内结束（实际 ${turns} 回合）`);
  return c.won;
}

/* ---------- b) 战斗模拟 ---------- */
section('b) 全部敌人各模拟一场');
{
  let allEnded = true, wins = 0;
  const enemyIds = Object.keys(D.enemies);
  for (const eid of enemyIds) {
    const engine = new Engine(12345);
    engine.newRun('xiaoq');
    engine.state.act = D.enemies[eid].act || 5; // 精英按中层缩放
    engine.state.lastNodeType = 'monster';
    engine.startCombat(eid);
    const won = scriptedCombat(engine, 300, true);
    if (!engine.state.combat.over) { allEnded = false; console.error('  ✗ 未结束: ' + eid); }
    if (won) wins++;
  }
  ok(allEnded, `全部 ${enemyIds.length} 个敌人战斗均在有限回合内结束`);
  console.log(`  小Q 对 ${enemyIds.length} 个敌人各打一场：胜 ${wins} 场（冒烟，不要求全胜）`);
}

// 四个角色首回合抽牌/被动
{
  for (const chId of Object.keys(D.characters)) {
    const engine = new Engine(777);
    engine.newRun(chId);
    const goldBefore = engine.state.gold;
    engine.startCombat('group_at');
    const c = engine.state.combat;
    const expectDraw = 5 + (chId === 'xiaoq' ? 2 : 0) + (chId === 'jihuang' ? 1 : 0);
    ok(c.hand.length === expectDraw, `${chId} 首回合抽牌数 = ${expectDraw}（实际 ${c.hand.length}）`);
    ok(c.energy === 4, '首回合能量 4');
    if (chId === 'shuanglaoya') {
      ok(engine.state.gold === goldBefore + 10, '爽老鸭战斗开始 +10 金币');
    }
    scriptedCombat(engine, 300, true);
    ok(engine.state.combat.over, `${chId} 战斗结束`);
  }
  // 爽老鸭商店 4 格
  const e2 = new Engine(1);
  e2.newRun('shuanglaoya');
  const shop = e2._genShop();
  ok(shop.cards.length === 4, '爽老鸭商店卡牌 4 格');
  const e3 = new Engine(1);
  e3.newRun('xiaoq');
  ok(e3._genShop().cards.length === 3, '其他角色商店卡牌 3 格');
}

// 关键词机制验证：力量/虚弱/易伤/消耗
{
  const engine = new Engine(42);
  engine.newRun('xiaoq');
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 300; c.enemy.maxHp = 300;
  c.playerStrength = 2;
  const hpBefore = c.enemy.hp;
  c.hand.unshift({ uid: 9999, id: 'strike_moyu', up: false });
  engine.playCard(0);
  ok(c.enemy.hp === hpBefore - 8, `力量+2 后摸鱼一击打 8（实际 ${hpBefore - c.enemy.hp}）`);

  c.playerWeak = 1; c.energy = 3;
  c.hand.unshift({ uid: 9998, id: 'strike_moyu', up: false });
  const hb2 = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb2 - Math.floor(8 * 0.75), '虚弱使伤害 -25%');

  c.playerWeak = 0; c.enemy.vulnerable = 1; c.energy = 3;
  c.hand.unshift({ uid: 9997, id: 'strike_moyu', up: false });
  const hb3 = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb3 - Math.floor(8 * 1.5), '易伤使受伤 +50%');

  c.energy = 3;
  c.hand.unshift({ uid: 9996, id: 'chicken', up: false });
  engine.playCard(0);
  ok(c.exhausted.some(x => x.uid === 9996), '消耗牌进入消耗堆');
}

// 洗牌重抽验证
{
  const engine = new Engine(9);
  engine.newRun('xiaoq');
  engine.startCombat('tempneed');
  const c = engine.state.combat;
  while (c.drawPile.length) c.discard.push(c.drawPile.pop());
  engine._draw(3);
  ok(c.hand.length === 5 + 2 + 3, '弃牌堆洗牌后可继续抽牌');
}

/* ---------- b2) 新 op / 新卡 / 新圣物 hook ---------- */
section('b2) 新机制数值断言');

// goldDamage（钞能力，每 50 金币 +1）
{
  const engine = new Engine(5);
  engine.newRun('shuanglaoya');
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 300; c.enemy.maxHp = 300;
  st.gold = 120; // floor(120/50)=2 → 12+2=14
  c.hand.unshift({ uid: 1, id: 'money', up: false });
  let hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 14, `钞能力 金币120 打 14（实际 ${hb - c.enemy.hp}）`);
  st.gold = 260; c.energy = 3; // floor(260/50)=5 → 12+5=17
  c.hand.unshift({ uid: 2, id: 'money', up: false });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 17, `钞能力 金币260 打 17（实际 ${hb - c.enemy.hp}）`);
  st.gold = 49; c.energy = 3; // floor(49/50)=0 → 12
  c.hand.unshift({ uid: 3, id: 'money', up: false });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 12, `钞能力 金币49 打 12（实际 ${hb - c.enemy.hp}）`);
  st.gold = 250; c.energy = 3; // 升级版 15+5=20
  c.hand.unshift({ uid: 4, id: 'money', up: true });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 20, `钞能力+ 金币250 打 20（实际 ${hb - c.enemy.hp}）`);
}

// 特殊卡：獭罗牌占卜 / 爽到 / 严谨计算
{
  const engine = new Engine(6);
  engine.newRun('xiaoq');
  engine.startCombat('group_at');
  const c = engine.state.combat;
  c.enemy.hp = 300; c.enemy.maxHp = 300;
  c.enemy.intent = { name: 't', type: 'attack', value: 5 };
  const handN = c.hand.length;
  c.hand.unshift({ uid: 1, id: 'tarot', up: false });
  engine.playCard(0);
  ok(c.playerBlock === 4 && c.hand.length === handN + 1, '獭罗牌：敌意图攻击 → +4 格挡且抽 1');
  c.playerBlock = 0; c.energy = 3;
  let hb = c.enemy.hp;
  c.hand.unshift({ uid: 2, id: 'shuangdao', up: false });
  engine.playCard(0);
  ok(c.enemy.hp === hb - 6, '爽到：敌意图是攻击 → 基础 6');
  c.enemy.intent = { name: 'b', type: 'block', value: 5 }; c.energy = 3;
  hb = c.enemy.hp;
  c.hand.unshift({ uid: 3, id: 'shuangdao', up: false });
  engine.playCard(0);
  ok(c.enemy.hp === hb - 10, '爽到：敌意图非攻击 → 6+4=10');
}

// 圣物 hook：键盘 / 鼠标垫 / 小面仙人 / 徽章 / 赛博工位 / 洞洞板 / 獭罗牌 / 黑暗剑穗
{
  const engine = new Engine(7);
  engine.newRun('xiaoq');
  // 机制测试直接装备全部相关圣物（绕过 4 件上限，仅验证数值 hook）
  engine.state.relics.push('keyboard_rel', 'mousepad', 'noodle_god', 'badge', 'cyberdesk', 'tarot_rel', 'sword_tassel', 'sword_hilt');
  engine.state.equippedRelics.push('keyboard_rel', 'mousepad', 'noodle_god', 'badge', 'cyberdesk', 'tarot_rel', 'sword_tassel', 'sword_hilt');
  engine.startCombat('boss1'); // BOSS 触发剑穗
  const st = engine.state, c = st.combat;
  ok(c.playerStrength === 3, '徽章+1、剑柄+2 → 开战力量 3');
  ok(c.energy === 5, '獭罗牌：首回合能量 5');
  c.enemy.hp = 500; c.enemy.maxHp = 500;
  // 键盘+1、剑穗+2、力量+3 → 6+1+2+3 = 12
  let hb = c.enemy.hp;
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  const r = engine.playCard(0);
  ok(r.ok && c.energy === 5 - 0, '赛博工位：首张攻击牌 0 费');
  ok(c.enemy.hp === hb - 12, `键盘+剑穗+力量 → 打 12（实际 ${hb - c.enemy.hp}）`);
  // 鼠标垫：摸鱼 5+2=7
  c.hand.unshift({ uid: 2, id: 'defend_moyu', up: false });
  engine.playCard(0);
  ok(c.playerBlock === 7, '鼠标垫：技能格挡 +2');
  // 小面仙人：香香鸡 5+2=7
  st.hp = 50;
  c.hand.unshift({ uid: 3, id: 'chicken', up: false });
  engine.playCard(0);
  ok(st.hp === 57, '小面仙人：回复 +2');
}

// 洞洞板：首回合多抽 1
{
  const engine = new Engine(8);
  engine.newRun('shengfan');
  engine.state.relics.push('pegboard');
  engine.state.equippedRelics.push('pegboard');
  engine.startCombat('group_at');
  ok(engine.state.combat.hand.length === 6, '洞洞板：剩饭首回合抽 6');
}

// 圣物装备系统：最多 4 件，背包里的不生效
{
  const engine = new Engine(9);
  engine.newRun('xiaoq');
  const st = engine.state;
  engine.addRelic('keyboard_rel');
  engine.addRelic('mousepad');
  engine.addRelic('noodle_god');
  engine.addRelic('badge');
  ok(st.equippedRelics.length === 4, 'addRelic：前 4 件自动装备');
  engine.addRelic('gamepad');
  ok(st.relics.length === 5 && st.equippedRelics.length === 4, 'addRelic：第 5 件进背包');
  ok(engine.hasRelic('keyboard_rel') && !engine.hasRelic('gamepad'), 'hasRelic：只有已装备的生效');
  ok(!engine.equipRelic('gamepad'), 'equipRelic：装备栏满时失败');
  ok(engine.unequipRelic('badge') && engine.equipRelic('gamepad'), '卸下后可换装');
  ok(!engine.hasRelic('badge') && engine.hasRelic('gamepad'), '换装后生效口径正确');
  ok(!engine.addRelic('gamepad') && st.relics.filter(r => r === 'gamepad').length === 1, 'addRelic：重复获得被拒绝');
}

// 受击数据：逐段格挡吸收 / 红围巾 / 剩饭护体反弹（供 UI 受击特效使用）
{
  const engine = new Engine(12);
  engine.newRun('xiaoq');
  engine.startCombat('group_at');
  const c = engine.state.combat;
  c.enemy.intent = { name: 'a', type: 'attack', value: 8, times: 2 };
  c.playerBlock = 5;
  const r = engine.endTurn();
  ok(r.hits.length === 2 && r.absorbed.length === 2, 'endTurn 返回逐段吸收数组');
  ok(r.absorbed[0] === 5 && r.hits[0] === 3, `首段格挡吸收 5 穿透 3（实际 ${r.absorbed[0]}/${r.hits[0]}）`);
  ok(r.absorbed[1] === 0 && r.hits[1] === 8, '格挡耗尽后次段全额穿透');
  // 红围巾：首次攻击归 0 并标记
  const e2 = new Engine(14);
  e2.newRun('xiaoq');
  e2.state.relics.push('scarf_relic');
  e2.state.equippedRelics.push('scarf_relic');
  e2.startCombat('group_at');
  e2.state.combat.enemy.intent = { name: 'a', type: 'attack', value: 7 };
  const r2 = e2.endTurn();
  ok(r2.scarf === true && r2.hits[0] === 0, '红围巾：首次攻击伤害归 0 且标记 scarf');
  // 剩饭护体：反弹并记录总量
  const e3 = new Engine(15);
  e3.newRun('shengfan');
  e3.startCombat('group_at');
  e3.state.combat.powers.push({ id: 'leftover_shield', value: 3 });
  const eb = e3.state.combat.enemy.hp;
  e3.state.combat.enemy.intent = { name: 'a', type: 'attack', value: 6 };
  const r3 = e3.endTurn();
  ok(r3.reflected === 3 && e3.state.combat.enemy.hp === eb - 3, '剩饭护体：反弹 3 点');
}

// 精英随层缩放
{
  const engine = new Engine(11);
  engine.newRun('xiaoq');
  engine.state.act = 5;
  engine.startCombat('overtime');
  const e = engine.state.combat.enemy;
  ok(e.hp === 48 + 4 * 8, `第 5 层精英 HP = 48+32（实际 ${e.hp}）`);
  ok(e.dmgBonus === 4, '第 5 层精英攻击加成 +4');
}

// 精英 dmgBonus 实际结算进伤害（且随 act 增长）
{
  const dmgs = [];
  [1, 3, 5].forEach(act => {
    const engine = new Engine(100 + act);
    engine.newRun('xiaoq');
    engine.state.act = act;
    engine.startCombat('overtime');
    const st = engine.state, c = st.combat;
    c.enemy.intent = { type: 'attack', name: '测试攻击', value: 6 };
    const hpB = st.hp;
    const r = engine.endTurn();
    const expect = 6 + (act - 1); // 基础 6 + dmgBonus(act-1)
    dmgs.push(r.dmgToPlayer);
    ok(r.dmgToPlayer === expect && st.hp === hpB - expect,
      `第 ${act} 层精英 6 攻实际造成 ${expect} 伤害（实际 ${r.dmgToPlayer}）`);
  });
  ok(dmgs[1] > dmgs[0] && dmgs[2] > dmgs[1], `精英伤害随层数递增（${dmgs.join('→')}）`);
}

// BOSS 阶段切换（摸鱼强总半血进入"都给我加班"）
{
  const engine = new Engine(13);
  engine.newRun('xiaoq');
  engine.startCombat('boss3');
  const c = engine.state.combat;
  c.enemy.hp = 90; // 低于 50%
  engine._checkPhase(c.enemy);
  ok(c.enemy.phase === 1, '摸鱼强总半血进入第二阶段');
  engine._chooseIntent(c.enemy);
  ok(c.enemy.intent && c.enemy.intent.name !== '战略部署', '第二阶段使用新招式');
}

// 新事件效果冒烟
{
  const engine = new Engine(17);
  engine.newRun('xiaoq');
  const st = engine.state;
  st.gold = 50;
  const deckBefore = st.deck.length;
  engine.applyEvent('gameexpo', 0);
  ok(st.deck.length === deckBefore + 1, '核聚变：获得罕见牌');
  const relicBefore = st.relics.length;
  engine.applyEvent('gameexpo', 1);
  ok(st.relics.length === relicBefore + 1 && st.gold === 20, '核聚变：30 金币买圣物');
  const r2 = engine.applyEvent('bosspatrol', 0);
  ok(r2.text.includes('走了'), '老板巡视：装忙无事发生');
  const hpB = st.hp;
  engine.applyEvent('bosspatrol', 1);
  ok(st.hp === hpB - 5 && st.deck.length === deckBefore + 2, '老板巡视：硬刚 -5 精力换攻击牌');
  engine.applyEvent('takeout', 1);
  ok(st.deck.some(cc => cc.id === 'chicken'), '外卖：获得香香鸡');
}

/* ---------- b3) v2 美术资源 / 存档码 / 战绩簿 ---------- */
section('b3) v2 资源 / 存档码 / 战绩簿');
{
  // v2 资源文件存在性
  const v2 = (p) => fs.existsSync(path.join(root, p));
  let missing = 0;
  for (const eid in D.enemies) if (!v2(`assets/v2/enemy/${eid}.jpg`)) { missing++; console.error('  ✗ 缺敌人图', eid); }
  ok(v2('assets/v2/enemy/boss3_p2.jpg'), '摸鱼强总第二阶段图存在');
  for (const rid in D.relics) if (!v2(`assets/v2/relic/${rid}.jpg`)) { missing++; console.error('  ✗ 缺圣物图', rid); }
  for (const evid in D.events) if (!v2(`assets/v2/event/${evid}.jpg`)) { missing++; console.error('  ✗ 缺事件图', evid); }
  for (let a = 1; a <= 10; a++) if (!v2(`assets/v2/banner/act${a}.jpg`)) { missing++; console.error('  ✗ 缺横幅', a); }
  for (const cid in D.characters) {
    const av = D.characters[cid].avatar;
    ok(av && v2(av), `角色 ${cid} 头像存在`);
  }
  ['title_main', 'over_win', 'over_lose', 'cardback'].forEach(u => {
    if (!v2(`assets/v2/ui/${u}.jpg`)) { missing++; console.error('  ✗ 缺 UI 图', u); }
  });
  ['energy', 'gold', 'block', 'intent_attack', 'defend', 'debuff', 'charge', 'heal', 'buff'].forEach(ic => {
    if (!v2(`assets/v2/icon/${ic}.png`)) { missing++; console.error('  ✗ 缺图标', ic); }
  });
  ok(missing === 0, `v2 美术资源齐全（缺失 ${missing}）`);

  // 存档码 round-trip + 坏码容错
  const codec = globalThis.GameEngine.saveCodec;
  const sample = { save: { unlocks: { xiaoq: true }, 备注: '中文内容😀', n: 42 }, sfx: 'off' };
  const code = codec.encode(sample);
  const back = codec.decode(code);
  ok(back && back.save.n === 42 && back.save.备注 === '中文内容😀' && back.sfx === 'off', '存档码 round-trip（含中文/emoji）');
  ok(codec.decode('这不是存档码!!!') === null, '坏码返回 null（不崩）');
  ok(codec.decode('') === null, '空码返回 null');
  ok(codec.decode(Buffer.from('{"v":2,"data":{}}').toString('base64')) === null, '版本不符返回 null');

  // 战绩簿：写入 + 截断 20 条 + 最新在前
  const pushHistory = globalThis.GameEngine.pushHistory;
  const save = { history: [] };
  for (let i = 0; i < 25; i++) {
    pushHistory(save, {
      charId: 'xiaoq', act: (i % 10) + 1, victory: i % 5 === 0,
      combat: { enemy: { name: '敌人' + i } },
      deck: new Array(10 + i % 5), relics: new Array(i % 4)
    });
  }
  ok(save.history.length === 20, `战绩截断为 20 条（实际 ${save.history.length}）`);
  ok(save.history[0].killer === '敌人24', '最新战绩在前');
  ok(save.history[0].deck === 14 && typeof save.history[0].t === 'number', '战绩字段完整');
  ok(save.history[19].act === 6 && save.history[19].victory === true, '最旧战绩正确淘汰');
}

// 红罐咖啡：能量上限 +1
{
  const engine = new Engine(19);
  engine.newRun('xiaoq');
  engine.state.relics.push('coffee_can');
  engine.state.equippedRelics.push('coffee_can');
  engine.startCombat('group_at');
  const c = engine.state.combat;
  ok(c.maxEnergy === 5, '红罐咖啡：maxEnergy=5');
  ok(c.energy === 5, '红罐咖啡：首回合 energy=5');
  c.hand.length = 0;
  engine.endTurn();
  ok(c.over || c.energy === 5, '红罐咖啡：次回合 energy=5');
  // 与獭罗牌叠加：首回合 5+1=6
  const e2 = new Engine(20);
  e2.newRun('xiaoq');
  e2.state.relics.push('coffee_can', 'tarot_rel');
  e2.state.equippedRelics.push('coffee_can', 'tarot_rel');
  e2.startCombat('group_at');
  ok(e2.state.combat.maxEnergy === 5 && e2.state.combat.energy === 6, '咖啡+獭罗牌：首回合 6 能量不冲突');
  // 圣物图存在
  ok(fs.existsSync(path.join(root, 'assets/v2/relic/coffee_can.jpg')), '红罐咖啡圣物图存在');
}

// 逐段伤害 hits[]（打击感动画数据源）
{
  const engine = new Engine(23);
  engine.newRun('xiaoq');
  engine.startCombat('punchclock');
  const c = engine.state.combat;
  c.enemy.hp = 300; c.enemy.maxHp = 300;
  c.hand.unshift({ uid: 1, id: 'keystorm', up: false });
  const r = engine.playCard(0);
  ok(Array.isArray(r.hits) && r.hits.length === 3, `多段攻击 hits[] 长度 3（实际 ${r.hits.length}）`);
  ok(r.hits.every(h => h === 2) && r.dmgToEnemy === 6, '多段每段数值正确');
  c.hand.unshift({ uid: 2, id: 'chicken', up: false });
  engine.state.hp = engine.state.maxHp - 10; // 先扣血避免回复被截断
  const r2 = engine.playCard(0);
  ok(r2.healGained === 5, 'healGained 记录回血量');
  c.hand.length = 0;
  const r3 = engine.endTurn();
  ok(Array.isArray(r3.hits), 'endTurn 返回 hits[]');
  if (r3.dmgToPlayer > 0) ok(r3.attacked === true, '受击时 attacked 标记');
}

// 回血飘字只记实际回复量（满血/截断不虚报）
{
  const engine = new Engine(29);
  engine.newRun('xiaoq');
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 300; c.enemy.maxHp = 300;
  // 满血：香香鸡回 5 全被截断
  c.hand.unshift({ uid: 1, id: 'chicken', up: false });
  const r = engine.playCard(0);
  ok(r.healGained === 0 && st.hp === st.maxHp, `满血时 healGained=0（实际 ${r.healGained}）`);
  // 缺 3 点：只实回 3
  st.hp = st.maxHp - 3;
  c.hand.unshift({ uid: 2, id: 'chicken', up: false });
  const r2 = engine.playCard(0);
  ok(r2.healGained === 3 && st.hp === st.maxHp, `截断后 healGained=3（实际 ${r2.healGained}）`);
}

/* ---------- c) 地图生成 ---------- */
section('c) 地图生成（10 层 × 100 次）');
{
  const VALID = ['monster', 'elite', 'event', 'shop', 'rest', 'boss'];
  let bad = 0;
  for (let act = 1; act <= 10; act++) {
    for (let i = 0; i < 100; i++) {
      const engine = new Engine(i * 1000 + act);
      engine.newRun('xiaoq');
      const map = engine.genMap(act);
      if (map.steps.length !== D.STEPS_PER_ACT) { bad++; continue; }
      const last = map.steps[D.STEPS_PER_ACT - 1];
      if (!(last.length === 1 && last[0].type === 'boss')) bad++;
      for (let s = 0; s < D.STEPS_PER_ACT - 1; s++) {
        const opts = map.steps[s];
        if (opts.length < 2 || opts.length > 3) bad++;
        for (const o of opts) {
          if (!VALID.includes(o.type)) bad++;
          if (s === 0 && o.type === 'elite') bad++;
        }
      }
    }
  }
  ok(bad === 0, `1000 张地图全部合法（异常计数 ${bad}）`);
}

/* ---------- d) 自动完整 run ---------- */
section('d) 自动完整 run × 20 次（零异常）');

// 模拟真人玩家：每次拿到圣物后按战斗价值重排装备栏（战斗向优先，功能向殿后）
const RELIC_PRIORITY = ['coffee_can', 'badge', 'keyboard_rel', 'sword_tassel', 'sword_hilt',
  'doll', 'mousepad', 'pegboard', 'cyberdesk', 'gamepad', 'tarot_rel', 'noodle_god',
  'chicken_bucket', 'scarf_relic', 'ear_charm', 'bowl', 'glasses', 'sunglasses', 'membercard'];
function autoEquip(st) {
  const sorted = st.relics.slice().sort(function (a, b) {
    return RELIC_PRIORITY.indexOf(a) - RELIC_PRIORITY.indexOf(b);
  });
  st.equippedRelics = sorted.slice(0, globalThis.GameEngine.MAX_EQUIPPED_RELICS);
}

function autoRun(engine, quiet) {
  const st = engine.state;
  let stepsGuard = 0;
  while (!st.over && stepsGuard < 200) {
    stepsGuard++;
    const opts = st.map.steps[st.step];
    const node = engine.enterNode(engine.rng.int(opts.length));
    if (node.type === 'monster' || node.type === 'elite' || node.type === 'boss') {
      engine.startCombat(node.enemyId);
      const won = scriptedCombat(engine, 300, quiet);
      if (!engine.state.combat.over) throw new Error('战斗未结束');
      if (!won) break;
      const reward = engine.genReward();
      engine.takeReward(reward);
      if (engine.rng() < 0.8) engine.takeRewardCard(reward, engine.rng.int(3));
      engine.advance();
    } else if (node.type === 'shop') {
      const shop = node.shop;
      for (let i = 0; i < shop.cards.length; i++) engine.shopBuyCard(shop, i);
      for (let i = 0; i < shop.relics.length; i++) engine.shopBuyRelic(shop, i);
      if (engine.rng() < 0.5 && st.deck.length > 1) engine.shopRemoveCard(shop, st.deck[0].uid);
      if (st.gold < 0) throw new Error('金币为负');
      engine.advance();
    } else if (node.type === 'rest') {
      if (engine.rng() < 0.5) engine.restHeal();
      else {
        const up = st.deck.filter(cc => !cc.up);
        if (up.length) engine.restUpgrade(up[0].uid);
      }
      engine.advance();
    } else if (node.type === 'event') {
      const res = engine.applyEvent(node.eventId, engine.rng.int(2));
      if (res.needChoice === 'remove' && st.deck.length > 1) engine.removeCardByUid(st.deck[0].uid);
      engine.advance();
    }
    autoEquip(st);
    if (!(st.hp >= 0 && st.hp <= st.maxHp)) throw new Error('HP 越界: ' + st.hp);
    if (st.gold < 0) throw new Error('金币为负');
    if (st.deck.length < 1) throw new Error('牌组被删空');
  }
  if (!st.over) throw new Error('run 未在 200 步内结束');
  return { victory: st.victory, act: st.act, floorsCleared: st.floorsCleared };
}

{
  let errors = 0, victories = 0;
  const chars = Object.keys(D.characters);
  for (let trial = 0; trial < 20; trial++) {
    try {
      const engine = new Engine(20240000 + trial);
      engine.newRun(chars[trial % chars.length]);
      const r = autoRun(engine, true);
      if (r.victory) victories++;
    } catch (err) {
      errors++;
      console.error(`  ✗ run #${trial} 抛异常: ${err.message}`);
    }
  }
  ok(errors === 0, `20 次完整 run 无异常（胜 ${victories}）`);
}

/* ---------- e) 平衡：50 局胜率统计 ---------- */
section('e) 平衡统计（50 局自动 run）');
{
  let victories = 0, errors = 0, reach8 = 0;
  const actDist = {};
  for (let trial = 0; trial < 50; trial++) {
    try {
      const engine = new Engine(777000 + trial * 13);
      engine.newRun('xiaoq'); // 用默认角色测平衡基线
      const r = autoRun(engine, true);
      if (r.victory) victories++;
      const reached = r.victory ? 10 : r.act;
      actDist[reached] = (actDist[reached] || 0) + 1;
      if (reached >= 8) reach8++;
    } catch (err) {
      errors++;
      console.error(`  ✗ 平衡 run #${trial} 抛异常: ${err.message}`);
    }
  }
  const wr = victories / 50;
  console.log(`  胜率: ${victories}/50 = ${(wr * 100).toFixed(0)}%`);
  console.log(`  到达层数分布: ${Object.keys(actDist).sort((a, b) => a - b).map(a => `第${a}层×${actDist[a]}`).join(' ')}`);
  console.log(`  到达第 8 层及以上: ${reach8} 局`);
  ok(errors === 0, '50 局无异常');
  ok(wr >= 0.15 && wr <= 0.50, `胜率在 15%~50%（实际 ${(wr * 100).toFixed(0)}%）`);
  ok(reach8 >= 2, `至少 2 局到达第 8 层以后（实际 ${reach8}）`);
}

/* ---------- 汇总 ---------- */
console.log(`\n========================================`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
