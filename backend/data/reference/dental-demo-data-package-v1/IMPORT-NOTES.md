# Dental demo package import notes

Imported from `Dental_Demo_Data_Package.zip` on 2026-10-03.

This directory is reference/import data. It is deliberately outside the runtime
locations `data/plans/**`, `data/sources/**`, and `fixtures/**`.

## Why it is quarantined from the v1.1 runtime

The package is synthetic and internally valid JSON, but it defines a different
data contract and a different demo story from the frozen CodeLinc contract:

- three Value/Core/Enhanced plan options instead of the two Northwind plan-year
  versions required by the golden registry;
- one plan version spanning 2026–2027 instead of service-date-selected annual
  versions;
- separate network deductibles, premiums, rollover, orthodontia, provider
  installment plans, and plan-option comparison, several of which are deferred
  or unsupported in CodeLinc contract v1.1;
- custom verification, specialty, urgency, availability, and evidence shapes;
- an expected output that assumes provider-plan installment funding, which the
  current optimizer intentionally does not model.

Loading these files directly would break the frozen registry expectations and
would mix two incompatible golden scenarios.

## Intended allocation

| Package path | Intended use |
|---|---|
| `sources/` | Human-readable synthetic reference only; do not add to the frozen source manifest. |
| `schemas/` | Input-adapter reference and future import validation. |
| `plan-registry/` | Future contract-v2 normalization or plan-comparison work. |
| `member-snapshots/` | Source material for a future adapter into `MemberState`. |
| `providers/` + `pricing/` | Must be joined before conversion to `ProviderOption`. |
| `procedure-cards/` | Source material for a future adapter into confirmed procedures. |
| `expected-output/` | Reference result only; not an assertion for the current optimizer. |
| `test-fixtures/` | Candidate future integration cases after normalization. |

## Adapter work required before activation

1. Choose whether this is a separate demo tenant or a contract-v2 plan-comparison
   feature. Do not merge it into the Northwind golden scenario.
2. Split effective coverage into service-date-selected annual plan versions.
3. Convert every usable plan fact into the current discriminated `PlanRule`
   format with literal source evidence and CodeLinc verification statuses.
4. Resolve unsupported semantics explicitly: separate network deductibles,
   rollover, orthodontia, premiums, and provider installment plans must never be
   silently simplified.
5. Convert member money fields to sourced inputs, availability to the supported
   weekly/unavailable model, and funding to `FundingAccount` plus `MonthlyBudget`.
6. Join provider and pricing snapshots, map specialties to the frozen vocabulary,
   and retain observation timestamps and input ids.
7. Map dentist urgency only through an explicit reviewed table; never infer it
   from labels or prose at optimization time.
8. Generate new non-frozen integration tests first. A frozen-contract or golden
   change requires the documented change-request and re-freeze workflow.

All package data is labeled synthetic. It must not be represented as a real
carrier plan or real member/provider data.
