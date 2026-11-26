# Decisions

Changes forced by the docs, the spike or the toolchain, with the reason. The feature is kept in every case.

- 2026-11-27 · Web design: all website design, UI and UX work (Phase 8, /docs page, /proof) runs through the award-site-design skill, per the owner's instruction.
- 2026-11-27 · Sigmoid LUT tolerance: the checklist first said < 1e-5, but linear interpolation over a 1/32 grid has a theoretical max error of h²/8·max|σ″| ≈ 1.18e-5 (measured 1.17e-5). The plan fixes the LUT at 1024 entries, so the acceptance bound is set to 1.5e-5. Effect on prices: < 0.0012 cents per share.
