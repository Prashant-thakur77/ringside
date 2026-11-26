//! Soak: K concurrent spectators each send M trades at the live book of one match, priced off the
//! latest quote. Reports success rate, rejects by reason, submit→confirm latency percentiles, CU
//! per trade and the house's peak exposure against the cap.
//! Usage: ringside-soak <match_id> <K> <M>   (env: ER_RPC, KEYS_DIR, MINT, TEE_TOKEN optional)

use anyhow::{anyhow, Result};
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

const PROGRAM: &str = "4efktEjqvfqi5UpmStUmvHmhJ9yFcKNvpZRJw56t5Kej";
const TOKEN: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

fn d(s: &str) -> [u8; 32] {
    bs58::decode(s).into_vec().unwrap().try_into().unwrap()
}
fn pda(seeds: &[&[u8]], program: &[u8; 32]) -> [u8; 32] {
    for bump in (0u8..=255).rev() {
        let mut h = Sha256::new();
        for s in seeds {
            h.update(s);
        }
        h.update([bump]);
        h.update(program);
        h.update(b"ProgramDerivedAddress");
        let out: [u8; 32] = h.finalize().into();
        if ed25519_dalek::VerifyingKey::from_bytes(&out).is_err() {
            return out;
        }
    }
    unreachable!()
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

/// Legacy tx, single signer (fee payer = signer). Accounts: (key, signer, writable).
fn tx(payer: &SigningKey, program: [u8; 32], accounts: &[([u8; 32], bool, bool)], data: &[u8], bh: [u8; 32]) -> Vec<u8> {
    let me = payer.verifying_key().to_bytes();
    let mut keys: Vec<([u8; 32], bool, bool)> = vec![(me, true, true)];
    for a in accounts {
        if let Some(e) = keys.iter_mut().find(|e| e.0 == a.0) {
            e.1 |= a.1;
            e.2 |= a.2;
        } else {
            keys.push(*a);
        }
    }
    if !keys.iter().any(|e| e.0 == program) {
        keys.push((program, false, false));
    }
    let mut ord = vec![];
    for (s, w) in [(true, true), (true, false), (false, true), (false, false)] {
        ord.extend(keys.iter().filter(|e| e.1 == s && e.2 == w).cloned());
    }
    let idx = |k: &[u8; 32]| ord.iter().position(|e| &e.0 == k).unwrap() as u8;
    let mut m = vec![ord.iter().filter(|e| e.1).count() as u8, ord.iter().filter(|e| e.1 && !e.2).count() as u8, ord.iter().filter(|e| !e.1 && !e.2).count() as u8];
    shortvec(ord.len(), &mut m);
    for e in &ord {
        m.extend_from_slice(&e.0);
    }
    m.extend_from_slice(&bh);
    shortvec(1, &mut m);
    m.push(idx(&program));
    shortvec(accounts.len(), &mut m);
    for a in accounts {
        m.push(idx(&a.0));
    }
    shortvec(data.len(), &mut m);
    m.extend_from_slice(data);
    let mut out = vec![];
    shortvec(1, &mut out);
    out.extend_from_slice(&payer.sign(&m).to_bytes());
    out.extend_from_slice(&m);
    out
}

async fn rpc(c: &reqwest::Client, url: &str, method: &str, params: Value) -> Result<Value> {
    let r: Value = c.post(url).json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params})).send().await?.json().await?;
    if let Some(e) = r.get("error") {
        return Err(anyhow!("{e}"));
    }
    Ok(r["result"].clone())
}

#[derive(Default)]
struct Stats {
    ok: u64,
    fail: u64,
    reasons: BTreeMap<String, u64>,
    lat_ms: Vec<f64>,
    cu: Vec<u64>,
    sample_sigs: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let a: Vec<String> = std::env::args().collect();
    let match_id: u64 = a.get(1).ok_or_else(|| anyhow!("usage: ringside-soak <match_id> <K> <M>"))?.parse()?;
    let k: usize = a.get(2).map(|s| s.parse().unwrap()).unwrap_or(16);
    let m: usize = a.get(3).map(|s| s.parse().unwrap()).unwrap_or(20);
    let er = std::env::var("ER_RPC").unwrap_or_else(|_| "http://127.0.0.1:7799".into());
    let keys_dir = std::env::var("KEYS_DIR").unwrap_or_else(|_| "keys".into());
    let mint = d(&std::env::var("MINT")?);
    let program = d(PROGRAM);
    let id = match_id.to_le_bytes();
    let game = pda(&[b"match", &id], &program);
    let market = pda(&[b"market", &id, &[0]], &program);
    let config = pda(&[b"config"], &program);
    let ata = move |owner: &[u8; 32]| pda(&[owner, &d(TOKEN), &mint], &d(ATA));
    let house = ata(&config);
    let disc: [u8; 8] = Sha256::digest(b"global:trade")[..8].try_into().unwrap();
    let c = reqwest::Client::new();
    let stats = Arc::new(Mutex::new(Stats::default()));
    let start = Instant::now();
    let mut handles = vec![];
    for i in 0..k {
        let bytes: Vec<u8> = serde_json::from_str(&std::fs::read_to_string(format!("{keys_dir}/soak-{i}.json"))?)?;
        let key = SigningKey::from_bytes(&bytes[..32].try_into()?);
        let (c, er, stats) = (c.clone(), er.clone(), stats.clone());
        handles.push(tokio::spawn(async move {
            let me = key.verifying_key().to_bytes();
            let pos = pda(&[b"pos", &market, &me], &program);
            for j in 0..m {
                let Ok(acc) = rpc(&c, &er, "getAccountInfo", json!([bs58::encode(market).into_string(), {"encoding":"base64"}])).await else { continue };
                let Some(data) = acc["value"]["data"][0].as_str().and_then(|s| base64::engine::general_purpose::STANDARD.decode(s).ok()) else { continue };
                let u = |o: usize| u64::from_le_bytes(data[8 + o..8 + o + 8].try_into().unwrap());
                let (tick, ask_a, ask_b) = (u(48), u(72), u(88));
                let side_b = (i + j) % 2 == 1;
                let limit = if side_b { ask_b } else { ask_a } + 20_000 + j as u64; // unique bytes per order
                let mut ix = disc.to_vec();
                ix.extend_from_slice(&match_id.to_le_bytes());
                ix.extend_from_slice(&tick.to_le_bytes());
                ix.push(side_b as u8);
                ix.push(0); // buy
                ix.extend_from_slice(&1u64.to_le_bytes());
                ix.extend_from_slice(&limit.to_le_bytes());
                ix.push(1); // record rejects (count them onchain)
                let accounts = [(me, true, true), (me, false, false), (config, false, false), (game, false, false), (market, false, true), (pos, false, true), (ata(&me), false, true), (house, false, true), (d(TOKEN), false, false), (program, false, false)];
                let bh = match rpc(&c, &er, "getLatestBlockhash", json!([{"commitment":"confirmed"}])).await {
                    Ok(v) => d(v["value"]["blockhash"].as_str().unwrap_or_default()),
                    Err(_) => continue,
                };
                let raw = base64::engine::general_purpose::STANDARD.encode(tx(&key, program, &accounts, &ix, bh));
                let t0 = Instant::now();
                let res = rpc(&c, &er, "sendTransaction", json!([raw, {"encoding":"base64","skipPreflight":true}])).await;
                let sig = match res {
                    Ok(s) => s.as_str().unwrap_or_default().to_string(),
                    Err(e) => {
                        let mut s = stats.lock().await;
                        s.fail += 1;
                        *s.reasons.entry(format!("send: {}", e.to_string().chars().take(60).collect::<String>())).or_default() += 1;
                        continue;
                    }
                };
                // confirm by polling the signature status
                let mut done = None;
                for _ in 0..100 {
                    if let Ok(v) = rpc(&c, &er, "getSignatureStatuses", json!([[sig]])).await {
                        let st = &v["value"][0];
                        if !st.is_null() && st["confirmationStatus"].as_str().is_some() {
                            done = Some(st["err"].clone());
                            break;
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(15)).await;
                }
                let ms = t0.elapsed().as_secs_f64() * 1000.0;
                let mut s = stats.lock().await;
                match done {
                    Some(e) if e.is_null() => {
                        s.ok += 1;
                        s.lat_ms.push(ms);
                        if s.sample_sigs.len() < 20 {
                            s.sample_sigs.push(sig.clone());
                        }
                    }
                    Some(e) => {
                        s.fail += 1;
                        *s.reasons.entry(e.to_string()).or_default() += 1;
                    }
                    None => {
                        s.fail += 1;
                        *s.reasons.entry("timeout".into()).or_default() += 1;
                    }
                }
            }
        }));
    }
    for h in handles {
        let _ = h.await;
    }
    let elapsed = start.elapsed().as_secs_f64();
    let mut s = stats.lock().await;
    for sig in s.sample_sigs.clone() {
        if let Ok(t) = rpc(&c, &er, "getTransaction", json!([sig, {"encoding":"json","maxSupportedTransactionVersion":0}])).await {
            if let Some(cu) = t["meta"]["computeUnitsConsumed"].as_u64() {
                s.cu.push(cu);
            }
        }
    }
    let acc = rpc(&c, &er, "getAccountInfo", json!([bs58::encode(market).into_string(), {"encoding":"base64"}])).await?;
    let data = base64::engine::general_purpose::STANDARD.decode(acc["value"]["data"][0].as_str().unwrap_or_default())?;
    let u = |o: usize| u64::from_le_bytes(data[8 + o..8 + o + 8].try_into().unwrap());
    s.lat_ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    s.cu.sort();
    let lat = s.lat_ms.clone();
    let p = |q: f64| lat.get(((lat.len().max(1) - 1) as f64 * q) as usize).copied().unwrap_or(0.0);
    let out = json!({
        "match_id": match_id.to_string(), "bots": k, "trades_per_bot": m, "trades_attempted": s.ok + s.fail,
        "succeeded": s.ok, "success_rate": s.ok as f64 / (s.ok + s.fail).max(1) as f64, "rejects_by_reason": s.reasons,
        "onchain_counters": { "n_trades": u(168), "n_rejected_stale": u(176), "n_rejected_other": u(192) },
        "latency_ms": { "p50": p(0.5), "p95": p(0.95), "p99": p(0.99), "n": s.lat_ms.len() },
        "throughput_tps": s.ok as f64 / elapsed, "max_exposure_usdc": u(144) as f64 / 1e6, "cap_usdc": u(152) as f64 / 1e6,
        "trade_cu": { "p50": s.cu.get(s.cu.len() / 2), "max": s.cu.last() }, "elapsed_s": elapsed,
    });
    println!("{}", serde_json::to_string_pretty(&out)?);
    Ok(())
}
