(() => {
  "use strict";
  const states = new WeakMap();

  function stateFor(element) {
    let state = states.get(element);
    if (!state) {
      state = { source: element.innerHTML, revision: 0, renderedRevision: -1, width: 0, pending: null, timer: 0 };
      state.observer = new ResizeObserver(() => {
        if (!element.clientWidth || Math.abs(element.clientWidth - state.width) < 1) return;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => render(element), 150);
      });
      states.set(element, state);
      state.observer.observe(element);
    }
    return state;
  }

  function setSource(element, source) {
    const state = stateFor(element);
    if (state.source !== source) {
      state.source = source;
      state.revision++;
    }
    return render(element);
  }

  function render(element) {
    const state = stateFor(element);
    if (!element.clientWidth || (state.width === element.clientWidth && state.renderedRevision === state.revision && element.dataset.mathState === "ready")) return Promise.resolve();
    if (state.pending) return state.pending;
    let revision = state.revision;
    element.dataset.mathState = "loading";
    element.setAttribute("aria-busy", "true");
    state.pending = (async () => {
      await globalThis.LocalMathJax.load();
      if (!element.clientWidth) return;
      const width = element.clientWidth;
      revision = state.revision;
      MathJax.typesetClear([element]);
      element.innerHTML = state.source;
      await MathJax.typesetPromise([element]);
      state.width = width;
      state.renderedRevision = revision;
      element.dataset.mathState = revision === state.revision ? "ready" : "loading";
    })().catch(error => {
      element.dataset.mathState = "error";
      if (!element.querySelector(".math-error")) {
        const message = document.createElement("p");
        message.className = "math-error";
        message.setAttribute("role", "alert");
        message.textContent = element.lang === "zh-CN" ? "公式排版未完成，请确认 D:\\MathJax 中的共享文件完整后重新打开页面。" :
          "Equation rendering failed. Check the shared files in D:\\MathJax, then reopen this page.";
        element.prepend(message);
      }
      console.error(error);
    }).finally(() => {
      element.removeAttribute("aria-busy");
      state.pending = null;
      if (element.clientWidth && (state.revision !== revision || (element.dataset.mathState === "ready" && element.clientWidth !== state.width))) render(element);
    });
    return state.pending;
  }

  globalThis.NeuroMath = { render, setSource };
})();
