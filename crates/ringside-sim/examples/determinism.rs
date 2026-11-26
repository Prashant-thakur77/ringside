//! Writes the final hash-chain value of determinism episodes 0..N (one hex line each).
//! Usage: cargo run --release -p ringside-sim --example determinism -- <N> <out-file>
use ringside_sim::{determinism_episode, replay, SeedEvent};
use std::io::Write;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let n: u64 = args.get(1).and_then(|v| v.parse().ok()).unwrap_or(10_000);
    let out = args.get(2).cloned().unwrap_or_else(|| "native.txt".into());
    let mut f = std::io::BufWriter::new(std::fs::File::create(&out).unwrap());
    let mut inputs = vec![[0u16; 2]; 1100];
    let mut seeds = [SeedEvent { apply_at_tick: 0, seed: [0; 32] }; 8];
    for e in 0..n {
        let (init, k, ns) = determinism_episode(e, 1100, &mut inputs, &mut seeds);
        let (_, h) = replay(init, &inputs[..k], &seeds[..ns], |_, _| {});
        let hex: String = h.iter().map(|b| format!("{b:02x}")).collect();
        writeln!(f, "{hex}").unwrap();
    }
    eprintln!("native: wrote {n} episode hashes to {out}");
}
