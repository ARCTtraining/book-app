"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker.
 *
 * Registration is deliberately deferred to `load` so the worker install never
 * competes with the first paint for bandwidth on a phone.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Offline caching is an enhancement; the app works without it.
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
