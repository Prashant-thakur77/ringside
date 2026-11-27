"use client";
// How it works: the five-second gap on a real devnet match, the five rounds of a match, and the MagicBlock pieces.
import { useEffect } from "react";
import { ScrollTrigger } from "@/lib/motion";
import { useGap } from "@/lib/home-data";
import { PageHead } from "@/components/site/PageHead";
import { TheGap } from "@/components/home/TheGap";
import { Chapters } from "@/components/home/Chapters";
import { Primitives } from "@/components/home/Primitives";
import { SmoothScroll } from "@/components/home/SmoothScroll";

export default function HowItWorks() {
  const { data: gap } = useGap();
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [gap]);
  return (
    <>
      <SmoothScroll />
      <PageHead eyebrow="HOW IT WORKS" title="One rollup. One clock." lead="The fight and the order book live in the same MagicBlock ephemeral rollup. The instruction that moves the fighters also re-prices the book, so a price can never be older than the punch it describes." />
      <TheGap />
      <Chapters />
      <Primitives />
    </>
  );
}
