"use client";

import { useEffect } from "react";

/**
 * Parks every running animation while the tab is hidden.
 *
 * The home page keeps roughly fifty CSS animations alive at once — the hero
 * game loop, the bracket, the marquee, the status pings — and CSS animations are
 * not throttled just because nobody is looking. A backgrounded tab on a phone
 * would otherwise keep painting for nothing.
 *
 * One class on `<html>` pauses them all through a single rule in globals.css
 * (`html.motion-paused *`), and `animation-play-state` resumes them where they
 * left off rather than restarting them.
 */
export function MotionPause() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle("motion-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      root.classList.remove("motion-paused");
    };
  }, []);

  return null;
}
