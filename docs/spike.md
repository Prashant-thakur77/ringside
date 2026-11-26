# Capability spike (local, 2026-11-26T21:42:45.984Z)

Run with the production program instead of throwaway spike programs (decisions.md). Each line is evidence from match 1795729202459.

1. Delegation to the TEE validator + private Position (permission created on the ER, members = owner + house authority); reads by non-members and unauthenticated clients: see eval/data/e5-local.json. Reveal at settle: local:38ZshAWEKazf7fc3F8wUmCfgtKkJ77ADFN5Jth4RCq8amwb9QH3HT2Li4DSNWgtkPuJBHjyX1PAjdcCi8EnfLPMi.
2. Crank: `schedule_tick` on the local ER local:4SXzD9T3k8hTbwzzZdHPNsEd59te8R5Emubdid4jBYAH5Nc94beWHoFNBV8YPtidTLDtyLCSGp3Xd5E6vMysMw42; match advanced by: **crank** → Switch A = ER crank. First crank tick: local:38ZshAWEKazf7fc3F8wUmCfgtKkJ77ADFN5Jth4RCq8amwb9QH3HT2Li4DSNWgtkPuJBHjyX1PAjdcCi8EnfLPMi. Cadence: eval/data/e3-local.json.
3. VRF on the ephemeral queue: request n/a, callback NOT OBSERVED → Switch B = base-layer seed chain fallback.
4. Ephemeral SPL: stakes moved player eATA → match escrow (join local:4rdXCbVa2fbngfCPvkyu9ktyGro5TQ3Jmzvc8sV1mXb7tY3U7eQQWytJuAPimXTbbD1akDx3pZbpsbf1HFpsoYGR), PDA-signed payout at settle (local:38ZshAWEKazf7fc3F8wUmCfgtKkJ77ADFN5Jth4RCq8amwb9QH3HT2Li4DSNWgtkPuJBHjyX1PAjdcCi8EnfLPMi), house vault funded by `topup_house_vault`.
5. Session key accepted on the ER: trade signed only by session key EkbRAPVi4AoTPcPAEhZFA9CXpHcLvzjBTdvTZdhEwFT5 (token 8WxFgsMQxSfV8tnkgzRw8dWBwa4LA2j2uwuJuTJQTJkj): local:3UMqqVpREFLXRKzWSWuk8fXLdHrHDbKkV98Wmr5inNPuh4rWvNvUPvwpcfd2P1Q2aWGPqDuNmweqWBa7NarqfRBG
