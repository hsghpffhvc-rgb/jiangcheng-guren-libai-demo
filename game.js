const screens = new Map(
  [...document.querySelectorAll("[data-screen]")].map((screen) => [screen.dataset.screen, screen]),
);
const ANCHORS = ["jade_flute", "golden_crane"];
const SITE_TERMS = ["黄鹤", "江城", "长江", "江水", "长桥", "江风", "云楼"];
const DEFAULT_KEYWORDS = ["江风", "黄鹤", "长桥", "白云", "笛声", "远帆"];
const CHAIN_CONFIG = window.BOTCHAIN_CONFIG;
const ethersLib = window.ethers;
const chainComponentsReady = Boolean(CHAIN_CONFIG && ethersLib);
const characters = {
  libai: { title: "李白", description: "主题：黄鹤楼诗旅。乘幻想御笔，听玉笛、寻黄鹤，与这位 AI 演绎的故人共题新诗。李白路线现可体验。" },
  quyuan: { title: "屈原 · 筹备中", description: "主题：江滩楚风；载具：龙舟。角色卡已展示，剧情与互动将在后续补充。" },
  boya_ziqi: { title: "伯牙与钟子期 · 筹备中", description: "主题：古琴台知音；载具：琴舟。角色卡已展示，剧情与互动将在后续补充。" },
  zhangzhidong: { title: "张之洞 · 筹备中", description: "主题：汉阳工业；载具：蒸汽火车。角色卡已展示，剧情与互动将在后续补充。" },
};
const stories = {
  jade_flute: {
    type: "诗文 · 玉笛",
    title: "玉笛声里，江城五月",
    dialogue: "“黄鹤楼中吹玉笛，江城五月落梅花。”后生，这“梅花”借的是《梅花落》的曲意，也寄着迁客的愁怀。眼前这支玉笛，是今日为你我设下的诗境道具；江风仍在，旧愁已远。你愿把怎样的心绪寄给这江水？",
    note: "诗句与诗境道具分开呈现，玉笛不作为历史文物实录。",
    source: "诗句：李白《与史郎中钦听黄鹤楼上吹笛》。笛曲《梅花落》为诗中“落梅花”的曲意来源；此处画面与对白为游戏演绎。",
  },
  golden_crane: {
    type: "典故 · 黄鹤",
    title: "昔人乘鹤去，后世架长虹",
    dialogue: "“昔人已乘黄鹤去，此地空余黄鹤楼。”这是崔颢的诗。乘鹤仙踪有不同传说，今日这只金鹤则是为你我点亮的幻想。你看江面上那道跨江长虹，后世巧匠的手段，也可入诗！",
    note: "金鹤是幻想设计；乘鹤仙踪以传说而非史实呈现。",
    source: "诗句：崔颢《黄鹤楼》。乘鹤故事存在不同传说版本；画面中的金鹤及李白对白为游戏演绎。",
  },
};
const state = {
  screen: "intro",
  selectedCharacterId: null,
  activeAnchorId: null,
  explored: new Set(),
  keywords: [],
  generationCount: 0,
  acceptedPoem: null,
  memoryId: "",
  onchainMemoryId: "",
  memoryNonce: "",
  memoryCreatedAt: "",
  memoryPayloadJson: "",
  memoryHash: "",
  memoryHashAlgorithm: "keccak256",
  memoryHashRevision: 0,
  memoryLocked: false,
  wallet: {
    phase: "local",
    provider: null,
    signer: null,
    contract: null,
    account: "",
    issuerAuthorized: false,
    txHash: "",
    receipt: null,
    attemptSequence: 0,
    contextRevision: 0,
    activeAttempt: null,
    evidence: null,
  },
  mapFlightTimer: null,
  mapFlying: false,
};

const bgMusic = document.querySelector("[data-bg-music]");
const MUSIC_STORAGE_KEY = "jiangcheng-guren-music-enabled";
let musicEnabled = true;
try {
  musicEnabled = localStorage.getItem(MUSIC_STORAGE_KEY) !== "off";
} catch {}
bgMusic.volume = 0.35;

function syncMusicButton() {
  const button = document.querySelector("[data-action='toggle-music']");
  if (!button) return;
  button.setAttribute("aria-pressed", String(musicEnabled));
  button.classList.toggle("is-muted", !musicEnabled);
  document.querySelector("[data-music-icon]").textContent = musicEnabled ? "♫" : "×";
  document.querySelector("[data-music-label]").textContent = musicEnabled ? "音乐开启" : "音乐关闭";
}

function ensureMusicPlaying() {
  if (!musicEnabled || !bgMusic.paused) return;
  bgMusic.play().catch(() => {});
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  try { localStorage.setItem(MUSIC_STORAGE_KEY, musicEnabled ? "on" : "off"); } catch {}
  if (musicEnabled) ensureMusicPlaying();
  else bgMusic.pause();
  syncMusicButton();
}

function loadDeferredImage(image) {
  if (!image?.dataset.src || image.getAttribute("src")) return;
  image.src = image.dataset.src;
  image.removeAttribute("data-src");
}

function showScreen(name) {
  if ((name === "poem" || name === "memory") && state.explored.size !== ANCHORS.length) return false;
  if (name !== "explore") {
    document.querySelectorAll("[data-anchor-dialog]").forEach((dialog) => {
      if (dialog.open) dialog.close();
    });
  }
  state.screen = name;
  screens.forEach((screen, key) => {
    screen.hidden = key !== name;
    screen.classList.toggle("screen--active", key === name);
  });
  if (name === "map") loadDeferredImage(document.querySelector("[data-map-flight-gif]"));
  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

function resetMapFlight() {
  clearTimeout(state.mapFlightTimer);
  state.mapFlying = false;
  document.querySelector("[data-screen='map']").classList.remove("is-flying");
  document.querySelector("[data-map-flight-gif]").hidden = true;
  document.querySelector("[data-map-flight-status]").hidden = true;
  document.querySelector("[data-action='enter-tower']").disabled = false;
}

function beginMapFlight() {
  if (state.screen !== "map" || state.mapFlying) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showScreen("explore");
    return;
  }
  state.mapFlying = true;
  document.querySelector("[data-screen='map']").classList.add("is-flying");
  document.querySelector("[data-action='enter-tower']").disabled = true;
  const previousGif = document.querySelector("[data-map-flight-gif]");
  const gif = previousGif.cloneNode();
  previousGif.replaceWith(gif);
  gif.hidden = false;
  document.querySelector("[data-map-flight-status]").hidden = false;
  state.mapFlightTimer = setTimeout(() => {
    if (state.screen === "map") showScreen("explore");
    resetMapFlight();
  }, 2800);
}

function selectCharacter(id, { launch = false } = {}) {
  const character = characters[id];
  if (!character) return;
  state.selectedCharacterId = id;
  document.querySelectorAll("[data-character]").forEach((button) => {
    const selected = button.dataset.character === id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  if (launch && id === "libai") showScreen("flight");
}

function updateExploreUI() {
  const count = state.explored.size;
  document.querySelector("[data-progress-count]").textContent = `${count} / 2`;
  document.querySelectorAll(".stamp-row i").forEach((stamp, index) => {
    stamp.classList.toggle("is-filled", index < count);
  });
  document.querySelectorAll("[data-anchor]").forEach((button) => {
    const id = button.dataset.anchor;
    button.classList.toggle("is-done", state.explored.has(id));
    button.classList.toggle("is-active", state.activeAnchorId === id);
    button.setAttribute("aria-pressed", String(state.activeAnchorId === id));
  });
  document.querySelector("[data-action='start-poem']").hidden = count !== ANCHORS.length;
}

function openStory(anchor) {
  if (state.screen !== "explore" || !stories[anchor]) return;
  state.activeAnchorId = anchor;
  const dialog = document.querySelector(anchor === "jade_flute" ? "[data-flute-dialog]" : "[data-crane-dialog]");
  loadDeferredImage(dialog?.querySelector("img[data-src]"));
  const story = stories[anchor];
  updateExploreUI();
  if (dialog && !dialog.open) {
    dialog.querySelector("[data-journey-type]").textContent = story.type;
    dialog.querySelector("[data-journey-title]").textContent = story.title;
    dialog.querySelector("[data-journey-dialogue]").textContent = story.dialogue;
    dialog.querySelector("[data-journey-note]").textContent = story.note;
    dialog.querySelector("[data-journey-source]").textContent = story.source;
    dialog.querySelector(".journey-source").open = false;
    dialog.querySelector(".journey-ack").hidden = state.explored.has(anchor);
    const animation = dialog.querySelector("img");
    animation.src = animation.src;
    dialog.showModal();
  }
}

function acknowledgeAnchor() {
  const anchor = state.activeAnchorId;
  if (!anchor || !stories[anchor] || state.explored.has(anchor)) return;
  state.explored.add(anchor);
  state.activeAnchorId = null;
  document.querySelectorAll("[data-anchor-dialog]").forEach((dialog) => { if (dialog.open) dialog.close(); });
  updateExploreUI();
}

function cleanKeyword(value) {
  const cleaned = String(value || "").trim();
  return /^[\p{Script=Han}]{1,6}$/u.test(cleaned) ? cleaned : "";
}

function updateKeywordUI(message = "") {
  document.querySelectorAll(".keyword-chip").forEach((button) => {
    const selected = state.keywords.includes(button.dataset.keyword);
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelector("[data-keyword-hint]").textContent = message ||
    (state.keywords.length ? `已选择：${state.keywords.join("、")}（还可选择 ${Math.max(0, 3 - state.keywords.length)} 项）` : "请选择 2 至 3 个意象");
}

function toggleKeyword(keyword) {
  if (state.keywords.includes(keyword)) {
    state.keywords = state.keywords.filter((item) => item !== keyword);
  } else if (state.keywords.length < 3) {
    state.keywords.push(keyword);
  } else {
    updateKeywordUI("最多选择三个意象，请先取消一个再换选。");
    return;
  }
  updateKeywordUI();
}

const firstTails = {
  0: ["来", "起", "明"], 1: ["逐浪", "入画", "满袖"], 2: ["入江城", "过长桥", "映江水"],
  3: ["随江水去", "照长桥月", "过江城夜"], 4: ["吹过黄鹤楼", "照见长江月", "同上黄鹤楼"],
  5: ["映黄鹤楼春水", "照长江两岸春", "入江城万里风"],
};
const secondTails = {
  0: ["飞", "归", "长"], 1: ["随风", "逐云", "入诗"], 2: ["照长江", "落江城", "过云楼"],
  3: ["随江水去", "映长桥灯", "到云楼前"], 4: ["随风入江城", "遥照黄鹤楼", "轻拂长江水"],
  5: ["随一叶远帆去", "照江城万家灯", "入黄鹤楼前月"],
};
const thirdLines = ["黄鹤楼头月未央", "长桥横影入江流", "江城今夜月如舟"];
const fourthLines = ["与君同题此夜诗", "一笔同书故人游", "此心随鹤过云楼"];

function poemLinesFor(a, b, c, variant) {
  const first = a + firstTails[6 - a.length][variant];
  const second = b ? b + secondTails[6 - b.length][variant] : ["江风吹过长桥月", "江水遥连万里云", "黄鹤翩然入梦来"][variant];
  const third = c ? c + secondTails[6 - c.length][variant] : thirdLines[variant];
  return [first, second, third, fourthLines[variant]];
}

function validatePoem(lines) {
  if (lines.length !== 4 || lines.some((line) => !/^[\p{Script=Han}]{7}$/u.test(line))) {
    return "诗稿须为四句，每句恰好七个汉字，不含标点。";
  }
  const poem = lines.join("");
  if (state.keywords.some((word) => !poem.includes(word))) return "诗稿须完整包含已选的每个意象。";
  if (!SITE_TERMS.some((term) => poem.includes(term))) return "诗稿还需包含一处江城场景意象。";
  return "";
}

function generatePoem() {
  if (state.screen !== "poem") return;
  if (state.keywords.length < 2) {
    updateKeywordUI("请至少选择两个意象，太白才好落笔。");
    return;
  }
  if (state.generationCount >= 3) {
    showDraftError("演示诗稿最多生成三次；你仍可修改诗题或重新生成。");
    return;
  }
  const variant = state.generationCount;
  const [a, b, c] = state.keywords;
  const lines = poemLinesFor(a, b, c, variant);
  state.generationCount += 1;
  document.querySelector("#poem-name").value = `江城${a}小记`.slice(0, 12);
  document.querySelector("#poem-lines").value = lines.join("\n");
  document.querySelector("[data-draft-editor]").hidden = false;
  document.querySelector("[data-revision]").textContent = `第 ${state.generationCount} 稿 / 共 3 稿`;
  document.querySelector("[data-action='rewrite-poem']").disabled = state.generationCount >= 3;
  document.querySelector("[data-action='generate-poem']").disabled = state.generationCount >= 3;
  showDraftError("");
}

function showDraftError(message) {
  const error = document.querySelector("[data-draft-error]");
  error.textContent = message;
  error.hidden = !message;
}

function createMemoryNonce() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildMemoryPayload() {
  const note = document.querySelector("#player-note").value.trim();
  return {
    schema: "jiangcheng-guren/memory/v1",
    project: "江城故人",
    journey: "李白篇·黄鹤楼",
    chainId: CHAIN_CONFIG?.chainId ?? null,
    contract: CHAIN_CONFIG?.registryAddress ?? null,
    packageId: CHAIN_CONFIG?.persona.packageId ?? null,
    packageVersion: CHAIN_CONFIG?.persona.version ?? null,
    displayMemoryId: state.memoryId,
    onchainMemoryId: state.onchainMemoryId,
    characterId: "libai",
    anchorIds: [...ANCHORS],
    poem: { title: state.acceptedPoem.title, lines: [...state.acceptedPoem.lines] },
    keywords: [...state.keywords],
    note,
    nonce: state.memoryNonce,
    createdAt: state.memoryCreatedAt,
  };
}

async function hashMemoryPayload(payloadJson) {
  if (chainComponentsReady) {
    state.memoryHashAlgorithm = "keccak256";
    return ethersLib.keccak256(ethersLib.toUtf8Bytes(payloadJson));
  }
  state.memoryHashAlgorithm = "sha256";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadJson));
  return `0x${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function refreshMemoryReceipt() {
  if (!state.acceptedPoem || state.memoryLocked) return state.memoryHash;
  const revision = ++state.memoryHashRevision;
  const payload = buildMemoryPayload();
  const payloadJson = JSON.stringify(payload);
  const payloadHash = await hashMemoryPayload(payloadJson);
  if (revision !== state.memoryHashRevision) return state.memoryHash;
  state.memoryPayloadJson = payloadJson;
  state.memoryHash = payloadHash;
  document.querySelector("[data-memory-hash]").textContent = `${state.memoryHash.slice(0, 14)}…${state.memoryHash.slice(-8)}`;
  return state.memoryHash;
}

async function buildMemory() {
  if (state.explored.size !== ANCHORS.length || state.generationCount === 0) return;
  const lines = document.querySelector("#poem-lines").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const error = validatePoem(lines);
  if (error) {
    showDraftError(error);
    document.querySelector("#poem-lines").focus();
    return;
  }
  const poemTitle = document.querySelector("#poem-name").value.trim() || "江城新句";
  state.acceptedPoem = { title: poemTitle, lines };
  state.memoryId = `JC-LB-${Date.now().toString(36).toUpperCase()}`;
  state.memoryNonce = createMemoryNonce();
  state.memoryCreatedAt = new Date().toISOString();
  state.onchainMemoryId = chainComponentsReady
    ? ethersLib.keccak256(ethersLib.toUtf8Bytes(
      `jiangcheng-guren:memory:v1:${CHAIN_CONFIG.chainId}:${state.memoryId}:${state.memoryNonce}`,
    ))
    : "";
  state.memoryLocked = false;
  document.querySelector("#player-note").disabled = false;
  await refreshMemoryReceipt();
  document.querySelector("[data-memory-poem-title]").textContent = poemTitle;
  document.querySelector("[data-memory-poem]").replaceChildren(...lines.map((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    return p;
  }));
  document.querySelector("[data-memory-keywords]").textContent = state.keywords.join("、");
  document.querySelector("[data-memory-id]").textContent = state.memoryId;
  setCardChainStatus("本地回执 · 尚未登记 BOT Chain", "local");
  showScreen("memory");
}

function shortHex(value, head = 6, tail = 4) {
  if (!value) return "";
  return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
}

function setCardChainStatus(message, tone = "local") {
  const status = document.querySelector("[data-chain-card-status]");
  status.lastChild.textContent = ` ${message}`;
  status.dataset.state = tone;
}

function updateChainControls() {
  const phase = state.wallet.phase;
  const busy = ["connecting", "switching", "checking", "awaiting_wallet", "submitted", "confirming", "readback", "submitted_unknown"].includes(phase);
  const connectButton = document.querySelector("[data-action='connect-wallet']");
  const sealButton = document.querySelector("[data-action='seal-memory']");
  const restartButton = document.querySelector("[data-action='restart']");
  connectButton.disabled = busy || phase === "confirmed";
  sealButton.disabled = phase !== "ready";
  restartButton.disabled = ["connecting", "switching", "checking", "awaiting_wallet", "confirming", "readback", "submitted_unknown"].includes(phase);
  connectButton.textContent = phase === "ready" ? "重新核验钱包" : "连接 MetaMask";
  if (["connecting", "switching", "checking"].includes(phase)) connectButton.textContent = "正在核验…";
  if (phase === "awaiting_wallet") sealButton.textContent = "请在钱包确认…";
  else if (["submitted", "confirming", "readback"].includes(phase)) sealButton.textContent = "等待主网确认…";
  else if (phase === "confirmed") sealButton.textContent = "主网登记已确认";
  else sealButton.textContent = "核验后登记主网";
}

function setChainPhase(phase, message, tone = "pending") {
  state.wallet.phase = phase;
  const panel = document.querySelector(".chain-seal-panel");
  panel.dataset.state = tone;
  document.querySelector("[data-chain-status]").textContent = message;
  document.querySelector("[data-action='verify-transaction']").hidden = phase !== "submitted_unknown";
  updateChainControls();
}

function showTransactionLink(transactionHash) {
  const link = document.querySelector("[data-chain-tx-link]");
  if (!transactionHash) {
    link.hidden = true;
    link.removeAttribute("href");
    return;
  }
  link.href = `${CHAIN_CONFIG.explorerUrl}/tx/${transactionHash}`;
  link.textContent = `查看主网交易 ${shortHex(transactionHash, 8, 6)} ↗`;
  link.hidden = false;
}

function walletErrorCode(error) {
  return error?.code ?? error?.info?.error?.code ?? error?.error?.code ?? error?.data?.originalError?.code;
}

function describeWalletError(error) {
  const code = walletErrorCode(error);
  const message = String(error?.shortMessage || error?.message || "").toLowerCase();
  if (code === 4001 || code === "ACTION_REJECTED") return "你已取消钱包操作；本地记忆卡仍可正常下载。";
  if (code === -32002) return "MetaMask 已有一个待处理请求，请打开钱包完成或取消后再试。";
  if (message.includes("insufficient funds")) return "钱包 BOT 余额不足以支付本次主网交易费用。";
  if (message.includes("notauthorizedissuer") || message.includes("not authorized")) return "当前钱包没有该合约的签发权限，未发送交易。";
  if (message.includes("wrong chain")) return "当前网络不是 BOT Chain Mainnet（Chain ID 677），未发送交易。";
  if (message.includes("runtime hash mismatch") || message.includes("no runtime code")) return "主网合约代码与项目配置不一致，已安全停止，未发送交易。";
  if (message.includes("persona package is not registered")) return "主网上尚未找到李白人格包 v1，已安全停止，未发送交易。";
  if (message.includes("persona package hash mismatch")) return "李白人格包哈希与项目配置不一致，已安全停止，未发送交易。";
  if (message.includes("wallet account changed")) return "钱包账户已经变化，请重新连接并核验签发权限。";
  if (message.includes("user rejected")) return "你已取消钱包操作；本地记忆卡仍可正常下载。";
  return "钱包操作未完成。请检查 MetaMask 状态后重试；本地下载不受影响。";
}

function setMemoryLocked(locked) {
  state.memoryLocked = locked;
  const note = document.querySelector("#player-note");
  note.disabled = locked;
  note.title = locked ? "链上摘要已经生成，留言已锁定。" : "";
}

async function switchToBotMainnet() {
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

async function readVerifiedRegistryContext(provider, account) {
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_CONFIG.chainId) {
    throw new Error(`Wrong chain: ${network.chainId}`);
  }
  const runtimeCode = await provider.getCode(CHAIN_CONFIG.registryAddress);
  if (runtimeCode === "0x") throw new Error("Registry contract has no runtime code");
  const runtimeHash = ethersLib.keccak256(runtimeCode);
  if (runtimeHash.toLowerCase() !== CHAIN_CONFIG.expectedRuntimeHash.toLowerCase()) {
    throw new Error("Registry runtime hash mismatch");
  }
  const contract = new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, provider);
  const [owner, authorized, packageExists] = await Promise.all([
    contract.owner(),
    contract.authorizedIssuers(account),
    contract.packageExists(CHAIN_CONFIG.persona.packageId, CHAIN_CONFIG.persona.version),
  ]);
  if (!packageExists) throw new Error("Li Bai persona package is not registered");
  const personaPackage = await contract.getPackage(CHAIN_CONFIG.persona.packageId, CHAIN_CONFIG.persona.version);
  const packageMatches = String(personaPackage.packageId).toLowerCase() === CHAIN_CONFIG.persona.packageId.toLowerCase() &&
    Number(personaPackage.version) === CHAIN_CONFIG.persona.version &&
    String(personaPackage.packageHash).toLowerCase() === CHAIN_CONFIG.persona.expectedPackageHash.toLowerCase() &&
    String(personaPackage.issuer).toLowerCase() === CHAIN_CONFIG.persona.expectedIssuer.toLowerCase();
  if (!packageMatches) {
    throw new Error("Li Bai persona package hash mismatch");
  }
  return {
    contract,
    isIssuer: owner.toLowerCase() === account.toLowerCase() || Boolean(authorized),
  };
}

async function connectWallet() {
  if (!window.ethereum) {
    setChainPhase("wallet_missing", "未检测到 MetaMask。你仍可下载本地记忆卡。", "error");
    return;
  }
  if (!ethersLib || !CHAIN_CONFIG) {
    setChainPhase("wallet_missing", "链上组件加载失败，请刷新页面后重试。", "error");
    return;
  }

  try {
    state.wallet.issuerAuthorized = false;
    setChainPhase("connecting", "正在请求连接 MetaMask…");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) throw new Error("No wallet account returned");

    setChainPhase("switching", "正在切换到 BOT Chain Mainnet（Chain ID 677）…");
    await switchToBotMainnet();

    const contextRevision = state.wallet.contextRevision;
    const provider = new ethersLib.BrowserProvider(window.ethereum, "any");
    const signer = await provider.getSigner();
    const account = await signer.getAddress();
    if (account.toLowerCase() !== String(accounts[0]).toLowerCase()) throw new Error("Wallet account changed");

    setChainPhase("checking", "正在核验应用合约、李白人格包与签发权限…");
    const { contract, isIssuer } = await readVerifiedRegistryContext(provider, account);
    if (contextRevision !== state.wallet.contextRevision) throw new Error("Wallet account changed");
    state.wallet.provider = provider;
    state.wallet.signer = signer;
    state.wallet.account = account;
    state.wallet.contract = contract;
    state.wallet.issuerAuthorized = isIssuer;
    const walletAddress = document.querySelector("[data-wallet-address]");
    walletAddress.textContent = shortHex(account);
    walletAddress.title = account;
    document.querySelector("[data-issuer-status]").textContent = isIssuer ? "已授权，可签发" : "未授权，仅可本地留存";
    if (!isIssuer) {
      setChainPhase("unauthorized", "合约与李白人格包核验通过，但当前钱包不是 owner/授权 issuer，因此不会发起交易。", "warning");
      return;
    }

    setChainPhase("ready", "核验通过。点击登记后，MetaMask 会展示最终主网交易供你确认。", "ready");
  } catch (error) {
    console.warn("BOT Chain wallet preflight failed", error);
    state.wallet.contract = null;
    state.wallet.issuerAuthorized = false;
    document.querySelector("[data-issuer-status]").textContent = "核验未通过";
    setChainPhase("preflight_failed", describeWalletError(error), "error");
  }
}

function verifyMemoryEvent(receipt, contract) {
  for (const log of receipt.logs) {
    if (String(log.address).toLowerCase() !== CHAIN_CONFIG.registryAddress.toLowerCase()) continue;
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "MemoryIssued") return parsed.args;
    } catch {}
  }
  return null;
}

function isActiveAttempt(attempt) {
  return state.wallet.activeAttempt?.id === attempt.id;
}

function recordMatchesAttempt(record, attempt) {
  return String(record.memoryId).toLowerCase() === attempt.memoryId.toLowerCase() &&
    String(record.packageId).toLowerCase() === CHAIN_CONFIG.persona.packageId.toLowerCase() &&
    Number(record.version) === CHAIN_CONFIG.persona.version &&
    String(record.payloadHash).toLowerCase() === attempt.payloadHash.toLowerCase() &&
    String(record.issuer).toLowerCase() === attempt.account.toLowerCase();
}

function eventMatchesAttempt(event, attempt) {
  return Boolean(event) &&
    String(event.memoryId).toLowerCase() === attempt.memoryId.toLowerCase() &&
    String(event.packageId).toLowerCase() === CHAIN_CONFIG.persona.packageId.toLowerCase() &&
    Number(event.version) === CHAIN_CONFIG.persona.version &&
    String(event.payloadHash).toLowerCase() === attempt.payloadHash.toLowerCase() &&
    String(event.issuer).toLowerCase() === attempt.account.toLowerCase();
}

function showProofEvidence(evidence) {
  const proof = document.querySelector("[data-chain-proof]");
  if (!evidence) {
    proof.hidden = true;
    proof.open = false;
    return;
  }
  document.querySelector("[data-proof-memory-id]").textContent = evidence.memory.memoryId;
  document.querySelector("[data-proof-payload-hash]").textContent = evidence.memory.payloadHash;
  document.querySelector("[data-proof-issuer]").textContent = evidence.memory.issuer;
  document.querySelector("[data-proof-block]").textContent = evidence.transaction.blockNumber == null
    ? "交易哈希待补充"
    : String(evidence.transaction.blockNumber);
  const fullyVerified = evidence.verification.level === "transaction_event_record";
  document.querySelector("[data-proof-title]").textContent = fullyVerified
    ? "查看完整链上核验凭据"
    : "查看合约回读凭据（交易待补充）";
  document.querySelector("[data-action='download-proof']").textContent = fullyVerified
    ? "下载核验凭据 JSON"
    : "下载合约回读 JSON";
  proof.hidden = false;
}

function buildVerificationEvidence(attempt, record, receipt, eventVerified) {
  const finalHash = receipt?.hash || receipt?.transactionHash || attempt.txHash || null;
  return {
    schema: "jiangcheng-guren/botchain-verification/v1",
    verifiedAt: new Date().toISOString(),
    network: {
      name: CHAIN_CONFIG.chainName,
      chainId: CHAIN_CONFIG.chainId,
      explorerUrl: CHAIN_CONFIG.explorerUrl,
    },
    application: {
      contract: CHAIN_CONFIG.registryAddress,
      contractExplorerUrl: `${CHAIN_CONFIG.explorerUrl}/address/${CHAIN_CONFIG.registryAddress}`,
      runtimeBytecodeHash: CHAIN_CONFIG.expectedRuntimeHash,
    },
    personaPackage: { ...CHAIN_CONFIG.persona },
    transaction: {
      hash: finalHash,
      explorerUrl: finalHash ? `${CHAIN_CONFIG.explorerUrl}/tx/${finalHash}` : null,
      blockNumber: receipt?.blockNumber == null ? null : Number(receipt.blockNumber),
      status: receipt ? Number(receipt.status) : null,
    },
    memory: {
      memoryId: String(record.memoryId),
      payloadHash: String(record.payloadHash),
      issuer: String(record.issuer),
      issuedAt: Number(record.issuedAt),
      displayMemoryId: state.memoryId,
    },
    canonicalPayload: JSON.parse(attempt.payloadJson),
    verification: {
      level: eventVerified ? "transaction_event_record" : "record_only",
      recordFieldsMatched: true,
      memoryIssuedEventMatched: eventVerified,
    },
  };
}

async function confirmAttemptFromChain(attempt, contract, receipt = null) {
  if (receipt && Number(receipt.status) !== 1) throw new Error("Transaction reverted");
  const record = await contract.getMemory(attempt.memoryId);
  if (!recordMatchesAttempt(record, attempt)) throw new Error("On-chain readback mismatch");
  const event = receipt ? verifyMemoryEvent(receipt, contract) : null;
  if (receipt && !eventMatchesAttempt(event, attempt)) throw new Error("MemoryIssued event mismatch");
  if (!isActiveAttempt(attempt)) return;

  const finalHash = receipt?.hash || receipt?.transactionHash || attempt.txHash || "";
  attempt.txHash = finalHash;
  state.wallet.txHash = finalHash;
  state.wallet.receipt = receipt;
  state.wallet.evidence = buildVerificationEvidence(attempt, record, receipt, Boolean(receipt));
  showTransactionLink(finalHash);
  showProofEvidence(state.wallet.evidence);
  if (!receipt) {
    setCardChainStatus("链上记录已回读 · 交易待补充", "pending");
    setChainPhase(
      "record_recovered",
      "已找到字段一致的链上 memory 记录，但尚未取得原交易与 MemoryIssued 事件，因此不标记为完整确认。",
      "warning",
    );
    return;
  }
  const suffix = finalHash ? ` · ${shortHex(finalHash, 8, 6)}` : " · 链上记录已恢复";
  setCardChainStatus(`BOT Chain 主网已登记${suffix}`, "confirmed");
  setChainPhase(
    "confirmed",
    receipt
      ? "登记完成：交易、MemoryIssued 事件与合约回读结果一致。"
      : "已发现同一 memoryId 的一致链上记录，因此没有重复发起交易；请从钱包历史补充原交易哈希。",
    "confirmed",
  );
}

async function recoverMemoryReceipt(contract, attempt) {
  try {
    const filter = contract.filters.MemoryIssued(attempt.memoryId);
    const events = await contract.queryFilter(filter, CHAIN_CONFIG.evidence.deploymentBlock, "latest");
    const event = [...events].reverse().find((candidate) => eventMatchesAttempt(candidate.args, attempt));
    if (!event?.transactionHash) return null;
    return await contract.runner.getTransactionReceipt(event.transactionHash);
  } catch (error) {
    console.warn("BOT Chain memory receipt recovery failed", error);
    return null;
  }
}

async function markAttemptReverted(attempt, receipt = null) {
  const finalHash = receipt?.hash || receipt?.transactionHash || attempt.txHash || "";
  attempt.txHash = finalHash;
  state.wallet.txHash = finalHash;
  state.wallet.receipt = receipt;
  showTransactionLink(finalHash);
  setMemoryLocked(false);
  await refreshMemoryReceipt();
  state.wallet.activeAttempt = null;
  setCardChainStatus("主网交易执行失败 · 未登记", "local");
  if (state.wallet.account && state.wallet.issuerAuthorized) {
    setChainPhase("ready", "交易已确认回滚，没有写入记忆记录；查看浏览器详情后可重新发起。", "error");
  } else {
    setChainPhase("wallet_changed", "交易已确认回滚，没有写入记忆记录；请重新连接并核验钱包后再试。", "error");
  }
}

async function currentSigningContext(attempt) {
  const provider = new ethersLib.BrowserProvider(window.ethereum, "any");
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_CONFIG.chainId) throw new Error(`Wrong chain: ${network.chainId}`);
  const signer = await provider.getSigner();
  const account = await signer.getAddress();
  if (account.toLowerCase() !== attempt.account.toLowerCase()) throw new Error("Wallet account changed");
  const { contract: readContract, isIssuer } = await readVerifiedRegistryContext(provider, account);
  if (!isIssuer) throw new Error("NotAuthorizedIssuer");
  return {
    provider,
    signer,
    readContract,
    writeContract: new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, signer),
  };
}

async function sealMemoryOnchain() {
  if (state.wallet.phase !== "ready" || !state.wallet.issuerAuthorized || !state.acceptedPoem) return;
  await refreshMemoryReceipt();
  setMemoryLocked(true);
  state.wallet.txHash = "";
  state.wallet.receipt = null;
  state.wallet.evidence = null;
  showTransactionLink("");
  showProofEvidence(null);
  const attempt = {
    id: ++state.wallet.attemptSequence,
    memoryId: state.onchainMemoryId,
    payloadHash: state.memoryHash,
    payloadJson: state.memoryPayloadJson,
    account: state.wallet.account,
    contextRevision: state.wallet.contextRevision,
    txHash: "",
  };
  state.wallet.activeAttempt = attempt;

  try {
    setChainPhase("checking", "发送前正在重新核验网络、账户、合约与签发权限…", "pending");
    const { provider, signer, readContract, writeContract } = await currentSigningContext(attempt);
    if (!isActiveAttempt(attempt)) return;
    state.wallet.provider = provider;
    state.wallet.signer = signer;
    state.wallet.contract = readContract;

    const alreadyExists = await readContract.memoryExists(attempt.memoryId);
    if (!isActiveAttempt(attempt)) return;
    if (alreadyExists) {
      setChainPhase("readback", "检测到同一 memoryId 已存在，正在比对链上记录，避免重复签发…", "pending");
      const recoveredReceipt = await recoverMemoryReceipt(readContract, attempt);
      await confirmAttemptFromChain(attempt, readContract, recoveredReceipt);
      return;
    }

    setChainPhase("checking", "正在预估 gas 并固定本次交易参数；此阶段不会弹出签名请求…", "pending");
    const transactionRequest = await writeContract.issueMemory.populateTransaction(
      attempt.memoryId,
      CHAIN_CONFIG.persona.packageId,
      CHAIN_CONFIG.persona.version,
      attempt.payloadHash,
    );
    if (!isActiveAttempt(attempt)) return;
    const populatedTransaction = await signer.populateTransaction(transactionRequest);
    if (!isActiveAttempt(attempt)) return;
    const [chainIdBeforeSend, accountsBeforeSend] = await Promise.all([
      window.ethereum.request({ method: "eth_chainId" }),
      window.ethereum.request({ method: "eth_accounts" }),
    ]);
    if (!isActiveAttempt(attempt)) return;
    if (state.wallet.contextRevision !== attempt.contextRevision ||
      Number(BigInt(chainIdBeforeSend)) !== CHAIN_CONFIG.chainId ||
      String(accountsBeforeSend?.[0] || "").toLowerCase() !== attempt.account.toLowerCase()) {
      throw new Error("Wallet account changed");
    }

    const rpcTransaction = provider.getRpcTransaction({
      ...populatedTransaction,
      from: attempt.account,
    });
    setChainPhase("awaiting_wallet", "请在 MetaMask 中核对合约地址与交易后确认签发。", "pending");
    // No await is allowed between the final context check above and this EIP-1193 request.
    // The fixed `from` and populated `chainId` make wallet-side account/network changes rejectable.
    const transactionHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [rpcTransaction],
    });
    attempt.txHash = transactionHash;
    state.wallet.txHash = transactionHash;
    showTransactionLink(attempt.txHash);
    setCardChainStatus("主网交易已提交 · 等待确认", "pending");
    setChainPhase("confirming", "交易已提交，正在等待 BOT Chain Mainnet 出块确认…", "pending");

    let receipt;
    try {
      const transaction = await provider.getTransaction(transactionHash);
      receipt = transaction
        ? await transaction.wait(1)
        : await provider.waitForTransaction(transactionHash, 1, 120000);
    } catch (error) {
      if (walletErrorCode(error) !== "TRANSACTION_REPLACED" || !error.receipt) throw error;
      receipt = error.receipt;
      attempt.txHash = receipt.hash || receipt.transactionHash || error.replacement?.hash || attempt.txHash;
      state.wallet.txHash = attempt.txHash;
      showTransactionLink(attempt.txHash);
      if (error.cancelled) {
        const memoryExists = await readContract.memoryExists(attempt.memoryId);
        if (!memoryExists) {
          setMemoryLocked(false);
          await refreshMemoryReceipt();
          state.wallet.activeAttempt = null;
          setCardChainStatus("主网签发已取消 · 未登记", "local");
          if (state.wallet.account && state.wallet.issuerAuthorized) {
            setChainPhase("ready", "替换交易已确认，且目标 memory 不存在；没有写入记忆记录，可以重新发起。", "warning");
          } else {
            setChainPhase("wallet_changed", "替换交易已确认，且目标 memory 不存在；请重新连接并核验钱包后再试。", "warning");
          }
          return;
        }
      }
    }
    if (!isActiveAttempt(attempt)) return;
    if (!receipt) throw new Error("Transaction confirmation unavailable");
    if (Number(receipt.status) !== 1) throw new Error("Transaction reverted");

    setChainPhase("readback", "交易已确认，正在从合约回读并比对链上记录…", "pending");
    await confirmAttemptFromChain(attempt, readContract, receipt);
  } catch (error) {
    console.warn("BOT Chain memory issue failed", error);
    if (!isActiveAttempt(attempt)) return;
    const message = String(error?.shortMessage || error?.message || "").toLowerCase();
    const revertedReceipt = error?.receipt || error?.info?.receipt || null;
    const transactionReverted = Number(revertedReceipt?.status) === 0 ||
      message.includes("transaction reverted") ||
      message.includes("transaction execution reverted") ||
      message.includes("execution reverted");
    if (attempt.txHash && transactionReverted) {
      await markAttemptReverted(attempt, revertedReceipt);
      return;
    }
    if (attempt.txHash) {
      state.wallet.txHash = attempt.txHash;
      showTransactionLink(attempt.txHash);
      setCardChainStatus(`主网交易已提交 · ${shortHex(attempt.txHash, 8, 6)}`, "pending");
      setChainPhase("submitted_unknown", "交易已经提交，但页面未能完成确认或回读。请以区块浏览器结果为准，避免重复签发。", "warning");
      return;
    }
    setMemoryLocked(false);
    await refreshMemoryReceipt();
    state.wallet.activeAttempt = null;
    const contextInvalid = message.includes("notauthorizedissuer") ||
      message.includes("wallet account changed") ||
      message.includes("wrong chain") ||
      message.includes("runtime hash mismatch") ||
      message.includes("no runtime code") ||
      message.includes("persona package");
    const walletContextCleared = !state.wallet.account || !state.wallet.issuerAuthorized;
    if (contextInvalid || walletContextCleared) {
      state.wallet.provider = null;
      state.wallet.signer = null;
      state.wallet.contract = null;
      state.wallet.issuerAuthorized = false;
      document.querySelector("[data-issuer-status]").textContent = "需要重新核验";
      setChainPhase(
        contextInvalid ? "preflight_failed" : "wallet_changed",
        contextInvalid ? describeWalletError(error) : "钱包环境已变化，请重新连接并核验签发权限。",
        "error",
      );
    } else {
      setChainPhase("ready", describeWalletError(error), "error");
    }
  }
}

async function verifySubmittedTransaction() {
  const attempt = state.wallet.activeAttempt;
  if (!attempt?.txHash || !window.ethereum || !chainComponentsReady) return;
  try {
    setChainPhase("readback", "正在重新读取交易回执与链上 memory 记录…", "pending");
    const provider = new ethersLib.BrowserProvider(window.ethereum, "any");
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_CONFIG.chainId) throw new Error(`Wrong chain: ${network.chainId}`);
    const receipt = await provider.getTransactionReceipt(attempt.txHash);
    if (!receipt) {
      setChainPhase("submitted_unknown", "暂未取得交易回执；请稍后重试，并避免重复签发。", "warning");
      return;
    }
    if (Number(receipt.status) !== 1) {
      await markAttemptReverted(attempt, receipt);
      return;
    }
    const contract = new ethersLib.Contract(CHAIN_CONFIG.registryAddress, CHAIN_CONFIG.registryAbi, provider);
    await confirmAttemptFromChain(attempt, contract, receipt);
  } catch (error) {
    console.warn("BOT Chain transaction verification failed", error);
    setChainPhase("submitted_unknown", "仍未能完成回读核验。请查看区块浏览器，并在网络恢复后再次核验。", "warning");
  }
}

function downloadVerificationProof() {
  if (!state.wallet.evidence) return;
  const blob = new Blob([`${JSON.stringify(state.wallet.evidence, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.memoryId}-botchain-proof.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  let line = "";
  let count = 0;
  for (const char of text) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + count * lineHeight);
      count += 1;
      if (count >= maxLines) return;
      line = char;
    } else {
      line = next;
    }
  }
  if (line && count < maxLines) ctx.fillText(line, x, y + count * lineHeight);
}

async function downloadCard() {
  if (!state.acceptedPoem || state.screen !== "memory") return;
  await refreshMemoryReceipt();
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  const background = await loadImage("./assets/memory-settlement.png");
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#9c3f35";
  ctx.font = "700 27px system-ui";
  ctx.fillText("江城故人 · 李白篇", 965, 140);
  ctx.fillStyle = "#17383b";
  ctx.font = "700 58px 'Songti SC', serif";
  ctx.fillText("黄鹤楼同游诗旅记忆", 965, 222);
  ctx.font = "30px 'Songti SC', serif";
  ctx.fillText(state.acceptedPoem.title.slice(0, 12), 968, 280);
  ctx.font = "38px 'Songti SC', serif";
  state.acceptedPoem.lines.forEach((line, index) => ctx.fillText(line, 968, 360 + index * 65));
  ctx.fillStyle = "#365c61";
  ctx.font = "24px system-ui";
  ctx.fillText(`今日意象：${state.keywords.join("、")}`, 968, 690);
  ctx.fillText("同行记忆：玉笛、黄鹤", 968, 730);
  const note = document.querySelector("#player-note").value.trim();
  if (note) {
    ctx.fillStyle = "#ad3127";
    ctx.font = "700 27px system-ui";
    wrapText(ctx, `我的留言：${note}`, 968, 784, 780, 32, 2);
    ctx.fillStyle = "#365c61";
  }
  ctx.font = "19px system-ui";
  ctx.fillText("同游寄语：江风作伴，今日新句留与君。", 968, 865);
  ctx.fillText(`记忆编号：${state.memoryId}`, 968, 918);
  ctx.fillText(`内容摘要：${shortHex(state.memoryHash, 10, 8)}`, 968, 950);
  ctx.fillStyle = "#8b5e50";
  ctx.font = "700 20px system-ui";
  const chainReceiptText = state.wallet.phase === "confirmed"
    ? state.wallet.txHash
      ? `BOT Chain 主网已登记 · ${shortHex(state.wallet.txHash, 8, 6)}`
      : "BOT Chain 主网已登记 · 链上记录已恢复"
    : state.wallet.phase === "record_recovered"
      ? "链上记录已回读 · 交易待补充"
      : ["confirming", "readback", "submitted_unknown"].includes(state.wallet.phase) && state.wallet.txHash
      ? `主网交易已提交 · ${shortHex(state.wallet.txHash, 8, 6)}`
      : "本地回执 · 尚未登记 BOT Chain";
  ctx.fillText(chainReceiptText, 968, 990);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("记忆卡图片生成失败");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${state.memoryId}.png`;
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetJourney() {
  if (["connecting", "switching", "checking", "awaiting_wallet", "confirming", "readback", "submitted_unknown"].includes(state.wallet.phase)) return;
  resetMapFlight();
  state.activeAnchorId = null;
  state.explored.clear();
  state.keywords = [];
  state.generationCount = 0;
  state.acceptedPoem = null;
  state.memoryId = "";
  state.onchainMemoryId = "";
  state.memoryNonce = "";
  state.memoryCreatedAt = "";
  state.memoryPayloadJson = "";
  state.memoryHash = "";
  state.memoryHashRevision += 1;
  state.memoryLocked = false;
  state.wallet.txHash = "";
  state.wallet.receipt = null;
  state.wallet.activeAttempt = null;
  state.wallet.evidence = null;
  document.querySelector("[data-draft-editor]").hidden = true;
  document.querySelector("#poem-lines").value = "";
  document.querySelector("#player-note").value = "";
  document.querySelector("#player-note").disabled = false;
  document.querySelector("[data-memory-note]").textContent = "尚未填写";
  setCardChainStatus("本地回执 · 尚未登记 BOT Chain", "local");
  showTransactionLink("");
  showProofEvidence(null);
  if (!chainComponentsReady) {
    setChainPhase("components_missing", "链上组件未加载；本地记忆卡仍可生成和下载。", "error");
    document.querySelector("[data-action='connect-wallet']").disabled = true;
  } else if (state.wallet.contract && state.wallet.signer && state.wallet.issuerAuthorized) {
    setChainPhase("ready", "钱包核验仍有效；完成新旅程后可登记新的记忆摘要。", "ready");
  } else {
    setChainPhase("local", "连接钱包后将依次核验网络、合约代码、人格包与签发权限。", "local");
  }
  document.querySelector("[data-action='generate-poem']").disabled = false;
  document.querySelector("[data-action='rewrite-poem']").disabled = false;
  document.querySelectorAll(".keyword-chip[data-keyword]").forEach((button) => {
    if (!DEFAULT_KEYWORDS.includes(button.dataset.keyword)) button.remove();
  });
  selectCharacter("libai");
  updateKeywordUI();
  updateExploreUI();
  showScreen("select");
}

document.addEventListener("click", async (event) => {
  if (!event.target.closest("[data-action='toggle-music']")) ensureMusicPlaying();
  const character = event.target.closest("[data-character]")?.dataset.character;
  if (character) { selectCharacter(character, { launch: character === "libai" }); return; }
  const anchor = event.target.closest("[data-anchor]")?.dataset.anchor;
  if (anchor) { openStory(anchor); return; }
  const keyword = event.target.closest(".keyword-chip")?.dataset.keyword;
  if (keyword) { toggleKeyword(keyword); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "toggle-music") { toggleMusic(); return; }
  if (action === "enter") showScreen("select");
  if (action === "back-select") showScreen("select");
  if (action === "arrive-map") showScreen("map");
  if (action === "enter-tower") beginMapFlight();
  if (action === "close-anchor-dialog") event.target.closest("dialog")?.close();
  if (action === "ack-anchor") acknowledgeAnchor();
  if (action === "start-poem") showScreen("poem");
  if (action === "back-explore") showScreen("explore");
  if (action === "generate-poem" || action === "rewrite-poem") generatePoem();
  if (action === "adopt-poem") await buildMemory();
  if (action === "connect-wallet") await connectWallet();
  if (action === "seal-memory") await sealMemoryOnchain();
  if (action === "verify-transaction") await verifySubmittedTransaction();
  if (action === "download-proof") downloadVerificationProof();
  if (action === "download-card") await downloadCard();
  if (action === "restart") resetJourney();
});
document.querySelector("#player-note").addEventListener("input", (event) => {
  if (state.memoryLocked) return;
  const note = event.target.value.trim();
  document.querySelector("[data-memory-note]").textContent = note || "尚未填写";
  refreshMemoryReceipt();
});

function invalidateWalletVerification(message) {
  state.wallet.contextRevision += 1;
  const phaseBeforeChange = state.wallet.phase;
  const attempt = state.wallet.activeAttempt;
  const preserveProofState = Boolean(attempt?.txHash) ||
    ["awaiting_wallet", "confirming", "readback", "confirmed", "submitted_unknown"].includes(phaseBeforeChange);
  if (attempt && !attempt.txHash && phaseBeforeChange !== "awaiting_wallet") {
    state.wallet.activeAttempt = null;
    setMemoryLocked(false);
    refreshMemoryReceipt().catch(() => {});
  }
  state.wallet.provider = null;
  state.wallet.signer = null;
  state.wallet.contract = null;
  state.wallet.account = "";
  state.wallet.issuerAuthorized = false;
  document.querySelector("[data-wallet-address]").textContent = "需要重新连接";
  document.querySelector("[data-issuer-status]").textContent = "等待重新核验";
  if (!preserveProofState) setChainPhase("wallet_changed", message, "warning");
}

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", () => {
    invalidateWalletVerification("MetaMask 账户已变化，请重新连接并核验签发权限。");
  });
  window.ethereum.on("chainChanged", () => {
    invalidateWalletVerification("MetaMask 网络已变化，请重新连接 BOT Chain Mainnet。");
  });
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const report = (error) => console.warn("WebMCP registration failed", error);
  const tools = [
    {
      name: "get_li_bai_journey_state", title: "读取李白旅程状态",
      description: "读取画面、两处已确认的诗境、意象和本地记忆编号，不改变状态。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() { return { screen: state.screen, exploredAnchors: [...state.explored], keywords: [...state.keywords], memoryId: state.memoryId || null }; },
    },
    {
      name: "start_li_bai_journey", title: "开始李白旅程",
      description: "选择李白并打开御笔飞行画面。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() { selectCharacter("libai"); showScreen("flight"); return { screen: state.screen, characterId: "libai" }; },
    },
    {
      name: "stage_poem_keywords", title: "设置共题诗意象",
      description: "仅在玉笛、黄鹤两处都完成后，收进二至三个意象并打开题诗画面。",
      inputSchema: {
        type: "object",
        properties: { keywords: { type: "array", minItems: 2, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 6 } } },
        required: ["keywords"], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (state.explored.size !== ANCHORS.length) throw new Error("请先确认玉笛和黄鹤两处剧情。");
        if (!Array.isArray(input?.keywords) || input.keywords.length < 2 || input.keywords.length > 3) throw new TypeError("keywords 须为二至三个意象");
        const next = input.keywords.map(cleanKeyword);
        if (next.some((word) => !DEFAULT_KEYWORDS.includes(word)) || new Set(next).size !== next.length) throw new TypeError("意象须从页面提供的选项中选择，且不能重复");
        state.keywords = next;
        updateKeywordUI();
        showScreen("poem");
        return { screen: state.screen, keywords: [...state.keywords] };
      },
    },
  ];
  tools.forEach((tool) => { try { Promise.resolve(context.registerTool(tool)).catch(report); } catch (error) { report(error); } });
}

function initializeChainUI() {
  const contractLink = document.querySelector("[data-contract-link]");
  if (!chainComponentsReady) {
    contractLink.removeAttribute("href");
    contractLink.textContent = "链组件未加载";
    setChainPhase("components_missing", "链上组件未加载；本地记忆卡仍可生成和下载。", "error");
    document.querySelector("[data-action='connect-wallet']").disabled = true;
    return;
  }
  contractLink.href = `${CHAIN_CONFIG.explorerUrl}/address/${CHAIN_CONFIG.registryAddress}`;
  contractLink.textContent = `${shortHex(CHAIN_CONFIG.registryAddress)} ↗`;
  const deploymentLink = document.querySelector("[data-deployment-tx-link]");
  const personaLink = document.querySelector("[data-persona-tx-link]");
  const memoryIssueLink = document.querySelector("[data-memory-issue-tx-link]");
  deploymentLink.href = `${CHAIN_CONFIG.explorerUrl}/tx/${CHAIN_CONFIG.evidence.deploymentTxHash}`;
  personaLink.href = `${CHAIN_CONFIG.explorerUrl}/tx/${CHAIN_CONFIG.evidence.personaRegistrationTxHash}`;
  memoryIssueLink.href = `${CHAIN_CONFIG.explorerUrl}/tx/${CHAIN_CONFIG.evidence.memoryIssueSampleTxHash}`;
  setChainPhase("local", "连接钱包后将依次核验网络、合约代码、人格包与签发权限。", "local");
}

updateExploreUI();
updateKeywordUI();
syncMusicButton();
initializeChainUI();
registerWebMcpTools();
