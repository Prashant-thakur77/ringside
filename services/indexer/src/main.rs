//! Ringside indexer: follows the TEE rollup (token-authenticated) and the base layer, stores
//! ticks, quotes, trades, rejections, seeds and hashes in Postgres, measures cadence and latency,
//! verifies MatchRecord receipts (retrying finalize when the action did not land) and serves
//! REST + SSE for the web app.

mod events;
mod otel;

use anyhow::{anyhow, Context, Result};
use axum::extract::{Path, Query, State};
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use ed25519_dalek::{Signer, SigningKey};
use events::{decode_market, decode_match, events_from_logs, Event, MarketView, MatchView};
use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::wrappers::BroadcastStream;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

const PROGRAM_ID: &str = "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej";
const MAGIC_PROGRAM: &str = "Magic11111111111111111111111111111111111111";
const MAGIC_CONTEXT: &str = "MagicContext1111111111111111111111111111111";
const MATCH_SIZE: u64 = 8 + 1224;

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

#[derive(Clone)]
struct Cfg {
    base_rpc: String,
    er_rpc: String,
    tee: bool,
    key: Arc<SigningKey>,
}

struct Shared {
    cfg: Cfg,
    db: PgPool,
    http: reqwest::Client,
    tx: broadcast::Sender<Value>,
    token: RwLock<Option<(String, i64)>>,
    seen: RwLock<std::collections::HashSet<String>>,
    following: RwLock<std::collections::HashSet<String>>,
    live: RwLock<HashMap<String, (MatchView, Option<MarketView>, Option<MarketView>)>>,
}

type S = Arc<Shared>;

fn load_key(path: &str) -> Result<SigningKey> {
    let bytes: Vec<u8> = serde_json::from_str(&std::fs::read_to_string(path).with_context(|| format!("read {path}"))?)?;
    let seed: [u8; 32] = bytes[..32].try_into()?;
    Ok(SigningKey::from_bytes(&seed))
}

fn pubkey_b58(k: &SigningKey) -> String {
    bs58::encode(k.verifying_key().to_bytes()).into_string()
}

// ─────────────────────────── RPC and TEE auth ───────────────────────────

impl Shared {
    async fn er_url(&self) -> Result<String> {
        if !self.cfg.tee {
            return Ok(self.cfg.er_rpc.clone());
        }
        {
            let t = self.token.read().await;
            if let Some((tok, exp)) = t.as_ref() {
                if now_ms() < exp - 300_000 {
                    return Ok(format!("{}?token={}", self.cfg.er_rpc, tok));
                }
            }
        }
        let pk = pubkey_b58(&self.cfg.key);
        let ch: Value = self
            .http
            .get(format!("{}/auth/challenge?pubkey={}", self.cfg.er_rpc, pk))
            .send()
            .await?
            .json()
            .await?;
        let challenge = ch["challenge"].as_str().ok_or_else(|| anyhow!("no challenge: {ch}"))?.to_string();
        let sig = self.cfg.key.sign(challenge.as_bytes());
        let login: Value = self
            .http
            .post(format!("{}/auth/login", self.cfg.er_rpc))
            .json(&json!({"pubkey": pk, "challenge": challenge, "signature": bs58::encode(sig.to_bytes()).into_string()}))
            .send()
            .await?
            .json()
            .await?;
        let tok = login["token"].as_str().ok_or_else(|| anyhow!("login failed: {login}"))?.to_string();
        let exp = login["expiresAt"].as_i64().unwrap_or(now_ms() + 30 * 24 * 3600 * 1000);
        *self.token.write().await = Some((tok.clone(), exp));
        info!("TEE token refreshed");
        Ok(format!("{}?token={}", self.cfg.er_rpc, tok))
    }

    async fn rpc(&self, url: &str, method: &str, params: Value) -> Result<Value> {
        let r: Value = self
            .http
            .post(url)
            .json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
            .send()
            .await?
            .json()
            .await?;
        if let Some(e) = r.get("error") {
            return Err(anyhow!("{method}: {e}"));
        }
        Ok(r["result"].clone())
    }

    async fn er(&self, method: &str, params: Value) -> Result<Value> {
        let url = self.er_url().await?;
        self.rpc(&url, method, params).await
    }
}

fn account_data(v: &Value) -> Option<Vec<u8>> {
    use base64::Engine;
    let d = v["data"][0].as_str()?;
    base64::engine::general_purpose::STANDARD.decode(d).ok()
}

// ─────────────────────────── PDA + transaction building ───────────────────────────

fn b58d(s: &str) -> [u8; 32] {
    bs58::decode(s).into_vec().unwrap().try_into().unwrap()
}

/// A PDA must not be a valid ed25519 point.
fn on_curve(b: &[u8; 32]) -> bool {
    ed25519_dalek::VerifyingKey::from_bytes(b).is_ok()
}

fn find_pda(seeds: &[&[u8]], program: &[u8; 32]) -> [u8; 32] {
    for bump in (0u8..=255).rev() {
        let mut h = Sha256::new();
        for s in seeds {
            h.update(s);
        }
        h.update([bump]);
        h.update(program);
        h.update(b"ProgramDerivedAddress");
        let out: [u8; 32] = h.finalize().into();
        if !on_curve(&out) {
            return out;
        }
    }
    panic!("no pda")
}

fn shortvec(n: usize, out: &mut Vec<u8>) {
    let mut v = n;
    loop {
        let mut b = (v & 0x7f) as u8;
        v >>= 7;
        if v != 0 {
            b |= 0x80;
        }
        out.push(b);
        if v == 0 {
            break;
        }
    }
}

struct Ix {
    program: [u8; 32],
    accounts: Vec<([u8; 32], bool, bool)>, // key, signer, writable
    data: Vec<u8>,
}

/// Legacy transaction with a single signer (the fee payer).
fn build_tx(payer: &SigningKey, ixs: &[Ix], blockhash: [u8; 32]) -> Vec<u8> {
    let payer_pk = payer.verifying_key().to_bytes();
    let mut keys: Vec<([u8; 32], bool, bool)> = vec![(payer_pk, true, true)];
    for ix in ixs {
        for (k, s, w) in &ix.accounts {
            if let Some(e) = keys.iter_mut().find(|e| &e.0 == k) {
                e.1 |= *s;
                e.2 |= *w;
            } else {
                keys.push((*k, *s, *w));
            }
        }
        if !keys.iter().any(|e| e.0 == ix.program) {
            keys.push((ix.program, false, false));
        }
    }
    let mut ordered: Vec<([u8; 32], bool, bool)> = vec![];
    for (s, w) in [(true, true), (true, false), (false, true), (false, false)] {
        ordered.extend(keys.iter().filter(|e| e.1 == s && e.2 == w).cloned());
    }
    let n_sig = ordered.iter().filter(|e| e.1).count() as u8;
    let n_ro_signed = ordered.iter().filter(|e| e.1 && !e.2).count() as u8;
    let n_ro_unsigned = ordered.iter().filter(|e| !e.1 && !e.2).count() as u8;
    let idx = |k: &[u8; 32]| ordered.iter().position(|e| &e.0 == k).unwrap() as u8;
    let mut msg = vec![n_sig, n_ro_signed, n_ro_unsigned];
    shortvec(ordered.len(), &mut msg);
    for e in &ordered {
        msg.extend_from_slice(&e.0);
    }
    msg.extend_from_slice(&blockhash);
    shortvec(ixs.len(), &mut msg);
    for ix in ixs {
        msg.push(idx(&ix.program));
        shortvec(ix.accounts.len(), &mut msg);
        for (k, _, _) in &ix.accounts {
            msg.push(idx(k));
        }
        shortvec(ix.data.len(), &mut msg);
        msg.extend_from_slice(&ix.data);
    }
    let sig = payer.sign(&msg);
    let mut tx = vec![];
    shortvec(1, &mut tx);
    tx.extend_from_slice(&sig.to_bytes());
    tx.extend_from_slice(&msg);
    tx
}

fn ix_data(name: &str, match_id: u64) -> Vec<u8> {
    let mut d = Sha256::digest(format!("global:{name}").as_bytes())[..8].to_vec();
    d.extend_from_slice(&match_id.to_le_bytes());
    d
}

#[tracing::instrument(name = "indexer_retry_finalize", skip_all)]
async fn retry_finalize(s: &S, match_id: u64) -> Result<String> {
    let program = b58d(PROGRAM_ID);
    let id = match_id.to_le_bytes();
    let game = find_pda(&[b"match", &id], &program);
    let ml = find_pda(&[b"market", &id, &[0]], &program);
    let md = find_pda(&[b"market", &id, &[1]], &program);
    let record = find_pda(&[b"record", &id], &program);
    let payer = s.cfg.key.verifying_key().to_bytes();
    let (mp, mc) = (b58d(MAGIC_PROGRAM), b58d(MAGIC_CONTEXT));
    let fin = Ix {
        program,
        accounts: vec![
            (payer, true, true),
            (game, false, true),
            (ml, false, true),
            (md, false, true),
            (record, false, false),
            (program, false, false),
            (mp, false, false),
            (mc, false, true),
        ],
        data: ix_data("finalize", match_id),
    };
    let cm = Ix {
        program,
        accounts: vec![(payer, true, true), (game, false, true), (mp, false, false), (mc, false, true)],
        data: ix_data("commit_match", match_id),
    };
    let bh = s.er("getLatestBlockhash", json!([{"commitment":"confirmed"}])).await?;
    let blockhash = b58d(bh["value"]["blockhash"].as_str().ok_or_else(|| anyhow!("no blockhash"))?);
    use base64::Engine;
    let tx = base64::engine::general_purpose::STANDARD.encode(build_tx(&s.cfg.key, &[fin, cm], blockhash));
    let sig = s.er("sendTransaction", json!([tx, {"encoding":"base64"}])).await?;
    Ok(sig.as_str().unwrap_or_default().to_string())
}

// ─────────────────────────── ingestion ───────────────────────────

#[tracing::instrument(name = "indexer_store_event", skip_all)]
async fn store_event(s: &S, sig: &str, ev: &Event, failed: bool) -> Result<()> {
    let ms = now_ms();
    match ev {
        Event::Tick {
            match_key,
            tick,
            inputs,
            flags,
            fair_p,
            state_hash,
        } => {
            sqlx::query("INSERT INTO ticks (match_key,tick,input_a,input_b,flags,fair_p,state_hash,signature,seen_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING")
                .bind(match_key).bind(*tick as i32).bind(inputs[0] as i32).bind(inputs[1] as i32).bind(*flags as i64).bind(fair_p).bind(state_hash).bind(sig).bind(ms)
                .execute(&s.db).await?;
            sqlx::query("INSERT INTO hashes (match_key,tick,state_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING")
                .bind(match_key)
                .bind(*tick as i32)
                .bind(state_hash)
                .execute(&s.db)
                .await?;
        }
        Event::Trade {
            market,
            trader,
            tick,
            game_tick,
            seen_tick,
            price,
            qty,
            side,
            dir,
            mode,
            ..
        } => {
            sqlx::query("INSERT INTO trades (signature,market,mode,trader,tick,seen_tick,price,qty,side,dir,seen_ms,game_tick) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING")
                .bind(sig).bind(market).bind(*mode as i16).bind(trader).bind(*tick as i64).bind(*seen_tick as i64).bind(*price as i64).bind(*qty as i64).bind(*side as i16).bind(*dir as i16).bind(ms).bind(*game_tick as i64)
                .execute(&s.db).await?;
        }
        Event::Reject {
            market,
            trader,
            tick,
            seen_tick,
            reason,
            mode,
        } => {
            sqlx::query("INSERT INTO rejections (signature,market,mode,trader,tick,seen_tick,reason,failed_tx,seen_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING")
                .bind(sig).bind(market).bind(*mode as i16).bind(trader).bind(*tick as i64).bind(*seen_tick as i64).bind(*reason as i32).bind(failed).bind(ms)
                .execute(&s.db).await?;
        }
        Event::Seed {
            match_key,
            wave,
            apply_at_tick,
            seed,
        } => {
            sqlx::query("INSERT INTO seeds (match_key,wave,apply_at_tick,seed,signature) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING")
                .bind(match_key)
                .bind(*wave as i32)
                .bind(*apply_at_tick as i32)
                .bind(seed)
                .bind(sig)
                .execute(&s.db)
                .await?;
        }
        Event::Settle { match_key, .. } => {
            sqlx::query("UPDATE matches SET settle_sig=$2 WHERE match_key=$1")
                .bind(match_key)
                .bind(sig)
                .execute(&s.db)
                .await?;
        }
    }
    Ok(())
}

/// Failed trade transactions (strict mode) carry no event: recover market/trader from the tx.
#[tracing::instrument(name = "indexer_backfill_failed_trade", skip_all)]
async fn store_failed_trade(s: &S, sig: &str, logs: &[String]) -> Result<()> {
    let code = logs
        .iter()
        .find_map(|l| l.split("Error Number: ").nth(1))
        .and_then(|r| r.split('.').next())
        .and_then(|n| n.trim().parse::<i32>().ok());
    let Some(code) = code else { return Ok(()) };
    if !logs.iter().any(|l| l.contains("Instruction: Trade")) {
        return Ok(());
    }
    let tx = s
        .er(
            "getTransaction",
            json!([sig, {"encoding":"json","maxSupportedTransactionVersion":0,"commitment":"confirmed"}]),
        )
        .await?;
    let keys = tx["transaction"]["message"]["accountKeys"].as_array().cloned().unwrap_or_default();
    let ix = &tx["transaction"]["message"]["instructions"][0];
    let accts: Vec<usize> = ix["accounts"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.as_u64().map(|v| v as usize)).collect())
        .unwrap_or_default();
    let key = |i: usize| {
        accts
            .get(i)
            .and_then(|&k| keys.get(k))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };
    let data = bs58::decode(ix["data"].as_str().unwrap_or_default()).into_vec().unwrap_or_default();
    let seen_tick = data.get(16..24).map(|b| u64::from_le_bytes(b.try_into().unwrap())).unwrap_or(0);
    let market = key(4);
    let mode: Option<i16> = s.live.read().await.values().find_map(|(m, _, _)| {
        if m.market_delayed == market {
            Some(1)
        } else if m.market_live == market {
            Some(0)
        } else {
            None
        }
    });
    sqlx::query("INSERT INTO rejections (signature,market,mode,trader,tick,seen_tick,reason,failed_tx,seen_ms) VALUES ($1,$2,$3,$4,0,$5,$6,TRUE,$7) ON CONFLICT DO NOTHING")
        .bind(sig).bind(&market).bind(mode.unwrap_or(0)).bind(key(1)).bind(seen_tick as i64).bind(code).bind(now_ms())
        .execute(&s.db).await?;
    let _ = s.tx.send(json!({"type":"reject","market":market,"mode":mode.unwrap_or(0),"trader":key(1),"seen_tick":seen_tick,"reason":code,"failed_tx":true,"signature":sig}));
    Ok(())
}

async fn logs_loop(s: S) {
    loop {
        if let Err(e) = logs_once(&s).await {
            warn!("logs stream: {e:#}");
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

async fn logs_once(s: &S) -> Result<()> {
    let url = s.er_url().await?;
    let mut ws = if s.cfg.tee {
        url.replacen("http", "ws", 1)
    } else {
        url.replacen("http", "ws", 1).replace(":7799", ":7800")
    };
    // "wss://host?token=.." has an empty path, which the TEE answers with 400: make it "/".
    if let Some(i) = ws.find('?') {
        if ws[..i].matches('/').count() == 2 {
            ws.insert(i, '/');
        }
    }
    let (mut sock, _) = tokio_tungstenite::connect_async(ws.as_str()).await.context("ws connect")?;
    let sub = json!({"jsonrpc":"2.0","id":1,"method":"logsSubscribe","params":[{"mentions":[PROGRAM_ID]},{"commitment":"confirmed"}]});
    sock.send(tokio_tungstenite::tungstenite::Message::Text(sub.to_string().into()))
        .await?;
    info!("subscribed to program logs");
    while let Some(msg) = sock.next().await {
        let msg = msg?;
        let txt = match msg {
            tokio_tungstenite::tungstenite::Message::Text(t) => t.to_string(),
            tokio_tungstenite::tungstenite::Message::Ping(p) => {
                sock.send(tokio_tungstenite::tungstenite::Message::Pong(p)).await?;
                continue;
            }
            _ => continue,
        };
        let v: Value = serde_json::from_str(&txt).unwrap_or(Value::Null);
        let val = &v["params"]["result"]["value"];
        let Some(sig) = val["signature"].as_str() else { continue };
        let logs: Vec<String> = val["logs"]
            .as_array()
            .map(|a| a.iter().filter_map(|l| l.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let failed = !val["err"].is_null();
        process_logs(s, sig, logs, failed).await;
    }
    Err(anyhow!("ws closed"))
}

/// Stores the events of one transaction's logs (shared by the websocket and signature-poll paths).
async fn process_logs(s: &S, sig: &str, logs: Vec<String>, failed: bool) {
    if !s.seen.write().await.insert(sig.to_string()) {
        return;
    }
    if failed {
        let s2 = s.clone();
        let sig2 = sig.to_string();
        tokio::spawn(async move {
            if let Err(e) = store_failed_trade(&s2, &sig2, &logs).await {
                warn!("failed-trade backfill: {e:#}");
            }
        });
        return;
    }
    for ev in events_from_logs(&logs) {
        if let Err(e) = store_event(s, sig, &ev, false).await {
            warn!("store: {e:#}");
        }
        let mut j = serde_json::to_value(&ev).unwrap_or(Value::Null);
        j["signature"] = json!(sig);
        j["seen_ms"] = json!(now_ms());
        let _ = s.tx.send(j);
    }
}

/// The private ER does not deliver logsSubscribe notifications, so on the TEE the indexer follows
/// each open match by polling the signatures of its match and market accounts and reading each
/// new transaction's logs (authenticated reads).
async fn sig_poll_loop(s: S) {
    let mut cursor: HashMap<String, String> = HashMap::new();
    loop {
        let addrs: Vec<String> = s
            .live
            .read()
            .await
            .iter()
            .filter(|(_, (m, _, _))| m.status <= 4)
            .flat_map(|(k, (m, _, _))| [k.clone(), m.market_live.clone(), m.market_delayed.clone()])
            .collect();
        for a in addrs {
            let mut opts = json!({"limit": 1000, "commitment": "confirmed"});
            if let Some(u) = cursor.get(&a) {
                opts["until"] = json!(u);
            }
            let Ok(list) = s.er("getSignaturesForAddress", json!([a, opts])).await else {
                continue;
            };
            let list = list.as_array().cloned().unwrap_or_default();
            if let Some(newest) = list.first().and_then(|x| x["signature"].as_str()) {
                cursor.insert(a.clone(), newest.to_string());
            }
            let mut sigs: Vec<String> = vec![];
            {
                let seen = s.seen.read().await;
                for x in list.iter().rev() {
                    if let Some(sig) = x["signature"].as_str() {
                        if !seen.contains(sig) {
                            sigs.push(sig.to_string());
                        }
                    }
                }
            }
            let txs: Vec<(String, Option<Value>)> = futures::stream::iter(sigs)
                .map(|sig| {
                    let s = s.clone();
                    async move {
                        let t = s
                            .er(
                                "getTransaction",
                                json!([sig, {"encoding":"json","maxSupportedTransactionVersion":0,"commitment":"confirmed"}]),
                            )
                            .await
                            .ok();
                        (sig, t)
                    }
                })
                .buffered(12)
                .collect()
                .await;
            for (sig, t) in txs {
                let Some(t) = t.filter(|t| !t.is_null()) else { continue };
                let logs: Vec<String> = t["meta"]["logMessages"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|l| l.as_str().map(String::from)).collect())
                    .unwrap_or_default();
                let failed = !t["meta"]["err"].is_null();
                process_logs(&s, &sig, logs, failed).await;
            }
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}

/// Fills and recorded rejections from two consecutive snapshots of a market account. On the
/// private ER the trader is not visible to the indexer (that is the point), so it is "private".
/// A buy adds qty to the side's inventory and qty * price to house cash; a sell removes both.
fn book_events(market: &str, old: &MarketView, new: &MarketView, game_tick: u64) -> Vec<(String, Event)> {
    let mut out = vec![];
    if new.n_trades > old.n_trades {
        let da = new.inv_a as i128 - old.inv_a as i128;
        let db = new.inv_b as i128 - old.inv_b as i128;
        let (side, dq) = if da != 0 { (0u8, da) } else { (1u8, db) };
        let qty = dq.unsigned_abs() as u64;
        let cash = (new.house_cash as i128 - old.house_cash as i128).unsigned_abs() as u64;
        if qty > 0 {
            // Rows derived from account updates have no client-visible transaction: stable synthetic id.
            out.push((
                format!("acct:{market}:t{}", new.n_trades),
                Event::Trade {
                    market: market.to_string(),
                    trader: "private".into(),
                    tick: new.last_priced_tick,
                    game_tick,
                    seen_tick: new.last_priced_tick,
                    price: cash / qty,
                    qty,
                    side,
                    dir: if dq > 0 { 0 } else { 1 },
                    mode: new.mode,
                    unix_ms: now_ms(),
                },
            ));
        }
    }
    let rejects = [
        (new.n_rejected_stale.saturating_sub(old.n_rejected_stale), 6000u32),
        (new.n_rejected_fighter.saturating_sub(old.n_rejected_fighter), 6001),
        (new.n_rejected_other.saturating_sub(old.n_rejected_other), 6002),
    ];
    let before = old.n_rejected_stale + old.n_rejected_fighter + old.n_rejected_other;
    let mut k = 0;
    for (n, reason) in rejects {
        for _ in 0..n {
            k += 1;
            out.push((
                format!("acct:{market}:r{}", before + k),
                Event::Reject {
                    market: market.to_string(),
                    trader: "private".into(),
                    tick: game_tick,
                    seen_tick: 0,
                    reason,
                    mode: new.mode,
                },
            ));
        }
    }
    out
}

/// On the TEE, crank-executed ticks leave no transaction history a client can read, but account
/// subscriptions deliver every write. Each Match snapshot after a tick carries the tick, the inputs
/// the step used (sim.last_inputs) and the hash chain; stepping the previous snapshot with those
/// inputs recovers the event flags and cross-checks the state. fair_p comes from the live market.
async fn follow_match(s: S, key: String, market_live: String, market_delayed: String) -> Result<()> {
    let url = s.er_url().await?;
    let mut ws = url.replacen("http", "ws", 1);
    if let Some(i) = ws.find('?') {
        if ws[..i].matches('/').count() == 2 {
            ws.insert(i, '/');
        }
    }
    let (mut sock, _) = tokio_tungstenite::connect_async(ws.as_str()).await.context("ws connect")?;
    for (id, k) in [(1, &key), (2, &market_live), (3, &market_delayed)] {
        let sub = json!({"jsonrpc":"2.0","id":id,"method":"accountSubscribe","params":[k,{"encoding":"base64","commitment":"confirmed"}]});
        sock.send(tokio_tungstenite::tungstenite::Message::Text(sub.to_string().into()))
            .await?;
    }
    let mut subs: HashMap<u64, u8> = HashMap::new();
    let mut prev: Option<(u32, Vec<u8>)> = None;
    let mut fair: (u64, f64) = (0, 0.5);
    let mut pending: Option<Event> = None;
    let mut books: HashMap<u8, MarketView> = HashMap::new();
    let mut game_tick: u64 = 0;
    let flush = |ev: Event, fair_p: f64| match ev {
        Event::Tick {
            match_key,
            tick,
            inputs,
            flags,
            state_hash,
            ..
        } => Event::Tick {
            match_key,
            tick,
            inputs,
            flags,
            fair_p,
            state_hash,
        },
        e => e,
    };
    let emit = |s: &S, sig: String, ev: Event| {
        let s = s.clone();
        async move {
            if let Err(e) = store_event(&s, &sig, &ev, false).await {
                warn!("store tick: {e:#}");
            }
            let mut j = serde_json::to_value(&ev).unwrap_or(Value::Null);
            j["seen_ms"] = json!(now_ms());
            let _ = s.tx.send(j);
        }
    };
    let started = now_ms();
    while let Some(msg) = sock.next().await {
        let txt = match msg? {
            tokio_tungstenite::tungstenite::Message::Text(t) => t.to_string(),
            tokio_tungstenite::tungstenite::Message::Ping(p) => {
                sock.send(tokio_tungstenite::tungstenite::Message::Pong(p)).await?;
                continue;
            }
            _ => continue,
        };
        let v: Value = serde_json::from_str(&txt).unwrap_or(Value::Null);
        if let (Some(id), Some(sub)) = (v["id"].as_u64(), v["result"].as_u64()) {
            subs.insert(sub, id as u8);
            continue;
        }
        let Some(sub) = v["params"]["subscription"].as_u64() else {
            continue;
        };
        let Some(data) = account_data(&v["params"]["result"]["value"]) else {
            continue;
        };
        match subs.get(&sub) {
            Some(&which @ (2 | 3)) => {
                let Some(m) = decode_market(&data) else { continue };
                let mk = if which == 2 { &market_live } else { &market_delayed };
                if let Some(old) = books.insert(which, m.clone()) {
                    for (sig, ev) in book_events(mk, &old, &m, game_tick) {
                        emit(&s, sig, ev).await;
                    }
                }
                if which == 2 {
                    fair = (m.last_priced_tick, m.fair_p);
                    if let Some(Event::Tick { tick, .. }) = &pending {
                        if m.last_priced_tick >= *tick {
                            emit(&s, String::new(), flush(pending.take().unwrap(), m.fair_p)).await;
                        }
                    }
                }
            }
            Some(1) => {
                let Some(m) = decode_match(&data) else { continue };
                let b = &data[8..];
                let sim = &b[392..392 + 832];
                if prev.as_ref().map(|p| p.0) == Some(m.tick) {
                    // Not a tick: an input, a VRF seed or the fight start. Keep the newest snapshot.
                    prev = Some((m.tick, sim.to_vec()));
                    continue;
                }
                if let Some(ev) = pending.take() {
                    emit(&s, String::new(), flush(ev, fair.1)).await;
                }
                game_tick = m.tick as u64;
                let Some(cur) = ringside_sim::decode(sim) else { continue };
                let mut flags = 0u32;
                if let Some((pt, pb)) = &prev {
                    if *pt + 1 == m.tick {
                        if let Some(mut st) = ringside_sim::decode(pb) {
                            let ev = ringside_sim::step(&mut st, cur.last_inputs);
                            if ringside_sim::encode(&st)[..] == *sim {
                                flags = ev.flags;
                            } else {
                                warn!("tick {} of {key}: local step disagrees with the chain", m.tick);
                            }
                        }
                    }
                }
                if m.tick > 0 {
                    let ev = Event::Tick {
                        match_key: key.clone(),
                        tick: m.tick as u64,
                        inputs: cur.last_inputs,
                        flags,
                        fair_p: fair.1,
                        state_hash: m.state_hash.clone(),
                    };
                    if fair.0 >= m.tick as u64 || m.status >= 3 {
                        emit(&s, String::new(), ev).await;
                    } else {
                        pending = Some(ev);
                    }
                }
                prev = Some((m.tick, sim.to_vec()));
                if m.status >= 3 {
                    if let Some(ev) = pending.take() {
                        emit(&s, String::new(), flush(ev, fair.1)).await;
                    }
                    return Ok(());
                }
            }
            _ => {}
        }
        if now_ms() - started > 30 * 60 * 1000 {
            return Err(anyhow!("follow timeout"));
        }
    }
    Err(anyhow!("account stream closed"))
}

async fn poll_loop(s: S) {
    let mut last_discover = 0i64;
    let mut known: Vec<String> = vec![];
    loop {
        let t = now_ms();
        if t - last_discover > 2000 {
            last_discover = t;
            match s
                .er(
                    "getProgramAccounts",
                    json!([PROGRAM_ID, {"encoding":"base64","filters":[{"dataSize": MATCH_SIZE}]}]),
                )
                .await
            {
                Ok(list) => {
                    known.clear();
                    for a in list.as_array().cloned().unwrap_or_default() {
                        let key = a["pubkey"].as_str().unwrap_or_default().to_string();
                        if let Some(m) = account_data(&a["account"]).and_then(|d| decode_match(&d)) {
                            let _ = upsert_match(&s, &key, &m).await;
                            if m.status <= 2 && s.cfg.tee && s.following.write().await.insert(key.clone()) {
                                let (s2, k2, ml, md) = (s.clone(), key.clone(), m.market_live.clone(), m.market_delayed.clone());
                                tokio::spawn(async move {
                                    for attempt in 0..5 {
                                        match follow_match(s2.clone(), k2.clone(), ml.clone(), md.clone()).await {
                                            Ok(()) => break,
                                            Err(e) => warn!("follow {k2} (attempt {attempt}): {e:#}"),
                                        }
                                    }
                                });
                            }
                            if m.status <= 3 {
                                known.push(key);
                            }
                        }
                    }
                }
                Err(e) => warn!("discover: {e:#}"),
            }
        }
        for key in known.clone() {
            let cur = s.live.read().await.get(&key).map(|x| x.0.clone());
            let Some(mv) = cur.or_else(|| None) else {
                // fetch once to learn the market keys
                if let Ok(r) = s.er("getAccountInfo", json!([key, {"encoding":"base64"}])).await {
                    if let Some(m) = account_data(&r["value"]).and_then(|d| decode_match(&d)) {
                        s.live.write().await.insert(key.clone(), (m, None, None));
                    }
                }
                continue;
            };
            let r = s
                .er(
                    "getMultipleAccounts",
                    json!([[key, mv.market_live, mv.market_delayed], {"encoding":"base64"}]),
                )
                .await;
            let Ok(r) = r else { continue };
            let vals = r["value"].as_array().cloned().unwrap_or_default();
            let m = vals.first().and_then(account_data).and_then(|d| decode_match(&d));
            let l = vals.get(1).and_then(account_data).and_then(|d| decode_market(&d));
            let d = vals.get(2).and_then(account_data).and_then(|d| decode_market(&d));
            if let Some(m) = m {
                for b in [l.as_ref(), d.as_ref()].into_iter().flatten() {
                    let mk = if b.mode == 0 { &mv.market_live } else { &mv.market_delayed };
                    let _ = sqlx::query("INSERT INTO quotes (market,tick,mode,fair_p,bid_a,ask_a,bid_b,ask_b,seen_ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING")
                        .bind(mk).bind(b.last_priced_tick as i64).bind(b.mode as i16).bind(b.fair_p).bind(b.bid_a as i64).bind(b.ask_a as i64).bind(b.bid_b as i64).bind(b.ask_b as i64).bind(now_ms())
                        .execute(&s.db).await;
                }
                if m.tick != mv.tick || m.status != mv.status {
                    let _ = upsert_match(&s, &key, &m).await;
                    let _ =
                        s.tx.send(json!({"type":"state","match_key":key,"match":m,"live":l,"delayed":d,"seen_ms":now_ms()}));
                }
                s.live.write().await.insert(key.clone(), (m, l, d));
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn upsert_match(s: &S, key: &str, m: &MatchView) -> Result<()> {
    sqlx::query(
        "INSERT INTO matches (match_key,match_id,stake,status,winner,fighter_a,fighter_b,market_live,market_delayed,tick,state_hash,start_unix,end_unix,finalized,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
         ON CONFLICT (match_key) DO UPDATE SET status=$4, winner=$5, fighter_a=$6, fighter_b=$7, tick=$10, state_hash=$11, start_unix=$12, end_unix=$13, finalized=$14, updated_at=now()",
    )
    .bind(key).bind(m.match_id as i64).bind(m.stake as i64).bind(m.status as i16).bind(m.winner as i16).bind(&m.fighters[0]).bind(&m.fighters[1])
    .bind(&m.market_live).bind(&m.market_delayed).bind(m.tick as i32).bind(&m.state_hash).bind(m.start_unix).bind(m.end_unix).bind(m.finalized as i16)
    .execute(&s.db).await?;
    Ok(())
}

/// Verifies that finalized matches have their MatchRecord on L1; retries finalize if not.
async fn record_loop(s: S) {
    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let rows = sqlx::query("SELECT match_key, match_id, end_unix, finalized, record_checked_at FROM matches WHERE status IN (4,5) AND NOT record_written AND finalized > 0 LIMIT 20")
            .fetch_all(&s.db).await.unwrap_or_default();
        for r in rows {
            let key: String = r.get(0);
            let id: i64 = r.get(1);
            let program = b58d(PROGRAM_ID);
            let rec = bs58::encode(find_pda(&[b"record", &(id as u64).to_le_bytes()], &program)).into_string();
            let written = s
                .rpc(&s.cfg.base_rpc, "getAccountInfo", json!([rec, {"encoding":"base64"}]))
                .await
                .ok()
                .and_then(|v| account_data(&v["value"]))
                .map(|d| d.get(8 + 32 + 32 + 72 + 1).copied() == Some(1))
                .unwrap_or(false);
            let _ = sqlx::query("UPDATE matches SET record_written=$2, record_checked_at=now() WHERE match_key=$1")
                .bind(&key)
                .bind(written)
                .execute(&s.db)
                .await;
            if written {
                info!("MatchRecord verified for {key}");
                continue;
            }
            let end: i64 = r.get::<Option<i64>, _>(2).unwrap_or(0);
            let age = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64 - end;
            if age > 45 && age % 60 < 6 {
                match retry_finalize(&s, id as u64).await {
                    Ok(sig) => info!("retried finalize for {key}: {sig}"),
                    Err(e) => warn!("retry finalize {key}: {e:#}"),
                }
            }
        }
    }
}

// ─────────────────────────── HTTP API ───────────────────────────

async fn health() -> &'static str {
    "ok"
}

async fn matches(State(s): State<S>, Query(q): Query<HashMap<String, String>>) -> Json<Value> {
    let limit: i64 = q.get("limit").and_then(|v| v.parse().ok()).unwrap_or(50);
    let rows = sqlx::query("SELECT match_key,match_id,stake,status,winner,fighter_a,fighter_b,market_live,market_delayed,tick,state_hash,start_unix,end_unix,record_written FROM matches ORDER BY match_id DESC LIMIT $1")
        .bind(limit).fetch_all(&s.db).await.unwrap_or_default();
    let live = s.live.read().await;
    let out: Vec<Value> = rows
        .iter()
        .map(|r| {
            let key: String = r.get(0);
            let books = live.get(&key).map(|(_, l, d)| json!({"live": l, "delayed": d})).unwrap_or(Value::Null);
            json!({
                "match_key": key, "match_id": r.get::<i64,_>(1).to_string(), "stake": r.get::<i64,_>(2), "status": r.get::<i16,_>(3), "winner": r.get::<i16,_>(4),
                "fighters": [r.get::<Option<String>,_>(5), r.get::<Option<String>,_>(6)], "market_live": r.get::<Option<String>,_>(7), "market_delayed": r.get::<Option<String>,_>(8),
                "tick": r.get::<i32,_>(9), "state_hash": r.get::<Option<String>,_>(10), "start_unix": r.get::<Option<i64>,_>(11), "end_unix": r.get::<Option<i64>,_>(12),
                "record_written": r.get::<bool,_>(13), "books": books,
            })
        })
        .collect();
    Json(json!(out))
}

async fn key_for(s: &S, id: &str) -> Option<String> {
    sqlx::query("SELECT match_key FROM matches WHERE match_id=$1")
        .bind(id.parse::<i64>().ok()?)
        .fetch_optional(&s.db)
        .await
        .ok()?
        .map(|r| r.get(0))
}

async fn replay(State(s): State<S>, Path(id): Path<String>) -> Json<Value> {
    let Some(key) = key_for(&s, &id).await else {
        return Json(json!({"error":"unknown match"}));
    };
    let ticks = sqlx::query("SELECT tick,input_a,input_b,state_hash,signature,fair_p,flags FROM ticks WHERE match_key=$1 ORDER BY tick")
        .bind(&key)
        .fetch_all(&s.db)
        .await
        .unwrap_or_default();
    let seeds = sqlx::query("SELECT wave,apply_at_tick,seed,signature FROM seeds WHERE match_key=$1 ORDER BY apply_at_tick")
        .bind(&key)
        .fetch_all(&s.db)
        .await
        .unwrap_or_default();
    let trades = sqlx::query("SELECT signature,mode,trader,tick,seen_tick,price,qty,side,dir FROM trades WHERE market IN (SELECT market_live FROM matches WHERE match_key=$1 UNION SELECT market_delayed FROM matches WHERE match_key=$1) ORDER BY tick")
        .bind(&key).fetch_all(&s.db).await.unwrap_or_default();
    let complete = ticks.iter().enumerate().all(|(i, r)| r.get::<i32, _>(0) == i as i32 + 1);
    let settle_sig: Option<String> = sqlx::query_scalar("SELECT settle_sig FROM matches WHERE match_key=$1")
        .bind(&key)
        .fetch_optional(&s.db)
        .await
        .ok()
        .flatten()
        .flatten();
    Json(json!({
        "match_key": key, "match_id": id, "tick_ms": 100, "complete": complete, "settle_sig": settle_sig,
        "ticks": ticks.iter().map(|r| json!({"tick": r.get::<i32,_>(0), "inputs": [r.get::<i32,_>(1), r.get::<i32,_>(2)], "hash": r.get::<String,_>(3), "sig": r.get::<Option<String>,_>(4), "fair_p": r.get::<f64,_>(5), "flags": r.get::<i64,_>(6)})).collect::<Vec<_>>(),
        "seeds": seeds.iter().map(|r| json!({"wave": r.get::<i32,_>(0), "apply_at_tick": r.get::<i32,_>(1), "seed": r.get::<String,_>(2), "sig": r.get::<Option<String>,_>(3)})).collect::<Vec<_>>(),
        "trades": trades.iter().map(|r| json!({"sig": r.get::<String,_>(0), "mode": r.get::<i16,_>(1), "trader": r.get::<String,_>(2), "tick": r.get::<i64,_>(3), "seen_tick": r.get::<i64,_>(4), "price": r.get::<i64,_>(5), "qty": r.get::<i64,_>(6), "side": r.get::<i16,_>(7), "dir": r.get::<i16,_>(8)})).collect::<Vec<_>>(),
    }))
}

async fn state(State(s): State<S>, Path(id): Path<String>) -> Json<Value> {
    let Some(key) = key_for(&s, &id).await else {
        return Json(json!({"error":"unknown match"}));
    };
    if let Some((m, l, d)) = s.live.read().await.get(&key) {
        return Json(json!({"match_key": key, "match": m, "live": l, "delayed": d}));
    }
    // Not cached (finished long ago): read it once.
    let r = s.er("getMultipleAccounts", json!([[key], {"encoding":"base64"}])).await.ok();
    let m = r
        .and_then(|r| r["value"][0].clone().as_object().map(|_| r["value"][0].clone()))
        .and_then(|v| account_data(&v))
        .and_then(|d| decode_match(&d));
    Json(json!({"match_key": key, "match": m, "live": null, "delayed": null}))
}

async fn leaderboard(State(s): State<S>) -> Json<Value> {
    let list = s
        .er(
            "getProgramAccounts",
            json!([PROGRAM_ID, {"encoding":"base64","filters":[{"dataSize": 8 + 53}]}]),
        )
        .await
        .unwrap_or(Value::Null);
    let mut rows: Vec<Value> = list
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|a| account_data(&a["account"]))
        .filter(|d| d.len() >= 61)
        .map(|d| {
            let u32a = |o: usize| u32::from_le_bytes(d[o..o + 4].try_into().unwrap());
            json!({"wallet": bs58::encode(&d[8..40]).into_string(), "total_staked": u64::from_le_bytes(d[40..48].try_into().unwrap()), "elo": u32a(48), "matches": u32a(52), "wins": u32a(56)})
        })
        .collect();
    rows.sort_by_key(|r| std::cmp::Reverse(r["elo"].as_u64().unwrap_or(0)));
    Json(json!(rows))
}

async fn judge(State(s): State<S>, Path(id): Path<String>) -> Json<Value> {
    let Some(key) = key_for(&s, &id).await else {
        return Json(json!({"error":"unknown match"}));
    };
    let courtsider = std::env::var("COURTSIDER").unwrap_or_default();
    let q = |mode: i16| {
        let s = s.clone();
        let key = key.clone();
        let c = courtsider.clone();
        async move {
            let r = sqlx::query(
                "SELECT
                  (SELECT count(*) FROM trades t WHERE t.mode=$2 AND t.market IN (SELECT CASE WHEN $2=0 THEN market_live ELSE market_delayed END FROM matches WHERE match_key=$1) AND ($3='' OR t.trader=$3)),
                  (SELECT count(*) FROM trades t WHERE t.mode=$2 AND t.game_tick > t.seen_tick + 2 AND t.market IN (SELECT CASE WHEN $2=0 THEN market_live ELSE market_delayed END FROM matches WHERE match_key=$1)),
                  (SELECT count(*) FROM rejections r WHERE r.reason=6000 AND r.market IN (SELECT CASE WHEN $2=0 THEN market_live ELSE market_delayed END FROM matches WHERE match_key=$1)),
                  (SELECT signature FROM rejections r WHERE r.reason=6000 AND r.failed_tx AND r.market IN (SELECT CASE WHEN $2=0 THEN market_live ELSE market_delayed END FROM matches WHERE match_key=$1) LIMIT 1)",
            )
            .bind(&key).bind(mode).bind(&c).fetch_one(&s.db).await;
            r.map(|r| json!({"fills": r.get::<i64,_>(0), "stale_fills_accepted": r.get::<i64,_>(1), "stale_rejections": r.get::<i64,_>(2), "reject_sig": r.get::<Option<String>,_>(3)})).unwrap_or(Value::Null)
        }
    };
    let books = s
        .live
        .read()
        .await
        .get(&key)
        .map(|(_, l, d)| json!({"live": l, "delayed": d}))
        .unwrap_or(Value::Null);
    Json(json!({"ringside": q(0).await, "tv_delay": q(1).await, "books": books}))
}

async fn stats(State(s): State<S>) -> Json<Value> {
    let cadence = sqlx::query(
        "WITH d AS (SELECT seen_ms - lag(seen_ms) OVER (PARTITION BY match_key ORDER BY tick) AS dt FROM ticks)
         SELECT count(dt), percentile_cont(0.5) WITHIN GROUP (ORDER BY dt), percentile_cont(0.95) WITHIN GROUP (ORDER BY dt), percentile_cont(0.99) WITHIN GROUP (ORDER BY dt) FROM d WHERE dt IS NOT NULL AND dt < 10000",
    )
    .fetch_one(&s.db).await.ok();
    let age = sqlx::query("SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY (game_tick-seen_tick)*100), percentile_cont(0.95) WITHIN GROUP (ORDER BY (game_tick-seen_tick)*100) FROM trades WHERE mode=0")
        .fetch_one(&s.db).await.ok();
    let lat = sqlx::query("SELECT kind, count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY ms), percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) FROM latency GROUP BY kind ORDER BY kind")
        .fetch_all(&s.db).await.unwrap_or_default();
    let counts = sqlx::query("SELECT (SELECT count(*) FROM matches), (SELECT count(*) FROM ticks), (SELECT count(*) FROM trades), (SELECT count(*) FROM rejections)").fetch_one(&s.db).await.ok();
    Json(json!({
        "tick_cadence_ms": cadence.map(|r| json!({"n": r.get::<i64,_>(0), "p50": r.get::<Option<f64>,_>(1), "p95": r.get::<Option<f64>,_>(2), "p99": r.get::<Option<f64>,_>(3)})),
        "quote_age_at_fill_ms": age.map(|r| json!({"n": r.get::<i64,_>(0), "p50": r.get::<Option<f64>,_>(1), "p95": r.get::<Option<f64>,_>(2)})),
        "latency": lat.iter().map(|r| json!({"kind": r.get::<String,_>(0), "n": r.get::<i64,_>(1), "p50": r.get::<Option<f64>,_>(2), "p95": r.get::<Option<f64>,_>(3)})).collect::<Vec<_>>(),
        "counts": counts.map(|r| json!({"matches": r.get::<i64,_>(0), "ticks": r.get::<i64,_>(1), "trades": r.get::<i64,_>(2), "rejections": r.get::<i64,_>(3)})),
    }))
}

#[derive(serde::Deserialize)]
struct LatencyRow {
    kind: String,
    ms: f64,
    match_key: Option<String>,
    signature: Option<String>,
    host: Option<String>,
}

async fn post_latency(State(s): State<S>, Json(rows): Json<Vec<LatencyRow>>) -> Json<Value> {
    for r in &rows {
        let _ = sqlx::query("INSERT INTO latency (kind,ms,match_key,signature,host) VALUES ($1,$2,$3,$4,$5)")
            .bind(&r.kind)
            .bind(r.ms)
            .bind(&r.match_key)
            .bind(&r.signature)
            .bind(&r.host)
            .execute(&s.db)
            .await;
    }
    Json(json!({"stored": rows.len()}))
}

async fn sse(State(s): State<S>) -> Sse<impl futures::Stream<Item = Result<SseEvent, std::convert::Infallible>>> {
    let rx = s.tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|m| async move { m.ok().map(|v| Ok(SseEvent::default().data(v.to_string()))) });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[tokio::main]
async fn main() -> Result<()> {
    let env = std::env::var("RINGSIDE_ENV").unwrap_or_else(|_| "devnet".into());
    let local = env == "local";
    let cfg = Cfg {
        base_rpc: std::env::var("SOLANA_RPC").unwrap_or_else(|_| {
            if local {
                "http://127.0.0.1:8899".into()
            } else {
                "https://rpc.magicblock.app/devnet".into()
            }
        }),
        er_rpc: std::env::var("ER_RPC").unwrap_or_else(|_| {
            if local {
                "http://127.0.0.1:7799".into()
            } else {
                "https://devnet-tee.magicblock.app".into()
            }
        }),
        tee: !local,
        key: Arc::new(load_key(
            &std::env::var("INDEXER_KEYPAIR").unwrap_or_else(|_| "keys/indexer.json".into()),
        )?),
    };
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://ringside:ringside@127.0.0.1:5434/ringside".into()))
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    otel::init(db.clone());
    let (tx, _) = broadcast::channel(4096);
    let s: S = Arc::new(Shared {
        cfg,
        db,
        http: reqwest::Client::new(),
        tx,
        token: RwLock::new(None),
        seen: RwLock::new(Default::default()),
        following: RwLock::new(Default::default()),
        live: RwLock::new(HashMap::new()),
    });
    info!("indexer for {env}: er {} base {}", s.cfg.er_rpc, s.cfg.base_rpc);
    tokio::spawn(logs_loop(s.clone()));
    if s.cfg.tee {
        tokio::spawn(sig_poll_loop(s.clone()));
    }
    tokio::spawn(poll_loop(s.clone()));
    tokio::spawn(record_loop(s.clone()));
    let app = Router::new()
        .route("/health", get(health))
        .route("/matches", get(matches))
        .route("/matches/{id}/replay", get(replay))
        .route("/judge/{id}", get(judge))
        .route("/matches/{id}/state", get(state))
        .route("/stats", get(stats))
        .route("/leaderboard", get(leaderboard))
        .route("/latency", post(post_latency))
        .route("/events", get(sse))
        .layer(CorsLayer::permissive())
        .with_state(s);
    let port = std::env::var("PORT").unwrap_or_else(|_| "8787".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    info!("listening on :{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
