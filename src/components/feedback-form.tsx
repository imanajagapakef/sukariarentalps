"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const ASPECTS = [
  { key: "service_rating", label: "Pelayanan" },
  { key: "unit_rating", label: "Konsol / Unit" },
  { key: "cleanliness_rating", label: "Kebersihan" },
] as const;

function Stars({ name, value, onChange }: { name: string; value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} bintang`}
          onClick={() => onChange(n)}
          className={`font-display text-2xl transition-colors ${n <= value ? "text-primary" : "text-muted hover:text-on-surface-variant"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function FeedbackForm() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) return;
    setStatus("sending");
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(code ? { booking_code: code } : {}),
        rating,
        ...Object.fromEntries(Object.entries(aspects).filter(([, v]) => v > 0)),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    });
    setStatus(res.ok ? "done" : "error");
  }

  if (status === "done") {
    return (
      <Card className="mt-8">
        <CardContent className="p-8 text-center">
          <p className="font-display text-2xl uppercase text-primary">Makasih!</p>
          <p className="mt-2 text-sm text-muted-foreground">Masukan kamu bikin kami makin asik.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8">
      <CardContent>
        <form onSubmit={send} className="space-y-6">
          {code && <p className="text-sm text-muted-foreground">Untuk booking <span className="font-medium text-foreground">{code}</span></p>}
          <div className="space-y-2">
            <Label>Rating keseluruhan *</Label>
            <Stars name="Rating keseluruhan" value={rating} onChange={setRating} />
          </div>
          {ASPECTS.map((a) => (
            <div key={a.key} className="space-y-2">
              <Label>{a.label}</Label>
              <Stars
                name={a.label}
                value={aspects[a.key] ?? 0}
                onChange={(n) => setAspects({ ...aspects, [a.key]: n })}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="comment">Komentar</Label>
            <textarea
              id="comment"
              value={comment}
              maxLength={1000}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Ceritain pengalamanmu…"
              className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          {status === "error" && <p className="text-sm text-danger">Gagal kirim, coba lagi.</p>}
          <Button type="submit" className="w-full" disabled={rating < 1 || status === "sending"}>
            {status === "sending" ? "Mengirim…" : "Kirim Feedback"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
