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
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add(styles.revealed);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    root.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const tiltCleanups = Array.from(root.querySelectorAll<HTMLElement>("[data-tilt]"), (element) => {
      let frame: number | null = null;
      const reset = () => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        element.style.setProperty("--tilt-x", "0deg");
        element.style.setProperty("--tilt-y", "0deg");
      };
      const move = (event: PointerEvent) => {
        if (!finePointer.matches || event.pointerType === "touch") return;
        const bounds = element.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          element.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
          element.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
          frame = null;
        });
      };
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerleave", reset);
      element.addEventListener("pointercancel", reset);
      return () => {
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerleave", reset);
        element.removeEventListener("pointercancel", reset);
        reset();
      };
    });

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    let activeScrollRaf: number | null = null;

    const onClick = (event: Event) => {
      const mouse = event as MouseEvent;
      if (mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.altKey || mouse.button !== 0) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      const hash = anchor?.getAttribute("href");
      if (!hash || hash === "#") return;
      const targetId = hash.slice(1);
      const target = document.getElementById(targetId);
      if (!target) return;
      event.preventDefault();

      if (activeScrollRaf !== null) {
        cancelAnimationFrame(activeScrollRaf);
        activeScrollRaf = null;
      }

      const startY = window.scrollY;
      const targetRect = target.getBoundingClientRect();
      const targetY = Math.max(0, startY + targetRect.top - 80);
      const distance = targetY - startY;

      if (Math.abs(distance) < 4) {
        history.pushState(null, "", hash);
        return;
      }

      const duration = Math.min(850, Math.max(500, Math.abs(distance) * 0.45));
      const startTime = performance.now();

      const cancelOnInteraction = () => {
        if (activeScrollRaf !== null) {
          cancelAnimationFrame(activeScrollRaf);
          activeScrollRaf = null;
        }
        window.removeEventListener("wheel", cancelOnInteraction);
        window.removeEventListener("touchmove", cancelOnInteraction);
      };

      window.addEventListener("wheel", cancelOnInteraction, { passive: true, once: true });
      window.addEventListener("touchmove", cancelOnInteraction, { passive: true, once: true });

      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = easeInOutCubic(progress);

        window.scrollTo({ top: startY + distance * ease, behavior: "instant" });

        if (progress < 1) {
          activeScrollRaf = requestAnimationFrame(step);
        } else {
          activeScrollRaf = null;
          window.removeEventListener("wheel", cancelOnInteraction);
          window.removeEventListener("touchmove", cancelOnInteraction);
          history.pushState(null, "", hash);
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        }
      };

      activeScrollRaf = requestAnimationFrame(step);
    };
    root.addEventListener("click", onClick);
    return () => {
      observer.disconnect();
      tiltCleanups.forEach((cleanup) => cleanup());
      root.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
