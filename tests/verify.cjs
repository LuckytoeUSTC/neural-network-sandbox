"use strict";
const assert = require("node:assert/strict");
const M = require("../dist/model.js");

const equal = (a, b) => assert.deepEqual(a, b);
const near = (value, expected, tolerance = 1e-10) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} != ${expected}`);
const present = (net, i, j) => net.weights[i][j] !== 0;

async function verify() {
  const config = name => M.validate(M.preset(name));
  const network = name => M.buildNetwork(config(name));
  const ring = network("ring");
  const chain = network("chain");
  for (const [net, wrap] of [[ring, true], [chain, false]]) {
    equal(net.edges.length, net.weights.length - Number(!wrap));
    for (let i = 0; i < net.weights.length; i++) {
      for (let j = 0; j < net.weights.length; j++) {
        assert.equal(present(net, i, j), i === j + 1 || (wrap && i === 0 && j === net.weights.length - 1));
      }
    }
  }
  const ei = network("ei");
  assert.ok(ei.edges.some(({ value }) => value < 0));
  assert.ok(ei.edges.some(({ value }) => value > 0));
  for (const edge of ei.edges) assert.equal(Math.sign(edge.value), ei.group[edge.from] ? -1 : 1);
  const lowrank = config("lowrank");
  const structured = M.buildNetwork({ ...lowrank, bulk: 0, rank: 1 });
  const w = structured.weights;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) near(w[i][j] * w[0][0], w[i][0] * w[0][j]);
  const clusters = network("clusters");
  for (const e of clusters.edges) assert.equal(Math.sign(e.value), clusters.group[e.from] === clusters.group[e.to] ? 1 : -1);

  const custom = { ...config("ring"), n: 4, m: 2, topology: "custom", gain: 1.25, matrix: "1,4,1\n4,2,-0.5\n2,2,0.25" };
  const customNetwork = M.buildNetwork(custom);
  near(customNetwork.weights[3][0], 1.25);
  near(customNetwork.weights[1][3], -0.625);
  const dense = M.buildNetwork({ ...custom, gain: 1, matrixFormat: "dense", matrix: customNetwork.weights.map(row => Array.from(row).join(",")).join("\n") });
  equal(dense.weights, customNetwork.weights);
  equal(M.parseCells("1, 3-4, 3", 4), [0, 2, 3]);
  assert.throws(() => M.parseCells("1,9", 4), /between 1 and 4/);
  assert.throws(() => M.buildNetwork({ ...custom, matrix: "1,4,1\n1,4,2" }), /duplicates/);
  assert.throws(() => M.validate({ ...custom, sample: 3 }), /integer multiple/);
  assert.throws(() => M.simulate({ ...custom, waveform: "paired", onset: 970, interval: 200 }), /start and end/);
  assert.throws(() => M.simulate({ ...custom, waveform: "custom", events: "10,15,1,9" }), /between 1 and 4/);
  equal(M.chooseObservations({ ...custom, observeMode: "manual", observe: "4,2" }, customNetwork), [3, 1]);
  equal(M.chooseObservations({ ...custom, observeMode: "random", m: 4 }, customNetwork), [0, 1, 2, 3]);
  equal(M.chooseObservations({ ...config("ei"), observeMode: "group", group: 2, m: 3 }, ei), [51, 52, 53]);

  const add = { ...custom, waveform: "custom", events: "120,40,0.9,1 2\n130,10,-0.2,2 3" };
  const stimulus = new Float64Array(4), compiled = M.buildInput(add);
  M.stimulusAt(compiled, 130 / add.dt, add.dt, stimulus);
  [0.9, 0.7, -0.2, 0].forEach((expected, i) => near(stimulus[i], expected));
  M.stimulusAt(compiled, 140 / add.dt, add.dt, stimulus);
  equal([...stimulus], [0.9, 0.9, 0, 0]);
  for (const waveform of ["off", "step", "pulse", "sine", "paired"]) M.simulate({ ...custom, waveform });

  for (const name of Object.keys(M.presets)) {
    const source = config(name);
    const a = M.simulate(source);
    const b = M.simulate(JSON.parse(JSON.stringify(source)));
    equal(a.network.weights, b.network.weights);
    equal(a.stimulated.data, b.stimulated.data);
    equal(a.stimulated.spikes, b.stimulated.spikes);
    const observed = M.chooseObservations(source, a.network);
    assert.equal(a.stimulated.points, source.total / source.sample + 1);
    equal(a.baseline.data.slice(0, (source.onset / source.sample + 1) * source.n), a.stimulated.data.slice(0, (source.onset / source.sample + 1) * source.n));
    if (source.waveform === "off") assert.equal(a.baseline, a.stimulated);
    else assert.notDeepEqual(a.baseline.data, a.stimulated.data);
    if (source.model === "lif") {
      assert.ok(a.stimulated.spikes.some(row => row.length > 0));
      for (let cell = 0; cell < source.n; cell++) {
        let count = 0;
        for (let p = 1; p < a.stimulated.points; p++) count += a.stimulated.counts[p * source.n + cell];
        assert.equal(count, a.stimulated.spikes[cell].length);
      }
    }
    const statistics = M.measure(a, observed, { start: 0, end: source.total, window: 20, condition: "baseline", kind: source.model === "lif" ? "spike" : "point" });
    assert.equal(statistics.spectrum.length, observed.length);
    assert.ok(statistics.spectrum.at(-1) >= 0);
    console.log("Deterministic preset and finite readouts:", name);
  }

  const original = M.preset("ring");
  const asyncRun = await M.simulateAsync(original, new AbortController().signal, () => {});
  equal(asyncRun.stimulated.data, M.simulate(original).stimulated.data);
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(M.simulateAsync(original, stopped.signal, () => {}), { name: "AbortError" });
  const independent = M.simulate({ ...original, waveform: "off", pairing: "independent" });
  assert.notDeepEqual(independent.baseline.data, independent.stimulated.data);
  console.log("All topology, input, observation, replay, asynchronous and error checks passed.");
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
