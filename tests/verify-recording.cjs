"use strict";

// Independent scientific contracts for the readout implementation.
// Run: node verify-recording.cjs
// Reference: Hu & Sompolinsky (2022), S1 Text, Section I, pp. 30–32.
// No assertion below equates two finite random readouts or imposes the
// paper's asymptotic participation-ratio trend on every selected subset.
const assert = require("node:assert/strict");
const M = require("../dist/model.js");

let cases = 0;
const diagnostic = {};
const range = n => Array.from({ length: n }, (_, i) => i);
const sum = a => a.reduce((s, x) => s + x, 0);
const dot = (a, b) => sum(Array.from(a, (x, i) => x * b[i]));
const transpose = a => range(a[0].length).map(j => a.map(row => row[j]));
const product = (a, b) => {
  const columns = transpose(b);
  return a.map(row => columns.map(column => dot(row, column)));
};
const identity = n => range(n).map(i => range(n).map(j => Number(i === j)));
const trace = a => sum(a.map((row, i) => row[i]));
const frobenius2 = a => sum(a.map(row => dot(row, row)));
const covarianceReadout = (r, c) => product(product(r, c), transpose(r));
const participation = c => frobenius2(c) ? trace(c) ** 2 / frobenius2(c) : null;
const gramError = r => {
  const g = product(r, transpose(r));
  return sum(g.map((row, i) => sum(row.map((x, j) => (x - Number(i === j)) ** 2)))) / r.length;
};

function near(actual, expected, label, atol = 2e-10, rtol = 2e-11) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: nonfinite value`);
  assert.ok(Math.abs(actual - expected) <= atol + rtol * Math.abs(expected),
    `${label}: ${actual} != ${expected} (atol ${atol}, rtol ${rtol})`);
}

function matrixNear(actual, expected, label, atol = 2e-10, rtol = 2e-11) {
  assert.equal(actual.length, expected.length, `${label}: row count`);
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i].length, expected[i].length, `${label}: column count at row ${i}`);
    for (let j = 0; j < expected[i].length; j++) near(actual[i][j], expected[i][j], `${label} [${i},${j}]`, atol, rtol);
  }
}

function vectorNear(actual, expected, label, atol = 2e-10, rtol = 2e-11) {
  assert.equal(actual.length, expected.length, `${label}: length`);
  actual.forEach((value, i) => near(value, expected[i], `${label} [${i}]`, atol, rtol));
}

function maximumDifference(a, b) {
  return Math.max(...a.flatMap((row, i) => Array.from(row, (x, j) => Math.abs(x - b[i][j]))));
}

function check(name, fn) {
  fn();
  cases++;
  console.log(`Readout passed: ${name}`);
}

function config(overrides = {}) {
  return M.validate({
    ...M.defaults, model: "linear", topology: "random", n: 7, m: 3,
    gain: 0.35, density: 0.6, waveform: "off", total: 80, warmup: 0,
    dt: 0.5, sample: 2, targets: "1", observe: "1-3", observeMode: "first",
    ...overrides
  });
}

function readout(n, m, mode, seed = 3113) {
  const c = config({ n, m, observeMode: mode, observeSeed: seed });
  return M.buildRecording(c, M.buildNetwork(c));
}

// Two-pass sample covariance is independent of the model's online recurrence.
function referenceCovariance(samples) {
  assert.ok(samples.length >= 2);
  const d = samples[0].length;
  const mean = range(d).map(i => sum(samples.map(row => row[i])) / samples.length);
  return range(d).map(i => range(d).map(j =>
    sum(samples.map(row => (row[i] - mean[i]) * (row[j] - mean[j]))) / (samples.length - 1)));
}

// A finite algebra fixture, not a physiological LIF simulation. Nonzero means,
// shared oscillations and nonuniform spike-bin counts exercise centering and
// signed mixing. Isolated early bins expose negative readout coefficients.
function fixture(n = 7) {
  const c = config({ n, m: Math.min(n, 3), model: "lif" });
  const points = c.total / c.sample + 1;
  function run(stimulated) {
    const data = new Float64Array(points * n), counts = new Uint16Array(points * n);
    const spikes = range(n).map(() => []);
    for (let p = 0; p < points; p++) {
      for (let i = 0; i < n; i++) {
        const wave = Math.sin((p + 1) * 0.31) + 0.23 * Math.cos(p * (i + 1) * 0.17);
        data[p * n + i] = -64 + 2.1 * i + (0.7 + i * 0.3) * wave + 0.007 * p * p / (i + 1)
          + (stimulated ? 0.8 + 0.12 * p * Math.cos(i + p * 0.07) : 0);
        let count = p > 0 && p <= n ? Number(i === p - 1) : Number(p > n && (p * (i + 2) + i) % 9 < 2);
        if (stimulated && p > n && (p + 2 * i) % 11 === 0) count++;
        counts[p * n + i] = count;
        for (let k = 0; k < count; k++) spikes[i].push(p * c.sample);
      }
    }
    return { data, counts, points, spikes };
  }
  return { config: c, network: M.buildNetwork(c), input: [], baseline: run(false), stimulated: run(true) };
}

// Independently assemble the documented time windows. Continuous samples use
// [left, right), while spike bins represent (left, right]. Trailing incomplete
// windows are omitted. Integrated covariance is scaled after covariance below.
function referenceSamples(result, options) {
  const { config: c, baseline, stimulated } = result;
  const { kind, condition, start, end, window } = options;
  const read = (run, p, i) => (kind === "spike" ? run.counts : run.data)[p * c.n + i];
  const value = (p, i) => condition === "baseline" ? read(baseline, p, i) :
    condition === "stimulated" ? read(stimulated, p, i) : read(stimulated, p, i) - read(baseline, p, i);
  if (kind === "point") {
    return range(Math.round((end - start) / c.sample) + 1)
      .map(k => range(c.n).map(i => value(Math.round(start / c.sample) + k, i)));
  }
  const count = Math.floor((end - start) / window), stride = Math.round(window / c.sample);
  return range(count).map(k => range(c.n).map(i => {
    const left = Math.round((start + k * window) / c.sample);
    const entries = range(stride).map(j => value(left + j + Number(kind === "spike"), i));
    return sum(entries) / (kind === "spike" ? window / 1000 : stride);
  }));
}

function referenceMatrix(result, options) {
  const c = referenceCovariance(referenceSamples(result, options));
  return options.kind === "integrated" ? c.map(row => row.map(x => x * options.window / 1000)) : c;
}

check("public API and coordinate-selection compatibility", () => {
  for (const name of ["buildRecording", "record", "measure"]) assert.equal(typeof M[name], "function", name);
  const c = config({ n: 12, m: 3, topology: "cluster", groups: 3 });
  const network = M.buildNetwork(c);
  const expected = {
    first: [0, 1, 2], spread: [2, 6, 10], manual: [10, 1, 6], group: [4, 5, 6]
  };
  for (const mode of Object.keys(expected)) {
    const r = M.buildRecording({ ...c, observeMode: mode, observe: "11,2,7", group: 2 }, network);
    assert.equal(r.projected, false);
    assert.deepEqual(r.ids, expected[mode]);
    assert.equal(r.n, 12);
    assert.equal(r.m, 3);
    r.weights.forEach((row, a) => {
      assert.ok(row instanceof Float64Array);
      assert.deepEqual([...row], range(12).map(i => Number(i === expected[mode][a])));
    });
    matrixNear(product(r.weights, transpose(r.weights)), identity(3), `${mode}: coordinate Gram`);
  }
  const full = M.buildRecording({ ...c, observeMode: "random", m: c.n }, network);
  assert.deepEqual(full.ids, range(c.n));
  assert.throws(() => M.validate({ ...c, m: 13, observeMode: "orthogonal" }), /exceed|channels|size/i);
  assert.throws(() => M.validate({ ...c, m: 13, observeMode: "gaussian" }), /exceed|channels|size/i);
});

check("random neuron sampling is reproducible and without replacement", () => {
  const n = 11, m = 4, trials = 512, hits = Array(n).fill(0);
  const c = config({ n, m, observeMode: "random" }), network = M.buildNetwork(c);
  for (let seed = 0; seed < trials; seed++) {
    const r = M.buildRecording({ ...c, observeSeed: seed }, network);
    assert.equal(new Set(r.ids).size, m);
    for (const id of r.ids) { assert.ok(id >= 0 && id < n); hits[id]++; }
    if (seed < 3) assert.deepEqual(r, M.buildRecording({ ...c, observeSeed: seed }, network));
  }
  const expectation = trials * m / n;
  const tolerance = 6 * Math.sqrt(trials * (m / n) * (1 - m / n));
  hits.forEach((v, i) => near(v, expectation, `uniform inclusion neuron ${i}`, tolerance, 0));
  diagnostic.randomInclusionCounts = hits;
});

check("Haar rows and the corresponding full-space projector", () => {
  for (const [n, m] of [[1, 1], [17, 1], [17, 6], [17, 17], [96, 96]]) {
    for (const seed of [0, 4294967295]) {
      const r = readout(n, m, "orthogonal", seed);
      assert.equal(r.projected, true);
      assert.deepEqual(r.ids, range(m));
      assert.ok(r.weights.every(row => row instanceof Float64Array && row.length === n));
      matrixNear(product(r.weights, transpose(r.weights)), identity(m), `RR^T n=${n},m=${m}`, 3e-12, 0);
      const p = product(transpose(r.weights), r.weights);
      matrixNear(p, transpose(p), "projector symmetry", 3e-12, 0);
      matrixNear(product(p, p), p, "projector idempotence", 5e-12, 0);
      near(trace(p), m, "projector rank from trace", 1e-10, 0);
    }
  }
});

check("Haar orientation is dense, signed and statistically isotropic", () => {
  const n = 13, m = 4, trials = 512;
  const averageProjector = range(n).map(() => Array(n).fill(0));
  let z1 = 0, z4 = 0, positive = 0, dense = 0, count = 0;
  for (let seed = 0; seed < trials; seed++) {
    const r = readout(n, m, "orthogonal", seed).weights;
    const p = product(transpose(r), r);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) averageProjector[i][j] += p[i][j] / trials;
    for (const row of r) for (const x of row) {
      const z = x * Math.sqrt(n);
      z1 += z; z4 += z ** 4; positive += Number(x > 0); dense += Number(Math.abs(x) > 1e-6); count++;
    }
  }
  matrixNear(averageProjector, identity(n).map(row => row.map(x => x * m / n)), "E[R^T R]", 0.05, 0);
  near(z1 / count, 0, "Haar coefficient mean", 0.04, 0);
  near(z4 / count, 3 * n / (n + 2), "Haar fourth moment", 0.18, 0);
  near(positive / count, 0.5, "Haar sign balance", 0.025, 0);
  assert.ok(dense / count > 0.999, "Haar projection must not collapse to coordinate selection");
  diagnostic.haar = { standardizedMean: z1 / count, standardizedFourthMoment: z4 / count, positiveFraction: positive / count };
});

check("Gaussian variance 1/N and non-orthonormality are retained", () => {
  const n = 32, m = 8, trials = 256;
  let s1 = 0, s2 = 0, s4 = 0, positive = 0, count = 0, pair = 0, pairs = 0;
  let rowDeviation2 = 0, rows = 0, averageGramError = 0;
  for (let seed = 0; seed < trials; seed++) {
    const r = readout(n, m, "gaussian", seed).weights;
    averageGramError += gramError(r) / trials;
    for (const row of r) {
      const norm2 = dot(row, row);
      rowDeviation2 += (norm2 - 1) ** 2; rows++;
      for (let i = 0; i < row.length; i++) {
        const z = row[i] * Math.sqrt(n);
        s1 += z; s2 += z * z; s4 += z ** 4; positive += Number(z > 0); count++;
        if (i % 2 === 0) { pair += n * row[i] * row[i + 1]; pairs++; }
      }
    }
  }
  near(s1 / count, 0, "Gaussian standardized mean", 0.025, 0);
  near(s2 / count, 1, "Gaussian variance times N", 0.035, 0);
  near(s4 / count, 3, "Gaussian standardized fourth moment", 0.18, 0);
  near(pair / pairs, 0, "independent coefficient pair product", 0.035, 0);
  near(positive / count, 0.5, "Gaussian sign balance", 0.02, 0);
  near(rowDeviation2 / rows, 2 / n, "Gaussian squared row-norm error", 0.02, 0);
  near(averageGramError, (m + 1) / n, "E[||RR^T-I||_F^2/m]", 0.045, 0);
  assert.ok(rowDeviation2 / rows > 0.025, "normalizing rows would erase the required Gaussian norm variability");
  diagnostic.gaussian = {
    standardizedMean: s1 / count, varianceTimesN: s2 / count,
    standardizedFourthMoment: s4 / count, averageGramError, expectedGramError: (m + 1) / n
  };
});

check("Gaussian near-orthogonality depends on the channel fraction", () => {
  const average = (n, m) => sum(range(96).map(seed => gramError(readout(n, m, "gaussian", seed).weights))) / 96;
  const small = average(96, 2), fixed32 = average(32, 8), fixed64 = average(64, 16);
  near(small, 3 / 96, "small-fraction Gram error", 0.012, 0);
  near(fixed32, 9 / 32, "fixed fraction, N=32", 0.055, 0);
  near(fixed64, 17 / 64, "fixed fraction, N=64", 0.045, 0);
  assert.ok(fixed32 > 4 * small && fixed64 > 4 * small);
  assert.ok(fixed64 > 0.15, "fixed m/N must not converge to exact orthogonality just by increasing N");
  diagnostic.gaussianFractions = { small, fixed32, fixed64 };
});

check("isotropic and full-dimensional covariance boundaries", () => {
  const n = 7, lambda = [0.2, 0.7, 1.3, 4.9, 12, 17, 29];
  const c = range(n).map(i => range(n).map(j => i === j ? lambda[i] : 0));
  const r = readout(n, n, "orthogonal").weights;
  const projected = covarianceReadout(r, c);
  vectorNear(M.eigenspectrum(projected), [...lambda].sort((a, b) => b - a), "full Haar eigenvalues", 2e-9);
  near(trace(projected), trace(c), "full Haar trace");
  near(frobenius2(projected), frobenius2(c), "full Haar Frobenius norm");
  near(participation(projected), participation(c), "full Haar participation ratio");
  const partial = readout(n, 3, "orthogonal").weights;
  matrixNear(covarianceReadout(partial, identity(n)), identity(3), "orthogonal isotropic covariance");

  const gaussian = readout(n, n, "gaussian").weights;
  const gaussianIsotropic = covarianceReadout(gaussian, identity(n));
  matrixNear(gaussianIsotropic, product(gaussian, transpose(gaussian)), "Gaussian isotropic covariance is its Gram matrix");
  assert.ok(maximumDifference(gaussianIsotropic, identity(n)) > 0.1);
  const gc = covarianceReadout(gaussian, c);
  assert.ok(Math.abs(participation(gc) - participation(c)) > 0.1, "this fixed Gaussian draw distorts full-dimensional PR");
  assert.ok(Math.max(...M.eigenspectrum(gc).map((v, i) => Math.abs(v - [...lambda].sort((a, b) => b - a)[i]))) > 0.5);

  const subset = readout(n, 3, "random").weights;
  const mix = readout(n, 3, "orthogonal").weights;
  const gauss = readout(n, 3, "gaussian").weights;
  const spectra = [subset, mix, gauss].map(a => M.eigenspectrum(covarianceReadout(a, c)));
  for (let i = 0; i < spectra.length; i++) for (let j = 0; j < i; j++) {
    assert.ok(Math.max(...spectra[i].map((x, k) => Math.abs(x - spectra[j][k]))) > 0.01,
      "a fixed anisotropic covariance is a counterexample to samplewise equivalence of the methods");
  }
});

check("Cobs = R C R^T for all four estimators and all conditions", () => {
  const result = fixture(), before = structuredClone(result);
  const all = range(result.config.n), options = { start: 6, end: 78, window: 10 };
  for (const mode of ["first", "manual", "random", "orthogonal", "gaussian"]) {
    const r = M.record(result, { ...result.config, observeMode: mode, observe: "7,2,5", m: 3, observeSeed: 3113 });
    for (const kind of ["point", "mean", "integrated", "spike"]) {
      for (const condition of ["baseline", "stimulated", "delta"]) {
        const opts = { ...options, kind, condition };
        const reference = referenceMatrix(result, opts);
        const full = M.measure(result, all, opts);
        const observed = M.measure(result, r.ids, { ...opts, recording: r });
        matrixNear(full.matrix, reference, `independent full ${kind}/${condition}`, 3e-9);
        matrixNear(observed.matrix, covarianceReadout(r.weights, reference), `${mode}: ${kind}/${condition}`, 3e-9);
        matrixNear(observed.matrix, covarianceReadout(r.weights, full.matrix), `${mode}: finite covariance identity`, 3e-9);
        assert.equal(observed.samples, kind === "point" ? 37 : 7);
        near(observed.dimensions, participation(observed.matrix), `${mode}: PR`, 2e-9);
        const channelSamples = referenceSamples(result, opts).map(row => r.weights.map(weights => dot(weights, row)));
        let directlyEstimated = referenceCovariance(channelSamples);
        if (kind === "integrated") directlyEstimated = directlyEstimated.map(row => row.map(x => x * options.window / 1000));
        matrixNear(observed.matrix, directlyEstimated, `${mode}: projected sample centering`, 3e-9);
      }
    }
  }
  assert.deepEqual(result, before, "reading, projecting and estimating must not mutate the original data");
});

check("signed LIF mixtures retain counts without creating spike events", () => {
  const result = fixture(), beforeSpikes = structuredClone([result.baseline.spikes, result.stimulated.spikes]);
  for (const mode of ["orthogonal", "gaussian"]) {
    const r = M.record(result, { ...result.config, observeMode: mode, m: 3, observeSeed: 3113 });
    for (const name of ["baseline", "stimulated"]) {
      const original = result[name], projected = r[name];
      assert.equal(projected.spikes, null, "a mixed channel has no biological spike timestamps");
      assert.ok(projected.data instanceof Float64Array);
      assert.ok(projected.counts instanceof Float64Array, "signed mixtures cannot be stored as unsigned counts");
      assert.equal(projected.points, original.points);
      assert.equal(projected.data.length, original.points * r.m);
      assert.ok(projected.counts.some(value => value < -1e-8), "isolated bins should expose negative channel weights");
      assert.ok(projected.counts.some(value => Math.abs(value - Math.round(value)) > 1e-6), "mixed counts need not be integers");
      for (let p = 0; p < original.points; p++) for (let a = 0; a < r.m; a++) {
        const row = r.weights[a];
        near(projected.data[p * r.m + a], dot(row, original.data.subarray(p * r.n, (p + 1) * r.n)), "projected continuous value");
        near(projected.counts[p * r.m + a], dot(row, original.counts.subarray(p * r.n, (p + 1) * r.n)), "projected bin count");
      }
    }
  }
  assert.deepEqual([result.baseline.spikes, result.stimulated.spikes], beforeSpikes);
  const selected = M.record(result, { ...result.config, observeMode: "manual", observe: "7,2,5" });
  assert.equal(selected.projected, false);
  assert.ok(selected.baseline === undefined || selected.baseline === result.baseline, "subsampling need not copy full trajectories");
});

check("the readout seed is independent of network and dynamical seeds", () => {
  const base = config({ n: 8, m: 3, model: "tanh", total: 40, sample: 1, warmup: 10,
    waveform: "pulse", onset: 10, width: 10, noise: 0.1, initial: 0.1 });
  const original = M.simulate(base);
  for (const mode of ["random", "orthogonal", "gaussian"]) {
    const a = { ...base, observeMode: mode, observeSeed: 73 };
    const r = M.record(original, a);
    const changedNonReadout = M.buildRecording({ ...a, networkSeed: 12, noiseSeed: 34, gain: 0.4 }, original.network);
    assert.deepEqual(r.weights, changedNonReadout.weights);
    assert.deepEqual(r.weights, M.record(original, JSON.parse(JSON.stringify(a))).weights, "JSON configuration replay");
    assert.notDeepEqual(r.weights, M.record(original, { ...a, observeSeed: 74 }).weights);
    const snapshot = structuredClone(r);
    M.record(original, { ...a, m: 5, observeSeed: 99 });
    assert.deepEqual(r, snapshot, "a stored reference descriptor must survive a later readout");

    for (const seed of [73, 74]) {
      const rerun = M.simulate({ ...a, observeSeed: seed });
      assert.deepEqual(rerun.network, original.network);
      assert.deepEqual(rerun.baseline, original.baseline);
      assert.deepEqual(rerun.stimulated, original.stimulated);
    }
  }
  const projectedDefault = M.simulate({ ...base, observeMode: "orthogonal", observeSeed: 73 });
  assert.deepEqual(M.record(projectedDefault), M.record(projectedDefault, projectedDefault.config));
});

check("zero-variance, finite-rank and short-window boundaries", () => {
  const result = fixture();
  const r = M.record(result, { ...result.config, observeMode: "orthogonal", m: result.config.n });
  const limited = M.measure(result, r.ids, { start: 0, end: 6, window: 2, kind: "point", condition: "baseline", recording: r });
  assert.equal(limited.samples, 4);
  const numericalZero = 1e-9 * Math.max(1, ...limited.spectrum.map(Math.abs));
  assert.ok(limited.spectrum.filter(x => x > numericalZero).length <= 3, "centering M samples leaves rank at most M-1");
  assert.ok(limited.dimensions <= 3 + 1e-8);
  for (const end of [10, 20]) assert.throws(() => M.measure(result, r.ids,
    { start: 0, end, window: 20, kind: "mean", condition: "baseline", recording: r }), /two samples|two complete windows/i);

  const constant = fixture(4);
  for (const name of ["baseline", "stimulated"]) {
    for (let p = 0; p < constant[name].points; p++) for (let i = 0; i < 4; i++) constant[name].data[p * 4 + i] = -63 + i;
    constant[name].counts.fill(0);
    constant[name].spikes = range(4).map(() => []);
  }
  for (const mode of ["orthogonal", "gaussian"]) {
    const rec = M.record(constant, { ...constant.config, observeMode: mode, m: 3 });
    for (const kind of ["point", "mean", "integrated", "spike"]) {
      const out = M.measure(constant, rec.ids, { start: 0, end: 80, window: 10, kind, condition: "baseline", recording: rec });
      matrixNear(out.matrix, identity(3).map(row => row.map(() => 0)), `constant ${mode}/${kind}`, 1e-22, 0);
      assert.equal(out.dimensions, null, "PR is undefined when total variance is zero");
    }
  }
});

check("finite subsets need not obey the asymptotic dimension trend", () => {
  const c = [[100, 0, 0], [0, 1, 0], [0, 0, 1]];
  const selected = covarianceReadout([[0, 1, 0], [0, 0, 1]], c);
  near(participation(c), 102 ** 2 / 10002, "full PR counterexample");
  near(participation(selected), 2, "selected PR counterexample");
  assert.ok(participation(selected) > participation(c), "absolute PR can increase for this particular subset");
});

console.log(`All ${cases} recording contract checks passed.`);
console.log(JSON.stringify(diagnostic, null, 2));
