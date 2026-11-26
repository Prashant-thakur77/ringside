//! OpenTelemetry for the indexer: `tracing` spans → an OpenTelemetry tracer whose exporter writes
//! each span's duration into the same `latency` table the bots report to.

use futures::future::BoxFuture;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_sdk::export::trace::{ExportResult, SpanData, SpanExporter};
use opentelemetry_sdk::trace::TracerProvider;
use sqlx::PgPool;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

#[derive(Debug)]
struct PgExporter(PgPool);

impl SpanExporter for PgExporter {
    fn export(&mut self, batch: Vec<SpanData>) -> BoxFuture<'static, ExportResult> {
        let pool = self.0.clone();
        Box::pin(async move {
            for s in batch {
                let ms = s.end_time.duration_since(s.start_time).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0);
                let _ = sqlx::query("INSERT INTO latency (kind, ms, host) VALUES ($1, $2, 'indexer')").bind(s.name.to_string()).bind(ms).execute(&pool).await;
            }
            Ok(())
        })
    }
}

pub fn init(db: PgPool) {
    let provider = TracerProvider::builder().with_batch_exporter(PgExporter(db), opentelemetry_sdk::runtime::Tokio).build();
    let tracer = provider.tracer("ringside-indexer");
    opentelemetry::global::set_tracer_provider(provider);
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_opentelemetry::layer().with_tracer(tracer))
        .init();
}
