const root = document.documentElement;
const body = document.body;
const header = document.querySelector("[data-header]");
const main = document.querySelector("main");
const footer = document.querySelector("footer");
const skipLink = document.querySelector(".skip-link");
const menuButton = document.querySelector(".menu-toggle");
const menuButtonLabel = menuButton?.querySelector(".sr-only");
const menu = document.querySelector(".nav-menu");
const menuCars = [...document.querySelectorAll("[data-menu-car]")];
const year = document.querySelector("[data-year]");
const preloader = document.querySelector("[data-preloader]");
const loaderCar = document.querySelector("[data-loader-car]");
const skipIntro = document.querySelector("[data-skip-intro]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileMenu = window.matchMedia("(max-width: 900px)");

const galleryTriggers = [...document.querySelectorAll("[data-gallery-index]")];
const galleryDialog = document.querySelector("[data-gallery-lightbox]");
const galleryImage = galleryDialog?.querySelector("[data-gallery-image]");
const galleryCaption = galleryDialog?.querySelector("[data-gallery-caption]");
const galleryCounter = galleryDialog?.querySelector("[data-gallery-counter]");
const galleryStatus = galleryDialog?.querySelector("[data-gallery-status]");
const gallerySpeedometer = galleryDialog?.querySelector(".gallery-speedometer");
const gallerySwipeArea = galleryDialog?.querySelector("[data-gallery-swipe]");
const galleryClose = galleryDialog?.querySelector("[data-gallery-close]");
const galleryPrevious = galleryDialog?.querySelector("[data-gallery-previous]");
const galleryNext = galleryDialog?.querySelector("[data-gallery-next]");

const MENU_CLOSE_DELAY = 660;
const shouldPlayIntro = Boolean(
  preloader && !root.classList.contains("intro-seen") && !reducedMotion.matches,
);

if (year) year.textContent = new Date().getFullYear();

let introActive = shouldPlayIntro;
let introFinished = false;
let menuOpen = false;
let menuClosing = false;
let menuCloseTimer = 0;
let lightboxOpen = false;

const setElementInert = (element, inert) => {
  if (!element) return;
  element.inert = inert;
  if (inert) element.setAttribute("aria-hidden", "true");
  else element.removeAttribute("aria-hidden");
};

const menuBlocksPage = () => menuOpen || menuClosing;

const syncBodyLocks = () => {
  body.classList.toggle("menu-open", menuBlocksPage());
  body.classList.toggle("lightbox-open", lightboxOpen);
};

const syncPageInert = () => {
  setElementInert(header, introActive || lightboxOpen);
  setElementInert(main, introActive || menuBlocksPage() || lightboxOpen);
  setElementInert(footer, introActive || menuBlocksPage() || lightboxOpen);
  setElementInert(skipLink, introActive || menuBlocksPage() || lightboxOpen);
  syncBodyLocks();
};

const clearMenuCloseTimer = () => {
  if (!menuCloseTimer) return;
  window.clearTimeout(menuCloseTimer);
  menuCloseTimer = 0;
};

const hydrateMenuCars = () => {
  menuCars.forEach((car) => {
    if (!car.getAttribute("src") && car.dataset.src) {
      car.setAttribute("src", car.dataset.src);
    }
  });
};

let menuCarWarmupScheduled = false;
const scheduleMenuCarWarmup = () => {
  if (
    !mobileMenu.matches ||
    menuCarWarmupScheduled ||
    menuCars.every((car) => car.getAttribute("src"))
  ) {
    return;
  }

  menuCarWarmupScheduled = true;
  const warmUp = () => {
    menuCarWarmupScheduled = false;
    if (!mobileMenu.matches) return;
    menuCars.forEach((car) => {
      car.fetchPriority = "low";
      car.decoding = "async";
    });
    hydrateMenuCars();
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(warmUp, { timeout: 1200 });
  } else {
    window.setTimeout(warmUp, 350);
  }
};

const finishMenuClose = () => {
  clearMenuCloseTimer();
  menuOpen = false;
  menuClosing = false;
  menu?.classList.remove("open", "is-closing");
  if (menu) menu.inert = mobileMenu.matches;
  syncPageInert();
};

const setMenuState = (
  open,
  { returnFocus = false, immediate = false } = {},
) => {
  if (!menuButton || !menu) return;

  const canOpen = Boolean(
    open && mobileMenu.matches && !introActive && !lightboxOpen,
  );

  if (canOpen) {
    clearMenuCloseTimer();
    hydrateMenuCars();
    menuOpen = true;
    menuClosing = false;
    menu.classList.remove("is-closing");
    menu.classList.add("open");
    menu.inert = false;
    menuButton.setAttribute("aria-expanded", "true");
    if (menuButtonLabel) menuButtonLabel.textContent = "Zamknij menu";
    syncPageInert();
    return;
  }

  const wasActive = menuOpen || menuClosing || menu.classList.contains("open");
  menuOpen = false;
  menuButton.setAttribute("aria-expanded", "false");
  if (menuButtonLabel) menuButtonLabel.textContent = "Otwórz menu";

  const delayedClose = Boolean(
    wasActive && mobileMenu.matches && !immediate && !reducedMotion.matches,
  );

  if (delayedClose) {
    menu.classList.remove("open");
    menu.classList.add("is-closing");
    menu.inert = true;

    if (!menuClosing) {
      menuClosing = true;
      menuCloseTimer = window.setTimeout(finishMenuClose, MENU_CLOSE_DELAY);
    }

    syncPageInert();
  } else {
    finishMenuClose();
  }

  if (returnFocus && menuButton.getClientRects().length > 0) {
    menuButton.focus({ preventScroll: true });
  }
};

const finishIntro = (immediate = false) => {
  if (!preloader || introFinished) return;
  introFinished = true;

  if (shouldPlayIntro) {
    try {
      localStorage.setItem("old2new-intro-seen-at", String(Date.now()));
    } catch (error) {}
  }

  introActive = false;
  root.classList.remove("intro-playing");
  syncPageInert();

  const removePreloader = () => {
    const restoreFocus = document.activeElement === skipIntro;
    root.classList.add("intro-seen");
    preloader.remove();
    if (restoreFocus) main?.focus({ preventScroll: true });
  };

  if (immediate) {
    removePreloader();
    return;
  }

  preloader.classList.add("is-leaving");
  window.setTimeout(removePreloader, 500);
};

if (shouldPlayIntro) {
  root.classList.add("intro-playing");
  if (loaderCar?.dataset.src) loaderCar.setAttribute("href", loaderCar.dataset.src);
  syncPageInert();
  window.setTimeout(() => finishIntro(false), 3150);
} else {
  finishIntro(true);
}

skipIntro?.addEventListener("click", () => finishIntro(false));

menuButton?.addEventListener("click", () => {
  setMenuState(!menuOpen);
});

menu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenuState(false));
});

const galleryItems = galleryTriggers.map((trigger) => {
  const thumbnail = trigger.querySelector("img");
  const caption = trigger.querySelector(".gallery-frame-caption");

  return {
    trigger,
    source:
      trigger.dataset.gallerySrc ||
      thumbnail?.dataset.gallerySrc ||
      thumbnail?.getAttribute("src") ||
      "",
    alt: thumbnail?.getAttribute("alt") || "",
    caption: caption?.textContent.trim() || thumbnail?.getAttribute("alt") || "",
  };
});

let galleryIndex = 0;
let galleryOpener = null;
let galleryPointer = null;
let galleryImageRequest = 0;
const indicatorTimers = new WeakMap();

const normalizeGalleryIndex = (index) => {
  const count = galleryItems.length;
  return count ? ((index % count) + count) % count : 0;
};

const formatGalleryPosition = (index) => {
  const digits = Math.max(2, String(galleryItems.length).length);
  return `${String(index + 1).padStart(digits, "0")} / ${String(
    galleryItems.length,
  ).padStart(digits, "0")}`;
};

const preloadGalleryNeighbours = () => {
  if (galleryItems.length < 2) return;
  [-1, 1].forEach((offset) => {
    const source = galleryItems[normalizeGalleryIndex(galleryIndex + offset)]?.source;
    if (!source) return;
    const preload = new Image();
    preload.src = source;
  });
};

const announceGalleryItem = (item) => {
  if (!galleryStatus) return;
  galleryStatus.textContent = "";
  window.requestAnimationFrame(() => {
    galleryStatus.textContent = `Zdjęcie ${galleryIndex + 1} z ${
      galleryItems.length
    }. ${item.caption}`;
  });
};

const renderGalleryItem = ({ announce = true } = {}) => {
  const item = galleryItems[galleryIndex];
  if (!item) return;

  if (galleryCaption) galleryCaption.textContent = item.caption;
  if (galleryCounter) galleryCounter.textContent = formatGalleryPosition(galleryIndex);

  const progress = galleryItems.length > 1 ? galleryIndex / (galleryItems.length - 1) : 0;
  gallerySpeedometer?.style.setProperty("--gallery-progress", String(progress));

  if (galleryImage) {
    const request = ++galleryImageRequest;
    gallerySwipeArea?.setAttribute("aria-busy", "true");

    const finishLoading = () => {
      if (request !== galleryImageRequest) return;
      gallerySwipeArea?.removeAttribute("aria-busy");
    };

    galleryImage.addEventListener("load", finishLoading, { once: true });
    galleryImage.addEventListener("error", finishLoading, { once: true });
    galleryImage.alt = item.alt;
    galleryImage.src = item.source;
    if (galleryImage.complete) window.queueMicrotask(finishLoading);
  }

  if (announce) announceGalleryItem(item);
  preloadGalleryNeighbours();
};

const flashIndicator = (button) => {
  if (!button || reducedMotion.matches) return;

  const activeTimer = indicatorTimers.get(button);
  if (activeTimer) window.clearTimeout(activeTimer);
  button.classList.remove("is-flashing");
  void button.offsetWidth;
  button.classList.add("is-flashing");
  indicatorTimers.set(
    button,
    window.setTimeout(() => {
      button.classList.remove("is-flashing");
      indicatorTimers.delete(button);
    }, 420),
  );
};

const setGalleryIndex = (index, indicator) => {
  if (!galleryItems.length) return;
  galleryIndex = normalizeGalleryIndex(index);
  renderGalleryItem();
  flashIndicator(indicator);
};

const showPreviousGalleryItem = () => {
  setGalleryIndex(galleryIndex - 1, galleryPrevious);
};

const showNextGalleryItem = () => {
  setGalleryIndex(galleryIndex + 1, galleryNext);
};

const focusGalleryFallback = () => {
  const galleryTitle = document.querySelector("#gallery-title");
  if (!galleryTitle) return;
  galleryTitle.setAttribute("tabindex", "-1");
  galleryTitle.focus({ preventScroll: true });
  galleryTitle.addEventListener(
    "blur",
    () => galleryTitle.removeAttribute("tabindex"),
    { once: true },
  );
};

const closeGallery = () => {
  if (!galleryDialog || (!lightboxOpen && !galleryDialog.open)) return;

  const opener = galleryOpener;
  lightboxOpen = false;
  syncPageInert();
  if (galleryDialog.open) galleryDialog.close();
  galleryPointer = null;

  window.requestAnimationFrame(() => {
    const openerAvailable = Boolean(
      opener?.isConnected &&
        !opener.closest("[inert]") &&
        opener.getClientRects().length,
    );
    if (openerAvailable) opener.focus({ preventScroll: true });
    else focusGalleryFallback();
  });
};

const openGallery = (index, opener) => {
  if (
    !galleryDialog ||
    typeof galleryDialog.showModal !== "function" ||
    !galleryItems.length ||
    introActive ||
    menuBlocksPage() ||
    lightboxOpen
  ) {
    return;
  }

  galleryIndex = normalizeGalleryIndex(index);
  galleryOpener = opener;
  renderGalleryItem({ announce: false });

  try {
    galleryDialog.showModal();
  } catch (error) {
    return;
  }

  galleryDialog.setAttribute("aria-modal", "true");
  lightboxOpen = true;
  syncPageInert();

  window.requestAnimationFrame(() => {
    galleryClose?.focus({ preventScroll: true });
    const item = galleryItems[galleryIndex];
    if (item) announceGalleryItem(item);
  });
};

const getGalleryFocusableElements = () => {
  if (!galleryDialog) return [];
  return [...galleryDialog.querySelectorAll("button:not([disabled]), [href], [tabindex]")].filter(
    (element) =>
      element.getAttribute("tabindex") !== "-1" &&
      !element.closest("[inert]") &&
      element.getClientRects().length > 0,
  );
};

galleryTriggers.forEach((trigger, index) => {
  trigger.addEventListener("click", () => openGallery(index, trigger));
});

galleryClose?.addEventListener("click", closeGallery);
galleryPrevious?.addEventListener("click", showPreviousGalleryItem);
galleryNext?.addEventListener("click", showNextGalleryItem);

galleryDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeGallery();
});

galleryDialog?.addEventListener("click", (event) => {
  if (event.target === galleryDialog) closeGallery();
});

galleryDialog?.addEventListener("keydown", (event) => {
  if (!lightboxOpen) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeGallery();
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPreviousGalleryItem();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    showNextGalleryItem();
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    setGalleryIndex(0, galleryPrevious);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    setGalleryIndex(galleryItems.length - 1, galleryNext);
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = getGalleryFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    galleryDialog.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !galleryDialog.contains(active))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (active === last || !galleryDialog.contains(active))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
});

gallerySwipeArea?.addEventListener("pointerdown", (event) => {
  if (!lightboxOpen || !event.isPrimary || event.pointerType === "mouse") return;
  if (event.target.closest("button, a")) return;

  galleryPointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
  try {
    gallerySwipeArea.setPointerCapture?.(event.pointerId);
  } catch (error) {}
});

gallerySwipeArea?.addEventListener("pointerup", (event) => {
  if (!galleryPointer || galleryPointer.id !== event.pointerId) return;

  const deltaX = event.clientX - galleryPointer.x;
  const deltaY = event.clientY - galleryPointer.y;
  const threshold = Math.max(48, gallerySwipeArea.clientWidth * 0.12);
  galleryPointer = null;

  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) {
    return;
  }

  event.preventDefault();
  if (deltaX < 0) showNextGalleryItem();
  else showPreviousGalleryItem();
});

const clearGalleryPointer = (event) => {
  if (!galleryPointer || (event && galleryPointer.id !== event.pointerId)) return;
  galleryPointer = null;
};

gallerySwipeArea?.addEventListener("pointercancel", clearGalleryPointer);
gallerySwipeArea?.addEventListener("lostpointercapture", clearGalleryPointer);

const handleMenuBreakpoint = () => {
  setMenuState(false, { immediate: true });
  scheduleMenuCarWarmup();
};

const revealItems = document.querySelectorAll(".reveal");

if (!reducedMotion.matches && "IntersectionObserver" in window) {
  root.classList.add("reveal-ready");

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -28px" },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const handleReducedMotionChange = () => {
  if (!reducedMotion.matches) return;

  setMenuState(false, { immediate: true });
  if (introActive) finishIntro(true);
  revealItems.forEach((item) => item.classList.add("is-visible"));
  root.classList.remove("reveal-ready");
  galleryPrevious?.classList.remove("is-flashing");
  galleryNext?.classList.remove("is-flashing");
};

const addMediaChangeListener = (mediaQuery, listener) => {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
  } else {
    mediaQuery.addListener?.(listener);
  }
};

addMediaChangeListener(mobileMenu, handleMenuBreakpoint);
addMediaChangeListener(reducedMotion, handleReducedMotionChange);
scheduleMenuCarWarmup();

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (lightboxOpen) {
    closeGallery();
    return;
  }

  if (menuBlocksPage()) {
    setMenuState(false, { returnFocus: true });
    return;
  }

  if (introActive) finishIntro(false);
});

const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 24);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

setMenuState(false, { immediate: true });
