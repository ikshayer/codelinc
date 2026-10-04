# Expanded synthetic population

`expanded_demo_data.json` is a deterministic, generated demonstration dataset. It is entirely synthetic and must never be represented as carrier, provider, or member data.

The original single-member fixture remains the authoritative golden scenario for exact optimizer regression tests. This expanded population exists to exercise realistic list, search, filtering, staleness, error-state, claim-history, and scale behavior.

## Contents

- 200 member benefit snapshots across Value, Core, and Enhanced plan versions
- 32 provider locations across four Virginia markets and seven specialties
- 297 location-specific fee quotes covering 20 CDT codes
- 463 paid, pending, denied, and reversed claims
- 510 available, held, and waitlist appointment records
- 122 treatment cards, including multi-stage endodontic, implant, periodontal, surgical, restorative, and preventive care

## Quality controls

- Fixed PRNG seed and SHA-256 content checksum
- Stable synthetic identifiers and explicit `synthetic_demo` markers
- Integer-cent money and basis-point rates
- Unique natural keys and cross-collection reference validation
- Paid-claim totals reconciled to every member accumulator
- Annual maximum arithmetic and claim balance invariants
- Chronological claim adjudication for deductible accumulation
- Verified, stale, unknown, and unconfirmed states for safety-path testing
- Eastern time offsets that account for daylight-saving time
- Affordability preferences constrained to internally consistent values

Regenerate with `npm run data:generate` from `frontend`. The generator source, not manual edits to the JSON artifact, is authoritative.
