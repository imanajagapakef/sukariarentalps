import { PageHero } from "@/components/page-hero";
import { MessageSquare, Star } from "lucide-react";
import { Suspense } from "react";
import { FeedbackForm } from "@/components/feedback-form";

export const metadata = { title: "Feedback — Klub Sukaria" };

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:px-8">
      <PageHero
        eyebrow={{ icon: Star, label: "Masukan kamu" }}
        title="Feedback"
        titleIcon={MessageSquare}
        description="Gimana pengalaman main kamu?"
      />
      <div className="mt-6">
        <Suspense fallback={null}>
          <FeedbackForm />
        </Suspense>
      </div>
    </div>
  );
}
