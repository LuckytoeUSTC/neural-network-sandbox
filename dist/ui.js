(() => {
  "use strict";
  const ns = "http://www.w3.org/2000/svg";
  const paths = {
    info: ['circle:12,12,9', 'M12 10v7', 'M12 7h.01'],
    table: ['M3 4h18v16H3z', 'M3 9h18M3 14h18M9 4v16'],
    download: ['M12 3v12m-4-4 4 4 4-4', 'M4 16v5h16v-5'],
    upload: ['M12 16V4m-4 4 4-4 4 4', 'M4 16v5h16v-5'],
    matrix: ['M4 3H2v18h2M20 3h2v18h-2', 'M8 7h.01M12 7h.01M16 7h.01M8 12h.01M12 12h.01M16 12h.01M8 17h.01M12 17h.01M16 17h.01'],
    keyboard: ['M2 5h20v14H2z', 'M5 9h.01M9 9h.01M13 9h.01M17 9h.01M6 14h12']
    ,play: ['M8 4l12 8-12 8z']
    ,stop: ['M6 6h12v12H6z']
    ,check: ['M5 12l4 4L19 6']
    ,error: ['circle:12,12,9', 'M12 6v7M12 17h.01']
    ,refresh: ['M20 7v5h-5', 'M19 12a7 7 0 1 0-2 5']
    ,pause: ['M8 4v16M16 4v16']
    ,stimulus: ['M2 17h5V7h10v10h5']
    ,stimulusOff: ['M2 17h5V7h10v10h5', 'M3 3l18 18']
    ,expand: ['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5']
    ,collapse: ['M4 9h5V4M15 4v5h5M20 15h-5v5M9 20v-5H4']
    ,lock: ['M6 10h12v11H6z', 'M8 10V6a4 4 0 0 1 8 0v4', 'M12 14v3']
    ,unlock: ['M6 10h12v11H6z', 'M8 10V6a4 4 0 0 1 8 0', 'M12 14v3']
    ,layout: ['M4 6l8 6 8-8M12 12l5 8M12 12L3 19', 'circle:4,6,2', 'circle:12,12,2', 'circle:20,4,2', 'circle:17,20,2', 'circle:3,19,2']
    ,fit: ['M4 5v14M20 5v14', 'M8 8l-4 4 4 4M16 8l4 4-4 4M4 12h16']
    ,pin: ['M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7', 'M12 16v6']
    ,unpin: ['M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7', 'M12 16v6', 'M3 3l18 18']
  };
  function icon(name) {
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7"); svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    svg.classList.add("ui-icon");
    for (const path of paths[name] ?? paths.info) {
      if (path.startsWith("circle:")) {
        const shape = document.createElementNS(ns, "circle");
        const [cx, cy, r] = path.slice(7).split(",");
        shape.setAttribute("cx", cx); shape.setAttribute("cy", cy); shape.setAttribute("r", r); svg.append(shape);
      } else { const shape = document.createElementNS(ns, "path"); shape.setAttribute("d", path); svg.append(shape); }
    }
    return svg;
  }
  let dialog, title, body;
  function showInfo(heading, content) {
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "information-dialog";
      dialog.setAttribute("aria-labelledby", "information-title");
      title = document.createElement("h2"); title.id = "information-title";
      body = document.createElement("div"); body.className = "information-body";
      const form = document.createElement("form"); form.method = "dialog";
      const close = document.createElement("button"); close.className = "tool"; close.textContent = "Close";
      form.append(close); dialog.append(title, body, form); document.body.append(dialog);
    }
    title.textContent = heading;
    body.replaceChildren();
    const value = typeof content === "function" ? content() : content;
    for (const text of String(value || "No additional information.").split(/\n\n/)) {
      const paragraph = document.createElement("p"); paragraph.textContent = text; body.append(paragraph);
    }
    if (!dialog.open) dialog.showModal();
  }
  function infoButton(heading, content) {
    const button = document.createElement("button"); button.type = "button"; button.className = "icon-button info-button";
    button.title = `About ${heading}`; button.setAttribute("aria-label", `About ${heading}`); button.setAttribute("aria-haspopup", "dialog");
    button.append(icon("info")); bindInfo(button, content);
    return button;
  }
  let popup, infoOwner = null, infoSource, infoPinned = false, infoTimer = 0;
  function closeInfo() {
    clearTimeout(infoTimer); infoPinned = false;
    if (!popup || !infoOwner) return;
    infoOwner.setAttribute("aria-expanded", "false");
    if (popup.hidePopover && popup.matches(":popover-open")) popup.hidePopover();
    popup.hidden = true; infoOwner = null;
  }
  function positionInfo() {
    if (!infoOwner?.isConnected) { closeInfo(); return; }
    const anchor = infoOwner.getBoundingClientRect(), box = popup.getBoundingClientRect();
    const left = Math.max(12, Math.min(innerWidth - box.width - 12, anchor.left));
    let top = anchor.bottom + 7;
    if (top + box.height > innerHeight - 12) top = anchor.top - box.height - 7;
    top = Math.max(12, Math.min(innerHeight - box.height - 12, top));
    popup.style.left = `${left}px`; popup.style.top = `${top}px`;
  }
  function bindInfo(button, content) {
    button.removeAttribute("title"); button.removeAttribute("aria-haspopup");
    button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "info-popover");
    const queueClose = () => { if (!infoPinned) infoTimer = setTimeout(closeInfo, 180); };
    const open = pinned => {
      clearTimeout(infoTimer);
      if (infoOwner === button) { infoPinned = pinned || infoPinned; return; }
      closeInfo();
      if (!popup) {
        popup = document.createElement("div"); popup.id = "info-popover"; popup.className = "info-popover"; popup.tabIndex = -1;
        popup.setAttribute("role", "note"); popup.setAttribute("popover", "manual"); document.body.append(popup);
        popup.addEventListener("pointerenter", () => clearTimeout(infoTimer));
        popup.addEventListener("pointerleave", queueClose);
      }
      infoOwner = button; infoSource = content; infoPinned = pinned;
      const value = typeof infoSource === "function" ? infoSource() : infoSource;
      popup.replaceChildren(...String(value).split(/\n\n/).filter(Boolean).map(text => { const p = document.createElement("p"); p.textContent = text; return p; }));
      popup.hidden = false; popup.showPopover?.(); button.setAttribute("aria-expanded", "true"); positionInfo();
    };
    button.addEventListener("pointerenter", event => { if (event.pointerType !== "touch" && !infoPinned) open(false); });
    button.addEventListener("pointerleave", queueClose);
    button.addEventListener("click", event => {
      if (infoOwner === button && infoPinned) { closeInfo(); return; }
      open(true);
      if (!event.detail) popup.focus({ preventScroll: true });
    });
  }
  document.addEventListener("pointerdown", event => { if (infoOwner && !infoOwner.contains(event.target) && !popup.contains(event.target)) closeInfo(); }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && infoOwner) { event.preventDefault(); const owner = infoOwner; closeInfo(); owner.focus({ preventScroll: true }); }
  });
  addEventListener("resize", () => { if (infoOwner) positionInfo(); });
  document.addEventListener("scroll", () => { if (infoOwner) positionInfo(); }, true);
  function iconize(node, name, label) {
    const input = node.querySelector("input");
    node.replaceChildren(icon(name));
    if (input) node.append(input);
    node.classList.add("icon-button"); node.title = label; node.setAttribute("aria-label", label);
  }
  function formatNeuronIds(ids) {
    const parts = [];
    for (let i = 0; i < ids.length; i++) {
      const start = ids[i] + 1; let end = start;
      while (i + 1 < ids.length && ids[i + 1] === ids[i] + 1) end = ids[++i] + 1;
      parts.push(end === start ? String(start) : `${start}-${end}`);
    }
    return parts.join(", ");
  }
  function parseNeuronIds(text, available, noun = "Neuron") {
    const source = text.trim().replace(/[–—−]/g, "-").replace(/，/g, ",");
    if (/^(all|\*)$/i.test(source)) return [...available];
    const allowed = new Set(available), ids = [], seen = new Set();
    if (!source) throw new Error(`Enter ${noun.toLowerCase()} IDs, for example 1-4, 7, or all.`);
    for (const part of source.split(",")) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error("Use comma-separated IDs and ranges, for example 1-4, 7.");
      const a = Number(match[1]), z = Number(match[2] ?? match[1]);
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(z) || a < 1) throw new Error(`${noun} IDs must be positive integers.`);
      if (z < a) throw new Error(`Range ${a}-${z} is reversed. Put the smaller ID first.`);
      const max = Math.max(0, ...available) + 1;
      if (a > max) throw new Error(noun === "Neuron" ? `Neuron ${a} was not recorded. Include it in Recording and try again.` : `Channel ${a} is unavailable. Increase Readout channels in Recording.`);
      if (z > max) throw new Error(noun === "Neuron" ? `Neuron ${max + 1} was not recorded. Include it in Recording or shorten the range.` : `Channel ${max + 1} is unavailable. Increase Readout channels in Recording or shorten the range.`);
      for (let id = a - 1; id < z; id++) {
        if (!allowed.has(id)) throw new Error(noun === "Neuron" ? `Neuron ${id + 1} was not recorded. Include it in Recording and try again.` : `Channel ${id + 1} is unavailable in this readout.`);
        if (!seen.has(id)) { seen.add(id); ids.push(id); }
      }
    }
    return ids;
  }
  function neuronInput({ available, selected, id, focusKey, onChange, noun = "Neuron" }) {
    const label = document.createElement("label"); label.className = "neuron-selector";
    const input = document.createElement("input"); input.type = "text"; input.className = "neuron-selection";
    input.autocomplete = "off"; input.spellcheck = false; input.placeholder = "1-4, 7";
    input.value = formatNeuronIds(selected); input.setAttribute("aria-label", noun + " IDs");
    input.title = `Select recorded ${noun.toLowerCase()} IDs. Available: ${formatNeuronIds(available)}. Use commas, ranges, or all.`;
    if (id) input.id = id; if (focusKey) input.dataset.cmpFocus = focusKey;
    let previous = input.value;
    const apply = (report = false) => {
      try {
        const ids = parseNeuronIds(input.value, available, noun), value = formatNeuronIds(ids);
        input.setCustomValidity(""); input.removeAttribute("aria-invalid"); input.value = value;
        if (previous !== value) { previous = value; onChange(ids); }
      } catch (error) { input.setCustomValidity(error.message); input.setAttribute("aria-invalid", "true"); if (report) input.reportValidity(); }
    };
    input.addEventListener("input", () => { input.setCustomValidity(""); input.removeAttribute("aria-invalid"); });
    input.addEventListener("blur", () => apply());
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); apply(true); }
    });
    label.append(noun + "s", input); return label;
  }
  function nextPlaybackSpeed(value, direction) {
    const speed = Number(value) || 1;
    const bands = [[.02, .1, .02], [.1, .3, .05], [.3, 3, .1], [3, 10, 1]];
    const band = bands.find(([low, high]) => direction > 0 ? speed >= low && speed < high : speed > low && speed <= high);
    if (!band) return Math.min(10, Math.max(.02, speed));
    return Number(Math.min(band[1], Math.max(band[0], speed + direction * band[2])).toFixed(2));
  }
  function speedControl(value, onChange) {
    const wrap = document.createElement("label"); wrap.className = "playback-speed";
    const prefix = document.createElement("span"); prefix.textContent = "×"; prefix.setAttribute("aria-hidden", "true");
    const input = document.createElement("input"); input.type = "number"; input.min = .02; input.max = 10; input.step = "any";
    const format = speed => Number(speed).toFixed(2).replace(/0$/, "");
    input.value = format(value || 1); input.title = "Playback speed (0.02–10×; 1× = real time)"; input.setAttribute("aria-label", "Playback speed");
    const commit = () => {
      if (!input.value.trim()) input.value = "1.0";
      if (!input.checkValidity() || !Number.isFinite(input.valueAsNumber)) { input.reportValidity(); return; }
      const speed = Math.round(input.valueAsNumber * 100) / 100; input.value = format(speed); onChange(speed);
    };
    input.addEventListener("change", commit);
    input.addEventListener("blur", () => { if (!input.value.trim()) commit(); });
    input.addEventListener("keydown", event => {
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); input.value = nextPlaybackSpeed(input.value, event.key === "ArrowUp" ? 1 : -1); commit();
      } else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commit(); }
    });
    wrap.append(prefix, input); return wrap;
  }
  globalThis.NeuroUI = { icon, infoButton, showInfo, iconize, bindInfo, closeInfo, speedControl, nextPlaybackSpeed, formatNeuronIds, parseNeuronIds, neuronInput };
  for (const [id, name, label] of [["save-config", "download", "Export config"], ["shortcuts", "keyboard", "Keyboard shortcuts"]]) {
    const node = document.getElementById(id); if (node) iconize(node, name, label);
  }
  for (const id of ["save-data"]) document.getElementById(id)?.prepend(icon("download"));
  const shortcuts = document.getElementById("shortcuts");
  if (shortcuts) document.querySelector(".topbar").append(shortcuts);
  const file = document.getElementById("load-config");
  if (file) iconize(file.parentElement, "upload", "Import config");
  const info = document.getElementById("view-info");
  if (info) {
    info.append(icon("info"));
    const description = document.createElement("div"); description.id = "view-description"; description.className = "view-description"; description.hidden = true;
    document.querySelector(".result-toolbar").after(description);
    info.removeAttribute("aria-haspopup"); info.setAttribute("aria-controls", description.id); info.setAttribute("aria-expanded", "false");
    bindInfo(info, () => document.getElementById("result-note").textContent);
  }
})();
