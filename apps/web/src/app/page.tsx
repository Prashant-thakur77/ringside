"use client";
// The story page: hero → statement → the gap → five rounds → try it → receipts → results →
// tonight's card → the undercard → ring the bell → waitlist → FAQ → footer.
import { useEffect } from "react";
import { ScrollTrigger } from "@/lib/motion";
import { useGap, useResults } from "@/lib/home-data";
import { SmoothScroll } from "@/components/home/SmoothScroll";
import { Hero } from "@/components/home/Hero";
import { Statement } from "@/components/home/Statement";
import { TheGap } from "@/components/home/TheGap";
import { Chapters } from "@/components/home/Chapters";
import { TryIt } from "@/components/home/TryIt";
import { Receipts } from "@/components/home/Receipts";
import { ResultsRoll } from "@/components/home/ResultsRoll";
import { Card, useCard } from "@/components/home/Card";
import { Primitives } from "@/components/home/Primitives";
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
      <TheGap />
      <Chapters />
      <TryIt />
      <Receipts />
      <ResultsRoll />
      <Card />
      <Primitives />
      <BellCta liveId={liveId} />
      <Waitlist />
      <Faq />
    </>
  );
}
