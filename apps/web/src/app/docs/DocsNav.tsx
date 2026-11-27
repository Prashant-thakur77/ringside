"use client";
// Docs navigation: a sticky contents list that marks the section being read (a chip row on phones).
import { useEffect, useState } from "react";

export function DocsNav({ sections }: { sections: [string, string][] }) {
  const [active, setActive] = useState(sections[0][0]);
  useEffect(() => {
    // The active section is the last one whose heading has passed 30% of the viewport.
    const on = () => {
      let cur = sections[0][0];
      for (const [id] of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < innerHeight * 0.3) cur = id;
      }
      setActive(cur);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [sections]);
  return (
    <nav aria-label="On this page" className="sticky top-[52px] z-10 -mx-4 overflow-x-auto bg-paper/95 px-4 py-3 backdrop-blur md:top-24 md:mx-0 md:self-start md:overflow-visible md:bg-transparent md:p-0 md:pt-10">
      <p className="num mb-3 hidden text-[12px] text-slate/60 md:block">ON THIS PAGE</p>
      <ul className="flex gap-2 md:block md:space-y-0.5">
        {sections.map(([id, label]) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              aria-current={active === id ? "true" : undefined}
              className={`block whitespace-nowrap rounded-full px-3 py-1.5 text-[14px] transition-colors md:rounded-md md:px-3 md:py-1.5 ${active === id ? "bg-slate text-chalk" : "text-slate/70 hover:text-slate"}`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
