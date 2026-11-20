"use strict";
const { chromium } = require("playwright");
const { readFile, writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

async function benchmark() {
  const browser = await chromium.launch({ headless: true, executablePath: require("../tests/browser.cjs").executablePath });
  try {
    const page = await browser.newPage({ offline: true, viewport: { width: 1480, height: 1000 } });
    await page.goto(pathToFileURL(resolve(__dirname, "../dist/index.html")).href);
    await page.waitForFunction(() => document.querySelector("#run").dataset.state === "complete");
    const referencePath = process.env.NEURO_REFERENCE_MODEL;
    if (referencePath) {
      const source = (await readFile(referencePath, "utf8")).replace("globalThis.NeuroModel = api", "globalThis.NeuroReference = api");
      await page.addScriptTag({ content: source });
    }
    const cases = [
      { name: "Ring default", preset: "ring" },
      { name: "Random rate default", preset: "random" },
      { name: "E/I LIF default", preset: "ei" },
      { name: "Dense tanh 96, 10 s", preset: "random", override: { n: 96, m: 96, density: 1, gain: .7, total: 10000, warmup: 1000, dt: .5, sample: 2 } }
    ];
    const results = [];
    for (const spec of cases) {
      const result = await page.evaluate(async spec => {
        const M = NeuroModel, C = NeuroCompute;
        const source = { ...M.preset(spec.preset), ...spec.override };
        const modes = [...(globalThis.NeuroReference ? ["reference"] : []), "main", "worker"];
        const measurements = Object.fromEntries(modes.map(mode => [mode, []]));
        let reference = null;
        for (let repetition = 0; repetition < 3; repetition++) {
          for (const mode of modes) {
            // Give the previous frame/task time to finish before measuring.
            await new Promise(resolve => setTimeout(resolve, 50));
            let last = performance.now(), maxGap = 0, ticks = 0;
            const timer = setInterval(() => {
              const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; ticks++;
            }, 16);
            const start = performance.now();
            const engine = mode === "reference" ? NeuroReference : mode === "main" ? M : C;
            const output = await engine.simulateAsync(source, new AbortController().signal, () => {});
            const simulationMs = performance.now() - start;
            await new Promise(resolve => setTimeout(resolve, 20));
            clearInterval(timer);
            if (reference) {
              for (const condition of ["baseline", "stimulated"]) {
                const a = reference[condition], b = output[condition];
                if (a.data.length !== b.data.length || a.data.some((value, i) => value !== b.data[i]) ||
                  JSON.stringify(a.spikes) !== JSON.stringify(b.spikes) || JSON.stringify(a.counts) !== JSON.stringify(b.counts)) {
                  throw new Error(`Trajectory mismatch: ${spec.name}/${mode}/${condition}`);
                }
              }
            } else reference = output;
            const ids = M.chooseObservations(output.config, output.network);
            const options = { start: 0, end: source.total, window: 40, kind: "point", condition: "stimulated" };
            const analysisStart = performance.now();
            const analysis = mode === "worker" ? await C.measureAsync(output, ids, options) : M.measure(output, ids, options);
            const analysisMs = performance.now() - analysisStart;
            const expected = M.measure(reference, ids, options);
            if (JSON.stringify(expected) !== JSON.stringify(analysis)) throw new Error(`Analysis mismatch: ${mode}`);
            measurements[mode].push({ simulationMs: +simulationMs.toFixed(1), analysisMs: +analysisMs.toFixed(1), maxTimerGapMs: +maxGap.toFixed(1), ticks });
          }
        }
        const median = values => values.slice().sort((a, b) => a - b)[1];
        return {
          name: spec.name, n: source.n, durationMs: source.total, dtMs: source.dt,
          edges: reference.network.edges.length, exactEquality: true, measurements,
          medianSimulationMs: Object.fromEntries(modes.map(mode => [mode, median(measurements[mode].map(row => row.simulationMs))]))
        };
      }, spec);
      results.push(result);
      console.log(JSON.stringify(result));
    }
    if (process.env.NEURO_BENCHMARK_OUTPUT) await writeFile(process.env.NEURO_BENCHMARK_OUTPUT, JSON.stringify({
      date: new Date().toISOString(), browser: browser.version(), referencePath,
      method: "Offline Chrome, 3 interleaved runs per mode, including worker startup/result copy; excludes rendering. Main-thread heartbeat interval: 16 ms. No CPU throttling. Exact trajectories and statistics compared.",
      results
    }, null, 2));
  } finally { await browser.close(); }
}
benchmark().catch(error => { console.error(error); process.exitCode = 1; });
