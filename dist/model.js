(function defineNeuroModel() {
  "use strict";

  const models = { linear: "Linear rate", tanh: "Tanh rate", sigmoid: "Sigmoid rate", lif: "LIF" };
  const topologies = { ring: "Directed ring", chain: "Feedforward chain", random: "Random", ei: "E/I", cluster: "Clustered", lowrank: "Low-rank", custom: "Custom" };
  const waveforms = { off: "None", pulse: "Square pulse", paired: "Paired pulses", step: "Step", sine: "Sinusoidal", custom: "Custom sequence" };
  const sampling = { random: "Random subsampling", orthogonal: "Random orth. projection", gaussian: "i.i.d. Gaussian projection", manual: "Manual subset", first: "First neurons", spread: "Evenly spaced subset", group: "Within-group subset" };
  const settings = {
    n: [1, 1000, 1], groups: [1, 16, 1], eiFraction: [0, 1], inhibRatio: [0, 30],
    gain: [-30, 30], density: [0, 1], between: [-1, 1], rank: [1, 8, 1], bulk: [0, 20], jitter: [0, 1],
    networkSeed: [0, 4294967295, 1], noiseSeed: [0, 4294967295, 1], observeSeed: [0, 4294967295, 1],
    tau: [2, 2000], bias: [-5000, 5000], initial: [0, 100], noise: [0, 3000], noiseTau: [1, 5000], shared: [0, 1],
    capacitance: [10, 2000], leak: [0.1, 80], rest: [-100, -35], reset: [-110, -30], threshold: [-90, -15],
    reversalE: [-40, 45], reversalI: [-110, -40], tauE: [0.5, 1000], tauI: [0.5, 1000],
    refractory: [0, 20], delay: [0, 100], adapt: [0, 1000], adaptTau: [5, 5000],
    amplitude: [-5000, 5000], onset: [0, 20000], width: [0.1, 20000], interval: [0.1, 20000], frequency: [0.1, 1000],
    total: [20, 20000], warmup: [0, 15000], sample: [0.1, 50], m: [1, 1000, 1], group: [1, 16, 1]
  };
  const presets = {
    ring: ["Ring propagation", {}],
    chain: ["Feedforward propagation", { topology: "chain", gain: 1.05 }],
    random: ["Random rate network", { model: "tanh", topology: "random", n: 48, gain: 1.35, density: 0.7, amplitude: 0.45, m: 8, initial: 0.18 }],
    lowrank: ["Low-rank network", { model: "tanh", topology: "lowrank", n: 48, gain: 1.6, rank: 2, bulk: 0.45, noise: 0.045, m: 12, targets: "1-8" }],
    clusters: ["Clustered network", { model: "sigmoid", topology: "cluster", n: 36, gain: 8, groups: 3, density: 0.85, between: -0.15, bias: -2.8, amplitude: 2.5, targets: "1-5", m: 9 }],
    covariance: ["Partial observation", { topology: "random", n: 32, gain: 0.7, noise: 0.30, noiseTau: 10, waveform: "off", m: 12, total: 8000, warmup: 800, sample: 4, observeMode: "random" }],
    ei: ["E/I spiking network", { model: "lif", topology: "ei", n: 64, gain: 1.5, density: 0.25, inhibRatio: 4, bias: 190, noise: 65, amplitude: 130, targets: "1-8", m: 16, observeMode: "spread", total: 1300, warmup: 300, width: 180, onset: 350, dt: 0.25, sample: 1 }],
    adaptation: ["Spike-frequency adaptation", { model: "lif", topology: "custom", n: 1, matrix: "", gain: 1, noise: 0, bias: 70, initial: 0, waveform: "step", amplitude: 230, adapt: 32, dt: 0.25, sample: 1, m: 1, total: 1250, warmup: 100 }]
  };
  const defaults = {
    model: "linear", topology: "ring", n: 12, gain: 0.88, density: 0.5, groups: 3,
    eiFraction: 0.8, inhibRatio: 3.5, between: 0, rank: 1, bulk: 0.3, jitter: 0.12, networkSeed: 31242,
    matrixFormat: "edges", matrix: "1,2,0.9\n2,3,0.9\n3,1,0.7", tau: 20, bias: 0, initial: 0.025,
    noise: 0.025, noiseTau: 8, shared: 0, noiseSeed: 59013, pairing: "matched",
    capacitance: 200, leak: 10, rest: -65, reset: -65, threshold: -50, reversalE: 0, reversalI: -80,
    tauE: 5, tauI: 10, refractory: 2, delay: 1.5, adapt: 0, adaptTau: 120,
    waveform: "pulse", amplitude: 1.8, onset: 120, width: 36, interval: 100, frequency: 8, targets: "1", events: "120,30,1.8,1\n280,50,-0.5,2 3",
    dt: 0.5, total: 1000, warmup: 200, sample: 2, observeMode: "first", m: 6, observe: "1-3", group: 1, observeSeed: 20610
  };
  const stepOptions = [0.125, 0.25, 0.5, 1, 2, 4];
  const choices = {
    model: models, topology: topologies, waveform: waveforms, observeMode: sampling,
    pairing: { matched: "Paired", independent: "Independent" },
    matrixFormat: { edges: "Edge list", dense: "Dense matrix" }
  };
  const ticks = (ms, dt) => Math.round(ms / dt);
  const aligned = (ms, dt) => Math.abs(ms / dt - Math.round(ms / dt)) < 1e-8;

  function random(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let bits = Math.imul(state ^ (state >>> 15), state | 1);
      bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
      return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalSampler(rand) {
    let spare = null;
    return () => {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      const radius = Math.sqrt(-2 * Math.log(1 - rand())), phase = 2 * Math.PI * rand();
      spare = radius * Math.sin(phase);
      return radius * Math.cos(phase);
    };
  }

  function parseCells(text, n) {
    const value = String(text).trim().toLowerCase();
    if (value === "all" || value === "全部") return Array.from({ length: n }, (_, i) => i);
    const cells = new Set();
    for (const token of value.split(/[,，;；\s]+/)) {
      const match = /^(\d+)(?:[-–](\d+))?$/.exec(token);
      if (!match) throw new Error("Enter neuron IDs such as 1, 4, 7-10, or enter \"all\".");
      const start = Number(match[1]), end = Number(match[2] ?? match[1]);
      if (start < 1 || end < start || end > n) throw new Error(`Neuron IDs must be between 1 and ${n}.`);
      for (let cell = start; cell <= end; cell++) cells.add(cell - 1);
    }
    return [...cells];
  }

  function preset(name) {
    if (!Object.hasOwn(presets, name)) throw new Error("Preset not found.");
    return { ...defaults, ...presets[name][1] };
  }

  function validate(source) {
    const config = {};
    for (const [key, values] of Object.entries(choices)) {
      const value = source[key];
      if (!Object.hasOwn(values, value)) throw new Error(`Unrecognized value for ${key}.`);
      config[key] = value;
    }
    for (const [key, [min, max, integer]] of Object.entries(settings)) {
      const raw = source[key];
      const value = typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Number(raw) : NaN;
      if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        const error = new Error(`Enter ${integer ? "an integer" : "a number"} between ${min} and ${max}.`);
        error.field = key;
        throw error;
      }
      config[key] = value;
    }
    config.dt = Number(source.dt);
    if (!stepOptions.includes(config.dt)) throw new Error("Select a valid time step.");
    for (const key of ["matrix", "events", "targets", "observe"]) {
      if (typeof source[key] !== "string" || source[key].length > (key === "matrix" ? 30000000 : 200000)) throw new Error(`The text for ${key} is invalid or too long.`);
      config[key] = source[key];
    }
    const { n, dt, model, m, topology, groups, waveform } = config;
    if ((topology === "cluster" && groups > n) || (topology === "lowrank" && config.rank > n)) {
      throw new Error("The number of clusters and the rank cannot exceed the number of neurons.");
    }
    if (m > n && config.observeMode !== "manual") throw new Error(`The readout dimension cannot exceed the network size (${n}).`);
    if (topology === "ei" && config.gain < 0) throw new Error("E/I networks require a nonnegative gain to preserve excitatory and inhibitory output signs.");
    if (model === "lif" && (dt > 1 || config.reset >= config.threshold || config.reversalE <= config.threshold || config.reversalI >= config.threshold || config.gain < 0)) {
      throw new Error("LIF requires a time step ≤ 1 ms, a reset potential below the spike threshold, excitatory and inhibitory reversal potentials above and below the threshold respectively, and a nonnegative conductance gain.");
    }
    const timing = ["total", "warmup", "sample"];
    if (waveform !== "off" && waveform !== "custom") timing.push("onset");
    if (["pulse", "paired", "sine"].includes(waveform)) timing.push("width");
    if (waveform === "paired") timing.push("interval");
    if (model === "lif") timing.push("delay", "refractory");
    for (const key of timing) {
      if (!aligned(config[key], dt)) {
        const error = new Error("This duration must be an integer multiple of the time step.");
        error.field = key;
        throw error;
      }
    }
    if (waveform === "sine" && 1000 / config.frequency < 10 * dt) throw new Error("A sinusoidal period requires at least 10 time steps. Reduce the time step or frequency.");
    const savedValues = (Math.round(config.total / config.sample) + 1) * config.n;
    if (savedValues > 4000000) throw Object.assign(new Error("The full-network recording exceeds 4 million values per trial. Increase Sample interval or shorten Duration."), { field: "sample" });
    if ((config.total + config.warmup) / dt > 80000 || config.total / config.sample > 16000) throw new Error("This simulation exceeds 80,000 time steps or 16,000 samples. Shorten the duration or increase the corresponding interval.");
    if (config.sample > config.total || !aligned(config.total, config.sample)) throw new Error("The recording duration must be an integer multiple of the sample interval and include at least one interval.");
    if (config.sample < dt) throw new Error("The sample interval cannot be shorter than the time step.");
    return config;
  }

  function matrixFromText(config) {
    const { n, matrix, matrixFormat } = config;
    const weights = Array.from({ length: n }, () => new Float64Array(n));
    const lines = matrix.split(/\r?\n/).map((line, index) => [line.split("#")[0].trim(), index + 1]).filter(([line]) => line);
    const parsed = lines.map(([line, index]) => {
      const parts = line.includes(",") ? line.split(",").map(cell => cell.trim()) : line.split(/\s+/);
      const values = parts.map(cell => cell ? Number(cell) : NaN);
      if (values.some(value => !Number.isFinite(value))) throw new Error(`Connectivity row ${index} contains an invalid number.`);
      return [values, index];
    });
    if (matrixFormat === "dense") {
      if (parsed.length !== n || parsed.some(([row]) => row.length !== n)) throw new Error(`Enter a ${n} × ${n} connectivity matrix J with target neurons in rows and source neurons in columns.`);
      parsed.forEach(([row], index) => weights[index].set(row));
    } else {
      const occupied = new Set();
      for (const [[source, target, weight, ...rest], index] of parsed) {
        if (rest.length || ![source, target].every(cell => Number.isInteger(cell) && cell >= 1 && cell <= n) || !Number.isFinite(weight)) {
          throw new Error(`Connectivity row ${index} must contain Source, Target, Weight, with neuron IDs between 1 and ${n}.`);
        }
        const key = (target - 1) * n + source - 1;
        if (occupied.has(key)) throw new Error(`Connectivity row ${index} duplicates an existing edge.`);
        occupied.add(key);
        weights[target - 1][source - 1] = weight;
      }
    }
    return weights;
  }

  function buildNetwork(config) {
    const { n, topology, networkSeed, groups, eiFraction, rank, density, gain, jitter, between, inhibRatio, bulk } = config;
    const rand = random(networkSeed), gaussian = normalSampler(rand);
    const group = Array.from({ length: n }, (_, i) => topology === "ei" ? Number(i >= Math.floor(eiFraction * n)) :
      (topology === "cluster" ? Math.floor(i * groups / n) : 0));
    const groupNames = topology === "ei" ? ["E", "I"] : topology === "cluster" ? Array.from({ length: groups }, (_, i) => `Cluster ${i + 1}`) : ["All"];
    const weights = topology === "custom" ? matrixFromText(config) : Array.from({ length: n }, () => new Float64Array(n));
    const order = Array.from({ length: n }, (_, i) => i);
    if (topology === "chain" || topology === "ring") {
      for (let i = 0; i < n - 1 + Number(topology === "ring"); i++) weights[(i + 1) % n][i] = 1 + jitter * (2 * rand() - 1);
    }
    if (["random", "ei", "cluster", "lowrank"].includes(topology)) {
      const scale = 1 / Math.sqrt(Math.max(1, density * n));
      const patterns = topology === "lowrank" ? Array.from({ length: rank }, () => order.map(() => rand() < 0.5 ? -1 : 1)) : [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (topology === "lowrank") {
            weights[i][j] = patterns.reduce((sum, pattern) => sum + pattern[i] * pattern[j], 0) / n;
          }
          if (i === j || rand() >= density) continue;
          if (topology === "random") weights[i][j] = gaussian() * scale;
          if (topology === "ei") weights[i][j] = (group[j] ? -inhibRatio : 1) * scale * (1 + jitter * (2 * rand() - 1));
          if (topology === "cluster") weights[i][j] = (group[j] === group[i] ? 1 : between) * (1 + jitter * (2 * rand() - 1)) / Math.max(1, density * n / groups);
          if (topology === "lowrank") weights[i][j] += bulk * gaussian() * scale;
        }
      }
    }
    const incoming = weights.map(() => []), outgoing = weights.map(() => []);
    const edges = [];
    let maxAbs = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const value = weights[i][j] *= gain;
        if (Math.abs(value) > (config.model === "lif" ? 10000 : 1000)) throw new Error("An edge weight exceeds the supported range. Check the weight or gain.");
        if (!value) continue;
        incoming[i].push([j, value]);
        outgoing[j].push([i, value]);
        edges.push({ from: j, to: i, value });
        if (edges.length > 250000) throw Object.assign(new Error("This network exceeds 250,000 connections. Reduce connection probability or network size."), { field: "density" });
        maxAbs = Math.max(maxAbs, Math.abs(value));
      }
    }
    const edgeSteps = edges.length * (config.total + config.warmup) / config.dt * (config.model === "lif" ? 1 : 4);
    if (edgeSteps > 1000000000) throw new Error("This run exceeds the connection-update budget. Reduce connection probability or duration, or increase Time step within the model's accuracy requirements.");
    return { weights, incoming, outgoing, edges, maxAbs, group, groupNames, order };
  }

  function chooseObservations(config, network) {
    const { n, m, observeMode, observe, group, observeSeed } = config;
    if (["orthogonal", "gaussian"].includes(observeMode)) {
      if (!Number.isInteger(m) || m < 1 || m > n) throw Object.assign(new Error(`Choose 1–${n} readout channels.`), { field: "m" });
      return Array.from({ length: m }, (_, i) => i);
    }
    if (observeMode === "manual") return parseCells(observe, n);
    const available = network.order.filter(i => observeMode !== "group" || network.group[i] === group - 1);
    if (m > available.length) throw Object.assign(new Error(observeMode === "group" ? `The selected group contains ${available.length} neurons. Reduce Recorded neurons or choose another group.` : `The network contains ${n} neurons. Set Recorded neurons to ${n} or fewer.`), { field: "m" });
    if (observeMode === "spread") return Array.from({ length: m }, (_, i) => available[Math.floor((i + 0.5) * available.length / m)]);
    if (observeMode === "random") {
      const rand = random(observeSeed);
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
    }
    return available.slice(0, m).sort((a, b) => a - b);
  }

  function buildRecording(config, network) {
    const projected = ["orthogonal", "gaussian"].includes(config.observeMode);
    if (projected && config.m * config.n * (config.total / config.sample + 1) > 200000000) throw Object.assign(new Error("This projection is too large. Reduce Readout channels, increase Sample interval, or shorten Duration."), { field: "m" });
    if (config.observeMode === "orthogonal" && config.m * config.m * config.n > 100000000) throw Object.assign(new Error("This orthogonal projection is too large. Reduce Readout channels; the network size can stay unchanged."), { field: "m" });
    const ids = chooseObservations(config, network), n = config.n, m = ids.length;
    const weights = Array.from({ length: m }, () => new Float64Array(n));
    if (!projected) ids.forEach((id, row) => { weights[row][id] = 1; });
    else {
      const gaussian = normalSampler(random(config.observeSeed));
      for (let a = 0; a < m; a++) {
        const row = weights[a];
        if (config.observeMode === "gaussian") {
          for (let i = 0; i < n; i++) row[i] = gaussian() / Math.sqrt(n);
        } else {
          // Gaussian QR with positive diagonal: Haar orthonormal rows, R R^T = I.
          let norm = 0;
          for (let attempt = 0; attempt < 8 && norm < 1e-12; attempt++) {
            for (let i = 0; i < n; i++) row[i] = gaussian();
            for (let pass = 0; pass < 2; pass++) for (let b = 0; b < a; b++) {
              let dot = 0; for (let i = 0; i < n; i++) dot += row[i] * weights[b][i];
              for (let i = 0; i < n; i++) row[i] -= dot * weights[b][i];
            }
            norm = Math.hypot(...row);
          }
          if (!(norm >= 1e-12)) throw new Error("Unable to construct the orthogonal readout; use another recording seed.");
          for (let i = 0; i < n; i++) row[i] /= norm;
        }
      }
    }
    return { mode: config.observeMode, projected, n, m, ids, weights, seed: config.observeSeed };
  }

  function recordingKey(config) {
    return JSON.stringify([config.n, config.m, config.observeMode, config.observe, config.group, config.observeSeed]);
  }

  function record(result, config = result.config) {
    const recording = buildRecording(config, result.network);
    if (!recording.projected) return recording;
    const { n, m, weights } = recording;
    const project = run => {
      const data = new Float64Array(run.points * m), counts = run.counts ? new Float64Array(data.length) : null;
      for (let p = 0; p < run.points; p++) for (let a = 0; a < m; a++) {
        let activity = 0, count = 0;
        for (let i = 0; i < n; i++) {
          activity += weights[a][i] * run.data[p * n + i];
          if (counts) count += weights[a][i] * run.counts[p * n + i];
        }
        data[p * m + a] = activity; if (counts) counts[p * m + a] = count;
      }
      return { data, counts, points: run.points, spikes: null };
    };
    recording.baseline = project(result.baseline);
    recording.stimulated = result.stimulated === result.baseline ? recording.baseline : project(result.stimulated);
    return recording;
  }

  function buildInput(config) {
    const { waveform, targets, width, onset, interval, total, amplitude, n, dt, events, frequency } = config;
    let rows = [];
    if (waveform === "custom") {
      rows = events.split(/\r?\n/).flatMap((raw, index) => {
        const line = raw.split("#")[0].trim();
        if (!line) return [];
        const values = line.split(",").map(part => part.trim());
        if (values.length < 4 || values.slice(0, 3).some(v => !v || !Number.isFinite(Number(v)))) {
          throw new Error(`Stimulus sequence row ${index + 1} must contain Onset, Duration, Amplitude, Target IDs.`);
        }
        return [[Number(values[0]), Number(values[1]), Number(values[2]), parseCells(values.slice(3).join(","), n), "pulse"]];
      });
    } else if (waveform !== "off") {
      const cells = parseCells(targets, n);
      rows = [[onset, waveform === "step" ? total - onset : width, amplitude, cells, waveform]];
      if (waveform === "paired") rows.push([onset + interval, width, amplitude, cells, waveform]);
    }
    return rows.map(([start, duration, strength, cells, shape]) => {
      if (!(start >= 0 && duration > 0 && start + duration <= total + 1e-8) || Math.abs(strength) > 5000) {
        throw new Error("Each stimulus must start and end within the recording interval. The absolute amplitude cannot exceed 5,000.");
      }
      if (!aligned(start, dt) || !aligned(duration, dt)) throw new Error("Each stimulus onset and duration must align with the time step.");
      return { start, end: start + duration, begin: ticks(start, dt), endStep: ticks(start + duration, dt), strength, cells, shape, frequency };
    });
  }

  function eventDrive(event, step, dt) {
    if (step < event.begin || step >= event.endStep) return 0;
    return event.shape === "sine" ? event.strength * Math.sin(2 * Math.PI * (step - event.begin + 0.5) * dt * event.frequency / 1000) : event.strength;
  }

  function stimulusAt(input, step, dt, result) {
    result.fill(0);
    for (const event of input) {
      const drive = eventDrive(event, step, dt);
      if (!drive) continue;
      for (const cell of event.cells) result[cell] += drive;
    }
  }

  function* runSteps(config, network, input, stimulated) {
    const { n, dt, model, tau, total, warmup, sample, bias, initial, noise, noiseTau, shared, noiseSeed, pairing } = config;
    const rng = random(stimulated && pairing === "independent" ? (noiseSeed ^ 0xad4cbb51) >>> 0 : noiseSeed);
    const gaussian = normalSampler(rng);
    const steps = ticks(total, dt), before = ticks(warmup, dt), stride = ticks(sample, dt);
    const data = new Float64Array((steps / stride + 1) * n);
    const counts = model === "lif" ? new Uint16Array(data.length) : null;
    const spikes = model === "lif" ? Array.from({ length: n }, () => []) : null;
    const external = new Float64Array(n), stimulus = new Float64Array(n);
    const independent = Float64Array.from({ length: n }, () => gaussian());
    const state = Float64Array.from({ length: n }, () => (model === "lif" ? config.rest : 0) + initial * gaussian());
    let common = gaussian();
    const rho = Math.exp(-dt / noiseTau), innovation = Math.sqrt(-Math.expm1(-2 * dt / noiseTau));
    const share = Math.sqrt(shared), own = Math.sqrt(1 - shared);
    const activation = model === "tanh" ? Math.tanh : model === "sigmoid" ? value => 1 / (1 + Math.exp(-value)) : value => value;
    const solver = model === "lif" ? lifStep(config, state, network, external, spikes, counts, stride) :
      rateStep(state, network, external, activation, dt, tau);

    function record(step) {
      const offset = step / stride * n;
      for (let i = 0; i < n; i++) data[offset + i] = model === "lif" ? state[i] : activation(state[i]);
    }
    for (let step = -before; step < steps; step++) {
      if (step >= 0 && step % stride === 0) record(step);
      if (stimulated) stimulusAt(input, step, dt, stimulus);
      for (let i = 0; i < n; i++) {
        external[i] = bias + noise * (share * common + own * independent[i]) + stimulus[i];
      }
      solver(step);
      common = rho * common + innovation * gaussian();
      for (let i = 0; i < n; i++) independent[i] = rho * independent[i] + innovation * gaussian();
      if (step % 12 === 0 && state.some(value => !Number.isFinite(value) || Math.abs(value) > 1e7)) {
        throw new Error(`The state exceeded the numerical range at ${(step * dt).toFixed(2)} ms. Reduce the time step first, then check the gain, initial state, and drive.`);
      }
      if (step % 32 === 0) yield (step + before) / (steps + before);
    }
    if (state.some(value => !Number.isFinite(value) || Math.abs(value) > 1e7)) throw new Error("The final state exceeded the numerical range. Check the time step, gain, and drive.");
    record(steps);
    return { data, spikes, counts, points: steps / stride + 1 };
  }

  function rateStep(state, network, input, activation, dt, tau) {
    const n = state.length, h = dt / tau;
    const stage = new Float64Array(n), rates = new Float64Array(n);
    const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n), k4 = new Float64Array(n);
    // Pack incoming edges once, retaining their exact accumulation order.
    const offsets = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + network.incoming[i].length;
    const sources = new Uint32Array(offsets[n]), weights = new Float64Array(offsets[n]);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < network.incoming[i].length; k++) {
        sources[offsets[i] + k] = network.incoming[i][k][0];
        weights[offsets[i] + k] = network.incoming[i][k][1];
      }
    }
    function derivative(x, out) {
      for (let i = 0; i < n; i++) rates[i] = activation(x[i]);
      for (let i = 0; i < n; i++) {
        let value = input[i] - x[i];
        for (let edge = offsets[i]; edge < offsets[i + 1]; edge++) value += weights[edge] * rates[sources[edge]];
        out[i] = value;
      }
    }
    return () => {
      derivative(state, k1);
      for (let i = 0; i < n; i++) stage[i] = state[i] + h * k1[i] / 2;
      derivative(stage, k2);
      for (let i = 0; i < n; i++) stage[i] = state[i] + h * k2[i] / 2;
      derivative(stage, k3);
      for (let i = 0; i < n; i++) stage[i] = state[i] + h * k3[i];
      derivative(stage, k4);
      for (let i = 0; i < n; i++) state[i] += h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    };
  }

  function lifStep(config, state, network, input, events, counts, stride) {
    const { n, dt, rest, reset, threshold, capacitance, leak, tauE, tauI, reversalE, reversalI, refractory, delay, adapt, adaptTau } = config;
    const e = new Float64Array(n), i = new Float64Array(n), a = new Float64Array(n);
    const refracUntil = new Float64Array(n).fill(-Infinity);
    const length = ticks(delay, dt) + 1;
    const queue = Array.from({ length }, () => []);
    const eMid = Math.exp(-dt / (2 * tauE)), iMid = Math.exp(-dt / (2 * tauI)), aMid = Math.exp(-dt / (2 * adaptTau));
    const eDecay = eMid * eMid, iDecay = iMid * iMid, aDecay = aMid * aMid;
    const deadline = ticks(refractory, dt);
    return step => {
      const slot = ((step % length) + length) % length;
      const arriving = queue[slot].splice(0);
      for (const from of arriving) {
        for (const [target, weight] of network.outgoing[from]) {
          if (weight > 0) e[target] += weight;
          else i[target] -= weight;
        }
      }
      for (let cell = 0; cell < n; cell++) {
        const ge = e[cell] * eMid, gi = i[cell] * iMid, ad = a[cell] * aMid;
        e[cell] *= eDecay;
        i[cell] *= iDecay;
        a[cell] *= aDecay;
        if (step < refracUntil[cell]) {
          state[cell] = reset;
          continue;
        }
        const conductance = leak + ge + gi;
        const vInf = (leak * rest + ge * reversalE + gi * reversalI + input[cell] - ad) / conductance;
        const voltage = vInf + (state[cell] - vInf) * Math.exp(-dt * conductance / capacitance);
        if (voltage < threshold) {
          state[cell] = voltage;
          continue;
        }
        state[cell] = reset;
        const end = step + 1;
        refracUntil[cell] = end + deadline;
        a[cell] += adapt;
        queue[slot].push(cell);
        if (end > 0) {
          events[cell].push(end * dt);
          counts[Math.ceil(end / stride) * n + cell]++;
        }
      }
    };
  }

  function prepare(source) {
    const config = validate(source), network = buildNetwork(config);
    chooseObservations(config, network);
    const input = buildInput(config);
    return { config, network, input };
  }

  function finish(iterator, progress) {
    let state;
    do {
      state = iterator.next();
      if (!state.done && progress) progress(state.value);
    } while (!state.done);
    return state.value;
  }

  function simulate(source, progress) {
    const { config, network, input } = prepare(source);
    const pairedRuns = input.length > 0 || config.pairing === "independent";
    const baseline = finish(runSteps(config, network, input, false), progress && (fraction => progress(fraction / (pairedRuns ? 2 : 1))));
    const stimulated = pairedRuns ? finish(runSteps(config, network, input, true), progress && (fraction => progress((1 + fraction) / 2))) : baseline;
    return { config, network, input, baseline, stimulated };
  }

  async function simulateAsync(source, signal, progress) {
    const { config, network, input } = prepare(source);
    const pairedRuns = input.length > 0 || config.pairing === "independent";
    async function integrate(stimulated) {
      const iter = runSteps(config, network, input, stimulated);
      let state, checkpoint = performance.now();
      do {
        signal.throwIfAborted();
        state = iter.next();
        if (!state.done && performance.now() - checkpoint > 13) {
          progress(((stimulated ? 1 : 0) + state.value) / (pairedRuns ? 2 : 1));
          await new Promise(resolve => setTimeout(resolve, 0));
          checkpoint = performance.now();
        }
      } while (!state.done);
      return state.value;
    }
    const baseline = await integrate(false);
    const stimulated = pairedRuns ? await integrate(true) : baseline;
    signal.throwIfAborted();
    return { config, network, input, baseline, stimulated };
  }

  function covariance(samples) {
    if (samples.length < 2) throw new Error("At least two samples or two complete windows are required.");
    const d = samples[0].length;
    const matrix = Array.from({ length: d }, () => new Float64Array(d));
    const mean = new Float64Array(d), diff = new Float64Array(d);
    for (let t = 0; t < samples.length; t++) {
      const row = samples[t];
      for (let i = 0; i < d; i++) {
        diff[i] = row[i] - mean[i];
        mean[i] += diff[i] / (t + 1);
      }
      const k = t / (t + 1);
      for (let i = 0; i < d; i++) {
        for (let j = 0; j <= i; j++) matrix[i][j] += k * diff[i] * diff[j];
      }
    }
    for (let i = 0; i < d; i++) {
      for (let j = 0; j <= i; j++) matrix[j][i] = matrix[i][j] /= samples.length - 1;
    }
    return matrix;
  }

  function eigenspectrum(matrix) {
    const a = matrix.map(row => Float64Array.from(row)), n = a.length;
    const scale = Math.max(...a.map((row, i) => Math.abs(row[i])));
    if (scale === 0) return Array(n).fill(0);
    const tolerance = Math.max(Number.MIN_VALUE, 2e-14 * scale);
    for (let sweep = 0; sweep < 30; sweep++) {
      let changed = false;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const coupling = a[p][q];
          if (Math.abs(coupling) <= tolerance) continue;
          changed = true;
          const ratio = (a[q][q] - a[p][p]) / (2 * coupling);
          const t = (ratio >= 0 ? 1 : -1) / (Math.abs(ratio) + Math.hypot(ratio, 1));
          const c = 1 / Math.hypot(t, 1), s = t * c;
          a[p][p] -= t * coupling;
          a[q][q] += t * coupling;
          a[p][q] = a[q][p] = 0;
          for (let k = 0; k < n; k++) {
            if (k === p || k === q) continue;
            const x = a[k][p], y = a[k][q];
            a[p][k] = a[k][p] = c * x - s * y;
            a[q][k] = a[k][q] = s * x + c * y;
          }
        }
      }
      if (!changed) break;
    }
    return a.map((row, i) => Math.abs(row[i]) <= tolerance ? 0 : row[i]).sort((x, y) => y - x);
  }

  function measure(result, ids, options) {
    const recording = options.recording;
    if (recording?.projected) result = { ...result, config: { ...result.config, n: recording.m }, baseline: recording.baseline, stimulated: recording.stimulated };
    if (ids.length > 192) throw new Error("Covariance supports up to 192 readout channels. Reduce Recording for this analysis; all simulated neurons remain in the network.");
    const { config, baseline, stimulated } = result;
    const { n, sample, total } = config;
    const { start, end, window, kind, condition } = options;
    if (!(start >= 0 && end > start && end <= total && aligned(start, sample) && aligned(end, sample))) {
      throw new Error(`Choose an analysis interval within 0–${total} ms, with boundaries aligned to the ${sample} ms sample interval.`);
    }
    const first = ticks(start, sample), last = ticks(end, sample);
    const isSpike = kind === "spike", isPoint = kind === "point", integrated = kind === "integrated";
    if (!isPoint && !(window >= sample && aligned(window, sample))) throw new Error(`The window duration must be a positive integer multiple of the ${sample} ms sample interval.`);
    if (isSpike && !baseline.counts) throw new Error("The current model does not generate spikes.");
    const size = isPoint ? 1 : ticks(window, sample), samples = [];
    const read = (run, p, i) => (isSpike ? run.counts : run.data)[p * n + i];
    const get = (p, i) => condition === "baseline" ? read(baseline, p, i) :
      condition === "stimulated" ? read(stimulated, p, i) : read(stimulated, p, i) - read(baseline, p, i);
    for (let p = first; p + (isPoint ? 0 : size) <= last; p += size) {
      samples.push(ids.map(i => {
        if (isPoint) return get(p, i);
        let accum = 0;
        for (let j = 0; j < size; j++) accum += get(p + j + Number(isSpike), i);
        return accum * (isSpike ? 1000 / window : integrated ? Math.sqrt(window / 1000) / size : 1 / size);
      }));
    }
    const matrix = covariance(samples), spectrum = eigenspectrum(matrix);
    const trace = spectrum.reduce((sum, v) => sum + v, 0);
    const square = spectrum.reduce((sum, v) => sum + v * v, 0);
    return { matrix, spectrum, dimensions: square > 0 ? trace * trace / square : null, samples: samples.length };
  }

  const value = (run, n, sample, cell) => run.data[sample * n + cell];
  const api = { models, topologies, waveforms, sampling, settings, presets, stepOptions, choices, defaults, preset, validate, buildNetwork, chooseObservations, buildRecording, recordingKey, record, buildInput, stimulusAt, eventDrive, parseCells, prepare, simulate, simulateAsync, value, random, covariance, eigenspectrum, measure };
  // The worker uses this very same model, including in offline file:// pages.
  Object.defineProperty(api, "workerSource", { value: () => `(${defineNeuroModel.toString()})();` });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.NeuroModel = api;
})();
