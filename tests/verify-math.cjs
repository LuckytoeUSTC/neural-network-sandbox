"use strict";
const assert = require("node:assert/strict");
const { writeFile, unlink, mkdir } = require("node:fs/promises");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

async function verify() {
  const browser = await chromium.launch({ executablePath: require("./browser.cjs").executablePath, headless: true });
  const fixture = resolve(__dirname, "../tools/shared-mathjax-smoke.html");
  try {
    const context = await browser.newContext({ viewport: { width: 1480, height: 1000 }, offline: true, reducedMotion: "reduce" });
    const page = await context.newPage(), requests = [], errors = [];
    page.on("request", request => requests.push(request.url()));
    page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
    await page.goto(pathToFileURL(resolve(__dirname, "../dist/index.html")).href);
    await page.waitForFunction(() => document.querySelector("#run").dataset.state === "complete");
    assert.ok(await page.locator("h1").evaluate(el => parseFloat(getComputedStyle(el).fontSize) <= 18));
    assert.equal(await page.locator(".hero").count(), 0);
    assert.equal(await page.locator(".results-link").isVisible(), false);
    assert.ok((await page.locator(".lab-layout").boundingBox()).y < 125, "controls should start just below the toolbar");
    assert.ok(!requests.some(url => url.endsWith("tex-svg.js")), "the simulation view should not load the math renderer");
    const ready = () => page.waitForFunction(() => document.querySelector("#theory").dataset.mathState === "ready" && !document.querySelector("#theory").hasAttribute("aria-busy"));
    const show = () => page.locator('button[data-view="methods"]').click();
    await show();
    await ready();

    for (const language of ["zh", "en"]) {
    await page.locator(`[data-language="${language}"]`).click();
    await ready();
    for (const width of [1480, 1024, 801, 390, 320, 1480]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator(".results-link").isVisible(), width < 1000);
      // Run the public rendering path after resizing, then allow its width observer to settle.
      await page.evaluate(() => NeuroMath.render(document.querySelector("#theory")));
      await ready();
      const state = await page.evaluate(() => {
        const language = document.querySelector('#theory').lang === 'en' ? 'en' : 'zh';
        const source = NeuroTheory[language];
        const expected = (source.match(/\\\(/g) || []).length + (source.match(/\\\[/g) || []).length;
        return {
          expected,
          expectedDisplays: (source.match(/\\\[/g) || []).length,
          actual: [...MathJax.startup.document.math].length,
          displays: document.querySelectorAll(".equation mjx-container[display=true]").length,
          errorCount: document.querySelectorAll('[data-mml-node="merror"], mjx-merror, .math-error').length,
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          equationOverflow: [...document.querySelectorAll(".equation")].filter(el => el.scrollWidth > el.clientWidth + 1).length,
          assistive: document.querySelectorAll("mjx-assistive-mml").length,
          version: MathJax.version,
          language,
          visibleChinese: /\p{Script=Han}/u.test(document.querySelector('#theory').innerText)
        };
      });
      assert.ok(state.actual > 80);
      assert.equal(state.actual, state.expected, "every TeX expression must be rendered exactly once");
      assert.equal(state.displays, state.expectedDisplays);
      assert.equal(state.errorCount, 0);
      assert.equal(state.pageOverflow, false);
      assert.equal(state.equationOverflow, 0, "display equations should wrap at the available width");
      assert.equal(state.assistive, state.actual, "screen readers should receive MathML");
      assert.equal(state.version, "4.1.3");
      assert.equal(state.visibleChinese, language === "zh", "the English document must be entirely English");
      await page.locator('button[data-view="traces"]').click();
      await show();
      await ready();
      assert.equal(await page.evaluate(() => [...MathJax.startup.document.math].length), state.actual, "tab switching must not duplicate equations");
      console.log(`Offline math passed: ${language}, ${state.actual} expressions, ${width}px`);
      if (process.env.THREE_NEURONS_QA_DIR && [320, 1480].includes(width)) {
        await page.locator("#theory section").first().screenshot({ path: resolve(process.env.THREE_NEURONS_QA_DIR, `neural-sandbox-math-${language}-${width}.png`) });
      }
    }
    }
    await page.evaluate(() => {
      for (const language of ['zh', 'en', 'zh', 'en']) document.querySelector(`[data-language="${language}"]`).click();
    });
    await ready();
    assert.equal(await page.locator('#theory').getAttribute('lang'), 'en');
    assert.ok(!(await page.locator('#theory').innerText()).match(/\p{Script=Han}/u));
    assert.equal(await page.evaluate(() => [...MathJax.startup.document.math].length), await page.evaluate(() => (NeuroTheory.en.match(/\\\(/g) || []).length + (NeuroTheory.en.match(/\\\[/g) || []).length), 'rapid language changes must not leave stale equations');
    assert.ok(requests.includes("file:///D:/MathJax/4.1.3/tex-svg.js"));
    assert.ok(!requests.some(url => url.includes("/dist/vendor/")), "use the shared installation");

    // A second HTML file uses the shared entry without any sandbox-specific adapter.
    await mkdir(resolve(__dirname, "../tools"), { recursive: true });
    await writeFile(fixture, String.raw`<!doctype html><html><head><meta charset="utf-8"><script defer src="file:///D:/MathJax/local-mathjax.js"></script></head><body><p>\(\mathbb{R}^n\)</p><p>\(\unicode{x0416}\)</p><div>\[\int_0^1 x^2\,\mathrm{d}x=\frac{1}{3}\]</div></body></html>`);
    await page.goto(pathToFileURL(fixture).href);
    await page.waitForFunction(() => document.querySelectorAll("mjx-container").length === 3);
    await page.evaluate(() => LocalMathJax.typeset());
    assert.equal(await page.locator('[data-mml-node="merror"]').count(), 0);
    assert.ok(requests.some(url => url === "file:///D:/MathJax/4.1.3/input/tex/extensions/unicode.js"), "TeX extensions must also load locally");
    assert.ok(!requests.some(url => /^https?:/.test(url)), "offline rendering must not attempt any network request");
    assert.deepEqual(errors, []);
    console.log("Shared MathJax passed: automatic rendering in a second local HTML file, extensions, no network requests.");
  } finally {
    await browser.close();
    await unlink(fixture).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
