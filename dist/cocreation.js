(function () {
  "use strict";

  const config = window.BOTCHAIN_CONFIG;
  const ethersLib = window.ethers;
  const coConfig = config?.coCreationRegistry;
  const ZERO_HASH = `0x${"0".repeat(64)}`;
  const INTERPRETATION_LABELS = Object.freeze({
    1: "高山",
    2: "流水",
    3: "相逢",
    4: "远响",
  });
  const listenedProviders = new WeakSet();

  const state = {
    selectedWallet: null,
    browserProvider: null,
    signer: null,
    account: "",
    writeContract: null,
    readProvider: null,
    readContract: null,
    sourceContract: null,
    poemParentId: "",
    poemParent: null,
    musicWorkId: "",
    musicWork: null,
    musicReviewBlock: "",
    recipeJson: "",
    recipe: null,
    shareUrl: "",
    audioContext: null,
    previewStops: [],
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function shortHex(value, head = 6, tail = 4) {
    if (!value) return "";
    return `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
  }

  function setStatus(message, tone = "ready") {
    const status = $("[data-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function configuredAddress() {
    const address = coConfig?.address;
    return Boolean(ethersLib && address && ethersLib.isAddress(address) && address !== ethersLib.ZeroAddress);
  }

  function configuredSourceRegistry() {
    return Boolean(ethersLib && config?.registryAddress && ethersLib.isAddress(config.registryAddress));
  }

  function routePersona(route) {
    return route === "music" ? config?.personaBoya : config?.persona;
  }

  function routePersonaLabel(route) {
    return route === "music" ? "伯牙子期人格包" : "李白人格包";
  }

  function workSourceLabel(work) {
    if (!work) return "—";
    const packageId = String(work.packageId || "").toLowerCase();
    const poemId = String(config?.persona?.packageId || "").toLowerCase();
    const musicId = String(config?.personaBoya?.packageId || "").toLowerCase();
    const name = packageId === poemId
      ? "李白人格包"
      : packageId === musicId
        ? "伯牙子期人格包"
        : `人格包 ${shortHex(String(work.packageId), 8, 6)}`;
    return `${name} v${Number(work.packageVersion)}`;
  }

  function explorerUrl(kind, value) {
    if (!config?.explorerUrl || !value) return "#";
    return `${config.explorerUrl}/${kind}/${value}`;
  }

  function byteLength(value) {
    return new TextEncoder().encode(value).length;
  }

  function randomToken() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return [...crypto.getRandomValues(new Uint8Array(20))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  function createId(namespace, account, contentHash) {
    return ethersLib.keccak256(ethersLib.toUtf8Bytes([
      "jiangcheng-guren",
      namespace,
      "v1",
      config.chainId,
      account.toLowerCase(),
      contentHash,
      Date.now(),
      randomToken(),
    ].join(":")));
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setFormBusy(form, busy, pendingText = "请在钱包中确认…") {
    if (!form) return;
    form.setAttribute("aria-busy", String(busy));
    const submit = $("button[type='submit']", form);
    if (!submit) return;
    if (busy) {
      submit.dataset.idleLabel = submit.textContent;
      submit.textContent = pendingText;
      submit.disabled = true;
    } else {
      submit.textContent = submit.dataset.idleLabel || submit.textContent;
      submit.disabled = false;
    }
  }

  function setFormEnabled(form, enabled) {
    if (!form) return;
    $$('input, textarea, select, button', form).forEach((control) => {
      control.disabled = !enabled;
    });
  }

  function walletErrorCode(error) {
    return error?.code ?? error?.info?.error?.code ?? error?.error?.code ?? error?.data?.originalError?.code;
  }

  function errorData(error) {
    return error?.data?.data ?? error?.data ?? error?.info?.error?.data ?? error?.error?.data;
  }

  function customErrorName(error) {
    if (!coConfig?.abi || !ethersLib) return "";
    try {
      return new ethersLib.Interface(coConfig.abi).parseError(errorData(error))?.name || "";
    } catch {
      return "";
    }
  }

  function describeError(error) {
    const code = walletErrorCode(error);
    const custom = customErrorName(error);
    const message = String(error?.shortMessage || error?.message || "").toLowerCase();
    if (code === 4001 || code === "ACTION_REJECTED" || message.includes("user rejected")) {
      return "你已取消钱包操作，未写入主网。";
    }
    if (code === -32002) return "钱包中已有待处理请求，请先在钱包里完成或取消。";
    if (message.includes("insufficient funds")) return "当前钱包 BOT 余额不足以支付交易费。";
    if (message.includes("not deployed") || message.includes("not configured")) {
      return "共创合约尚未完成主网部署配置，当前不会发起交易。";
    }
    if (message.includes("wrong chain")) return "当前钱包不在 BOT Chain Mainnet（Chain ID 677）。";
    if (message.includes("runtime hash mismatch") || message.includes("no runtime code")) {
      return "合约代码与项目固定配置不一致，已安全停止。";
    }
    if (message.includes("source registry mismatch")) {
      return "共创合约绑定的人格包注册簿与项目配置不一致，已安全停止。";
    }
    if (message.includes("source package not registered")) {
      return "对应人格包版本尚未在原方案合约登记，不能伪造来源后发布。";
    }
    if (message.includes("selfresponsenotallowed")) return "上联发起人不能使用同一钱包自己对下联。";
    if (message.includes("selfattestationnotallowed")) return "曲目发布者不能使用同一钱包给自己做知音评价。";
    if (custom === "SelfResponseNotAllowed") return "上联发起人不能使用同一钱包自己对下联。";
    if (custom === "SelfAttestationNotAllowed") return "曲目发布者不能使用同一钱包给自己做知音评价。";
    if (custom === "DuplicateMusicReview") return "同一钱包对这首曲只能提交一次知音评价。";
    if (custom === "SourcePackageNotRegistered") {
      return "对应人格包版本尚未在原方案合约登记，不能伪造来源后发布。";
    }
    if (custom === "NotWorkCreator") return "只有这首曲的发布钱包可以认定知音。";
    if (custom === "AttestationAlreadyRecognized") return "这条知音评价已被认定。";
    if (custom === "WorkAlreadyExists" || custom === "AttestationAlreadyExists") {
      return "链上 ID 冲突，请重试以生成新 ID。";
    }
    if (custom === "WorkNotFound" || custom === "InvalidParentKind") return "链上未找到可用的邀请作品。";
    return error?.shortMessage || error?.reason || error?.message || "操作未完成，请检查钱包后重试。";
  }

  function initializeContractLink() {
    const link = $("[data-contract-link]");
    if (!link) return;
    if (!configuredAddress()) {
      link.removeAttribute("href");
      link.textContent = "等待主网部署";
      setStatus("页面与合约逻辑已就绪；共创合约地址尚未固定，因此暂不发起交易。", "pending");
      return;
    }
    link.href = explorerUrl("address", coConfig.address);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${shortHex(coConfig.address)} ↗`;
  }

  function initializeSourceRegistryLink() {
    const link = $("[data-source-registry-link]");
    if (!link) return;
    if (!configuredSourceRegistry()) {
      link.removeAttribute("href");
      link.textContent = "配置缺失";
      return;
    }
    link.href = explorerUrl("address", config.registryAddress);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${shortHex(config.registryAddress)} ↗`;

    const poemPersona = routePersona("poem");
    const musicPersona = routePersona("music");
    $("[data-poem-package-id]").textContent = shortHex(poemPersona?.packageId || "", 10, 8);
    $("[data-music-package-id]").textContent = shortHex(musicPersona?.packageId || "", 10, 8);
  }

  function publicProvider() {
    if (!state.readProvider) {
      state.readProvider = new ethersLib.JsonRpcProvider(
        config.rpcUrl,
        { chainId: config.chainId, name: config.chainName },
        { staticNetwork: true },
      );
    }
    return state.readProvider;
  }

  async function sourceContext(provider = publicProvider()) {
    if (!configuredSourceRegistry() || !config?.registryAbi) {
      throw new Error("Source registry not configured");
    }
    if (provider === state.readProvider && state.sourceContract) return state.sourceContract;
    const contract = new ethersLib.Contract(config.registryAddress, config.registryAbi, provider);
    if (provider === state.readProvider) state.sourceContract = contract;
    return contract;
  }

  async function assertSourcePackage(route, provider = state.browserProvider || publicProvider()) {
    const persona = routePersona(route);
    if (!persona?.packageId || !Number(persona.version)) {
      throw new Error("Source package not registered");
    }
    const registry = await sourceContext(provider);
    const exists = await registry.packageExists(persona.packageId, persona.version);
    if (!exists) throw new Error("Source package not registered");
    return persona;
  }

  async function refreshSourcePackageStatus() {
    for (const route of ["poem", "music"]) {
      const status = $(`[data-${route}-package-status]`);
      if (!status) continue;
      try {
        await assertSourcePackage(route, publicProvider());
        status.textContent = "主网已登记 · 可作为作品来源";
        status.dataset.state = "verified";
      } catch (error) {
        if (String(error?.message || "").toLowerCase().includes("not registered")) {
          status.textContent = "主网尚未登记 · 暂不可发布";
          status.dataset.state = "missing";
        } else {
          status.textContent = "主网暂不可达 · 发布时再核验";
          status.dataset.state = "pending";
        }
      }
    }
  }

  async function readContext() {
    if (!ethersLib || !config || !coConfig?.abi) throw new Error("Chain components not configured");
    if (!configuredAddress()) throw new Error("Co-creation contract not deployed or not configured");
    const provider = publicProvider();
    if (!state.readContract) {
      state.readContract = new ethersLib.Contract(coConfig.address, coConfig.abi, provider);
    }
    return { provider, contract: state.readContract };
  }

  async function switchToMainnet(provider) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: config.chainIdHex }],
      });
    } catch (error) {
      if (walletErrorCode(error) !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: config.chainIdHex,
          chainName: config.chainName,
          nativeCurrency: config.nativeCurrency,
          rpcUrls: [config.rpcUrl],
          blockExplorerUrls: [config.explorerUrl],
        }],
      });
    }
  }

  function resetWallet(message) {
    state.browserProvider = null;
    state.signer = null;
    state.account = "";
    state.writeContract = null;
    $("[data-wallet-address]").textContent = "尚未连接";
    $("[data-action='connect-wallet']").textContent = "连接 MetaMask / OKX";
    setStatus(message || "钱包状态已变化，请重新连接。", "pending");
  }

  async function verifyConfiguredContract(provider) {
    if (!configuredAddress()) throw new Error("Co-creation contract not deployed or not configured");
    const code = await provider.getCode(coConfig.address);
    if (code === "0x") throw new Error("Co-creation contract has no runtime code");
    if (coConfig.expectedRuntimeHash && ethersLib.keccak256(code).toLowerCase() !== coConfig.expectedRuntimeHash.toLowerCase()) {
      throw new Error("Co-creation runtime hash mismatch");
    }
    const contract = new ethersLib.Contract(coConfig.address, coConfig.abi, provider);
    const boundSourceRegistry = await contract.sourceRegistry();
    if (boundSourceRegistry.toLowerCase() !== config.registryAddress.toLowerCase()) {
      throw new Error("Co-creation source registry mismatch");
    }
  }

  async function connectWallet() {
    if (!ethersLib || !window.JiangchengWallet) throw new Error("Wallet components unavailable");
    setStatus("正在发现 MetaMask、OKX Wallet 等 EVM 钱包…", "pending");
    const selected = await window.JiangchengWallet.selectProvider();
    if (!selected) {
      setStatus("未选择钱包，没有发起交易。", "pending");
      return null;
    }
    const rawProvider = selected.provider;
    const accounts = await rawProvider.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) throw new Error("No wallet account returned");
    setStatus("正在切换到 BOT Chain Mainnet（Chain ID 677）…", "pending");
    await switchToMainnet(rawProvider);
    const browserProvider = new ethersLib.BrowserProvider(rawProvider, "any");
    const network = await browserProvider.getNetwork();
    if (Number(network.chainId) !== config.chainId) throw new Error(`Wrong chain: ${network.chainId}`);
    const signer = await browserProvider.getSigner();
    const account = await signer.getAddress();

    state.selectedWallet = selected;
    state.browserProvider = browserProvider;
    state.signer = signer;
    state.account = account;
    state.writeContract = null;
    $("[data-wallet-address]").textContent = account;
    $("[data-action='connect-wallet']").textContent = `${selected.info?.name || "EVM 钱包"} · ${shortHex(account)}`;

    if (!listenedProviders.has(rawProvider) && typeof rawProvider.on === "function") {
      listenedProviders.add(rawProvider);
      rawProvider.on("accountsChanged", () => resetWallet("钱包账户已变更，请重新连接后再签名。"));
      rawProvider.on("chainChanged", (chainId) => {
        if (Number.parseInt(chainId, 16) !== config.chainId) {
          resetWallet("钱包网络已变更，请切回 BOT Chain Mainnet。");
        }
      });
    }

    if (!configuredAddress()) {
      setStatus(`已连接 ${shortHex(account)}；共创合约尚待部署，当前不发起交易。`, "pending");
      return state;
    }

    await verifyConfiguredContract(browserProvider);
    state.writeContract = new ethersLib.Contract(coConfig.address, coConfig.abi, signer);
    setStatus(`已连接 ${shortHex(account)}，网络与合约校验通过。`);
    if (state.musicWorkId) {
      await loadMusicWork(state.musicWorkId, { quiet: true });
      if (state.musicReviewBlock === "creator") {
        setStatus("已连接曲目创作钱包；请切换另一钱包做知音评价。", "pending");
      } else if (state.musicReviewBlock === "reviewed") {
        setStatus("这个钱包已提交过一次知音评价，不能重复提交。", "pending");
      }
    }
    return state;
  }

  async function ensureWriteContract() {
    if (!configuredAddress()) throw new Error("Co-creation contract not deployed or not configured");
    if (!state.account || !state.writeContract) await connectWallet();
    if (!state.writeContract) throw new Error("Co-creation contract not deployed or not configured");
    const network = await state.browserProvider.getNetwork();
    if (Number(network.chainId) !== config.chainId) throw new Error(`Wrong chain: ${network.chainId}`);
    return state.writeContract;
  }

  function activateRoute(route) {
    const selected = route === "music" ? "music" : "poem";
    $$('[data-route-tab]').forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.routeTab === selected));
    });
    $$('[data-route-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.routePanel !== selected;
    });
  }

  function encodeFragment(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  }

  function decodeFragment(value) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function poemInviteUrl(parentId) {
    const url = new URL("./cocreation.html", window.location.href);
    url.searchParams.set("mode", "poem");
    url.searchParams.set("parent", parentId);
    return url.toString();
  }

  function musicInviteUrl(workId, recipeJson) {
    const url = new URL("./cocreation.html", window.location.href);
    url.searchParams.set("mode", "music");
    url.searchParams.set("work", workId);
    url.hash = `recipe=${encodeFragment(recipeJson)}`;
    return url.toString();
  }

  function showResult({ title, receipt, id, shareUrl = "", source = "—" }) {
    const section = $("[data-result]");
    $("[data-result-title]").textContent = title;
    $("[data-result-hash]").textContent = receipt.hash;
    $("[data-result-block]").textContent = String(receipt.blockNumber);
    $("[data-result-id]").textContent = id;
    $("[data-result-source]").textContent = source;
    const explorer = $("[data-result-explorer]");
    explorer.href = explorerUrl("tx", receipt.hash);
    state.shareUrl = shareUrl;
    $("[data-action='copy-share']").hidden = !shareUrl;
    $("[data-share-status]").textContent = shareUrl
      ? "邀请链接仅携带链上 ID；伯牙路线的配方放在 URL fragment，不会作为服务器请求参数。"
      : "";
    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadPoemParent(parentId, options = {}) {
    state.poemParentId = parentId;
    activateRoute("poem");
    $("[data-poem-create]").hidden = true;
    $("[data-poem-response]").hidden = false;
    try {
      if (!options.quiet) setStatus("正在从 BOT Chain 读取上联与作者…", "pending");
      const { contract } = await readContext();
      const work = await contract.getWork(parentId);
      if (Number(work.kind) !== 1) throw new Error("Invalid poem parent");
      state.poemParent = work;
      $("[data-upper-line]").textContent = work.displayText;
      $("[data-upper-author]").textContent = work.creator;
      $("[data-poem-work-source]").textContent = `人格来源已上链：${workSourceLabel(work)}`;
      await renderPoemLineage(contract, parentId);
      if (!options.quiet) setStatus("上联已通过合约 getter 直接回读核验。");
    } catch (error) {
      $("[data-upper-line]").textContent = "无法读取这条上联";
      setFormEnabled($("[data-form='respond-poem']"), false);
      setStatus(describeError(error), "error");
    }
  }

  async function renderPoemLineage(contract, parentId) {
    const container = $("[data-poem-lineage]");
    container.replaceChildren();
    const heading = createElement("h4", "", "已有的下联回应");
    container.append(heading);
    const count = Number(await contract.responseCount(parentId));
    heading.textContent = count > 50 ? `最近 50 条下联回应（共 ${count} 条）` : `已有的下联回应（${count} 条）`;
    const offset = Math.max(0, count - 50);
    const ids = await contract.getResponseIds(parentId, offset, 50);
    if (!ids.length) {
      container.append(createElement("p", "co-empty", "尚无人应句，你可能是第一位。"));
      return;
    }
    const works = await Promise.all(ids.map((id) => contract.getWork(id)));
    works.forEach((work) => {
      const article = createElement("article");
      article.append(
        createElement("small", "", `回应钱包 ${shortHex(work.creator)} · ${new Date(Number(work.createdAt) * 1000).toLocaleString("zh-CN")}`),
        createElement("blockquote", "", work.displayText),
      );
      article.append(createElement("code", "", `workId ${shortHex(work.workId, 10, 8)}`));
      container.append(article);
    });
  }

  async function publishPoem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const upperLine = $("#upper-line").value.trim();
    if (!upperLine) return;
    if (byteLength(upperLine) > 96) {
      setStatus("上联 UTF-8 内容超过 96 字节，请缩短后再试。", "error");
      return;
    }
    setFormBusy(form, true);
    try {
      const contract = await ensureWriteContract();
      const persona = await assertSourcePackage("poem", state.browserProvider);
      const contentHash = ethersLib.keccak256(ethersLib.toUtf8Bytes(upperLine));
      const workId = createId("poem-upper", state.account, contentHash);
      setStatus("请在钱包中确认“发布上联”主网交易…", "pending");
      const transaction = await contract.publishPoemUpper(
        workId,
        persona.packageId,
        persona.version,
        upperLine,
      );
      setStatus(`交易已提交 ${shortHex(transaction.hash, 8, 6)}，正在等待主网确认…`, "pending");
      const receipt = await transaction.wait(1);
      const shareUrl = poemInviteUrl(workId);
      showResult({
        title: "上联已上链，可邀请朋友应句",
        receipt,
        id: workId,
        shareUrl,
        source: `${routePersonaLabel("poem")} v${persona.version}`,
      });
      setStatus("上联已经主网确认。复制邀请链接，请另一个钱包对下联。");
    } catch (error) {
      setStatus(describeError(error), "error");
    } finally {
      setFormBusy(form, false);
    }
  }

  async function respondPoem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const lowerLine = $("#lower-line").value.trim();
    if (!lowerLine || !state.poemParentId) return;
    if (byteLength(lowerLine) > 96) {
      setStatus("下联 UTF-8 内容超过 96 字节，请缩短后再试。", "error");
      return;
    }
    setFormBusy(form, true);
    try {
      const contract = await ensureWriteContract();
      if (state.poemParent?.creator?.toLowerCase() === state.account.toLowerCase()) {
        throw new Error("SelfResponseNotAllowed");
      }
      const contentHash = ethersLib.keccak256(ethersLib.toUtf8Bytes(lowerLine));
      const workId = createId("poem-response", state.account, contentHash);
      setStatus("请在钱包中确认“提交下联”主网交易…", "pending");
      const transaction = await contract.respondPoem(workId, state.poemParentId, lowerLine);
      const receipt = await transaction.wait(1);
      showResult({
        title: "下联已上链，唱和关系成立",
        receipt,
        id: workId,
        source: workSourceLabel(state.poemParent),
      });
      $("#lower-line").value = "";
      const { contract: readContract } = await readContext();
      await renderPoemLineage(readContract, state.poemParentId);
      setStatus("下联已经主网确认，页面已回读父子作品关系。");
    } catch (error) {
      setStatus(describeError(error), "error");
    } finally {
      setFormBusy(form, false);
    }
  }

  function readRecipeFragment() {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const encoded = params.get("recipe");
    if (!encoded) return "";
    try {
      return decodeFragment(encoded);
    } catch {
      return "";
    }
  }

  function renderRecipeSummary(recipe, verified) {
    const container = $("[data-recipe-summary]");
    container.replaceChildren();
    const rows = [
      ["配方指纹", verified ? "与链上 Hash 一致" : "未通过校验"],
      ["心境", recipe?.theme === "mountain" ? "高山" : recipe?.theme === "water" ? "流水" : recipe?.theme || "未标注"],
      ["琴音", `${Array.isArray(recipe?.notes) ? recipe.notes.length : 0} 声`],
      ["江城声景", Array.isArray(recipe?.soundLayers) && recipe.soundLayers.length ? recipe.soundLayers.join("、") : "无"],
      ["生成引擎", recipe?.engineVersion || "未标注"],
      ["配方时间", recipe?.createdAt ? new Date(recipe.createdAt).toLocaleString("zh-CN") : "未标注"],
    ];
    rows.forEach(([label, value]) => {
      const item = createElement("div");
      item.append(createElement("span", "", label), createElement("strong", "", value));
      container.append(item);
    });
  }

  function stopPreview() {
    state.previewStops.forEach((stop) => {
      try { stop(); } catch { /* already stopped */ }
    });
    state.previewStops = [];
  }

  async function previewRecipe() {
    if (!state.recipe || !Array.isArray(state.recipe.notes) || !state.recipe.notes.length) {
      setStatus("邀请链接中没有可校验的配方音符，无法试听。", "error");
      return;
    }
    stopPreview();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      setStatus("当前浏览器不支持 Web Audio，但仍可核验配方 Hash。", "error");
      return;
    }
    if (!state.audioContext) state.audioContext = new AudioContextClass();
    if (state.audioContext.state === "suspended") await state.audioContext.resume();
    const ctx = state.audioContext;
    const notes = state.recipe.notes.slice(0, 32);
    const beat = state.recipe.theme === "mountain" ? 0.72 : 0.46;
    const frequencies = [293.66, 329.63, 392, 440, 493.88];
    const start = ctx.currentTime + 0.06;
    notes.forEach((note, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const degree = Math.max(0, Math.min(4, Number(note.degree) || 0));
      const velocity = Math.max(0.16, Math.min(1, Number(note.velocity) || 0.5));
      const at = start + index * beat;
      oscillator.type = state.recipe.theme === "mountain" ? "triangle" : "sine";
      oscillator.frequency.value = frequencies[degree];
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18 * velocity, at + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + beat * 0.88);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + beat);
      state.previewStops.push(() => oscillator.stop());
    });
    setStatus(`正在试听 ${notes.length} 声配方旋律；听见的内容由分享配方还原，链上仅保存其 Hash。`);
  }

  async function loadMusicWork(workId, options = {}) {
    state.musicWorkId = workId;
    activateRoute("music");
    $("[data-music-create]").hidden = true;
    $("[data-music-review]").hidden = false;
    try {
      if (!options.quiet) setStatus("正在回读曲目指纹与已有知音评价…", "pending");
      const { contract } = await readContext();
      const work = await contract.getWork(workId);
      if (Number(work.kind) !== 3) throw new Error("Invalid music work");
      state.musicWork = work;
      $("[data-shared-music-title]").textContent = `《${work.displayText}》`;
      $("[data-music-work-source]").textContent = `人格来源已上链：${workSourceLabel(work)}`;

      const recipeJson = readRecipeFragment();
      let verified = false;
      let recipe = null;
      if (recipeJson) {
        try {
          recipe = JSON.parse(recipeJson);
          verified = ethersLib.keccak256(ethersLib.toUtf8Bytes(recipeJson)).toLowerCase() === work.contentHash.toLowerCase();
        } catch {
          verified = false;
        }
      }
      state.recipeJson = verified ? recipeJson : "";
      state.recipe = verified ? recipe : null;
      renderRecipeSummary(recipe, verified);
      const isCreator = Boolean(state.account && work.creator.toLowerCase() === state.account.toLowerCase());
      const alreadyReviewed = Boolean(state.account && await contract.hasReviewedMusic(workId, state.account));
      state.musicReviewBlock = isCreator ? "creator" : alreadyReviewed ? "reviewed" : "";
      setFormEnabled($("[data-form='attest-music']"), verified && !state.musicReviewBlock);
      $("[data-action='preview-music']").disabled = !verified;
      await renderAttestations(contract, workId);
      if (!options.quiet) {
        setStatus(verified
          ? "配方 JSON 的 Keccak-256 与主网记录一致，可试听并提交知音评价。"
          : "链上曲目存在，但当前链接缺少配方或 Hash 不一致；为防止误评，已停用提交。", verified ? "ready" : "error");
      }
    } catch (error) {
      setFormEnabled($("[data-form='attest-music']"), false);
      $("[data-action='preview-music']").disabled = true;
      setStatus(describeError(error), "error");
    }
  }

  async function renderAttestations(contract, workId) {
    const container = $("[data-attestations]");
    const heading = createElement("h4", "", "链上知音评价");
    container.replaceChildren(heading);
    const count = Number(await contract.attestationCount(workId));
    heading.textContent = count > 50 ? `最近 50 条链上知音评价（共 ${count} 条）` : `链上知音评价（${count} 条）`;
    const offset = Math.max(0, count - 50);
    const ids = await contract.getAttestationIds(workId, offset, 50);
    if (!ids.length) {
      container.append(createElement("p", "co-empty", "尚无知音评价。"));
      return;
    }
    const records = await Promise.all(ids.map((id) => contract.getAttestation(id)));
    records.forEach((record) => {
      const article = createElement("article");
      const interpretation = Number(record.interpretation);
      const scores = `共鸣 ${Number(record.resonance)}/5 · 节奏 ${Number(record.rhythm)}/5 · 画面 ${Number(record.imagery)}/5`;
      article.append(
        createElement("strong", "", `${INTERPRETATION_LABELS[interpretation] || "未知"}${record.recognized ? " · 已认定知音" : ""}`),
        createElement("span", "", scores),
      );
      if (record.comment) article.append(createElement("p", "", record.comment));
      article.append(createElement("small", "", `评价钱包 ${shortHex(record.reviewer)} · ${new Date(Number(record.createdAt) * 1000).toLocaleString("zh-CN")}`));
      article.append(createElement("code", "", `attestationId ${shortHex(record.attestationId, 10, 8)}`));
      if (state.account && state.musicWork?.creator?.toLowerCase() === state.account.toLowerCase() && !record.recognized) {
        const button = createElement("button", "co-secondary", "由创作者认定为知音");
        button.type = "button";
        button.addEventListener("click", () => recognizeAttestation(record.attestationId, button));
        article.append(button);
      }
      container.append(article);
    });
  }

  async function publishMusic(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = $("#music-title").value.trim();
    const input = $("#recipe-json").value.trim();
    if (!title || !input) return;
    if (byteLength(title) > 96) {
      setStatus("曲名 UTF-8 内容超过 96 字节，请缩短后再试。", "error");
      return;
    }
    let recipe;
    try {
      recipe = JSON.parse(input);
    } catch {
      setStatus("音乐配方不是有效 JSON，请检查后再发布。", "error");
      return;
    }
    const recipeJson = JSON.stringify(recipe);
    if (byteLength(recipeJson) > 30000) {
      setStatus("配方超过 30 KB，不适合通过邀请链接分享。", "error");
      return;
    }
    setFormBusy(form, true);
    try {
      const contract = await ensureWriteContract();
      const persona = await assertSourcePackage("music", state.browserProvider);
      const recipeHash = ethersLib.keccak256(ethersLib.toUtf8Bytes(recipeJson));
      const workId = createId("music", state.account, recipeHash);
      setStatus("请在钱包中确认“发布曲目指纹”主网交易…", "pending");
      const transaction = await contract.publishMusic(
        workId,
        persona.packageId,
        persona.version,
        recipeHash,
        title,
      );
      setStatus(`交易已提交 ${shortHex(transaction.hash, 8, 6)}，正在等待主网确认…`, "pending");
      const receipt = await transaction.wait(1);
      const shareUrl = musicInviteUrl(workId, recipeJson);
      showResult({
        title: "曲目指纹已上链，可邀请朋友做子期",
        receipt,
        id: workId,
        shareUrl,
        source: `${routePersonaLabel("music")} v${persona.version}`,
      });
      setStatus("曲目已经主网确认。分享邀请链接后，另一个钱包可试听、校验并评价。");
    } catch (error) {
      setStatus(describeError(error), "error");
    } finally {
      setFormBusy(form, false);
    }
  }

  async function attestMusic(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!state.musicWorkId || !state.recipe) return;
    const data = new FormData(form);
    const interpretation = Number(data.get("interpretation"));
    const resonance = Number(data.get("resonance"));
    const rhythm = Number(data.get("rhythm"));
    const imagery = Number(data.get("imagery"));
    const comment = String(data.get("comment") || "").trim();
    if (!interpretation) {
      setStatus("请先选择你听见的意境。", "error");
      return;
    }
    if (byteLength(comment) > 360) {
      setStatus("知音解读 UTF-8 内容超过 360 字节，请缩短后再试。", "error");
      return;
    }
    setFormBusy(form, true);
    try {
      const contract = await ensureWriteContract();
      if (state.musicWork?.creator?.toLowerCase() === state.account.toLowerCase()) {
        throw new Error("SelfAttestationNotAllowed");
      }
      const assessmentSeed = ethersLib.keccak256(ethersLib.toUtf8Bytes(JSON.stringify({ interpretation, resonance, rhythm, imagery, comment })));
      const attestationId = createId("music-attestation", state.account, assessmentSeed);
      setStatus("请在钱包中确认“知音评价”主网交易…", "pending");
      const transaction = await contract.attestMusic(
        attestationId,
        state.musicWorkId,
        interpretation,
        resonance,
        rhythm,
        imagery,
        comment,
      );
      const receipt = await transaction.wait(1);
      showResult({
        title: "知音评价已上链",
        receipt,
        id: attestationId,
        source: workSourceLabel(state.musicWork),
      });
      form.reset();
      const { contract: readContract } = await readContext();
      await renderAttestations(readContract, state.musicWorkId);
      setStatus("知音评价已经主网确认，曲目发布者可以用原钱包认定。");
    } catch (error) {
      setStatus(describeError(error), "error");
    } finally {
      setFormBusy(form, false);
    }
  }

  async function recognizeAttestation(attestationId, button) {
    button.disabled = true;
    const idle = button.textContent;
    button.textContent = "等待钱包确认…";
    try {
      const contract = await ensureWriteContract();
      const transaction = await contract.recognizeAttestation(attestationId);
      setStatus(`认定交易已提交 ${shortHex(transaction.hash, 8, 6)}，正在等待确认…`, "pending");
      const receipt = await transaction.wait(1);
      showResult({
        title: "创作者已认定这位知音",
        receipt,
        id: attestationId,
        source: workSourceLabel(state.musicWork),
      });
      const { contract: readContract } = await readContext();
      await renderAttestations(readContract, state.musicWorkId);
      setStatus("知音认定已经主网确认。");
    } catch (error) {
      button.disabled = false;
      button.textContent = idle;
      setStatus(describeError(error), "error");
    }
  }

  async function copyShareUrl() {
    if (!state.shareUrl) return;
    try {
      await navigator.clipboard.writeText(state.shareUrl);
      $("[data-share-status]").textContent = "邀请链接已复制。请发给另一位参与者，并使用不同钱包完成回应。";
    } catch {
      window.prompt("请复制邀请链接：", state.shareUrl);
    }
  }

  async function loadRecipeFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      $("#recipe-json").value = text;
      if (!$("#music-title").value.trim()) {
        const parsed = JSON.parse(text);
        $("#music-title").value = String(parsed.title || file.name.replace(/\.json$/iu, "")).slice(0, 32);
      }
      setStatus("已读取本地配方 JSON；发布前仍需由你的钱包确认。");
    } catch {
      setStatus("所选文件不是有效 JSON。", "error");
    }
  }

  function consumeDrafts() {
    try {
      const poemDraft = JSON.parse(sessionStorage.getItem("jiangcheng:cocreation:poem-draft") || "null");
      if (poemDraft?.line) $("#upper-line").value = String(poemDraft.line).slice(0, 32);
      sessionStorage.removeItem("jiangcheng:cocreation:poem-draft");
    } catch { /* ignore invalid local draft */ }
    try {
      const musicDraft = JSON.parse(sessionStorage.getItem("jiangcheng:cocreation:music-draft") || "null");
      if (musicDraft?.title) $("#music-title").value = String(musicDraft.title).slice(0, 32);
      if (musicDraft?.recipeJson) $("#recipe-json").value = String(musicDraft.recipeJson);
      sessionStorage.removeItem("jiangcheng:cocreation:music-draft");
    } catch { /* ignore invalid local draft */ }
  }

  function initializeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode") === "music" ? "music" : "poem";
    activateRoute(mode);
    const parentId = params.get("parent");
    const workId = params.get("work");
    if (parentId && /^0x[0-9a-f]{64}$/iu.test(parentId)) {
      loadPoemParent(parentId);
    } else if (workId && /^0x[0-9a-f]{64}$/iu.test(workId)) {
      loadMusicWork(workId);
    }
  }

  function bindEvents() {
    $("[data-action='connect-wallet']")?.addEventListener("click", async () => {
      try { await connectWallet(); } catch (error) { setStatus(describeError(error), "error"); }
    });
    $$('[data-route-tab]').forEach((button) => {
      button.addEventListener("click", () => activateRoute(button.dataset.routeTab));
    });
    $("[data-form='publish-poem']")?.addEventListener("submit", publishPoem);
    $("[data-form='respond-poem']")?.addEventListener("submit", respondPoem);
    $("[data-form='publish-music']")?.addEventListener("submit", publishMusic);
    $("[data-form='attest-music']")?.addEventListener("submit", attestMusic);
    $("#recipe-file")?.addEventListener("change", loadRecipeFile);
    $("[data-action='preview-music']")?.addEventListener("click", previewRecipe);
    $("[data-action='copy-share']")?.addEventListener("click", copyShareUrl);
    window.addEventListener("pagehide", stopPreview);
  }

  initializeContractLink();
  initializeSourceRegistryLink();
  refreshSourcePackageStatus();
  consumeDrafts();
  bindEvents();
  initializeFromUrl();
})();
