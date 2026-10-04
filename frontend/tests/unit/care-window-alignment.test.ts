import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PassportItem } from "@engine/benefits";
import type { DemoScenario } from "@engine/api";
import type { VisitNavigatorRequest, VisitNavigatorResult } from "@engine/optimizer";
import { passportStatus, ItemRow, Passport } from "@/features/care-window/passport-summary";
import { NavigatorResult } from "@/features/care-window/visit-navigator";
import passportMock from "../../../backend/fixtures/mock-responses/passport.json";
import navigatorMock from "../../../backend/fixtures/mock-responses/visit-navigator.json";

describe("engine presentation trust boundaries", () => {
  const item = passportMock.data.sections[0].items[0] as PassportItem;
  it("retains distinct rule, source, uncertainty and stale statuses", () => {
    expect(passportStatus({ ...item, rule_status: "VERIFIED" })).toBe("Verified");
    expect(passportStatus({ ...item, rule_status: "UNKNOWN" })).toBe("Unknown");
    expect(passportStatus({ ...item, rule_status: "NOT_APPLICABLE" })).toBe("Not applicable");
    expect(passportStatus({ ...item, rule_status: "UNVERIFIED" })).toBe("Needs confirmation");
    expect(passportStatus({ ...item, rule_status: null, source: "MEMBER_CONFIRMED" })).toBe("User-entered");
    expect(passportStatus({ ...item, rule_status: null, source: "ESTIMATE" })).toBe("Partial");
    expect(passportStatus(item, [{ code: "INPUT_STALE", severity: "warning", message: "Stale balance", input_id: item.input_ids[0], field: null, rule_id: null, procedure_id: null, provider_id: null }])).toBe("Stale");
  });
  it("shows observation and rule references without inventing a freshness date", () => {
    const html = renderToStaticMarkup(createElement(ItemRow, { item: { ...item, observed_at: null, rule_ids: ["rule-test"] } }));
    expect(html).toContain("Last checked: Not supplied");
    expect(html).toContain("rule-test");
    expect(html).toContain("Source and freshness");
  });
  it("exposes settled, reserved and available fields from the returned passport", () => {
    const html = renderToStaticMarkup(createElement(Passport, { passport: passportMock.data as never, scenario: { member: { funding_accounts: [] } } as unknown as DemoScenario }));
    expect(html).toContain("Annual maximum remaining (settled)");
    expect(html).toContain("Pending reservation against maximum");
    expect(html).toContain("Annual maximum available after pending");
    expect(html).toContain(passportMock.data.network_id);
    expect(html).toContain(passportMock.data.plan_option_id);
  });
  it("suppresses every cost option and conditional comparison under an urgent safety gate", () => {
    const result = { ...navigatorMock.data, safety: { urgent: true, triggered_by: ["severe_pain"], message: "Contact your dentist now." } } as VisitNavigatorResult;
    const html = renderToStaticMarkup(createElement(NavigatorResult, { result, request: {} as VisitNavigatorRequest, scenario: {} as DemoScenario }));
    expect(html).toContain("Contact a dentist now");
    expect(html).not.toContain(result.options[0].provider_name);
    expect(html).not.toContain("You pay");
    expect(html).not.toContain("Why these options?");
    expect(html).not.toContain("If your dentist confirms more care");
  });
});
