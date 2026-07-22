/* 摸鱼大作战 - 音效模块（WebAudio 现场合成，无外部音频文件）
 * 浏览器自动播放策略：AudioContext 在首次用户交互触发的 play() 中创建/恢复 */
(function (g) {
  'use strict';

  var ctx = null;
  var enabled = true;
  var KEY = 'moyu_sfx';
  try {
    if (g.localStorage && localStorage.getItem(KEY) === 'off') enabled = false;
  } catch (e) {}

  function ac() {
    if (!ctx) {
      var AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 单个音符：频率、时长、波形、音量、起始延迟、可选滑音目标
  function tone(c, freq, dur, type, vol, delay, slideTo) {
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  var SOUNDS = {
    card:  function (c) { tone(c, 660, 0.07, 'square', 0.10); },
    hit:   function (c) { tone(c, 130, 0.16, 'sine', 0.22, 0, 55); },
    block: function (c) { tone(c, 440, 0.06, 'triangle', 0.10); },
    heal:  function (c) { tone(c, 523, 0.10, 'sine', 0.12); tone(c, 784, 0.14, 'sine', 0.12, 0.09); },
    draw:  function (c) { tone(c, 880, 0.04, 'triangle', 0.06); },
    click: function (c) { tone(c, 1000, 0.03, 'square', 0.05); },
    win:   function (c) {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(c, f, 0.14, 'triangle', 0.12, i * 0.11); });
    },
    lose:  function (c) {
      [392, 330, 262, 196].forEach(function (f, i) { tone(c, f, 0.20, 'sine', 0.12, i * 0.16); });
    }
  };

  g.GameSfx = {
    play: function (name) {
      if (!enabled) return;
      var fn = SOUNDS[name];
      if (!fn) return;
      try {
        var c = ac();
        if (c) fn(c);
      } catch (e) { /* 音频不可用时静默 */ }
    },
    toggle: function () {
      enabled = !enabled;
      try { if (g.localStorage) localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) {}
      return enabled;
    },
    get enabled() { return enabled; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
