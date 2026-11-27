import { loadFont as schibsted } from "@remotion/google-fonts/SchibstedGrotesk";
import { loadFont as newsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as plexMono } from "@remotion/google-fonts/IBMPlexMono";
import { film } from "./film";

// The site's own type: Schibsted Grotesk display, Newsreader serif statements, IBM Plex Mono for ticks and prices.
const display = schibsted("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });
const serif = newsreader("normal", { weights: ["400", "500"], subsets: ["latin"] });
const code = plexMono("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

/** Site palette (apps/web/src/app/globals.css). Red/blue only mark the two corners. */
export const P = {
  hue: "#f4845f", hueDeep: "#d4572f", oxblood: "#2b1611", ink: "#0b0c14", ink2: "#171925", ink3: "#5d6070",
  paper: "#f3eee4", paper2: "#e7dfd0", mint: "#c9f7e6", beige: "#e7d5bd",
  red: "#ff5a4e", blue: "#4c8dff", good: "#3fbf8a", bad: "#ff5a4e",
  // legacy names used by shared components
  stamp: "#d4572f", stampText: "#d4572f", stampOnInk: "#f4845f", carbon: "#2b1611", carbonSoft: "#e7d5bd",
  flap: "#171925", mark: "#c9f7e6", ok: "#3fbf8a", flag: "#d4572f", flagBg: "#e7d5bd", paper3: "#d9d0ba",
};

export const T = {
  ...film.theme,
  font: display.fontFamily,
  serifFont: serif.fontFamily,
  monoFont: code.fontFamily,
  hindiFont: display.fontFamily,
  h1: 112, h2: 76, h3: 52, body: 40, small: 30, label: 26,
  safeX: 96, safeY: 84,
};
