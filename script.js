const root = document.documentElement;
const body = document.body;
const header = document.querySelector("[data-header]");
const main = document.querySelector("main");
const footer = document.querySelector("footer");
const skipLink = document.querySelector(".skip-link");
const menuButton = document.querySelector(".menu-toggle");
const menuButtonLabel = menuButton?.querySelector(".sr-only");
const menu = document.querySelector(".nav-menu");
const year = document.querySelector("[data-year]");
const preloader = document.querySelector("[data-preloader]");
const loaderCar = document.querySelector("[data-loader-car]");
const skipIntro = document.querySelector("[data-skip-intro]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobileMenu = window.matchMedia("(max-width: 900px)");
const shouldPlayIntro = Boolean(preloader && !root.classList.contains("intro-seen") && !reduceMotion);

if (year) year.textContent = new Date().getFullYear();

let introActive = shouldPlayIntro;
let menuOpen = false;
let introFinished = false;

const setElementInert = (element, inert) => {
  if (!element) return;
  element.inert = inert;
  if (inert) element.setAttribute("aria-hidden", "true");
  else element.removeAttribute("aria-hidden");
};

const syncPageInert = () => {
  setElementInert(header, introActive);
  setElementInert(main, introActive || menuOpen);
  setElementInert(footer, introActive || menuOpen);
  setElementInert(skipLink, introActive || menuOpen);
};

const setMenuState = (open, { returnFocus = false } = {}) => {
  if (!menuButton || !menu) return;

  menuOpen = Boolean(open && mobileMenu.matches && !introActive);
  menuButton.setAttribute("aria-expanded", String(menuOpen));
  menu.classList.toggle("open", menuOpen);
  body.classList.toggle("menu-open", menuOpen);
  menu.inert = mobileMenu.matches && !menuOpen;

  if (menuButtonLabel) {
    menuButtonLabel.textContent = menuOpen ? "Zamknij menu" : "Otwórz menu";
  }

  syncPageInert();
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

const handleMenuBreakpoint = () => setMenuState(false);
mobileMenu.addEventListener?.("change", handleMenuBreakpoint);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (menuOpen) {
    setMenuState(false, { returnFocus: true });
    return;
  }

  if (introActive) finishIntro(false);
});

const revealItems = document.querySelectorAll(".reveal");

if (!reduceMotion && "IntersectionObserver" in window) {
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

const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 24);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

setMenuState(false);
