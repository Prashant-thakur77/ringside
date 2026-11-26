// Labels for known bot wallets (AI fighters and spectators are always labeled).
const LABELS: Record<string, string> = JSON.parse(process.env.NEXT_PUBLIC_BOT_LABELS ?? "{}");
export const labelFor = (pk?: string | null) => (pk && LABELS[pk]) || (pk ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : "open");
export const isBot = (pk?: string | null) => !!(pk && LABELS[pk]);
