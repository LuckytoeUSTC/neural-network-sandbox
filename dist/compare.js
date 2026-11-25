(() => {
  "use strict";

  // Comparison is a view over completed runs. It never simulates or edits a run.
  function render({ root, controls, reference, current, state = {}, labels = {}, gifFrameInterval = () => 20, onExportReference, onInfo, onViewChange }) {
    const V = globalThis.NeuroViz, M = globalThis.NeuroModel, UI = globalThis.NeuroUI;
    const charts = new Set();
    let disposed = false, events = null;
    let sharedValueRange, timeRange, duration = 0, timeStep = 1, playButton, timeDisplay;
    let graphUpdates = [], graphExports = [], colorScales = {};
    const scaleCache = new Map();
    let additionalInfo = "";
    root.classList.add("neuro-compare");
    if (!["connectivity", "traces"].includes(state.view)) state.view = "connectivity";
    if (!["baseline", "stimulated", "delta", "overlay"].includes(state.condition)) state.condition = "stimulated";
    if (!["structure", "baseline", "stimulated", "delta"].includes(state.graphMode)) state.graphMode = "stimulated";
    if (!Number.isFinite(state.time)) state.time = 0;
    for (const side of ["reference", "current"]) {
      if (!Number.isInteger(state[side + "Node"])) state[side + "Node"] = 0;
    }

    const el = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    function listen(node, type, action) {
      node.addEventListener(type, action, { signal: events.signal });
    }
    function button(text, action, key) {
      const node = el("button", text, "cmp-button");
      node.type = "button";
      node.dataset.cmpFocus = key;
      listen(node, "click", action);
      return node;
    }
    function select(label, options, value, action, key) {
      const wrap = el("label", undefined, "cmp-control"), name = el("span", label), input = el("select");
      input.dataset.cmpFocus = key;
      input.setAttribute("aria-label", label || "Displayed activity");
      for (const [id, text] of Object.entries(options)) {
        const option = el("option", text);
        option.value = id;
        input.append(option);
      }
      input.value = String(value);
      listen(input, "change", () => action(input.value));
      wrap.append(name, input);
      return wrap;
    }
    function update(key, value) {
      if (["view", "graphMode"].includes(key)) state.playing = false;
      state[key] = value;
      if (key === "condition") state.showInput = value !== "baseline";
      if (key === "view") onViewChange?.();
      draw();
    }
    function attach(chart, parent) {
      charts.add(chart);
      parent.append(chart);
      return chart;
    }
    function clearCharts() {
      for (const chart of charts) chart.dispose?.();
      charts.clear();
    }
    function modelName(config) { return M.models[config.model] ?? config.model; }
    function topologyName(config) { return M.topologies[config.topology] ?? config.topology; }
    function idsFor(run) {
      return Array.from(run.observed ?? []).filter(id => Number.isInteger(id) && id >= 0 && id < run.result.config.n);
    }
    function selectedIds(side, run) {
      const available = idsFor(run), key = side + "Ids";
      let ids = (state[key] ?? available.slice(0, 8)).filter(id => available.includes(id));
      if (!ids.length) ids = available.slice(0, 8);
      state[key] = ids; return ids;
    }
    function valueAt(run, condition, point, id) {
      const offset = point * run.result.config.n + id;
      if (condition === "delta") return run.result.stimulated.data[offset] - run.result.baseline.data[offset];
      return run.result[condition].data[offset];
    }
    function recordedValueAt(run, condition, point, id) {
      if (!run.recording?.projected) return valueAt(run, condition, point, id);
      const offset = point * run.recording.m + id;
      if (condition === "delta") return run.recording.stimulated.data[offset] - run.recording.baseline.data[offset];
      return run.recording[condition].data[offset];
    }
    function fieldName(key) {
      return labels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
    }
    function fieldValue(key, value) {
      if (value === undefined || value === null) return "Not set";
      if (key === "matrix" || key === "events") {
        const text = String(value), rows = text.split(/\r?\n/).filter(line => line.trim()).length;
        return text.trim() ? `${rows} non-empty rows · ${text.length} characters` : "Empty";
      }
      const option = M.choices?.[key]?.[value];
      if (option) return option;
      if (Array.isArray(value)) return value.join(", ");
      const text = String(value);
      // Long programs are summarized, never injected as HTML or laid out in full.
      return text.length > 100 ? `${text.length} characters (text differs)` : text;
    }
    function comparisonRanges() {
      const runs = [reference, current].filter(run => run?.result);
      const sameUnits = runs.every(run => (run.result.config.model === "lif") === (runs[0].result.config.model === "lif"));
      sharedValueRange = undefined;
      timeRange = [state.first ?? 0, state.last ?? Math.max(...runs.map(run => run.result.config.total))];
      duration = Math.min(...runs.map(run => run.result.config.total));
      timeStep = Math.min(...runs.map(run => run.result.config.sample));
      state.time = Math.max(0, Math.min(duration, state.time));
      if (state.view === "connectivity" && state.graphMode !== "structure") {
        if (!scaleCache.has(state.graphMode)) {
          const scales = {};
          const sharedCenter = state.graphMode !== "delta" && runs[0].result.config.model === "lif"
            ? runs.reduce((sum, run) => sum + run.result.config.rest, 0) / runs.length : 0;
          for (const [side, run] of [["reference", reference], ["current", current]]) {
            if (!run?.result) continue;
            const { config, baseline } = run.result;
            const center = sameUnits ? sharedCenter : state.graphMode !== "delta" && config.model === "lif" ? config.rest : 0;
            let scale = 0;
            for (let p = 0; p < baseline.points; p++) for (let id = 0; id < config.n; id++) scale = Math.max(scale, Math.abs(valueAt(run, state.graphMode, p, id) - center));
            scales[side] = { center, scale };
          }
          if (sameUnits) {
            const scale = Math.max(...Object.values(scales).map(value => value.scale));
            for (const value of Object.values(scales)) value.scale = scale;
          }
          scaleCache.set(state.graphMode, scales);
        }
        colorScales = scaleCache.get(state.graphMode);
      }
      if (state.view === "traces" && sameUnits) {
        let low = Infinity, high = -Infinity;
        for (const [side, run] of [["reference", reference], ["current", current]]) {
          if (!run?.result) continue;
          const config = run.result.config, data = run.result.baseline;
          const selected = selectedIds(side, run);
          const points = Math.min(data.points, Math.floor(data.data.length / config.n));
          for (let point = 0; point < points; point++) {
            for (const id of selected) for (const condition of state.condition === "overlay" ? ["baseline", "stimulated"] : [state.condition]) {
              const value = recordedValueAt(run, condition, point, id);
              if (Number.isFinite(value)) { low = Math.min(low, value); high = Math.max(high, value); }
            }
          }
        }
        if (Number.isFinite(low) && Number.isFinite(high)) {
          const margin = high > low ? (high - low) * 0.06 : Math.max(0.1, Math.abs(low) * 0.04);
          sharedValueRange = [low - margin, high + margin];
        }
      }
      return sameUnits;
    }
    function tracePlot(side, run, plots) {
      const { config, baseline } = run.result, selected = selectedIds(side, run);
      const last = Math.min(baseline.points - 1, Math.floor(baseline.data.length / config.n) - 1);
      if (last < 1) { plots.append(el("p", "At least two recorded samples are needed for a trace.", "cmp-empty")); return; }
      const noun = run.recording?.projected ? "Channel" : "Neuron";
      const conditions = state.condition === "overlay" ? ["baseline", "stimulated"] : [state.condition];
      const series = selected.flatMap((id, index) => conditions.map(key => ({
        label: `${noun} ${id + 1}${conditions.length > 1 ? " " + (key === "baseline" ? "Baseline" : "Stimulus") : ""}`,
        group: `${noun} ${id + 1}`, condition: { baseline: "Baseline", stimulated: "Stimulus", delta: "Difference" }[key],
        color: V.palette[index % V.palette.length], dash: conditions.length > 1 && key === "baseline",
        at: point => recordedValueAt(run, key, point, id)
      })));
      const inputCell = Math.max(0, Math.min((run.recording?.projected ? run.recording.m : config.n) - 1, state.inputCell ?? 0));
      const inputAt = index => run.result.input.reduce((sum, event) => {
        const weight = run.recording?.projected ? event.cells.reduce((total, id) => total + run.recording.weights[inputCell][id], 0) : Number(event.cells.includes(inputCell));
        return sum + weight * M.eventDrive(event, index, config.dt);
      }, 0);
      const secondarySeries = run.result.input.length ? [{ color: V.palette[2], label: "Stimulus input", at: inputAt, stairs: true, width: 3.2 }] : [];
      const first = Math.max(0, Math.min(last - 1, Math.round(timeRange[0] / config.sample)));
      const end = Math.max(first + 1, Math.min(last, Math.round(timeRange[1] / config.sample)));
      attach(V.lines({ title: run.recording?.projected ? (config.model === "lif" ? "Projected voltage (mV)" : "Projected activity") : config.model === "lif" ? (state.condition === "delta" ? "Difference (mV)" : "Membrane potential (mV)") : "Activity (dimensionless)",
        series, first, last: end, step: config.sample, height: 320, valueRange: sharedValueRange, timeRange,
        secondarySeries, secondaryStep: config.dt, secondaryVisible: state.showInput ?? true, fullLast: last,
        secondaryLabel: config.model === "lif" ? "Input (pA)" : "Input (dimensionless)",
        bands: state.condition === "baseline" ? [] : run.result.input,
        reference: config.model === "lif" && !run.recording?.projected && state.condition !== "delta" ? config.threshold : 0 }), plots);
    }
    function refreshTraces() {
      comparisonRanges();
      for (const [side, run] of [["reference", reference], ["current", current]]) {
        const plots = root.querySelector(`[data-side="${side}"] .cmp-plots`);
        if (!plots || !run?.result) continue;
        for (const chart of charts) if (plots.contains(chart)) { chart.dispose(); charts.delete(chart); }
        plots.replaceChildren(); tracePlot(side, run, plots);
      }
      for (const chart of charts) chart.paintNow?.();
    }
    function refreshActivity() {
      if (timeDisplay) timeDisplay.textContent = `${V.number(state.time, 8)} ms`;
      for (const refresh of graphUpdates) refresh();
    }
    function playbackLabel() {
      if (playButton) { UI.iconize(playButton, state.playing ? "pause" : "play", state.playing ? "Pause comparison" : "Play comparison"); playButton.setAttribute("aria-pressed", String(Boolean(state.playing))); }
    }
    const playback = UI.playback({
      time: () => state.time, duration: () => duration, sample: () => timeStep,
      speed: () => state.playbackSpeed || 1, playing: () => state.playing, active: () => !disposed,
      setTime: time => { state.time = time; refreshActivity(); },
      setPlaying: value => { state.playing = value; playbackLabel(); }
    });
    function differences(parent) {
      const section = el("section", undefined, "cmp-differences"), heading = el("h3", "Configuration changes");
      section.append(heading);
      if (!reference?.result || !current?.result) {
        section.append(el("p", "Complete both runs to compare configurations."));
        parent.append(section);
        return;
      }
      const before = reference.result.config, after = current.result.config;
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
      const changed = keys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
      const beforeIds = idsFor(reference).map(id => id + 1), afterIds = idsFor(current).map(id => id + 1);
      const recordingChanged = JSON.stringify(beforeIds) !== JSON.stringify(afterIds);
      if (!changed.length && !recordingChanged) {
        section.append(el("p", "No configuration or recording-selection changes."));
        parent.append(section);
        return;
      }
      const table = el("table", undefined, "cmp-diff-table");
      const caption = el("caption", "Only changed settings are listed.");
      table.append(caption);
      const header = table.createTHead().insertRow();
      for (const text of ["Setting", "Reference", "Current"]) {
        const th = el("th", text); th.scope = "col"; header.append(th);
      }
      const body = table.createTBody();
      function row(name, a, b) {
        const tr = body.insertRow(), th = el("th", name);
        th.scope = "row"; tr.append(th);
        for (const [title, value] of [["Reference", a], ["Current", b]]) {
          const td = tr.insertCell(); td.dataset.column = title; td.textContent = value;
        }
      }
      for (const key of changed) {
        row(fieldName(key), fieldValue(key, before[key]), fieldValue(key, after[key]));
      }
      if (recordingChanged) {
        row("Readout IDs", fieldValue("recordedIDs", beforeIds), fieldValue("recordedIDs", afterIds));
      }
      section.append(table);
      if (changed.includes("matrix") || changed.includes("events")) {
        additionalInfo = "Custom connectivity and stimulus programs are summarized by size. Matching sizes do not imply matching contents; these rows appear only when the text differs.";
      }
      parent.append(section);
    }
    function sidePanel(side, run, grid) {
      const panel = el("section", undefined, "cmp-side"), header = el("header", undefined, "cmp-side-header");
      panel.dataset.side = side;
      const title = side === "reference" ? "Reference" : "Current";
      header.append(el("h3", title), el("span", side === "reference" ? "Pinned run" : "Completed run", "cmp-run-kind"));
      panel.append(header);
      grid.append(panel);
      if (!run?.result) {
        panel.append(el("p", side === "reference" ? "Pin a completed run to keep it here." : "Run an experiment to show the current result.", "cmp-empty"));
        return;
      }
      const result = run.result, config = result.config, observed = idsFor(run);
      const meta = el("div", undefined, "cmp-run-meta");
      meta.append(el("p", `${modelName(config)} · ${topologyName(config)}`));
      meta.append(el("p", `${config.n} ${config.n === 1 ? "neuron" : "neurons"} · ${observed.length} ${run.recording?.projected ? "channels" : "recorded"} · ${config.total} ms`));
      meta.append(el("p", M.sampling[config.observeMode]));
      if (state.view === "traces") meta.append(el("p", `Sample interval: ${config.sample} ms`));
      panel.append(meta);
      const controls = el("div", undefined, "cmp-side-controls"), plots = el("div", undefined, "cmp-plots");
      panel.append(controls, plots);
      if (state.view === "traces") {
        if (!observed.length) {
          plots.append(el("p", "No recorded channels in this run.", "cmp-empty"));
          return;
        }
        controls.append(UI.neuronInput({ available: observed, selected: selectedIds(side, run), focusKey: side + "-neurons", noun: run.recording?.projected ? "Channel" : "Neuron",
          onChange: ids => { state[side + "Ids"] = ids; refreshTraces(); } }));
        tracePlot(side, run, plots);
      } else {
        const key = side + "Node";
        state[key] = Math.max(0, Math.min(config.n - 1, state[key]));
        controls.append(select("Inspect neuron", Object.fromEntries(result.network.order.map(id => [id, `Neuron ${id + 1}`])),
          state[key], value => update(key, Number(value)), side + "-node"));
        const shade = state.graphMode !== "structure", { center = 0, scale = 1 } = colorScales[side] ?? {};
        const point = () => Math.max(0, Math.min(result.baseline.points - 1, Math.round(state.time / config.sample)));
        const graph = V.graph({ result, observed: run.recording?.projected ? [] : observed, selected: state[key], onlySelected: Boolean(state.focusEdges),
          activity: shade ? id => valueAt(run, state.graphMode, point(), id) - center : null, scale,
          select: (id, focusGraph) => {
            state[key] = id;
            draw(focusGraph ? side + "-graph" : undefined);
          }
        });
        const canvas = graph.querySelector("canvas");
        if (canvas) {
          canvas.dataset.cmpFocus = side + "-graph";
          canvas.id = "cmp-" + side + "-graph";
        }
        attach(graph, plots);
        graphExports.push({ graph, title: `${title} · ${state.graphMode === "delta" ? "Difference" : state.graphMode === "baseline" ? "Baseline" : "Stimulus"}`, center, scale, unit: config.model === "lif" ? "mV" : "" });
        {
          const probe = V.fieldsReadout(["Neuron", config.model === "lif" ? "V (mV)" : "Activity"]);
          V.linkProbe(graph, probe);
          if (!shade) { probe.style.visibility = "hidden"; probe.setAttribute("aria-hidden", "true"); }
          const formatActivity = V.numericFormat(center - scale, center + scale);
          const refresh = () => { probe.update([String(state[key] + 1), formatActivity(valueAt(run, shade ? state.graphMode : "stimulated", point(), state[key]))]); graph.refresh(); };
          graphUpdates.push(refresh); refresh();
        }
      }
    }
    function draw(focusKey) {
      if (disposed) return;
      const active = document.activeElement;
      const restore = focusKey ?? (root.contains(active) || controls?.contains(active) ? active?.dataset.cmpFocus : null);
      playback.stop(); graphUpdates = []; graphExports = []; playButton = null; timeDisplay = null;
      UI.closeInfo();
      clearCharts();
      events?.abort();
      events = new AbortController();
      root.replaceChildren();
      controls?.replaceChildren();
      const header = el("div", undefined, "cmp-heading");
      const actions = el("div", undefined, "cmp-actions");
      if (reference?.result && onExportReference) actions.append(button("Export reference config", () => onExportReference(reference), "export-reference"));

      if (actions.childElementCount && !controls) { header.append(actions); root.append(header); }
      if (!reference?.result) {
        onInfo?.("Pin a completed experiment, change its configuration and run again, then open Compare. The pinned result stays unchanged until you unpin it.");
        root.append(el("p", "Use Pin reference after a completed run, then change the configuration and run again. The pinned result will stay unchanged.", "cmp-empty"));
        return;
      }
      const toolbar = el("div", undefined, "cmp-toolbar");
      const sameUnits = comparisonRanges();
      toolbar.append(select("View", { connectivity: "Connectivity", traces: "Traces" }, state.view, value => update("view", value), "view"));
      if (state.view === "connectivity") {
        toolbar.append(select("", { structure: reference.recording?.projected || current?.recording?.projected ? "Structure" : "Recording", baseline: "Baseline", stimulated: "Stimulus", delta: "Difference" }, state.graphMode,
          value => update("graphMode", value), "activity"));
        {
          const transport = el("div", undefined, "cmp-transport");
          playButton = button("", playback.toggle, "play");
          playButton.dataset.activityTransport = "true";
          listen(playButton, "step-frame", event => playback.step(event.detail));
          timeDisplay = el("output", `${V.number(state.time, 8)} ms`, "cmp-time"); timeDisplay.setAttribute("aria-label", "Comparison time");
          const gif = NeuroGIF.control({
            filename: "comparison-activity.gif", signal: events.signal, plan: () => NeuroGIF.framePlan(duration, gifFrameInterval(), timeStep, state.playbackSpeed || 1),
            beforeStart: playback.pause,
            renderFrame: fraction => {
              const previous = state.time;
              try {
                state.time = fraction * duration;
                return NeuroGIF.compose(graphExports.map(({graph, ...item}) => ({ ...item, canvas: graph.capture(440, 360) })), state.time);
              } finally { state.time = previous; }
            },
            onError: error => UI.showInfo("GIF export", error.message)
          });
          gif.dataset.cmpFocus = "gif";
          const speed = UI.speedControl(state.playbackSpeed || 1, value => { state.playbackSpeed = value; playback.changeSpeed(); });
          playbackLabel(); transport.append(gif, speed, playButton, timeDisplay); toolbar.append(transport);
          if (state.graphMode === "structure") { transport.style.visibility = "hidden"; playButton.disabled = true; }
        }
      } else {
        toolbar.append(select("", { baseline: "Baseline", stimulated: "Stimulus", delta: "Difference", overlay: "Baseline + Stimulus" }, state.condition,
          value => update("condition", value), "condition"));
      }
      if (state.view === "traces") { const reserve = el("div", undefined, "cmp-transport transport-placeholder"); reserve.setAttribute("aria-hidden", "true"); toolbar.append(reserve); }
      (controls || root).append(toolbar);
      if (controls) toolbar.append(actions);
      const projected = reference.recording?.projected || current?.recording?.projected;
      const identity = projected ? "Neuron and channel IDs are local to each run. Channel weights are set separately in each run; export R to compare readouts. " : "Neuron IDs are local to each run. ";
      const explanation = state.view === "traces"
        ? identity + (sameUnits ? "Time and value axes are shared for the displayed records." : "Time axes are shared; value axes are independent because the units differ.")
        : state.graphMode === "structure"
          ? identity + "Filled nodes mark individually recorded neurons; orange borders mark stimulus targets. Projected channels mix activity across nodes. Arrows point from source to target."
          : identity + (sameUnits ? "Both networks use the same fixed activity color scale. " : "Activity color scales are independent because the units differ. ") + "Nodes shows the original neurons, including under projected recording. Playback covers the shared duration; each side uses its nearest saved sample.";
      const grid = el("div", undefined, "cmp-grid");
      root.append(grid);
      sidePanel("reference", reference, grid);
      sidePanel("current", current, grid);
      additionalInfo = ""; differences(root);
      const difference = (state.view === "traces" ? state.condition : state.graphMode) === "delta" ? "Difference = Stimulus − Baseline within each run." : "";
      onInfo?.([explanation, difference, additionalInfo].filter(Boolean).join("\n\n"));
      if (state.playing && state.view === "connectivity" && state.graphMode !== "structure") playback.start();
      if (restore) {
        const target = [...root.querySelectorAll("[data-cmp-focus]"), ...controls?.querySelectorAll("[data-cmp-focus]") || []].find(node => node.dataset.cmpFocus === restore);
        target?.focus({ preventScroll: true });
      }
    }
    draw();
    return { dispose() {
      if (disposed) return;
      disposed = true;
      state.playing = false; playback.stop();
      events?.abort();
      clearCharts();
      root.replaceChildren();
      controls?.replaceChildren();
      root.classList.remove("neuro-compare");
    } };
  }
  globalThis.NeuroCompare = { render };
})();
