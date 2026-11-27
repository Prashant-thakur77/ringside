// One list of pages for the header, the menu and the footer.
export const PAGES: { label: string; href: string; blurb: string; isNew?: boolean }[] = [
  { label: "Matches", href: "/matches", blurb: "Tonight's card, every result, replay and verify." },
  { label: "How it works", href: "/how-it-works", blurb: "The five-second gap and the five rounds of a match." },
  { label: "Play", href: "/play", blurb: "Trade a replayed devnet fight, or try to courtside it.", isNew: true },
  { label: "Fight", href: "/fight", blurb: "Stake test-dollars and fight an AI trained by self-play." },
  { label: "Proof", href: "/proof", blurb: "Every measured number, on held-out devnet data." },
  { label: "Agents", href: "/agents", blurb: "Plug Ringside into any AI agent over MCP.", isNew: true },
  { label: "Docs", href: "/docs", blurb: "Program, indexer, pricing, privacy and settlement." },
];
export const MCP_PKG = "ringside-mcp";
