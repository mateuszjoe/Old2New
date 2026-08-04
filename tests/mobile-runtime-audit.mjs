import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const endpoint = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9231";
const outputDirectory = process.env.MOBILE_AUDIT_OUTPUT;
const pageUrl = `${pathToFileURL(path.join(process.cwd(), "index.html")).href}?intro=1&audit=${Date.now()}`;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const page = await fetch(`${endpoint}/json/new`, { method: "PUT" }).then((response) => {
  if (!response.ok) throw new Error(`Nie można połączyć się z Chrome DevTools (${response.status}).`);
  return response.json();
});
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const waiters = new Map();
const browserErrors = [];
let nextId = 0;

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const callback = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
    return;
  }

  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails.text);
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    browserErrors.push(message.params.entry.text);
  }

  const callbacks = waiters.get(message.method);
  if (!callbacks?.length) return;
  waiters.delete(message.method);
  callbacks.forEach((callback) => callback(message.params));
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

const waitForEvent = (method) =>
  new Promise((resolve) => {
    const callbacks = waiters.get(method) ?? [];
    callbacks.push(resolve);
    waiters.set(method, callbacks);
  });

const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
};

const capture = async (filename) => {
  if (!outputDirectory) return;
  mkdirSync(outputDirectory, { recursive: true });
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(path.join(outputDirectory, filename), Buffer.from(data, "base64"));
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

const viewports = [
  { name: "280x653", width: 280, height: 653 },
  { name: "320x568", width: 320, height: 568 },
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "568x320", width: 568, height: 320 },
  { name: "844x390", width: 844, height: 390 },
];

const reports = [];

for (const viewport of viewports) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const loaded = waitForEvent("Page.loadEventFired");
  await send("Page.navigate", { url: pageUrl });
  await loaded;
  await evaluate("document.fonts.ready.then(() => true)");
  await delay(180);
  await capture(`${viewport.name}-intro.png`);

  await evaluate("document.querySelector('[data-skip-intro]')?.click(); true");
  await delay(600);
  await evaluate("scrollTo(0, 0); true");

  const layout = await evaluate(`(() => {
    const isRendered = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
    };
    const selectors = [
      '.site-header', '.hero-content', '.hero h1', '.hero-actions', '.ticker-track',
      '.intro-grid', '.section-head', '.service-list', '.process-layout', '.work-order',
      '.proof-head', '.proof-card', '.contact-wrap', '.contact-details', '.contact-actions',
      '.footer-wrap'
    ];
    const clipped = [...document.querySelectorAll(selectors.join(','))]
      .filter(isRendered)
      .map((element) => ({
        selector: element.className,
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.left < -1 || rect.right > innerWidth + 1)
      .map(({ selector, rect }) => ({ selector, left: rect.left, right: rect.right }));
    const smallTargets = [...document.querySelectorAll('a[href], button')]
      .filter(isRendered)
      .filter((element) => !element.matches('.skip-link'))
      .map((element) => ({
        label: element.getAttribute('aria-label') || element.textContent.trim().replace(/\\s+/g, ' ').slice(0, 45),
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .map(({ label, rect }) => ({ label, width: rect.width, height: rect.height }));
    const hero = document.querySelector('.hero').getBoundingClientRect();
    const actions = document.querySelector('.hero-actions').getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      heroHeight: hero.height,
      heroActionsBottom: actions.bottom,
      clipped,
      smallTargets,
    };
  })()`);

  const menu = await evaluate(`(() => {
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.nav-menu');
    toggle.click();
    const linkHeights = [...nav.querySelectorAll('a')].map((link) => link.getBoundingClientRect().height);
    const open = {
      expanded: toggle.getAttribute('aria-expanded'),
      visible: getComputedStyle(nav).visibility,
      overflowY: getComputedStyle(nav).overflowY,
      clientHeight: nav.clientHeight,
      scrollHeight: nav.scrollHeight,
      linkHeights,
    };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return {
      open,
      closed: toggle.getAttribute('aria-expanded') === 'false' && !nav.classList.contains('open'),
      focusReturned: document.activeElement === toggle,
    };
  })()`);

  const sections = ["start", "o-mnie", "zakres", "jak-to-dziala", "realizacje", "kontakt"];
  for (const section of sections) {
    await evaluate(`document.getElementById('${section}').scrollIntoView({ behavior: 'instant' }); true`);
    await delay(180);
    await capture(`${viewport.name}-${section}.png`);
  }

  const finalState = await evaluate(`({
    pageHeight: document.documentElement.scrollHeight,
    visibleReveal: document.querySelectorAll('.reveal.is-visible').length,
    totalReveal: document.querySelectorAll('.reveal').length,
  })`);

  reports.push({ viewport: viewport.name, layout, menu, finalState });
}

const failures = [];
for (const report of reports) {
  if (report.layout.scrollWidth > report.layout.viewport.width) failures.push(`${report.viewport}: poziomy overflow dokumentu`);
  if (report.layout.bodyScrollWidth > report.layout.viewport.width) failures.push(`${report.viewport}: poziomy overflow body`);
  if (report.layout.clipped.length) failures.push(`${report.viewport}: elementy poza viewportem ${JSON.stringify(report.layout.clipped)}`);
  if (report.layout.smallTargets.length) failures.push(`${report.viewport}: cele dotykowe <44 px ${JSON.stringify(report.layout.smallTargets)}`);
  if (report.menu.open.expanded !== "true" || report.menu.open.visible !== "visible") failures.push(`${report.viewport}: menu nie otwiera się poprawnie`);
  if (!report.menu.closed || !report.menu.focusReturned) failures.push(`${report.viewport}: menu nie zamyka się poprawnie`);
  if (report.menu.open.linkHeights.some((height) => height < 44)) failures.push(`${report.viewport}: link menu <44 px`);
}
if (browserErrors.length) failures.push(`Błędy przeglądarki: ${browserErrors.join(" | ")}`);

console.log(JSON.stringify({ reports, browserErrors, failures }, null, 2));
await send("Browser.close");

if (failures.length) process.exitCode = 1;
