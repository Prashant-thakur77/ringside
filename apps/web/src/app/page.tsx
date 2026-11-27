"use client";
// The front door: hero → statement → one tile per page → results → ring the bell → waitlist → FAQ → footer.
import { useEffect } from "react";
import { ScrollTrigger } from "@/lib/motion";
import { useGap, useResults } from "@/lib/home-data";
import { SmoothScroll } from "@/components/home/SmoothScroll";
import { Hero } from "@/components/home/Hero";
import { Statement } from "@/components/home/Statement";
import { ResultsRoll } from "@/components/home/ResultsRoll";
import { useCard } from "@/components/home/Card";
import { Explore } from "@/components/home/Explore";
import { BellCta } from "@/components/home/BellCta";
import { Waitlist } from "@/components/home/Waitlist";
import { Faq } from "@/components/home/Faq";

export default function Home() {
  const { live } = useCard();
  const liveId = live.find((r) => r.status === 1 || r.status === 2)?.match_id;
  const { data: r } = useResults();
  const { data: gap } = useGap();
  // Sections size themselves once data arrives: re-measure every scroll trigger after layout settles.
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [r, gap, live.length]);
  return (
    <>
      <SmoothScroll />
      <Hero liveId={liveId} />
      <Statement />
      <Explore />
      <ResultsRoll />
      <BellCta liveId={liveId} />
      <Waitlist />
      <Faq />
    </>
  );
}
