(function () {
  "use strict";

  const announced = [];
  const seenProviders = new WeakSet();
  let discoveryRequested = false;

  function providerName(provider, fallback = "EVM 钱包") {
    if (provider?.isMetaMask) return "MetaMask";
    if (provider?.isOkxWallet || provider?.isOKExWallet) return "OKX Wallet";
    return fallback;
  }

  function remember(info, provider) {
    if (!provider || typeof provider.request !== "function" || seenProviders.has(provider)) return;
    seenProviders.add(provider);
    announced.push({
      info: {
        uuid: info?.uuid || `legacy-${announced.length + 1}`,
        name: info?.name || providerName(provider),
        icon: info?.icon || "",
        rdns: info?.rdns || "",
      },
      provider,
    });
  }

  window.addEventListener("eip6963:announceProvider", (event) => {
    remember(event.detail?.info, event.detail?.provider);
  });

  function requestDiscovery() {
    if (discoveryRequested) return;
    discoveryRequested = true;
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected = window.ethereum;
    if (Array.isArray(injected?.providers)) {
      injected.providers.forEach((provider) => remember(null, provider));
    }
    remember(null, window.okxwallet);
    remember(null, injected);
  }

  async function availableProviders() {
    requestDiscovery();
    await new Promise((resolve) => setTimeout(resolve, 180));
    return [...announced];
  }

  function chooseProvider(providers) {
    if (!providers.length) return Promise.resolve(null);
    if (providers.length === 1) return Promise.resolve(providers[0]);

    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "wallet-picker";
      dialog.setAttribute("aria-labelledby", "wallet-picker-title");
      const panel = document.createElement("section");
      const heading = document.createElement("div");
      heading.className = "wallet-picker__heading";
      heading.innerHTML = '<p>BOT Chain Mainnet</p><h2 id="wallet-picker-title">选择你的 EVM 钱包</h2><span>支持 EIP-6963 钱包发现，也兼容传统注入钱包。</span>';
      const list = document.createElement("div");
      list.className = "wallet-picker__list";

      providers.forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wallet-picker__option";
        if (entry.info.icon?.startsWith("data:image/")) {
          const image = document.createElement("img");
          image.src = entry.info.icon;
          image.alt = "";
          button.append(image);
        } else {
          const seal = document.createElement("i");
          seal.textContent = "链";
          button.append(seal);
        }
        const copy = document.createElement("span");
        copy.innerHTML = `<strong>${entry.info.name}</strong><small>${entry.info.rdns || providerName(entry.provider)}</small>`;
        button.append(copy);
        button.addEventListener("click", () => {
          dialog.close();
          resolve(entry);
        });
        list.append(button);
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "wallet-picker__cancel";
      cancel.textContent = "暂不连接";
      cancel.addEventListener("click", () => {
        dialog.close();
        resolve(null);
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        dialog.close();
        resolve(null);
      }, { once: true });
      dialog.addEventListener("close", () => dialog.remove(), { once: true });
      panel.append(heading, list, cancel);
      dialog.append(panel);
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  async function selectProvider() {
    return chooseProvider(await availableProviders());
  }

  window.JiangchengWallet = Object.freeze({
    availableProviders,
    selectProvider,
  });
})();
