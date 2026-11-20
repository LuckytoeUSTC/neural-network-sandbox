"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

(async () => {
  const folder = await fs.mkdtemp(join(tmpdir(), "neuro-offline-"));
  const archive = resolve(__dirname, "../release/neural-network-sandbox-offline.zip");
  execFileSync(process.env.PYTHON || "python", ["-c", "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", archive, folder]);
  const browser = await chromium.launch({ headless: true, ...require("./browser.cjs") });
  try {
    const page = await browser.newPage({ offline: true, viewport: { width: 1480, height: 1000 } });
    const errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => requests.push(request.url()));
    await page.goto(pathToFileURL(join(folder, "neural-network-sandbox/index.html")).href);
    const completed = () => page.waitForFunction(() => document.querySelector("#run").dataset.state === "complete");
    await completed();
    assert.ok(await page.locator("canvas").count());
    const download = async selector => {
      const pending = page.waitForEvent("download");
      await page.locator(selector).click();
      return fs.readFile(await (await pending).path(), "utf8");
    };
    const config = await download("#save-config");
    assert.equal(JSON.parse(config).version, 2);
    const csv = await download("#save-data");
    assert.ok(csv.split(/\r?\n/).length > 100);
    const gain = await page.locator("#gain").inputValue();
    await page.locator("#gain").fill("0.5");
    await page.locator("#gain").blur();
    await page.locator("#load-config").setInputFiles({ name: "experiment.json", mimeType: "application/json", buffer: Buffer.from(config) });
    await completed();
    assert.equal(await page.locator("#gain").inputValue(), gain);
    await page.locator("button[data-view=methods]").click();
    for (const language of ["zh", "en"]) {
      await page.locator(`button[data-language=${language}]`).click();
      await page.waitForFunction(() => document.querySelector("#theory").dataset.mathState === "ready");
      assert.ok(await page.locator("mjx-container").count() > 100);
      assert.equal(await page.locator(".math-error, [data-mml-node=merror]").count(), 0);
    }
    assert.ok(requests.some(url => url.includes("/vendor/mathjax/4.1.3/tex-svg.js")));
    assert.ok(requests.every(url => !/^https?:/i.test(url) && !url.startsWith("file:///D:/MathJax/")));
    assert.deepEqual(errors, []);
    console.log("Portable release passed: random extraction directory, offline simulation, config round-trip, CSV export, bilingual MathJax; no external dependencies.");
  } finally {
    await browser.close();
    // This temporary directory was created by this test, never supplied by a caller.
    await fs.rm(folder, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
