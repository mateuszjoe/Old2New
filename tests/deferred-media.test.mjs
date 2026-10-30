import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const browser = await chromium.launch({ channel: "msedge", headless: true });
after(() => browser.close());
const image = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

async function setup({ belowFold = false, noObserver = false, reducedMotion = false, saveData = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 700, height: 500 }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const requests = [];
  const errors = [];
  await context.addInitScript(({ noObserver, saveData }) => {
    if (noObserver) delete window.IntersectionObserver;
    if (saveData) Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" } });
    const nativeSet = window.setTimeout.bind(window);
    const nativeClear = window.clearTimeout.bind(window);
    const timers = new Map();
    let nextTimer = -1;
    window.setTimeout = (fn, ms, ...args) => {
      if (ms < 5000) return nativeSet(fn, ms, ...args);
      const id = nextTimer--;
      timers.set(id, () => fn(...args));
      return id;
    };
    window.clearTimeout = (id) => { if (!timers.delete(id)) nativeClear(id); };
    window.testHeroTimers = timers;
    window.testIdleCallbacks = [];
    window.requestIdleCallback = (fn) => { window.testIdleCallbacks.push(fn); return window.testIdleCallbacks.length; };
    window.testFlushIdle = () => window.testIdleCallbacks.splice(0).forEach(fn => fn({ didTimeout: false, timeRemaining: () => 50 }));
    window.testAdvanceHero = async () => {
      const [id, callback] = timers.entries().next().value || [];
      if (callback) { timers.delete(id); await callback(); }
    };
  }, { noObserver, saveData });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "old2new.test") return route.abort();
    if (url.pathname === "/script.js") return route.fulfill({ contentType: "application/javascript", body: source });
    if (url.pathname.endsWith(".gif")) {
      requests.push(url.pathname);
      return route.fulfill({ contentType: "image/gif", body: image });
    }
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html class="intro-seen"><head><style>body{margin:0} .hero{height:300px;margin-top:${belowFold ? 1000 : 0}px} .after{height:2000px} img{width:1px;height:1px} .nav-menu:not(.open){display:none}</style><script src="/script.js" defer></script></head><body><header data-header><button class="menu-toggle"><span class="sr-only">Menu</span></button><nav class="nav-menu"><a href="#after">After</a><img data-menu-car data-src="/menu-a.gif"><img data-menu-car data-src="/menu-b.gif"></nav></header><main><section class="hero"><div data-hero-slideshow data-hero-interval="5000"><div class="is-active" data-hero-slide><img src="/hero-a.gif"></div><div data-hero-slide><img data-src="/hero-b.gif"></div><div data-hero-slide><img data-src="/hero-c.gif"></div></div><button data-hero-motion>Pause</button></section><section class="after" id="after"></section></main><footer class="footer"></footer></body></html>` });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://old2new.test/", { waitUntil: "networkidle" });
  return { context, page, requests, errors };
}

test("Decorative menu images wait for first opening, including after breakpoint changes", async () => {
  const s = await setup();
  try {
    await s.page.evaluate(() => window.testFlushIdle());
    assert.equal(s.requests.filter(url => url.startsWith("/menu-")).length, 0);
    await s.page.setViewportSize({ width: 1100, height: 500 });
    await s.page.setViewportSize({ width: 700, height: 500 });
    await s.page.evaluate(() => window.testFlushIdle());
    assert.equal(s.requests.filter(url => url.startsWith("/menu-")).length, 0);
    await s.page.locator(".menu-toggle").click();
    await s.page.waitForFunction(() => [...document.querySelectorAll("[data-menu-car]")].every(img => img.complete && img.naturalWidth > 0));
    assert.deepEqual(s.requests.filter(url => url.startsWith("/menu-")).sort(), ["/menu-a.gif", "/menu-b.gif"]);
    assert.equal(await s.page.locator(".nav-menu").evaluate(el => el.classList.contains("open")), true);
    assert.deepEqual(s.errors, []);
  } finally { await s.context.close(); }
});

test("Hero waits for visibility, cancels queued prefetch offscreen, and resumes on return", async () => {
  const s = await setup({ belowFold: true });
  try {
    assert.equal(await s.page.evaluate(() => window.testHeroTimers.size), 0);
    await s.page.evaluate(() => window.testFlushIdle());
    assert.deepEqual(s.requests, ["/hero-a.gif"]);
    await s.page.locator(".hero").scrollIntoViewIfNeeded();
    await s.page.waitForFunction(() => window.testHeroTimers.size === 1);
    await s.page.evaluate(() => window.scrollTo(0, 1600));
    await s.page.waitForFunction(() => window.testHeroTimers.size === 0);
    await s.page.evaluate(() => window.testFlushIdle());
    assert.deepEqual(s.requests, ["/hero-a.gif"], "Queued warmup must not load an offscreen image");
    await s.page.locator(".hero").scrollIntoViewIfNeeded();
    await s.page.waitForFunction(() => window.testHeroTimers.size === 1);
    await s.page.evaluate(() => window.testFlushIdle());
    await s.page.waitForFunction(() => document.querySelectorAll("[data-hero-slide] img")[1].naturalWidth > 0);
    await s.page.evaluate(() => window.testAdvanceHero());
    assert.equal(await s.page.locator("[data-hero-slide]").nth(1).evaluate(el => el.classList.contains("is-active")), true);
    assert.deepEqual(s.errors, []);
  } finally { await s.context.close(); }
});

test("Reduced motion and Save-Data still block rotation and warmup; old browsers retain a fallback", async () => {
  for (const options of [{ reducedMotion: true }, { saveData: true }, { noObserver: true }]) {
    const s = await setup(options);
    try {
      await s.page.evaluate(() => window.testFlushIdle());
      if (options.noObserver) {
        assert.equal(await s.page.evaluate(() => window.testHeroTimers.size), 1);
        await s.page.waitForFunction(() => document.querySelectorAll("[data-hero-slide] img")[1].naturalWidth > 0);
      } else {
        assert.equal(await s.page.evaluate(() => window.testHeroTimers.size), 0);
        assert.deepEqual(s.requests, ["/hero-a.gif"]);
      }
      assert.deepEqual(s.errors, []);
    } finally { await s.context.close(); }
  }
});
