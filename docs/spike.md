# Capability spike (local, 2026-11-26T21:30:08.712Z)

Run with the production program instead of throwaway spike programs (decisions.md). Each line is evidence from match 1795728504882.

1. Delegation to the TEE validator + private Position (permission created on the ER, members = owner + house authority); reads by non-members and unauthenticated clients: see eval/data/e5-local.json. Reveal at settle: local:4xCSWDjFbkDqxt4zAquB95RwYg12ZnPbwTomkUgdBMW1efmETiN3DkzJPjqoWKvRXFNFdgv97A2uaNGYe9dWgzrA.
2. Crank: `schedule_tick` on the local ER local:2m6D3XpVYLcHMuQUkT4T9B2GqF7CoYZoY51j3RsDzLrith4ENJGQmuNTp1KAc6v9XHvFSxj2CaQUcMDAqmhqfcPw; match advanced by: **crank** → Switch A = ER crank. First crank tick: local:4xCSWDjFbkDqxt4zAquB95RwYg12ZnPbwTomkUgdBMW1efmETiN3DkzJPjqoWKvRXFNFdgv97A2uaNGYe9dWgzrA. Cadence: eval/data/e3-local.json.
3. VRF on the ephemeral queue: request n/a, callback NOT OBSERVED → Switch B = base-layer seed chain fallback.
4. Ephemeral SPL: stakes moved player eATA → match escrow (join local:5BBh9K93Z3rDY7oKVcaAHzuECEd2sBkTbg2qs8jsSssnG7BMQKxiaSVnguaUgskE8p4V65CJzj4M4mWpZeX7EWxJ), PDA-signed payout at settle (local:4xCSWDjFbkDqxt4zAquB95RwYg12ZnPbwTomkUgdBMW1efmETiN3DkzJPjqoWKvRXFNFdgv97A2uaNGYe9dWgzrA), house vault funded by `topup_house_vault`.
5. Session key accepted on the ER: trade signed only by session key DBWvcCP7NM3wFXseBRzhV6Y7eDX3JLfkjx6UJZtgXznR (token 4kN2e32e5jwoFn6ja5g56nCMTUVa9V95dBTkyQpscCQP): local:4pCAZAkmQuP7Hdys9RMnm6tyhbTtcbL2jJHum1ps9v2bPdqrTTccjtvkAJnCMGv9tj6kRajTugtshJqTsTofhiwp
