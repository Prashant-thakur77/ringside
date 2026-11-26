// Labels for known bot wallets (AI fighters and spectators are always labeled).
const LABELS: Record<string, string> = JSON.parse(process.env.NEXT_PUBLIC_BOT_LABELS ?? "{}");
export const labelFor = (pk?: string | null) =>
  !pk || pk === "11111111111111111111111111111111" ? "Open corner" : LABELS[pk] || `${pk.slice(0, 4)}…${pk.slice(-4)}`;
export const isBot = (pk?: string | null) => !!(pk && LABELS[pk]);
