# Ringside design system

## Taste (from taste.md)
- **IS:** Live (things tick; numbers flip in place), Exact (tabular figures, ticks shown, prices to 0.001), Ringside-close (corner red/blue, rope lines, chalk, the bell).
- **NEVER:** Casino (no gold, glow, confetti), Crypto-template (no purple gradients, glass cards, neon-on-black single accent), Spreadsheet (no grey terminal grids as the face).
- **Feel in motion:** mechanical and quick. Price cells flip 140 ms with a 2 px settle; the odds line draws continuously at 10 Hz; KO / bell / reveal get one slower beat (700 ms). No floaty easing, no fade-up on every section.
- **Material:** slate chalkboard (live surfaces), ticket stock with stamped ink (fills, receipts, /proof, /docs).
- **Lines not to cross:** never hide a price behind animation; every number comes from chain or results.json; no pressure copy.

## Direction: "Slate & Ticket"
The bookmaker's slate board where prices are wiped and re-chalked every tick, and the ticket it prints when you trade. Live screens are slate; anything that is a record (a fill, a rejection, a receipt, the proof page, the docs) is printed on ticket stock and stamped.

## Tokens
```css
--slate: #171b19;      /* ground: slate chalkboard (sampled) */
--slate-2: #1f2522;    /* raised board */
--slate-3: #0e1110;    /* split-flap cell */
--rule: #333b37;       /* chalk rule lines */
--chalk: #ecebe4;      /* text on slate */
--chalk-quiet: #9aa39c;/* quiet text on slate (4.9:1) */
--red: #d6333f;        /* red corner pad (fill) */
--red-ink: #ff6b72;    /* red as text on slate */
--blue: #3b6fe0;       /* blue corner pad (fill) */
--blue-ink: #8fb0ff;   /* blue as text on slate */
--brass: #c9a24a;      /* the bell: rare accent (KO, reveal, links) */
--ticket: #f1e9d6;     /* ticket stock ground */
--ticket-2: #f8f2e3;
--ink: #22201a;        /* ink on ticket */
--ink-quiet: #5d5644;
--stamp-red: #b8232f;  /* REJECTED stamp */
--stamp-blue: #22479e; /* FILLED stamp */
```
Meaning is fixed: red = corner A, blue = corner B, brass = the bell (state change), stamp red = rejected, stamp blue = filled.

## Type
- Display: **Big Shoulders Display** 800/900, uppercase, line-height 0.86–0.9, tracking −0.01em. Hero `clamp(56px, 8vw, 128px)`; h2 `clamp(32px, 4.5vw, 72px)`.
- Numbers: **IBM Plex Mono** 500/600, tabular. Price cells 34–56 px. Ticks zero-padded to 6 digits.
- Body: **Hanken Grotesk** 400/500, 16–18 px, line-height 1.55, 55–70 ch.
- Labels: Plex Mono 12–13 px, +0.04em, caps only for state words (LIVE, TICK, ROUND).

## Motion
- Durations: `flip 140ms`, `ui 280ms`, `beat 700ms`. Easing: `snap = cubic-bezier(.2,.9,.1,1)` (enter), `out = cubic-bezier(.4,0,1,1)` (exit).
- Price cell: digit flips vertically (translateY −100% → 0) only when the digit changes; red/blue tint 400 ms on up/down.
- Fill / reject ticket: slides up 280 ms, the stamp lands with a 1.06 → 1 scale and −8° rotation (press and settle).
- KO / bell: brass rule sweeps across the board (700 ms), scorebug reads the result.
- Reduced motion: no flips or sweeps; values swap instantly; the odds line still updates.

## Signature moment
**Wipe and re-chalk.** On every price change the old number is wiped by a chalk swipe (a 140 ms clip-path wipe with a chalk-dust texture) and the new one is written. In Judge mode the two books sit side by side; the TV-delay board visibly re-chalks five seconds late while the courtsider's tickets get stamped FILLED there and REJECTED · STALE TICK on Ringside.

## Components
Header scorebug (live clock + tick freshness, pinned on every page) · lobby rows (numbered like a fight card: `01 RED vs BLUE … 0.62`) · split-flap price cell · odds line (uPlot, red above / blue below 50%) · arena (Pixi: canvas ring with rope lines, corner pads) · trade ticket (Buy Red / Buy Blue / Sell, qty stepper, seen tick, latency) · stamp · judge dual board · replay scrubber + Verify ✓ · proof charts on ticket stock.

## Play
1. Trade on a live fight (buy red/blue; see the fill stamped with its tick).
2. Judge mode: watch the courtsider get filled on the delayed board and rejected on Ringside.
3. Scrub a replay and press Verify: the hash chain re-computes in your browser.
4. Fight: control a fighter (WASD / tap) against the AI.

## 2026-11-27 · Current direction (owner's pick): broadcast-poster structure, one hue
Structure and motion follow the owner's chosen reference closely (marquee bar, hanging tabs, shard hero with a giant spaced wordmark, card that grows full-bleed, word-fill statement, stacked numbered chapters, chevron slider, giant numbers behind a ticket, ticket pile CTA, shard menu, dark footer with rising wordmark).
Palette is one hue family plus neutrals: coral #f4845f (main surfaces, tabs), deep coral #d4572f (cards, accents on paper), oxblood #2b1611 (dark chapters), ink #0b0c14, paper #f3eee4, mint #c9f7e6 (marquee bar only), beige #e7d5bd (wordmark on ink). Corner red/blue appear only where they carry match data (arena, odds, fills). Type: Schibsted Grotesk (sentence case, tight tracking), Newsreader for large statements, IBM Plex Mono for numbers. All text pairs pass 4.5:1, large text 3:1 (.design/palette-check.mjs).

## Home page v2: the story page (dials CRAZINESS 7, MOTION 7, DENSITY 5, ART 6, PLAY 7, CALM 6)
Stack: GSAP 3 (ScrollTrigger, SplitText) via `useGSAP`, Lenis smooth scroll synced to ScrollTrigger (off for reduced motion and coarse pointers). One ticker. Content is visible without JS: start states are set by script.

Easings: `snap` = cubic-bezier(.2,.9,.1,1) (entrances), `out` = power2.in (exits, 0.6× entrance), `chalk` = steps(6) (wipe). Durations: `flip` 140 ms, `ui` 280 ms, `beat` 700 ms, `show` 1.4 s. Staggers 40–60 ms.

### Motion score
| Region | Entrance | Scroll | Idle life | Response |
|---|---|---|---|---|
| Header | — | hides on scroll down, returns on up (ui) | live dot blinks 1 Hz | — |
| Hero | bell rule sweeps (beat), headline lines rise from masks (snap, 60 ms), chalkboard prices chalk in | board drifts 6% slower than text | board re-chalks every live tick (or a replayed price walk between bouts) | CTA presses 0.97 |
| Live card | rows slide up once (ui) | — | split-flap prices flip on change | row hover tints slate-2 |
| The gap (signature) | — | **pinned, scrubbed**: ring clock runs; a hit lands; Ringside book re-chalks at once; the TV clock and TV board follow 5 s later; the courtsider's ticket is stamped FILLED on TV, REJECTED · STALE TICK on Ringside | — | scrub = scroll; arrow keys step |
| Try it (play) | — | — | — | delay slider + "Send the stale order" → ticket slides up, stamp lands (stamp 280 ms) |
| One tick | the six steps light in order as a tick counter advances with scroll (scrub 0.6) | — | — | — |
| Results board | split-flap cells flip from 0 to the results.json value when entering (once) | — | — | — |
| Primitives card | rows rise from masks (once) | — | — | row opens (grid-rows, ui) |
| Sealed ticket | — | — | — | tear the stub (click / Enter) → position revealed |
| Hash tape | — | marquee speed follows scroll velocity | scrolls real state hashes | pause on hover/focus |
| Waitlist | — | — | — | submit → ticket stamped ON THE CARD |
| Footer finale | RINGSIDE wordmark letters rise from the canvas line (show, 50 ms stagger), the bell rule sweeps | — | — | back to the bell (top) |

Reduced motion: no pins, scrubs, marquee or smooth scroll; the gap shows its final frame as a static diagram with both tickets; flaps show final values.
