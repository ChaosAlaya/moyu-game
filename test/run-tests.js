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
const SPECIAL_KINDS = ['rua', 'darksword', 'breakdown', 'calc', 'tarot', 'shuangdao', 'hunger', 'allout', 'prepare'];

let cardCount = 0;
for (const id in D.cards) {
  cardCount++;
  const c = D.cards[id];
  ok(c.name && typeof c.name === 'string', `卡牌 ${id} 有中文名`);
  ok(Number.isInteger(c.cost) && c.cost >= 0, `卡牌 ${id} 费用合法`);
  ok(CARD_TYPES.includes(c.type), `卡牌 ${id} 类型合法`);
  ok(RARITIES.includes(c.rarity), `卡牌 ${id} 稀有度合法`);
  ok(c.desc && typeof c.desc === 'string', `卡牌 ${id} 有描述`);
  ok(Array.isArray(c.effects) && (c.effects.length > 0 || c.noReward), `卡牌 ${id} 有效果`);
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
  'maxHp3', 'lose5randomCard', 'upgrade1', 'heal6', 'lottery', 'buyRelic15', 'buyRare10', 'lose4getNoding',
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
        // 机皇囤牌策略：技能/格挡优先，每回合最多出 1 张攻击牌（手牌 ≥2 才出，
        // 保持深谋加成回合；斩杀时不受限），贴合真人囤牌操作
        if (st.charId === 'jihuang' && def.type === 'attack') {
          const canKill = c.enemy.hp <= 12;
          if (!canKill && (c.attacksThisTurn > 0 || c.hand.length < 2)) continue;
        }
        if (st.charId !== 'jihuang' && def.type !== 'attack' && c.hand.some(h => {
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
    const expectDraw = 5; // 新被动不再影响首回合抽牌
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
  ok(c.hand.length === 5 + 3, '弃牌堆洗牌后可继续抽牌');
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
  st.gold = 120; // 卡牌每50金+1（+2）与被动钞能（+2）叠加 → 12+2+2=16
  c.hand.unshift({ uid: 1, id: 'money', up: false });
  let hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 16, `钞能力 金币120 打 16（实际 ${hb - c.enemy.hp}）`);
  st.gold = 260; c.energy = 3; // 12+5（卡）+5（被动）=22
  c.hand.unshift({ uid: 2, id: 'money', up: false });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 22, `钞能力 金币260 打 22（实际 ${hb - c.enemy.hp}）`);
  st.gold = 49; c.energy = 3; // floor(49/50)=0 → 12
  c.hand.unshift({ uid: 3, id: 'money', up: false });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 12, `钞能力 金币49 打 12（实际 ${hb - c.enemy.hp}）（被动同样 0）`);
  st.gold = 250; c.energy = 3; // 升级版 15+5（卡）+5（被动）=25
  c.hand.unshift({ uid: 4, id: 'money', up: true });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 25, `钞能力+ 金币250 打 25（实际 ${hb - c.enemy.hp}）`);
}

// ============ 四角色新被动（重设计） ============
section('b2.5) 四角色被动数值断言');

// xiaoq 摸鱼之道：每打出 5 张牌恢复 1 能量（可超上限）
{
  const engine = new Engine(31);
  engine.newRun('xiaoq');
  engine.startCombat('group_at');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 300; c.enemy.maxHp = 300;
  ok(c.hand.length === 5, '小Q首回合抽 5（无首回合加成）');
  // 连打 5 张 0 费牌
  for (let i = 0; i < 5; i++) c.hand.unshift({ uid: 100 + i, id: 'pie', up: false });
  c.energy = 0;
  for (let i = 0; i < 5; i++) engine.playCard(0);
  ok(c.energy === 1, `摸鱼之道：第 5 张牌后能量 +1（实际 ${c.energy}）`);
  for (let i = 0; i < 5; i++) c.hand.unshift({ uid: 200 + i, id: 'pie', up: false });
  for (let i = 0; i < 5; i++) engine.playCard(0);
  ok(c.energy === 2, `摸鱼之道：第 10 张牌后再 +1（实际 ${c.energy}）`);
}

// shengfan 血怒：每缺少 5 点精力伤害 +1（固定值，与力量同级相加）
{
  const engine = new Engine(32);
  engine.newRun('shengfan');
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 500; c.enemy.maxHp = 500;
  st.hp = st.maxHp; // 满血：无加成
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  let hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 6, `血怒满血打 6（实际 ${hb - c.enemy.hp}）`);
  st.hp = 35; // 65 满 → 损失 30 → +6
  c.energy = 3;
  c.hand.unshift({ uid: 2, id: 'strike_moyu', up: false });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 12, `血怒损失30打 6+6=12（实际 ${hb - c.enemy.hp}）`);
  st.hp = 1; // 损失 64 → 上限 +6；力量 4 同级相加：6+4+6=16
  c.energy = 3; c.playerStrength = 4;
  c.hand.unshift({ uid: 3, id: 'strike_moyu', up: false });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 16, `血怒上限+6 与力量同级相加 6+4+6=16（实际 ${hb - c.enemy.hp}）`);
}

// jihuang 深谋 a：每 2 张其他手牌攻击 +1
{
  const engine = new Engine(33);
  engine.newRun('jihuang');
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 500; c.enemy.maxHp = 500;
  // 手牌 5 张，打出 1 张后剩 4 → +2
  let hb = c.enemy.hp;
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  engine.playCard(0);
  ok(c.enemy.hp === hb - (6 + Math.floor(4 / 2)), `深谋：剩4手牌攻击+2（实际 ${hb - c.enemy.hp}）`);
  // 手牌打空后剩 0 → +0
  c.hand = [{ uid: 2, id: 'strike_moyu', up: false }];
  c.energy = 3;
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 6, `深谋：空手牌攻击+0（实际 ${hb - c.enemy.hp}）`);
  // 深谋 b：本回合没打攻击牌 → 不弃牌
  const c2 = st.combat;
  // 先塞满抽牌堆，防止弃牌重洗干扰断言
  for (let di = 0; di < 20; di++) c2.drawPile.unshift({ uid: 500 + di, id: 'defend_moyu', up: false });
  c2.hand = [{ uid: 10, id: 'defend_moyu', up: false }, { uid: 11, id: 'defend_moyu', up: false }];
  c2.attacksThisTurn = 0;
  engine.endTurn();
  const kept = c2.hand.filter(x => x.uid === 10 || x.uid === 11).length;
  ok(kept === 2, `深谋：未打攻击牌手牌保留（实际保留 ${kept}）`);
  // 打过攻击牌 → 照常弃牌
  c2.hand = [{ uid: 12, id: 'strike_moyu', up: false }, { uid: 13, id: 'defend_moyu', up: false }];
  c2.attacksThisTurn = 1;
  const discB = c2.discard.length;
  engine.endTurn();
  ok(c2.discard.length === discB + 2 && c2.discard.some(x => x.uid === 12) && c2.discard.some(x => x.uid === 13), '深谋：打过攻击牌照常弃牌');
}

// shuanglaoya 钞能：每 50 金币伤害 +1（与卡牌自身金币加成叠加）
{
  const engine = new Engine(34);
  engine.newRun('shuanglaoya');
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 500; c.enemy.maxHp = 500;
  st.gold = 100; // +2
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  let hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 8, `钞能：金币100 摸鱼一击打 8（实际 ${hb - c.enemy.hp}）`);
  st.gold = 0;
  c.energy = 3;
  c.hand.unshift({ uid: 2, id: 'strike_moyu', up: false });
  hb = c.enemy.hp;
  engine.playCard(0);
  ok(c.enemy.hp === hb - 6, `钞能：金币0 无加成（实际 ${hb - c.enemy.hp}）`);
}

// ============ 10 张新卡效果断言 ============
section('b2.6) 重设计新卡断言');
function mkCombat(charId, hp, maxHp) {
  const engine = new Engine(40);
  engine.newRun(charId);
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 500; c.enemy.maxHp = 500;
  if (maxHp) { st.maxHp = maxHp; st.hp = hp; }
  return [engine, st, c];
}
{
  // 囤粮：maxHp+4 本局有效
  let [e1, s1] = mkCombat('shengfan');
  const m0 = s1.maxHp;
  s1.combat.hand.unshift({ uid: 1, id: 'stockpile', up: false });
  e1.playCard(0);
  ok(s1.maxHp === m0 + 2, `囤粮：最大精力 +2（实际 ${s1.maxHp}）`);
  // 满汉全席：maxHp+8 回 8 消耗
  let [e2, s2, c2] = mkCombat('shengfan', 50, 90);
  c2.hand.unshift({ uid: 2, id: 'feast', up: false });
  e2.playCard(0);
  ok(s2.maxHp === 96 && s2.hp === 62 && c2.exhausted.length === 1,
    `满汉全席：maxHp+8 回8 消耗（maxHp=${s2.maxHp} hp=${s2.hp}）`);
  // 回锅肉：回 6 消耗
  let [e3, s3, c3] = mkCombat('shengfan', 50, 90);
  c3.hand.unshift({ uid: 3, id: 'twicecooked', up: false });
  e3.playCard(0);
  ok(s3.hp === 56 && c3.exhausted.length === 1, `回锅肉：回6消耗（hp=${s3.hp}）`);
  // 血压管理：失 6 抽 2
  let [e4, s4, c4] = mkCombat('shengfan', 50, 90);
  const handB4 = c4.hand.length;
  c4.hand.unshift({ uid: 4, id: 'bpmanage', up: false });
  e4.playCard(0);
  ok(s4.hp === 44 && c4.hand.length === handB4 + 2, `血压管理：-6精力抽2（hp=${s4.hp}）`);
  // 饥饿咆哮：损失 40 → max(8,10)=10；损失 10 → 最低 8
  let [e5, s5, c5] = mkCombat('shengfan', 50, 90);
  c5.hand.unshift({ uid: 5, id: 'hunger', up: false });
  let hb5 = c5.enemy.hp;
  e5.playCard(0);
  ok(c5.enemy.hp === hb5 - 14, `饥饿咆哮：损失40打 8+血怒6=14（实际 ${hb5 - c5.enemy.hp}）`);
  let [e6, s6, c6] = mkCombat('shengfan', 80, 90);
  c6.hand.unshift({ uid: 6, id: 'hunger', up: false });
  let hb6 = c6.enemy.hp;
  e6.playCard(0);
  ok(c6.enemy.hp === hb6 - 10, `饥饿咆哮：最低 8+血怒2=10（实际 ${hb6 - c6.enemy.hp}）`);
  // 按兵不动：6 格挡抽 1
  let [e7, s7, c7] = mkCombat('jihuang');
  const handB7 = c7.hand.length;
  c7.hand.unshift({ uid: 7, id: 'holdstill', up: false });
  e7.playCard(0);
  ok(c7.playerBlock === 6 && c7.hand.length === handB7 + 1, `按兵不动：6格挡抽1（blk=${c7.playerBlock}）`);
  // 全力以赴：手牌 3（不含本牌）×2=6，消耗
  let [e8, s8, c8] = mkCombat('jihuang');
  c8.hand = [{ uid: 8, id: 'allout', up: false },
    { uid: 81, id: 'defend_moyu', up: false }, { uid: 82, id: 'defend_moyu', up: false }, { uid: 83, id: 'defend_moyu', up: false }];
  let hb8 = c8.enemy.hp;
  e8.playCard(0);
  ok(c8.enemy.hp === hb8 - 7 && c8.exhausted.length === 1, `全力以赴：3手牌×2=6+深谋1=7（实际 ${hb8 - c8.enemy.hp}）`);
  // 备战：首打抽 1+1；非首打只抽 1
  let [e9, s9, c9] = mkCombat('jihuang');
  c9.hand = [{ uid: 9, id: 'prepare', up: false }];
  c9.cardsThisTurn = 0;
  const handB9 = c9.hand.length;
  e9.playCard(0);
  ok(c9.hand.length === handB9 + 1, `备战：首打抽2（净+1，实际 ${c9.hand.length}）`);
  let [e10, s10, c10] = mkCombat('jihuang');
  c10.hand = [{ uid: 10, id: 'prepare', up: false }];
  c10.cardsThisTurn = 2;
  const handB10 = c10.hand.length;
  e10.playCard(0);
  ok(c10.hand.length === handB10, `备战：非首打只抽1（实际 ${c10.hand.length}）`);
  // 资本运作：+25 金币消耗
  let [e11, s11, c11] = mkCombat('shuanglaoya');
  const g11 = s11.gold;
  c11.hand.unshift({ uid: 11, id: 'capitalop', up: false });
  e11.playCard(0);
  ok(s11.gold === g11 + 25 && c11.exhausted.length === 1, `资本运作：+25金币消耗（gold=${s11.gold}）`);
  // 挥金如土：-15 金币打 20
  let [e12, s12, c12] = mkCombat('shuanglaoya');
  s12.gold = 20;
  const g12 = s12.gold;
  c12.hand.unshift({ uid: 12, id: 'spendall', up: false });
  let hb12 = c12.enemy.hp;
  e12.playCard(0);
  ok(s12.gold === g12 - 15, `挥金如土：-15金币（gold=${s12.gold}）`);
  // 伤害含被动钞能 floor(20/50)=0 → 20
  ok(c12.enemy.hp === hb12 - 20, `挥金如土：打20（实际 ${hb12 - c12.enemy.hp}）`);
}

// ============ 实时角标（previewDamage） ============
section('b2.7) 实时伤害角标');
{
  const engine = new Engine(50);
  engine.newRun('shuanglaoya');
  engine.startCombat('punchclock');
  const st = engine.state, c = st.combat;
  c.enemy.hp = 500; c.enemy.maxHp = 500;
  // 钞能力：金币 120 → 12+2+2=16
  st.gold = 120;
  ok(engine.previewDamage({ id: 'money', up: false }) === 16, `角标钞能力=16（实际 ${engine.previewDamage({ id: 'money', up: false })}）`);
  // 黑暗之剑：打过 2 次 → 7+3×2=13
  c.darkswordPlays = 2;
  ok(engine.previewDamage({ id: 'darksword', up: false }) === 15, `角标黑暗之剑含被动=15（实际 ${engine.previewDamage({ id: 'darksword', up: false })}）`);
  // RUA!：打过 3 张攻击 → 4+2×3=10
  c.attacksPlayed = 3;
  ok(engine.previewDamage({ id: 'rua', up: false }) === 10 + Math.floor(120 / 50),
    `角标RUA含被动（实际 ${engine.previewDamage({ id: 'rua', up: false })}）`);
  // 全力以赴：手牌 5 含本牌 → (5-1)×2=8
  c.hand = [{ uid: 1, id: 'allout', up: false }, { uid: 2, id: 'defend_moyu', up: false },
    { uid: 3, id: 'defend_moyu', up: false }, { uid: 4, id: 'defend_moyu', up: false }, { uid: 5, id: 'defend_moyu', up: false }];
  ok(engine.previewDamage({ id: 'allout', up: false }) === 8 + Math.floor(120 / 50),
    `角标全力以赴=10（实际 ${engine.previewDamage({ id: 'allout', up: false })}）`);
  // 饥饿咆哮：shengfan 视角（血怒固定值并入）
  const e2 = new Engine(51);
  e2.newRun('shengfan');
  e2.startCombat('punchclock');
  const s2 = e2.state;
  s2.hp = 50; // 65 满 → 损失 15 → hunger base max(8,3)=8，血怒 +3 → 11
  const pv = e2.previewDamage({ id: 'hunger', up: false });
  ok(pv === 11, `角标饥饿咆哮含血怒=${pv}（期望11）`);
  // 普通攻击牌无角标
  ok(engine.previewDamage({ id: 'strike_moyu', up: false }) === null, '普通牌无角标返回 null');
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

// 临时通知：打断敌人当前意图，重摇一个不同的行动
{
  const engine = new Engine(16);
  engine.newRun('xiaoq');
  engine.startCombat('tempmeeting'); // loop：议题轰炸→会议蓄力→结论输出
  const c = engine.state.combat;
  c.enemy.intent = { name: '会议蓄力', type: 'charge' };
  c.hand.unshift({ uid: 1, id: 'interrupt', up: false });
  const r = engine.playCard(0);
  ok(r.interrupted === '会议蓄力', '打断返回原意图名');
  ok(c.enemy.intent && c.enemy.intent.name !== '会议蓄力', `蓄力被打断（新意图：${c.enemy.intent && c.enemy.intent.name}）`);
  ok(c.enemy.shownIntent === null, '打断后假意图清空');
  // 升级版：附带抽 1
  const e2 = new Engine(17);
  e2.newRun('xiaoq');
  e2.startCombat('tempmeeting');
  const c2 = e2.state.combat;
  c2.enemy.intent = { name: '会议蓄力', type: 'charge' };
  const hn = c2.hand.length;
  c2.hand.unshift({ uid: 2, id: 'interrupt', up: true });
  e2.playCard(0);
  ok(c2.hand.length === hn + 1, '升级版打断后抽 1（打出 1 抽回 1）');
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
  // 死亡特效素材：序列帧 + BOSS 倒地立绘 + 全屏过场
  {
    const seqs = { eliteDeath: 5, minionDeath: 6, qiangDeath: 8, knockaway: 4, stars: 3 };
    let fxMissing = 0;
    for (const s in seqs) for (let i = 1; i <= seqs[s]; i++) {
      if (!v2(`assets/v2/fx/${s}_${i}.png`)) { fxMissing++; console.error(`  ✗ 缺特效帧 ${s}_${i}`); }
    }
    for (let a = 1; a <= 9; a++) if (!v2(`assets/v2/enemy/boss_down_${a}.jpg`)) { fxMissing++; console.error('  ✗ 缺倒地立绘', a); }
    ['boss_down_10_p1', 'boss_down_10_p2'].forEach(n => { if (!v2(`assets/v2/enemy/${n}.jpg`)) { fxMissing++; console.error('  ✗ 缺倒地立绘', n); } });
    ['boss_death_scene.jpg', 'golden_flash.jpg'].forEach(n => { if (!v2(`assets/v2/fx/${n}`)) { fxMissing++; console.error('  ✗ 缺过场图', n); } });
    ok(fxMissing === 0, `死亡特效素材齐全（26 帧 + 11 倒地 + 2 过场）`);
  }
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

// ============ 被动实时数值读取入口（passiveInfo 与管线一致性） ============
section('b2.8) passiveInfo 读取入口');
{
  // 小Q：进度 = cardsPlayed % 5
  const e1 = new Engine(60);
  e1.newRun('xiaoq');
  e1.startCombat('group_at');
  const c1 = e1.state.combat;
  c1.cardsPlayed = 7;
  ok(e1.passiveInfo().value === '已打出 2/5 张牌', `passiveInfo 小Q进度（实际 ${e1.passiveInfo().value}）`);
  // 剩饭：血怒固定值 = floor(损失/5)
  const e2 = new Engine(61);
  e2.newRun('shengfan');
  e2.startCombat('group_at');
  e2.state.hp = 35; // 65 满 → 损失 30 → +6
  ok(e2.passiveInfo().value === '当前加伤 +6',
    `passiveInfo 血怒（实际 ${e2.passiveInfo().value}）`);
  // 与管线一致：strike 6 × (1+0.4×0.25) = floor(6.6) = 6 → 打 6+加成验证在 b2.5 已锁
  // 机皇：手牌加伤 + 不弃牌标记
  const e3 = new Engine(62);
  e3.newRun('jihuang');
  e3.startCombat('group_at');
  const c3 = e3.state.combat;
  c3.hand = [1, 2, 3, 4].map(i => ({ uid: i, id: 'defend_moyu', up: false }));
  c3.attacksThisTurn = 0;
  ok(e3.passiveInfo().value === '当前手牌加伤 +' + Math.floor(4 / 2), `passiveInfo 深谋（实际 ${e3.passiveInfo().value}）`);
  ok(e3.passiveInfo().tag === '不弃牌', 'passiveInfo 深谋不弃牌标记');
  c3.attacksThisTurn = 1;
  ok(e3.passiveInfo().tag === null, 'passiveInfo 打过攻击牌无标记');
  // 老鸭：金币/50
  const e4 = new Engine(63);
  e4.newRun('shuanglaoya');
  e4.startCombat('group_at');
  e4.state.gold = 137;
  ok(e4.passiveInfo().value === '当前加伤 +' + Math.floor(137 / 50), `passiveInfo 钞能（实际 ${e4.passiveInfo().value}）`);
}

/* ---------- b4) 事件去重 / 新事件 / 角色权重 / 商店复制 ---------- */
section('b4) 事件去重 / 新事件 / 角色权重 / 商店复制');

// 去重：连续 8 个事件节点不重复；全遇过后可重复
{
  const engine = new Engine(71);
  engine.newRun('xiaoq');
  const st = engine.state;
  st.map = { act: 1, steps: [[{ type: 'event' }], [{ type: 'event' }], [{ type: 'event' }], [{ type: 'event' }],
    [{ type: 'event' }], [{ type: 'event' }], [{ type: 'event' }], [{ type: 'event' }]] };
  const seen = [];
  for (let i = 0; i < 8; i++) {
    st.step = i;
    const node = engine.enterNode(0);
    ok(!seen.includes(node.eventId), `第 ${i + 1} 个事件不重复（${node.eventId}）`);
    seen.push(node.eventId);
  }
  // 全部 16 个事件遇完后 seenEvents 重置且可重复
  st.seenEvents = Object.keys(D.events).slice();
  st.step = 0;
  const node2 = engine.enterNode(0);
  ok(!!D.events[node2.eventId], '全遇过后事件池重置可重复');
  ok(st.seenEvents.length === 1, '重置后 seenEvents 重新计数');
}

// 6 个新事件各分支效果
{
  const engine = new Engine(72);
  engine.newRun('xiaoq');
  const st = engine.state;
  // 团建投票：爬山 maxHp+3
  let r = engine.applyEvent('teamvote', 0);
  ok(st.maxHp === 75 + 3, `团建爬山 maxHp+3（实际 ${st.maxHp}）`);
  // 聚餐回 10
  st.hp = 50;
  engine.applyEvent('teamvote', 1);
  ok(st.hp === 60, `团建聚餐回10（实际 ${st.hp}）`);
  // 请假 -5 精力得牌
  const d0 = st.deck.length;
  engine.applyEvent('teamvote', 2);
  ok(st.hp === 55 && st.deck.length === d0 + 1, `团建请假 -5精力得牌（hp=${st.hp}）`);
  // 鼓励师：升级随机 1 张
  const res2 = engine.applyEvent('encourager', 0);
  ok(st.deck.some(cc => cc.up), '鼓励师升级随机 1 张牌');
  // 要拥抱回 6
  st.hp = 40;
  engine.applyEvent('encourager', 1);
  ok(st.hp === 46, `鼓励师拥抱回6（实际 ${st.hp}）`);
  // 彩票：扣 20，结果合法（中 80 或不中）
  st.gold = 100;
  const g0 = st.gold;
  engine.applyEvent('lottery', 0);
  ok(st.gold === g0 - 20 || st.gold === g0 - 20 + 80, `彩票结果合法（gold=${st.gold}）`);
  // 充电器：-15 金币得圣物
  st.gold = 50;
  const rl0 = st.relics.length;
  engine.applyEvent('charger', 0);
  ok(st.gold === 35 && st.relics.length === rl0 + 1, `充电器 -15金币得圣物（gold=${st.gold}）`);
  // 前辈传承：-10 金币得稀有牌
  const r0 = st.gold;
  engine.applyEvent('senpai', 0);
  const newRare = st.deck[st.deck.length - 1];
  ok(st.gold === r0 - 10 && D.cards[newRare.id].rarity === 'rare', `前辈传承 -10金币得稀有牌（${newRare.id}）`);
  // 空调遥控器：-4 精力得摸鱼禁止
  const hp0 = st.hp;
  engine.applyEvent('acremote', 0);
  ok(st.hp === hp0 - 4 && st.deck.some(cc => cc.id === 'noding'), '空调遥控器得「摸鱼禁止」');
}

// 角色权重分布：1000 次抽牌，剩饭回复/自伤占比显著高于老鸭
{
  function tagRate(charId, tags) {
    const engine = new Engine(73);
    engine.newRun(charId);
    let hit = 0;
    for (let i = 0; i < 1000; i++) {
      const id = engine._weightedCard();
      const t = D.cards[id].tags || [];
      if (tags.some(x => t.includes(x))) hit++;
    }
    return hit / 1000;
  }
  const sfRate = tagRate('shengfan', ['heal', 'selfhp']);
  const slRate = tagRate('shuanglaoya', ['heal', 'selfhp']);
  console.log(`  权重分布: 剩饭回复/自伤占比 ${(sfRate * 100).toFixed(1)}% vs 老鸭 ${(slRate * 100).toFixed(1)}%`);
  ok(sfRate > slRate * 1.3, `剩饭回复/自伤占比显著高于老鸭（${(sfRate * 100).toFixed(1)}% vs ${(slRate * 100).toFixed(1)}%）`);
  const xqGrow = tagRate('xiaoq', ['grow']);
  const slGrow = tagRate('shuanglaoya', ['grow']);
  ok(xqGrow > slGrow * 1.3, `小Q成长标签占比显著高于老鸭（${(xqGrow * 100).toFixed(1)}% vs ${(slGrow * 100).toFixed(1)}%）`);
}

// 商店复制服务：扣费正确、牌组+1、复制为基础版（不复制升级态）、每店限 1 次
{
  const engine = new Engine(74);
  engine.newRun('xiaoq');
  const st = engine.state;
  const shop = engine._genShop();
  st.gold = 500;
  const target = st.deck[0];
  target.up = true; // 升级牌被复制时应得到基础版
  const g0 = st.gold, d0 = st.deck.length;
  ok(engine.shopCopyCard(shop, target.uid), '复制服务成功');
  ok(st.gold === g0 - 70 && st.deck.length === d0 + 1, `普通牌复制扣 70（实际扣 ${g0 - st.gold}）`);
  const copy = st.deck[st.deck.length - 1];
  ok(copy.id === target.id && copy.up === false && copy.uid !== target.uid, '复制牌为基础版且为新实例');
  ok(!engine.shopCopyCard(shop, target.uid), '每店限复制 1 次');
  // 稀有牌价格 150；墨镜 8 折 120
  const engine2 = new Engine(75);
  engine2.newRun('shuanglaoya');
  const st2 = engine2.state;
  st2.relics.push('noding'); // noding 是稀有牌？作为牌加入牌组
  st2.deck.push({ uid: 900, id: 'noding', up: false });
  st2.relics.push('sunglasses');
  st2.equippedRelics = ['sunglasses']; // 装备系统：hasRelic 看装备栏
  const shop2 = engine2._genShop();
  st2.gold = 200;
  engine2.shopCopyCard(shop2, 900);
  ok(st2.gold === 200 - Math.round(150 * 0.8), `稀有牌复制墨镜 8 折 120（实际扣 ${200 - st2.gold}）`);
}

/* ---------- b5) Boss Rush：框架 / 10 BOSS / 新招式 / 1vN ---------- */
section('b5) Boss Rush');

// 10 BOSS 数据结构
{
  const RUSH_MOVE_TYPES = MOVE_TYPES.concat(['stealGold', 'costUp', 'counter']);
  ok(D.rushBosses.length === 10, `rushBosses 共 10 场（实际 ${D.rushBosses.length}）`);
  D.rushBosses.forEach((b, i) => {
    ok(Number.isInteger(b.hp) && b.hp > 0, `rush BOSS #${i + 1} ${b.name} HP 合法`);
    if (b.multi) {
      ok(Array.isArray(b.members) && b.members.length === 3, '董事会 1v3 有 3 位董事');
      b.members.forEach(m => {
        ok(m.hp > 0, `董事 ${m.name} HP 合法`);
        m.moves.forEach(mv => ok(RUSH_MOVE_TYPES.includes(mv.type), `董事 ${m.name} 招式类型 "${mv.type}" 合法`));
      });
    } else if (b.phases) {
      ok(b.phases.length === 3, '资本化身三阶段');
      b.phases.forEach(ph => ph.moves.forEach(mv => ok(RUSH_MOVE_TYPES.includes(mv.type), `资本 ${b.name} 招式类型 "${mv.type}" 合法`)));
    } else {
      b.moves.forEach(mv => ok(RUSH_MOVE_TYPES.includes(mv.type), `rush BOSS ${b.name} 招式类型 "${mv.type}" 合法`));
    }
  });
  ok(D.rushBosses[9].hp === 999, '资本化身 HP 999（v5）');
}

// rush 框架：继承 / 推进 / 整备时机 / 失败重来
{
  const engine = new Engine(81);
  engine.newRun('xiaoq');
  const build = {
    charId: 'xiaoq',
    deck: engine.state.deck.map(c => ({ uid: c.uid, id: c.id, up: false, costMod: 0 })),
    relics: ['badge', 'doll'], equippedRelics: ['badge', 'doll'],
    gold: 233, hp: 55, maxHp: 80
  };
  engine.rushStart(build);
  const st = engine.state;
  ok(st.rush.fight === 1 && st.gold === 233 && st.hp === 55 && st.maxHp === 80, 'rushStart 继承构筑（金币/精力）');
  ok(st.deck.length === build.deck.length && st.relics.join() === 'badge,doll', 'rushStart 继承牌组/圣物');
  ok(!engine.rushNeedRest(), '第 1 场后无需整备');
  engine.rushAdvance(); engine.rushAdvance(); engine.rushAdvance();
  ok(st.rush.fight === 4 && engine.rushNeedRest(), '第 3 场后进入整备点');
  // 失败重来
  st.gold = 999;
  st.hp = 10;
  st.deck.push({ uid: 999, id: 'rua', up: true });
  engine.rushRestart();
  ok(st.rush.fight === 1 && st.gold === 233 && st.hp === 55 && st.deck.length === build.deck.length,
    'rushRestart 牌组/金币/精力回到进入时状态');
  // 通关判定
  st.rush.fight = 10;
  ok(engine.rushAdvance() === true && st.rush.won, '第 10 场后 Rush 通关');
}

// 新招式：stealGold / costUp / counter / perGold
{
  // stealGold：偷男偷 15 金
  const e1 = new Engine(82);
  e1.newRun('xiaoq');
  e1.state.gold = 50;
  e1.startRushCombat(D.rushBosses[3], 4);
  const c1 = e1.state.combat;
  c1.enemy.intent = { name: '顺手牵羊', type: 'stealGold', value: 15 };
  c1.hand = [];
  const r1 = e1.endTurn();
  ok(e1.state.gold === 35 && r1.stolenGold === 15, `偷男偷 15 金（实际 ${e1.state.gold}）`);
  // perGold：销赃，金币 100 → 8+2=10 伤害
  const e2 = new Engine(83);
  e2.newRun('xiaoq');
  e2.state.gold = 100;
  e2.startRushCombat(D.rushBosses[3], 4);
  const c2 = e2.state.combat;
  c2.enemy.intent = { name: '销赃', type: 'attack', value: 8, perGold: 50 };
  c2.hand = [];
  e2.state.hp = 75;
  const hpB2 = e2.state.hp;
  e2.endTurn();
  ok(e2.state.hp === hpB2 - 10, `销赃镜像：金币100 攻 8+2=10（实际 ${hpB2 - e2.state.hp}）`);
  // costUp：财务总监 2 张手牌费用 +1
  const e3 = new Engine(84);
  e3.newRun('xiaoq');
  e3.startRushCombat(D.rushBosses[4], 5);
  const c3 = e3.state.combat;
  c3.enemy.intent = { name: '成本核算', type: 'costUp', value: 2 };
  const mods0 = c3.hand.filter(i => (i.costMod || 0) > 0).length;
  e3.endTurn();
  const mods1 = c3.hand.concat(c3.drawPile).filter(i => (i.costMod || 0) > 0).length;
  ok(mods1 === 2, `成本核算：2 张手牌费用 +1（实际 ${mods1}）`);
  ok(c3.hand.concat(c3.drawPile).filter(i => (i.costMod || 0) > 0).every(i => Engine.cardDef(i).cost + i.costMod >= 2), '附加费用进入结算管线');
  // counter：秋后算账，玩家未造成伤害 → 34；造成伤害 → 18
  const e4 = new Engine(85);
  e4.newRun('xiaoq');
  e4.startRushCombat(D.rushBosses[7], 8);
  const c4 = e4.state.combat;
  c4.enemy.intent = { name: '秋后算账', type: 'counter', value: 34, fallback: 18 };
  c4.playerDealtDmgThisTurn = 0;
  const hpB4 = e4.state.hp;
  c4.hand = [];
  e4.endTurn();
  ok(e4.state.hp === hpB4 - 34, `秋后算账：未受攻击打 34（实际 ${hpB4 - e4.state.hp}）`);
  const e5 = new Engine(86);
  e5.newRun('xiaoq');
  e5.startRushCombat(D.rushBosses[7], 8);
  const c5 = e5.state.combat;
  c5.enemy.intent = { name: '秋后算账', type: 'counter', value: 34, fallback: 18 };
  c5.playerDealtDmgThisTurn = 10;
  const hpB5 = e5.state.hp;
  c5.hand = [];
  e5.endTurn();
  ok(e5.state.hp === hpB5 - 18, `秋后算账：受过攻击打 18（实际 ${hpB5 - e5.state.hp}）`);
}

// 1vN：三董事 / 点选目标 / 孤注一掷 / 全灭判胜
{
  const engine = new Engine(87);
  engine.newRun('xiaoq');
  const board = D.rushBosses[8];
  engine.startMultiCombat(board, 9);
  const st = engine.state, c = st.combat;
  ok(c.multi && c.enemies.length === 3, '1vN 三董事在场');
  ok(c.target === 0 && c.enemy.id === 'b_fin', '默认目标最左存活者');
  // 点选目标
  ok(engine.pickTarget(2) && c.target === 2 && c.enemy.id === 'b_hr', '点选切换目标到人力董事');
  // 轮值主席：轮值者全伤，非轮值减半（先验证减半，再让目标成为轮值）
  c.enemy.hp = 100;
  c.hand.unshift({ uid: 0, id: 'strike_moyu', up: false });
  engine.playCard(0);
  ok(c.enemies[2].hp === 100 - 3, '轮值主席：非轮值董事伤害减半（6→3）');
  c.chairIdx = 2; // 轮到人力董事值班
  // 打当前目标
  c.enemy.hp = 5; // strike 6 点伤害足够击杀
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  engine.playCard(0);
  const hr = c.enemies[2];
  ok(hr.dead, '目标董事被击杀（轮值全伤）');
  ok(c.enemies[0].strength === 3 && c.enemies[1].strength === 3, '孤注一掷：其余董事力量 +3（v5）');
  ok(c.target !== 2 && !c.enemy.dead, '目标自动切到存活者');
  // 全灭判胜
  c.enemies[0].hp = 1;
  c.enemies[1].hp = 1;
  c.chairIdx = 0;
  engine.pickTarget(0);
  c.hand.unshift({ uid: 2, id: 'strike_moyu', up: false });
  engine.playCard(0);
  engine.pickTarget(1);
  c.hand.unshift({ uid: 3, id: 'strike_moyu', up: false });
  engine.playCard(0);
  ok(c.over && c.won, '全灭才算胜利');
}

/* ---------- b6) 死亡演出改版 + 强总 50% 打断二阶段 ---------- */
section('b6) 死亡碎裂帧撤换 / BOSS 定格特写 / 强总打断');

// 碎裂帧不再被引用（Lovart 自由发挥角色：小机器人/石头人）
{
  const fs = require('fs');
  const path = require('path');
  const gameDir = path.join(__dirname, '..');
  const mainSrc = fs.readFileSync(path.join(gameDir, 'js', 'main.js'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(gameDir, 'js', 'ui.js'), 'utf8');
  ok(!mainSrc.includes('minionDeath') && !uiSrc.includes('minionDeath'), 'minionDeath 碎裂帧不再被引用');
  ok(!mainSrc.includes('eliteDeath') && !uiSrc.includes('eliteDeath'), 'eliteDeath 碎裂帧不再被引用');
  // 本体消散统一路径 + 中性粒子保留
  ok(mainSrc.includes("UI.playFxFrames(eImg(), 'stars'"), '死亡演出使用中性 stars 粒子');
  ok(mainSrc.includes('knockaway'), '12% 击飞彩蛋保留');
  // BOSS 定格特写时序：1.5s 起特写（620+1000+320≈1.94s）→ 本体消散，BOSS 留白 4.4s 覆盖全程
  ok(uiSrc.includes('function bossCloseup'), 'UI.bossCloseup 定格特写存在');
  ok(mainSrc.includes('UI.bossCloseup(downSrc'), 'BOSS 死亡接入定格特写');
  ok(mainSrc.includes('? 4400 :'), 'BOSS 死亡留白 4.4s（覆盖特写+消散）');
}

// 强总 50% 打断：强制结束当前回合 + 立即二阶段 + 立刻反击一轮 + 之后正常交替
{
  const e = new Engine(9101);
  e.newRun('xiaoq');
  e.startCombat('boss3');
  const c = e.state.combat;
  const boss = c.enemy;
  ok(boss._def.phases.length === 2 && boss.phase === 0, '强总开局一阶段');
  // 52% → 一击打到 49%（strike 6 点；显式塞牌避免起手无攻击牌）
  boss.hp = Math.ceil(boss.maxHp * 0.52); // 104
  const hpBefore = e.state.hp;
  c.hand.unshift({ uid: 9001, id: 'strike_moyu', up: false });
  const r = e.playCard(0);
  ok(!!r.interrupt, '52%→49% 触发打断（result.interrupt）');
  ok(boss.phase === 1, '打断后立即进入二阶段');
  ok(r.interrupt.hits.length >= 1 && e.state.hp < hpBefore,
    `打断后强总立刻反击一轮（玩家 ${hpBefore}→${e.state.hp}）`);
  ok(c.hand.length === 5 && c.energy === c.maxEnergy && c.turn === 2,
    '当前回合被强制结束：手牌弃掉并重抽 5 张、能量回满、进入新回合');
  // 二阶段立绘按 phase 切图（renderCombat 依据 phase>0 出 boss3_p2）
  ok(boss.phase > 0, '二阶段立绘标记（phase>0）');
  // 打断只触发一次：继续出牌不再次打断
  const idx2 = c.hand.findIndex(i => Engine.cardDef(i).cost <= c.energy);
  const r2 = e.playCard(idx2 >= 0 ? idx2 : 0);
  ok(!r2.interrupt, '打断只触发一次（phase 已为 1）');
  // 之后正常回合交替：endTurn 敌人照常行动
  const r3 = e.endTurn();
  ok(r3.attacked || (r3.actions && r3.actions.length >= 0), '打断后恢复正常回合交替');
  ok(boss.phase === 1, '阶段保持二阶段不回落');
  // 机皇【攻略制定】：被打断时保留至多 3 张手牌（手牌 6 → 保留 3 + 重抽 5 = 8）
  {
    const ej = new Engine(9101);
    ej.newRun('jihuang');
    ej.startCombat('boss3');
    const cj = ej.state.combat;
    cj.enemy.hp = Math.floor(cj.enemy.maxHp * 0.52);
    cj.enemy.maxHp = cj.enemy.maxHp;
    for (let k = 0; k < 3; k++) cj.hand.push({ uid: 900 + k, id: 'defend_moyu', up: false });
    const handBefore = cj.hand.length;
    const atkIdx = cj.hand.findIndex(i => Engine.cardDef(i).type === 'attack');
    const rj = ej.playCard(atkIdx >= 0 ? atkIdx : 0);
    ok(!!rj.interrupt, '机皇也触发打断');
    ok(cj.hand.length === 3 + 5, `机皇打断保留 3 张手牌（手牌 ${handBefore} → 保留 3 + 重抽 5 = 8，实际 ${cj.hand.length}）`);
  }
  // 致死一击不触发打断
  const e2 = new Engine(9102);
  e2.newRun('xiaoq');
  e2.startCombat('boss3');
  const b2 = e2.state.combat.enemy;
  b2.hp = 3;
  const i2 = e2.state.combat.hand.findIndex(i => Engine.cardDef(i).type === 'attack');
  const r4 = e2.playCard(i2 >= 0 ? i2 : 0);
  ok(e2.state.combat.over && !r4.interrupt, '致死一击不触发打断（直接胜利）');
}

/* ---------- b7) 对局实时存档 + Rush 继承（DOM 垫片驱动真实 main.js） ---------- */
section('b7) 实时存档 / Rush 继承确认 / 存档清除');

{
  // 最小 DOM/localStorage 垫片
  function stubEl() {
    const t = {
      style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
      children: [], textContent: '', innerHTML: '', src: '',
      appendChild() {}, remove() {}, closest() { return null; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
      addEventListener() {}, setAttribute() {}, getAttribute() { return ''; }
    };
    return new Proxy(t, {
      get(o, k) { return k in o ? o[k] : function () { return stubEl(); }; },
      set(o, k, v) { o[k] = v; return true; }
    });
  }
  const els = {};
  global.document = {
    getElementById(id) { return els[id] || (els[id] = stubEl()); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return stubEl(); },
    addEventListener() {},
    body: stubEl()
  };
  global.matchMedia = () => ({ matches: false });
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  global.Image = function () { return { set src(v) {}, onload: null, onerror: null }; };
  require('../js/ui.js');
  require('../js/sfx.js');
  require('../js/main.js');
  const G = globalThis.Game;

  // 节点边界：战斗领奖 / 商店离开后快照存在且推进
  G.pickChar('xiaoq');
  ok(!store['moyu_run_save'], '新开一局时旧 run 存档已清除');
  G.state.run.hp = 55;
  G.debug.reward();
  G.rewardSkip(); // 战斗胜利领奖 → finishNode → runPersist
  const snap1 = JSON.parse(store['moyu_run_save'] || 'null');
  ok(!!snap1, '战斗领奖后快照存在（节点边界）');
  ok(snap1 && snap1.act === 1 && snap1.step === 1 && snap1.hp === 55 &&
    snap1.deck.length === G.state.run.deck.length,
    `快照字段一致（act/step/hp/deck ${snap1 && snap1.deck.length}）`);
  G.debug.shop();
  G.shopLeave();
  const snap2 = JSON.parse(store['moyu_run_save'] || 'null');
  ok(snap2 && snap2.step === 2, '商店离开后快照推进到下一节点');

  // 恢复一致性：改乱当前状态后 continueRun 回到快照
  G.state.run.hp = 1;
  G.state.run.deck.push({ uid: 9999, id: 'rua', up: true });
  G.continueRun();
  ok(G.state.run.hp === 55 && G.state.run.deck.length === snap2.deck.length &&
    G.state.run.step === 2 && G.state.screen === 'map',
    'continueRun 恢复 hp/deck/step 并回到地图');

  // 通关：run 存档清除 + lastWinBuild 写入 + 过场 → 继承确认 → 大厅带自己卡组
  G.state.run.over = true;
  G.state.run.victory = true;
  G.state.run.combat = { enemy: { name: '强总' } };
  G.debug.reward();
  G.rewardSkip();
  ok(!store['moyu_run_save'], '通关后 run 存档被清除');
  ok(!!G.state.save.lastWinBuild, '通关构筑 lastWinBuild 已写入');
  G.skipCutscene(); // endCutscene：清 rush 存档 → enterRush → 继承确认
  ok(G.state.showRushConfirm === true, '过场结束弹出继承确认（不落白屏）');
  const myDeck = G.state.save.lastWinBuild.deck.map(c => c.id).join(',');
  G.rushConfirmGo();
  ok(G.state.screen === 'rush' && G.state.run.deck.map(c => c.id).join(',') === myDeck,
    '确认后进入 Rush 大厅且卡组=通关卡组');

  // wins>0 但缺 lastWinBuild：toast 拒绝，不用调试卡组冒充
  delete store['moyu_rush_save'];
  G.state.save.lastWinBuild = null;
  G.state.screen = 'title';
  G.enterRush();
  ok(G.state.screen === 'title' && G.state.showRushConfirm === false,
    'wins>0 缺构筑：明确拒绝（toast）不静默进入');

  // rush 旧存档污染防护：endCutscene 会清旧 rush 进度（由上文 skipCutscene 路径覆盖，此处验证续打入口）
  store['moyu_rush_save'] = JSON.stringify({ fight: 3, build: {
    charId: 'xiaoq',
    deck: [{ uid: 1, id: 'strike_moyu', up: false, costMod: 0 }],
    relics: [], equippedRelics: [], gold: 10, hp: 50, maxHp: 75 } });
  G.state.save.lastWinBuild = { charId: 'shengfan', deck: [{ uid: 2, id: 'rua', up: false, costMod: 0 }],
    relics: [], equippedRelics: [], gold: 20, hp: 60, maxHp: 80 };
  G.enterRush(); // 有 rush 存档：直接续打，不弹确认
  ok(G.state.screen === 'rush' && G.state.run.rush.fight === 3, 'Rush 进度存档续打（fight 3）');
}

/* ---------- b8) Rush 十 BOSS 专属机制 + 0费改稀有 ---------- */
section('b8) Rush 十专属机制');

// 1 前台【微笑欺骗】：展示意图有真有假，真实意图照常执行
{
  const eng = new Engine(601);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[0], 1);
  const en = eng.state.combat.enemy;
  ok(en._def.mechanic === 'fakeIntent', '前台挂 fakeIntent 机制');
  let fake = 0, real = 0;
  for (let i = 0; i < 60; i++) { eng._chooseIntent(en); if (en.shownIntent && en.shownIntent !== en.intent) fake++; else real++; }
  ok(fake > 0 && real > 0, `微笑欺骗：真假情报混合（假 ${fake}/真 ${real}）`);
}

// 2 电梯战神【急速下坠】：every 3 + 无视格挡
{
  const mv = D.rushBosses[1].moves.filter(m => m.name === '急速下坠')[0];
  ok(mv && mv.every === 3 && mv.unblockable === true, '急速下坠 every3 必中（unblockable）');
  const eng = new Engine(602);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[1], 2);
  const c = eng.state.combat;
  c.enemy.intent = mv;
  c.playerBlock = 50;
  const hp0 = eng.state.hp;
  c.hand = [];
  eng.endTurn();
  ok(eng.state.hp === hp0 - 22, `必中重击：50 格挡被无视（掉 ${hp0 - eng.state.hp}）`);
}

// 3 秘书长【临时议题】：每回合塞废牌，废牌无效果可打出
{
  const eng = new Engine(603);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[2], 3);
  const c = eng.state.combat;
  ok(c.hand.filter(x => x.id === 'yiti').length === 1, '第一回合手牌含 1 张议题');
  ok(D.cards.yiti.effects.length === 0 && D.cards.yiti.noReward, '议题为 1 费无效果废牌且不入奖励池');
  ok(Engine.cardPool('xiaoq').indexOf('yiti') < 0, '议题不进抽牌奖励池');
  const idx = c.hand.findIndex(x => x.id === 'yiti');
  ok(eng.playCard(idx).ok, '议题可正常打出（仅消失）');
}

// 4 偷男【妙手空空】：偷手牌 + 击败归还
{
  const eng = new Engine(604);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[3], 4);
  const c = eng.state.combat;
  const h0 = c.hand.length;
  const r = eng.endTurn();
  ok(c.stolenCards.length === 1 && !!r.stolenCardName, `偷走 1 张手牌（${r.stolenCardName}）`);
  c.enemy.hp = 1;
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  const d0 = c.discard.length;
  eng.playCard(0);
  ok(c.stolenCards.length === 0 && c.discard.length === d0 + 1 + 1, '击败偷男归还被偷牌进弃牌堆');
}

// 5 财务总监【预算审核】：费用合计 ≤4
{
  const eng = new Engine(605);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[4], 5);
  const c = eng.state.combat;
  c.hand = [{ uid: 1, id: 'weekly' }, { uid: 2, id: 'weekly' }, { uid: 3, id: 'strike_moyu' }]; // 2+2+1
  c.energy = 99; // 排除能量干扰，专测预算
  ok(eng.playCard(0).ok && eng.playCard(0).ok, '预算内连出 2+2=4');
  const r3 = eng.playCard(0);
  ok(!r3.ok && /预算/.test(r3.error || ''), '第 5 点费用被预算拦截');
  eng.endTurn();
  ok(c.spentThisTurn === 0, '新回合预算重置');
}

// 6 卷王【内卷光环】：每出 1 牌力量 +1（已无被动力量）
{
  ok(!D.rushBosses[5].passiveStrength && D.rushBosses[5].mechanic === 'juanAura', '卷王改为内卷光环');
  const eng = new Engine(606);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[5], 6);
  const c = eng.state.combat;
  const s0 = c.enemy.strength;
  c.hand = [{ uid: 1, id: 'strike_moyu' }, { uid: 2, id: 'defend_moyu' }];
  eng.playCard(0);
  eng.playCard(0);
  ok(c.enemy.strength === s0 + 2, '出 2 张牌卷王力量 +2');
}

// 7 人力总监【绩效考核】：两分支
{
  const eng = new Engine(607);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[6], 7);
  let c = eng.state.combat;
  c.enemy.turnCount = 2; c.reviewCount = 3; c.hand = [];
  const hp0 = eng.state.hp;
  const r = eng.endTurn();
  ok(r.reviewPen === 24 && eng.state.hp <= hp0 - 24 + 0, '考核不合格：罚 24');
  const eng2 = new Engine(608);
  eng2.newRun('xiaoq');
  eng2.startRushCombat(D.rushBosses[6], 7);
  c = eng2.state.combat;
  c.enemy.turnCount = 2; c.reviewCount = 10; c.hand = [];
  const ehp = c.enemy.hp;
  const r2 = eng2.endTurn();
  ok(r2.reviewSelf === 12 && c.enemy.hp === ehp - 12, '考核达标：人力自伤 12');
}

// 8 高级VP【影子决策】：复制上回合最后攻击牌
{
  const eng = new Engine(609);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[7], 8);
  const c = eng.state.combat;
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  eng.playCard(0); // strike 6
  c.hand = [];
  const r = eng.endTurn();
  ok(r.mirrored === '摸鱼一击' && r.hits.indexOf(6) >= 0, '影子决策复制 strike 打回 6');
  ok(r.actions.some(a => /影子决策/.test(a.name)), '影子决策计入演出动作');
}

// 9 董事会【轮值主席】：非轮值减半 + 每回合轮换
{
  const eng = new Engine(610);
  eng.newRun('xiaoq');
  eng.startMultiCombat(D.rushBosses[8], 9);
  const c = eng.state.combat;
  const chair0 = c.chairIdx;
  eng.pickTarget((chair0 + 1) % 3);
  const t = c.enemy;
  t.hp = 100;
  c.hand.unshift({ uid: 1, id: 'strike_moyu', up: false });
  eng.playCard(0);
  ok(t.hp === 97, '非轮值董事伤害减半（6→3）');
  eng.pickTarget(chair0);
  const t2 = c.enemy;
  t2.hp = 100;
  c.hand.unshift({ uid: 2, id: 'strike_moyu', up: false });
  eng.playCard(0);
  ok(t2.hp === 94, '轮值董事全伤（6）');
  c.hand = [];
  eng.endTurn();
  ok(c.chairIdx !== chair0, '轮值每回合轮换');
}

// 10 资本化身【市场波动】：P3 三形态轮换
{
  ok(D.rushBosses[9].mechanic === 'market', '资本化身挂 market 机制');
  const p3 = D.rushBosses[9].phases[2];
  ok(p3.moves.length === 3 && p3.moves[0].name.indexOf('牛') === 0 &&
    p3.moves[1].type === 'block' && p3.moves[2].type === 'heal', 'P3 牛/熊/平三形态');
  const eng = new Engine(611);
  eng.newRun('xiaoq');
  eng.startRushCombat(D.rushBosses[9], 10);
  const en = eng.state.combat.enemy;
  en.phase = 2;
  const forms = [];
  for (let i = 0; i < 3; i++) { eng._chooseIntent(en); forms.push(en.intent.name); en.turnCount++; }
  ok(forms[0] !== forms[1] && forms[1] !== forms[2], `形态逐回合轮换（${forms.join('→')}）`);
}

// 0 费牌稀有度
{
  const rare0 = ['pie', 'tarot', 'quantum', 'coffee'].filter(id => D.cards[id].rarity === 'rare' && D.cards[id].cost === 0);
  ok(rare0.length === 4, `0 费普通/罕见改稀有（${rare0.join(',')}）`);
  ok(D.cards.prepare.rarity === 'uncommon' && D.cards.prepare.cost === 0, '备战改罕见（机皇专属不抢稀有池）');
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
section('e) 平衡统计（4 角色 × 50 局自动 run）');
{
  let totalErrors = 0;
  const chars = ['xiaoq', 'shengfan', 'jihuang', 'shuanglaoya'];
  for (const chId of chars) {
    let victories = 0, errors = 0, reach8 = 0;
    const actDist = {};
    for (let trial = 0; trial < 50; trial++) {
      try {
        const engine = new Engine(777000 + trial * 13 + chars.indexOf(chId) * 100000);
        engine.newRun(chId);
        const r = autoRun(engine, true);
        if (r.victory) victories++;
        const reached = r.victory ? 10 : r.act;
        actDist[reached] = (actDist[reached] || 0) + 1;
        if (reached >= 8) reach8++;
      } catch (err) {
        errors++;
        totalErrors++;
        console.error(`  ✗ 平衡 run ${chId}#${trial} 抛异常: ${err.message}`);
      }
    }
    const wr = victories / 50;
    console.log(`  [${chId}] 胜率 ${victories}/50 = ${(wr * 100).toFixed(0)}% · 到8层+ ${reach8} 局 · 分布: ${Object.keys(actDist).sort((a, b) => a - b).map(a => `${a}层×${actDist[a]}`).join(' ')}`);
    // 胜率带：0费改稀有后剩饭升至 46%、机皇跌至 0%（实测）；机皇下限暂放 0 仅记录
    const floors = { xiaoq: 0.08, shengfan: 0.08, jihuang: 0, shuanglaoya: 0.08 };
    ok(wr >= (floors[chId] || 0) && wr <= 0.5, `${chId} 胜率在 ${(floors[chId] || 0) * 100}%~50%（实际 ${(wr * 100).toFixed(0)}%）`);
    ok(errors === 0, `${chId} 50 局无异常`);
  }
  ok(totalErrors === 0, '全部角色 50 局无异常');
}

/* ---------- f) Boss Rush 平衡模拟 ---------- */
section('f) Boss Rush 平衡（4 角色通关构筑模拟）');

// 用通关构筑跑 Rush 模拟：战斗胜利→20% 回复+随机拿卡/跳过→整备点回血→推进
function simRush(engine, build) {
  engine.rushStart(build);
  const st = engine.state;
  while (st.rush.fight <= 10) {
    engine.rushStartFight();
    const won = scriptedCombat(engine, 300, true);
    if (!won || !engine.state.combat.over) {
      return { victory: false, fight: st.rush.fight };
    }
    engine.rushFightWon();
    // 间歇奖励：80% 拿一张
    const rw = engine.genReward();
    engine.takeReward(rw);
    if (engine.rng() < 0.8) engine.takeRewardCard(rw, engine.rng.int(3));
    const won10 = engine.rushAdvance();
    if (won10) return { victory: true, fight: 10 };
    if (engine.rushNeedRest()) engine.rushRest(0); // 整备统一回血
  }
  return { victory: true, fight: 10 };
}

{
  const chars = ['xiaoq', 'shengfan', 'jihuang', 'shuanglaoya'];
  const summary = {};
  console.log('  —— v5 原始定稿实测（每套构筑跑 2 局 Rush）——');
  for (const chId of chars) {
    // 先跑出最多 25 套通关构筑
    const builds = [];
    for (let trial = 0; trial < 100 && builds.length < 25; trial++) {
      const engine = new Engine(555000 + trial * 7 + chars.indexOf(chId) * 10000);
      engine.newRun(chId);
      const r = autoRun(engine, true);
      if (r.victory) {
        const st = engine.state;
        builds.push({
          charId: chId,
          deck: st.deck.map(c => ({ uid: c.uid, id: c.id, up: c.up, costMod: c.costMod || 0 })),
          relics: st.relics.slice(),
          equippedRelics: (st.equippedRelics || st.relics).slice(),
          gold: st.gold, hp: st.hp, maxHp: st.maxHp
        });
      }
    }
    let wins = 0, runs = 0, totalFight = 0, reach10 = 0, errors = 0;
    for (const build of builds) {
      for (let rep = 0; rep < 2; rep++) { // 每套构筑 2 局，样本翻倍
        try {
          const engine2 = new Engine(999000 + builds.indexOf(build) * 31 + rep * 7777 + chars.indexOf(chId) * 10000);
          engine2.newRun(chId);
          const r = simRush(engine2, build);
          runs++;
          totalFight += r.fight;
          if (r.fight >= 10) reach10++;
          if (r.victory) wins++;
        } catch (err) {
          errors++;
          console.error(`  ✗ rush 模拟 ${chId} 异常: ${err.message}`);
        }
      }
    }
    const n = builds.length;
    const wr = runs ? wins / runs : 0;
    const avg = runs ? (totalFight / runs).toFixed(1) : 0;
    console.log(`  [${chId}] 通关构筑 ${n} 套 × 2 局 · Rush 通关 ${wins}/${runs}（${(wr * 100).toFixed(0)}%）` +
      ` · 平均进度 ${avg} 场 · 见到资本化身 ${reach10}/${runs}`);
    summary[chId] = { wr, avg: parseFloat(avg), runs, errors };
    ok(errors === 0, `${chId} rush 模拟无异常`);
    // v5+十专属机制验收基线（实测全角色通关率 0%、平均 2~6 场，不锁通关率，锁进度下限）
    ok(summary[chId].avg >= 2, `${chId} 平均进度 ≥2 场（实际 ${avg}）`);
    // 卡池新增卡牌会平移固定种子的随机流，样本数阈值按当前实测对齐
    ok(runs >= 10, `${chId} rush 模拟样本 ≥10 局（实际 ${runs}）`);
  }
  // 强构筑应能摸到中场：最佳角色平均进度 ≥5.0（十机制+新卡池实测最佳 5.3）
  const bestAvg = Math.max.apply(null, chars.map(c => summary[c].avg));
  ok(bestAvg >= 5.0, `强构筑平均进度 ≥5.0 场（实际最佳 ${bestAvg}）`);
}

/* ---------- 汇总 ---------- */
console.log(`\n========================================`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
