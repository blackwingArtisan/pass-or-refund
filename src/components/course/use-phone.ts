"use client";

import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 640px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True at phone width, for the few screens that need a different shape there and not just smaller text. */
export const usePhone = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
