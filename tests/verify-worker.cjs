"use strict";
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

async function verify() {
  const browser = await chromium.launch({ executablePath: require("./browser.cjs").executablePath, headless: true });
  try {
    const page = await browser.newPage({ offline: true, viewport: { width: 1480, height: 1000 } });
    page.setDefaultTimeout(20000);
    const errors = [], externalRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    const load = async () => {
      await page.goto(pathToFileURL(resolve(__dirname, "../dist/worker.html")).href);
      await page.waitForFunction(() => document.querySelector("#run").dataset.state === "complete");
    };
    await load();
    const comparison = await page.evaluate(async () => {
      const M = NeuroModel, C = NeuroCompute;
      const equal = (a, b, label) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Worker differs: ${label}`);
      };
      const checks = [];
      const cases = Object.keys(M.presets).map(name => ({ name, config: M.preset(name) }));
      cases.push({ name: "dense all-recorded", config: { ...M.preset("random"), n: 96, m: 96, density: 1, gain: .7 } });
      cases.push({ name: "independent noise", config: { ...M.preset("ring"), pairing: "independent", waveform: "off" } });
      for (const { name, config } of cases) {
        const sync = M.simulate(config), progress = [];
        sync.recording = M.record(sync);
        const threaded = await C.simulateAsync(config, new AbortController().signal, fraction => progress.push(fraction));
        equal(sync, threaded, name);
        if ((sync.baseline === sync.stimulated) !== (threaded.baseline === threaded.stimulated)) throw new Error("Shared trial identity changed");
        if (progress.some((p, i) => p < 0 || p > 1 || (i && p < progress[i - 1]))) throw new Error("Progress is not monotonic");
        const ids = M.chooseObservations(config, sync.network);
        for (const kind of ["point", "mean", "integrated", ...(config.model === "lif" ? ["spike"] : [])]) {
          for (const condition of ["baseline", "stimulated", "delta"]) {
            const options = { start: 0, end: config.total, window: 40, kind, condition };
            equal(M.measure(sync, ids, options), await C.measureAsync(threaded, ids, options), `${name}/${kind}/${condition}`);
          }
        }
        checks.push(name);
      }
      const config = M.preset("ring");
      const saved = await C.simulateAsync(config, new AbortController().signal);
      const ids = M.chooseObservations(config, saved.network);
      const options = { start: 0, end: config.total, window: 40, kind: "point", condition: "baseline" };
      const reference = M.measure(saved, ids, options);
      const controller = new AbortController();
      let abortAt;
      const pending = C.simulateAsync({ ...M.preset("random"), n: 96, m: 96, density: 1, total: 10000, dt: .25 }, controller.signal);
      setTimeout(() => { abortAt = performance.now(); controller.abort(); }, 60);
      try { await pending; throw new Error("Expected cancellation"); }
      catch (error) { if (error.name !== "AbortError") throw error; }
      const cancellationMs = performance.now() - abortAt;
      equal(reference, await C.measureAsync(saved, ids, options), "previous result after cancellation");
      try { await C.simulateAsync({ ...config, n: 0 }, new AbortController().signal); throw new Error("Expected validation error"); }
      catch (error) { if (error.field !== "n") throw error; }
      equal(reference, await C.measureAsync(saved, ids, options), "previous result after invalid run");
      try { await C.measureAsync(saved, ids, { ...options, start: -1 }); throw new Error("Expected analysis error"); }
      catch (error) { if (!error.message.includes("analysis interval")) throw error; }
      equal(reference, await C.measureAsync(saved, ids, options), "analysis after error");
      return { identicalCases: checks, cancellationMs };
    });
    assert.ok(comparison.cancellationMs < 150, JSON.stringify(comparison));
    // DevTools may briefly list an already terminated worker. Count live contexts.
    const live = await Promise.all(page.workers().map(worker => Promise.race([
      worker.evaluate(() => Boolean(self.NeuroModel)).catch(() => false),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Worker context did not settle")), 3000))
    ])));
    console.log(JSON.stringify(comparison));
    assert.equal(live.filter(Boolean).length, 1, "Only the successfully completed experiment should retain a live worker");

    // Deliberately return an obsolete analysis late. It must never replace the latest one.
    await load();
    await page.evaluate(() => {
      const original = NeuroCompute.measureAsync;
      NeuroCompute.measureAsync = async (...args) => {
        const value = await original(...args);
        await new Promise(resolve => setTimeout(resolve, args[2].kind === "point" ? 400 : 30));
        return value;
      };
    });
    await page.locator("button[data-view=covariance]").click();
    await page.locator("#cov-kind").selectOption("integrated");
    await page.locator("#cov-kind").focus();
    await page.waitForSelector(".covariance-summary");
    assert.equal(await page.locator(".covariance-summary dd").nth(1).textContent(), "25");
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".covariance-summary dd").nth(1).textContent(), "25");
    assert.equal(await page.locator("#viz-wrap canvas").count(), 2);
    assert.equal(await page.evaluate(() => document.activeElement.id), "cov-kind");
    await page.locator("#m").fill("3");
    await page.waitForFunction(() => document.querySelector(".covariance-summary dd")?.textContent === "3");

    // Run a long experiment while the existing plots remain interactive; Stop retains them.
    await page.locator("button[data-view=traces]").click();
    const oldTitle = await page.locator("#viz-wrap h3").first().textContent();
    await page.evaluate(() => {
      const values = { model: "tanh", topology: "random", n: 96, m: 96, density: 1, gain: .7, total: 10000, dt: .25 };
      for (const [key, value] of Object.entries(values)) {
        const input = document.getElementById(key);
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      globalThis.workerHeartbeat = { ticks: 0, maxGap: 0, last: performance.now() };
      globalThis.workerHeartbeatTimer = setInterval(() => {
        const h = workerHeartbeat, now = performance.now();
        h.maxGap = Math.max(h.maxGap, now - h.last); h.last = now; h.ticks++;
      }, 16);
    });
    await page.locator("#run").click();
    await page.waitForFunction(() => document.querySelector("#run").dataset.state === "running");
    await page.locator("button[data-view=connectivity]").click();
    await page.locator("#inspect-node").selectOption("2");
    assert.match(await page.locator(".connectivity-data").textContent(), /Neuron 3/);
    await page.waitForTimeout(300);
    await page.locator("#run").click();
    await page.waitForFunction(() => document.querySelector("#run").dataset.state === "stopped");
    const heartbeat = await page.evaluate(() => { clearInterval(workerHeartbeatTimer); return workerHeartbeat; });
    assert.ok(heartbeat.ticks > 10, JSON.stringify(heartbeat));
    assert.ok(heartbeat.maxGap < 150, JSON.stringify(heartbeat));
    await page.locator("button[data-view=traces]").click();
    assert.equal(await page.locator("#viz-wrap h3").first().textContent(), oldTitle);
    await page.locator("button[data-view=covariance]").click();
    await page.waitForSelector(".covariance-summary");
    assert.equal(await page.locator(".covariance-summary dd").first().textContent(), "3");
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log("Worker passed: offline, identical trajectories/statistics, cancellation, retained results, errors, stale analysis, focus and responsive UI.");
    console.log(JSON.stringify({ heartbeat }));
  } finally { await browser.close(); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
