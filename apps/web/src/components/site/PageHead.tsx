// The top of every inner page: eyebrow, big title, one lead line, on the coral band.
export function PageHead({ eyebrow, title, lead, children }: { eyebrow: string; title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="relative overflow-hidden bg-hue text-slate">
      <div aria-hidden className="pointer-events-none absolute -right-24 top-0 h-full w-[46%] bg-hue-deep [clip-path:polygon(28%_0,100%_0,100%_100%,0_100%)]" />
      <div className="relative mx-auto max-w-[1400px] px-4 pb-14 pt-16 md:px-8 md:pb-20 md:pt-24">
        <p className="num text-[12px] font-semibold tracking-[.18em]">{eyebrow}</p>
        <h1 className="display mt-3 max-w-[14ch] text-[clamp(52px,8.5vw,140px)] font-semibold leading-[.92]">{title}</h1>
        {lead && <p className="mt-6 max-w-[56ch] text-[clamp(17px,1.5vw,21px)] leading-relaxed">{lead}</p>}
        {children}
      </div>
      <div aria-hidden className="relative h-[10px] bg-hue-dark" />
    </header>
  );
}
