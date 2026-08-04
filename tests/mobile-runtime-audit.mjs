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
  { name: "1024x768", width: 1024, height: 768, mobile: false },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
];

const reports = [];

for (const viewport of viewports) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile ?? true,
  });
  await send("Emulation.setTouchEmulationEnabled", {
    enabled: viewport.mobile ?? true,
    maxTouchPoints: viewport.mobile === false ? 1 : 5,
  });

  const loaded = waitForEvent("Page.loadEventFired");
  await send("Page.navigate", { url: pageUrl });
  await loaded;
  await evaluate("document.fonts.ready.then(() => true)");
  await delay(180);
  await capture(`${viewport.name}-intro.png`);

  await evaluate("document.querySelector('[data-skip-intro]')?.click(); true");
  await delay(600);
  await evaluate("scrollTo(0, 0); true");

  if (outputDirectory && (viewport.name === "390x844" || viewport.name === "1440x900")) {
    for (let heroIndex = 0; heroIndex < 4; heroIndex += 1) {
      await evaluate(`(async () => {
        const slides = [...document.querySelectorAll('[data-hero-slide]')];
        const image = slides[${heroIndex}]?.querySelector('img');
        if (!image.getAttribute('src') && image.dataset.src) image.src = image.dataset.src;
        try { await image.decode(); } catch (error) {}
        slides.forEach((slide, index) => {
          slide.style.transition = 'none';
          slide.classList.toggle('is-active', index === ${heroIndex});
        });
        return true;
      })()`);
      await delay(90);
      await capture(`${viewport.name}-hero-0${heroIndex + 1}.png`);
    }
    await evaluate(`(() => {
      const slides = [...document.querySelectorAll('[data-hero-slide]')];
      slides.forEach((slide, index) => {
        slide.classList.toggle('is-active', index === 0);
        slide.style.removeProperty('transition');
      });
      return true;
    })()`);
  }

  const layout = await evaluate(`(() => {
    const isRendered = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
    };
    const selectors = [
      '.site-header', '.hero-content', '.hero h1', '.hero-actions', '.ticker-track',
      '.intro-grid', '.section-head', '.service-list', '.process-layout', '.work-order',
      '.proof-head', '.garage-gallery', '.gallery-proof-row',
      '.contact-wrap', '.contact-details', '.contact-actions',
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
    const activeHeroSlide = document.querySelector('[data-hero-slide].is-active');
    const heroImage = activeHeroSlide?.querySelector('img');
    const heroImageRect = heroImage?.getBoundingClientRect();
    const heroImageStyle = heroImage ? getComputedStyle(heroImage) : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      heroHeight: hero.height,
      heroActionsBottom: actions.bottom,
      heroMedia: {
        slideCount: document.querySelectorAll('[data-hero-slide]').length,
        activeCount: document.querySelectorAll('[data-hero-slide].is-active').length,
        imageTop: heroImageRect?.top,
        imageBottom: heroImageRect?.bottom,
        imageWidth: heroImageRect?.width,
        imageHeight: heroImageRect?.height,
        objectFit: heroImageStyle?.objectFit,
        objectPosition: heroImageStyle?.objectPosition,
      },
      clipped,
      smallTargets,
    };
  })()`);

  const heroMotion = await evaluate(`(() => {
    const control = document.querySelector('[data-hero-motion]');
    const images = [...document.querySelectorAll('[data-hero-slide] img')];
    const visible = control && !control.hidden && getComputedStyle(control).display !== 'none';
    if (visible) control.click();
    const paused = control?.getAttribute('aria-pressed');
    if (visible) control.click();
    return {
      visible,
      paused,
      resumed: control?.getAttribute('aria-pressed'),
      hydratedSlides: images.filter((image) => image.hasAttribute('src')).length,
    };
  })()`);

  let menu;
  if (viewport.width <= 900) {
    menu = await evaluate(`(() => {
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
        carsHydrated: [...nav.querySelectorAll('[data-menu-car]')].every((car) => Boolean(car.getAttribute('src'))),
      };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      toggle.click();
      const rapidReopen =
        toggle.getAttribute('aria-expanded') === 'true' &&
        nav.classList.contains('open') &&
        !nav.classList.contains('is-closing');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return {
        mode: 'mobile',
        open,
        rapidReopen,
        closed: toggle.getAttribute('aria-expanded') === 'false' && !nav.classList.contains('open'),
        focusReturned: document.activeElement === toggle,
      };
    })()`);
    await delay(720);
    if (viewport.name === "390x844" || viewport.name === "844x390") {
      await evaluate("document.querySelector('.menu-toggle').click(); true");
      await delay(480);
      await capture(`${viewport.name}-menu-open.png`);
      await evaluate("document.querySelector('.menu-toggle').click(); true");
      await delay(420);
      await capture(`${viewport.name}-menu-closing.png`);
      await delay(300);
    }
  } else {
    menu = await evaluate(`(() => {
      const toggle = document.querySelector('.menu-toggle');
      const nav = document.querySelector('.nav-menu');
      return {
        mode: 'desktop',
        toggleHidden: getComputedStyle(toggle).display === 'none',
        navVisible: getComputedStyle(nav).visibility === 'visible',
        linkHeights: [...nav.querySelectorAll('a')].map((link) => link.getBoundingClientRect().height),
      };
    })()`);
  }

  const sections = ["start", "o-mnie", "zakres", "jak-to-dziala", "realizacje", "kontakt"];
  for (const section of sections) {
    await evaluate(`document.getElementById('${section}').scrollIntoView({ behavior: 'instant' }); true`);
    await delay(180);
    await capture(`${viewport.name}-${section}.png`);
  }
  await evaluate("document.querySelector('footer').scrollIntoView({ behavior: 'instant' }); true");
  await delay(100);
  await capture(`${viewport.name}-footer.png`);

  await evaluate("document.getElementById('realizacje').scrollIntoView({ behavior: 'instant' }); true");
  await delay(100);
  const gallery = await evaluate(`(() => {
    const trigger = document.querySelector('[data-gallery-index="2"]');
    const dialog = document.querySelector('[data-gallery-lightbox]');
    trigger.click();
    const controls = [...dialog.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
    });
    const opened = {
      open: dialog.open,
      modal: dialog.matches(':modal'),
      focusOnClose: document.activeElement === dialog.querySelector('[data-gallery-close]'),
      counter: dialog.querySelector('[data-gallery-counter]').textContent.trim(),
      imageSource: dialog.querySelector('[data-gallery-image]').getAttribute('src'),
      controls,
      fits: dialog.getBoundingClientRect().width <= innerWidth && dialog.getBoundingClientRect().height <= innerHeight,
    };
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterRight = dialog.querySelector('[data-gallery-counter]').textContent.trim();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const afterHome = dialog.querySelector('[data-gallery-counter]').textContent.trim();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const afterEnd = dialog.querySelector('[data-gallery-counter]').textContent.trim();
    const swipeArea = dialog.querySelector('[data-gallery-swipe]');
    const swipeRect = swipeArea.getBoundingClientRect();
    swipeArea.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      isPrimary: true,
      pointerId: 77,
      pointerType: 'touch',
      clientX: swipeRect.right - 20,
      clientY: swipeRect.top + swipeRect.height / 2,
    }));
    swipeArea.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      isPrimary: true,
      pointerId: 77,
      pointerType: 'touch',
      clientX: swipeRect.left + 20,
      clientY: swipeRect.top + swipeRect.height / 2,
    }));
    const afterSwipe = dialog.querySelector('[data-gallery-counter]').textContent.trim();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return new Promise((resolve) => requestAnimationFrame(() => resolve({
      opened,
      afterRight,
      afterHome,
      afterEnd,
      afterSwipe,
      closed: !dialog.open,
      focusReturned: document.activeElement === trigger,
    })));
  })()`);
  if (viewport.name === "390x844" || viewport.name === "844x390" || viewport.name === "1440x900") {
    await evaluate("document.querySelector('[data-gallery-index=\"0\"]').click(); true");
    await delay(120);
    await capture(`${viewport.name}-gallery-lightbox.png`);
    await evaluate("document.querySelector('[data-gallery-close]').click(); true");
  }

  const finalState = await evaluate(`({
    pageHeight: document.documentElement.scrollHeight,
    visibleReveal: document.querySelectorAll('.reveal.is-visible').length,
    totalReveal: document.querySelectorAll('.reveal').length,
  })`);

  reports.push({ viewport: viewport.name, layout, heroMotion, menu, gallery, finalState });
}

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  screenWidth: 390,
  screenHeight: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Emulation.setEmulatedMedia", { features: [] });
const heroTimingLoaded = waitForEvent("Page.loadEventFired");
await send("Page.navigate", { url: `${pageUrl}&hero-timing=1` });
await heroTimingLoaded;
await evaluate("document.querySelector('[data-skip-intro]')?.click(); true");
await delay(650);
const heroTimingStart = await evaluate(
  "[...document.querySelectorAll('[data-hero-slide]')].findIndex((slide) => slide.classList.contains('is-active'))",
);
await delay(18_500);
const heroTimingBeforeDeadline = await evaluate(
  "[...document.querySelectorAll('[data-hero-slide]')].findIndex((slide) => slide.classList.contains('is-active'))",
);
await delay(1_500);
const heroTimingAfterDeadline = await evaluate(
  "[...document.querySelectorAll('[data-hero-slide]')].findIndex((slide) => slide.classList.contains('is-active'))",
);
const heroTimingReport = {
  start: heroTimingStart,
  beforeDeadline: heroTimingBeforeDeadline,
  afterDeadline: heroTimingAfterDeadline,
};

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  screenWidth: 390,
  screenHeight: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
const reducedLoaded = waitForEvent("Page.loadEventFired");
await send("Page.navigate", { url: `${pageUrl}&reduced=1` });
await reducedLoaded;
const reducedMotionReport = await evaluate(`(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav-menu');
  toggle.click();
  const opened = nav.classList.contains('open');
  toggle.click();
  return {
    mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    opened,
    closedImmediately:
      !nav.classList.contains('open') &&
      !nav.classList.contains('is-closing') &&
      !document.body.classList.contains('menu-open'),
    heroControlHidden:
      document.querySelector('[data-hero-motion]').hidden ||
      getComputedStyle(document.querySelector('[data-hero-motion]')).display === 'none',
    heroActiveCount: document.querySelectorAll('[data-hero-slide].is-active').length,
    heroHydratedSlides: [...document.querySelectorAll('[data-hero-slide] img')]
      .filter((image) => image.hasAttribute('src')).length,
  };
})()`);

const failures = [];
for (const report of reports) {
  if (report.layout.scrollWidth > report.layout.viewport.width) failures.push(`${report.viewport}: poziomy overflow dokumentu`);
  if (report.layout.bodyScrollWidth > report.layout.viewport.width) failures.push(`${report.viewport}: poziomy overflow body`);
  if (report.layout.clipped.length) failures.push(`${report.viewport}: elementy poza viewportem ${JSON.stringify(report.layout.clipped)}`);
  if (report.layout.smallTargets.length) failures.push(`${report.viewport}: cele dotykowe <44 px ${JSON.stringify(report.layout.smallTargets)}`);
  if (report.layout.heroMedia.slideCount !== 4 || report.layout.heroMedia.activeCount !== 1) failures.push(`${report.viewport}: hero nie ma jednego aktywnego kadru z czterech`);
  if (!report.heroMotion.visible || report.heroMotion.paused !== "true" || report.heroMotion.resumed !== "false") failures.push(`${report.viewport}: pauza hero nie dziala`);
  if (report.layout.viewport.width <= 680 && report.layout.viewport.height > report.layout.viewport.width && report.layout.heroMedia.imageHeight > 251) failures.push(`${report.viewport}: mobilny kadr hero jest zbyt wysoki`);
  if (report.menu.mode === "mobile") {
    if (report.menu.open.expanded !== "true" || report.menu.open.visible !== "visible" || !report.menu.open.carsHydrated) failures.push(`${report.viewport}: menu nie otwiera się poprawnie`);
    if (!report.menu.rapidReopen) failures.push(`${report.viewport}: szybkie ponowne otwarcie menu nie dziala`);
    if (!report.menu.closed || !report.menu.focusReturned) failures.push(`${report.viewport}: menu nie zamyka się poprawnie`);
    if (report.menu.open.linkHeights.some((height) => height < 44)) failures.push(`${report.viewport}: link menu <44 px`);
  } else if (!report.menu.toggleHidden || !report.menu.navVisible || report.menu.linkHeights.some((height) => height < 44)) {
    failures.push(`${report.viewport}: nawigacja desktopowa nie jest poprawnie widoczna`);
  }
}
if (browserErrors.length) failures.push(`Błędy przeglądarki: ${browserErrors.join(" | ")}`);

for (const report of reports) {
  if (!report.gallery.opened.open || !report.gallery.opened.modal || !report.gallery.opened.focusOnClose) failures.push(`${report.viewport}: lightbox nie otwiera sie jako modal z prawidlowym focusem`);
  if (report.gallery.opened.counter !== "03 / 05" || !report.gallery.opened.imageSource) failures.push(`${report.viewport}: lightbox nie wczytuje wybranego kadru`);
  if (report.gallery.afterRight !== "04 / 05" || report.gallery.afterHome !== "01 / 05" || report.gallery.afterEnd !== "05 / 05" || report.gallery.afterSwipe !== "01 / 05") failures.push(`${report.viewport}: nawigacja galerii nie dziala`);
  if (!report.gallery.closed || !report.gallery.focusReturned) failures.push(`${report.viewport}: lightbox nie zamyka sie z powrotem do miniatury`);
  if (!report.gallery.opened.fits) failures.push(`${report.viewport}: lightbox wykracza poza viewport`);
  if (report.gallery.opened.controls.some(({ width, height }) => width < 44 || height < 44)) failures.push(`${report.viewport}: kontrolka lightboxa mniejsza niz 44 px`);
  if (report.gallery.opened.controls.some(({ top, bottom }) => top < 0 || bottom > report.layout.viewport.height)) failures.push(`${report.viewport}: kontrolka lightboxa jest poza widocznym obszarem`);
}
if (!reducedMotionReport.mediaMatches || !reducedMotionReport.opened || !reducedMotionReport.closedImmediately) {
  failures.push("prefers-reduced-motion: menu nie zamyka sie natychmiast");
}
if (!reducedMotionReport.heroControlHidden || reducedMotionReport.heroActiveCount !== 1 || reducedMotionReport.heroHydratedSlides !== 1) {
  failures.push("prefers-reduced-motion: slideshow hero nie pozostaje statyczny");
}
if (heroTimingReport.start !== 0 || heroTimingReport.beforeDeadline !== 0 || heroTimingReport.afterDeadline !== 1) {
  failures.push(`hero: nie zmienia kadru po 20 s ${JSON.stringify(heroTimingReport)}`);
}

console.log(JSON.stringify({ reports, heroTimingReport, reducedMotionReport, browserErrors, failures }, null, 2));
await send("Browser.close");

if (failures.length) process.exitCode = 1;
