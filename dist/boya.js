/* 江城故人 · 伯牙子期篇（高山流水篇）
 * 依据《江城故人 · 伯牙子期（高山流水篇）主线开发交付 PRD》实现：
 *   P01 开场选卡 → P02 月湖与琴台双剧情锚点 → P03 五弦琴音共创与心境配置
 *   → P04 音乐记忆胶囊结算 → P05 链上独立核验页
 * 本篇与李白篇（game.js）共用 botchain-config.js 中的合约与链参数，但状态完全隔离。
 */
(function () {
  "use strict";

  const CHAIN_CONFIG = window.BOTCHAIN_CONFIG;
  const ethersLib = window.ethers;
  const chainReady = Boolean(CHAIN_CONFIG && ethersLib);

  const ANCHORS = ["moon_lake", "qin_tai"];
  const THEMES = ["mountain", "water"];
  const THEME_META = {
    mountain: { label: "高山", quote: "巍巍乎若泰山", oscillator: "triangle" },
    water: { label: "流水", quote: "洋洋乎若江河", oscillator: "sine" },
  };
  const SOUND_LAYERS = ["江水", "风过林叶", "雨打芭蕉", "渔舟晚唱"];
  const MAX_LAYERS = 2;
  const MIN_NOTES = 3;

  // 宫商角徵羽 —— 五声音阶，对应 PRD 中 notes[].degree 与 name
  const STRINGS = [
    { degree: 0, name: "宫", note: "D4", freq: 293.66 },
    { degree: 1, name: "商", note: "E4", freq: 329.63 },
    { degree: 2, name: "角", note: "G4", freq: 392.0 },
    { degree: 3, name: "徵", note: "A4", freq: 440.0 },
    { degree: 4, name: "羽", note: "B4", freq: 493.88 },
  ];

  const STORIES = {
    moon_lake: {
      type: "知音 · 月湖",
      title: "月湖水面如镜，知音难觅",
      dialogue:
        "“月湖水面如镜，古有知音在此听琴。后生，你我今日相逢于此湖之畔，琴声虽歇，知音难觅。" +
        "你心头此刻是如群山般沉郁坚定，还是如这满湖月色流水般绵延不绝？",
      note: "月湖为武汉月湖公园一带水域的古称，今为数字游览舞台，不作为现实导航。",
      source:
        "对话与心境二选一的引导为本篇原创演绎；“高山流水”典故见《列子·汤问》，“伯牙鼓琴”故事后世流传版本略有差异。",
    },
    qin_tai: {
      type: "典故 · 琴台",
      title: "高山流水，千载不绝",
      dialogue:
        "“‘伯牙鼓琴，志在高山，钟子期曰：善哉乎鼓琴，巍巍乎若泰山。志在流水，曰：洋洋乎若江河。’" +
        "此地便是琴台。石台虽旧，知音之意千载不绝。接下来，且随吾拨动五弦，将此番心境化作一曲高山或流水！”",
      note: "琴台为武汉古琴台（伯牙台）遗址；此处五弦琴与合成器为游戏化演绎，非历史形制复原。",
      source:
        "典故出处：《列子·汤问》“伯牙鼓琴，志在高山……志在流水，曰：洋洋乎若江河”。" +
        "后世《警世通言》《吕氏春秋》等亦有记述，琴台遗址为纪念伯牙子期而建。",
    },
  };

  const state = {
    screen: null,
    activeAnchorId: null,
    explored: new Set(),
    notes: [],
    theme: null,
    layers: ["江水"], // 最少一种声景：默认预选江水，可换选其他
    recipe: null,
    recipeTitle: "",
    capsuleId: "",
    onchainMemoryId: "",
    nonce: "",
    createdAt: "",
    recipeJson: "",
    hash: "",
    hashAlgorithm: "keccak256",
    hashRevision: 0,
    locked: false,
    audio: { ctx: null, master: null, convolver: null, layerNodes: new Map(), started: false },
    canvas: { ctx: null, raf: null, dpr: 1, w: 0, h: 0, ripples: [], peaks: [], strings: [], pluck: null },
    sailTimer: null,
    mapTimer: null,
    tune: { buffer: null, rendering: null, ctx: null, src: null, playing: false, raf: 0, startedAt: 0 },
    wallet: {
      phase: "local",
      account: "",
      issuerAuthorized: false,
      contract: null,
      txHash: "",
      evidence: null,
      attempt: null,
      seq: 0,
      contextRevision: 0,
    },
  };

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
  // 文本写入的安全封装：目标不存在时静默跳过，不中断调用方流程
  const setText = (sel, value) => {
    const el = $(sel);
    if (el) el.textContent = value;
  };
  const root = $("[data-boya-root]");
  const screens = new Map($$("[data-boya-screen]").map((el) => [el.dataset.boyaScreen, el]));
  const verifyScreen = $("[data-verify-screen]");

  /* ---------------- 屏幕切换 ---------------- */

  function showBoyaScreen(name) {
    if (!screens.has(name)) return false;
    if (name !== "launch") {
      $$("[data-boya-dialog]").forEach((d) => { if (d.open) d.close(); });
    }
    state.screen = name;
    screens.forEach((el, key) => {
      el.hidden = key !== name;
      el.classList.toggle("screen--active", key === name);
    });
    root.hidden = false;
    // 本篇以浮层方式接管画面，避免与李白篇的状态机互相干扰
    const game = document.getElementById("game");
    if (game) game.inert = true;
    // 谱曲与结算是音律体验区：整体背景音乐自动停止，离开后随下次交互自然恢复
    if (name === "qin" || name === "capsule") {
      const bg = document.querySelector("[data-bg-music]");
      if (bg && !bg.paused) bg.pause();
    }
    if (name === "qin") setupCanvas();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }

  function exitBoya() {
    root.hidden = true;
    screens.forEach((el) => { el.hidden = true; el.classList.remove("screen--active"); });
    const game = document.getElementById("game");
    if (game) game.inert = false;
    stopAudio();
    state.screen = null;
  }

  /* ---------------- 剧情锚点 ---------------- */

  function updateBoyaUI() {
    const count = state.explored.size;
    $$("[data-boya-progress-count]").forEach((el) => { el.textContent = `${count} / ${ANCHORS.length}`; });
    $$(".stamp-row i").forEach((stamp, i) => stamp.classList.toggle("is-filled", i < count));
    $$("[data-boya-anchor]").forEach((btn) => {
      const id = btn.dataset.boyaAnchor;
      const done = state.explored.has(id);
      btn.classList.toggle("is-done", done);
      btn.classList.toggle("is-active", state.activeAnchorId === id);
      btn.setAttribute("aria-pressed", String(state.activeAnchorId === id));
      const lockedId = btn.dataset.boyaLocked;
      btn.disabled = Boolean(lockedId) && !state.explored.has(lockedId);
    });
    $("[data-boya-action='start-qin']").hidden = count !== ANCHORS.length;
    const hint = $("[data-boya-hint]");
    if (hint) hint.textContent = count === 0 ? "先在月湖停留，听伯牙说一段旧事。" : "";
  }

  function openBoyaStory(anchor) {
    if (!STORIES[anchor]) return;
    if (anchor === "qin_tai" && !state.explored.has("moon_lake")) {
      showGateError("请先在月湖完成寻音，再登琴台。");
      return;
    }
    showGateError("");
    state.activeAnchorId = anchor;
    updateBoyaUI();
    const dialog = $(`[data-boya-dialog="${anchor}"]`);
    if (!dialog) return;
    const story = STORIES[anchor];
    $("[data-boya-story-type]", dialog).textContent = story.type;
    $("[data-boya-story-title]", dialog).textContent = story.title;
    $("[data-boya-story-dialogue]", dialog).textContent = story.dialogue;
    $("[data-boya-story-note]", dialog).textContent = story.note;
    $("[data-boya-story-source]", dialog).textContent = story.source;
    $(".journey-source", dialog).open = false;
    $(".journey-ack", dialog).hidden = state.explored.has(anchor);
    const img = $("img", dialog);
    img.src = img.src; // 重置 GIF 播放
    dialog.showModal();
  }

  function acknowledgeBoyaAnchor() {
    const anchor = state.activeAnchorId;
    if (!anchor || state.explored.has(anchor)) return;
    state.explored.add(anchor);
    state.activeAnchorId = null;
    $$("[data-boya-dialog]").forEach((d) => { if (d.open) d.close(); });
    updateBoyaUI();
    ensureAudio();

    if (anchor === "moon_lake") {
      // PRD P02：依次完成 moon_lake 与 qin_tai，以泛舟过渡串联两处锚点
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        showBoyaScreen("qintai");
      } else {
        showBoyaScreen("sail");
        clearTimeout(state.sailTimer);
        state.sailTimer = setTimeout(() => showBoyaScreen("qintai"), 2800);
      }
    } else {
      // 琴台锚点完成，正式解锁五弦琴共创舞台
      const next = $("[data-boya-action='start-qin']");
      next.textContent = "拨动五弦 · 化作一曲";
      next.classList.add("boya-pulse");
      setTimeout(() => next.classList.remove("boya-pulse"), 2400);
    }
  }

  /* ---------------- Web Audio 引擎 ---------------- */

  function ensureAudio() {
    if (state.audio.ctx) {
      if (state.audio.ctx.state === "suspended") state.audio.ctx.resume().catch(() => {});
      return state.audio.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // 简易混响脉冲响应，让“高山”长回响与“流水”短回声有实际空间感
    const seconds = 2.6;
    const ir = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    convolver.connect(wet).connect(master);

    state.audio = { ctx, master, convolver, layerNodes: new Map(), started: true };
    return ctx;
  }

  function stopAudio() {
    state.audio.layerNodes.forEach((node) => { try { node.stop(); } catch {} });
    state.audio.layerNodes.clear();
    if (state.audio.ctx) state.audio.ctx.suspend().catch(() => {});
    state.audio.started = false;
  }

  // 弹拨一个音：高山用三角波厚重长回响，流水用正弦波明亮短回声
  function playString(degree, velocity = 0.7, theme = state.theme) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const string = STRINGS[degree];
    if (!string) return;
    const active = THEMES.includes(theme) ? theme : "mountain";
    const isMountain = active === "mountain";
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = THEME_META[active].oscillator;
    osc.frequency.setValueAtTime(string.freq, now);

    const gain = ctx.createGain();
    const peak = Math.min(0.9, 0.18 + velocity * 0.55);
    const attack = isMountain ? 0.02 : 0.006;
    const decay = isMountain ? 1.9 : 0.75;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    // 高山叠加低八度倍音，厚度更足；流水加轻微颤音，连贯明亮
    const body = ctx.createGain();
    body.gain.value = isMountain ? 0.45 : 0.16;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(string.freq / 2, now);
    sub.connect(body).connect(gain);

    if (!isMountain) {
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      vibrato.frequency.value = 5.4;
      vibratoGain.gain.value = string.freq * 0.011;
      vibrato.connect(vibratoGain).connect(osc.frequency);
      vibrato.start(now);
      vibrato.stop(now + attack + decay + 0.1);
    }

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(isMountain ? 1150 : 4200, now);

    osc.connect(filter).connect(gain);
    gain.connect(state.audio.master);
    if (state.audio.convolver) gain.connect(state.audio.convolver);

    osc.start(now);
    sub.start(now);
    osc.stop(now + attack + decay + 0.12);
    sub.stop(now + attack + decay + 0.12);

    if (!state.audio.layerNodes.size) startAmbientLayers();
  }

  // 江城声景：程序化生成的环境层，不引入额外音频文件
  function startAmbientLayers() {
    const ctx = state.audio.ctx;
    if (!ctx || !state.layers.length) return;
    state.layers.forEach((layer) => buildLayer(ctx, layer));
  }

  function buildLayer(ctx, layer) {
    if (state.audio.layerNodes.has(layer)) return;
    if (layer === "渔舟晚唱") return; // 诊断：临时禁用
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.linearRampToValueAtTime(0.16, now + 1.4);
    out.connect(state.audio.master);

    let source;
    if (layer === "江水" || layer === "风过林叶" || layer === "雨打芭蕉") {
      const length = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.03 * white) / 1.03; // 布朗噪声，更接近水声
        data[i] = last * 3.2;
      }
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      if (layer === "江水") {
        filter.type = "lowpass"; filter.frequency.value = 520;
        lfo.frequency.value = 0.16; lfoGain.gain.value = 260;
      } else if (layer === "风过林叶") {
        filter.type = "bandpass"; filter.frequency.value = 1650; filter.Q.value = 0.9;
        lfo.frequency.value = 0.11; lfoGain.gain.value = 720;
      } else {
        filter.type = "highpass"; filter.frequency.value = 2600;
        lfo.frequency.value = 0.42; lfoGain.gain.value = 900;
      }
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(now);
      source.connect(filter).connect(out);
    } else {
      // 渔舟晚唱：远处人声哼鸣 —— 五声音阶慢速轮唱，
      // 正弦基音 + 八度泛音拟人声共鸣，轻颤音 + 回声送出空间感
      source = startHumming(ctx, out, state.audio.convolver);
    }
    if (source && typeof source.start === "function") source.start(now);
    state.audio.layerNodes.set(layer, source);
  }

  // 人声哼鸣调度器：返回 { stop() }；离线渲染时传 deadline 只唱到曲终
  function scheduleHumming(ctx, out, convolver, deadline = Infinity) {
    const scale = [293.66, 329.63, 392, 440, 523.25]; // D E G A C 五声
    const seq = [0, 2, 1, 3, 2, 1, 4, 3, 2, 0];
    const noteDur = 1.5;
    let step = 0;
    let stopped = false;
    let timer = 0;
    // 实时轮唱传 deadline=Infinity；离线渲染传曲长（秒）做有限预调度
    const live = !Number.isFinite(deadline);

    const humNote = (t) => {
      const f = scale[seq[step % seq.length]];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.075, t + 0.38);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t);
      const harm = ctx.createOscillator();
      harm.type = "sine";
      harm.frequency.setValueAtTime(f * 2, t);
      const harmGain = ctx.createGain();
      harmGain.gain.value = 0.22; // 八度泛音拟人声亮度
      harm.connect(harmGain).connect(g);
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.6;
      const vibGain = ctx.createGain();
      vibGain.gain.value = f * 0.009;
      vib.connect(vibGain).connect(osc.frequency);
      osc.connect(g);
      // 实时模式下不接入混响（Edge 对 ConvolverNode 实时连接存在崩溃问题），
      // 离线渲染保留混响，导出的音律仍有空间感
      if (!live && convolver) g.connect(convolver);
      g.connect(out);
      [osc, harm, vib].forEach((o) => { o.start(t); o.stop(t + noteDur + 0.15); });
      step += 1;
    };

    if (live) {
      return { stop() { stopped = true; clearTimeout(timer); } };
    }
    // 离线：只唱到曲终
    for (let t = 0.1; t < deadline - noteDur; t += noteDur * 0.94) humNote(t);
    return null;
  }

  function startHumming(ctx, out, convolver) {
    return scheduleHumming(ctx, out, convolver, Infinity);
  }

  function syncAmbientLayers() {
    const ctx = state.audio.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    SOUND_LAYERS.forEach((layer) => {
      const node = state.audio.layerNodes.get(layer);
      if (state.layers.includes(layer) && !node) buildLayer(ctx, layer);
      if (node && !state.layers.includes(layer)) {
        try { node.stop(); } catch {}
        state.audio.layerNodes.delete(layer);
      }
    });
    if (state.layers.length && !state.audio.layerNodes.size) startAmbientLayers();
  }

  /* ---------------- Canvas 五弦舞台 ---------------- */

  function setupCanvas() {
    const canvas = $("[data-boya-canvas]");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(200, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.canvas = { ...state.canvas, ctx, dpr, w, h, ripples: [], peaks: [], strings: [] };
    layoutStrings();
    drawFrame();
    if (!state.canvas.raf) state.canvas.raf = requestAnimationFrame(tickCanvas);
  }

  function layoutStrings() {
    const { w, h, strings } = state.canvas;
    if (!w || !h) return;
    // 弦位与《五弦共创效果图》对齐：宫弦 47.1% → 羽弦 85.3%（frame 高），x 18.3% → 85.3%
    const top = h * 0.471;
    const gap = (h * 0.853 - top) / (STRINGS.length - 1);
    state.canvas.strings = STRINGS.map((s, i) => ({
      y: top + gap * i,
      x1: w * 0.183,
      x2: w * 0.853,
      label: s.name,
      index: i,
    }));
  }

  function hitString(y) {
    const { strings, h } = state.canvas;
    let best = null;
    let bestDist = Infinity;
    strings.forEach((s) => {
      const d = Math.abs(s.y - y);
      if (d < bestDist) { bestDist = d; best = s; }
    });
    // 阈值不超过弦距的一半，避免跨弦误触
    const threshold = Math.max(20, Math.min(46, (h * 0.0955) / 2));
    return bestDist < threshold ? best : null;
  }

  function canvasPoint(event) {
    const canvas = $("[data-boya-canvas]");
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pushRipple(x, y, strength) {
    const { ripples } = state.canvas;
    if (ripples.length > 42) ripples.shift();
    ripples.push({ x, y, r: 6, life: 1, strength });
    const { peaks } = state.canvas;
    if (peaks.length > 42) peaks.shift();
    peaks.push({ x, strength, life: 1 });
  }

  // 高山：山势折线；流水：水波涟漪（PRD 第 2 节）
  function drawFrame() {
    const { ctx, w, h } = state.canvas;
    if (!ctx) return;
    const isMountain = state.theme === "mountain";

    // 背景《五弦共创效果图》承担，canvas 只做透明叠加
    ctx.clearRect(0, 0, w, h);
    if (!state.theme) {
      drawStrings(ctx, 0);
      return;
    }

    // 水波涟漪（流水心境）
    if (!isMountain) {
      state.canvas.ripples.forEach((rp) => {
        const alpha = rp.life * 0.6;
        ctx.strokeStyle = `rgba(58,132,126,${alpha})`;
        ctx.lineWidth = 2.2 + rp.strength * 1.6;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(74,158,164,${alpha * 0.4})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      });
    } else {
      // 山势折线（高山心境）：多层黛青远山，低透明度叠在弦后
      const layers = [
        { base: h * 0.72, amp: h * 0.16, color: "rgba(96,116,110,.22)", step: 46, speed: 0.00004 },
        { base: h * 0.82, amp: h * 0.12, color: "rgba(78,98,94,.3)", step: 34, speed: 0.00007 },
        { base: h * 0.92, amp: h * 0.08, color: "rgba(60,76,74,.38)", step: 26, speed: 0.0001 },
      ];
      layers.forEach((layer, li) => {
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = 1.5 + li * 0.4;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 5) {
          const t = performance.now() * layer.speed * (li + 1);
          const base = Math.sin(x / layer.step + t) * 0.6 + Math.sin(x / (layer.step * 0.42) + t * 1.7) * 0.4;
          let boost = 0;
          state.canvas.peaks.forEach((p) => {
            const near = Math.max(0, 1 - Math.abs(p.x - x) / 150);
            boost += near * p.strength * p.life * (h * 0.07) * (li + 1) / 2.2;
          });
          const y = layer.base - Math.abs(base) * layer.amp - boost;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
    }

    drawStrings(ctx, isMountain ? 1.6 : 2);
  }

  function drawStrings(ctx, glow) {
    const { strings } = state.canvas;
    strings.forEach((s) => {
      const active = state.canvas.pluck?.index === s.index;
      // 金弦与效果图一致，拨动时朱红高亮
      ctx.strokeStyle = active
        ? "rgba(162,60,49,.95)"
        : "rgba(176,141,64,.9)";
      ctx.lineWidth = active ? 3.4 : 2;
      ctx.beginPath();
      if (active) {
        const bow = (state.canvas.pluck.dx || 0) * 26;
        ctx.moveTo(s.x1, s.y - bow);
        ctx.quadraticCurveTo((s.x1 + s.x2) / 2, s.y + bow * 0.6, s.x2, s.y + bow * 0.3);
      } else {
        ctx.moveTo(s.x1, s.y);
        ctx.lineTo(s.x2, s.y);
      }
      ctx.stroke();
    });
    if (glow) { /* 保留参数位，山/水共用同一套弦绘制 */ }
  }

  function tickCanvas() {
    const { ripples, peaks } = state.canvas;
    ripples.forEach((rp) => { rp.r += 2.2 + rp.strength * 2.6; rp.life -= 0.009; });
    peaks.forEach((p) => { p.life -= 0.012; });
    for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].life <= 0) ripples.splice(i, 1);
    for (let i = peaks.length - 1; i >= 0; i--) if (peaks[i].life <= 0) peaks.splice(i, 1);
    drawFrame();
    state.canvas.raf = requestAnimationFrame(tickCanvas);
  }

  function commitNote(degree, velocity, direction) {
    ensureAudio();
    playString(degree, velocity, state.theme || "mountain");
    const step = state.notes.length;
    state.notes.push({
      step,
      degree,
      name: STRINGS[degree].name,
      velocity: Number(velocity.toFixed(2)),
      direction: direction >= 0 ? 1 : -1,
      height: Number((0.35 + velocity * 0.6).toFixed(2)),
    });
    renderNoteTrail();
    const readout = $("[data-boya-readout]");
    if (readout) {
      readout.textContent = state.notes.length >= MIN_NOTES
        ? `已成 ${state.notes.length} 声，可继续拨弦，或定心境后生成配方。`
        : `已成 ${state.notes.length} 声，还需 ${MIN_NOTES - state.notes.length} 声。`;
    }
  }

  function renderNoteTrail() {
    const trail = $("[data-boya-note-trail]");
    if (!trail) return;
    trail.replaceChildren(...state.notes.map((n) => {
      const li = document.createElement("li");
      li.className = `boya-note-chip${n.direction < 0 ? " is-down" : ""}`;
      li.textContent = `${n.name}${n.direction > 0 ? "→" : "←"}`;
      li.title = `力度 ${n.velocity}`;
      return li;
    }));
  }

  /* ---------------- 心境 / 声景配置 ---------------- */

  function showGateError(message) {
    const el = $("[data-boya-gate-error]");
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function selectTheme(theme) {
    if (!THEMES.includes(theme)) return;
    state.theme = theme;
    $$("[data-boya-theme]").forEach((btn) => {
      const on = btn.dataset.boyaTheme === theme;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    $("[data-boya-theme-hint]").textContent =
      `已定「${THEME_META[theme].label}」· ${THEME_META[theme].quote} · ${THEME_META[theme].oscillator === "triangle" ? "三角波，厚重长回响" : "正弦波，轻快短回声"}`;
    showGateError("");
    // 心境会改变既有琴音的听感，立即以新音色复奏最后一音
    ensureAudio();
    if (state.notes.length) {
      const last = state.notes[state.notes.length - 1];
      playString(last.degree, last.velocity, theme);
    }
  }

  function toggleLayer(layer) {
    if (!SOUND_LAYERS.includes(layer)) return;
    const idx = state.layers.indexOf(layer);
    if (idx >= 0) {
      if (state.layers.length <= 1) {
        $("[data-boya-layer-hint]").textContent = "至少保留一种江城声景，可换选其他声景。";
        return;
      }
      state.layers.splice(idx, 1);
    } else if (state.layers.length < MAX_LAYERS) {
      state.layers.push(layer);
      ensureAudio();
      if (state.audio.ctx) buildLayer(state.audio.ctx, layer);
    } else {
      $("[data-boya-layer-hint]").textContent = `最多选择两种，请先取消一种。`;
      return;
    }
    $$("[data-boya-layer]").forEach((btn) => {
      const on = state.layers.includes(btn.dataset.boyaLayer);
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    $("[data-boya-layer-hint]").textContent = state.layers.length
      ? `已选：${state.layers.join("、")}（还可选 ${MAX_LAYERS - state.layers.length} 种）`
      : "最多选择两种，最少选择一种。";
    syncAmbientLayers();
  }

  /* ---------------- 音乐配方生成 ---------------- */

  function createNonce() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function buildRecipe() {
    const velocities = state.notes.map((n) => n.velocity);
    const averageVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const rights = state.notes.filter((n) => n.direction > 0).length;
    const direction = rights * 2 >= state.notes.length ? "向右" : "向左";
    const strength = averageVelocity >= 0.72 ? "厚重" : averageVelocity >= 0.45 ? "中等" : "轻柔";
    return {
      schemaVersion: "1.0",
      memoryId: state.capsuleId,
      journeyId: "j_boya_demo",
      characterId: "boya_ziqi",
      routeId: "boya_gaoshan_liushui",
      packageId: "jiangcheng_boya",
      packageVersion: "1.0.0",
      packageHash: CHAIN_CONFIG?.personaBoya?.packageHash ?? "<运行时真实bytes32>",
      issuer: CHAIN_CONFIG?.personaBoya?.issuer ?? "<实际发行地址>",
      createdAt: state.createdAt,
      title: state.recipeTitle,
      completedAnchors: [...ANCHORS],
      theme: state.theme,
      mood: "相逢",
      notes: state.notes.map((n) => ({ ...n })),
      gesture: { direction, strength, averageVelocity: Number(averageVelocity.toFixed(2)) },
      soundLayers: [...state.layers],
      engineVersion: "zhiyin-gesture-audio-0.2",
    };
  }

  async function hashRecipe(json) {
    if (chainReady) return ethersLib.keccak256(ethersLib.toUtf8Bytes(json));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
    return `0x${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  async function refreshBoyaReceipt() {
    if (!state.recipe || state.locked) return state.hash;
    const revision = ++state.hashRevision;
    const json = JSON.stringify({ ...state.recipe, note: currentNote() });
    const hash = await hashRecipe(json);
    if (revision !== state.hashRevision) return state.hash;
    state.hashAlgorithm = chainReady ? "keccak256" : "sha256";
    state.recipeJson = json;
    state.hash = hash;
    const el = $("[data-boya-capsule-hash]");
    if (el) el.textContent = `${hash.slice(0, 14)}…${hash.slice(-8)}`;
    return hash;
  }

  const currentNote = () => ($("#boya-player-note")?.value ?? "").trim();

  async function generateRecipe() {
    stopTune(); // 跳转结算前停止谱曲屏的试听，交给结算页播放器
    if (state.notes.length < MIN_NOTES) {
      showGateError(`至少拨响 ${MIN_NOTES} 声琴音，当前 ${state.notes.length} 声。`);
      return;
    }
    if (!state.theme) {
      showGateError("请先选择「高山」或「流水」心境。");
      return;
    }
    if (state.layers.length < 1) {
      showGateError("请至少添加一种江城声景（最多两种）。");
      return;
    }
    showGateError("");
    state.recipeTitle = ($("#boya-recipe-title")?.value.trim() || "月湖琴台知音共奏").slice(0, 16);
    state.capsuleId = `JC-BY-${Date.now().toString(36).toUpperCase()}`;
    state.nonce = createNonce();
    state.createdAt = new Date().toISOString();
    state.onchainMemoryId = chainReady
      ? ethersLib.keccak256(ethersLib.toUtf8Bytes(
        `jiangcheng-guren:boya-memory:v1:${CHAIN_CONFIG.chainId}:${state.capsuleId}:${state.nonce}`))
      : "";
    state.locked = false;
    state.recipe = buildRecipe();
    await refreshBoyaReceipt();

    // 结算页填充：任何一项缺失都不应阻断整屏展示
    setText("[data-boya-capsule-title]", `《${state.recipeTitle}》`);
    setText("[data-boya-capsule-id]", state.capsuleId);
    renderSettlement();
    setCapsuleChainStatus("本地回执 · 尚未登记 BOT Chain", "local");
    setTrackStatus("");
    showBoyaScreen("capsule");
  }

  /* ---------------- 高山流水人格结算 ---------------- */

  // 从琴音序列计算四组品格比例：山/水、拨/听、缓/疾、独奏/共鸣
  function computePersona() {
    const notes = state.notes;
    const total = notes.length || 1;
    const mountainSide = notes.filter((n) => n.degree <= 2).length / total;
    // 心境加权：选定的风格更突出
    const mountainRaw = state.theme === "mountain"
      ? Math.min(0.85, mountainSide + 0.12)
      : Math.max(0.15, mountainSide - 0.12);
    const mountainPct = Math.round(mountainRaw * 100);

    const avgVelocity = notes.reduce((a, n) => a + n.velocity, 0) / total;
    const pluckPct = Math.round(Math.min(0.85, Math.max(0.15, avgVelocity)) * 100);

    let turns = 0;
    for (let i = 1; i < notes.length; i++) {
      if (notes[i].direction !== notes[i - 1].direction) turns += 1;
    }
    const turnRate = notes.length > 1 ? turns / (notes.length - 1) : 0;
    const swiftPct = Math.round(Math.min(0.85, Math.max(0.15, 0.25 + turnRate * 0.6)) * 100);

    const resonancePct = { 1: 45, 2: 78 }[state.layers.length] ?? 0;
    return {
      mountainPct,
      pluckPct,
      swiftPct,
      resonancePct,
    };
  }

  function personaTitle(theme) {
    return theme === "mountain" ? "高山仰止者" : "流水知音者";
  }

  function personaDesc(theme) {
    return theme === "mountain"
      ? "心如高山，志有定止。你拨出的每一声都沉厚笃定，像山不肯轻易挪动半分；回响落在湖面许久不散，懂的人自会循声而来，在你的山脚下车马歇蹄。"
      : "心如流水，喜听万物。你拥有流水般的共情与包容，能在流动的生活中接住每一声琴音；你既有自己的峰峦，也愿为知音驻足，在相遇中长成彼此的风景。";
  }

  function renderSettlement() {
    setText("[data-boya-settle-title]", personaTitle(state.theme));
    setText("[data-boya-settle-desc]", personaDesc(state.theme));
    const bars = $("[data-boya-settle-bars]");
    if (!bars) return;
    const p = computePersona();
    const rows = [
      { left: "山", right: "水", leftPct: p.mountainPct, leftTone: "mountain" },
      { left: "拨", right: "听", leftPct: p.pluckPct, leftTone: "pluck" },
      { left: "缓", right: "疾", leftPct: p.swiftPct, leftTone: "swift" },
      { left: "独奏", right: "共鸣", leftPct: 100 - p.resonancePct, leftTone: "solo" },
    ];
    bars.replaceChildren(...rows.map((row) => {
      const div = document.createElement("div");
      div.className = "boya-settle-bar";
      const make = (tag, cls, text) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        el.textContent = text;
        return el;
      };
      div.append(
        make("span", "boya-settle-bar-name", row.left),
        make("strong", "boya-settle-bar-pct", `${row.leftPct}%`),
      );
      const track = make("div", "boya-settle-bar-track");
      const fillL = make("i", "boya-settle-bar-fill boya-settle-bar-fill--" + row.leftTone);
      fillL.style.width = `${row.leftPct}%`;
      const fillR = make("i", "boya-settle-bar-fill boya-settle-bar-fill--rest");
      fillR.style.width = `${100 - row.leftPct}%`;
      track.append(fillL, fillR);
      div.append(
        track,
        make("strong", "boya-settle-bar-pct", `${100 - row.leftPct}%`),
        make("span", "boya-settle-bar-name", row.right),
      );
      return div;
    }));
  }

  /* ---------------- 下载 ---------------- */

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function shortHex(value, head = 6, tail = 4) {
    return value ? `${value.slice(0, head + 2)}…${value.slice(-tail)}` : "";
  }

  /* ---------------- 音律渲染 · 试听 · 下载 ---------------- */

  // 每个音符的时值（秒）：高山缓慢厚重，流水轻快连贯
  const NOTE_BEAT = { mountain: 0.9, water: 0.55 };

  function tuneMeta() {
    const beat = NOTE_BEAT[state.theme] ?? 0.7;
    const tail = state.theme === "mountain" ? 2.4 : 1.5;
    return { beat, tail, total: state.notes.length * beat + tail };
  }

  // 用 OfflineAudioContext 离线渲染整曲（含江城声景层），产出可试听/可下载的 AudioBuffer
  function renderCompositionBuffer() {
    const { beat, total } = tuneMeta();
    const sampleRate = 44100;
    const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * total), sampleRate);
    const isMountain = state.theme === "mountain";
    const now = 0;

    const master = ctx.createGain();
    master.gain.value = 0.62;
    master.connect(ctx.destination);

    // 与实时引擎同源的混响，高山长尾、流水清亮
    const seconds = isMountain ? 2.8 : 1.8;
    const ir = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = isMountain ? 0.34 : 0.22;
    convolver.connect(wet).connect(master);

    // 江城声景层：与实时听感一致的程序化环境声
    state.layers.forEach((layer) => {
      if (layer === "渔舟晚唱") {
        // 远处人声哼鸣：五声音阶慢速轮唱，随曲目结束自然停止
        scheduleHumming(ctx, master, convolver, total);
        return;
      }
      const length = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.03 * white) / 1.03;
        data[i] = last * 3.2;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      if (layer === "江水") {
        filter.type = "lowpass"; filter.frequency.value = 520;
        lfo.frequency.value = 0.16; lfoGain.gain.value = 260;
      } else if (layer === "风过林叶") {
        filter.type = "bandpass"; filter.frequency.value = 1650; filter.Q.value = 0.9;
        lfo.frequency.value = 0.11; lfoGain.gain.value = 720;
      } else {
        filter.type = "highpass"; filter.frequency.value = 2600;
        lfo.frequency.value = 0.42; lfoGain.gain.value = 900;
      }
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start(now);
      const g = ctx.createGain();
      g.gain.value = 0.12;
      noise.connect(filter).connect(g);
      g.connect(master);
      noise.start(now);
      noise.stop(total);
    });

    // 琴音本体：参数与实时弹拨（playString）一一对应
    state.notes.forEach((n, i) => {
      const string = STRINGS[n.degree];
      if (!string) return;
      const t0 = i * beat + 0.08;
      const velocity = n.velocity;
      const peak = Math.min(0.9, 0.18 + velocity * 0.55);
      const attack = isMountain ? 0.02 : 0.006;
      const decay = isMountain ? 1.9 : 0.75;
      const end = Math.min(total, t0 + attack + decay + 0.12);

      const osc = ctx.createOscillator();
      osc.type = THEME_META[state.theme].oscillator;
      osc.frequency.setValueAtTime(string.freq, t0);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);

      const body = ctx.createGain();
      body.gain.value = isMountain ? 0.45 : 0.16;
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(string.freq / 2, t0);
      sub.connect(body).connect(gain);
      sub.start(t0);
      sub.stop(end);

      if (!isMountain) {
        const vibrato = ctx.createOscillator();
        const vibratoGain = ctx.createGain();
        vibrato.frequency.value = 5.4;
        vibratoGain.gain.value = string.freq * 0.011;
        vibrato.connect(vibratoGain).connect(osc.frequency);
        vibrato.start(t0);
        vibrato.stop(end);
      }

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(isMountain ? 1150 : 4200, t0);

      osc.connect(filter).connect(gain);
      gain.connect(master);
      gain.connect(convolver);
      osc.start(t0);
      osc.stop(end);
    });

    return ctx.startRendering();
  }

  function getTuneBuffer() {
    if (state.tune.buffer) return Promise.resolve(state.tune.buffer);
    if (state.tune.rendering) return state.tune.rendering;
    state.tune.rendering = renderCompositionBuffer()
      .then((buffer) => { state.tune.buffer = buffer; state.tune.rendering = null; return buffer; })
      .catch((error) => { state.tune.rendering = null; throw error; });
    return state.tune.rendering;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function setTrackTime(seconds) {
    const el = $("[data-boya-track-time]");
    if (el) el.textContent = formatTime(seconds);
  }

  function setTrackFill(ratio) {
    const el = $("[data-boya-track-fill]");
    if (el) el.style.width = `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;
  }

  function setTrackStatus(message) {
    const el = $("[data-boya-track-status]");
    if (el) el.textContent = message || "";
  }

  function setPlayButton(mode) {
    $$("[data-boya-action='play-tune']").forEach((btn) => {
      btn.dataset.boyaPlayState = mode;
      const icon = btn.querySelector("span");
      if (icon) icon.textContent = mode === "playing" ? "❚❚" : "▶";
      btn.setAttribute("aria-label", mode === "playing" ? "停止试听" : "试听这段音律");
    });
  }

  function setPreviewStatus(message) {
    const el = $("[data-boya-preview-status]");
    if (el) el.textContent = message || "";
  }

  function tickTrackProgress() {
    if (!state.tune.playing || !state.tune.ctx || !state.tune.buffer) return;
    const elapsed = state.tune.ctx.currentTime - state.tune.startedAt;
    setTrackTime(elapsed);
    setTrackFill(elapsed / state.tune.buffer.duration);
    state.tune.raf = requestAnimationFrame(tickTrackProgress);
  }

  function stopTune(natural = false) {
    if (state.tune.src) {
      state.tune.src.onended = null;
      try { state.tune.src.stop(); } catch {}
      state.tune.src.disconnect();
      state.tune.src = null;
    }
    state.tune.playing = false;
    cancelAnimationFrame(state.tune.raf);
    setPlayButton("idle");
    if (!natural) {
      setTrackTime(0);
      setTrackFill(0);
    }
  }

  function stopAmbientLayers() {
    // 试听/结算时停掉实时环境层：环境音已渲染进音律，随曲目自然结束
    state.audio.layerNodes.forEach((node) => { try { node.stop(); } catch {} });
    state.audio.layerNodes.clear();
  }

  async function playTune() {
    if (!state.notes.length) {
      const msg = "先拨响几声琴音，再试听此曲。";
      setTrackStatus(msg);
      setPreviewStatus(msg);
      return;
    }
    if (!state.theme) {
      const msg = "请先定心境（高山或流水），再试听。";
      setTrackStatus(msg);
      setPreviewStatus(msg);
      return;
    }
    if (state.tune.playing) { stopTune(); return; }
    const ctxCtor = window.AudioContext || window.webkitAudioContext;
    if (!ctxCtor) {
      const msg = "当前浏览器不支持音频播放。";
      setTrackStatus(msg);
      setPreviewStatus(msg);
      return;
    }
    setPlayButton("loading");
    const loadingMsg = "正在合成这段音律…";
    setTrackStatus(loadingMsg);
    setPreviewStatus(loadingMsg);
    try {
      stopAmbientLayers();
      const buffer = await getTuneBuffer();
      const ctx = state.tune.ctx || (state.tune.ctx = new ctxCtor());
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.onended = () => { if (state.tune.src === src) { stopTune(true); setTrackTime(buffer.duration); setTrackFill(1); setPreviewStatus("试听完毕 · 环境音已随曲终停止"); } };
      src.start();
      state.tune.src = src;
      state.tune.playing = true;
      state.tune.startedAt = ctx.currentTime;
      setPlayButton("playing");
      setTrackStatus("");
      setPreviewStatus("试听中 · 高山流水与江城声景齐奏");
      setTrackTime(0);
      tickTrackProgress();
    } catch (error) {
      console.warn("Boya tune playback failed", error);
      setPlayButton("idle");
      const msg = `音律合成失败：${error.message || error}`;
      setTrackStatus(msg);
      setPreviewStatus(msg);
    }
  }

  // AudioBuffer → 16-bit PCM WAV（44 字节标准头）
  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));
    let offset = 44;
    for (let frame = 0; frame < numFrames; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][frame];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return arrayBuffer;
  }

  async function downloadTune() {
    if (!state.recipe) return;
    setTrackStatus("正在渲染完整音律…");
    try {
      const buffer = await getTuneBuffer();
      const wav = audioBufferToWav(buffer);
      const blob = new Blob([wav], { type: "audio/wav" });
      downloadBlob(blob, `${state.recipeTitle || "高山流水"}-${state.capsuleId}.wav`, "audio/wav");
      setTrackStatus(`音律已导出 · WAV 44.1kHz ${buffer.numberOfChannels === 2 ? "立体声" : "单声道"} · ${formatTime(buffer.duration)}`);
    } catch (error) {
      console.warn("Boya tune export failed", error);
      setTrackStatus(`音律导出失败：${error.message || error}`);
    }
  }

  // 重新谱曲（位于五弦谱曲屏）：清空已拨琴音与旧配方缓存，心境与声景保留
  function recompose() {
    if (["connecting", "switching", "checking", "awaiting_wallet", "confirming", "readback", "submitted_unknown"].includes(state.wallet.phase)) {
      showGateError("链上操作进行中，请稍后再重新谱曲。");
      return;
    }
    stopTune();
    state.tune.buffer = null;
    state.tune.rendering = null;
    state.notes = [];
    state.recipe = null;
    state.recipeJson = "";
    state.hash = "";
    state.hashRevision += 1;
    state.locked = false;
    state.wallet.txHash = "";
    state.wallet.evidence = null;
    state.wallet.attempt = null;
    const noteInput = $("#boya-player-note");
    if (noteInput) noteInput.disabled = false;
    $("[data-boya-note-trail]")?.replaceChildren();
    setText("[data-boya-readout]", "按住琴弦左右拨动，即可成音。至少拨响 3 声。");
    setCapsuleChainStatus("本地回执 · 尚未登记 BOT Chain", "local");
    showBoyaTxLink("");
    showBoyaProof(null);
    setTrackStatus("");
    setTrackTime(0);
    setTrackFill(0);
    showGateError("");
    showBoyaScreen("qin");
  }

  /* ---------------- 大地图 · 泛舟入景 ---------------- */

  function enterBoyaMap() {
    showBoyaScreen("map");
    const boat = $("[data-boya-map-boat]");
    const status = $("[data-boya-map-status]");
    const dest = $(".boya-map-destination");
    if (dest) dest.hidden = true;
    if (status) { status.hidden = false; status.textContent = "琴舟正驶向琴台月湖……"; }
    if (boat) {
      boat.hidden = false;
      // 重触发 CSS 动画，保证每次进入都从头驶出
      boat.style.animation = "none";
      void boat.offsetWidth;
      boat.style.animation = "";
    }
    clearTimeout(state.mapTimer);
    state.mapTimer = setTimeout(() => {
      if (state.screen !== "map") return;
      if (boat) boat.hidden = true;
      if (status) { status.hidden = false; status.textContent = "已抵达琴台月湖 · 月湖与琴台的副本已开启"; }
      if (dest) dest.hidden = false;
    }, 4400);
  }

  function capsuleChainText() {
    const phase = state.wallet.phase;
    if (phase === "confirmed") {
      return state.wallet.txHash
        ? `BOT Chain 主网已登记 · ${shortHex(state.wallet.txHash, 8, 6)}`
        : "BOT Chain 主网已登记 · 链上记录已恢复";
    }
    if (phase === "record_recovered") return "链上记录已回读 · 交易待补充";
    if (["confirming", "readback", "submitted_unknown"].includes(phase) && state.wallet.txHash) {
      return `主网交易已提交 · ${shortHex(state.wallet.txHash, 8, 6)}`;
    }
    return "本地回执 · 尚未登记 BOT Chain";
  }

  /* ---------------- 链上封存 ---------------- */

  function setCapsuleChainStatus(message, tone = "local") {
    const el = $("[data-boya-chain-card-status]");
    if (!el) return;
    el.lastChild.textContent = ` ${message}`;
    el.dataset.state = tone;
  }

  function setChainPhase(phase, message, tone = "pending") {
    state.wallet.phase = phase;
    const panel = $("[data-boya-chain-panel]");
    if (panel) panel.dataset.state = tone;
    $("[data-boya-chain-status]").textContent = message;
    $("[data-boya-action='verify-transaction']").hidden = phase !== "submitted_unknown";
    updateBoyaChainControls();
  }

  function updateBoyaChainControls() {
    const phase = state.wallet.phase;
    const busy = ["connecting", "switching", "checking", "awaiting_wallet", "submitted", "confirming", "readback", "submitted_unknown"].includes(phase);
    const connect = $("[data-boya-action='connect-wallet']");
    const seal = $("[data-boya-action='seal-capsule']");
    const restart = $("[data-boya-action='restart']");
    connect.disabled = busy || phase === "confirmed";
    seal.disabled = phase !== "ready";
    restart.disabled = ["connecting", "switching", "checking", "awaiting_wallet", "confirming", "readback", "submitted_unknown"].includes(phase);
    connect.textContent = ["connecting", "switching", "checking"].includes(phase)
      ? "正在核验…" : phase === "ready" ? "重新核验钱包" : "连接 MetaMask";
    seal.textContent = phase === "awaiting_wallet" ? "请在钱包确认…"
      : ["submitted", "confirming", "readback"].includes(phase) ? "等待主网确认…"
      : phase === "confirmed" ? "主网登记已确认" : "核验后登记主网";
  }

  function walletErrorCode(error) {
    return error?.code ?? error?.info?.error?.code ?? error?.error?.code ?? error?.data?.originalError?.code;
  }

  function describeWalletError(error) {
    const code = walletErrorCode(error);
    const msg = String(error?.shortMessage || error?.message || "").toLowerCase();
    if (code === 4001 || code === "ACTION_REJECTED" || msg.includes("user rejected")) {
      return "你已取消钱包操作；本地胶囊与配方 JSON 仍可正常下载。";
    }
    if (code === -32002) return "MetaMask 已有一个待处理请求，请先在钱包中完成或取消。";
    if (msg.includes("insufficient funds")) return "钱包 BOT 余额不足以支付本次主网交易费用。";
    if (msg.includes("notauthorizedissuer") || msg.includes("not authorized")) {
      return "当前钱包没有该合约的签发权限，未发送交易。";
    }
    if (msg.includes("wrong chain")) return "当前网络不是 BOT Chain Mainnet（Chain ID 677），未发送交易。";
    if (msg.includes("runtime hash mismatch") || msg.includes("no runtime code")) {
      return "主网合约代码与项目配置不一致，已安全停止，未发送交易。";
    }
    if (msg.includes("persona package is not registered")) {
      return "主网上尚未登记伯牙子期人格包，未发送交易；本地胶囊不受影响。";
    }
    if (msg.includes("wallet account changed")) return "钱包账户已经变化，请重新连接并核验签发权限。";
    return "钱包操作未完成。请检查 MetaMask 状态后重试；本地下载不受影响。";
  }

  async function switchToBoyaMainnet() {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_CONFIG.chainIdHex }],
      });
    } catch (error) {
      if (walletErrorCode(error) !== 4902) throw error;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_CONFIG.chainIdHex,
          chainName: CHAIN_CONFIG.chainName,
          nativeCurrency: CHAIN_CONFIG.nativeCurrency,
          rpcUrls: [CHAIN_CONFIG.rpcUrl],
          blockExplorerUrls: [CHAIN_CONFIG.explorerUrl],
        }],
      });
    }
  }

  // 伯牙人格包配置；未在主网登记时如实报错，不模拟成功
  function boyaPersona() {
    return CHAIN_CONFIG?.personaBoya ?? null;
  }

  // 人格包状态文案：只在明确登记时才称“已登记”，避免误导
  function personaStatusLabel() {
    const persona = boyaPersona();
    if (!persona?.packageId) return "伯牙人格包 v1 · 未配置";
    return persona.registeredOnMainnet
      ? "伯牙人格包 v1 · 主网已登记"
      : "伯牙人格包 v1 · 主网未登记";
  }

  async function readBoyaRegistryContext(provider, account) {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_CONFIG.chainId) throw new Error(`Wrong chain: ${network.chainId}`);
    const runtimeCode = await provider.getCode(CHAIN_CONFIG.registryAddress);
    if (runtimeCode === "0x") throw new Error("Registry contract has no runtime code");
    if (ethersLib.keccak256(runtimeCode).toLowerCase() !== CHAIN_CONFIG.expectedRuntimeHash.toLowerCase()) {
      throw new Error("Registry runtime hash mismatch");
    }
    const contract = new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, provider);
    const [owner, authorized] = await Promise.all([
      contract.owner(),
      contract.authorizedIssuers(account),
    ]);
    const persona = boyaPersona();
    let personaRegistered = null;
    if (persona?.packageId) {
      personaRegistered = await contract.packageExists(persona.packageId, persona.version);
      if (!personaRegistered) throw new Error("Persona package is not registered");
      const pkg = await contract.getPackage(persona.packageId, persona.version);
      if (persona.expectedPackageHash &&
          String(pkg.packageHash).toLowerCase() !== persona.expectedPackageHash.toLowerCase()) {
        throw new Error("Persona package hash mismatch");
      }
    }
    return {
      contract,
      personaRegistered,
      isIssuer: owner.toLowerCase() === account.toLowerCase() || Boolean(authorized),
    };
  }

  function showBoyaTxLink(hash) {
    const link = $("[data-boya-chain-tx-link]");
    if (!hash) { link.hidden = true; link.removeAttribute("href"); return; }
    link.href = `${CHAIN_CONFIG.explorerUrl}/tx/${hash}`;
    link.textContent = `查看主网交易 ${shortHex(hash, 8, 6)} ↗`;
    link.hidden = false;
  }

  function showBoyaProof(evidence) {
    const proof = $("[data-boya-chain-proof]");
    if (!evidence) { proof.hidden = true; proof.open = false; return; }
    $("[data-boya-proof-memory-id]").textContent = evidence.memory.memoryId;
    $("[data-boya-proof-payload-hash]").textContent = evidence.memory.payloadHash;
    $("[data-boya-proof-issuer]").textContent = evidence.memory.issuer;
    $("[data-boya-proof-block]").textContent = evidence.transaction.blockNumber == null
      ? "交易哈希待补充" : String(evidence.transaction.blockNumber);
    proof.hidden = false;
  }

  async function connectBoyaWallet() {
    if (!window.ethereum) {
      setChainPhase("wallet_missing", "未检测到 MetaMask。你仍可下载本地胶囊与配方 JSON。", "error");
      return;
    }
    if (!chainReady) {
      setChainPhase("wallet_missing", "链上组件加载失败，请刷新页面后重试。", "error");
      return;
    }
    try {
      state.wallet.issuerAuthorized = false;
      setChainPhase("connecting", "正在请求连接 MetaMask…");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) throw new Error("No wallet account returned");
      setChainPhase("switching", "正在切换到 BOT Chain Mainnet（Chain ID 677）…");
      await switchToBoyaMainnet();

      const revision = state.wallet.contextRevision;
      const provider = new ethersLib.BrowserProvider(window.ethereum, "any");
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      if (account.toLowerCase() !== String(accounts[0]).toLowerCase()) throw new Error("Wallet account changed");

      setChainPhase("checking", "正在核验应用合约、伯牙人格包与签发权限…");
      const { contract, isIssuer, personaRegistered } = await readBoyaRegistryContext(provider, account);
      if (revision !== state.wallet.contextRevision) throw new Error("Wallet account changed");

      state.wallet.contract = contract;
      state.wallet.account = account;
      state.wallet.issuerAuthorized = isIssuer;
      const walletEl = $("[data-boya-wallet-address]");
      walletEl.textContent = shortHex(account);
      walletEl.title = account;
      $("[data-boya-issuer-status]").textContent = isIssuer ? "已授权，可签发" : "未授权，仅可本地留存";
      setText("[data-boya-persona-status]", personaRegistered ? "伯牙人格包 v1 · 主网已登记" : personaStatusLabel());

      if (!isIssuer) {
        setChainPhase("unauthorized", "合约与人格包核验通过，但当前钱包不是 owner/授权 issuer，不会发起交易。", "warning");
        return;
      }
      setChainPhase("ready", "核验通过。点击登记后，MetaMask 会展示最终主网交易供你确认。", "ready");
    } catch (error) {
      console.warn("BOT Chain boya preflight failed", error);
      state.wallet.contract = null;
      state.wallet.issuerAuthorized = false;
      $("[data-boya-issuer-status]").textContent = "核验未通过";
      setChainPhase("preflight_failed", describeWalletError(error), "error");
    }
  }

  function recordMatches(record, attempt) {
    const persona = boyaPersona();
    return String(record.memoryId).toLowerCase() === attempt.memoryId.toLowerCase() &&
      String(record.payloadHash).toLowerCase() === attempt.payloadHash.toLowerCase() &&
      String(record.issuer).toLowerCase() === attempt.account.toLowerCase() &&
      (!persona?.packageId || (String(record.packageId).toLowerCase() === persona.packageId.toLowerCase()
        && Number(record.version) === persona.version));
  }

  async function confirmBoyaFromChain(attempt, contract, receipt) {
    if (receipt && Number(receipt.status) !== 1) throw new Error("Transaction reverted");
    const record = await contract.getMemory(attempt.memoryId);
    if (!recordMatches(record, attempt)) throw new Error("On-chain readback mismatch");
    const hash = receipt?.hash || receipt?.transactionHash || attempt.txHash || "";
    state.wallet.txHash = hash;
    state.wallet.evidence = {
      schema: "jiangcheng-guren/botchain-verification/v1",
      route: "boya_gaoshan_liushui",
      verifiedAt: new Date().toISOString(),
      network: { name: CHAIN_CONFIG.chainName, chainId: CHAIN_CONFIG.chainId, explorerUrl: CHAIN_CONFIG.explorerUrl },
      application: {
        contract: CHAIN_CONFIG.registryAddress,
        runtimeBytecodeHash: CHAIN_CONFIG.expectedRuntimeHash,
      },
      personaPackage: boyaPersona(),
      transaction: {
        hash: hash || null,
        explorerUrl: hash ? `${CHAIN_CONFIG.explorerUrl}/tx/${hash}` : null,
        blockNumber: receipt?.blockNumber == null ? null : Number(receipt.blockNumber),
        status: receipt ? Number(receipt.status) : null,
      },
      memory: {
        memoryId: String(record.memoryId),
        payloadHash: String(record.payloadHash),
        issuer: String(record.issuer),
        issuedAt: Number(record.issuedAt),
        displayCapsuleId: state.capsuleId,
      },
      canonicalPayload: JSON.parse(attempt.payloadJson),
      verification: { level: receipt ? "transaction_event_record" : "record_only", recordFieldsMatched: true },
    };
    showBoyaTxLink(hash);
    showBoyaProof(state.wallet.evidence);
    if (!receipt) {
      setCapsuleChainStatus("链上记录已回读 · 交易待补充", "pending");
      setChainPhase("record_recovered", "已找到字段一致的链上记录，但尚未取得原交易回执，不标记为完整确认。", "warning");
      return;
    }
    setCapsuleChainStatus(`BOT Chain 主网已登记${hash ? ` · ${shortHex(hash, 8, 6)}` : ""}`, "confirmed");
    setChainPhase("confirmed", "登记完成：交易回执与合约回读结果一致。", "confirmed");
  }

  async function sealCapsule() {
    if (state.wallet.phase !== "ready" || !state.wallet.issuerAuthorized || !state.recipe) return;
    const persona = boyaPersona();
    if (!persona?.packageId) {
      setChainPhase("persona_missing", "尚未配置伯牙子期人格包 ID，无法签发；本地胶囊与配方 JSON 不受影响。", "warning");
      return;
    }
    await refreshBoyaReceipt();
    state.locked = true;
    $("#boya-player-note").disabled = true;
    const attempt = {
      id: ++state.wallet.seq,
      memoryId: state.onchainMemoryId,
      payloadHash: state.hash,
      payloadJson: state.recipeJson,
      account: state.wallet.account,
      txHash: "",
    };
    state.wallet.attempt = attempt;
    try {
      setChainPhase("checking", "发送前正在重新核验网络、账户、合约与签发权限…", "pending");
      const provider = new ethersLib.BrowserProvider(window.ethereum, "any");
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== CHAIN_CONFIG.chainId) throw new Error("Wrong chain");
      const signer = await provider.getSigner();
      const account = await signer.getAddress();
      if (account.toLowerCase() !== attempt.account.toLowerCase()) throw new Error("Wallet account changed");
      const readContract = new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, provider);
      const owner = await readContract.owner();
      const authorized = await readContract.authorizedIssuers(account);
      if (!(owner.toLowerCase() === account.toLowerCase() || authorized)) throw new Error("NotAuthorizedIssuer");

      const exists = await readContract.memoryExists(attempt.memoryId);
      if (exists) {
        setChainPhase("readback", "检测到同一 memoryId 已存在，正在比对链上记录，避免重复签发…", "pending");
        await confirmBoyaFromChain(attempt, readContract, null);
        return;
      }

      const writeContract = new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, signer);
      const request = await writeContract.issueMemory.populateTransaction(
        attempt.memoryId, persona.packageId, persona.version, attempt.payloadHash,
      );
      const populated = await signer.populateTransaction(request);
      const [chainIdNow, accountsNow] = await Promise.all([
        window.ethereum.request({ method: "eth_chainId" }),
        window.ethereum.request({ method: "eth_accounts" }),
      ]);
      if (Number(BigInt(chainIdNow)) !== CHAIN_CONFIG.chainId ||
          String(accountsNow?.[0] || "").toLowerCase() !== attempt.account.toLowerCase()) {
        throw new Error("Wallet account changed");
      }
      setChainPhase("awaiting_wallet", "请在 MetaMask 中核对合约地址与交易后确认签发。", "pending");
      // 固定 from 与 chainId，使钱包侧的账户/网络变更可被拒绝
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [provider.getRpcTransaction({ ...populated, from: attempt.account })],
      });
      attempt.txHash = txHash;
      state.wallet.txHash = txHash;
      showBoyaTxLink(txHash);
      setCapsuleChainStatus("主网交易已提交 · 等待确认", "pending");
      setChainPhase("confirming", "交易已提交，正在等待 BOT Chain Mainnet 出块确认…", "pending");

      let receipt;
      try {
        const tx = await provider.getTransaction(txHash);
        receipt = tx ? await tx.wait(1) : await provider.waitForTransaction(txHash, 1, 120000);
      } catch (error) {
        if (walletErrorCode(error) !== "TRANSACTION_REPLACED" || !error.receipt) throw error;
        receipt = error.receipt;
      }
      if (!receipt) throw new Error("Transaction confirmation unavailable");
      if (Number(receipt.status) !== 1) throw new Error("Transaction reverted");
      setChainPhase("readback", "交易已确认，正在从合约回读并比对链上记录…", "pending");
      await confirmBoyaFromChain(attempt, readContract, receipt);
    } catch (error) {
      console.warn("BOT Chain boya capsule issue failed", error);
      const message = String(error?.shortMessage || error?.message || "").toLowerCase();
      const revertedReceipt = error?.receipt || error?.info?.receipt || null;
      const reverted = Number(revertedReceipt?.status) === 0 || message.includes("reverted");
      if (attempt.txHash && reverted) {
        state.wallet.txHash = attempt.txHash;
        showBoyaTxLink(attempt.txHash);
        setCapsuleChainStatus("主网交易执行失败 · 未登记", "local");
      } else if (attempt.txHash) {
        setCapsuleChainStatus(`主网交易已提交 · ${shortHex(attempt.txHash, 8, 6)}`, "pending");
        setChainPhase("submitted_unknown", "交易已提交但页面未能完成确认或回读。请以区块浏览器结果为准，避免重复签发。", "warning");
        return;
      } else {
        state.locked = false;
        $("#boya-player-note").disabled = false;
        await refreshBoyaReceipt();
        setCapsuleChainStatus("本地回执 · 尚未登记 BOT Chain", "local");
        if (message.includes("notauthorizedissuer") || message.includes("wallet account changed") ||
            message.includes("persona package")) {
          state.wallet.issuerAuthorized = false;
          $("[data-boya-issuer-status]").textContent = "需要重新核验";
        }
      }
      setChainPhase("ready", describeWalletError(error), "error");
    }
  }

  async function verifySubmittedBoyaTransaction() {
    const attempt = state.wallet.attempt;
    if (!attempt?.txHash || !window.ethereum || !chainReady) return;
    try {
      setChainPhase("readback", "正在重新读取交易回执与链上 memory 记录…", "pending");
      const provider = new ethersLib.BrowserProvider(window.ethereum, "any");
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== CHAIN_CONFIG.chainId) throw new Error("Wrong chain");
      const receipt = await provider.getTransactionReceipt(attempt.txHash);
      if (!receipt) {
        setChainPhase("submitted_unknown", "暂未取得交易回执；请稍后重试，并避免重复签发。", "warning");
        return;
      }
      const contract = new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, provider);
      await confirmBoyaFromChain(attempt, contract, receipt);
    } catch (error) {
      console.warn("BOT Chain boya transaction verification failed", error);
      setChainPhase("submitted_unknown", "仍未能完成回读核验。请查看区块浏览器，并在网络恢复后再次核验。", "warning");
    }
  }

  /* ---------------- 链上独立核验页 ---------------- */

  function openVerifyPage(prefill = "") {
    if (state.screen) {
      screens.forEach((el) => { el.hidden = true; });
      root.hidden = true;
    }
    verifyScreen.hidden = false;
    $("#verify-input").value = prefill;
    const result = $("[data-verify-result]");
    if (!prefill) result.replaceChildren();
  }

  function closeVerifyPage() {
    verifyScreen.hidden = true;
    if (state.screen) showBoyaScreen(state.screen);
  }

  // 使用独立的静态网络 provider，并为首次请求设置超时，避免网络不可达时页面长时间无响应
function createReadOnlyProvider(timeoutMs = 12000) {
    const provider = new ethersLib.JsonRpcProvider(CHAIN_CONFIG.rpcUrl, undefined, { staticNetwork: true });
    // ethers v6 的 FetchRequest 通过全局 fetch 发出，这里用 AbortController 兜底超时
    const originalFetch = window.fetch;
    window.fetch = (input, init = {}) => {
      const isRpc = String(typeof input === "string" ? input : input?.url || "").includes("rpc.botchain.ai");
      if (!isRpc) return originalFetch(input, init);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return originalFetch(input, { ...init, signal: controller.signal })
        .finally(() => clearTimeout(timer));
    };
    return provider;
  }

  async function runVerification(input) {
    const result = $("[data-verify-result]");
    const value = String(input || "").trim();
    result.replaceChildren(makeVerifyNote("正在读取 BOT Chain Mainnet 上的公开记录…", "pending"));
    if (!value) {
      result.replaceChildren(makeVerifyNote("请输入要核验的 memoryId。", "error"));
      return;
    }
    if (!chainReady) {
      result.replaceChildren(makeVerifyNote("链上组件未加载，无法核验。", "error"));
      return;
    }
    try {
      // 本地胶囊编号 → 用本地保存的 memoryId 映射；否则要求直接输入 bytes32
      let memoryId = /^0x[0-9a-f]{64}$/i.test(value) ? value : null;
      if (!memoryId) {
        result.replaceChildren(makeVerifyNote(
          `「${value}」是本地胶囊编号，不是链上 bytes32。链上只保存 memoryId 与内容摘要，请从下载的核验凭据 JSON 中复制 memoryId 再来核验。`,
          "warning",
        ));
        return;
      }
      const provider = createReadOnlyProvider();
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== CHAIN_CONFIG.chainId) throw new Error(`网络不符：${network.chainId}`);
      const code = await provider.getCode(CHAIN_CONFIG.registryAddress);
      const runtimeHash = ethersLib.keccak256(code);
      const contract = new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, provider);
      const exists = await contract.memoryExists(memoryId);
      const rows = [
        ["链上网络", `${CHAIN_CONFIG.chainName}（Chain ID ${network.chainId}）`],
        ["应用合约", CHAIN_CONFIG.registryAddress],
        ["合约 runtime hash", runtimeHash],
        ["runtime hash 与项目配置一致", runtimeHash.toLowerCase() === CHAIN_CONFIG.expectedRuntimeHash.toLowerCase() ? "是" : "否"],
      ];
      if (!exists) {
        rows.push(["memoryId", memoryId]);
        rows.push(["链上记录", "未找到该 memoryId 的登记记录"]);
        result.replaceChildren(
          makeVerifyNote("该 memoryId 在主网上没有登记记录。", "warning"),
          makeVerifyTable(rows),
        );
        return;
      }
      const record = await contract.getMemory(memoryId);
      rows.push(["memoryId", String(record.memoryId)]);
      rows.push(["人格包 packageId", String(record.packageId)]);
      rows.push(["人格包版本", String(record.version)]);
      rows.push(["payloadHash", String(record.payloadHash)]);
      rows.push(["issuer", String(record.issuer)]);
      rows.push(["签发时间", new Date(Number(record.issuedAt) * 1000).toISOString()]);
      result.replaceChildren(
        makeVerifyNote("已在主网找到该记忆的登记记录。下表为链上回读的原始字段。", "ok"),
        makeVerifyTable(rows),
        makeVerifyNote(
          "链上只保存 memoryId、人格包、版本与内容摘要；琴音序列、留言原文均不上链，因此无法用 payloadHash 反推原文。请比对下载的核验凭据 JSON 中的 canonicalPayload。",
          "note",
        ),
      );
    } catch (error) {
      const message = String(error?.shortMessage || error?.message || "");
      const unreachable = /fetch|abort|timeout|network|failed to/i.test(message);
      result.replaceChildren(makeVerifyNote(
        unreachable
          ? `无法连接 BOT Chain Mainnet 节点（${CHAIN_CONFIG.rpcUrl}）。请检查网络后重试；此核验为纯只读操作，不涉及钱包与交易。`
          : `核验失败：${message}`,
        "error",
      ));
    }
  }

  function makeVerifyNote(text, tone) {
    const p = document.createElement("p");
    p.className = `verify-note verify-note--${tone}`;
    p.textContent = text;
    return p;
  }

  function makeVerifyTable(rows) {
    const dl = document.createElement("dl");
    dl.className = "verify-table";
    rows.forEach(([key, value]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value;
      div.append(dt, dd);
      dl.append(div);
    });
    return dl;
  }

  /* ---------------- 重置 ---------------- */

  function resetBoya() {
    if (["connecting", "switching", "checking", "awaiting_wallet", "confirming", "readback", "submitted_unknown"].includes(state.wallet.phase)) return;
    clearTimeout(state.sailTimer);
    clearTimeout(state.mapTimer);
    stopTune();
    state.tune.buffer = null;
    state.tune.rendering = null;
    state.explored.clear();
    state.activeAnchorId = null;
    state.notes = [];
    state.theme = null;
    state.layers = [];
    state.recipe = null;
    state.capsuleId = "";
    state.onchainMemoryId = "";
    state.nonce = "";
    state.createdAt = "";
    state.recipeJson = "";
    state.hash = "";
    state.hashRevision += 1;
    state.locked = false;
    state.wallet.txHash = "";
    state.wallet.evidence = null;
    state.wallet.attempt = null;
    $("#boya-player-note").value = "";
    $("#boya-player-note").disabled = false;
    $("#boya-recipe-title").value = "月湖琴台知音共奏";
    $("[data-boya-note-trail]").replaceChildren();
    setText("[data-boya-readout]", "按住琴弦左右拨动，即可成音。至少拨响 3 声。");
    $$("[data-boya-theme]").forEach((b) => { b.classList.remove("is-selected"); b.setAttribute("aria-pressed", "false"); });
    $$("[data-boya-layer]").forEach((b) => { b.classList.remove("is-selected"); b.setAttribute("aria-pressed", "false"); });
    setText("[data-boya-theme-hint]", "请选择高山或流水心境");
    setText("[data-boya-layer-hint]", "已选：江水（还可选 1 种）");
    $$("[data-boya-layer]").forEach((b) => {
      const on = b.dataset.boyaLayer === "江水";
      b.classList.toggle("is-selected", on);
      b.setAttribute("aria-pressed", String(on));
    });
    state.layers = ["江水"];
    setTrackStatus("");
    setTrackTime(0);
    setTrackFill(0);
    setCapsuleChainStatus("本地回执 · 尚未登记 BOT Chain", "local");
    showBoyaTxLink("");
    showBoyaProof(null);
    stopAudio();
    if (!chainReady) {
      setChainPhase("components_missing", "链上组件未加载；本地胶囊与配方 JSON 仍可生成和下载。", "error");
      $("[data-boya-action='connect-wallet']").disabled = true;
    } else {
      setChainPhase("local", "连接钱包后将依次核验网络、合约代码、人格包与签发权限。", "local");
    }
    updateBoyaUI();
    showBoyaScreen("launch");
  }

  /* ---------------- 事件绑定 ---------------- */

  document.addEventListener("click", async (event) => {
    // 从李白篇选卡进入伯牙篇
    if (event.target.closest("[data-boya-card-entry]")) return;

    const canvas = event.target.closest("[data-boya-canvas]");
    if (canvas) return; // 琴弦交互走 pointer 事件

    const anchor = event.target.closest("[data-boya-anchor]")?.dataset.boyaAnchor;
    if (anchor) { openBoyaStory(anchor); return; }

    const theme = event.target.closest("[data-boya-theme]")?.dataset.boyaTheme;
    if (theme) { ensureAudio(); selectTheme(theme); return; }

    const layer = event.target.closest("[data-boya-layer]")?.dataset.boyaLayer;
    if (layer) { toggleLayer(layer); return; }

    const key = event.target.closest("[data-boya-string]")?.dataset.boyaString;
    if (key !== undefined) { commitNote(Number(key), 0.62, 1); return; }

    const action = event.target.closest("[data-boya-action]")?.dataset.boyaAction;
    if (!action) return;

    if (action === "close-dialog") event.target.closest("dialog")?.close();
    if (action === "ack-anchor") acknowledgeBoyaAnchor();
    if (action === "sail-to-map") { ensureAudio(); enterBoyaMap(); }
    if (action === "arrive-lake") { clearTimeout(state.mapTimer); showBoyaScreen("lake"); }
    if (action === "back-select") { exitBoya(); }
    if (action === "start-qin") { ensureAudio(); showBoyaScreen("qin"); }
    if (action === "back-qintai") showBoyaScreen("qintai");
    if (action === "generate-recipe") await generateRecipe();
    if (action === "play-tune") await playTune();
    if (action === "download-tune") await downloadTune();
    if (action === "recompose") recompose();
    if (action === "back-qin") { stopTune(); showBoyaScreen("qin"); }
    if (action === "connect-wallet") await connectBoyaWallet();
    if (action === "seal-capsule") await sealCapsule();
    if (action === "verify-transaction") await verifySubmittedBoyaTransaction();
    if (action === "download-proof" && state.wallet.evidence) {
      downloadBlob(`${JSON.stringify(state.wallet.evidence, null, 2)}\n`,
        `${state.capsuleId}-botchain-proof.json`, "application/json;charset=utf-8");
    }
    if (action === "download-recipe") {
      if (!state.recipe) return;
      await refreshBoyaReceipt();
      downloadBlob(`${state.recipeJson}\n`, `${state.capsuleId}-recipe.json`, "application/json;charset=utf-8");
    }
    if (action === "verify-page") openVerifyPage(state.onchainMemoryId || state.capsuleId);
    if (action === "verify-back") closeVerifyPage();
    if (action === "restart") resetBoya();
  });

  // 五弦琴：按住琴弦横向拨动，记录方向与力度
  document.addEventListener("pointerdown", (event) => {
    const canvas = event.target.closest("[data-boya-canvas]");
    if (!canvas || state.screen !== "qin") return;
    const point = canvasPoint(event);
    const hit = hitString(point.y);
    if (!hit) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    state.canvas.pluck = { index: hit.index, x0: point.x, y0: point.y, dx: 0, t0: performance.now() };
  });

  document.addEventListener("pointermove", (event) => {
    const pluck = state.canvas.pluck;
    if (!pluck || state.screen !== "qin") return;
    const point = canvasPoint(event);
    pluck.dx = point.x - pluck.x0;
    pluck.x = point.x;
    pluck.y = point.y;
  });

  function endPluck(event) {
    const pluck = state.canvas.pluck;
    state.canvas.pluck = null;
    if (!pluck || state.screen !== "qin") return;
    const elapsed = Math.max(60, performance.now() - pluck.t0);
    const speed = Math.abs(pluck.dx) / elapsed; // px/ms
    const velocity = Math.min(1, Math.max(0.18, 0.28 + speed * 1.5));
    const direction = pluck.dx === 0 ? 1 : Math.sign(pluck.dx);
    const x = pluck.x ?? pluck.x0;
    pushRipple(x, pluck.y0, velocity);
    commitNote(pluck.index, velocity, direction);
  }

  document.addEventListener("pointerup", endPluck);
  document.addEventListener("pointercancel", () => { state.canvas.pluck = null; });

  $("#boya-player-note")?.addEventListener("input", (event) => {
    if (state.locked) return;
    event.target.value.trim();
    refreshBoyaReceipt();
  });

  // 谱曲/结算期间拦截李白篇背景音乐自动重启（game.js 会在每次点击时尝试续播）。
  // 注意：不能在 play 事件回调里同步 pause——Edge 渲染进程会因此崩溃，必须 defer 到下一轮事件循环。
  const bgMusicEl = document.querySelector("[data-bg-music]");
  bgMusicEl?.addEventListener("play", () => {
    if (state.screen === "qin" || state.screen === "capsule") {
      setTimeout(() => { try { bgMusicEl.pause(); } catch {} }, 0);
    }
  });

  $("[data-verify-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runVerification($("#verify-input").value);
  });

  if (window.ethereum?.on) {
    window.ethereum.on("accountsChanged", () => {
      state.wallet.contextRevision += 1;
      state.wallet.contract = null;
      state.wallet.account = "";
      state.wallet.issuerAuthorized = false;
      const el = $("[data-boya-wallet-address]");
      if (el) el.textContent = "需要重新连接";
      const issuer = $("[data-boya-issuer-status]");
      if (issuer) issuer.textContent = "等待重新核验";
      if (state.screen === "capsule") {
        setChainPhase("wallet_changed", "MetaMask 账户已变化，请重新连接并核验签发权限。", "warning");
      }
    });
    window.ethereum.on("chainChanged", () => {
      state.wallet.contextRevision += 1;
      state.wallet.contract = null;
      state.wallet.issuerAuthorized = false;
      if (state.screen === "capsule") {
        setChainPhase("wallet_changed", "MetaMask 网络已变化，请重新连接 BOT Chain Mainnet。", "warning");
      }
    });
  }

  /* ---------------- 供 game.js 调用与 WebMCP ---------------- */

  function startBoya() {
    showBoyaScreen("launch");
  }

  function registerBoyaMcpTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const report = (error) => console.warn("Boya WebMCP registration failed", error);
    const tools = [
      {
        name: "get_boya_journey_state", title: "读取伯牙旅程状态",
        description: "读取当前画面、已确认的剧情锚点、琴音序列与心境选择，不改变状态。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          return {
            screen: state.screen,
            exploredAnchors: [...state.explored],
            noteCount: state.notes.length,
            theme: state.theme,
            soundLayers: [...state.layers],
            capsuleId: state.capsuleId || null,
          };
        },
      },
      {
        name: "start_boya_journey", title: "开始伯牙子期旅程",
        description: "打开琴舟启幕画面，进入月湖与琴台双锚点探索。",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() { startBoya(); return { screen: state.screen, characterId: "boya_ziqi" }; },
      },
      {
        name: "acknowledge_boya_anchor", title: "确认伯牙剧情锚点",
        description: "在月湖或琴台剧情卡上点击「完成此处寻音」，计入寻音进度。",
        inputSchema: {
          type: "object",
          properties: { anchorId: { type: "string", enum: ["moon_lake", "qin_tai"] } },
          required: ["anchorId"], additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          const anchor = input?.anchorId;
          if (!STORIES[anchor]) throw new TypeError("anchorId 须为 moon_lake 或 qin_tai");
          if (anchor === "qin_tai" && !state.explored.has("moon_lake")) throw new Error("请先完成月湖锚点。");
          state.activeAnchorId = anchor;
          acknowledgeBoyaAnchor();
          return { screen: state.screen, exploredAnchors: [...state.explored] };
        },
      },
      {
        name: "set_boya_music_theme", title: "设置伯牙曲心境",
        description: "在五弦琴舞台选择「高山」或「流水」心境，并可添加最多两种江城声景。",
        inputSchema: {
          type: "object",
          properties: {
            theme: { type: "string", enum: ["mountain", "water"] },
            soundLayers: { type: "array", maxItems: 2, items: { type: "string", enum: SOUND_LAYERS } },
          },
          required: ["theme"], additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          ensureAudio();
          selectTheme(input.theme);
          (input.soundLayers || []).forEach((layer) => {
            if (!state.layers.includes(layer)) toggleLayer(layer);
          });
          showBoyaScreen("qin");
          return { theme: state.theme, soundLayers: [...state.layers] };
        },
      },
    ];
    tools.forEach((tool) => { try { Promise.resolve(context.registerTool(tool)).catch(report); } catch (error) { report(error); } });
  }

  /* ---------------- 初始化 ---------------- */

  function initializeBoyaChainUI() {
    const link = $("[data-boya-contract-link]");
    if (!chainReady) {
      link.removeAttribute("href");
      link.textContent = "链组件未加载";
      setChainPhase("components_missing", "链上组件未加载；本地胶囊与配方 JSON 仍可生成和下载。", "error");
      $("[data-boya-action='connect-wallet']").disabled = true;
      return;
    }
    link.href = `${CHAIN_CONFIG.explorerUrl}/address/${CHAIN_CONFIG.registryAddress}`;
    link.textContent = `${shortHex(CHAIN_CONFIG.registryAddress)} ↗`;
    setText("[data-boya-persona-status]", personaStatusLabel());
    setChainPhase("local", "连接钱包后将依次核验网络、合约代码、人格包与签发权限。", "local");
  }

  // 暴露给 game.js：点击伯牙卡片时切换到本篇
  window.addEventListener("boya:launch", startBoya);
  document.addEventListener("click", (event) => {
    const card = event.target.closest('[data-character="boya_ziqi"]');
    if (!card) return;
    const libai = document.querySelector('[data-character="libai"]');
    libai?.classList.remove("is-selected");
    libai?.setAttribute("aria-pressed", "false");
    card.classList.add("is-selected");
    card.setAttribute("aria-pressed", "true");
    startBoya();
  }, true);

  // 初始默认选中“江水”（最少一种声景），与 chips 状态同步
  $$("[data-boya-layer]").forEach((btn) => {
    const on = btn.dataset.boyaLayer === "江水";
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", String(on));
  });
  setText("[data-boya-layer-hint]", "已选：江水（还可选 1 种）");
  updateBoyaUI();
  initializeBoyaChainUI();
  registerBoyaMcpTools();

  // 仅向链上共创入口暴露已生成的可分享配方，不暴露钱包或签名状态。
  window.JiangchengBoyaCoCreation = Object.freeze({
    getDraft() {
      if (!state.recipe || !state.recipeJson || !state.recipeTitle) return null;
      return Object.freeze({
        title: state.recipeTitle,
        recipeJson: state.recipeJson,
      });
    },
  });
})();
