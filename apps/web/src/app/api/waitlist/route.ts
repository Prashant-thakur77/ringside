// Waitlist sign-up, stored in Cloudflare D1. One row per email; nothing is sent from here.
import { getCloudflareContext } from "@opennextjs/cloudflare";

const ROLES = ["trader", "fighter", "builder", "watching"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface D1 {
  prepare(q: string): { bind(...v: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null> } };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; role?: unknown; website?: unknown };
  if (body.website) return Response.json({ ok: true, n: 0 }); // filled only by bots
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) return Response.json({ error: "That email address doesn't look right." }, { status: 400 });
  const role = typeof body.role === "string" && ROLES.includes(body.role) ? body.role : "watching";
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as unknown as { WAITLIST: D1 }).WAITLIST;
    await db.prepare("INSERT INTO waitlist (email, role, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO NOTHING").bind(email, role, Date.now()).run();
    const row = await db.prepare("SELECT id FROM waitlist WHERE email = ?1").bind(email).first<{ id: number }>();
    return Response.json({ ok: true, n: row?.id ?? 0 });
  } catch {
    return Response.json({ error: "The waitlist is unavailable for a moment. Try again shortly." }, { status: 503 });
  }
}
