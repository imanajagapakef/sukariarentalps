"use client";

import { useEffect } from "react";
import { onCLS, onINP, onLCP } from "web-vitals";

type Metric = { name: string; value: number; rating?: string };

function send(m: Metric) {
  const body = JSON.stringify({
    metric: m.name,
    value: m.value,
    rating: m.rating,
    path: window.location.pathname,
  });
  navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
}

/** Reports Core Web Vitals to /api/vitals (beacon, survives tab unload). */
export function WebVitals() {
  useEffect(() => {
    onLCP(send);
    onINP(send);
    onCLS(send);
  }, []);
  return null;
}