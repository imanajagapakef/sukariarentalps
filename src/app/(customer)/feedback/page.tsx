import { Suspense } from "react";
import { FeedbackForm } from "@/components/feedback-form";

export const metadata = { title: "Feedback — Klub Sukaria" };

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-4xl">Feedback</h1>
      <p className="mt-2 text-muted-foreground">Gimana pengalaman main kamu?</p>
      <Suspense fallback={null}>
        <FeedbackForm />
      </Suspense>
    </div>
  );
}
