/**
 * Contract version. FROZEN.
 *
 * Every API envelope, engine result and explanation carries this value.
 * Only the Planner/Integrator may change it, through the change-request
 * process in docs/workflow.md. A bump must update docs/contracts/CHANGELOG.md
 * and re-run `npm run freeze`.
 */
export const CONTRACT_VERSION = "1.5.0" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

/** Freeze status of this contract version. */
export const CONTRACT_STATUS = "FROZEN" as const;

/** Engine identifiers recorded in traces (bump when engine semantics change). */
export const ENGINE_IDS = {
  benefits: "benefits-dppo-1",
  optimizer: "optimizer-enum-1",
  explainer: "explainer-1",
} as const;
