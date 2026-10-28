"use client";
// The NOÊSIS landing page (from Chitrakch-Kushwaha/landing-page), wired to the app: every
// "start learning" action opens the roadmap, and the revision deck opens the review cards.
import { useRouter } from "next/navigation";
import { LandingPage } from "./components/landing/LandingPage";

export function Landing() {
  const router = useRouter();
  return <LandingPage onStartLearning={() => router.push("/map")} onOpenDeck={() => router.push("/map?review=1")} />;
}
