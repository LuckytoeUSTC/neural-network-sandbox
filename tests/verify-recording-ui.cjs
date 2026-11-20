"use strict";
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: require("./browser.cjs").executablePath });
  try {
    const page = await browser.newPage({ offline: true, viewport: { width: 1480, height: 1000 } });
    page.setDefaultTimeout(15000);
    const errors = [], external = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => { if (/^https?:/.test(r.url())) external.push(r.url()); });
    await page.goto(pathToFileURL(resolve(__dirname, "../dist/index.html")).href);
    await page.waitForFunction(() => document.querySelector("#run").dataset.state === "complete");
    await page.evaluate(() => {
      window.qa = { runs: 0 };
      const simulate = NeuroCompute.simulateAsync, record = NeuroCompute.recordAsync, compare = NeuroCompare.render;
      NeuroCompute.simulateAsync = async (...args) => { qa.runs++; qa.result = await simulate(...args); qa.recording = qa.result.recording; return qa.result; };
      NeuroCompute.recordAsync = async (...args) => { qa.result = args[0]; qa.recording = await record(...args); return qa.recording; };
      NeuroCompare.render = options => { qa.comparison = options; return compare(options); };
      for (const method of ["lines", "matrix", "activity", "graph"]) {
        const original = NeuroViz[method];
        NeuroViz[method] = options => { qa[method] = options; return original(options); };
      }
    });
    const tab = name => page.locator(`button[data-view="${name}"]`).click();
    const update = async (id, value) => {
      await page.evaluate(({ id, value }) => {
        window.previousRecording = qa.recording;
        const node = document.getElementById(id); node.value = value; node.dispatchEvent(new Event("input", { bubbles: true }));
      }, { id, value });
      await page.waitForFunction(() => qa.recording !== previousRecording && document.querySelector("#run").dataset.state === "complete");
    };
    const download = async selector => {
      const pending = page.waitForEvent("download"); await page.locator(selector).click();
      return readFile(await (await pending).path(), "utf8");
    };
    const csv = text => text.trim().split(/\r?\n/).map(row => row.split(","));
    await update("observeMode", "orthogonal");
    await update("m", "4");
    assert.equal(await page.evaluate(() => qa.runs), 0, "readout edits must not resimulate");
    assert.equal(await page.locator("#trace-neurons").getAttribute("aria-label"), "Channel IDs");
    const valueError = await page.evaluate(() => {
      const p = 80, channel = 1, { recording: r, result: s, lines } = qa;
      const target = lines.series.find(v => v.group === "Channel 2" && v.condition === "Stimulus");
      const expected = r.weights[channel].reduce((sum, w, i) => sum + w * s.stimulated.data[p * s.config.n + i], 0);
      return Math.abs(target.at(p) - expected);
    });
    assert.ok(valueError < 1e-12, "trace must use R x");
    await page.locator("#input-toggle").click();
    assert.equal(await page.evaluate(() => qa.lines.secondarySeries[0].width), 3.2);
    const inputError = await page.evaluate(() => {
      const index = 260, r = qa.recording, s = qa.result, raw = new Float64Array(s.config.n);
      NeuroModel.stimulusAt(s.input, index, s.config.dt, raw);
      return Math.abs(qa.lines.secondarySeries[0].at(index) - r.weights[0].reduce((sum, w, i) => sum + w * raw[i], 0));
    });
    assert.ok(inputError < 1e-12, "stimulus overlay uses R u");
    const weights = csv(await download("#save-readout"));
    assert.equal(weights.length, 5); assert.equal(weights[0][0], "channel");
    assert.equal(weights[0].length, 13);
    const exported = csv(await download("#save-data"));
    assert.ok(exported[0].includes("stimulated_readout_activity_2"));
    assert.equal(Number(exported[81][exported[0].indexOf("stimulated_readout_activity_2")]), await page.evaluate(() => qa.recording.stimulated.data[80 * 4 + 1]));
    await tab("covariance");
    await page.waitForSelector(".covariance-summary");
    const workerError = await page.evaluate(async () => {
      const cfg = qa.result.config, r = qa.recording;
      const options = { start: 0, end: cfg.total, window: 40, kind: "point", condition: "baseline" };
      const actual = await NeuroCompute.measureAsync(qa.result, r.ids, options);
      const expected = NeuroModel.measure(qa.result, r.ids, { ...options, recording: r });
      return Math.max(...actual.matrix.flatMap((row, i) => Array.from(row, (v, j) => Math.abs(v - expected.matrix[i][j]))));
    });
    assert.equal(workerError, 0);
    assert.equal(await page.locator(".covariance-summary dd").first().textContent(), "4");
    await tab("connectivity"); await page.locator("#graph-mode").selectOption("stimulated");
    assert.equal(await page.evaluate(() => qa.graph.observed.length), 0, "projection channel IDs are not node IDs");
    await page.locator("#nodes-expand").click();
    assert.equal(await page.locator("#nodes-activity-table tbody tr").count(), 12);
    assert.equal(await page.locator("#nodes-time").count(), 1);
    await page.keyboard.press("Escape");
    await page.locator("#pin-reference").click();
    await update("observeMode", "gaussian");
    await tab("compare");
    await page.locator('[data-cmp-focus="view"]').selectOption("traces");
    await page.locator('[data-cmp-focus="condition"]').selectOption("delta");
    assert.deepEqual(await page.evaluate(() => [qa.comparison.reference.recording.mode, qa.comparison.current.recording.mode]), ["orthogonal", "gaussian"]);
    const compared = await page.evaluate(() => {
      const r = qa.comparison.current.recording, p = 25;
      return Math.abs(qa.lines.series[0].at(p) - (r.stimulated.data[p * r.m] - r.baseline.data[p * r.m]));
    });
    assert.equal(compared, 0);
    // A stale projection response must not overwrite a more recent selection.
    await page.evaluate(() => {
      const original = NeuroCompute.recordAsync;
      NeuroCompute.recordAsync = async (...args) => {
        const r = await original(...args);
        if (args[1].observeMode === "orthogonal") await new Promise(done => setTimeout(done, 180));
        return r;
      };
      const node = document.querySelector("#observeMode"); node.value = "orthogonal"; node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await update("observeMode", "random");
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(() => qa.comparison.current.recording.mode), "random");
    // LIF mixtures are continuous readouts and signed rate bins, never fake spike trains.
    await page.locator("#preset").selectOption("ei");
    await page.waitForFunction(() => document.querySelector("#run").dataset.state === "complete");
    await update("observeMode", "gaussian"); await update("m", "4");
    await tab("activity");
    assert.equal(await page.locator("#viz-wrap h3").first().textContent(), "Projected activity");
    assert.equal(await page.evaluate(() => qa.activity.events), null);
    assert.equal(await page.getByRole("button", { name: "Export spikes", exact: true }).count(), 0);
    await tab("population");
    assert.equal(await page.locator("#viz-wrap h3").first().textContent(), "Mean projected rate (Hz)");
    assert.equal(await page.locator("#population-groups").count(), 0);
    const lifCSV = csv(await download("#save-data"));
    assert.ok(lifCSV[0].includes("baseline_projected_count_1"));
    assert.ok(!lifCSV[0].some(name => name.includes("spike_count")));
    await tab("covariance");
    await page.locator("#cov-kind").selectOption("spike");
    await page.waitForSelector(".covariance-summary");
    for (const width of [1480, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => {
        const select = document.querySelector("#observeMode"), style = getComputedStyle(select);
        const ctx = document.createElement("canvas").getContext("2d"); ctx.font = `${style.fontSize} ${style.fontFamily}`;
        return { page: document.documentElement.scrollWidth > innerWidth + 1,
          selectedText: ctx.measureText(select.selectedOptions[0].textContent).width > select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 16 };
      });
      assert.equal(overflow.page, false, `page overflow at ${width}`);
      assert.equal(overflow.selectedText, false, `readout option truncation at ${width}`);
    }
    await page.setViewportSize({ width: 1480, height: 1000 });
    await page.screenshot({ path: resolve(__dirname, "../.test-output/recording-ui.png") });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log("Recording UI passed: no resimulation, R x / R u, covariance worker parity, full-precision exports, reference isolation, stale responses, LIF semantics and label widths.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
