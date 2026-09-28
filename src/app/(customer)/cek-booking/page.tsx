"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function CekBookingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [notFound, setNotFound] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setNotFound(false);
    const res = await fetch(`/api/bookings/${c}`);
    if (res.ok) router.push(`/tiket/${c}`);
    else setNotFound(true);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-4xl">Cek Booking</h1>
      <p className="mt-2 text-muted-foreground">Masukkan kode tiket dari notifikasi kamu.</p>

      <Card className="mt-8">
        <CardContent>
          <form onSubmit={lookup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Kode Booking</Label>
              <Input
                id="code"
                placeholder="SR-XXXXXX"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-display uppercase tracking-widest"
                autoComplete="off"
              />
            </div>
            {notFound && (
              <p role="alert" className="text-sm text-danger">
                Booking dengan kode itu tidak ditemukan.
              </p>
            )}
            <Button type="submit" className="w-full">
              Cari Tiket
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
