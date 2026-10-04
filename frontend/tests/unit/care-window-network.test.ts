import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VisitOption } from "@engine/optimizer";

import { networkTierLabel, OptionCard } from "@/features/care-window/visit-navigator";
import navigatorMock from "../../../backend/fixtures/mock-responses/visit-navigator.json";

// PLAN-002 (contract 1.4): an unknown tier is never shown as "Out of network".
describe("visit navigator network tier", () => {
  it("labels each engine tier", () => {
    expect(networkTierLabel("in_network")).toBe("In network");
    expect(networkTierLabel("out_of_network")).toBe("Out of network");
    expect(networkTierLabel(null)).toBe("Network status needs confirmation");
  });

  it("an option with an unknown tier renders the needs-confirmation state", () => {
    const base = navigatorMock.data.options[0] as VisitOption;
    const option: VisitOption = { ...base, status: "NEEDS_CONFIRMATION", network_tier: null, member_cost: null, plan_pay: null };
    const html = renderToStaticMarkup(createElement(OptionCard, { option, sharedIssues: [], optionName: (id: string) => id }));
    expect(html).toContain("Network status needs confirmation");
    expect(html).not.toContain("Out of network");
    expect(html).toContain("Needs confirmation");
  });
});
