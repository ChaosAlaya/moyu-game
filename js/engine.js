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

  // 该角色可用的奖励牌池（通用牌 + 本角色专属牌）
  Engine.cardPool = function (charId) {
    var pool = [];
    for (var id in D.cards) {
      var c = D.cards[id];
      if (!c.char || c.char === charId) pool.push(id);
    }
    return pool;
  };

  Engine.prototype._weightedCard = function () {
    var pool = Engine.cardPool(this.state.charId);
    var roll = this.rng() * 100;
    var want = roll < 60 ? 'common' : (roll < 93 ? 'uncommon' : 'rare');
    var sub = pool.filter(function (id) { return D.cards[id].rarity === want; });
    if (!sub.length) sub = pool;
    return this.rng.pick(sub);
  };

  /* ---------- 开局 ---------- */
  Engine.prototype.newRun = function (charId) {
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
      map: this.genMap(1),
      combat: null,
      over: false,
      victory: false,
      floorsCleared: 0,    // 已通关层数
      seen: { cards: {}, relics: {}, enemies: {} } // 图鉴
    };
    deck.forEach(this._seeCard.bind(this));
    return this.state;
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

  /* ---------- 地图生成 ---------- */
  // 每层 STEPS_PER_ACT 步，末步固定 BOSS，其余每步 2~3 个节点选项
  Engine.prototype.genMap = function (act) {
    var steps = [];
    var pool = D.acts[act - 1].pool;
    for (var i = 0; i < D.STEPS_PER_ACT; i++) {
      if (i === D.STEPS_PER_ACT - 1) {
        steps.push([{ type: 'boss', enemyId: D.acts[act - 1].boss }]);
        continue;
      }
      var n = 2 + this.rng.int(2); // 2~3 个选项
      var opts = [];
      for (var j = 0; j < n; j++) {
        opts.push(this._makeNode(this._rollNodeType(i), pool));
      }
      // 避免三个选项完全相同的极端情况
      if (n === 3 && opts[0].type === opts[1].type && opts[1].type === opts[2].type) {
        opts[2] = this._makeNode(this._rollNodeType(i, opts[0].type), pool);
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

  Engine.prototype._rollNodeType = function (stepIdx, exclude) {
    // 第 0 步不出精英，第 4 步（BOSS 前）不出精英以外的限制从简
    var total = 0, list = [];
    D.NODE_WEIGHTS.forEach(function (nw) {
      if (nw.type === exclude) return;
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
      node.eventId = this.rng.pick(Object.keys(D.events));
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
  Engine.prototype.startCombat = function (enemyId) {
    var st = this.state;
    var edef = D.enemies[enemyId];
    if (!edef) throw new Error('未知敌人: ' + enemyId);
    st.seen.enemies[enemyId] = true;
    var enemy = {
      id: enemyId,
      name: edef.name,
      hp: edef.hp, maxHp: edef.hp,
      block: 0, strength: 0, weak: 0, vulnerable: 0,
      skipTurns: 0, turnCount: 0,
      loopIdx: 0, phase: 0,
      dmgBonus: 0,
      intent: null
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
      combatStartHp: st.hp,
      flags: { scarfUsed: false, talismanUsed: false, gamepadUsed: false, attackPadUsed: false },
      over: false, won: false,
      log: [],
      easterEgg: null        // UI 彩蛋文字
    };
    // BOSS 战：黑暗剑柄
    if (edef.boss && this.hasRelic('sword_hilt')) combat.playerStrength += 2;
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

  Engine.prototype._moves = function (enemy) {
    var edef = D.enemies[enemy.id];
    if (edef.phases) {
      var ph = edef.phases[enemy.phase] || edef.phases[edef.phases.length - 1];
      return ph.moves;
    }
    return edef.moves;
  };

  // 检查 BOSS 阶段切换
  Engine.prototype._checkPhase = function (enemy) {
    var edef = D.enemies[enemy.id];
    if (!edef.phases) return;
    var next = edef.phases[enemy.phase + 1];
    if (next && enemy.hp <= enemy.maxHp * edef.phases[enemy.phase].until) {
      enemy.phase++;
      if (next.phaseName) {
        this.state.combat.log.push({ t: 'phase', text: next.phaseName });
      }
    }
  };

  Engine.prototype._chooseIntent = function (enemy) {
    var edef = D.enemies[enemy.id];
    var moves = this._moves(enemy);
    var mv = null;
    // every 型招式优先
    var nextTurn = enemy.turnCount + 1;
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].every && nextTurn % moves[i].every === 0) { mv = moves[i]; break; }
    }
    if (!mv) {
      if (edef.ai === 'loop') {
        mv = moves[enemy.loopIdx % moves.length];
        enemy.loopIdx++;
      } else {
        var total = 0;
        moves.forEach(function (m) { if (!m.every) total += (m.w || 1); });
        var roll = this.rng() * total;
        for (var j = 0; j < moves.length; j++) {
          if (moves[j].every) continue;
          roll -= (moves[j].w || 1);
          if (roll < 0) { mv = moves[j]; break; }
        }
        if (!mv) mv = moves[moves.length - 1];
      }
    }
    enemy.intent = mv;
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
    // 角色被动
    if (st.charId === 'xiaoq' && c.turn === 1) drawN += 2;
    if (st.charId === 'jihuang') drawN += 1;
    // 洞洞板：第一回合多抽 1 张
    if (c.turn === 1 && this.hasRelic('pegboard')) drawN += 1;
    this._draw(drawN);
  };

  // 玩家出牌。返回 { ok, error?, floaters? } 供 UI 做动画
  Engine.prototype.playCard = function (handIdx) {
    var st = this.state, c = st.combat;
    if (!c || c.over) return { ok: false, error: '战斗已结束' };
    var inst = c.hand[handIdx];
    if (!inst) return { ok: false, error: '无此牌' };
    var def = Engine.cardDef(inst);
    var cost = def.cost;
    // 机皇手柄：每回合第一张技能牌费用 -1
    if (def.type === 'skill' && this.hasRelic('gamepad') && !c.flags.gamepadUsed) {
      cost = Math.max(0, cost - 1);
    }
    // 赛博工位：每回合第一张攻击牌费用 -1
    if (def.type === 'attack' && this.hasRelic('cyberdesk') && !c.flags.attackPadUsed) {
      cost = Math.max(0, cost - 1);
    }
    if (c.energy < cost) return { ok: false, error: '能量不足' };
    c.energy -= cost;
    if (def.type === 'skill' && this.hasRelic('gamepad') && !c.flags.gamepadUsed) {
      c.flags.gamepadUsed = true;
    }
    if (def.type === 'attack' && this.hasRelic('cyberdesk') && !c.flags.attackPadUsed) {
      c.flags.attackPadUsed = true;
    }
    c.hand.splice(handIdx, 1);
    var result = { ok: true, card: def, dmgToEnemy: 0, dmgToPlayer: 0, blockGained: 0, healGained: 0, hits: [] };
    var self = this;

    // 圣物伤害加成：键盘（攻击牌每段 +1）、黑暗剑穗（对精英/BOSS +2）
    var atkBonus = 0;
    if (def.type === 'attack' && this.hasRelic('keyboard_rel')) atkBonus += 1;
    var edef2 = D.enemies[c.enemy.id];
    if (this.hasRelic('sword_tassel') && (edef2.elite || edef2.boss)) atkBonus += 2;

    function dealDamage(base) {
      var dmg = base + atkBonus + c.playerStrength;
      if (c.playerWeak > 0) dmg = Math.floor(dmg * 0.75);
      if (c.enemy.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
      if (dmg < 0) dmg = 0;
      // 敌人格挡
      var absorbed = Math.min(c.enemy.block, dmg);
      c.enemy.block -= absorbed;
      var through = dmg - absorbed;
      c.enemy.hp -= through;
      result.dmgToEnemy += through;
      result.hits.push(through);
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
          c.playerBlock += bv; result.blockGained += bv;
          break;
        }
        case 'draw': self._draw(ef.value); break;
        case 'heal': {
          // 小面仙人：回复效果 +2
          var hv = ef.value;
          if (self.hasRelic('noodle_god')) hv += 2;
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
          st.hp -= ef.value; result.dmgToPlayer += ef.value;
          break;
        case 'skipEnemy': c.enemy.skipTurns += ef.value; break;
        case 'goldDamage': {
          // 钞能力：金币达标则追加伤害
          var gb = ef.value + (st.gold >= ef.gte ? ef.bonus : 0);
          var gtimes = ef.times || 1;
          for (var gi = 0; gi < gtimes; gi++) dealDamage(gb);
          break;
        }
        case 'power': {
          var existing = c.powers.filter(function (p) { return p.id === ef.id; })[0];
          if (existing) existing.value += ef.value;
          else c.powers.push({ id: ef.id, value: ef.value });
          break;
        }
        case 'special': {
          if (ef.kind === 'rua') dealDamage(ef.base + ef.per * c.attacksPlayed);
          else if (ef.kind === 'darksword') dealDamage(ef.base + ef.per * c.darkswordPlays);
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
          }
          break;
        }
        default: throw new Error('未知效果: ' + ef.op);
      }
    });

    // 统计
    c.cardsPlayed++;
    if (def.type === 'attack') c.attacksPlayed++;
    if (inst.id === 'darksword') c.darkswordPlays++;
    if (def.flavor) c.easterEgg = def.flavor;
    // 能力：摸鱼境界
    c.powers.forEach(function (p) {
      if (p.id === 'realm' && c.cardsPlayed % p.value === 0) self._draw(1);
    });
    // 消耗 or 弃牌
    if (def.exhaust) c.exhausted.push(inst);
    else c.discard.push(inst);

    this._afterDamageChecks(result);
    return result;
  };

  // 每次伤害后检查生死
  Engine.prototype._afterDamageChecks = function (result) {
    var st = this.state, c = st.combat;
    // 自伤也触发护符
    if (st.hp <= 0 && this.hasRelic('ear_charm') && !c.flags.talismanUsed) {
      st.hp = 1; c.flags.talismanUsed = true;
      c.log.push({ t: 'relic', text: '耳鸣星护符发动！' });
    }
    if (c.enemy.hp <= 0) {
      c.enemy.hp = 0;
      this._winCombat();
      if (result) result.won = true;
    } else if (st.hp <= 0) {
      st.hp = 0;
      this._loseCombat();
      if (result) result.lost = true;
    }
  };

  Engine.prototype._winCombat = function () {
    var st = this.state, c = st.combat;
    c.over = true; c.won = true;
    // 胜利回复
    if (st.charId === 'shengfan') st.hp = Math.min(st.maxHp, st.hp + 4);
    if (this.hasRelic('chicken_bucket')) st.hp = Math.min(st.maxHp, st.hp + 2);
  };

  Engine.prototype._loseCombat = function () {
    var st = this.state, c = st.combat;
    c.over = true; c.won = false;
    st.over = true; st.victory = false;
  };

  // 结束回合：弃手牌 → 敌人行动 → 结算 → 新回合
  Engine.prototype.endTurn = function () {
    var st = this.state, c = st.combat;
    if (!c || c.over) return { over: true };
    var result = { dmgToPlayer: 0, enemyBlock: 0, skipped: false, over: false, hits: [], absorbed: [], reflected: 0, scarf: false, attacked: false };
    // 弃掉手牌
    while (c.hand.length) c.discard.push(c.hand.pop());
    // 玩家 debuff 衰减
    if (c.playerWeak > 0) c.playerWeak--;
    if (c.playerVuln > 0) c.playerVuln--;

    var e = c.enemy;
    e.block = 0; // 敌人格挡在其回合开始清零
    e.turnCount++;
    if (e.skipTurns > 0) {
      e.skipTurns--;
      result.skipped = true;
    } else if (e.intent) {
      var mv = e.intent;
      var self = this;
      function enemyHit(base) {
        // 精英随层数成长的攻击加成（dmgBonus）在此结算
        var dmg = base + e.strength + (e.dmgBonus || 0);
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
        var absorbed = Math.min(c.playerBlock, dmg);
        c.playerBlock -= absorbed;
        var through = dmg - absorbed;
        st.hp -= through;
        result.dmgToPlayer += through;
        result.hits.push(through);
        result.absorbed.push(absorbed);
        // 剩饭护体：反弹
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
      switch (mv.type) {
        case 'attack': {
          result.attacked = true;
          var times = mv.times || 1;
          for (var i = 0; i < times; i++) enemyHit(mv.value);
          if (mv.weak) c.playerWeak += mv.weak;
          if (mv.vulnerable) c.playerVuln += mv.vulnerable;
          if (mv.strength) e.strength += mv.strength;
          break;
        }
        case 'block': e.block += mv.value; result.enemyBlock = mv.value; break;
        case 'debuff':
          if (mv.weak) c.playerWeak += mv.weak;
          if (mv.vulnerable) c.playerVuln += mv.vulnerable;
          break;
        case 'buff': if (mv.strength) e.strength += mv.strength; break;
        case 'charge': break; // 蓄力仅作为意图提示
        case 'heal': e.hp = Math.min(e.maxHp, e.hp + mv.value); break;
      }
    }
    // 敌人 debuff 衰减
    if (e.weak > 0) e.weak--;
    if (e.vulnerable > 0) e.vulnerable--;

    this._checkPhase(e);
    this._afterDamageChecks(result);
    if (!c.over) {
      this._chooseIntent(e);
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
      removeUsed: false
    };
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
  var saveCodec = {
    encode: function (obj) { return b64encode(JSON.stringify({ v: 1, data: obj })); },
    // 非法码返回 null（不抛异常）
    decode: function (str) {
      try {
        var o = JSON.parse(b64decode(String(str).trim()));
        if (!o || o.v !== 1 || typeof o.data !== 'object' || o.data === null) return null;
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

  g.GameEngine = {
    Engine: Engine,
    makeRng: makeRng,
    saveCodec: saveCodec,
    pushHistory: pushHistory,
    MAX_EQUIPPED_RELICS: MAX_EQUIPPED_RELICS
  };
})(typeof window !== 'undefined' ? window : globalThis);
