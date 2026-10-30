(() => {
  "use strict";

  const measurementId = document.currentScript?.dataset.measurementId || "";
  const storageKey = "old2new.analytics-consent.v1";
  const consentLifetime = 180 * 24 * 60 * 60 * 1000;
  const productionHost = ["old2new.pl", "www.old2new.pl"].includes(location.hostname);
  const configured = productionHost && /^G-[A-Z0-9]+$/.test(measurementId);
  const disableKey = `ga-disable-${measurementId}`;
  const denied = {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
  let choice = readChoice();
  let tagStarted = false;
  let pageViewSent = false;
  let expiryTimer;
  let returnFocus;

  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved?.version === 1 && ["accepted", "denied"].includes(saved.value)
        && Number.isFinite(saved.expires) && saved.expires > Date.now()
        && saved.expires <= Date.now() + consentLifetime + 60000) return saved;
      localStorage.removeItem(storageKey);
    } catch { /* An unavailable preference store never implies consent. */ }
    return null;
  }

  function hasConsent() {
    return choice?.value === "accepted" && choice.expires > Date.now();
  }

  function clearAnalyticsCookies() {
    const names = document.cookie.split(";").map((cookie) => cookie.trim().split("=")[0])
      .filter((name) => /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name));
    const domains = ["", location.hostname, "." + location.hostname, "old2new.pl", ".old2new.pl"];
    const paths = new Set(["/"]);
    const parts = location.pathname.split("/").filter(Boolean);
    while (parts.length) {
      paths.add("/" + parts.join("/"));
      paths.add("/" + parts.join("/") + "/");
      parts.pop();
    }
    for (const name of names) for (const domain of domains) for (const path of paths) {
      document.cookie = `${name}=; Max-Age=0; Path=${path}; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
    }
  }

  function safeReferrer() {
    try { return document.referrer ? new URL(document.referrer).origin : ""; }
    catch { return ""; }
  }

  function startAnalytics() {
    if (!configured || !hasConsent() || tagStarted) return;
    tagStarted = true;
    window[disableKey] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", denied);
    window.gtag("consent", "update", { ...denied, analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: consentLifetime / 1000,
      cookie_update: false,
      page_location: location.origin + location.pathname,
      page_referrer: safeReferrer(),
      transport_type: "beacon",
    });
    const script = document.createElement("script");
    script.async = true;
    script.id = "old2new-google-tag";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
    if (!pageViewSent) {
      pageViewSent = true;
      window.gtag("event", "page_view", {
        page_location: location.origin + location.pathname,
        page_referrer: safeReferrer(),
        page_title: document.title,
        send_to: measurementId,
      });
    }
  }

  function stopAnalytics() {
    window[disableKey] = true;
    clearAnalyticsCookies();
    if (!tagStarted) return;
    // A fresh document also removes any listeners installed by the Google library.
    window.dataLayer.length = 0;
    window.gtag = () => {};
    document.getElementById("old2new-google-tag")?.remove();
    location.reload();
  }

  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    if (!choice) return;
    expiryTimer = setTimeout(() => {
      if (choice.expires <= Date.now()) {
        choice = null;
        try { localStorage.removeItem(storageKey); } catch { /* Keep consent denied. */ }
        stopAnalytics();
        showSettings(false);
      } else scheduleExpiry();
    }, Math.min(choice.expires - Date.now(), 24 * 60 * 60 * 1000));
  }

  const panel = document.createElement("section");
  panel.className = "analytics-consent";
  panel.hidden = true;
  panel.setAttribute("aria-labelledby", "analytics-consent-title");
  panel.innerHTML = `
    <div class="analytics-consent-copy">
      <h2 id="analytics-consent-title">Statystyki strony</h2>
      <p>Za Twoją zgodą Google Analytics zapisze cookies, żeby mierzyć wizyty i kliknięcia kontaktu. Możesz korzystać ze strony bez zgody i zmienić wybór w stopce.</p>
      <a href="privacy.html">Prywatność i cookies</a>
      <p class="analytics-consent-status" aria-live="polite"></p>
    </div>
    <div class="analytics-consent-actions">
      <button type="button" data-consent-choice="denied">Nie zgadzam się</button>
      <button type="button" data-consent-choice="accepted">Zgadzam się</button>
    </div>
    <button type="button" class="analytics-consent-close" aria-label="Zamknij ustawienia statystyk" hidden>×</button>`;
  document.body.append(panel);
  const status = panel.querySelector(".analytics-consent-status");
  const closeButton = panel.querySelector(".analytics-consent-close");

  function showSettings(focus) {
    returnFocus = focus ? document.activeElement : null;
    status.textContent = choice
      ? (hasConsent() ? "Obecnie: statystyki włączone." : "Obecnie: statystyki wyłączone.")
      : "";
    closeButton.hidden = !choice;
    panel.hidden = false;
    if (focus) panel.querySelector("[data-consent-choice='denied']").focus();
  }

  function hideSettings() {
    panel.hidden = true;
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  function setChoice(value) {
    choice = { version: 1, value, expires: Date.now() + consentLifetime };
    try { localStorage.setItem(storageKey, JSON.stringify(choice)); }
    catch { /* This explicit choice applies only to the current document. */ }
    hideSettings();
    scheduleExpiry();
    if (hasConsent()) startAnalytics();
    else stopAnalytics();
  }

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-consent-choice]");
    if (button) setChoice(button.dataset.consentChoice);
  });
  closeButton.addEventListener("click", hideSettings);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && choice) { hideSettings(); event.stopPropagation(); }
  });

  function contactMethod(link) {
    try {
      const url = new URL(link.href, location.href);
      if (url.protocol === "tel:") return "phone";
      if (!["https:", "http:"].includes(url.protocol)) return null;
      const host = url.hostname.replace(/^www\./, "");
      if (["wa.me", "api.whatsapp.com"].includes(host)) return "whatsapp";
      if (host === "instagram.com") return "instagram";
      if (["facebook.com", "m.facebook.com", "fb.me"].includes(host)) return "facebook";
      if ((host === "google.com" && url.pathname.startsWith("/maps"))
        || host === "maps.google.com" || host === "maps.app.goo.gl") return "maps";
    } catch { /* Ignore unsupported links. */ }
    return null;
  }

  function contactPlacement(link) {
    if (link.closest("[data-mobile-contact]")) return "mobile_bar";
    if (link.closest("footer")) return "footer";
    if (link.closest(".site-header")) return "header";
    const id = link.closest("section[id]")?.id;
    return ({ start: "hero", zakres: "services", "przed-zima": "winter",
      "jak-to-dziala": "process", realizacje: "gallery", kontakt: "contact" })[id] || "other";
  }

  document.addEventListener("click", (event) => {
    const settingsButton = event.target.closest("[data-analytics-settings]");
    if (settingsButton) { showSettings(true); return; }
    if (!configured || !hasConsent() || !tagStarted) return;
    const link = event.target.closest("a[href]");
    const method = link && contactMethod(link);
    if (!method) return;
    window.gtag("event", "contact_click", {
      contact_method: method,
      contact_placement: contactPlacement(link),
      send_to: measurementId,
      transport_type: "beacon",
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    choice = readChoice();
    scheduleExpiry();
    if (hasConsent()) { hideSettings(); startAnalytics(); }
    else { stopAnalytics(); if (!choice) showSettings(false); else hideSettings(); }
  });
  window.addEventListener("pageshow", () => {
    if (choice && choice.expires <= Date.now()) { choice = null; stopAnalytics(); showSettings(false); }
  });

  if (hasConsent()) startAnalytics();
  else { window[disableKey] = true; clearAnalyticsCookies(); }
  if (!choice) showSettings(false);
  scheduleExpiry();
})();
