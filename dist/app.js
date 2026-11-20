(() => {
  "use strict";
  const M = globalThis.NeuroModel, V = globalThis.NeuroViz;
  const compute = globalThis.NeuroCompute;
  const $ = id => document.getElementById(id);
  const viewInfo = $("view-info"), viewInfoHome = document.querySelector(".result-actions");
  let controlsRoot = $("view-controls");
  const matrixExport = $("save-matrix");
  const slots = new Map();
  const levels = { baseline: "Baseline", stimulated: "Stimulus", overlay: "Baseline + Stimulus", delta: "Difference" };
  const plots = {
    traces: ["Traces", "Compare recorded activity between Baseline and Stimulus."],
    activity: ["Raster", ""],
    population: ["Population", ""],
    covariance: ["Covariance", ""],
    connectivity: ["Connectivity", "In J, columns are sources and rows are targets. Click a matrix entry to select it: teal marks the selection, orange marks the hover preview. Leaving the matrix restores the selection."],
    compare: ["Compare", ""],
    methods: ["Models & methods", ""]
  };
  const fields = {
    "model-fields": [
      ["model", "Model", "wide"], ["tau", "Time constant τ (ms)", "rate"],
      ["initial", "Initial SD"], ["capacitance", "Membrane capacitance (pF)", "lif"], ["leak", "Leak conductance (nS)", "lif"],
      ["rest", "Leak reversal (mV)", "lif"], ["reset", "Reset potential (mV)", "lif"], ["threshold", "Spike threshold (mV)", "lif"],
      ["reversalE", "E reversal (mV)", "lif"], ["reversalI", "I reversal (mV)", "lif"],
      ["tauE", "E decay time (ms)", "lif"], ["tauI", "I decay time (ms)", "lif"],
      ["delay", "Synaptic delay (ms)", "lif"], ["refractory", "Refractory period (ms)", "lif"],
      ["adapt", "Adaptation increment (pA)", "lif"], ["adaptTau", "Adaptation decay (ms)", "lif"]
    ],
    "network-fields": [
      ["topology", "Topology", "wide"], ["n", "Neurons"], ["gain", "Gain"],
      ["density", "Connection probability", "random ei cluster lowrank"], ["jitter", "Relative weight jitter", "ring chain ei cluster"],
      ["eiFraction", "E fraction", "ei"], ["inhibRatio", "I/E weight ratio", "ei"],
      ["groups", "Clusters", "cluster"], ["between", "Between/within weight", "cluster"],
      ["rank", "Rank-one terms", "lowrank"], ["bulk", "Random bulk strength", "lowrank"],
      ["matrixFormat", "Connectivity format", "custom wide"], ["matrix", "Source, Target, Weight", "custom wide"],
      ["networkSeed", "Network seed", "wide"]
    ],
    "input-fields": [
      ["waveform", "Stimulus waveform", "wide"], ["targets", "Target IDs", "pulse step paired sine wide"],
      ["amplitude", "Amplitude", "pulse step paired sine"], ["onset", "Onset (ms)", "pulse step paired sine"],
      ["width", "Duration (ms)", "pulse paired sine"], ["interval", "Onset interval (ms)", "paired"],
      ["frequency", "Frequency (Hz)", "sine"], ["events", "Onset (ms), Duration (ms), Amplitude, Target IDs", "customWave wide"],
      ["bias", "Background drive"], ["noise", "Noise SD"], ["noiseTau", "Noise correlation time (ms)"], ["shared", "Shared variance fraction"],
      ["pairing", "Trial pairing", "wide"], ["noiseSeed", "Noise seed", "wide"]
    ],
    "time-fields": [["total", "Duration (ms)"], ["warmup", "Warm-up (ms)"], ["dt", "Time step (ms)"], ["sample", "Sample interval (ms)"]],
    "observe-fields": [
      ["observeMode", "Readout", "wide"], ["m", "Recorded neurons", "auto"], ["group", "Group ID", "group"],
      ["observe", "Recorded IDs", "manual wide"], ["observeSeed", "Readout seed", "randomObs wide"]
    ]
  };
  const observationKeys = new Set(["observeMode", "m", "group", "observe", "observeSeed"]);
  const fieldLabels = Object.fromEntries(Object.values(fields).flat().map(([key, label]) => [key, label]));
  let result = null, recording = null, observed = [], observationController = null, view = "traces", controller = null, revision = 0, activePreset = "ring", dirty = false;
  let viewState = null, animation = 0, nodesExpanded = false;
  let theoryLanguage = "zh";
  let reference = null, comparison = null, compareState = {};
  let runState = "pending", runProgress = 0;
  const chartNodes = [];
  let updateRangeView = null;

  function optionElements(choices, selected) {
    return Object.entries(choices).map(([value, label]) => {
      const option = new Option(label, value);
      if (String(selected) === value) option.selected = true;
      return option;
    });
  }

  function field([key, text, modes = ""]) {
    const label = document.createElement("label"), title = document.createElement("span");
    label.className = modes.includes("wide") ? "wide" : "";
    title.textContent = text;
    const choices = key === "dt" ? Object.fromEntries(M.stepOptions.map(dt => [dt, dt])) : M.choices[key];
    const bounds = M.settings[key];
    let input;
    if (choices) {
      input = document.createElement("select");
      input.append(...optionElements(choices));
    } else if (["matrix", "events"].includes(key)) {
      input = document.createElement("textarea");
      input.rows = 5;
      input.spellcheck = false;
    } else {
      input = document.createElement("input");
      input.type = bounds ? "number" : "text";
      if (bounds) {
        input.min = bounds[0];
        input.max = bounds[1];
        input.step = bounds[2] || "any";
      } else {
        input.placeholder = "1, 4, 7-10";
      }
    }
    input.id = key;
    label.append(title, input);
    slots.set(key, { label, title, input, modes: modes.split(" ").filter(value => value && value !== "wide") });
    return label;
  }

  for (const [id, definitions] of Object.entries(fields)) {
    if (id !== "model-fields") {
      $(id).replaceChildren(...definitions.map(field));
      continue;
    }
    const [main, ...advanced] = definitions;
    const details = document.createElement("details");
    details.className = "wide";
    const summary = document.createElement("summary"), body = document.createElement("div");
    summary.textContent = "Model parameters";
    body.className = "field-grid";
    body.append(...advanced.map(field));
    details.append(summary, body);
    $(id).append(field(main), details);
  }
  $("settings").noValidate = true;
  $("preset").append(...optionElements(Object.fromEntries(Object.entries(M.presets).map(([k, [title]]) => [k, title]))));
  const editedOption = new Option("Custom experiment", "");
  editedOption.disabled = true;
  $("preset").append(editedOption);

  function syncForm() {
    const spiking = $("model").value === "lif";
    const topology = $("topology").value, waveform = $("waveform").value, observation = $("observeMode").value;
    const active = new Set([spiking ? "lif" : "rate", topology, waveform === "custom" ? "customWave" : waveform, observation,
      observation === "manual" ? "" : "auto", ["random", "orthogonal", "gaussian"].includes(observation) ? "randomObs" : ""]);
    for (const { label, modes } of slots.values()) {
      if (!modes.length) continue;
      label.hidden = !modes.some(mode => active.has(mode));
    }
    const units = spiking ? " (pA)" : "";
    for (const key of ["bias", "noise", "amplitude"]) slots.get(key).title.textContent = fieldLabels[key] + units;
    slots.get("initial").title.textContent = "Initial SD" + (spiking ? " (mV)" : "");
    slots.get("matrix").title.textContent = $("matrixFormat").value === "dense" ? "Connectivity matrix J (rows: Target; columns: Source)" : "Source, Target, Weight";
    $("seed-observe").hidden = !["random", "orthogonal", "gaussian"].includes(observation);
    slots.get("m").title.textContent = ["orthogonal", "gaussian"].includes(observation) ? "Readout channels" : "Recorded neurons";
    $("seed-network").hidden = topology === "custom" || (["chain", "ring"].includes(topology) && Number($("jitter").value) === 0);
    $("m").max = $("n").value;
  }

  function fillForm(config, preset) {
    for (const [key, { input }] of slots) input.value = config[key];
    $("preset").value = preset;
    syncForm();
  }

  function readForm() {
    return Object.fromEntries([...slots].map(([key, { input }]) => [key, input.value]));
  }

  function message(text = "", state = "normal") {
    $("message").textContent = text;
    $("message").dataset.state = state;
    if (state === "error") { runState = "error"; runButton(Boolean(controller)); }
  }

  function formError(error) {
    const field = slots.get(error.field);
    if (field && !field.label.hidden) {
      for (let parent = field.label.parentElement; parent && parent !== $("settings"); parent = parent.parentElement) {
        if (parent.tagName === "DETAILS") parent.open = true;
      }
      field.input.setAttribute("aria-invalid", "true");
      message(field.title.textContent + ": " + error.message, "error");
    } else message(error.message, "error");
  }

  function newSeed() {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }

  async function refreshObservation() {
    observationController?.abort();
    const request = new AbortController(), current = result;
    observationController = request;
    runButton(false);
    try {
    const form = readForm(), config = { ...result.config };
    for (const key of observationKeys) config[key] = ["m", "group", "observeSeed"].includes(key) ? Number(form[key]) : form[key];
    for (const key of ["m", "group", "observeSeed"]) {
      if (form[key] === "" || !Number.isInteger(config[key]) || config[key] < M.settings[key][0] || config[key] > M.settings[key][1]) {
        const error = new Error("Enter an integer within the allowed range.");
        error.field = key;
        throw error;
      }
    }
    M.chooseObservations(config, current.network);
    viewState.covariance?.controller?.abort();
    viewState.covariance = null;
    message();
    const next = compute ? await compute.recordAsync(current, config, request.signal) : M.record(current, config);
    if (request !== observationController || current !== result) return;
    result.config = config;
    recording = next;
    result.recording = next;
    observed = next.ids;
    viewState.traceIds = viewState.traceIds?.filter(id => observed.includes(id));
    if (!viewState.traceIds?.length) viewState.traceIds = null;
    if (!(next.projected ? observed : result.network.order).includes(viewState.inputCell)) viewState.inputCell = next.projected ? 0 : result.input[0]?.cells[0];
    if (next.projected) viewState.groups = false;
    viewState.covariance = null;
    renderView();
    runState = dirty ? "pending" : "complete"; message();
    } catch (error) {
      if (request === observationController && error.name !== "AbortError") {
        formError(error);
        if (view === "covariance" && !viewState.covariance) requestCovariance();
      }
    }
    finally { if (request === observationController) { observationController = null; runButton(Boolean(controller)); } }
  }

  function changed(target) {
    revision++;
    $("preset").value = "";
    activePreset = "";
    target.removeAttribute("aria-invalid");
    syncForm();
    if (target.id === "n" && Number($("n").value) > 0 && Number($("m").value) > Number($("n").value)) $("m").value = $("n").value;
    if (observationKeys.has(target.id) && result && !dirty && !controller) {
      void refreshObservation();
      return;
    }
    dirty = true;
    if (!controller) { runState = "pending"; runProgress = 0; }
    message(); runButton(Boolean(controller));
  }

  $("settings").addEventListener("input", event => {
    if (slots.has(event.target.id)) changed(event.target);
  });

  function labelCell(cell) {
    return String(cell + 1);
  }

  function syncPin() {
    const pin = $("pin-reference");
    const active = Boolean(reference) && (view === "compare" || view === (compareState.view || "connectivity"));
    const label = active ? "Unpin reference" : reference ? `Replace reference with current ${plots[view]?.[0] || view}` : "Pin current view";
    if (pin.getAttribute("aria-label") !== label) globalThis.NeuroUI.iconize(pin, active ? "unpin" : "pin", label);
    pin.setAttribute("aria-pressed", String(active));
    pin.hidden = !["traces", "connectivity", "compare"].includes(view);
    pin.disabled = !active && (view === "compare" || Boolean(controller) || Boolean(observationController) || !result);
  }

  function runButton(busy) {
    const state = busy ? "running" : observationController ? "reading" : runState;
    const pct = Math.floor(runProgress * 100);
    const labels = { pending: "Run current settings", running: `Stop · ${pct}%`, complete: "Run again", stopped: `Run again · ${pct}% stopped`, error: "Retry", reading: "Updating readout" };
    const icons = { pending: "play", running: "stop", complete: "check", stopped: "play", error: "error", reading: "refresh" };
    const button = $("run");
    // Progress updates retain DOM identity and keyboard/accessibility focus.
    if (button.dataset.state !== state) {
      button.replaceChildren(globalThis.NeuroUI.icon(icons[state]), document.createElement("span"));
      button.dataset.state = state;
    }
    const text = button.lastElementChild;
    if (text.textContent !== labels[state]) text.textContent = labels[state];
    button.style.setProperty("--run-progress", `${pct}%`);
    button.title = state === "stopped" ? "Restart from the beginning with current settings" : state === "running" ? "Stop computation; keep the previous result" : "Run with current settings";
    button.disabled = state === "reading";
    const summary = result ? `${result.config.n} neurons · ${observed.length} ${recording?.projected ? "channels" : "recorded"}` : "";
    if ($("run-summary").textContent !== summary) $("run-summary").textContent = summary;
    $("run-summary").title = "Current completed result";
    syncPin();
    $("save-data").disabled = Boolean(observationController) || !result;
    $("save-readout").disabled = busy || Boolean(observationController) || !recording;
  }

  async function runExperiment(source) {
    observationController?.abort(); observationController = null;
    if (controller) controller.abort();
    const request = new AbortController();
    controller = request;
    const expected = revision;
    runState = "running"; runProgress = 0; runButton(true);
    message();
    // Let the run state paint before entering the numerical integration loop.
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const next = await (compute || M).simulateAsync(source, request.signal, fraction => {
        if (request === controller) { runProgress = Math.min(0.99, Math.max(0, fraction)); runButton(true); }
      });
      if (request !== controller) return false;
      viewState?.covariance?.controller?.abort();
      const previousState = viewState, previousConfig = result?.config;
      result = next;
      recording = next.recording || M.record(next);
      observed = recording.ids;
      dirty = expected !== revision;
      const sample = result.config.sample;
      const standardWindow = Math.max(sample, Math.round(Math.min(40, result.config.total / 4) / sample) * sample);
      const firstTarget = result.input[0]?.cells[0];
      viewState = {
        condition: result.input.length ? "stimulated" : "baseline",
        activityCondition: result.input.length ? "stimulated" : "baseline",
        covCondition: "baseline", first: 0, last: result.config.total, firstLocked: true, covFirstLocked: true,
        covFirst: 0, covLast: result.config.total, covKind: result.baseline.spikes ? "spike" : "point",
        window: standardWindow, page: 0, selected: firstTarget ?? observed[0], edge: null, focusEdges: false,
        groups: false, covariance: null, showInput: Boolean(result.input.length), inputVisibility: { baseline: false }, inputCell: recording.projected ? 0 : firstTarget,
        graphMode: result.input.length ? "stimulated" : "baseline", graphPoint: 0, graphPlaying: false, graphScales: new Map()
      };
      if (previousState) {
        for (const key of ["condition", "activityCondition", "covCondition", "firstLocked", "covFirstLocked", "showInput", "inputVisibility", "graphMode", "focusEdges", "groups"]) viewState[key] = previousState[key];
        const snap = value => Math.max(0, Math.min(result.config.total, Math.round(value / sample) * sample));
        for (const [a, b] of [["first", "last"], ["covFirst", "covLast"]]) {
          const full = previousState[a] === 0 && previousState[b] === previousConfig.total;
          viewState[a] = full ? 0 : snap(previousState[a]);
          viewState[b] = full ? result.config.total : snap(previousState[b]);
          if (viewState[b] <= viewState[a]) { viewState[a] = 0; viewState[b] = result.config.total; }
        }
        viewState.window = Math.max(sample, Math.min(result.config.total, snap(previousState.window)));
        viewState.covKind = previousState.covKind === "spike" && !result.baseline.counts ? "point" : previousState.covKind;
        viewState.selected = Math.min(previousState.selected, result.config.n - 1);
        viewState.inputCell = (recording.projected ? observed : result.network.order).includes(previousState.inputCell) ? previousState.inputCell : viewState.inputCell;
        viewState.traceIds = previousState.traceIds?.filter(id => observed.includes(id));
        if (!viewState.traceIds?.length) viewState.traceIds = null;
        viewState.graphPoint = Math.min(result.baseline.points - 1, Math.round(previousState.graphPoint * previousConfig.sample / sample));
        if (recording.projected) viewState.groups = false;
      }
      renderView();
      runState = dirty ? "pending" : "complete"; runProgress = dirty ? 0 : 1; message();
      return true;
    } catch (error) {
      if (request === controller) {
        if (error.name === "AbortError") { runState = "stopped"; message(); }
        else formError(error);
      }
      return false;
    } finally {
      if (request === controller) {
        controller = null;
        runButton(false);
      }
    }
  }

  $("settings").addEventListener("submit", event => {
    event.preventDefault();
    if (controller) controller.abort();
    else void runExperiment(readForm());
  });

  const compareTab = $("views").querySelector('[data-view="compare"]');
  function clearCompareNotice() {
    compareTab.classList.remove("reference-new", "reference-pulse");
    compareTab.removeAttribute("aria-description");
  }
  compareTab.addEventListener("animationend", () => compareTab.classList.remove("reference-pulse"));
  $("pin-reference").addEventListener("click", () => {
    if (reference && (view === "compare" || view === (compareState.view || "connectivity"))) {
      reference = null; compareState = {}; clearCompareNotice(); renderView(); return;
    }
    if (controller || observationController || !result) return;
    reference = structuredClone({ result, observed, recording });
    compareState = { view, condition: viewState.condition, graphMode: viewState.graphMode, time: viewState.graphPoint * result.config.sample, first: viewState.first, last: viewState.last, showInput: viewState.showInput, inputCell: viewState.inputCell, referenceIds: viewState.traceIds || observed.slice(0, 8), referenceNode: viewState.selected, focusEdges: viewState.focusEdges };
    renderView();
    compareTab.classList.remove("reference-pulse");
    void compareTab.offsetWidth;
    compareTab.classList.add("reference-new", "reference-pulse");
    compareTab.setAttribute("aria-description", "Reference available for comparison");

  });

  $("preset").addEventListener("change", () => {
    activePreset = $("preset").value;
    const config = M.preset(activePreset);
    revision++;
    dirty = true;
    fillForm(config, activePreset);
    void runExperiment(config);
  });

  for (const [button, id] of [["seed-network", "networkSeed"], ["seed-noise", "noiseSeed"], ["seed-observe", "observeSeed"]]) {
    $(button).addEventListener("click", () => {
      $(id).value = newSeed();
      changed($(id));
      if (id !== "observeSeed" || dirty) void runExperiment(readForm());
    });
  }

  function readout(text) {
    $("readout").textContent = text;
  }

  function note(text) {
    const condition = view === "covariance" ? viewState?.covCondition : view === "activity" ? viewState?.activityCondition : viewState?.condition;
    if (["traces", "activity", "population", "covariance"].includes(view) && condition === "delta" && !text.includes(differenceNote())) text += "\n\n" + differenceNote();
    $("result-note").textContent = text;
    viewInfo.hidden = !text.trim();
    const description = $("view-description");
    description.replaceChildren(...text.split(/\n\n/).filter(Boolean).map(value => { const paragraph = document.createElement("p"); paragraph.textContent = value; return paragraph; }));
    if (!text.trim()) { description.hidden = true; viewInfo.setAttribute("aria-expanded", "false"); }
    placeViewInfo();
  }

  function placeViewInfo() {
    viewInfoHome.append(viewInfo);
  }

  function control(label, id, choices, current, change) {
    const wrapper = document.createElement("label");
    const select = document.createElement("select");
    select.id = id;
    select.setAttribute("aria-label", label || "Displayed activity");
    select.append(...optionElements(choices, current));
    select.value = String(current);
    select.addEventListener("change", () => change(select.value));
    wrapper.append(label, select);
    controlsRoot.append(wrapper);
    return select;
  }

  function tool(label, handler) {
    const button = document.createElement("button");
    button.className = "tool";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    controlsRoot.append(button);
    return button;
  }

  function updateView(key, value, focus) {
    viewState[key] = value;
    if (key === "condition") viewState.showInput = viewState.inputVisibility[value] ?? (value !== "baseline");
    if (view === "covariance") {
      viewState.covariance?.controller?.abort();
      viewState.covariance = null;
    }
    renderView();
    if (focus) $(focus)?.focus({ preventScroll: true });
  }

  function plotRange(keyA = "first", keyB = "last", includeWindow = false) {
    const { sample, total } = result.config;
    const form = document.createElement("form"); form.className = "range-controls";
    const range = document.createElement("div"); range.className = "time-range";
    const track = document.createElement("div"); track.className = "dual-range";
    const lockKey = keyA + "Locked";
    let span = viewState[keyB] - viewState[keyA];
    const pan = document.createElement("div"); pan.className = "range-pan"; pan.setAttribute("aria-hidden", "true"); track.append(pan);
    const lock = document.createElement("button"); lock.type = "button"; lock.className = "range-lock";
    const fit = document.createElement("button"); fit.type = "button"; fit.className = "range-fit";
    globalThis.NeuroUI.iconize(fit, "fit", "Show full duration");
    const makeValue = (key, label, min) => {
      const input = document.createElement("input"); input.type = "number"; input.name = key;
      input.className = "range-value"; input.value = viewState[key]; input.min = min; input.max = total; input.step = sample; input.required = true;
      input.setAttribute("aria-label", label); input.title = label; return input;
    };
    const from = makeValue(keyA, "From", 0), to = makeValue(keyB, "To", sample);
    const makeThumb = label => {
      const input = document.createElement("input"); input.type = "range"; input.min = 0; input.max = total; input.step = sample;
      input.setAttribute("aria-label", label); track.append(input); return input;
    };
    const left = makeThumb("From slider"), right = makeThumb("To slider");
    left.className = "range-from"; right.className = "range-to";
    range.append(from, track, to, lock, fit); form.append(range);
    if (includeWindow || keyA === "covFirst") {
      const label = document.createElement("label"), window = makeValue("window", "Window", sample);
      window.classList.remove("range-value"); label.append("Window", window); form.append(label);
      if (!includeWindow) { label.style.visibility = "hidden"; window.disabled = true; }
    }
    let queued = 0;
    const sync = () => {
      left.value = from.value; right.value = to.value;
      track.style.setProperty("--range-from", `${Number(from.value) / total * 100}%`);
      track.style.setProperty("--range-to", `${Number(to.value) / total * 100}%`);
      left.setAttribute("aria-valuemax", String(Number(to.value) - sample));
      right.setAttribute("aria-valuemin", String(Number(from.value) + sample));
      track.dataset.locked = String(Boolean(viewState[lockKey]));
      fit.setAttribute("aria-pressed", String(Number(from.value) === 0 && Number(to.value) === total));
      pan.style.left = `calc(8px + (100% - 16px) * ${Number(from.value) / total})`;
      pan.style.width = `calc((100% - 16px) * ${(Number(to.value) - Number(from.value)) / total})`;
    };
    const commit = (report = false) => {
      cancelAnimationFrame(queued); queued = 0;
      if (!form.isConnected || composing) return;
      for (const input of form.elements) input.removeAttribute("aria-invalid");
      if (!from.checkValidity() || !to.checkValidity() || (includeWindow && !form.elements.namedItem("window").checkValidity())) {
        for (const input of form.elements) if (!input.validity.valid) input.setAttribute("aria-invalid", "true");
        if (report) form.reportValidity(); return;
      }
      const a = Number(from.value), z = Number(to.value);
      if (a >= z) { from.setAttribute("aria-invalid", "true"); readout("From must be earlier than To."); return; }
      const window = includeWindow ? Number(form.elements.namedItem("window").value) : viewState.window;
      const windowChanged = window !== viewState.window;
      sync(); readout("");
      if (a === viewState[keyA] && z === viewState[keyB] && window === viewState.window) return;
      viewState[keyA] = a; viewState[keyB] = z; viewState.window = window;
      viewState.covariance?.controller?.abort(); viewState.covariance = null;
      if (updateRangeView && !windowChanged) updateRangeView();
      else renderView({ keepControls: true });
    };
    const shiftTo = a => {
      a = Math.max(0, Math.min(total - span, Math.round(a / sample) * sample));
      from.value = a; to.value = Number((a + span).toFixed(8)); sync();
    };
    const schedule = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; commit(); }); };
    const drag = isFrom => {
      if (viewState[lockKey]) shiftTo(isFrom ? Number(left.value) : Number(right.value) - span);
      else if (isFrom) from.value = Math.min(Number(left.value), Number(to.value) - sample);
      else to.value = Math.max(Number(right.value), Number(from.value) + sample);
      sync();
      if (viewState[lockKey]) schedule();
    };
    left.addEventListener("input", () => drag(true)); right.addEventListener("input", () => drag(false));
    left.addEventListener("change", () => commit()); right.addEventListener("change", () => commit());
    const applyTyped = input => {
      if (viewState[lockKey] && [from, to].includes(input) && input.value !== "" && Number.isFinite(input.valueAsNumber)) shiftTo(input === from ? Number(from.value) : Number(to.value) - span);
      commit(true);
    };
    form.addEventListener("focusout", event => { if (event.target.type === "number") applyTyped(event.target); });
    form.addEventListener("keydown", event => {
      if (event.target.tagName === "BUTTON") return;
      if (event.key !== "Enter" || event.isComposing || composing || event.keyCode === 229) return;
      event.preventDefault(); if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) applyTyped(event.target);
    });
    form.addEventListener("submit", event => { event.preventDefault(); commit(true); });
    const lockLabel = () => {
      globalThis.NeuroUI.iconize(lock, viewState[lockKey] ? "lock" : "unlock", viewState[lockKey] ? "Unlock time window" : "Lock time window");
      lock.setAttribute("aria-pressed", String(Boolean(viewState[lockKey])));
      track.title = viewState[lockKey] ? "Drag the selected interval or either handle to pan" : "Drag either handle; plots update on release";
    };
    lock.addEventListener("click", () => {
      commit(); span = viewState[keyB] - viewState[keyA];
      viewState[lockKey] = !viewState[lockKey]; lockLabel(); sync();
      if (updateRangeView && keyA === "first") updateRangeView();
    });
    fit.addEventListener("click", () => { from.value = 0; to.value = total; span = total; sync(); commit(); });
    let panning = null;
    pan.addEventListener("pointerdown", event => {
      if (!viewState[lockKey] || event.button !== 0) return;
      event.preventDefault(); panning = { x: event.clientX, from: Number(from.value) };
      pan.setPointerCapture(event.pointerId); track.classList.add("panning");
    });
    pan.addEventListener("pointermove", event => {
      if (!panning) return;
      shiftTo(panning.from + (event.clientX - panning.x) / (track.clientWidth - 16) * total); schedule();
    });
    const endPan = () => { if (panning) { panning = null; track.classList.remove("panning"); commit(); } };
    pan.addEventListener("pointerup", endPan); pan.addEventListener("pointercancel", endPan); pan.addEventListener("lostpointercapture", endPan);
    lockLabel();
    sync(); controlsRoot.append(form);
  }

  function attach(node, parent = $("viz-wrap")) {
    chartNodes.push(node);
    parent.append(node);
    placeViewInfo();
  }

  function selectedRows() {
    const { config } = result;
    return { first: Math.round(viewState.first / config.sample), last: Math.round(viewState.last / config.sample), step: config.sample };
  }

  function timeChart(frame, update) {
    attach(frame);
    updateRangeView = update ?? (() => frame.updateWindow({ ...selectedRows(), locked: Boolean(viewState.firstLocked) }));
    if (viewState.firstLocked) updateRangeView();
    return frame;
  }

  function chartBands(condition) {
    return condition === "baseline" ? [] : result.input;
  }

  function conditionSelect(stateKey, options = levels) {
    control("", "condition", options, viewState[stateKey], value => updateView(stateKey, value, "condition"));
  }

  function differenceNote() {
    return (result.config.pairing === "matched" ? "Paired difference compares trajectories under the same initial state and noise. Nonlinear responses include state-dependent trajectory separation." : "Independent difference includes variation in initial state and noise. Estimate a mean stimulus effect and its uncertainty across repeated trials.") + (result.config.model === "lif" ? " Voltage differences also reflect spike timing and resets; binned-rate differences answer a different question." : "");
  }

  function nodePoint(condition, p, i, counts = false) {
    const { baseline, stimulated, config } = result, offset = p * config.n + i;
    const field = counts ? "counts" : "data";
    if (condition === "baseline") return baseline[field][offset];
    if (condition === "delta") return stimulated[field][offset] - baseline[field][offset];
    return stimulated[field][offset];
  }

  function point(condition, p, i, counts = false) {
    if (!recording?.projected) return nodePoint(condition, p, i, counts);
    const offset = p * recording.m + i, field = counts ? "counts" : "data";
    if (condition === "baseline") return recording.baseline[field][offset];
    if (condition === "delta") return recording.stimulated[field][offset] - recording.baseline[field][offset];
    return recording.stimulated[field][offset];
  }

  function inputPoint(cell, index) {
    const { dt } = result.config;
    return result.input.reduce((sum, event) => {
      const weight = recording?.projected ? event.cells.reduce((total, i) => total + recording.weights[cell][i], 0) : Number(event.cells.includes(cell));
      return sum + weight * M.eventDrive(event, index, dt);
    }, 0);
  }

  const readoutName = () => recording?.projected ? "Channel" : "Neuron";

  function tracesFor(labels, values) {
    const condition = viewState.condition;
    return labels.flatMap((label, index) => {
      const color = V.palette[index % V.palette.length];
      const single = key => ({ color, label, group: label, condition: levels[key], at: p => values(key, p, index) });
      if (condition !== "overlay") return [single(condition)];
      return [{ ...single("baseline"), label: label + " Baseline", dash: true }, { ...single("stimulated"), label: label + " Stimulus" }];
    });
  }

  function traceView() {
    let trace;
    const spiking = result.config.model === "lif";
    conditionSelect("condition");
    const ids = viewState.traceIds?.filter(id => observed.includes(id)) || observed.slice(0, 8);
    controlsRoot.append(globalThis.NeuroUI.neuronInput({ available: observed, selected: ids, id: "trace-neurons",
      noun: readoutName(),
      onChange: selection => { viewState.traceIds = selection; renderView({ keepControls: true }); } }));
    plotRange();
    {
      const toggle = tool(viewState.showInput ? "Hide stimulus" : "Show stimulus", () => {
        viewState.showInput = !viewState.showInput;
        viewState.inputVisibility[viewState.condition] = viewState.showInput;
      globalThis.NeuroUI.iconize(toggle, viewState.showInput ? "stimulus" : "stimulusOff", viewState.showInput ? "Hide stimulus" : "Show stimulus");
        toggle.setAttribute("aria-pressed", String(viewState.showInput));
        if ($("input-cell")) $("input-cell").disabled = !viewState.showInput;
        chartNodes.find(card => card.showSecondary)?.showSecondary(viewState.showInput);
      });
      toggle.id = "input-toggle";
      toggle.disabled = !result.input.length;
      globalThis.NeuroUI.iconize(toggle, viewState.showInput ? "stimulus" : "stimulusOff", viewState.showInput ? "Hide stimulus" : "Show stimulus");
      toggle.setAttribute("aria-pressed", String(viewState.showInput));
      {
        const cells = recording.projected ? observed : [...new Set(result.input.flatMap(item => item.cells))].sort((a, b) => a - b);
        {
          if (!cells.length) cells.push(0);
          if (!cells.includes(viewState.inputCell)) viewState.inputCell = cells[0];
          const target = control("Input", "input-cell", Object.fromEntries(cells.map(i => [i, (recording.projected ? "Ch " : "N ") + labelCell(i)])), viewState.inputCell,
            value => updateView("inputCell", Number(value), "input-cell"));
          target.disabled = !viewState.showInput || !result.input.length;
        }
      }
    }
    const labels = ids.map(i => readoutName() + " " + labelCell(i));
    const condition = viewState.condition;
    note(`${observed.length} ${recording.projected ? "readout channels; each is a fixed linear mixture of the full network" : "recorded neurons"}. ${condition === "overlay" ? "Dashed lines show Baseline; solid lines show Stimulus. " : ""}${chartBands(condition).length ? "Green bands mark stimulus intervals. " : ""}${condition === "delta" ? "Difference shows Stimulus − Baseline at each time point." : ""}`);
    const activitySeries = tracesFor(labels, (key, p, i) => point(key, p, ids[i]));
    const readoutSeries = [...activitySeries], secondarySeries = [];
    const { dt, sample } = result.config;
    if (result.input.length) {
      const command = inputPoint;
      secondarySeries.push({ color: V.palette[2], label: "Stimulus input", at: index => command(viewState.inputCell, index), stairs: true, width: 3.2 });
      for (const cell of [...new Set([...ids, viewState.inputCell])]) readoutSeries.push({
        color: V.palette[2], label: readoutName() + " " + labelCell(cell), group: readoutName() + " " + labelCell(cell),
        condition: spiking ? "Input (pA)" : "Input", at: p => command(cell, Math.round(p * sample / dt))
      });
      note($("result-note").textContent + "\n\nThe thick orange input trace has its own fixed scale; read its amplitude and units in the Input column. It shows commanded stimulus on the integration grid, excluding background drive.");
    }
    trace = timeChart(V.lines({
      title: recording.projected ? (spiking ? "Projected voltage (mV)" : "Projected activity") : spiking ? "Membrane potential (mV)" : "Activity (dimensionless)",
      traceReadout: true, series: activitySeries, readoutSeries, secondarySeries,
      secondaryStep: dt, secondaryLabel: spiking ? "Input (pA)" : "Input (dimensionless)",
      secondaryVisible: viewState.showInput, fullLast: result.baseline.points - 1,
      ...selectedRows(), bands: chartBands(condition),
      reference: spiking && !recording.projected && condition !== "delta" ? result.config.threshold : 0
    }));
  }

  function activityView() {
    const spiking = result.config.model === "lif" && !recording.projected;
    const available = spiking ? { baseline: "Baseline", stimulated: "Stimulus" } : { baseline: "Baseline", stimulated: "Stimulus", delta: "Difference" };
    if (!Object.hasOwn(available, viewState.activityCondition)) viewState.activityCondition = "stimulated";
    conditionSelect("activityCondition", available);
    plotRange();
    if (spiking) tool("Export spikes", exportSpikes);
    const condition = viewState.activityCondition;
    const run = condition === "baseline" ? result.baseline : result.stimulated;
    note(spiking ? `Each of the ${observed.length} rows represents a recorded neuron; each tick marks a spike. Spike times lie on the integration grid.` :
      `Each of the ${observed.length} rows represents a ${recording.projected ? "readout channel, not an individual neuron" : "recorded neuron"}; color indicates ${recording.projected && result.config.model === "lif" ? "projected membrane potential (mV)" : "activity"}. ${condition === "delta" ? "Difference shows Stimulus − Baseline at each time point." : ""}`);
    timeChart(V.activity({
      title: spiking ? "Spike raster" : recording.projected ? "Projected activity" : "Activity heatmap",
      rowLabel: readoutName(), valueLabel: recording.projected && result.config.model === "lif" ? "Projected V (mV)" : "Activity",
      count: observed.length, labels: observed.map(labelCell),
      ...selectedRows(), bands: chartBands(condition),
      fullLast: result.baseline.points - 1,
      value: (p, i) => point(condition, p, observed[i], spiking),
      events: spiking ? observed.map(i => run.spikes[i]) : null
    }));
  }

  function populationView() {
    const { config, network } = result, spiking = config.model === "lif";
    conditionSelect("condition");
    if (!recording.projected && network.groupNames.length > 1) control("Aggregation", "population-groups", { all: "All recorded", groups: "By group" },
      viewState.groups ? "groups" : "all", value => updateView("groups", value === "groups", "population-groups"));
    plotRange("first", "last", spiking);
    const lists = !recording.projected && viewState.groups && network.groupNames.length > 1 ?
      network.groupNames.map((name, group) => [name, observed.filter(i => network.group[i] === group)]).filter(([, list]) => list.length) :
      [[recording.projected ? "Readout mean" : "Recorded population", observed]];
    const labels = lists.map(([name, ids]) => `${name} (${ids.length} ${recording.projected ? "channels" : "neurons"})`);
    const range = selectedRows();
    let { first, last } = range;
    const windowSamples = Math.round(viewState.window / config.sample);
    const dt = spiking ? windowSamples * config.sample : config.sample;
    let positions = spiking ? Math.floor((last - first) / windowSamples) : last - first + 1;
    if (spiking && positions < 2) {
      readout("This interval contains fewer than two complete firing-rate windows. Extend the interval or shorten the window.");
      return;
    }
    const cache = new Map();
    const prefixes = new Map();
    function firingRate(condition, start, groupIndex) {
      const key = `${condition}|${groupIndex}`, cells = lists[groupIndex][1];
      if (!prefixes.has(key)) {
        const sums = new Float64Array(result.baseline.points + 1);
        for (let p = 0; p < result.baseline.points; p++) {
          let count = 0; for (const cell of cells) count += point(condition, p, cell, true);
          sums[p + 1] = sums[p] + count;
        }
        prefixes.set(key, sums);
      }
      const sums = prefixes.get(key);
      return (sums[start + windowSamples + 1] - sums[start + 1]) * 1000 / dt / cells.length;
    }
    function aggregate(condition, p, groupIndex) {
      if (spiking) return firingRate(condition, first + p * windowSamples, groupIndex);
      const key = `${condition}|${p}|${groupIndex}`;
      if (cache.has(key)) return cache.get(key);
      const cells = lists[groupIndex][1];
      let sum = 0;
      for (const cell of cells) sum += point(condition, p, cell);
      const average = sum / cells.length;
      cache.set(key, average);
      return average;
    }
    const condition = viewState.condition;
    const shift = first * config.sample + dt / 2;
    const bands = chartBands(condition);
    note((recording.projected ? (spiking ? `Signed spike counts are projected, divided by each ${dt} ms window duration, then averaged across channels. This signed channel mean can be negative and depends on the readout weights. ` : "Mean across projected channels; this value depends on the chosen basis and can cancel across channels. ") : spiking ? `Mean firing rate is the spike count divided by the number of recorded neurons and the window duration in seconds. The ${dt} ms windows do not overlap; points mark their centers. ` :
      "Instantaneous mean across recorded neurons. Positive and negative activity can cancel. ") + (condition === "delta" ? "Difference shows Stimulus − Baseline at each time point." : ""));
    const frame = V.lines({
      title: recording.projected ? (spiking ? "Mean projected rate (Hz)" : "Mean projected activity") : spiking ? "Mean firing rate (Hz/neuron)" : "Mean activity (dimensionless)",
      series: tracesFor(labels, aggregate), bands,
      first: spiking ? 0 : first, last: spiking ? positions - 1 : last, step: dt,
      timeOffset: spiking ? shift : 0, timeLabel: spiking ? "Window center" : "Time", reference: 0
      ,fullLast: result.baseline.points - 1, fullTime: config.total,
      scaleSeries: spiking ? tracesFor(labels, firingRate) : tracesFor(labels, aggregate),
      scaleLast: spiking ? result.baseline.points - windowSamples - 1 : result.baseline.points - 1
    });
    timeChart(frame, () => {
      ({ first, last } = selectedRows());
      positions = spiking ? Math.floor((last - first) / windowSamples) : last - first + 1;
      if (spiking && positions < 2) { renderView({ keepControls: true }); return; }
      frame.updateWindow({ first: spiking ? 0 : first, last: spiking ? positions - 1 : last,
        timeOffset: spiking ? first * config.sample + dt / 2 : 0, locked: Boolean(viewState.firstLocked) });
    });
  }

  function covarianceView() {
    conditionSelect("covCondition", { baseline: "Baseline", stimulated: "Stimulus", delta: "Difference" });
    const spiking = Boolean(result.baseline.spikes);
    const kinds = {
      point: "Equal-time",
      mean: "Window mean", integrated: "Integrated",
      ...(spiking ? { spike: "Binned rate" } : {})
    };
    control("Estimator", "cov-kind", kinds, viewState.covKind, value => updateView("covKind", value, "cov-kind"));
    plotRange("covFirst", "covLast", viewState.covKind !== "point");
    const exportButton = tool("Export covariance", () => {
      const calculation = viewState.covariance?.value;
      if (!calculation) return;
      const rows = [[readoutName().toLowerCase(), ...observed.map(labelCell)].join(",")];
      calculation.matrix.forEach((row, index) => rows.push([labelCell(observed[index]), ...row].join(",")));
      download("covariance.csv", rows.join("\n"), "text/csv");
    });
    exportButton.id = "save-covariance";
    exportButton.disabled = true;
    if ($("save-covariance")) $("save-covariance").disabled = true;
    const description = {
      point: `Each sample is a ${recording.projected ? "projected " : ""}${spiking ? "membrane-potential" : "activity"} vector. Subtract each ${readoutName().toLowerCase()}'s temporal mean, then divide the covariance sum by M − 1.`,
      mean: "Average activity within complete, nonoverlapping windows, then compute covariance across the window-mean vectors.",
      integrated: "Window-mean covariance multiplied by the window duration in seconds gives a finite-window estimate. For a stationary process with integrable correlations, its long-window limit is the zero-frequency covariance.",
      spike: recording.projected ? "Project each neuron's binned spike counts, divide by window duration in seconds, then compute covariance across the signed readout-rate vectors (Hz²)." : "For each neuron, divide the spike count in each window by the window duration in seconds, then compute covariance across the resulting firing-rate vectors."
    };
    note(description[viewState.covKind] + (viewState.covCondition === "delta" ? ` For Difference, subtract Baseline ${viewState.covKind === "spike" ? "spike counts" : "activity"} from Stimulus before computing covariance.` : "") + " M counts saved vectors or complete windows. Temporal correlations affect their independent information. f = m/N is the spatial fraction; m/M is the readout-to-sample ratio. Relative PR is PR/m.");
    updateRangeView = requestCovariance;
    requestCovariance();
  }

  function requestCovariance() {
    if ($("save-covariance")) $("save-covariance").disabled = true;
    let calculation;
    try {
      const key = [M.recordingKey(result.config), observed.join(","), viewState.covFirst, viewState.covLast, viewState.window, viewState.covKind, viewState.covCondition].join("|");
      if (viewState.covariance?.key !== key) {
        viewState.covariance?.controller?.abort();
        const options = { start: viewState.covFirst, end: viewState.covLast,
          window: viewState.window, kind: viewState.covKind, condition: viewState.covCondition };
        if (compute) {
          const state = viewState;
          const entry = { key, controller: new AbortController(), value: null, error: null };
          state.covariance = entry;
          compute.measureAsync(result, observed, options, entry.controller.signal).then(value => {
            if (viewState !== state || state.covariance !== entry) return;
            entry.value = value;
            if (view === "covariance") finishCovariance();
          }).catch(error => {
            if (viewState !== state || state.covariance !== entry || error.name === "AbortError") return;
            entry.error = error;
            if (view === "covariance") readout(error.message);
          });
        } else viewState.covariance = { key, value: M.measure(result, observed, { ...options, recording }) };
      }
      if (viewState.covariance.error) throw viewState.covariance.error;
      if (!viewState.covariance.value) { if (!chartNodes.length) readout("Computing covariance…"); $("viz-wrap").setAttribute("aria-busy", "true"); return; }
      calculation = viewState.covariance.value;
    } catch (error) { readout(error.message); return; }
    drawCovariance(calculation);
  }

  function finishCovariance() {
    // Keep controls and keyboard focus in place when the asynchronous result arrives.
    readout("");
    drawCovariance(viewState.covariance.value);
  }

  function drawCovariance(calculation) {
    for (const card of chartNodes.splice(0)) card.dispose();
    $("viz-wrap").replaceChildren(); $("viz-wrap").removeAttribute("aria-busy");
    const spiking = Boolean(result.baseline.spikes);
    const { matrix, spectrum, dimensions, samples } = calculation;
    const grid = document.createElement("div"); grid.className = "viz-grid";
    $("viz-wrap").append(grid);
    const unit = viewState.covKind === "spike" ? " Hz²" : spiking ? " mV²" : "";
    attach(V.matrix({
      title: (recording.projected ? "Readout covariance" : "Recorded covariance matrix") + (unit ? ` (${unit.trim()}${viewState.covKind === "integrated" ? "·s" : ""})` : ""),
      data: matrix, labels: observed.map(labelCell), direction: false, valueLabel: "Covariance",
      pairLabel: recording.projected ? "Channel pair" : "Neuron pair",
      unit: unit + (viewState.covKind === "integrated" ? (unit ? "·s" : " s") : "")
    }), grid);
    const spectrumCard = V.spectrum(spectrum);
    attach(spectrumCard, grid);
    const stats = document.createElement("dl");
    stats.className = "covariance-summary";
    for (const [label, value] of [[recording.projected ? "Channels m" : "Recorded neurons m", observed.length], ["Samples M", samples],
      ["Spatial fraction f", V.number(observed.length / result.config.n)], ["Sample ratio m/M", V.number(observed.length / samples)],
      ["Participation ratio", dimensions === null ? "—" : V.number(dimensions)],
      ["Relative PR", dimensions === null ? "—" : V.number(dimensions / observed.length)]]) {
      const row = document.createElement("div"), term = document.createElement("dt"), detail = document.createElement("dd");
      term.textContent = label; detail.textContent = value; row.append(term, detail); stats.append(row);
    }
    spectrumCard.append(stats);
    for (const card of chartNodes) card.paintNow();
    if ($("save-covariance")) $("save-covariance").disabled = false;
  }

  function connectivityView() {
    const { network, config } = result, selected = viewState.selected;
    control("Neuron", "inspect-node", Object.fromEntries(network.order.map(i => [i, `Neuron ${i + 1}`])), selected,
      value => selectNode(Number(value), "inspect-node"));
    control("Edges", "edge-filter", { overview: "Overview", focus: "Selected neuron" }, viewState.focusEdges ? "focus" : "overview",
      value => updateView("focusEdges", value === "focus", "edge-filter"));
    controlsRoot.append(matrixExport);
    const grid = document.createElement("div"); grid.className = "viz-grid";
    $("viz-wrap").append(grid);
    const unit = config.model === "lif" ? " nS" : "";
    const signed = v => V.number(v) + unit;
    const shade = viewState.graphMode !== "structure";
    const center = config.model === "lif" && viewState.graphMode !== "delta" ? config.rest : 0;
    const activity = shade ? cell => nodePoint(viewState.graphMode, viewState.graphPoint, cell) - center : null;
    if (shade && !viewState.graphScales.has(viewState.graphMode)) {
      let scale = 0;
      for (let p = 0; p < result.baseline.points; p++) {
        for (let i = 0; i < config.n; i++) scale = Math.max(scale, Math.abs(nodePoint(viewState.graphMode, p, i) - center));
      }
      viewState.graphScales.set(viewState.graphMode, scale);
    }
    const scale = viewState.graphScales.get(viewState.graphMode);
    const graph = V.graph({ result, observed: recording.projected ? [] : observed, selected, onlySelected: viewState.focusEdges, activity, scale,
      select: (cell, focusGraph) => selectNode(cell, focusGraph ? "graph" : null) });
    graph.classList.add("nodes-card");
    attach(graph, grid);
    graph.querySelector("canvas").id = "graph";
    configureNodes(graph, center, scale, shade);
    if (nodesExpanded) { note(plots.connectivity[1]); return; }
    attach(V.matrix({
      title: "Connectivity matrix J", data: network.weights, labels: network.order.map(labelCell),
      initial: viewState.edge, unit,
      onSelect: (to, from) => { viewState.edge = [to, from]; selectNode(from, "weight-heatmap"); }
    }), grid);
    grid.querySelectorAll("canvas")[0].id = "graph";
    grid.querySelectorAll("canvas")[1].id = "weight-heatmap";
    const summary = document.createElement("h4"); summary.className = "selection-summary";
    const group = network.groupNames.length > 1 ? " · " + network.groupNames[network.group[selected]] : "";
    summary.textContent = `Neuron ${selected + 1}${group}`;
    const details = document.createElement("div"); details.className = "edge-tables";
    for (const [label, values, incoming] of [["Incoming", network.incoming[selected], true], ["Outgoing", network.outgoing[selected], false]]) {
      const section = document.createElement("details"), heading = document.createElement("summary");
      section.open = true;
      heading.textContent = `${label} (${values.length})`;
      section.append(heading);
      if (values.length) {
        const table = document.createElement("table");
        table.innerHTML = "<thead><tr><th>Connection</th><th>Weight</th></tr></thead><tbody></tbody>";
        for (const [node, weight] of values) {
          const row = table.tBodies[0].insertRow();
          row.insertCell().textContent = incoming ? `${node + 1} → ${selected + 1}` : `${selected + 1} → ${node + 1}`;
          row.insertCell().textContent = signed(weight);
        }
        section.append(table);
      } else {
        const empty = document.createElement("p"); empty.textContent = "No connections."; section.append(empty);
      }
      details.append(section);
    }
    note(plots.connectivity[1]);
    const connections = document.createElement("div"); connections.className = "connectivity-data";
    connections.append(summary, details);
    const sidebar = document.createElement("aside"); sidebar.className = "nodes-data"; sidebar.setAttribute("aria-label", "Selected neuron data");
    const probe = graph.querySelector(":scope > .readout-panel"); if (probe) sidebar.append(probe);
    sidebar.append(connections); graph.append(sidebar);
  }

  function setNodesExpanded(value) {
    nodesExpanded = value;
    document.body.classList.toggle("nodes-expanded", value);
    document.body.style.setProperty("--app-header-bottom", `${document.querySelector(".topbar").getBoundingClientRect().bottom}px`);
    $("view-description").hidden = true; viewInfo.setAttribute("aria-expanded", "false");
    renderView(); $("nodes-expand")?.focus({ preventScroll: true });
  }

  function configureNodes(graph, center, scale, shade) {
    const UI = globalThis.NeuroUI, { config, baseline } = result;
    const heading = graph.querySelector("h3"); heading.classList.add("nodes-heading");
    const title = document.createElement("span"); title.className = "nodes-title"; title.append("Nodes");
    const about = document.createElement("button"); about.type = "button"; about.className = "icon-button info-button";
    about.append(UI.icon("info")); about.title = "About Nodes"; about.setAttribute("aria-label", "About Nodes"); about.setAttribute("aria-expanded", "false");
    const details = document.createElement("div"); details.className = "nodes-info"; details.id = "nodes-info"; details.hidden = true;
    const scaleNote = shade ? `Colors span ${V.number(center - scale)} to ${V.number(center + scale)}${config.model === "lif" ? " mV" : ""} across the recording.${viewState.graphMode === "delta" ? " Difference = Stimulus − Baseline." : ""} Playback stops and returns to 0 at the end; Pause keeps the current position.` : "";
    const colorNote = (recording.projected ? "Nodes shows full-network neuron states. Each projected channel mixes activity from these neurons. Orange borders mark stimulus targets. " : shade ? "Node color shows activity; thick borders mark recorded neurons, orange borders mark stimulus targets. " :
      "Filled nodes are recorded neurons; orange borders mark stimulus targets. ") + "Green solid edges have positive weights; orange dashed edges have negative weights.";
    details.append(...[graph.edgeSummary, colorNote, scaleNote, viewState.graphMode === "delta" ? differenceNote() : ""].filter(Boolean).map(text => { const p = document.createElement("p"); p.textContent = text; return p; }));
    UI.bindInfo(about, () => [...details.children].map(p => p.textContent).join("\n\n"));
    title.append(about);
    const actions = document.createElement("span"); actions.className = "nodes-controls";
    const mode = document.createElement("select"); mode.id = "graph-mode"; mode.setAttribute("aria-label", "Nodes activity");
    mode.append(...optionElements({ structure: recording.projected ? "Structure" : "Recording", baseline: "Baseline", stimulated: "Stimulus", delta: "Difference" }, viewState.graphMode));
    mode.value = viewState.graphMode;
    mode.addEventListener("change", () => { if (mode.value === "structure") viewState.graphPlaying = false; updateView("graphMode", mode.value, "graph-mode"); });
    const expand = document.createElement("button"); expand.type = "button"; expand.id = "nodes-expand";
    UI.iconize(expand, nodesExpanded ? "collapse" : "expand", nodesExpanded ? "Exit Nodes full screen" : "Expand Nodes");
    expand.setAttribute("aria-expanded", String(nodesExpanded)); expand.addEventListener("click", () => setNodesExpanded(!nodesExpanded));
    let activityRows = [], timeline, timeReadout;
    if (nodesExpanded) {
      const sidebar = document.createElement("aside"); sidebar.className = "nodes-data nodes-activity-data";
      sidebar.setAttribute("aria-label", recording.projected ? "Full-network neuron activity" : "Recorded neuron activity");
      const scrolling = document.createElement("div"); scrolling.className = "nodes-activity-scroll";
      const table = document.createElement("table"); table.id = "nodes-activity-table";
      table.innerHTML = `<thead><tr><th>Neuron</th><th>${shade ? (config.model === "lif" ? "V (mV)" : "Activity") : "Role"}</th></tr></thead><tbody></tbody>`;
      const targets = new Set(result.input.flatMap(event => event.cells));
      activityRows = (recording.projected ? result.network.order : observed).map(cell => {
        const row = table.tBodies[0].insertRow(); row.dataset.neuron = cell + 1;
        row.classList.toggle("selected", cell === viewState.selected);
        const name = row.insertCell(), value = row.insertCell(), button = document.createElement("button");
        button.type = "button"; button.className = "node-id";
        const dot = document.createElement("span"); dot.className = "activity-dot"; dot.setAttribute("aria-hidden", "true");
        if (targets.has(cell)) dot.classList.add("stimulated");
        dot.style.backgroundColor = "#dcebe2";
        button.append(dot, String(cell + 1)); name.append(button);
        button.setAttribute("aria-label", `Select neuron ${cell + 1}`);
        button.addEventListener("click", () => {
          const top = scrolling.scrollTop; selectNode(cell);
          const next = document.querySelector(".nodes-activity-scroll"); if (next) next.scrollTop = top;
        });
        value.textContent = targets.has(cell) ? "Stimulated" : recording.projected ? "Mixed" : "Recorded";
        return { cell, value, dot };
      });
      scrolling.append(table); sidebar.append(scrolling);
      const legend = V.colorLegend(center, scale || 1, config.model === "lif" ? "mV" : "Activity");
      if (!shade) { legend.style.visibility = "hidden"; legend.setAttribute("aria-hidden", "true"); }
      sidebar.append(legend);
      graph.append(sidebar);
      graph.querySelector("canvas").setAttribute("aria-describedby", table.id);
      {
        const bar = document.createElement("div"); bar.className = "nodes-timeline";
        timeline = document.createElement("input"); timeline.type = "range"; timeline.id = "nodes-time";
        timeline.min = 0; timeline.max = baseline.points - 1; timeline.step = 1;
        timeline.setAttribute("aria-label", "Playback time");
        timeReadout = document.createElement("output"); timeReadout.id = "nodes-time-value"; timeReadout.htmlFor = timeline.id;
        bar.append(timeline); actions.append(bar);
        if (!shade) { bar.style.visibility = "hidden"; timeline.disabled = true; }
      }
    }
    {
      const play = document.createElement("button"); play.type = "button"; play.id = "nodes-play";
      const transport = document.createElement("span"); transport.className = "nodes-transport";
      if (!timeReadout) { timeReadout = document.createElement("output"); timeReadout.id = "nodes-time-value"; }
      transport.append(play, timeReadout);
      if (!shade) { transport.style.visibility = "hidden"; play.disabled = true; }
      const probe = nodesExpanded ? null : V.fieldsReadout(["Time", "Neuron", config.model === "lif" ? "V (mV)" : "Activity"]);
      if (probe) V.linkProbe(graph, probe);
      if (probe && !shade) { probe.style.visibility = "hidden"; probe.setAttribute("aria-hidden", "true"); }
      const setPoint = index => {
        viewState.graphPoint = index;
        const ms = `${V.number(index * config.sample, 8)} ms`;
        timeReadout.textContent = ms;
        probe?.update([ms, String(viewState.selected + 1), V.number(nodePoint(viewState.graphMode, index, viewState.selected))]);
        if (timeline) { timeline.value = index; timeline.setAttribute("aria-valuetext", ms); timeReadout.textContent = ms; }
        for (const { cell, value, dot } of shade ? activityRows : []) {
          const activity = nodePoint(viewState.graphMode, index, cell);
          value.textContent = V.number(activity); dot.style.backgroundColor = V.activityColor(activity - center, scale);
        }
        graph.refresh();
      };
      const label = () => { UI.iconize(play, viewState.graphPlaying ? "pause" : "play", viewState.graphPlaying ? "Pause activity" : "Play activity"); play.setAttribute("aria-pressed", String(viewState.graphPlaying)); };
      const start = () => {
        const index = viewState.graphPoint, began = performance.now();
        const next = now => {
          if (!viewState.graphPlaying || !graph.isConnected) return;
          const point = index + Math.floor(Math.max(0, now - began) * baseline.points / 4500);
          if (point >= baseline.points) { viewState.graphPlaying = false; animation = 0; setPoint(0); label(); return; }
          setPoint(point);
          animation = requestAnimationFrame(next);
        };
        animation = requestAnimationFrame(next);
      };
      play.addEventListener("click", () => {
        viewState.graphPlaying = !viewState.graphPlaying; cancelAnimationFrame(animation); animation = 0; label();
        if (viewState.graphPlaying) start();
      });
      timeline?.addEventListener("input", () => {
        viewState.graphPlaying = false; cancelAnimationFrame(animation); animation = 0;
        label(); setPoint(Number(timeline.value));
      });
      label(); setPoint(viewState.graphPoint); if (shade && viewState.graphPlaying) start();
      actions.prepend(transport);
    }
    actions.append(mode, expand); heading.replaceChildren(title, actions); heading.after(details);
    return scaleNote;
  }

  function selectNode(cell, focus) {
    viewState.selected = cell;
    if (focus !== "weight-heatmap") viewState.edge = null;
    renderView();
    if (focus) $(focus)?.focus({ preventScroll: true });
  }

  $("theory").innerHTML = globalThis.NeuroTheory.zh;
  $("theory-language").addEventListener("click", event => {
    const button = event.target.closest("button[data-language]");
    if (!button || button.dataset.language === theoryLanguage) return;
    theoryLanguage = button.dataset.language;
    $("theory").lang = theoryLanguage === "zh" ? "zh-CN" : "en";
    for (const option of $("theory-language").querySelectorAll("button")) option.setAttribute("aria-pressed", String(option === button));
    void globalThis.NeuroMath.setSource($("theory"), globalThis.NeuroTheory[theoryLanguage]);
  });
  const renderers = { traces: traceView, activity: activityView, population: populationView, covariance: covarianceView, connectivity: connectivityView };
  function renderView({ keepControls = false } = {}) {
    globalThis.NeuroUI.closeInfo();
    updateRangeView = null;
    $("viz-wrap").removeAttribute("aria-busy");
    if (view !== "connectivity" && nodesExpanded) { nodesExpanded = false; document.body.classList.remove("nodes-expanded"); }
    controlsRoot = keepControls ? document.createElement("div") : $("view-controls");
    try {
    viewInfoHome.prepend(matrixExport);
    syncPin();
    if (viewInfo.dataset.infoView !== view) { $("view-description").hidden = true; viewInfo.setAttribute("aria-expanded", "false"); viewInfo.dataset.infoView = view; }
    viewInfoHome.append(viewInfo);
    cancelAnimationFrame(animation);
    animation = 0;
    comparison?.dispose();
    comparison = null;
    for (const card of chartNodes.splice(0)) card.dispose();
    for (const id of ["viz-wrap", ...(keepControls ? [] : ["view-controls"]), "result-details"]) $(id).replaceChildren();
    readout("");
    for (const tab of $("views").querySelectorAll("button")) tab.setAttribute("aria-pressed", String(tab.dataset.view === view));
    const activeTab = $("views").querySelector('[aria-pressed="true"]');
    if (activeTab) {
      const frame = $("views").getBoundingClientRect(), tab = activeTab.getBoundingClientRect();
      if (tab.left < frame.left) $("views").scrollLeft += tab.left - frame.left;
      else if (tab.right > frame.right) $("views").scrollLeft += tab.right - frame.right;
    }
    $("results").dataset.view = view;
    $("save-matrix").hidden = view !== "connectivity";
    $("result-title").textContent = plots[view][0];
    note(plots[view][1]);
    $("theory").hidden = view !== "methods";
    $("theory-language").hidden = view !== "methods";
    if (view === "methods") { void globalThis.NeuroMath.render($("theory")); return; }
    if (view === "compare") {
      comparison = globalThis.NeuroCompare.render({
        root: $("viz-wrap"), reference, current: result ? { result, observed, recording } : null,
        controls: $("view-controls"),
        onInfo: note, onViewChange: syncPin,
        state: compareState, labels: fieldLabels,
        onExportReference: () => {
          if (reference) download("reference-experiment.json", JSON.stringify({ version: 2, config: reference.result.config }, null, 2), "application/json");
        }
      });
      return;
    }
    if (result) renderers[view]();
    else note("Results will appear when the simulation finishes.");
    } finally { controlsRoot = $("view-controls"); }
  }

  $("views").addEventListener("click", event => {
    const tab = event.target.closest("button[data-view]");
    if (tab) { view = tab.dataset.view; renderView(); }
  });

  const shortcutDialog = $("shortcuts-dialog");
  let composing = false;
  $("shortcuts").addEventListener("click", () => shortcutDialog.showModal());
  document.addEventListener("compositionstart", () => { composing = true; }, true);
  document.addEventListener("compositionend", () => { composing = false; }, true);
  addEventListener("blur", () => { composing = false; });
  document.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing && !composing && event.keyCode !== 229 && !document.querySelector("dialog[open]") && !event.target.closest?.("textarea, [contenteditable]:not([contenteditable='false'])")) {
      event.preventDefault();
      if (!event.repeat && !controller) void runExperiment(readForm());
      return;
    }
    if (event.key === "Escape" && !event.defaultPrevented && nodesExpanded && !document.querySelector("dialog[open]") && !event.isComposing && !composing) {
      event.preventDefault(); setNodesExpanded(false); return;
    }
    if (!event.defaultPrevented && !event.ctrlKey && !event.altKey && !event.metaKey && ["F5", "F9"].includes(event.key)) {
      // These explicit commands also work from a field, without reloading the page.
      event.preventDefault();
      if (event.repeat || event.isComposing || composing || event.keyCode === 229 || document.querySelector("dialog[open]")) return;
      if (event.key === "F9") { $("seed-noise").click(); return; }
      const topology = $("topology").value;
      if (topology === "custom") { message("Custom connectivity is fixed. Edit the matrix to change its connections."); return; }
      if (["ring", "chain"].includes(topology) && Number($("jitter").value) === 0) {
        message("This connectivity is deterministic. Set Relative weight jitter above zero to resample weights.");
        return;
      }
      $("seed-network").click();
      return;
    }
    if (event.defaultPrevented || event.isComposing || composing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || shortcutDialog.open) return;
    // Browsers also submit forms implicitly from Shift+Enter in an input.
    // Suppress that submission while editing; textarea line breaks remain native.
    if (event.key === "Enter" && event.shiftKey && event.target instanceof HTMLInputElement && event.target.form === $("settings")) {
      event.preventDefault();
      return;
    }
    if (event.target instanceof Element && event.target.closest("input, select, textarea, [contenteditable]:not([contenteditable='false']), [role='textbox'], canvas, .viz-card, dialog")) return;
    if (event.repeat) {
      if (event.key === "Enter" && event.shiftKey) event.preventDefault();
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      if (!controller) void runExperiment(readForm());
    } else if (event.key === "?") {
      event.preventDefault();
      shortcutDialog.showModal();
    } else if (["b", "n"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const tabs = [...$("views").querySelectorAll("button[data-view]")];
      const position = tabs.findIndex(tab => tab.dataset.view === view);
      const next = tabs[(position + (event.key.toLowerCase() === "n" ? 1 : -1) + tabs.length) % tabs.length];
      view = next.dataset.view;
      renderView();
      next.focus({ preventScroll: true });
    }
  });

  function download(name, payload, type) {
    const url = URL.createObjectURL(new Blob(payload instanceof Array ? payload : [payload], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  $("save-config").addEventListener("click", () => {
    try {
      const { config } = M.prepare(readForm());
      download("neural-network-experiment.json", JSON.stringify({ version: 2, config }, null, 2), "application/json");
    } catch (error) { formError(error); }
  });

  $("load-config").addEventListener("change", async event => {
    const input = event.target, file = input.files[0];
    if (!file) return;
    try {
      if (file.size > 600000) throw new Error("The configuration file is too large.");
      const parsed = JSON.parse(await file.text());
      if (parsed.version !== 2 || !parsed.config) throw new Error("Choose a version 2 experiment configuration.");
      const { config } = M.prepare(parsed.config);
      revision++;
      activePreset = "";
      dirty = true;
      fillForm(config, "");
      await runExperiment(config);
    } catch (error) { formError(error); }
    finally { input.value = ""; }
  });

  function exportSpikes() {
    if (recording?.projected) return;
    const parts = ["condition,neuron,time_ms\n"];
    for (const [name, run] of [["baseline", result.baseline], ["stimulated", result.stimulated]]) {
      for (const id of observed) parts.push(run.spikes[id].map(time => `${name},${id + 1},${time}\n`).join(""));
    }
    download("spike-events.csv", parts, "text/csv");
  }

  $("save-data").addEventListener("click", () => {
    if (!result) return;
    const { config, baseline, stimulated } = result, spiking = Boolean(baseline.spikes);
    const prefix = recording.projected ? "readout_" : "";
    const header = ["time_ms", ...observed.map(id => `u_${prefix}${id + 1}`)];
    for (const condition of ["baseline", "stimulated"]) {
      header.push(...observed.map(id => `${condition}_${prefix}${spiking ? "mV" : "activity"}_${id + 1}`));
      if (spiking) header.push(...observed.map(id => `${condition}_${recording.projected ? "projected_count" : "spike_count"}_${id + 1}`));
    }
    const parts = [header.join(",") + "\n"];
    const stimulus = new Float64Array(config.n);
    for (let p = 0; p < baseline.points; p++) {
      const time = p * config.sample;
      M.stimulusAt(result.input, Math.round(time / config.dt), config.dt, stimulus);
      const row = [time, ...observed.map(id => recording.projected ? inputPoint(id, Math.round(time / config.dt)) : stimulus[id])];
      for (const condition of ["baseline", "stimulated"]) {
        row.push(...observed.map(id => point(condition, p, id)));
        if (spiking) row.push(...observed.map(id => point(condition, p, id, true)));
      }
      parts.push(row.join(",") + "\n");
    }
    download("neural-network-recordings.csv", parts, "text/csv");
  });

  $("save-matrix").addEventListener("click", () => {
    if (result) download("neural-network-weights.csv", result.network.weights.map(row => Array.from(row).join(",")).join("\n"), "text/csv");
  });

  $("save-readout").addEventListener("click", () => {
    if (!recording || observationController) return;
    const header = [recording.projected ? "channel" : "neuron", ...result.network.order.map(id => `neuron_${id + 1}`)];
    const rows = recording.weights.map((row, i) => [recording.ids[i] + 1, ...row].join(","));
    download("readout-matrix-R.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  });

  const initial = M.preset(activePreset);
  fillForm(initial, activePreset);
  renderView();
  void runExperiment(initial);
})();
