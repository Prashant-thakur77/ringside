// Latency telemetry: OpenTelemetry spans per transaction, exported to the indexer's latency table.
import { trace, type Span } from "@opentelemetry/api";
import { BasicTracerProvider, type ReadableSpan, type SpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import os from "node:os";

const INDEXER = process.env.INDEXER_URL ?? "http://127.0.0.1:8787";

class IndexerExporter implements SpanExporter {
  export(spans: ReadableSpan[], done: (r: { code: number }) => void) {
    const rows = spans.map((s) => ({
      kind: s.name,
      ms: s.duration[0] * 1e3 + s.duration[1] / 1e6,
      match_key: (s.attributes["match"] as string) ?? null,
      signature: (s.attributes["sig"] as string) ?? null,
      host: os.hostname(),
    }));
    fetch(`${INDEXER}/latency`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rows) })
      .then(() => done({ code: 0 }))
      .catch(() => done({ code: 0 }));
  }
  shutdown() {
    return Promise.resolve();
  }
}

const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(new IndexerExporter())] });
trace.setGlobalTracerProvider(provider);
export const tracer = trace.getTracer("ringside-bots");

/** Runs `fn` inside a span named `kind`; records the signature and match on the span. */
export async function timed<T extends { sig?: string }>(kind: string, attrs: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(kind, async (span: Span) => {
    for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v);
    try {
      const r = await fn();
      if (r?.sig) span.setAttribute("sig", r.sig);
      return r;
    } catch (e) {
      span.setAttribute("error", String((e as Error).message).slice(0, 200));
      throw e;
    } finally {
      span.end();
    }
  });
}
