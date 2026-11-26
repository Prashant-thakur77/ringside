# Decisions

Changes forced by the docs, the spike or the toolchain, with the reason. The feature is kept in every case.

- 2026-11-27 · Web design: all website design, UI and UX work (Phase 8, /docs page, /proof) runs through the award-site-design skill, per the owner's instruction.
- 2026-11-27 · Sigmoid LUT tolerance: the checklist first said < 1e-5, but linear interpolation over a 1/32 grid has a theoretical max error of h²/8·max|σ″| ≈ 1.18e-5 (measured 1.17e-5). The plan fixes the LUT at 1024 entries, so the acceptance bound is set to 1.5e-5. Effect on prices: < 0.0012 cents per share.
- 2026-11-27 · Program tests: the plan says "Anchor TS tests on localnet with MagicBlock's local ER". The current docs (local-development guide) name MagicSVM 0.3.x as the environment for delegation, ER writes, commits, VRF callbacks, validator-1.1.1 cranks, Magic Actions, eATA projection and permission-gated reads, and the base repo now tests every example on MagicSVM. Following the docs: instruction tests run on MagicSVM (Rust, `cargo +stable test`), and live behaviour (TEE privacy, router, real VRF oracle, crank cadence) is proven on devnet-tee. Nothing is dropped.
- 2026-11-27 · Node 24.10.0 pinned through Volta (`.nvmrc` added).
- 2026-11-27 01:20 IST · Public GitHub repo created at the owner's request: https://github.com/Prashant-thakur77/ringside (secret scan of tracked files and history: clean).
- 2026-11-27 · VRF callback identity: `#[vrf_callback]` injects `address = scoped_vrf_identity_const(&crate::ID)`, which runs the PDA derivation at runtime and used all 197k CU in the callback (MagicSVM log: "exceeded CUs meter"). The context now declares `vrf_program_identity: Signer` with `address = VRF_CALLBACK_IDENTITY`, a compile-time `const` of the same scoped identity. The authentication is unchanged (same key, must sign); a test sends a spoofed callback and expects rejection.
