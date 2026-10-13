(function () {
  "use strict";

  function saveDraft(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 隐私模式禁用 sessionStorage 时仍允许进入，用户可在共创页手动填写。
    }
  }

  function beginPoemCoCreation() {
    const lines = [...document.querySelectorAll("[data-memory-poem] p")]
      .map((element) => element.textContent.trim())
      .filter(Boolean);
    const line = lines[0] || "";
    const title = document.querySelector("[data-memory-poem-title]")?.textContent.trim() || "";
    if (line) saveDraft("jiangcheng:cocreation:poem-draft", { line, title });
    window.location.assign("./cocreation.html?mode=poem");
  }

  function beginMusicCoCreation() {
    const draft = window.JiangchengBoyaCoCreation?.getDraft?.();
    if (!draft) {
      const status = document.querySelector("[data-boya-track-status]");
      if (status) status.textContent = "请先在五弦舞台生成完整音乐配方，再邀请子期。";
      return;
    }
    saveDraft("jiangcheng:cocreation:music-draft", draft);
    window.location.assign("./cocreation.html?mode=music");
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-cocreation-poem]")) {
      beginPoemCoCreation();
      return;
    }
    if (event.target.closest("[data-cocreation-music]")) beginMusicCoCreation();
  });
})();
