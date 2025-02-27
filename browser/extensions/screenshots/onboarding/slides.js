/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals log, catcher, onboardingHtml, onboardingCss, util, shooter, callBackground, assertIsTrusted, assertIsBlankDocument */

"use strict";

this.slides = (function() {
  const exports = {};

  const { watchFunction } = catcher;

  let iframe;
  let doc;
  let currentSlide = 1;
  let numberOfSlides;
  let callbacks;

  exports.display = function(addCallbacks) {
    if (iframe) {
      throw new Error("Attemted to call slides.display() twice");
    }
    return new Promise((resolve, reject) => {
      callbacks = addCallbacks;
      // FIXME: a lot of this iframe logic is in ui.js; maybe move to util.js
      iframe = document.createElement("iframe");
      iframe.src = browser.extension.getURL("blank.html");
      iframe.id = "firefox-screenshots-onboarding-iframe";
      iframe.style.zIndex = "99999999999";
      iframe.style.display = "block";
      iframe.style.border = "none";
      iframe.style.position = "fixed";
      iframe.style.top = "0";
      iframe.style.left = "0";
      iframe.style.margin = "0";
      iframe.style.backgroundColor = "transparent";
      iframe.scrolling = "no";
      updateIframeSize();
      let html = onboardingHtml.replace("<style></style>", `<style>${onboardingCss}</style>`);
      html = html.replace(/MOZ_EXTENSION([^"]+)/g, (match, filename) => {
        return browser.extension.getURL(filename);
      });
      iframe.addEventListener("load", catcher.watchFunction(() => {
        doc = iframe.contentDocument;
        assertIsBlankDocument(doc);
        const parsedDom = (new DOMParser()).parseFromString(
          html,
          "text/html"
        );
        doc.replaceChild(
          doc.adoptNode(parsedDom.documentElement),
          doc.documentElement
        );
        doc.addEventListener("keyup", onKeyUp);
        doc.documentElement.dir = browser.i18n.getMessage("@@bidi_dir");
        doc.documentElement.lang = browser.i18n.getMessage("@@ui_locale");
        localizeText(doc);
        activateSlide(doc);
        // Give the DOM a moment to settle before applying focus
        setTimeout(() => {
          iframe.contentWindow.focus();
        });
        resolve();
      }), {once: true});
      document.body.appendChild(iframe);
      window.addEventListener("resize", onResize);
    });
  };

  exports.remove = exports.unload = function() {
    window.removeEventListener("resize", onResize);
    if (doc) {
      doc.removeEventListener("keyup", onKeyUp);
    }
    util.removeNode(iframe);
    iframe = doc = null;
    currentSlide = 1;
    numberOfSlides = undefined;
    callbacks = undefined;
  };

  function localizeText(doc) {
    let els = doc.querySelectorAll("[data-l10n-id]");
    for (const el of els) {
      const id = el.getAttribute("data-l10n-id");
      const text = browser.i18n.getMessage(id);
      el.textContent = text;
    }
    els = doc.querySelectorAll("[data-l10n-label-id]");
    for (const el of els) {
      const id = el.getAttribute("data-l10n-label-id");
      const text = browser.i18n.getMessage(id);
      el.setAttribute("aria-label", text);
    }
    // termsAndPrivacyNoticeCloudServices is a more complicated substitution:
    const termsContainer = doc.querySelector(".onboarding-legal-notice");
    termsContainer.innerHTML = "";
    const termsSentinel = "__TERMS__";
    const privacySentinel = "__PRIVACY__";
    const sentinelSplitter = "!!!";
    const linkTexts = {
      [termsSentinel]: browser.i18n.getMessage("termsAndPrivacyNoticeTermsLink"),
      [privacySentinel]: browser.i18n.getMessage("termsAndPrivacyNoticyPrivacyLink"),
    };
    const linkUrls = {
      [termsSentinel]: "https://www.mozilla.org/about/legal/terms/services/",
      [privacySentinel]: "https://www.mozilla.org/privacy/firefox/",
    };
    const text = browser.i18n.getMessage(
      "termsAndPrivacyNotice2",
      [sentinelSplitter + termsSentinel + sentinelSplitter,
       sentinelSplitter + privacySentinel + sentinelSplitter]);
    const parts = text.split(sentinelSplitter);
    for (const part of parts) {
      let el;
      if (part === termsSentinel || part === privacySentinel) {
        el = doc.createElement("a");
        el.href = linkUrls[part];
        el.textContent = linkTexts[part];
        el.target = "_blank";
        el.id = (part === termsSentinel) ? "terms" : "privacy";
      } else {
        el = doc.createTextNode(part);
      }
      termsContainer.appendChild(el);
    }
  }

  function activateSlide(doc) {
    numberOfSlides = parseInt(doc.querySelector("[data-number-of-slides]").getAttribute("data-number-of-slides"), 10);
    doc.querySelector("#next").addEventListener("click", watchFunction(assertIsTrusted(() => {
      shooter.sendEvent("navigate-slide", "next");
      next();
    })));
    doc.querySelector("#prev").addEventListener("click", watchFunction(assertIsTrusted(() => {
      shooter.sendEvent("navigate-slide", "prev");
      prev();
    })));
    for (const el of doc.querySelectorAll(".goto-slide")) {
      el.addEventListener("click", watchFunction(assertIsTrusted((event) => {
        shooter.sendEvent("navigate-slide", "goto");
        const el = event.target;
        const index = parseInt(el.getAttribute("data-number"), 10);
        setSlide(index);
      })));
    }
    doc.querySelector("#skip").addEventListener("click", watchFunction(assertIsTrusted((event) => {
      shooter.sendEvent("cancel-slides", "skip");
      callbacks.onEnd();
    })));
    doc.querySelector("#done").addEventListener("click", watchFunction(assertIsTrusted((event) => {
      shooter.sendEvent("finish-slides", "done");
      callbacks.onEnd();
    })));
    doc.querySelector("#slide-overlay").addEventListener("click", watchFunction(assertIsTrusted((event) => {
      if (event.target === doc.querySelector("#slide-overlay")) {
        shooter.sendEvent("cancel-slides", "background-click");
        callbacks.onEnd();
      }
    })));
    setSlide(1);
  }

  function next() {
    setSlide(currentSlide + 1);
  }

  function prev() {
    setSlide(currentSlide - 1);
  }

  const onResize = catcher.watchFunction(function() {
    if (!iframe) {
      log.warn("slides onResize called when iframe is not setup");
      return;
    }
    updateIframeSize();
  });

  function updateIframeSize() {
    iframe.style.height = window.innerHeight + "px";
    iframe.style.width = window.innerWidth + "px";
  }

  const onKeyUp = catcher.watchFunction(assertIsTrusted(function(event) {
    if ((event.key || event.code) === "Escape") {
      shooter.sendEvent("cancel-slides", "keyboard-escape");
      callbacks.onEnd();
    }
    if ((event.key || event.code) === "ArrowRight") {
      shooter.sendEvent("navigate-slide", "keyboard-arrowright");
      next();
    }
    if ((event.key || event.code) === "ArrowLeft") {
      shooter.sendEvent("navigate-slide", "keyboard-arrowleft");
      prev();
    }
  }));

  function setSlide(index) {
    if (index < 1) {
      index = 1;
    }
    if (index > numberOfSlides) {
      index = numberOfSlides;
    }
    shooter.sendEvent("visited-slide", `slide-${index}`);
    currentSlide = index;
    const slideEl = doc.querySelector("#slide-container");
    for (let i = 1; i <= numberOfSlides; i++) {
      const className = `active-slide-${i}`;
      if (i === currentSlide) {
        slideEl.classList.add(className);
      } else {
        slideEl.classList.remove(className);
      }
    }
  }

  return exports;
})();
null;
