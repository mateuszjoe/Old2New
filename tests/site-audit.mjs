import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const css = readFileSync(resolve(root, "styles.css"), "utf8");
const failures = [];
const passes = [];

const check = (condition, message) => {
  if (condition) passes.push(message);
  else failures.push(message);
};

const matches = (source, expression) => [...source.matchAll(expression)];
const ids = matches(html, /\bid=["']([^"']+)["']/g).map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
check(duplicateIds.length === 0, `Unikalne ID (${duplicateIds.join(", ") || "OK"})`);

const hashLinks = matches(html, /\bhref=["']#([^"']+)["']/g).map((match) => match[1]);
const missingAnchors = hashLinks.filter((target) => !ids.includes(target));
check(missingAnchors.length === 0, `Wszystkie kotwice istnieją (${missingAnchors.join(", ") || "OK"})`);

const localAssets = new Set();
for (const match of matches(html, /\b(?:src|href|data-src)=["']([^"']+)["']/g)) {
  const value = match[1];
  if (/^(?:https?:|#|data:|mailto:|tel:)/.test(value)) continue;
  localAssets.add(value.split(/[?#]/)[0]);
}
for (const match of matches(css, /url\(["']?([^"')]+)["']?\)/g)) {
  const value = match[1];
  if (/^(?:https?:|data:|%23|#)/.test(value)) continue;
  localAssets.add(value.split(/[?#]/)[0]);
}
const missingAssets = [...localAssets].filter((asset) => !existsSync(resolve(root, asset)));
check(missingAssets.length === 0, `Wszystkie lokalne assety istnieją (${missingAssets.join(", ") || "OK"})`);

const blankLinks = matches(html, /<a\b[^>]*target=["']_blank["'][^>]*>/g).map((match) => match[0]);
const unsafeBlankLinks = blankLinks.filter((tag) => !/rel=["'][^"']*noopener[^"']*noreferrer[^"']*["']/.test(tag));
check(unsafeBlankLinks.length === 0, "Linki w nowej karcie mają noopener i noreferrer");

const imageTags = matches(html, /<img\b[^>]*>/g).map((match) => match[0]);
check(imageTags.every((tag) => /\balt=["'][^"']*["']/.test(tag)), "Każdy img ma atrybut alt");
check(imageTags.every((tag) => /\bwidth=["']\d+["']/.test(tag) && /\bheight=["']\d+["']/.test(tag)), "Każdy img ma width i height");

check(/<link\s+rel=["']canonical["']/.test(html), "Canonical jest ustawiony");
check(/property=["']og:url["']/.test(html) && /name=["']twitter:card["']/.test(html), "Metadane Open Graph i Twitter są kompletne");
check(/name=["']viewport["'][^>]*viewport-fit=cover/.test(html), "Viewport obsługuje safe-area urządzeń mobilnych");
check(/<main\b[^>]*tabindex=["']-1["']/.test(html), "Główna treść przyjmuje focus po pominięciu intro");
check(/href=["']tel:\+48797843789["']/.test(html), "Zweryfikowany numer telefonu jest klikalny");
const jsonLd = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/)?.[1];
let validJsonLd = false;
try {
  validJsonLd = JSON.parse(jsonLd)?.["@type"] === "LocalBusiness";
} catch (error) {}
check(validJsonLd, "Dane LocalBusiness JSON-LD są poprawnym JSON-em");
check(!/26 realizacji/i.test(html), "Brak szybko dezaktualizującej się liczby realizacji");
check(!/(?:MISJA_|GARAGE SYSTEM|hero-minimap|loader-reticle|VT323|arcade|garażowy HUD)/i.test(`${html}\n${css}`), "Brak elementów i języka HUD/arcade");
check(/@media\s*\(max-width:\s*340px\)/.test(css) && /orientation:\s*landscape/.test(css), "CSS obejmuje wąskie telefony i orientację poziomą");

const heroPath = resolve(root, "assets/garage-hero.jpg");
check(existsSync(heroPath) && statSync(heroPath).size < 500_000, "Hero waży mniej niż 500 kB");
check((css.match(/{/g) ?? []).length === (css.match(/}/g) ?? []).length, "Liczba nawiasów CSS się zgadza");

console.log(`OLD2NEW audit: ${passes.length} checks passed.`);
passes.forEach((message) => console.log(`  ✓ ${message}`));

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  failures.forEach((message) => console.error(`  ✗ ${message}`));
  process.exit(1);
}
