const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-toggle");
const menu = document.querySelector(".nav-menu");
const year = document.querySelector("[data-year]");
const preloader = document.querySelector("[data-preloader]");
const skipIntro = document.querySelector("[data-skip-intro]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

year.textContent = new Date().getFullYear();

let introFinished = false;
const finishIntro = (immediate = false) => {
  if (!preloader || introFinished) return;
  introFinished = true;

  try {
    sessionStorage.setItem("old2new-intro-seen", "1");
  } catch (error) {}

  if (immediate) {
    document.documentElement.classList.add("intro-seen");
    preloader.remove();
    return;
  }

  preloader.classList.add("is-leaving");
  window.setTimeout(() => {
    document.documentElement.classList.add("intro-seen");
    preloader.remove();
  }, 650);
};

if (document.documentElement.classList.contains("intro-seen") || reduceMotion) {
  finishIntro(true);
} else {
  window.setTimeout(() => finishIntro(false), 5350);
}

skipIntro?.addEventListener("click", () => finishIntro(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") finishIntro(false);
});

const updateHeader = () => header.classList.toggle("scrolled", window.scrollY > 24);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

menuButton.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  menu.classList.toggle("open", !isOpen);
  document.body.classList.toggle("menu-open", !isOpen);
});

menu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton.setAttribute("aria-expanded", "false");
    menu.classList.remove("open");
    document.body.classList.remove("menu-open");
  });
});
