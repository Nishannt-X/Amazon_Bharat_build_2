"use client";

import { useEffect, useLayoutEffect } from "react";
import styles from "./LandingPage.module.css";

/** All page content is visible on the server; motion is an enhancement. */
export default function LandingMotion() {
  useLayoutEffect(() => {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const startAtTop = () => {
      // Explicit section links still open their requested section.
      if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };
    startAtTop();
    window.addEventListener("pageshow", startAtTop);
    return () => {
      history.scrollRestoration = previousRestoration;
      window.removeEventListener("pageshow", startAtTop);
    };
  }, []);

  useEffect(() => {
    const root = document.querySelector(`.${styles.landing}`);
    if (!root) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (!preference.matches) entry.target.classList.add(styles.revealed);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    root.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));

    const onClick = (event: Event) => {
      const mouse = event as MouseEvent;
      if (mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.altKey || mouse.button !== 0) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      const target = anchor && document.getElementById(anchor.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: preference.matches ? "auto" : "smooth", block: "start" });
      history.pushState(null, "", anchor.hash);
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    };
    root.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      root.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
