/* 摸鱼大作战 - 游戏引擎（纯逻辑，无 DOM）
 * 战斗引擎 + 地图生成 + 奖励/商店/休息/事件
 * 随机数可注入 seed，保证测试稳定 */
(function (g) {
  'use strict';
  var D = g.GameData;

  /* ---------- 可注入 seed 的 RNG (mulberry32) ---------- */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    var rng = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = function (n) { return Math.floor(rng() * n); };
    rng.pick = function (arr) { return arr[rng.int(arr.length)]; };
    rng.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = rng.int(i + 1);
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return rng;
  }

  /* ---------- 每日挑战：日期种子 + 词条池（纯函数，Node 可测） ---------- */
  // 字符串 hash（FNV-1a 32bit）：日期串 → 确定性整数种子
  function hashStr(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // 本地时区 YYYY-MM-DD（每日挑战以本地日期为准，跨天即换局）
  function dailyDateStr(d) {
    d = d || new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // 每日词条池：mod = st.daily.mod 判定值，引擎各函数挂钩结算
  var DAILY_MODS = [
    { mod: 'rich',     name: '暴富日', desc: '开局金币 +99' },
    { mod: 'elite',    name: '精英日', desc: '第 1/2 步必出精英选项' },
    { mod: 'fragile',  name: '脆弱日', desc: '开局最大精力 -10' },
    { mod: 'forged',   name: '强化日', desc: '开局随机 1 张牌已升级' },
    { mod: 'hunger',   name: '饥饿日', desc: '休息处回血减半' },
    { mod: 'generous', name: '慷慨日', desc: '战斗奖励金币 +50%' },
    { mod: 'hard',     name: '艰难日', desc: '敌人每段伤害 +1' }
  ];

  // 日期串 → 每日种子（同一天所有玩家同一局，地图完全一致）
  function dailySeed(dateStr) { return hashStr('moyu-daily-' + dateStr); }
  // 日期串 → 今日词条（独立于地图种子取模，避免与地图生成抢同一条 RNG 流）
  function dailyMod(dateStr) { return DAILY_MODS[hashStr('moyu-daily-mod-' + dateStr) % DAILY_MODS.length]; }
  // 今日挑战完整信息：{ date, seed, mod, modName, modDesc }
  function dailyInfo(dateStr) {
    dateStr = dateStr || dailyDateStr();
    var m = dailyMod(dateStr);
    return { date: dateStr, seed: dailySeed(dateStr), mod: m.mod, modName: m.name, modDesc: m.desc };
  }

  function Engine(seed) {
    this.seed = (seed === undefined) ? ((Math.random() * 0xFFFFFFFF) >>> 0) : (seed >>> 0);
    this.rng = makeRng(this.seed);
    this.state = null;
  }

  /* ---------- 卡牌工具 ---------- */
  // 合并基础与升级版本，得到实际生效的卡牌定义
  Engine.cardDef = function (inst) {
    var base = D.cards[inst.id];
    if (!base) throw new Error('未知卡牌: ' + inst.id);
    if (!inst.up) return base;
    var up = base.up || {};
    var merged = {};
    for (var k in base) merged[k] = base[k];
    for (var k2 in up) merged[k2] = up[k2];
    return merged;
  };

  // 该角色可用的奖励牌池（通用牌 + 本角色专属牌；noReward 废牌不入池）
  Engine.cardPool = function (charId) {
    var pool = [];
    for (var id in D.cards) {
      var c = D.cards[id];
      if (c.noReward) continue;
      if (!c.char || c.char === charId) pool.push(id);
    }
    return pool;
  };

  Engine.prototype._weightedCard = function () {
    var pool = Engine.cardPool(this.state.charId);
    // 稀有度基础权重 × 角色标签倾向倍率（仅影响出现率，不改变卡池构成）
    var RARITY_W = { common: 60, uncommon: 33, rare: 7 };
    var charW = (D.CHAR_CARD_WEIGHTS && D.CHAR_CARD_WEIGHTS[this.state.charId]) || {};
    var total = 0, items = [];
    for (var i = 0; i < pool.length; i++) {
      var def = D.cards[pool[i]];
      var w = RARITY_W[def.rarity] || 10;
      // 攻击类型视为 'attack' 标签
      if (charW.attack && def.type === 'attack') w *= charW.attack;
      var tags = def.tags || [];
      for (var t = 0; t < tags.length; t++) {
        if (charW[tags[t]]) w *= charW[tags[t]];
      }
      items.push({ id: pool[i], w: w });
      total += w;
    }
    var roll = this.rng() * total;
    for (var j = 0; j < items.length; j++) {
      roll -= items[j].w;
      if (roll < 0) return items[j].id;
    }
    return items[items.length - 1].id;
  };

  /* ---------- 开局 ---------- */
  // opts.daily = { date, mod, modName }：每日挑战开局（种子由调用方用 dailySeed 固定）
  Engine.prototype.newRun = function (charId, opts) {
    var ch = D.characters[charId];
    if (!ch) throw new Error('未知角色: ' + charId);
    var uid = 1;
    var deck = ch.deck.map(function (id) { return { uid: uid++, id: id, up: false }; });
    this.state = {
      charId: charId,
      hp: ch.maxHp,
      maxHp: ch.maxHp,
      gold: ch.gold,
      deck: deck,
      uidCounter: uid,
      relics: [],          // 拥有的圣物 id 数组（背包）
      equippedRelics: [],  // 已装备的圣物 id（最多 4 件，只有装备的生效）
      act: 1,
      step: 0,             // 当前所处步（0 起）
      map: null,           // 在每日词条结算之后生成（精英日需挂 genMap）
      combat: null,
      over: false,
      victory: false,
      floorsCleared: 0,    // 已通关层数
      maxHit: 0,           // 单局最高单段伤害（统计用）
      seen: { cards: {}, relics: {}, enemies: {} } // 图鉴
    };
    var st = this.state;
    // 每日挑战：记入今日词条并结算开局效果（普通局无 st.daily，以下全部跳过、零影响）
    if (opts && opts.daily) {
      st.daily = { date: opts.daily.date, mod: opts.daily.mod, modName: opts.daily.modName || '' };
      if (st.daily.mod === 'rich') {
        st.gold += 99; // 暴富日
      } else if (st.daily.mod === 'fragile') {
        st.maxHp = Math.max(1, st.maxHp - 10); // 脆弱日
        st.hp = Math.min(st.hp, st.maxHp);
      } else if (st.daily.mod === 'forged') {
        var ups0 = st.deck.filter(function (c) { return !c.up; }); // 强化日
        if (ups0.length) this.rng.pick(ups0).up = true;
      }
    }
    st.map = this.genMap(1);
    deck.forEach(this._seeCard.bind(this));
    return st;
  };

  Engine.prototype._seeCard = function (inst) { this.state.seen.cards[inst.id] = true; };

  /* ---------- 圣物装备（最多 4 件，只有装备的生效） ---------- */
  var MAX_EQUIPPED_RELICS = 4;
  Engine.prototype.hasRelic = function (id) { return this.state.equippedRelics.indexOf(id) >= 0; };
  // 获得圣物：进背包；装备栏未满则自动装备
  Engine.prototype.addRelic = function (id) {
    var st = this.state;
    if (st.relics.indexOf(id) >= 0) return false;
    st.relics.push(id);
    st.seen.relics[id] = true;
    if (st.equippedRelics.length < MAX_EQUIPPED_RELICS) st.equippedRelics.push(id);
    return true;
  };
  Engine.prototype.equipRelic = function (id) {
    var st = this.state;
    if (st.relics.indexOf(id) < 0 || st.equippedRelics.indexOf(id) >= 0) return false;
    if (st.equippedRelics.length >= MAX_EQUIPPED_RELICS) return false;
    st.equippedRelics.push(id);
    return true;
  };
  Engine.prototype.unequipRelic = function (id) {
    var eq = this.state.equippedRelics, i = eq.indexOf(id);
    if (i < 0) return false;
    eq.splice(i, 1);
    return true;
  };

  /* ---------- 地图生成（骨架化：热身→随机→商店位→休整位→BOSS） ---------- */
  // 每层 STEPS_PER_ACT 步：第 0 步全小怪热身；中间步随机（同步同类型不重复，商店恰出现 1 次、落在第 1 或第 2 步）；
  // 倒数第 2 步休整位随机池（茶水间/事件/商店/精英，出商店则占用商店名额）；末步固定 BOSS。商店/茶水间不进随机池。
  Engine.prototype.genMap = function (act) {
    var steps = [];
    var pool = D.acts[act - 1].pool;
    // 精英日（每日挑战）：第 1/2 步各保底 1 个精英选项
    var eliteDaily = !!(this.state && this.state.daily && this.state.daily.mod === 'elite');
    // 休整位第二个选项摇号（事件/商店/精英；茶水间为固定选项不参与摇号；出商店则占用每层唯一商店名额）
    var preType = 'event', preRoll = this.rng() * 100;
    for (var pi = 0; pi < D.PRE_BOSS_WEIGHTS.length; pi++) {
      if (D.PRE_BOSS_WEIGHTS[pi].type === 'rest') continue;
      preRoll -= D.PRE_BOSS_WEIGHTS[pi].w;
      if (preRoll < 0) { preType = D.PRE_BOSS_WEIGHTS[pi].type; break; }
    }
    var shopStep = preType === 'shop' ? -1 : 1 + this.rng.int(2); // 商店落在第 1 或第 2 步
    for (var i = 0; i < D.STEPS_PER_ACT; i++) {
      if (i === D.STEPS_PER_ACT - 1) {
        steps.push([{ type: 'boss', enemyId: D.acts[act - 1].boss }]);
        continue;
      }
      if (i === 0) {
        // 热身：2~3 个小怪任选
        var n0 = 2 + this.rng.int(2), opts0 = [];
        for (var j0 = 0; j0 < n0; j0++) opts0.push(this._makeNode('monster', pool));
        steps.push(opts0);
        continue;
      }
      if (i === D.STEPS_PER_ACT - 2) {
        // BOSS 前休整位：固定茶水间 + 随机第二选项（事件/商店/精英）
        steps.push([{ type: 'rest' }, this._makeNode(preType, pool)]);
        continue;
      }
      var n = 2 + this.rng.int(2), opts = [];
      for (var j = 0; j < n; j++) {
        var used = opts.map(function (o) { return o.type; });
        opts.push(this._makeNode(this._rollNodeType(i, used), pool));
      }
      // 商店位：该步没有商店则替换第一个选项，保证每层恰好 1 次
      if (i === shopStep && !opts.some(function (o) { return o.type === 'shop'; })) {
        opts[0] = this._makeNode('shop', pool);
      }
      // 精英日：替换末位选项补精英（在商店位之后处理，不顶掉商店、不破坏"商店恰好 1 次"骨架）
      if (eliteDaily && (i === 1 || i === 2) && !opts.some(function (o) { return o.type === 'elite'; })) {
        opts[opts.length - 1] = this._makeNode('elite', pool);
      }
      steps.push(opts);
    }
    return { act: act, steps: steps };
  };

  // 生成节点；小怪/精英预抽敌人（地图卡片需要显示对应敌人图）
  Engine.prototype._makeNode = function (type, pool) {
    var nd = { type: type };
    if (type === 'monster') nd.enemyId = this.rng.pick(pool);
    else if (type === 'elite') nd.enemyId = this.rng.pick(D.elites);
    return nd;
  };

  // 随机节点类型；excludes 为本步已出现类型（同步不重复）
  Engine.prototype._rollNodeType = function (stepIdx, excludes) {
    var total = 0, list = [];
    D.NODE_WEIGHTS.forEach(function (nw) {
      if (excludes && excludes.indexOf(nw.type) >= 0) return;
      if (nw.type === 'elite' && stepIdx === 0) return;
      list.push(nw); total += nw.w;
    });
    var roll = this.rng() * total;
    for (var i = 0; i < list.length; i++) {
      roll -= list[i].w;
      if (roll < 0) return list[i].type;
    }
    return 'monster';
  };

  /* ---------- 节点选择 ---------- */
  // 返回 { type, ... } 描述即将进入的节点内容
  Engine.prototype.enterNode = function (nodeIdx) {
    var st = this.state;
    var opts = st.map.steps[st.step];
    if (!opts || !opts[nodeIdx]) throw new Error('非法节点');
    var type = opts[nodeIdx].type;
    var actCfg = D.acts[st.act - 1];
    var node = { type: type };
    if (type === 'monster') {
      node.enemyId = opts[nodeIdx].enemyId || this.rng.pick(actCfg.pool);
    } else if (type === 'elite') {
      node.enemyId = opts[nodeIdx].enemyId || this.rng.pick(D.elites);
    } else if (type === 'boss') {
      node.enemyId = actCfg.boss;
    } else if (type === 'event') {
      // 事件去重：优先未遇过的事件，全部遇过后才重置可重复（不跨局）；同层绝对不重复
      if (!st.seenEvents) st.seenEvents = [];
      var allEv = Object.keys(D.events);
      var fresh = allEv.filter(function (id) { return st.seenEvents.indexOf(id) < 0; });
      if (!fresh.length) { st.seenEvents = []; fresh = allEv; }
      node.eventId = this.rng.pick(fresh);
      st.seenEvents.push(node.eventId);
    } else if (type === 'shop') {
      node.shop = this._genShop();
    }
    st.lastNodeType = type;
    return node;
  };

  // 节点处理完毕（胜利/离开）后推进
  Engine.prototype.advance = function () {
    var st = this.state;
    st.step++;
    if (st.step >= D.STEPS_PER_ACT) {
      // 本层通关
      st.floorsCleared = st.act;
      if (st.act >= D.TOTAL_ACTS) {
        st.over = true; st.victory = true;
      } else {
        st.act++;
        st.step = 0;
        st.map = this.genMap(st.act);
      }
    }
  };

  /* ---------- 战斗 ---------- */
  // 通用战斗装配：edef 可为 D.enemies 条目或 rushBoss 条目
  Engine.prototype._makeCombat = function (edef, opts) {
    var st = this.state;
    opts = opts || {};
    var enemy = {
      id: opts.enemyId || edef.id || 'rush',
      name: edef.name,
      hp: edef.hp, maxHp: edef.hp,
      block: 0, strength: 0, weak: 0, vulnerable: 0,
      skipTurns: 0, turnCount: 0,
      loopIdx: 0, phase: 0,
      dmgBonus: 0,
      intent: null,
      _def: edef
    };
    // 精英随层数成长：HP +8/层，攻击 +1/层
    if (edef.elite) {
      var grow = st.act - 1;
      enemy.hp += grow * 8;
      enemy.maxHp = enemy.hp;
      enemy.dmgBonus = grow;
    }
    var drawPile = st.deck.map(function (c) { return c; });
    this.rng.shuffle(drawPile);
    var combat = {
      enemy: enemy,
      turn: 0,
      energy: 0, maxEnergy: 4 + (this.hasRelic('coffee_can') ? 1 : 0), // 基础能量 4（圣物限装 4 件后的基础强度补偿）
      hand: [], drawPile: drawPile, discard: [], exhausted: [],
      playerBlock: 0, playerWeak: 0, playerVuln: 0,
      playerStrength: 0,
      powers: [],            // {id, value}
      attacksPlayed: 0, cardsPlayed: 0, darkswordPlays: 0,
      cardsThisTurn: 0, attacksThisTurn: 0, // 深谋/备战/摸鱼之道用
      combatStartHp: st.hp,
      playerDealtDmgThisTurn: 0, // 高级VP「秋后算账」判定用
      flags: { scarfUsed: false, talismanUsed: false, gamepadUsed: false, attackPadUsed: false },
      over: false, won: false,
      log: [],
      easterEgg: null,       // UI 彩蛋文字
      rushBoss: opts.rushBoss || null,
      rushFight: opts.fightIdx || 0,
      multi: false,
      // Rush 专属机制状态
      stolenCards: [],      // 偷男【妙手空空】暂存
      spentThisTurn: 0,     // 财务【预算审核】已用费用
      reviewCount: 0,       // 人力【绩效考核】本周期出牌数
      lastAttack: null,     // 本回合最后打出的攻击牌（VP【影子决策】）
      prevAttack: null,     // 上一回合最后打出的攻击牌
      chairIdx: 0           // 董事会【轮值主席】
    };
    // BOSS 战：黑暗剑柄
    if ((edef.boss || opts.rushBoss) && this.hasRelic('sword_hilt')) combat.playerStrength += 2;
    // 猛男寨徽章：战斗开始力量 +1
    if (this.hasRelic('badge')) combat.playerStrength += 1;
    // 爽老鸭被动：每场战斗开始 +10 金币
    if (st.charId === 'shuanglaoya') st.gold += 10;
    st.combat = combat;
    this._chooseIntent(enemy);
    this._startPlayerTurn();
    // 玩偶小Q：战斗开始时 +4 格挡
    if (this.hasRelic('doll')) combat.playerBlock += 4;
    return combat;
  };

  Engine.prototype.startCombat = function (enemyId) {
    var edef = D.enemies[enemyId];
    if (!edef) throw new Error('未知敌人: ' + enemyId);
    this.state.seen.enemies[enemyId] = true;
    return this._makeCombat(edef, { enemyId: enemyId }); // 主游戏敌人 id 透传（boss3 打断/倒地立绘用）
  };

  // Boss Rush 单体 BOSS 战
  Engine.prototype.startRushCombat = function (rushDef, fightIdx) {
    return this._makeCombat(rushDef, { rushBoss: rushDef, fightIdx: fightIdx });
  };

  // 1vN 集团战（董事会）：敌人数组，各自独立血量/格挡/意图/行动
  Engine.prototype.startMultiCombat = function (boardDef, fightIdx) {
    var combat = this._makeCombat(boardDef, { rushBoss: boardDef, fightIdx: fightIdx });
    var self = this;
    combat.multi = true;
    combat.enemies = boardDef.members.map(function (m) {
      return {
        id: m.id, name: m.name,
        hp: m.hp, maxHp: m.hp,
        block: 0, strength: 0, weak: 0, vulnerable: 0,
        skipTurns: 0, turnCount: 0, loopIdx: 0,
        dmgBonus: 0, intent: null, dead: false,
        _def: m
      };
    });
    combat.enemy = combat.enemies[0];
    combat.target = 0;
    combat.enemies.forEach(function (e) { self._chooseIntent(e); });
    return combat;
  };

  // 1vN：切换集火目标（只能选存活者）
  Engine.prototype.pickTarget = function (i) {
    var c = this.state.combat;
    if (!c || !c.multi || c.over) return false;
    var e = c.enemies[i];
    if (!e || e.dead) return false;
    c.target = i;
    c.enemy = e;
    return true;
  };

  Engine.prototype._moves = function (enemy) {
    var edef = enemy._def;
    if (edef.phases) {
      var ph = edef.phases[enemy.phase] || edef.phases[edef.phases.length - 1];
      return ph.moves;
    }
    return edef.moves || [];
  };

  // 检查 BOSS 阶段切换
  Engine.prototype._checkPhase = function (enemy) {
    var edef = enemy._def;
    if (!edef.phases) return;
    var next = edef.phases[enemy.phase + 1];
    if (next && enemy.hp <= enemy.maxHp * edef.phases[enemy.phase].until) {
      enemy.phase++;
      enemy.foresight = null; // 阶段切换：招式池变了，镜片预见队列作废重建
      if (next.phaseName) {
        this.state.combat.log.push({ t: 'phase', text: next.phaseName });
      }
    }
  };

  // 抽取敌人招式；ahead = 距当前的回合偏移（1=即将执行，2/3/4=未来回合，供镜片预见）
  Engine.prototype._rollMove = function (enemy, ahead) {
    var edef = enemy._def;
    var moves = this._moves(enemy);
    // 【市场波动】资本化身 P3：牛/熊/平按回合轮换
    if (edef.mechanic === 'market' && enemy.phase === 2) {
      return moves[(enemy.turnCount + ahead - 1) % moves.length];
    }
    // every 型招式优先
    var turnN = enemy.turnCount + ahead;
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].every && turnN % moves[i].every === 0) return moves[i];
    }
    if (edef.ai === 'loop') {
      var mv = moves[enemy.loopIdx % moves.length];
      enemy.loopIdx++;
      return mv;
    }
    var total = 0;
    moves.forEach(function (m) { if (!m.every) total += (m.w || 1); });
    var roll = this.rng() * total, mv2 = null;
    for (var j = 0; j < moves.length; j++) {
      if (moves[j].every) continue;
      roll -= (moves[j].w || 1);
      if (roll < 0) { mv2 = moves[j]; break; }
    }
    return mv2 || moves[moves.length - 1];
  };

  Engine.prototype._chooseIntent = function (enemy) {
    var edef = enemy._def;
    if (this.hasRelic('glasses')) {
      // 肯尼的镜片：预摇未来 3 回合意图（队列与实战同源；阶段切换时作废，由 _checkPhase 置 null）
      if (!enemy.foresight) {
        enemy.intent = this._rollMove(enemy, 1);
        enemy.foresight = [this._rollMove(enemy, 2), this._rollMove(enemy, 3), this._rollMove(enemy, 4)];
      } else {
        enemy.intent = enemy.foresight.shift();
        enemy.foresight.push(this._rollMove(enemy, enemy.foresight.length + 2));
      }
    } else {
      enemy.intent = this._rollMove(enemy, 1);
    }
    var mv = enemy.intent;
    // 【微笑欺骗】前台：展示的意图有 50% 是假情报（真实意图照常执行；肯尼镜片可识破）
    if (edef.mechanic === 'fakeIntent' && mv) {
      var others = this._moves(enemy).filter(function (m) { return m !== mv && !m.every; });
      enemy.shownIntent = (others.length && this.rng() < 0.5) ? others[this.rng.int(others.length)] : mv;
    } else {
      enemy.shownIntent = null;
    }
  };

  Engine.prototype._draw = function (n) {
    var c = this.state.combat;
    for (var i = 0; i < n; i++) {
      if (!c.drawPile.length) {
        if (!c.discard.length) break;
        c.drawPile = this.rng.shuffle(c.discard);
        c.discard = [];
      }
      c.hand.push(c.drawPile.pop());
    }
  };

  Engine.prototype._startPlayerTurn = function () {
    var st = this.state, c = st.combat;
    c.turn++;
    // 小怪 20 回合逃跑：第 21 个玩家回合开始，非精英非 BOSS 的小怪直接逃跑
    // （战斗判胜，只给金币不给三选一卡牌——打断无限刷金；精英/BOSS 不逃跑）
    if (c.turn > 20 && !c.multi && !c.rushBoss) {
      var ed0 = c.enemy._def;
      if (!ed0.elite && !ed0.boss) {
        c.fled = true;
        c.log.push({ t: 'sys', text: '敌人逃跑了！' });
        this._winCombat();
        return;
      }
    }
    c.playerBlock = 0;
    c.energy = c.maxEnergy;
    c.flags.gamepadUsed = false;
    c.flags.attackPadUsed = false;
    // 獭罗牌：第一回合能量 +1
    if (c.turn === 1 && this.hasRelic('tarot_rel')) c.energy += 1;
    // 能力：红围巾
    c.powers.forEach(function (p) {
      if (p.id === 'scarf_power') c.playerBlock += p.value;
    });
    var drawN = 5;
    // 洞洞板：第一回合多抽 1 张
    if (c.turn === 1 && this.hasRelic('pegboard')) drawN += 1;
    this._draw(drawN);
    // 【临时议题 v2】会议室秘书长：每回合开始往玩家手牌塞 2 张「议题」废牌
    if (!c.multi && c.enemy._def.mechanic === 'junkCard') {
      c.hand.push({ uid: st.uidCounter++, id: 'yiti', up: false });
      c.hand.push({ uid: st.uidCounter++, id: 'yiti', up: false });
    }
    // 【预算审核】财务总监：每回合出牌费用合计 ≤4
    c.spentThisTurn = 0;
    // 【画饼】部门主管：本回合首张牌费用 -1（bingTurn 生效回合）
    c.bingUsed = false;
    c.bingTurn = false;
    if (c.bingNext) { c.bingTurn = true; c.bingNext = false; }
    // 【报销审核】财务主管：每回合首张 ≥2 费牌审核一次
    c.auditUsed = false;
    // 【轮值主席】董事会：每回合轮换，仅轮值董事可被正常攻击
    if (c.multi && c.enemies) {
      var alive2 = c.enemies.filter(function (x) { return !x.dead; });
      if (alive2.length) {
        var cur = c.enemies[c.chairIdx];
        if (!cur || cur.dead) c.chairIdx = c.enemies.indexOf(alive2[0]);
        else if (c.turn > 1) {
          var ai = alive2.indexOf(cur);
          c.chairIdx = c.enemies.indexOf(alive2[(ai + 1) % alive2.length]);
        }
      }
    }
    // 深谋/备战/摸鱼之道的每回合计数
    c.cardsThisTurn = 0;
    c.attacksThisTurn = 0;
    c.playerDealtDmgThisTurn = 0; // 高级VP「秋后算账」判定重置
  };

  // 玩家出牌。返回 { ok, error?, floaters? } 供 UI 做动画
  Engine.prototype.playCard = function (handIdx) {
    var st = this.state, c = st.combat;
    if (!c || c.over) return { ok: false, error: '战斗已结束' };
    var inst = c.hand[handIdx];
    if (!inst) return { ok: false, error: '无此牌' };
    var def = Engine.cardDef(inst);
    var cost = def.cost + (inst.costMod || 0); // 财务总监「成本核算」可附加费用
    // 机皇手柄：每回合第一张技能牌费用 -1
    if (def.type === 'skill' && this.hasRelic('gamepad') && !c.flags.gamepadUsed) {
      cost = Math.max(0, cost - 1);
    }
    // 赛博工位：每回合第一张攻击牌费用 -1
    if (def.type === 'attack' && this.hasRelic('cyberdesk') && !c.flags.attackPadUsed) {
      cost = Math.max(0, cost - 1);
    }
    // 【画饼】部门主管：画饼回合首张牌费用 -1
    if (c.bingTurn && !c.bingUsed) {
      cost = Math.max(0, cost - 1);
      c.bingUsed = true;
    }
    // 【报销审核】财务主管在场：每回合第一张 ≥2 费的牌先交 3 金，交不起效果减半
    var auditHalve = false;
    if (!c.multi && c.enemy._def.mechanic === 'expenseAudit' && !c.auditUsed && cost >= 2) {
      c.auditUsed = true;
      if (st.gold >= 3) { st.gold -= 3; }
      else { auditHalve = true; }
    }
    if (c.energy < cost) return { ok: false, error: '能量不足' };
    // 【预算审核】财务总监在场：每回合出牌费用合计不能超过 4 点
    if (!c.multi && c.enemy._def.mechanic === 'budget' && c.spentThisTurn + cost > 4) {
      return { ok: false, error: '超出预算！本回合剩余预算 ' + (4 - c.spentThisTurn) + ' 点' };
    }
    c.energy -= cost;
    c.spentThisTurn += cost;
    if (def.type === 'skill' && this.hasRelic('gamepad') && !c.flags.gamepadUsed) {
      c.flags.gamepadUsed = true;
    }
    if (def.type === 'attack' && this.hasRelic('cyberdesk') && !c.flags.attackPadUsed) {
      c.flags.attackPadUsed = true;
    }
    c.hand.splice(handIdx, 1);
    var result = { ok: true, card: def, dmgToEnemy: 0, dmgToPlayer: 0, blockGained: 0, healGained: 0, hits: [] };
    // 【行政摊派】行政主管在场：每打出 1 张牌交 1 金币（没金币改罚 2 精力）
    if (!c.multi && c.enemy._def.mechanic === 'adminFee') {
      if (st.gold >= 1) { st.gold -= 1; result.adminFeeGold = (result.adminFeeGold || 0) + 1; }
      else { st.hp -= 2; result.adminFeeHp = (result.adminFeeHp || 0) + 2; result.dmgToPlayer += 2; }
    }
    // 【代理决策】记录本回合第一张技能牌（供摸鱼副总下回合复制）
    if (def.type === 'skill' && !c.firstSkill) c.firstSkill = { id: inst.id, up: !!inst.up };
    var self = this;

    // 圣物伤害加成：键盘（攻击牌每段 +1）、黑暗剑穗（对精英/BOSS +2）
    var atkBonus = 0;
    if (def.type === 'attack' && this.hasRelic('keyboard_rel')) atkBonus += 1;
    var edef2 = c.enemy._def;
    if (this.hasRelic('sword_tassel') && (edef2.elite || edef2.boss)) atkBonus += 2;

    // 伤害结算管线（顺序固定，测试锁定）：
    // 基础值 + 固定加成（力量/圣物/深谋/钞能/血怒）→ 虚弱 → 易伤
    function dealDamage(base) {
      var dmg = base + atkBonus + c.playerStrength;
      // 深谋：机皇打出攻击牌时，每有 2 张其他剩余手牌伤害 +1（打出瞬间手牌已减该牌）
      if (def.type === 'attack' && st.charId === 'jihuang') dmg += Math.floor(c.hand.length / 2);
      // 钞能：爽老鸭每有 50 金币伤害 +1（与深谋同级固定值相加）
      if (st.charId === 'shuanglaoya') dmg += Math.floor(st.gold / 50);
      // 血怒：剩饭每缺少 BLOODRAGE_PER 点精力，伤害 +1（固定值，与力量同级）
      if (st.charId === 'shengfan') dmg += Math.min(Engine.BLOODRAGE_CAP, Math.floor((st.maxHp - st.hp) / Engine.BLOODRAGE_PER));
      if (c.playerWeak > 0) dmg = Math.floor(dmg * 0.75);
      if (c.enemy.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
      // 【轮值主席】董事会：打非轮值董事伤害减半
      if (c.multi && c.enemies && c.enemies[c.chairIdx] && c.enemy !== c.enemies[c.chairIdx]) {
        dmg = Math.floor(dmg / 2);
      }
      if (auditHalve) dmg = Math.ceil(dmg / 2); // 【报销审核】交不起 3 金：效果减半
      if (dmg < 0) dmg = 0;
      // 敌人格挡
      var absorbed = Math.min(c.enemy.block, dmg);
      c.enemy.block -= absorbed;
      var through = dmg - absorbed;
      c.enemy.hp -= through;
      result.dmgToEnemy += through;
      c.playerDealtDmgThisTurn += through;
      result.hits.push(through);
      if (through > st.maxHit) st.maxHit = through; // 单局最高伤害统计
    }

    def.effects.forEach(function (ef) {
      switch (ef.op) {
        case 'damage': {
          var times = ef.times || 1;
          for (var i = 0; i < times; i++) dealDamage(ef.value);
          break;
        }
        case 'block': {
          // 鼠标垫：技能牌格挡 +2
          var bv = ef.value;
          if (def.type === 'skill' && self.hasRelic('mousepad')) bv += 2;
          if (auditHalve) bv = Math.ceil(bv / 2); // 【报销审核】效果减半
          c.playerBlock += bv; result.blockGained += bv;
          break;
        }
        case 'draw': self._draw(ef.value); break;
        case 'heal': {
          // 小面仙人：回复效果 +2
          var hv = ef.value;
          if (self.hasRelic('noodle_god')) hv += 2;
          if (auditHalve) hv = Math.ceil(hv / 2); // 【报销审核】效果减半
          var hpBeforeHeal = st.hp;
          st.hp = Math.min(st.maxHp, st.hp + hv);
          // 只记录实际回复量，避免满血时飘字虚报
          result.healGained += st.hp - hpBeforeHeal;
          break;
        }
        case 'energy': c.energy += ef.value; break;
        case 'weak': c.enemy.weak += ef.value; break;
        case 'vulnerable': c.enemy.vulnerable += ef.value; break;
        case 'strength': c.playerStrength += ef.value; break;
        case 'selfDamage':
          // 卖血流安全网：自伤最多扣到 1 点精力，不会致死（耳鸣星护符判定不受影响）
          var hpBeforeSd = st.hp;
          st.hp = Math.max(1, st.hp - ef.value);
          result.dmgToPlayer += hpBeforeSd - st.hp;
          break;
        case 'skipEnemy': c.enemy.skipTurns += ef.value; break;
        case 'rerollIntent': {
          // 临时通知：打断敌人当前意图，重摇一个不同的行动（不含 every 排期招式）
          var cur = c.enemy.intent;
          var rpool = self._moves(c.enemy).filter(function (m) { return m !== cur && m.name !== (cur && cur.name) && !m.every; });
          if (rpool.length) {
            var rtotal = 0;
            rpool.forEach(function (m) { rtotal += (m.w || 1); });
            var rroll = self.rng() * rtotal, rpick = rpool[0];
            for (var ri = 0; ri < rpool.length; ri++) {
              rroll -= (rpool[ri].w || 1);
              if (rroll < 0) { rpick = rpool[ri]; break; }
            }
            c.enemy.intent = rpick;
            c.enemy.shownIntent = null;
            result.interrupted = cur ? cur.name : null;
          }
          break;
        }
        case 'maxHpUp': // 最大精力提升（本局有效），同时等量回复
          st.maxHp += ef.value;
          st.hp = Math.min(st.maxHp, st.hp + ef.value);
          result.healGained += ef.value;
          break;
        case 'gainGold': st.gold += ef.value; break;
        case 'loseGold': st.gold = Math.max(0, st.gold - ef.value); break;
        case 'goldDamage': {
          // 钞能力：每有 per 金币，伤害 +bonus（旧版为阈值 gte 达标追加，保留兼容）
          var gb = ef.value + (ef.per
            ? Math.floor(st.gold / ef.per) * (ef.bonus || 1)
            : (st.gold >= ef.gte ? ef.bonus : 0));
          var gtimes = ef.times || 1;
          for (var gi = 0; gi < gtimes; gi++) dealDamage(gb);
          break;
        }
        case 'power': {
          // 摸鱼境界：每张独立成条各自计数（多张叠出更强，不合并成大周期反向削弱）
          var existing = ef.id === 'realm' ? null : c.powers.filter(function (p) { return p.id === ef.id; })[0];
          if (existing) existing.value += ef.value;
          else c.powers.push({ id: ef.id, value: ef.value });
          break;
        }
        case 'special': {
          if (ef.kind === 'rua') dealDamage(ef.base + ef.per * c.attacksPlayed);
          else if (ef.kind === 'combo') {
            // 连环RUA：本回合此前每打出过 1 张其他牌 +per
            // （cardsThisTurn 在出牌结算之后才 +1，此处恰好不含本牌）
            dealDamage(ef.base + ef.per * c.cardsThisTurn);
          }
          else if (ef.kind === 'darksword') dealDamage(ef.base + ef.per * c.darkswordPlays);
          else if (ef.kind === 'spendall') {
            // 挥金如土：失去当前 pct 金币，造成失去金币 × per 的伤害（先扣金币再结算，钞能按剩余金币算；
            // per 可为 1.5 等小数，伤害取整）
            var spent = Math.floor(st.gold * (ef.pct || 0));
            st.gold -= spent;
            result.goldLost = (result.goldLost || 0) + spent;
            dealDamage(Math.floor(spent * ef.per));
          }
          else if (ef.kind === 'breakdown') {
            var lost = Math.max(0, c.combatStartHp - st.hp);
            dealDamage(Math.max(ef.min, Math.floor(lost * ef.pct)));
          } else if (ef.kind === 'calc') {
            dealDamage(ef.dmg);
            if (c.enemy.intent && c.enemy.intent.type === 'attack') {
              c.playerBlock += ef.blk; result.blockGained += ef.blk;
            }
          } else if (ef.kind === 'tarot') {
            self._draw(ef.draw);
            if (c.enemy.intent && c.enemy.intent.type === 'attack') {
              c.playerBlock += ef.blk; result.blockGained += ef.blk;
            }
          } else if (ef.kind === 'shuangdao') {
            var sb = ef.base;
            if (!c.enemy.intent || c.enemy.intent.type !== 'attack') sb += ef.bonus;
            dealDamage(sb);
          } else if (ef.kind === 'hunger') {
            // 饥饿咆哮：造成已损失精力 pct 的伤害（最低 min）
            dealDamage(Math.max(ef.min, Math.floor((st.maxHp - st.hp) * ef.pct)));
          } else if (ef.kind === 'allout') {
            // 全力以赴/弹药倾泻：当前手牌数（不含本牌）× per，可附加固定 base
            dealDamage((ef.base || 0) + c.hand.length * ef.per);
          } else if (ef.kind === 'discard') {
            // 清空回收站：弃掉全部手牌（打出后本牌已离手），抽回相同数量 +bonus
            var dn = c.hand.length;
            while (c.hand.length) c.discard.push(c.hand.pop());
            self._draw(dn + (ef.bonus || 0));
          } else if (ef.kind === 'prepare') {
            // 备战：抽 draw 张；若本回合只打出过这一张牌，再抽 bonus 张
            self._draw(ef.draw);
            if (c.cardsThisTurn === 0) self._draw(ef.bonus || 1);
          }
          break;
        }
        default: throw new Error('未知效果: ' + ef.op);
      }
    });

    // 统计
    c.cardsPlayed++;
    c.cardsThisTurn++;
    c.reviewCount++; // 【绩效考核】计数
    if (def.type === 'attack') { c.attacksPlayed++; c.attacksThisTurn++; }
    // 【内卷光环】卷王在场：玩家每打出 1 张牌，卷王力量 +1
    if (!c.multi && c.enemy._def.mechanic === 'juanAura') {
      c.enemy.strength += 1;
      result.auraStr = true;
    }
    // 【影子决策】记录本回合最后打出的攻击牌（供 VP 下回合复制）
    if (def.type === 'attack') {
      var atkVal = 0;
      def.effects.forEach(function (ef) { if (ef.op === 'damage') atkVal += ef.value * (ef.times || 1); });
      if (atkVal > 0) c.lastAttack = { name: def.name, value: atkVal };
    }
    if (inst.id === 'darksword') c.darkswordPlays++;
    // 摸鱼之道：每打出 5 张牌恢复 1 点能量（允许临时超过上限）
    if (st.charId === 'xiaoq' && c.cardsPlayed % Engine.ENERGY_CYCLE === 0) c.energy += 1;
    if (inst.id === 'darksword') c.darkswordPlays++;
    if (def.flavor) c.easterEgg = def.flavor;
    // 能力：摸鱼境界
    c.powers.forEach(function (p) {
      if (p.id === 'realm' && c.cardsPlayed % p.value === 0) self._draw(1);
    });
    // 消耗 or 弃牌（能力牌打出后进入消耗堆，本场战斗洗牌后也不会再抽到）
    if (def.exhaust || def.type === 'power') c.exhausted.push(inst);
    else c.discard.push(inst);

    this._afterDamageChecks(result);
    // BOSS 防秒杀①·半血打断：HP 首次跌破 50% 时强行打断玩家回合——弃掉剩余手牌、BOSS 立即
    // 免费行动一轮，之后恢复正常回合交替。数据驱动 edef.interrupt50（仅部分 Rush BOSS；
    // 主游戏 4/5/8 层 BOSS 已改走 phases 二阶段）；摸鱼强总（boss3）走写死路径，额外先进二阶段。
    // 均只触发一次，1vN 不触发。
    if (!c.over && !c.multi && c.enemy && c.enemy.hp > 0 && c.enemy.hp < c.enemy.maxHp * 0.5) {
      var isBoss3P1 = c.enemy.id === 'boss3' && c.enemy.phase === 0;
      var isInterrupt50 = !isBoss3P1 && c.enemy._def.interrupt50 && !c.enemy.interrupt50Used;
      if (isBoss3P1 || isInterrupt50) {
        if (isBoss3P1) {
          c.enemy.phase = 1;
          c.log.push({ t: 'phase', text: edef2.phases[1].phaseName || '第二阶段' });
        } else {
          c.enemy.interrupt50Used = true;
          c.log.push({ t: 'phase', text: 'BOSS 被激怒了！' });
        }
        // 强行打断：弃掉玩家剩余手牌（能量/未出的牌全部作废）
        // 机皇【攻略制定】：早有准备，可保留至多 3 张手牌（保手牌流不被完全清零）
        var keepN = st.charId === 'jihuang' ? 3 : 0;
        while (c.hand.length > keepN) c.discard.push(c.hand.pop());
        // BOSS 立刻行动一轮（打个措手不及）
        var ir = { dmgToPlayer: 0, enemyBlock: 0, skipped: false, over: false, hits: [], absorbed: [],
          reflected: 0, scarf: false, attacked: false, interrupt: true,
          cutText: isBoss3P1 ? '都给我加班！' : 'BOSS 被激怒了！' };
        this._chooseIntent(c.enemy);
        this._enemyAct(c.enemy, ir);
        this._afterDamageChecks(ir);
        result.interrupt = ir;
        // 玩家存活则直接进入新回合（重新抽牌），之后正常交替
        if (!c.over) {
          this._chooseIntent(c.enemy);
          this._startPlayerTurn();
        }
      }
    }
    return result;
  };

  // 每次伤害后检查生死
  Engine.prototype._afterDamageChecks = function (result) {
    var st = this.state, c = st.combat;
    // 敌方伤害归零时护符救一次（自伤已有 1 血下限保护，不会触发判负）
    if (st.hp <= 0 && this.hasRelic('ear_charm') && !c.flags.talismanUsed) {
      st.hp = 1; c.flags.talismanUsed = true;
      c.log.push({ t: 'relic', text: '耳鸣星护符发动！' });
    }
    if (c.multi) {
      // 1vN：逐个结算死亡（孤注一掷：每倒下一位，其余力量 +3；全灭才胜利）
      this._checkMultiDeaths(result);
      if (!c.over && st.hp <= 0) {
        st.hp = 0;
        this._loseCombat();
        if (result) result.lost = true;
      }
      return;
    }
    // BOSS 防秒杀②·残血不屈：首次受到致命伤害时以 1 HP 存活，随后立即反击行动一次
    // （数据驱动 edef.lastStand：6/7/9 层 BOSS 与部分 Rush BOSS；只触发一次，1vN 跳过）
    if (!c.over && c.enemy.hp <= 0 && c.enemy._def.lastStand && !c.enemy.lastStandUsed) {
      c.enemy.hp = 1;
      c.enemy.lastStandUsed = true;
      c.log.push({ t: 'phase', text: '垂死挣扎！' });
      var lr = { dmgToPlayer: 0, enemyBlock: 0, skipped: false, over: false, hits: [], absorbed: [],
        reflected: 0, scarf: false, attacked: false, lastStand: true, cutText: '垂死挣扎！' };
      this._chooseIntent(c.enemy);
      this._enemyAct(c.enemy, lr);
      if (result) result.lastStand = lr;
      // 反击可能打死玩家、也可能被反弹（剩饭护体）反杀：递归结算生死
      // （lastStandUsed 已置位，不会二次触发）
      this._afterDamageChecks(result);
      return;
    }
    if (c.enemy.hp <= 0) {
      c.enemy.hp = 0;
      if (st.hp < 0) st.hp = 0; // 同归于尽也先把精力归零（反弹击杀场景）
      this._winCombat();
      if (result) result.won = true;
    } else if (st.hp <= 0) {
      st.hp = 0;
      this._loseCombat();
      if (result) result.lost = true;
    }
  };

  // 1vN 死亡结算：标记死亡 → 其余存活者力量+3 → 重选目标 → 全灭判胜
  Engine.prototype._checkMultiDeaths = function (result) {
    var st = this.state, c = st.combat;
    if (!c.multi) return;
    for (var i = 0; i < c.enemies.length; i++) {
      var e = c.enemies[i];
      if (e.dead || e.hp > 0) continue;
      e.dead = true;
      e.hp = 0;
      result.deaths = result.deaths || [];
      result.deaths.push(i);
      for (var j = 0; j < c.enemies.length; j++) {
        if (!c.enemies[j].dead) c.enemies[j].strength += 3; // 孤注一掷 v5
      }
    }
    var alive = c.enemies.filter(function (e2) { return !e2.dead; });
    if (!alive.length) {
      if (st.hp < 0) st.hp = 0; // 同归于尽先归零
      this._winCombat();
      if (result) result.won = true;
      return;
    }
    // 当前目标死了 → 切到第一个存活者
    if (c.enemy.dead) {
      var ni = c.enemies.indexOf(alive[0]);
      c.target = ni;
      c.enemy = c.enemies[ni];
    }
  };

  Engine.prototype._winCombat = function () {
    var st = this.state, c = st.combat;
    c.over = true; c.won = true;
    // 【妙手空空】击败偷男：归还被偷的牌进弃牌堆
    if (c.stolenCards && c.stolenCards.length) {
      c.stolenCards.forEach(function (sc) { c.discard.push(sc); });
      c.log.push({ t: 'relic', text: '被偷的牌全部归还！' });
      c.stolenCards = [];
    }
    // 胜利回复
    if (this.hasRelic('chicken_bucket')) st.hp = Math.min(st.maxHp, st.hp + 2);
  };

  Engine.prototype._loseCombat = function () {
    var st = this.state, c = st.combat;
    c.over = true; c.won = false;
    st.over = true; st.victory = false;
  };

  // 单个敌人行动（1v1 与 1vN 共用）：机制钩子 → 应用被动 → 执行意图 → 机制结算 → debuff 衰减
  Engine.prototype._enemyAct = function (e, result) {
    var st = this.state, c = st.combat;
    var edef = e._def;
    e.block = 0; // 敌人格挡在其回合开始清零
    e.turnCount++;
    // 狂暴：BOSS 超过 12 回合 / 精英超过 15 回合（edef.enrageTurn 可覆盖）后，每回合力量 +3 滚雪球
    var enrT = edef.enrageTurn || ((edef.boss || c.rushBoss) ? 12 : edef.elite ? 15 : 0);
    if (enrT && e.turnCount > enrT) {
      if (!e.enraged) {
        e.enraged = true;
        result.enraged = true; // 首次狂暴：触发机制说明卡
        c.log.push({ t: 'phase', text: '狂暴！' });
      }
      e.strength += 3;
    }
    // rush BOSS 被动：每回合自动加力量/格挡
    if (edef.passiveStrength) e.strength += edef.passiveStrength;
    if (edef.passiveBlock) { e.block += edef.passiveBlock; result.enemyBlock = (result.enemyBlock || 0) + edef.passiveBlock; }
    var self = this;
    function enemyHit(base, mvRef) {
      // 精英随层数成长的攻击加成（dmgBonus）在此结算；销赃镜像（perGold）按玩家金币加伤
      // 艰难日（每日挑战）：敌人每段伤害 +1
      var mv = mvRef || {};
      var dmg = base + e.strength + (e.dmgBonus || 0) + (mv.perGold ? Math.floor(st.gold / mv.perGold) : 0) +
        (st.daily && st.daily.mod === 'hard' ? 1 : 0);
      if (e.weak > 0) dmg = Math.floor(dmg * 0.75);
      if (c.playerVuln > 0) dmg = Math.floor(dmg * 1.5);
      if (dmg < 0) dmg = 0;
      // 红围巾圣物：首次受伤为 0
      if (self.hasRelic('scarf_relic') && !c.flags.scarfUsed) {
        c.flags.scarfUsed = true;
        c.log.push({ t: 'relic', text: '红围巾挡下了攻击！' });
        dmg = 0;
        result.scarf = true;
      }
      var absorbed = mv.unblockable ? 0 : Math.min(c.playerBlock, dmg); // 【急速下坠】必中：无视格挡
      if (mv.unblockable) result.unblockableFired = true;
      c.playerBlock -= absorbed;
      var through = dmg - absorbed;
      st.hp -= through;
      result.dmgToPlayer += through;
      result.hits.push(through);
      result.absorbed.push(absorbed);
      // 剩饭护体：反弹（打当前行动的敌人）
      c.powers.forEach(function (p) {
        if (p.id === 'leftover_shield') {
          var ref = p.value;
          var ra = Math.min(e.block, ref);
          e.block -= ra;
          e.hp -= (ref - ra);
          result.reflected += ref;
        }
      });
    }
    // 【全渠道投放】市场主管：伤害随玩家圣物数量 +2/件
    if (edef.mechanic === 'marketing') { e.dmgBonus = st.relics.length * 2; result.mktBonus = e.dmgBonus; }
    // 【画饼】部门主管：每 3 回合——玩家下回合首张牌费用 -1（当回合没打攻击牌吃 8 点失望）
    if (edef.mechanic === 'bingTu' && e.turnCount % 3 === 0) { c.bingNext = true; result.bingTu = true; }
    // 【优化名单】HR：每 4 回合从玩家弃牌堆随机“优化”2 张（本场战斗移除）
    if (edef.mechanic === 'optimize' && e.turnCount % 4 === 0 && c.discard.length) {
      result.optimized = result.optimized || [];
      for (var opz = 0; opz < 2 && c.discard.length; opz++) {
        var oi = self.rng.int(c.discard.length);
        var oCard = c.discard.splice(oi, 1)[0];
        c.exhausted.push(oCard);
        result.optimized.push(Engine.cardDef(oCard).name);
      }
    }
    // 【上线冲刺】技术主管：每 4 回合双倍攻击，下回合宕机跳过
    var sprintDbl = edef.mechanic === 'sprint' && e.turnCount % 4 === 0;
    function execMove(mv) {
      switch (mv.type) {
        case 'attack': {
          result.attacked = true;
          var hStart = result.hits.length; // 打击感演出：记录本次行动的命中区间
          var times = (mv.times || 1) * (sprintDbl ? 2 : 1);
          for (var i = 0; i < times; i++) enemyHit(mv.value, mv);
          (result.actions = result.actions || []).push({
            id: e.id, name: mv.name + (sprintDbl ? '·双倍' : ''), special: !!mv.every || sprintDbl, hs: hStart, he: result.hits.length
          });
          if (mv.weak) c.playerWeak += mv.weak;
          if (mv.vulnerable) c.playerVuln += mv.vulnerable;
          if (mv.strength) e.strength += mv.strength;
          break;
        }
        case 'block': e.block += mv.value; result.enemyBlock = (result.enemyBlock || 0) + mv.value; break;
        case 'debuff':
          if (mv.weak) c.playerWeak += mv.weak;
          if (mv.vulnerable) c.playerVuln += mv.vulnerable;
          break;
        case 'buff': if (mv.strength) e.strength += mv.strength; break;
        case 'charge': break; // 蓄力仅作为意图提示
        case 'heal': e.hp = Math.min(e.maxHp, e.hp + mv.value); break;
        case 'stealGold': { // 偷男：偷取玩家金币（不造成伤害）；pct 按当前金币比例偷（保底 min），否则固定 value
          var stolen = mv.pct
            ? Math.max(mv.min || 0, Math.floor(st.gold * mv.pct))
            : mv.value;
          stolen = Math.min(st.gold, stolen);
          st.gold -= stolen;
          result.stolenGold = (result.stolenGold || 0) + stolen;
          break;
        }
        case 'costUp': { // 财务总监「成本核算」：随机 N 张（手牌+抽牌堆）本场费用 +1
          var pool3 = c.hand.concat(c.drawPile);
          var n = Math.min(mv.value, pool3.length);
          for (var k = 0; k < n; k++) {
            var idx = self.rng.int(pool3.length);
            var inst = pool3.splice(idx, 1)[0];
            inst.costMod = (inst.costMod || 0) + 1;
            result.costUpCards = (result.costUpCards || 0) + 1;
          }
          break;
        }
        case 'counter': { // 高级VP「秋后算账」：玩家本回合未造成伤害则重锤
          result.attacked = true;
          var hStart2 = result.hits.length;
          enemyHit(c.playerDealtDmgThisTurn === 0 ? mv.value : mv.fallback, mv);
          (result.actions = result.actions || []).push({
            id: e.id, name: mv.name, special: !!mv.every, hs: hStart2, he: result.hits.length
          });
          break;
        }
      }
    }
    if (e.skipTurns > 0) {
      e.skipTurns--;
      result.skipped = true;
    } else if (e.intent) {
      execMove(e.intent);
      // 【日程即圣旨】秘书A先生：每 4 回合临时插入一次额外行动
      if (edef.mechanic === 'agenda' && e.turnCount % 4 === 0 && !e.dead) {
        result.extraAction = true;
        execMove(e.intent);
      }
      // 【上线冲刺】双倍攻击后下回合宕机
      if (sprintDbl && !e.dead) { e.skipTurns += 1; result.sprint = true; }
    }
    // 【代理决策】摸鱼副总：复制玩家上一回合第一张技能牌为自己所用
    if (edef.mechanic === 'agentCopy' && c.prevFirstSkill && !e.dead) {
      var skBase = D.cards[c.prevFirstSkill.id];
      var skDef = (c.prevFirstSkill.up && skBase.up) ? Object.assign({}, skBase, skBase.up) : skBase;
      result.agentCopy = skDef.name;
      (skDef.effects || []).forEach(function (ef) {
        if (ef.op === 'block') { e.block += ef.value; result.enemyBlock = (result.enemyBlock || 0) + ef.value; }
        else if (ef.op === 'heal') e.hp = Math.min(e.maxHp, e.hp + ef.value);
        else if (ef.op === 'strength') e.strength += ef.value;
        else if (ef.op === 'weak') c.playerWeak += ef.value;
        else if (ef.op === 'vulnerable') c.playerVuln += ef.value;
      });
    }
    // 【影子决策】高级VP：复制玩家上一回合最后打出的攻击牌（按其数值）打回
    if (edef.mechanic === 'mirror' && c.prevAttack && !e.dead) {
      result.attacked = true;
      var mh = result.hits.length;
      enemyHit(c.prevAttack.value, {});
      (result.actions = result.actions || []).push({
        id: e.id, name: '影子决策·' + c.prevAttack.name, special: false, hs: mh, he: result.hits.length
      });
      result.mirrored = c.prevAttack.name;
    }
    // 【绩效考核】人力总监：每 3 回合结算——前 3 回合出牌 <9 张罚 24，≥9 张自伤 12
    if (edef.mechanic === 'review' && e.turnCount % 3 === 0 && !e.dead) {
      if (c.reviewCount < 9) {
        result.attacked = true;
        var rh = result.hits.length;
        enemyHit(24, {});
        (result.actions = result.actions || []).push({
          id: e.id, name: '绩效考核·不合格', special: true, hs: rh, he: result.hits.length
        });
        result.reviewPen = 24;
      } else {
        e.hp -= 12;
        result.reviewSelf = 12;
      }
      c.reviewCount = 0; // 进入下一考核周期
    }
    // 敌人 debuff 衰减
    if (e.weak > 0) e.weak--;
    if (e.vulnerable > 0) e.vulnerable--;
    this._checkPhase(e);
  };

  // 结束回合：弃手牌 → 敌人行动 → 结算 → 新回合
  Engine.prototype.endTurn = function () {
    var st = this.state, c = st.combat;
    if (!c || c.over) return { over: true };
    var result = { dmgToPlayer: 0, enemyBlock: 0, skipped: false, over: false, hits: [], absorbed: [], reflected: 0, scarf: false, attacked: false };
    // 【逾期罚款】会议室秘书长 v2：回合结束时手里每张未打出的「议题」罚 3 金币，
    // 逐张结算：先扣金，金不够扣 2 点精力（打出议题=完成工作，不罚）
    if (!c.multi && c.enemy._def.mechanic === 'junkCard' && !c.enemy.dead) {
      var yitis = c.hand.filter(function (x) { return x.id === 'yiti'; });
      if (yitis.length) {
        var fineG = 0, fineH = 0;
        yitis.forEach(function () {
          if (st.gold >= 3) { st.gold -= 3; fineG += 3; }
          else { fineG += st.gold; st.gold = 0; st.hp -= 2; fineH += 2; }
        });
        result.fineCount = yitis.length;
        result.fineGold = fineG;
        result.fineHp = fineH;
        c.log.push({ t: 'sys', text: '逾期罚款：-' + fineG + ' 金币' + (fineH ? '，-' + fineH + ' 精力' : '') });
        if (fineH > 0) {
          result.attacked = true;
          var fh = result.hits.length;
          result.hits.push(fineH);
          result.absorbed.push(0);
          result.dmgToPlayer += fineH;
          (result.actions = result.actions || []).push({
            id: c.enemy.id, name: '逾期罚款', special: false, hs: fh, he: result.hits.length
          });
          this._afterDamageChecks(result);
        }
      }
    }
    // 【妙手空空】偷男：敌方回合开始（弃牌前）偷走玩家随机 1 张手牌，击败他归还
    if (!c.multi && c.enemy._def.mechanic === 'stealCard' && !c.enemy.dead && c.hand.length) {
      var si = this.rng.int(c.hand.length);
      var stolenC = c.hand.splice(si, 1)[0];
      c.stolenCards.push(stolenC);
      result.stolenCardName = Engine.cardDef(stolenC).name;
    }
    // 【需求变更】项目经理：每 2 回合（弃牌前）随机改玩家 1 张手牌费用 ±1（不低于 0）
    if (!c.multi && c.enemy._def.mechanic === 'reqChange' && !c.enemy.dead &&
        (c.enemy.turnCount + 1) % 2 === 0 && c.hand.length) {
      var rc = c.hand[this.rng.int(c.hand.length)];
      var rcDef = Engine.cardDef(rc);
      var delta = this.rng() < 0.5 ? -1 : 1;
      var curCost = rcDef.cost + (rc.costMod || 0);
      if (curCost + delta < 0) delta = -curCost;
      rc.costMod = (rc.costMod || 0) + delta;
      result.reqChange = { name: rcDef.name, delta: delta };
    }
    // 深谋：机皇本回合没打出过攻击牌时，手牌全部保留到下回合；否则照常弃牌
    var keepHand = st.charId === 'jihuang' && c.attacksThisTurn === 0;
    if (!keepHand) while (c.hand.length) c.discard.push(c.hand.pop());
    // 玩家 debuff 衰减
    if (c.playerWeak > 0) c.playerWeak--;
    if (c.playerVuln > 0) c.playerVuln--;
    // 【影子决策】快照本回合最后攻击牌，供 VP 下回合复制
    c.prevAttack = c.lastAttack;
    c.lastAttack = null;
    // 【代理决策】快照本回合第一张技能牌，供摸鱼副总下回合复制
    c.prevFirstSkill = c.firstSkill;
    c.firstSkill = null;
    // 【画饼】失望：画饼回合结束玩家没打出过攻击牌 → 受 8 点失望伤害
    if (!c.multi && c.enemy._def.mechanic === 'bingTu' && c.bingTurn && c.attacksThisTurn === 0 && !c.enemy.dead) {
      result.attacked = true;
      var bAbs = Math.min(c.playerBlock, 8);
      c.playerBlock -= bAbs;
      var bThrough = 8 - bAbs;
      st.hp -= bThrough;
      result.dmgToPlayer += bThrough;
      var bh2 = result.hits.length;
      result.hits.push(bThrough);
      result.absorbed.push(bAbs);
      (result.actions = result.actions || []).push({
        id: c.enemy.id, name: '失望', special: false, hs: bh2, he: result.hits.length
      });
      result.bingtuMiss = true;
      this._afterDamageChecks(result);
    }

    if (c.multi) {
      // 1vN：存活董事按顺序各自行动
      for (var mi = 0; mi < c.enemies.length; mi++) {
        var me = c.enemies[mi];
        if (me.dead) continue;
        this._enemyAct(me, result);
        this._afterDamageChecks(result);
        this._checkMultiDeaths(result);
        if (c.over) break;
      }
    } else {
      this._enemyAct(c.enemy, result);
    }

    this._afterDamageChecks(result);
    if (!c.over) {
      if (c.multi) {
        var self2 = this;
        c.enemies.forEach(function (e2) { if (!e2.dead) self2._chooseIntent(e2); });
      } else {
        this._chooseIntent(c.enemy);
      }
      this._startPlayerTurn();
    }
    result.over = c.over;
    result.won = c.won;
    return result;
  };

  /* ---------- 战斗奖励 ---------- */
  Engine.prototype.genReward = function () {
    var st = this.state;
    var nodeType = st.lastNodeType || 'monster';
    var gold = nodeType === 'elite' ? 25 + this.rng.int(16)
      : nodeType === 'boss' ? 40 + this.rng.int(21)
      : 10 + this.rng.int(11);
    if (st.daily && st.daily.mod === 'generous') gold = Math.floor(gold * 1.5); // 慷慨日：奖励金币 +50%
    var choices = [];
    var used = {};
    while (choices.length < 3) {
      var id = this._weightedCard();
      if (used[id]) continue;
      used[id] = true;
      choices.push(id);
    }
    choices.forEach(function (id) { st.seen.cards[id] = true; });
    // 精英/Boss 额外掉圣物
    var relicId = null;
    if (nodeType === 'elite' || nodeType === 'boss') {
      var pool = Object.keys(D.relics).filter(function (r) {
        return st.relics.indexOf(r) < 0;
      });
      if (pool.length) relicId = this.rng.pick(pool);
    }
    return { gold: gold, cards: choices, relic: relicId };
  };

  Engine.prototype.takeRewardCard = function (reward, idx) {
    var st = this.state;
    var inst = { uid: st.uidCounter++, id: reward.cards[idx], up: false };
    st.deck.push(inst);
    this._seeCard(inst);
    return inst;
  };

  Engine.prototype.takeReward = function (reward) {
    var st = this.state;
    st.gold += reward.gold;
    if (reward.relic) this.addRelic(reward.relic);
  };

  /* ---------- 商店 ---------- */
  Engine.prototype._genShop = function () {
    var st = this.state;
    var discount = this.hasRelic('sunglasses') ? 0.8 : 1;
    function price(base) { return Math.round(base * discount); }
    var cards = [];
    var used = {};
    var cardCount = st.charId === 'shuanglaoya' ? 4 : 3; // 财力支柱：商品 +1 格
    while (cards.length < cardCount) {
      var id = this._weightedCard();
      if (used[id]) continue;
      used[id] = true;
      var r = D.cards[id].rarity;
      cards.push({
        id: id,
        price: price(r === 'common' ? 45 + this.rng.int(11) : r === 'uncommon' ? 70 + this.rng.int(16) : 105 + this.rng.int(21)),
        sold: false
      });
    }
    var relicPool = Object.keys(D.relics).filter(function (r) { return st.relics.indexOf(r) < 0; });
    this.rng.shuffle(relicPool);
    var relicItems = relicPool.slice(0, 2).map(function (rid) {
      return { id: rid, price: price(D.relics[rid].price), sold: false };
    });
    var removeFree = this.hasRelic('membercard');
    return {
      cards: cards,
      relics: relicItems,
      removePrice: removeFree ? 0 : price(75),
      removeUsed: false,
      copyUsed: false      // 复制牌服务：每店 1 次，价格按所选牌稀有度
    };
  };

  // 复制一张牌：付费按稀有度（普通 70 / 罕见 100 / 稀有 150，墨镜 8 折），复制为基础版（不复制升级态）
  Engine.prototype.shopCopyCard = function (shop, cardUid) {
    var st = this.state;
    var inst = st.deck.filter(function (c) { return c.uid === cardUid; })[0];
    if (!inst || shop.copyUsed) return false;
    var rarity = D.cards[inst.id].rarity;
    var base = rarity === 'common' ? 70 : rarity === 'uncommon' ? 100 : 150;
    var cost = Math.round(base * (this.hasRelic('sunglasses') ? 0.8 : 1));
    if (st.gold < cost) return false;
    st.gold -= cost;
    shop.copyUsed = true;
    var copy = { uid: st.uidCounter++, id: inst.id, up: false };
    st.deck.push(copy);
    this._seeCard(copy);
    return true;
  };

  Engine.prototype.shopBuyCard = function (shop, idx) {
    var st = this.state;
    var item = shop.cards[idx];
    if (!item || item.sold || st.gold < item.price) return false;
    st.gold -= item.price;
    item.sold = true;
    var inst = { uid: st.uidCounter++, id: item.id, up: false };
    st.deck.push(inst);
    this._seeCard(inst);
    st.seen.cards[item.id] = true;
    return true;
  };

  Engine.prototype.shopBuyRelic = function (shop, idx) {
    var st = this.state;
    var item = shop.relics[idx];
    if (!item || item.sold || st.gold < item.price) return false;
    st.gold -= item.price;
    item.sold = true;
    this.addRelic(item.id);
    return true;
  };

  Engine.prototype.shopRemoveCard = function (shop, cardUid) {
    var st = this.state;
    if (shop.removeUsed || st.gold < shop.removePrice) return false;
    var i = st.deck.findIndex(function (c) { return c.uid === cardUid; });
    if (i < 0) return false;
    st.gold -= shop.removePrice;
    shop.removeUsed = true;
    st.deck.splice(i, 1);
    return true;
  };

  /* ---------- 休息 ---------- */
  Engine.prototype.restHeal = function () {
    var st = this.state;
    var amt = Math.floor(st.maxHp * 0.3);
    if (st.daily && st.daily.mod === 'hunger') amt = Math.floor(amt / 2); // 饥饿日：休息回血减半（向下取整）
    if (this.hasRelic('bowl')) amt += 10;
    st.hp = Math.min(st.maxHp, st.hp + amt);
    return amt;
  };

  Engine.prototype.restUpgrade = function (cardUid) {
    var st = this.state;
    var inst = st.deck.filter(function (c) { return c.uid === cardUid; })[0];
    if (!inst || inst.up) return false;
    inst.up = true;
    return true;
  };

  /* ---------- 事件 ---------- */
  // 应用事件选项。需要选牌的效果返回 { needChoice: 'remove' } 等，由调用方继续
  Engine.prototype.applyEvent = function (eventId, optIdx) {
    var st = this.state;
    var ev = D.events[eventId];
    if (!ev) throw new Error('未知事件: ' + eventId);
    var opt = ev.options[optIdx];
    if (!opt) throw new Error('非法选项');
    var res = { effect: opt.effect, text: '' };
    switch (opt.effect) {
      case 'leave': res.text = '你离开了。'; break;
      case 'buyChicken':
        if (st.gold < (opt.gold || 0)) { res.text = '金币不够，你尴尬地离开了。'; break; }
        st.gold -= opt.gold;
        var inst = { uid: st.uidCounter++, id: 'chicken', up: false };
        st.deck.push(inst); this._seeCard(inst);
        res.text = '获得了卡牌「香香鸡」！';
        break;
      case 'heal10':
        st.hp = Math.min(st.maxHp, st.hp + 10);
        res.text = '回复了 10 点精力。';
        break;
      case 'heal12':
        st.hp = Math.min(st.maxHp, st.hp + 12);
        res.text = '回复了 12 点精力。';
        break;
      case 'maxHp4':
        st.maxHp += 4; st.hp += 4;
        res.text = '最大精力 +4！';
        break;
      case 'randomCard': {
        var cid = this._weightedCard();
        var inst2 = { uid: st.uidCounter++, id: cid, up: false };
        st.deck.push(inst2); this._seeCard(inst2);
        res.text = '获得了卡牌「' + D.cards[cid].name + '」！';
        break;
      }
      case 'lose5getRare': {
        st.hp = Math.max(1, st.hp - 5);
        var rares = Engine.cardPool(st.charId).filter(function (id) {
          return D.cards[id].rarity === 'rare';
        });
        var rid = this.rng.pick(rares);
        var inst3 = { uid: st.uidCounter++, id: rid, up: false };
        st.deck.push(inst3); this._seeCard(inst3);
        res.text = '失去了 5 点精力，获得稀有牌「' + D.cards[rid].name + '」！';
        break;
      }
      case 'upgrade2': {
        var upgradable = st.deck.filter(function (c) { return !c.up; });
        this.rng.shuffle(upgradable);
        upgradable.slice(0, 2).forEach(function (c) { c.up = true; });
        res.text = upgradable.length ? '升级了 ' + Math.min(2, upgradable.length) + ' 张牌！' : '没有可升级的牌。';
        break;
      }
      case 'transform1': {
        var idx = this.rng.int(st.deck.length);
        var nid = this._weightedCard();
        var ni = { uid: st.uidCounter++, id: nid, up: false };
        st.deck.splice(idx, 1, ni); this._seeCard(ni);
        res.text = '一张牌变换成了「' + D.cards[nid].name + '」！';
        break;
      }
      case 'maxHp3':
        st.maxHp += 3; st.hp = Math.min(st.maxHp, st.hp + 3);
        res.text = '最大精力 +3！';
        break;
      case 'lose5randomCard': {
        st.hp = Math.max(1, st.hp - 5);
        var cid5 = this._weightedCard();
        var inst5 = { uid: st.uidCounter++, id: cid5, up: false };
        st.deck.push(inst5); this._seeCard(inst5);
        res.text = '失去了 5 点精力，获得卡牌「' + D.cards[cid5].name + '」！';
        break;
      }
      case 'upgrade1': {
        var ups = st.deck.filter(function (cc) { return !cc.up; });
        if (ups.length) {
          var pick1 = this.rng.pick(ups);
          pick1.up = true;
          res.text = '升级了「' + D.cards[pick1.id].name + '」！';
        } else res.text = '没有可升级的牌。';
        break;
      }
      case 'heal6':
        st.hp = Math.min(st.maxHp, st.hp + 6);
        res.text = '回复了 6 点精力。';
        break;
      case 'lottery':
        if (st.gold < (opt.gold || 0)) { res.text = '金币不够，你尴尬地离开了。'; break; }
        st.gold -= opt.gold;
        if (this.rng() < 0.5) {
          st.gold += 80;
          res.text = '中了！获得 80 金币！';
        } else {
          res.text = '谢谢惠顾……20 金币打水漂了。';
        }
        break;
      case 'buyRelic15': {
        if (st.gold < (opt.gold || 0)) { res.text = '金币不够，你尴尬地离开了。'; break; }
        var rp15 = Object.keys(D.relics).filter(function (r) { return st.relics.indexOf(r) < 0; });
        if (!rp15.length) { res.text = '同事的小玩意被你挑完了。'; break; }
        st.gold -= opt.gold;
        var rid15 = this.rng.pick(rp15);
        st.relics.push(rid15);
        st.seen.relics[rid15] = true;
        res.text = '失去了 15 金币，获得圣物「' + D.relics[rid15].name + '」！';
        break;
      }
      case 'buyRare10': {
        if (st.gold < (opt.gold || 0)) { res.text = '金币不够，你尴尬地离开了。'; break; }
        var rares10 = Engine.cardPool(st.charId).filter(function (id) {
          return D.cards[id].rarity === 'rare';
        });
        var rid10 = this.rng.pick(rares10);
        var inst10 = { uid: st.uidCounter++, id: rid10, up: false };
        st.deck.push(inst10); this._seeCard(inst10);
        st.gold -= opt.gold;
        res.text = '失去了 10 金币，获得稀有牌「' + D.cards[rid10].name + '」！';
        break;
      }
      case 'lose4getNoding': {
        st.hp = Math.max(1, st.hp - 4);
        var inst4 = { uid: st.uidCounter++, id: 'noding', up: false };
        st.deck.push(inst4); this._seeCard(inst4);
        res.text = '失去了 4 点精力，获得卡牌「摸鱼禁止」！';
        break;
      }
      case 'nothing': res.text = '老板满意地点点头，走了。'; break;
      case 'randomUncommon': {
        var unc = Engine.cardPool(st.charId).filter(function (id) {
          return D.cards[id].rarity === 'uncommon';
        });
        var uid2 = this.rng.pick(unc);
        var ui2 = { uid: st.uidCounter++, id: uid2, up: false };
        st.deck.push(ui2); this._seeCard(ui2);
        res.text = '获得了罕见牌「' + D.cards[uid2].name + '」！';
        break;
      }
      case 'buyRelic': {
        if (st.gold < (opt.gold || 0)) { res.text = '金币不够，你尴尬地离开了。'; break; }
        var rp = Object.keys(D.relics).filter(function (r) {
          return st.relics.indexOf(r) < 0;
        });
        if (!rp.length) { res.text = '周边卖光了。'; break; }
        st.gold -= opt.gold;
        var rid2 = this.rng.pick(rp);
        this.addRelic(rid2);
        res.text = '获得了圣物「' + D.relics[rid2].name + '」！';
        break;
      }
      case 'heal6randomCard': {
        st.hp = Math.min(st.maxHp, st.hp + 6);
        var rc = this._weightedCard();
        var ri = { uid: st.uidCounter++, id: rc, up: false };
        st.deck.push(ri); this._seeCard(ri);
        res.text = '回复了 6 点精力，获得卡牌「' + D.cards[rc].name + '」！';
        break;
      }
      case 'lose4upgrade2': {
        st.hp = Math.max(1, st.hp - 4);
        var up2 = st.deck.filter(function (cc) { return !cc.up; });
        this.rng.shuffle(up2);
        up2.slice(0, 2).forEach(function (cc) { cc.up = true; });
        res.text = '失去了 4 点精力，升级了 ' + Math.min(2, up2.length) + ' 张牌！';
        break;
      }
      case 'heal8':
        st.hp = Math.min(st.maxHp, st.hp + 8);
        res.text = '回复了 8 点精力。';
        break;
      case 'getChicken': {
        var ci = { uid: st.uidCounter++, id: 'chicken', up: false };
        st.deck.push(ci); this._seeCard(ci);
        res.text = '获得了卡牌「香香鸡」！';
        break;
      }
      case 'lose5getAttack': {
        st.hp = Math.max(1, st.hp - 5);
        var atks = Engine.cardPool(st.charId).filter(function (id) {
          return D.cards[id].type === 'attack';
        });
        var aid = this.rng.pick(atks);
        var ai = { uid: st.uidCounter++, id: aid, up: false };
        st.deck.push(ai); this._seeCard(ai);
        res.text = '失去了 5 点精力，获得攻击牌「' + D.cards[aid].name + '」！';
        break;
      }
      case 'removeCard':
        res.needChoice = 'remove';
        res.text = '选择要移除的牌。';
        break;
      default: throw new Error('未知事件效果: ' + opt.effect);
    }
    return res;
  };

  Engine.prototype.removeCardByUid = function (cardUid) {
    var st = this.state;
    var i = st.deck.findIndex(function (c) { return c.uid === cardUid; });
    if (i < 0) return false;
    st.deck.splice(i, 1);
    return true;
  };

  /* ---------- 图鉴/持久化辅助（纯数据，存储由调用方负责） ---------- */
  Engine.prototype.unlockSummary = function () {
    var st = this.state;
    return {
      floorsCleared: st.floorsCleared,
      victory: st.victory,
      seen: st.seen
    };
  };

  /* ---------- 存档码与战绩簿（纯函数，Node 可测） ---------- */
  // Base64(UTF-8) 编解码，浏览器 btoa/atob 与 Node 全局均可用
  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  /* ---------- 元存档版本迁移与统计（纯函数，Node 可测） ---------- */
  var SAVE_VERSION = 2; // 当前元存档版本；无 saveVer 的旧存档一律视为 v1

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  // 统计默认值（成就系统铺路）：各角色场次/胜场按角色表预填
  function defaultStats() {
    var chars = {};
    for (var cid in D.characters) chars[cid] = { runs: 0, wins: 0 };
    return { runs: 0, wins: 0, maxFloor: 0, bossKills: 0, bestHit: 0, chars: chars };
  }

  // 统计字段自愈：缺键/错类型补默认，已有合法值保留
  function normalizeStats(st) {
    var d = defaultStats();
    if (!isObj(st)) return d;
    ['runs', 'wins', 'maxFloor', 'bossKills', 'bestHit'].forEach(function (k) {
      if (typeof st[k] !== 'number' || !isFinite(st[k]) || st[k] < 0) st[k] = d[k];
    });
    if (!isObj(st.chars)) st.chars = {};
    for (var cid in d.chars) {
      var cs = st.chars[cid];
      if (!isObj(cs)) { st.chars[cid] = { runs: 0, wins: 0 }; continue; }
      if (typeof cs.runs !== 'number' || cs.runs < 0) cs.runs = 0;
      if (typeof cs.wins !== 'number' || cs.wins < 0) cs.wins = 0;
    }
    return st;
  }

  // 逐级迁移表：键 = 起始版本；每步只负责升一级
  var SAVE_MIGRATIONS = {
    // v1 → v2：新增 stats 统计对象（为成就系统铺路）
    1: function (sv) {
      sv.stats = normalizeStats(sv.stats);
      sv.saveVer = 2;
      return sv;
    }
  };

  // 把旧版元存档逐级迁移到 SAVE_VERSION；结构非法返回 null（由调用方回退默认存档）
  function migrateSave(raw) {
    if (!isObj(raw)) return null;
    // 关键容器存在但类型错 = 结构非法；缺键允许（由调用方按缺省合并补齐）
    if ('unlocks' in raw && !isObj(raw.unlocks)) return null;
    if ('codex' in raw && !isObj(raw.codex)) return null;
    if ('history' in raw && !Array.isArray(raw.history)) return null;
    var ver = (typeof raw.saveVer === 'number' && raw.saveVer >= 1) ? Math.floor(raw.saveVer) : 1;
    if (ver > SAVE_VERSION) return null; // 更高版本的存档不认识，拒绝以免旧客户端误写
    var sv = raw;
    while (ver < SAVE_VERSION) {
      var step = SAVE_MIGRATIONS[ver];
      if (!step) return null;
      sv = step(sv);
      if (!isObj(sv) || sv.saveVer !== ver + 1) return null; // 迁移步必须恰好升一级
      ver = sv.saveVer;
    }
    return sv;
  }

  // run 结束时累计统计（main.js gameOver 与 pushHistory 并列调用）；旧档缺 stats 自动补
  function accumulateStats(save, run) {
    if (!save || !run) return null;
    save.stats = normalizeStats(save.stats);
    var st = save.stats;
    st.runs++;
    if (run.victory) st.wins++;
    var cid = run.charId;
    if (cid) {
      if (!isObj(st.chars[cid])) st.chars[cid] = { runs: 0, wins: 0 };
      st.chars[cid].runs++;
      if (run.victory) st.chars[cid].wins++;
    }
    var reached = Math.max(run.act || 0, run.floorsCleared || 0); // 与 syncSave 同口径
    if (reached > st.maxFloor) st.maxFloor = reached;
    st.bossKills += run.floorsCleared || 0; // 每通一层 = 击杀该层 BOSS
    if ((run.maxHit || 0) > st.bestHit) st.bestHit = run.maxHit;
    return st;
  }

  // 每日挑战最佳成绩（独立口径，不进 runs/wins/stats）：按日期 key，同日覆盖取更高层数（通关恒为最佳）
  function recordDailyBest(save, run) {
    if (!save || !run || !run.daily || !run.daily.date) return null;
    if (!isObj(save.dailyBest)) save.dailyBest = {};
    var floor = Math.max(run.act || 0, run.floorsCleared || 0); // 与 syncSave 同口径
    var prev = save.dailyBest[run.daily.date];
    if (!prev || run.victory || floor > prev.floor) {
      save.dailyBest[run.daily.date] = { floor: floor, victory: !!run.victory, charId: run.charId };
    }
    return save.dailyBest[run.daily.date];
  }

  // 对局快照结构校验（标题【继续游戏】入口用；非法快照由调用方静默清除）
  function validRunSnapshot(snap) {
    return isObj(snap) &&
      typeof snap.charId === 'string' && !!D.characters[snap.charId] &&
      Array.isArray(snap.deck) && snap.deck.length > 0 &&
      isObj(snap.map) &&
      typeof snap.hp === 'number' && typeof snap.maxHp === 'number';
  }

  var saveCodec = {
    encode: function (obj) { return b64encode(JSON.stringify({ v: SAVE_VERSION, data: obj })); },
    // 非法码返回 null（不抛异常）；版本协商兼容 v1 旧码，存档本体迁移交给 migrateSave
    decode: function (str) {
      try {
        var o = JSON.parse(b64decode(String(str).trim()));
        if (!o || typeof o.v !== 'number' || o.v < 1 || o.v > SAVE_VERSION) return null;
        if (!isObj(o.data) || !isObj(o.data.save)) return null; // 载荷必须是含 save 的元存档包
        return o.data;
      } catch (e) { return null; }
    }
  };

  // 战绩：最新在前，最多 20 条
  function pushHistory(save, run) {
    if (!save.history) save.history = [];
    save.history.unshift({
      t: Date.now(),
      char: run.charId,
      act: run.act,
      victory: !!run.victory,
      killer: (!run.victory && run.combat && run.combat.enemy) ? run.combat.enemy.name : '',
      deck: run.deck.length,
      relics: run.relics.length
    });
    if (save.history.length > 20) save.history.length = 20;
    return save.history;
  }

  /* ---------- 被动技能实时数值（与伤害管线同公式，供信息卡显示） ---------- */
  // 共享系数：改数值只动这里，管线与显示永远一致
  Engine.BLOODRAGE_PER = 4;     // 血怒：剩饭每缺少 N 点精力，伤害 +1
  Engine.BLOODRAGE_CAP = Infinity; // 血怒加成无上限（2026-08 调整：4 点/无上限，管线位置不变）
  Engine.STRATEGIST_PER = 2;      // 深谋：每 N 张手牌 +1 伤
  Engine.MONEYPOWER_PER = 50;     // 钞能：每 N 金币 +1 伤
  Engine.ENERGY_CYCLE = 5;        // 摸鱼之道：每 N 张牌回 1 能量

  // 返回 { name, desc, value, tag?, icon }；combat 为 null 时返回基础信息
  Engine.prototype.passiveInfo = function () {
    var st = this.state;
    if (!st) return null;
    var ch = D.characters[st.charId];
    var c = st.combat;
    var info = { name: ch.title, desc: ch.passive, icon: 'buff', value: '', tag: null };
    if (st.charId === 'xiaoq') {
      info.icon = 'energy';
      if (c) info.value = '已打出 ' + (c.cardsPlayed % Engine.ENERGY_CYCLE) + '/' + Engine.ENERGY_CYCLE + ' 张牌';
    } else if (st.charId === 'shengfan') {
      info.icon = 'intent_attack';
      if (c) info.value = '当前加伤 +' + Math.min(Engine.BLOODRAGE_CAP, Math.floor((st.maxHp - st.hp) / Engine.BLOODRAGE_PER));
    } else if (st.charId === 'jihuang') {
      info.icon = 'buff';
      if (c) {
        info.value = '当前手牌加伤 +' + Math.floor(c.hand.length / Engine.STRATEGIST_PER);
        if (c.attacksThisTurn === 0) info.tag = '不弃牌';
      }
    } else if (st.charId === 'shuanglaoya') {
      info.icon = 'gold';
      if (c) info.value = '当前加伤 +' + Math.floor(st.gold / Engine.MONEYPOWER_PER);
    }
    return info;
  };

  /* ---------- Boss Rush：总部连续作战 ---------- */
  // 从通关构筑开始 Rush：build = {charId, deck, relics, equippedRelics, gold, hp, maxHp}
  Engine.prototype.rushStart = function (build) {
    this.newRun(build.charId);
    var st = this.state;
    st.deck = build.deck.map(function (c) { return { uid: c.uid, id: c.id, up: c.up, costMod: c.costMod || 0 }; });
    st.uidCounter = build.deck.reduce(function (m, c) { return Math.max(m, c.uid); }, 0) + 1;
    st.relics = build.relics.slice();
    st.equippedRelics = (build.equippedRelics || build.relics).slice(0, Engine.MAX_EQUIPPED_RELICS || 4);
    st.gold = build.gold;
    st.maxHp = build.maxHp;
    st.hp = build.hp;
    st.rush = {
      fight: 1,
      entry: {
        charId: build.charId,
        deck: st.deck.map(function (c) { return { uid: c.uid, id: c.id, up: c.up, costMod: c.costMod || 0 }; }),
        relics: st.relics.slice(),
        equippedRelics: st.equippedRelics.slice(),
        gold: build.gold,
        hp: build.hp,
        maxHp: build.maxHp
      },
      active: true,
      won: false,
      failed: false
    };
    return st.rush;
  };

  // 失败重开：牌组/圣物/金币/精力回到进入时状态，从第 1 场重来
  Engine.prototype.rushRestart = function () {
    var st = this.state;
    if (!st.rush) return;
    var entry = st.rush.entry;
    st.deck = entry.deck.map(function (c) { return { uid: c.uid, id: c.id, up: c.up, costMod: c.costMod || 0 }; });
    st.uidCounter = entry.deck.reduce(function (m, c) { return Math.max(m, c.uid); }, 0) + 1;
    st.relics = entry.relics.slice();
    st.equippedRelics = entry.equippedRelics.slice();
    st.gold = entry.gold;
    st.maxHp = entry.maxHp;
    st.hp = entry.hp;
    st.rush.fight = 1;
    st.rush.failed = false;
    st.rush.won = false;
    st.over = false;
    st.victory = false;
    st.combat = null;
  };

  // 当前场次 BOSS 定义
  Engine.prototype.rushBossDef = function () {
    var st = this.state;
    if (!st.rush || st.rush.fight > D.rushBosses.length) return null;
    return D.rushBosses[st.rush.fight - 1];
  };

  // 进入当前场战斗（董事会走 1vN）
  Engine.prototype.rushStartFight = function () {
    var def = this.rushBossDef();
    if (!def) throw new Error('Rush 已全部通关');
    if (def.multi) return this.startMultiCombat(def, this.state.rush.fight);
    return this.startRushCombat(def, this.state.rush.fight);
  };

  // Rush 胜利推进：回复 20% 最大精力
  Engine.prototype.rushFightWon = function () {
    var st = this.state;
    st.hp = Math.min(st.maxHp, st.hp + Math.floor(st.maxHp * 0.4));
  };

  // Rush 失败结算
  Engine.prototype.rushFightLost = function () {
    var st = this.state;
    if (!st.rush) return;
    st.rush.failed = true;
    // Rush 中失败不结束整局（由调用方处理重开/退出）
    st.over = false;
    st.victory = false;
  };

  // 推进场次；第 10 场胜利则 Rush 通关
  Engine.prototype.rushAdvance = function () {
    var st = this.state;
    st.rush.fight++;
    if (st.rush.fight > D.rushBosses.length) {
      st.rush.won = true;
      st.rush.active = false;
    }
    return st.rush.won;
  };

  // 整备点（第 3/6/9 场后）三选一：0 回 40% / 1 升级随机 2 张 / 2 随机圣物
  Engine.prototype.rushRest = function (choice) {
    var st = this.state;
    if (choice === 0) {
      st.hp = Math.min(st.maxHp, st.hp + Math.floor(st.maxHp * 0.7));
    } else if (choice === 1) {
      var ups = st.deck.filter(function (c) { return !c.up; });
      this.rng.shuffle(ups);
      ups.slice(0, 2).forEach(function (c) { c.up = true; });
    } else {
      var pool = Object.keys(D.relics).filter(function (r) { return st.relics.indexOf(r) < 0; });
      if (pool.length) this.addRelic(this.rng.pick(pool));
    }
  };

  // 整备点（第 3/6/9 场后）是否需要
  Engine.prototype.rushNeedRest = function () {
    var f = this.state.rush.fight;
    return f === 4 || f === 7 || f === 9 || f === 10; // 第 3/6/8/9 场之后的整备（进入下一场前）
  };
  // 返回当前打出该牌可造成的单段伤害；不支持的牌返回 null
  Engine.prototype.previewDamage = function (inst) {
    var st = this.state, c = st.combat;
    if (!st || !c) return null;
    var def = Engine.cardDef(inst);
    var base = null;
    var goldAvail = st.gold; // 挥金如土先扣金币：钞能按剩余金币预览
    for (var i = 0; i < def.effects.length; i++) {
      var ef = def.effects[i];
      if (ef.op === 'special') {
        if (ef.kind === 'rua') base = ef.base + ef.per * c.attacksPlayed;
        else if (ef.kind === 'darksword') base = ef.base + ef.per * c.darkswordPlays;
        else if (ef.kind === 'spendall') {
          var pvSpent = Math.floor(st.gold * (ef.pct || 0));
          base = Math.floor(pvSpent * ef.per); // per 可为小数，与结算一致取整
          goldAvail = st.gold - pvSpent;
        }
        else if (ef.kind === 'allout') base = (ef.base || 0) + Math.max(0, c.hand.length - 1) * ef.per; // 打出时本牌已离手
        else if (ef.kind === 'combo') base = ef.base + ef.per * c.cardsThisTurn; // 本回合已打出的其他牌数（不含本牌）
        else if (ef.kind === 'hunger') base = Math.max(ef.min, Math.floor((st.maxHp - st.hp) * ef.pct));
      } else if (ef.op === 'goldDamage') {
        base = ef.value + (ef.per
          ? Math.floor(st.gold / ef.per) * (ef.bonus || 1)
          : (st.gold >= ef.gte ? ef.bonus : 0));
      }
      if (base !== null) break;
    }
    if (base === null) return null;
    // 与 dealDamage 相同的固定加成（力量/键盘/剑穗/深谋/钞能）
    var dmg = base + c.playerStrength;
    var edef = c.enemy._def;
    if (def.type === 'attack' && this.hasRelic('keyboard_rel')) dmg += 1;
    if (this.hasRelic('sword_tassel') && edef && (edef.elite || edef.boss)) dmg += 2;
    if (def.type === 'attack' && st.charId === 'jihuang') dmg += Math.floor(Math.max(0, c.hand.length - 1) / 2);
    if (st.charId === 'shuanglaoya') dmg += Math.floor(goldAvail / 50);
    if (st.charId === 'shengfan') dmg += Math.min(Engine.BLOODRAGE_CAP, Math.floor((st.maxHp - st.hp) / Engine.BLOODRAGE_PER));
    if (c.playerWeak > 0) dmg = Math.floor(dmg * 0.75);
    if (c.enemy.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    return Math.max(0, dmg);
  };

  g.GameEngine = {
    Engine: Engine,
    makeRng: makeRng,
    saveCodec: saveCodec,
    pushHistory: pushHistory,
    SAVE_VERSION: SAVE_VERSION,
    defaultStats: defaultStats,
    normalizeStats: normalizeStats,
    migrateSave: migrateSave,
    accumulateStats: accumulateStats,
    recordDailyBest: recordDailyBest,
    validRunSnapshot: validRunSnapshot,
    MAX_EQUIPPED_RELICS: MAX_EQUIPPED_RELICS,
    DAILY_MODS: DAILY_MODS,
    hashStr: hashStr,
    dailyDateStr: dailyDateStr,
    dailySeed: dailySeed,
    dailyMod: dailyMod,
    dailyInfo: dailyInfo
  };
})(typeof window !== 'undefined' ? window : globalThis);
