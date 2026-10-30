import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const source = await readFile(new URL("../analytics.js", import.meta.url), "utf8");
const key = "old2new.analytics-consent.v1";
const browser = await chromium.launch({ channel: "msedge", headless: true });
after(() => browser.close());
const fixture = `<!doctype html><html><head><title>OLD2NEW test</title>
<script src="/analytics.js" data-measurement-id="G-TEST123" defer></script></head><body>
<section id="przed-zima"><a id="whatsapp" href="https://wa.me/48700000000?text=private-message">WhatsApp</a></section>
<section id="kontakt"><a id="phone" href="tel:+48700000000">Phone</a><a id="instagram" href="https://www.instagram.com/test/">Instagram</a>
<a id="fake-social" href="https://instagram.com.attacker.example/">Not Instagram</a><a id="ordinary" href="https://example.com/">Other</a></section>
<footer><button data-analytics-settings>Settings</button></footer></body></html>`;

async function setup({ saved, blockedStorage = false, host = "old2new.pl" } = {}) {
  const context = await browser.newContext();
  let googleRequests = 0;
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "www.googletagmanager.com") {
      googleRequests += 1;
      return route.fulfill({ contentType: "application/javascript", body: "/* isolated test tag */" });
    }
    if (url.hostname !== host) return route.abort();
    return route.fulfill({ contentType: url.pathname === "/analytics.js" ? "application/javascript" : "text/html", body: url.pathname === "/analytics.js" ? source : fixture });
  });
  if (saved !== undefined) await context.addInitScript(({ key, saved }) => {
    if (!sessionStorage.getItem("fixture-initialized")) {
      localStorage.setItem(key, JSON.stringify(saved));
      sessionStorage.setItem("fixture-initialized", "yes");
    }
  }, { key, saved });
  if (blockedStorage) await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  const page = await context.newPage();
  await page.goto(`https://${host}/?email=private@example.com#secret`);
  const calls = () => page.evaluate(() => (window.dataLayer || []).map((call) => Array.from(call)));
  const choose = (value) => page.locator(`[data-consent-choice="${value}"]`).click();
  return { context, page, calls, choose, requests: () => googleRequests };
}

test("No request before a choice or after refusal; settings remain keyboard accessible", async () => {
  const s = await setup();
  try {
    assert.equal(s.requests(), 0);
    assert.equal(await s.page.locator(".analytics-consent").isVisible(), true);
    assert.deepEqual(await s.calls(), []);
    await s.choose("denied");
    assert.equal(s.requests(), 0);
    assert.equal(await s.page.locator(".analytics-consent").isVisible(), false);
    await s.page.locator("[data-analytics-settings]").click();
    assert.equal(await s.page.locator("[data-consent-choice='denied']").evaluate((el) => el === document.activeElement), true);
    await s.page.keyboard.press("Escape");
    assert.equal(await s.page.locator("[data-analytics-settings]").evaluate((el) => el === document.activeElement), true);
    await s.page.reload();
    assert.equal(s.requests(), 0);
    assert.equal(await s.page.locator(".analytics-consent").isVisible(), false);
  } finally { await s.context.close(); }
});

test("Acceptance sends a single page view and bounded contact data without stopping navigation", async () => {
  const s = await setup();
  try {
    await s.choose("accepted");
    await s.page.waitForFunction(() => window.dataLayer?.some((call) => call[1] === "page_view"));
    assert.equal(s.requests(), 1);
    await s.page.locator("[data-analytics-settings]").click();
    await s.choose("accepted");
    let calls = await s.calls();
    assert.equal(calls.filter((call) => call[1] === "page_view").length, 1);
    const config = calls.find((call) => call[0] === "config")[2];
    assert.equal(config.send_page_view, false);
    assert.equal(config.allow_google_signals, false);
    assert.equal(config.allow_ad_personalization_signals, false);
    assert.equal(config.page_location, "https://old2new.pl/");
    assert.equal(calls.find((call) => call[0] === "consent" && call[1] === "update")[2].ad_storage, "denied");
    const notPrevented = await s.page.evaluate(() => {
      let wasNotPrevented = false;
      document.addEventListener("click", (event) => { wasNotPrevented = !event.defaultPrevented; event.preventDefault(); }, { once: true });
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      document.querySelector("#whatsapp").dispatchEvent(event);
      return wasNotPrevented;
    });
    assert.equal(notPrevented, true);
    calls = await s.calls();
    const contact = calls.find((call) => call[1] === "contact_click")[2];
    assert.deepEqual(contact, { contact_method: "whatsapp", contact_placement: "winter", send_to: "G-TEST123", transport_type: "beacon" });
    assert.equal(JSON.stringify(calls).includes("private-message"), false);
    assert.equal(JSON.stringify(calls).includes("48700000000"), false);
    assert.equal(JSON.stringify(calls).includes("private@example.com"), false);
    // Prevent actual navigation only in this test harness, after the application listener runs.
    await s.page.evaluate(() => document.addEventListener("click", (event) => event.preventDefault()));
    await s.page.locator("#fake-social").click();
    await s.page.locator("#ordinary").click();
    assert.equal((await s.calls()).filter((call) => call[1] === "contact_click").length, 1);
  } finally { await s.context.close(); }
});

test("Revocation removes GA cookies, reloads into denied mode, and permits later fresh consent", async () => {
  const s = await setup();
  try {
    await s.choose("accepted");
    await s.context.addCookies([
      { name: "_ga", value: "test", domain: ".old2new.pl", path: "/" },
      { name: "_ga_TEST123", value: "test", domain: "old2new.pl", path: "/" },
    ]);
    await s.page.locator("[data-analytics-settings]").click();
    await Promise.all([s.page.waitForEvent("load"), s.choose("denied")]);
    assert.equal(s.requests(), 1);
    assert.deepEqual(await s.calls(), []);
    assert.equal((await s.context.cookies()).some((cookie) => cookie.name.startsWith("_ga")), false);
    assert.equal(await s.page.evaluate(() => window["ga-disable-G-TEST123"]), true);
    await s.page.locator("[data-analytics-settings]").click();
    await s.choose("accepted");
    assert.equal(s.requests(), 2);
  } finally { await s.context.close(); }
});

test("Expired or malformed choices fail closed, as does unavailable storage", async () => {
  for (const options of [
    { saved: { version: 1, value: "accepted", expires: Date.now() - 1 } },
    { saved: { version: 1, value: "accepted", expires: "forever" } },
    { blockedStorage: true },
  ]) {
    const s = await setup(options);
    try {
      assert.equal(s.requests(), 0);
      assert.equal(await s.page.locator(".analytics-consent").isVisible(), true);
      await s.choose("denied");
      assert.equal(s.requests(), 0);
    } finally { await s.context.close(); }
  }
});

test("Stored valid consent loads analytics once; development hosts never send it", async () => {
  const saved = { version: 1, value: "accepted", expires: Date.now() + 60000 };
  for (const host of ["old2new.pl", "localhost"]) {
    const s = await setup({ saved, host });
    try {
      assert.equal(s.requests(), host === "old2new.pl" ? 1 : 0);
      assert.equal((await s.calls()).filter((call) => call[1] === "page_view").length, host === "old2new.pl" ? 1 : 0);
    } finally { await s.context.close(); }
  }
});
