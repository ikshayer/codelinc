import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Use a local installation, or an explicit module path supplied by the runner.
const require = createRequire(import.meta.url);
const modulePath = process.env.PLAYWRIGHT_MODULE || require.resolve("playwright");
const { chromium } = await import(pathToFileURL(modulePath).href);
const baseURL = process.env.CAREWINDOW_BROWSER_URL || "http://localhost:3000";
const outputDirectory = resolve(process.env.CAREWINDOW_BROWSER_OUTPUT || "../integration-audit/care-window-browser");
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const results = [];

function watch(page, expected = new Set()) {
  const failures = [];
  const requests = [];
  const cancellations = [];
  const completedVoiceDeletes = new Set();
  page.on("pageerror", error => failures.push(`Page error: ${error.message}`));
  page.on("console", message => {
    if (message.type() !== "error") return;
    // An intentionally injected HTTP failure generates Chromium's resource error.
    const url = message.location().url;
    if (expected.has(new URL(url || baseURL, baseURL).pathname) && /Failed to load resource/.test(message.text())) return;
    failures.push(`Console error: ${message.text()}`);
  });
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  page.on("requestfailed", request => {
    const url = new URL(request.url());
    if (request.method() === "DELETE" && completedVoiceDeletes.has(request) && request.failure()?.errorText === "net::ERR_ABORTED") {
      cancellations.push({ url: request.url(), reason: "Chromium cancelled a bodyless voice teardown after the server confirmed HTTP 204" });
      return;
    }
    if (url.searchParams.has("_rsc") && /^\/analysis\/[^/]+\/(confirm|intake|compare)$/.test(url.pathname) && request.failure()?.errorText === "net::ERR_ABORTED") {
      cancellations.push({ url: request.url(), reason: "Next.js cancelled a speculative route payload" });
      return;
    }
    failures.push(`Failed request: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on("response", response => {
    if (response.request().method() === "DELETE" && response.status() === 204 && /^\/api\/voice\/sessions\/[^/]+$/.test(new URL(response.url()).pathname)) completedVoiceDeletes.add(response.request());
    if (response.status() >= 400 && !expected.has(new URL(response.url()).pathname)) {
      failures.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return { failures, requests, cancellations };
}

// Reach each control using Tab, then activate it from the keyboard. This also
// proves that controls are reachable in the actual document focus order.
async function tabTo(page, locator) {
  await locator.waitFor({ state: "visible" });
  for (let count = 0; count < 600; count += 1) {
    if (await locator.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Control is unreachable with Tab: ${await locator.evaluate(element => element.textContent || element.getAttribute("aria-label"))}`);
}

async function activate(page, locator, key = "Enter") {
  await tabTo(page, locator);
  await page.keyboard.press(key);
}

async function capturePage(page, filename) {
  // Visit each viewport so existing scroll-triggered reveals are visible in
  // the exported full-page screenshot, then capture from the top.
  const dimensions = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, step: innerHeight * 0.8 }));
  for (let top = 0; top < dimensions.height; top += dimensions.step) {
    await page.evaluate(position => window.scrollTo(0, position), top);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(outputDirectory, filename), fullPage: true });
}

async function engineAction(page, locator, endpoint, key = "Enter") {
  await tabTo(page, locator);
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === `/api/engine/${endpoint}` && response.request().method() === "POST");
  await page.keyboard.press(key);
  const response = await responsePromise;
  assert.equal(response.status(), 200, `${endpoint} must succeed: ${response.status() === 200 ? "" : await response.text()}`);
  const body = await response.json();
  assert.equal(body.ok, true, `${endpoint} must return an ok envelope`);
  return { request: response.request().postDataJSON(), result: body.data };
}

async function visibleText(page, text) {
  await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: "visible" });
}

async function openDisclosure(page, name) {
  const disclosure = page.locator("summary:visible").filter({ hasText: name }).first();
  if (!(await disclosure.evaluate(element => element.parentElement.open))) await activate(page, disclosure);
  assert.equal(await disclosure.evaluate(element => element.parentElement.open), true);
}

async function journey(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const observed = watch(page);
  try {
    await page.goto(`${baseURL}/care-window`, { waitUntil: "networkidle" });
    await visibleText(page, "Synthetic");
    await visibleText(page, "Engine ready");
    await activate(page, page.getByRole("link", { name: "Skip to content" }));
    if (viewport.width < 768) {
      await activate(page, page.getByRole("button", { name: "Menu", exact: true }));
      await page.keyboard.press("Escape");
    }
    const visit = await engineAction(page, page.getByRole("button", { name: "Find visit options", exact: true }), "visit-navigator");
    assert.ok(visit.result.options.length > 0 && visit.result.options.length <= 3);
    await engineAction(page, page.getByRole("button", { name: "Read the plan", exact: true }), "intake/extract");
    const include = page.getByRole("checkbox", { name: /Include/ });
    assert.ok(await include.count() > 0, "Treatment inclusion controls must exist");
    for (const checkbox of await include.all()) await activate(page, checkbox, "Space");
    const factual = page.getByRole("checkbox", { name: /I checked these facts/i });
    for (const checkbox of await factual.all()) await activate(page, checkbox, "Space");
    const built = await engineAction(page, page.getByRole("button", { name: /Confirm.*build my plan/i }), "care-plan");
    const baseline = built.result.alternatives.find(alternative => alternative.alternative_id === built.result.recommended_alternative_id);
    assert.ok(baseline?.events.length > 0, "Recommended timeline must contain appointments");
    await openDisclosure(page, /financial summary/i);
    await openDisclosure(page, /Benefits left after this visit/i);
    await openDisclosure(page, /Cost breakdown and calculation sources/i);
    await openDisclosure(page, /how this was calculated/i);
    await openDisclosure(page, /^Plan evidence/i);
    for (const text of ["Office / modeled charge", "Contracted adjustment", "Eligible / allowed basis", "Balance bill", "Deductible applied", "Plan coverage rate", "Cap applied", "Member responsibility", "Annual maximum available after pending"]) await visibleText(page, text);
    const selectedPanel = page.getByRole("tabpanel");
    assert.equal(await selectedPanel.locator("summary:visible").filter({ hasText: "Cost breakdown and calculation sources" }).count(), baseline.events.length, "Every scheduled event must expose adjudication");
    assert.equal(await selectedPanel.locator("summary:visible").filter({ hasText: "Benefits left after this visit" }).count(), baseline.events.length, "Every scheduled event must expose its returned benefit state");
    if (baseline.events.some(event => event.route_comparison)) await visibleText(page, "Cash versus claim across the whole plan");

    const pinned = await engineAction(page, page.getByRole("button", { name: "Pin this appointment", exact: true }).first(), "care-plan");
    assert.equal(pinned.request.schedule_locks.length, 1);
    const lock = pinned.request.schedule_locks[0];
    assert.ok(baseline.events.some(event => ["procedure_id", "provider_id", "slot_id", "claim_route"].every(key => event[key] === lock[key])), "Pin must submit one returned exact tuple");
    assert.ok(pinned.result.alternatives.every(alternative => alternative.events.some(event => event.user_locked && ["procedure_id", "provider_id", "slot_id", "claim_route"].every(key => event[key] === lock[key]))), "Every returned alternative must preserve the exact lock");
    await visibleText(page, "Your plan");
    await visibleText(page, "Pinned by you");
    const rerun = await engineAction(page, page.getByRole("button", { name: "Re-optimize unlocked items", exact: true }), "care-plan");
    assert.deepEqual(rerun.request.schedule_locks, [lock]);
    const undone = await engineAction(page, page.getByRole("button", { name: /Undo last (pin|change)/i }), "care-plan");
    assert.equal(undone.request.schedule_locks?.length || 0, 0);
    assert.deepEqual(undone.result.alternatives, built.result.alternatives, "Undo must restore the original server recommendation");
    await engineAction(page, page.getByRole("button", { name: "Pin this appointment", exact: true }).first(), "care-plan");
    const unpinned = await engineAction(page, page.getByRole("button", { name: "Unpin appointment", exact: true }).first(), "care-plan");
    assert.equal(unpinned.request.schedule_locks?.length || 0, 0);
    assert.deepEqual(unpinned.result.alternatives, built.result.alternatives);
    await engineAction(page, page.getByRole("button", { name: "Pin this appointment", exact: true }).first(), "care-plan");
    const reset = await engineAction(page, page.getByRole("button", { name: "Reset to recommended", exact: true }), "care-plan");
    assert.equal(reset.request.schedule_locks?.length || 0, 0);
    assert.deepEqual(reset.result.alternatives, built.result.alternatives);

    await openDisclosure(page, /^Plan preferences$/i);
    const budget = page.getByLabel(/Hard monthly (cash )?limit/i);
    await tabTo(page, budget);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("1200");
    const travel = page.getByLabel("Hard travel limit (miles)", { exact: true });
    await tabTo(page, travel);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("30");
    const availableFrom = page.getByLabel("Available from 1", { exact: true });
    await tabTo(page, availableFrom);
    await page.keyboard.press("ArrowUp");
    const changedTime = await availableFrom.inputValue();
    const preferences = await engineAction(page, page.getByRole("button", { name: /Apply preferences/i }), "care-plan");
    assert.equal(preferences.request.member.budget.hard_monthly_limit_cents, 120000);
    assert.equal(preferences.request.member.travel.hard_max_miles, 30);
    assert.equal(preferences.request.member.availability.weekly[0].start_time, changedTime);
    assert.notDeepEqual(preferences.request.member.availability, built.request.member.availability);
    assert.deepEqual(preferences.request.member.plan_key, built.request.member.plan_key, "Preferences must preserve canonical plan identity");

    await capturePage(page, `${viewport.width}-journey.png`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const overflowElements = overflow ? await page.evaluate(() => [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(-15).map(element => ({ tag: element.tagName, text: element.textContent.slice(0, 140), className: typeof element.className === "string" ? element.className : "" }))) : [];
    assert.equal(overflow, false, `The page must fit the viewport: ${JSON.stringify(overflowElements)}`);
    assert.ok(observed.requests.every(path => !/^\/api\/(auth|calculate|demo)(\/|$)/.test(path)), "Engine journey must avoid legacy APIs");
    assert.deepEqual(observed.failures, [], "No console errors, browser errors, or failed requests on the full journey");
    results.push({ viewport, passed: true, apiRequests: observed.requests.filter(path => path.startsWith("/api/")), pinnedTuple: lock });
    console.log(`${viewport.width}px keyboard journey passed`);
  } finally {
    await context.close();
  }
}

async function states() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const expected = new Set(["/api/engine/health"]);
  const observed = watch(page, expected);
  let failHealth = true;
  await page.route("**/api/engine/health", async route => {
    if (!failHealth) return route.continue();
    failHealth = false;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "UNAVAILABLE", message: "Temporary engine outage", retryable: true } }) });
  });
  try {
    await page.goto(`${baseURL}/care-window`, { waitUntil: "networkidle" });
    await visibleText(page, "Temporary engine outage");
    await activate(page, page.getByRole("button", { name: "Retry health check", exact: true }));
    await visibleText(page, "Engine ready");
    await page.route("**/api/engine/visit-navigator", async route => {
      const response = await route.fetch();
      const body = await response.json();
      // Keep real options in a future-shaped urgent response: the UI must suppress them.
      body.data.safety = { urgent: true, message: "Contact a dentist now", triggered_by: ["severe_pain"] };
      await route.fulfill({ response, json: body });
    });
    await engineAction(page, page.getByRole("button", { name: "Find visit options", exact: true }), "visit-navigator");
    await page.getByRole("alert").filter({ hasText: "Contact a dentist now" }).waitFor();
    const visitSection = page.locator("section").filter({ has: page.getByRole("heading", { name: /Before the visit/i }) }).first();
    assert.equal(await visitSection.getByText("You pay", { exact: true }).count(), 0, "Urgent output must suppress cost comparison even when options exist");
    assert.equal(await visitSection.getByText("If your dentist confirms more care", { exact: true }).count(), 0);

    await page.unroute("**/api/engine/visit-navigator");
    await page.route("**/api/engine/visit-navigator", async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.options = [];
      await route.fulfill({ response, json: body });
    });
    await engineAction(page, page.getByRole("button", { name: "Find visit options", exact: true }), "visit-navigator");
    await visibleText(page, "No dentist fits these needs right now");

    await page.unroute("**/api/engine/visit-navigator");
    await page.route("**/api/engine/visit-navigator", async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.options = body.data.options.slice(0, 1).map(option => ({ ...option, status: "NEEDS_CONFIRMATION", network_tier: null, member_cost: null, plan_pay: null }));
      await route.fulfill({ response, json: body });
    });
    await engineAction(page, page.getByRole("button", { name: "Find visit options", exact: true }), "visit-navigator");
    await visibleText(page, "Network status needs confirmation");
    await visitSection.getByText("Unknown", { exact: true }).first().waitFor();

    await page.unroute("**/api/engine/visit-navigator");
    expected.add("/api/engine/visit-navigator");
    let failVisit = true;
    await page.route("**/api/engine/visit-navigator", async route => {
      if (!failVisit) return route.continue();
      failVisit = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: { code: "UNAVAILABLE", message: "Temporary visit outage", retryable: true } }) });
    });
    await activate(page, page.getByRole("button", { name: "Find visit options", exact: true }));
    await visibleText(page, "Temporary visit outage");
    await engineAction(page, visitSection.getByRole("button", { name: "Try again", exact: true }), "visit-navigator");
    await page.route("**/api/engine/intake/extract", async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.procedures = [];
      await route.fulfill({ response, json: body });
    });
    await engineAction(page, page.getByRole("button", { name: "Read the plan", exact: true }), "intake/extract");
    await visibleText(page, "No procedures were found in this document");
    assert.deepEqual(observed.failures, []);
    results.push({ states: "health and visit retry, empty visit and treatment, partial network/cost, future urgent response suppression", passed: true });
  } finally {
    await context.close();
  }
}

async function voiceJourney() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    const originalFetch = window.fetch;
    window.__carewindowVoiceFrames = [];
    window.fetch = async (...arguments_) => {
      const response = await originalFetch(...arguments_);
      const url = typeof arguments_[0] === "string" ? arguments_[0] : arguments_[0]?.url || "";
      if (/\/api\/voice\/sessions\/[^/]+\/turns$/.test(url) && response.ok) {
        void response.clone().text().then(text => { window.__carewindowVoiceFrames = text.trim().split("\n").map(line => JSON.parse(line)); });
      }
      return response;
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const observed = watch(page);
  const speech = [];
  page.on("response", response => {
    if (/\/api\/voice\/sessions\/[^/]+\/speech$/.test(new URL(response.url()).pathname)) speech.push(response);
  });
  try {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await activate(page, page.getByRole("link", { name: "Start an analysis", exact: true }));
    const memberId = page.getByLabel("Member ID", { exact: true });
    await tabTo(page, memberId);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("SYN-MEMBER-0021");
    await typeField(page, page.getByLabel("Month", { exact: true }), "08");
    await typeField(page, page.getByLabel("Day", { exact: true }), "19");
    await typeField(page, page.getByLabel("Year", { exact: true }), "1974");
    await activate(page, page.getByRole("button", { name: /^Continue(?: as guest)?$/ }));
    const firstMethod = page.getByRole("radio").first();
    await tabTo(page, firstMethod);
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.getByRole("radio", { name: /Talk it through/i }).getAttribute("aria-checked"), "true");
    await activate(page, page.getByRole("button", { name: "Continue with voice", exact: true }));
    await page.getByRole("region", { name: "Voice conversation", exact: true }).waitFor();
    await visibleText(page, "Google Gemini");
    await activate(page, page.getByRole("button", { name: "Type instead", exact: true }));
    const answer = page.getByLabel("Type your answer", { exact: true });
    await tabTo(page, answer);
    await page.keyboard.type("Use these fictional demo details: my dentist recommends a root canal D3330 on tooth 30. The contracted fee for this root canal is 1000 dollars. The planned service date is November 2, 2026. My dentist says it is safe from October 20 through November 10, 2026. My dental plan annual maximum is 1500 dollars and the deductible is 50 dollars.");
    await tabTo(page, page.getByRole("button", { name: "Send", exact: true }));
    const turnPromise = page.waitForResponse(response => /\/api\/voice\/sessions\/[^/]+\/turns$/.test(new URL(response.url()).pathname), { timeout: 90000 });
    await page.keyboard.press("Enter");
    const turn = await turnPromise;
    assert.equal(turn.status(), 200, `Live voice turn must succeed: ${turn.status() === 200 ? "" : await turn.text()}`);
    await page.waitForFunction(() => window.__carewindowVoiceFrames.some(frame => frame.type === "complete"), null, { timeout: 90000 });
    const frames = await page.evaluate(() => window.__carewindowVoiceFrames);
    const complete = frames.find(frame => frame.type === "complete");
    assert.ok(complete?.extraction?.proposals?.length > 0, "Live Gemini response must propose facts from the fictional typed input");
    await visibleText(page, "Proposed details");
    const speechDeadline = Date.now() + 90000;
    while (speech.length === 0 && Date.now() < speechDeadline) await page.waitForTimeout(250);
    assert.ok(speech.length > 0, "The live reply must request spoken audio");
    for (const response of speech) {
      await response.finished();
      assert.equal(response.status(), 200);
      assert.ok(response.headers()["content-type"]?.includes("audio/wav"));
    }
    await writeFile(resolve(outputDirectory, "voice-live-response.json"), JSON.stringify({ fictional_input: true, proposedFacts: complete.extraction.proposals, speech: speech.map(response => ({ status: response.status(), contentType: response.headers()["content-type"] })) }, null, 2));
    // Let downloads and playback finish before ending, so the normal path does
    // not generate deliberate aborts that would dilute the failure gate.
    await page.getByRole("region", { name: "Voice conversation", exact: true }).getByRole("status").filter({ hasText: /^Listening\./ }).waitFor({ timeout: 120000 });
    const closed = page.waitForResponse(response => /\/api\/voice\/sessions\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === "DELETE");
    await activate(page, page.getByRole("button", { name: "End conversation", exact: true }));
    const closedResponse = await closed;
    assert.equal(closedResponse.status(), 204);
    await visibleText(page, "What was gathered");
    await activate(page, page.getByRole("link", { name: "Review details", exact: true }));
    await page.waitForURL(/\/analysis\/[^/]+\/confirm$/);
    await openDisclosure(page, /^Your prescribed care$/);
    assert.match(await page.locator("#input-care-p1-label").inputValue(), /D3330/);
    const feeProposal = complete.extraction.proposals.find(proposal => proposal.fieldPath === "care.p1.fee");
    assert.ok(feeProposal, "Live Gemini should extract the explicitly stated contracted fee");
    assert.equal(await page.locator("#input-care-p1-fee").inputValue(), feeProposal.value);
    await capturePage(page, "voice-confirmation.png");
    assert.deepEqual(observed.failures, [], "Original voice journey must have no unexpected browser or HTTP failures");
    results.push({ voice: "Original landing → name → Talk it through → live typed Gemini facts → Chatterbox WAV → confirmation", passed: true, proposedFacts: complete.extraction.proposals.length, speechResponses: speech.length, expectedRouteCancellations: observed.cancellations });
    console.log("Original live voice journey passed");
  } catch (error) {
    await page.screenshot({ path: resolve(outputDirectory, "voice-failure.png"), fullPage: true });
    await writeFile(resolve(outputDirectory, "voice-failure.txt"), JSON.stringify({ url: page.url(), failures: observed.failures, text: await page.locator("body").innerText() }, null, 2));
    throw error;
  } finally {
    await context.close();
  }
}

async function calculateAction(page, control) {
  await tabTo(page, control);
  const waiting = page.waitForResponse(response => new URL(response.url()).pathname === "/api/calculate" && response.request().method() === "POST");
  await page.keyboard.press("Enter");
  const response = await waiting;
  assert.equal(response.status(), 200, `Original calculation must succeed: ${response.status() === 200 ? "" : await response.text()}`);
  return { request: response.request().postDataJSON(), result: await response.json() };
}

async function originalJourney(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const observed = watch(page);
  try {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await activate(page, page.getByRole("button", { name: "Use sample", exact: true }));
    await page.waitForURL(/\/analysis\/[^/]+\/confirm$/);
    await activate(page, page.getByRole("checkbox", { name: "My plan and prescribed care details are correct.", exact: true }), "Space");
    await activate(page, page.getByRole("checkbox", { name: "The timing options came from my dentist, or are the synthetic sample.", exact: true }), "Space");
    const baseline = await calculateAction(page, page.getByRole("button", { name: "Compare my options", exact: true }));
    await page.waitForURL(/\/analysis\/[^/]+\/compare$/);
    assert.equal(baseline.result.planning.syntheticData, true);
    assert.ok(baseline.result.planning.records.length > 0);
    await visibleText(page, "Compare your options");
    await openDisclosure(page, /^Financial and benefit details$/);
    await openDisclosure(page, /^Benefits left after this care$/);
    await openDisclosure(page, /^See how this was calculated$/);
    await visibleText(page, "Payment date");
    await visibleText(page, "Annual maximum remaining");
    const recommendedCrown = () => page.getByRole("list", { name: "Best dentist-permitted alternative, next year", exact: true }).getByRole("button", { name: /^Crown/ });
    await activate(page, recommendedCrown());
    const pinned = await calculateAction(page, page.getByRole("button", { name: "Pin this service date", exact: true }));
    assert.equal(pinned.request.engineOptions.schedule_locks.length, 1);
    const lock = pinned.request.engineOptions.schedule_locks[0];
    assert.ok(pinned.result.planning.alternatives.every(alternative => pinned.result.planning.records.find(record => record.recordId === alternative.recordId).events.some(event => event.procedureId === lock.procedureId && event.serviceDate === lock.serviceDate && event.userLocked)), "Every original-flow alternative must preserve the pinned service date; the original baseline remains available for comparison");
    await visibleText(page, "Your plan");
    const rerun = await calculateAction(page, page.getByRole("button", { name: "Re-optimize unpinned care", exact: true }));
    assert.deepEqual(rerun.request.engineOptions.schedule_locks, [lock]);
    const undo = await calculateAction(page, page.getByRole("button", { name: "Undo last change", exact: true }));
    assert.equal(undo.result.planning.locks.length, 0);
    assert.deepEqual(undo.result.best, baseline.result.best);
    await activate(page, recommendedCrown());
    await calculateAction(page, page.getByRole("button", { name: "Pin this service date", exact: true }));
    const reset = await calculateAction(page, page.getByRole("button", { name: "Reset to recommended", exact: true }));
    assert.equal(reset.result.planning.locks.length, 0);
    assert.deepEqual(reset.result.best, baseline.result.best);
    await openDisclosure(page, /^Payment preferences$/);
    for (const [label, value] of [["Hard monthly limit ($)", "4000"], ["Preferred monthly target ($)", "2000"]]) {
      const input = page.getByLabel(label, { exact: true });
      await tabTo(page, input);
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(value);
    }
    const preferred = await calculateAction(page, page.getByRole("button", { name: "Apply preferences and rebuild", exact: true }));
    assert.deepEqual(preferred.request.engineOptions.budget, { hardMonthlyLimitCents: 400000, preferredMonthlyLimitCents: 200000 });
    assert.deepEqual(preferred.result.planning.budget, preferred.request.engineOptions.budget);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, "Original comparison must fit desktop and mobile viewports");
    await capturePage(page, `${viewport.width}-original-compare.png`);
    assert.deepEqual(observed.failures, []);
    results.push({ original: "Landing sample → confirmation → real calculation → financial/benefit calculations → pin → rerun → undo/reset → payment preferences", viewport, passed: true, pinnedDate: lock, expectedRouteCancellations: observed.cancellations });
    console.log(`${viewport.width}px original comparison journey passed`);
  } catch (error) {
    await page.screenshot({ path: resolve(outputDirectory, `${viewport.width}-original-failure.png`), fullPage: true });
    await writeFile(resolve(outputDirectory, `${viewport.width}-original-failure.txt`), JSON.stringify({ url: page.url(), failures: observed.failures, text: await page.locator("body").innerText() }, null, 2));
    throw error;
  } finally {
    await context.close();
  }
}

async function typeField(page, locator, value) {
  await tabTo(page, locator);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(value);
}

async function memberJourney(viewport, identity, expectedBenefits, mismatchFirst = false) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const observed = watch(page);
  try {
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await activate(page, page.getByRole("link", { name: "Start an analysis", exact: true }));
    await typeField(page, page.getByLabel("Member ID", { exact: true }), identity.memberId);
    assert.equal(await page.getByLabel("Name", { exact: true }).count(), 0, "Identity entry must use only member ID and DOB");
    assert.equal(await page.locator("summary").filter({ hasText: "More details" }).count(), 0);
    const [year, month, day] = identity.dateOfBirth.split("-");
    await typeField(page, page.getByLabel("Month", { exact: true }), month);
    await typeField(page, page.getByLabel("Day", { exact: true }), mismatchFirst ? String(Number(day) + 1) : day);
    await typeField(page, page.getByLabel("Year", { exact: true }), year);
    async function lookup() {
      await tabTo(page, page.getByRole("button", { name: /^Continue(?: as guest)?$/ }));
      const waiting = page.waitForResponse(response => new URL(response.url()).pathname === "/api/demo/member-lookup" && response.request().method() === "POST");
      await page.keyboard.press("Enter");
      const response = await waiting;
      assert.equal(response.status(), 200);
      return { request: response.request().postDataJSON(), data: await response.json() };
    }
    if (mismatchFirst) {
      const mismatch = await lookup();
      assert.deepEqual(mismatch.data, { matched: false }, "Wrong DOB must return the same generic non-match as an unknown ID, with no member or plan");
      await visibleText(page, "Check both fields and try again");
      assert.equal(await page.getByRole("region", { name: "Matched member benefits" }).count(), 0);
      assert.equal(await page.getByRole("heading", { name: "How would you like to start?" }).count(), 0);
      await typeField(page, page.getByLabel("Day", { exact: true }), day);
    }
    const matched = await lookup();
    assert.equal(matched.request.memberId, identity.memberId);
    assert.equal(matched.request.dateOfBirth, identity.dateOfBirth);
    assert.equal(matched.request.displayName, undefined);
    assert.equal(matched.data.member.member_id, identity.memberId);
    assert.equal(matched.data.member.date_of_birth, identity.dateOfBirth);
    assert.notEqual(matched.data.member.member_id, "DEMO-ALEX-001");
    for (const [key, value] of Object.entries(expectedBenefits)) assert.equal(matched.data.member.benefit_state[key], value);
    await page.getByRole("region", { name: "Matched member benefits" }).waitFor();
    await visibleText(page, matched.data.member.display_name);
    await activate(page, page.getByRole("button", { name: "Use sample treatment", exact: true }));
    await page.waitForURL(/\/analysis\/[^/]+\/confirm$/);
    await openDisclosure(page, /^Your plan$/);
    const storedMoney = async path => Number((await page.locator(`#input-${path}`).locator("p").first().innerText()).replace(/[^\d.]/g, "")) * 100;
    assert.equal(await storedMoney("plan-y1-annualMaximum"), expectedBenefits.annual_maximum_total_cents, "Sample care must retain this member's actual plan limit");
    assert.equal(await storedMoney("plan-y1-alreadyUsed"), expectedBenefits.plan_paid_ytd_cents, "Sample care must retain this member's settled YTD balance");
    // Explicit fictional future-use assumptions are separate from imported
    // settled balances; the fixture contains no future-year member snapshot.
    await typeField(page, page.locator("#input-plan-y2-alreadyUsed"), "0");
    await typeField(page, page.locator("#input-plan-y2-deductibleSatisfied"), "0");
    const unchanged = page.locator("#input-plan-y2-rulesUnchanged");
    if (await unchanged.getAttribute("aria-pressed") !== "true") await activate(page, unchanged, "Space");
    await activate(page, page.getByRole("checkbox", { name: "My plan and prescribed care details are correct.", exact: true }), "Space");
    await activate(page, page.getByRole("checkbox", { name: "The timing options came from my dentist, or are the synthetic sample.", exact: true }), "Space");
    const baseline = await calculateAction(page, page.getByRole("button", { name: "Compare my options", exact: true }));
    assert.equal(baseline.request.memberIdentity.dateOfBirth, identity.dateOfBirth);
    assert.equal(baseline.request.memberIdentity.memberId, identity.memberId, "Calculation must remain tied to the internally resolved member ID");
    const benefit = baseline.result.memberBenefitContext;
    assert.equal(benefit.memberId, identity.memberId);
    assert.equal(benefit.status, identity.memberId === "SYN-MEMBER-0002" ? "CONSERVATIVE" : "READY");
    assert.equal(benefit.annualMaximumCents, expectedBenefits.annual_maximum_total_cents);
    assert.equal(benefit.settledPlanPaidCents, expectedBenefits.plan_paid_ytd_cents);
    assert.equal(benefit.baseRemainingCents, expectedBenefits.annual_maximum_remaining_cents);
    if (identity.memberId === "SYN-MEMBER-0002") {
      assert.equal(benefit.pendingProjectedPlanPaymentCents, 9300);
      assert.equal(benefit.rolloverBankCents, 30000);
      assert.equal(benefit.baseAvailableAfterPendingCents, 162990);
      assert.equal(benefit.deductibleRemainingCents, 2500);
      assert.equal(benefit.estimateKind, "CONSERVATIVE_BASE_ONLY");
      await visibleText(page, "Conservative estimate");
      await visibleText(page, "Pending projected plan payment reservation");
      await visibleText(page, "Base available after pending reservation");
      await visibleText(page, "Rollover bank");
    }
    // Exercise the real server trust boundary with a captured valid request.
    // Only financial plan facts change; the identity and confirmed care remain.
    const tampered = structuredClone(baseline.request);
    tampered.requestId += "-tampered";
    for (const year of tampered.scenario.plan.years) {
      year.annualMaximumCents = 9999999;
      year.deductibleCents = 0;
      year.utilization.priorInsurerPaymentsCents = 0;
      year.utilization.priorDeductibleSatisfiedCents = 0;
      for (const rule of Object.values(year.rules)) { rule.insurerBasisPoints = 10000; rule.deductibleApplies = false; }
    }
    const tamperedResponse = await context.request.post(`${baseURL}/api/calculate`, { data: tampered });
    assert.equal(tamperedResponse.status(), 200, await tamperedResponse.text());
    const protectedResult = await tamperedResponse.json();
    assert.deepEqual(protectedResult.memberBenefitContext, benefit);
    assert.equal(protectedResult.baseline.totalPatientCents, baseline.result.baseline.totalPatientCents, "Edited browser plan facts must not change the authoritative member calculation");
    assert.equal(protectedResult.baseline.totalInsurerCents, baseline.result.baseline.totalInsurerCents);
    if (mismatchFirst) {
      const wrongIdentity = structuredClone(baseline.request);
      wrongIdentity.memberIdentity.dateOfBirth = `${year}-${month}-${String(Number(day) + 1).padStart(2, "0")}`;
      const rejected = await context.request.post(`${baseURL}/api/calculate`, { data: wrongIdentity });
      assert.equal(rejected.status(), 404, "A calculation with a wrong DOB must not fall back to guest or Alex benefits");
      const rejectedBody = await rejected.json();
      assert.equal(rejectedBody.error.code, "MEMBER_NOT_FOUND");
      assert.equal(rejectedBody.baseline, undefined);
      const unresolvedRequest = structuredClone(baseline.request);
      unresolvedRequest.memberIdentity = { memberId: "SYN-MEMBER-0002", dateOfBirth: "2018-02-28" };
      const unresolved = await context.request.post(`${baseURL}/api/calculate`, { data: unresolvedRequest });
      assert.equal(unresolved.status(), 200, "Approved pending/rollover treatment must return an explicitly conservative estimate");
      const unresolvedBody = await unresolved.json();
      assert.equal(unresolvedBody.memberBenefitContext.memberId, "SYN-MEMBER-0002");
      assert.equal(unresolvedBody.memberBenefitContext.settledPlanPaidCents, 27710);
      assert.equal(unresolvedBody.memberBenefitContext.pendingProjectedPlanPaymentCents, 9300);
      assert.equal(unresolvedBody.memberBenefitContext.rolloverBankCents, 30000);
      assert.equal(unresolvedBody.memberBenefitContext.baseAvailableAfterPendingCents, 162990);
      assert.equal(unresolvedBody.memberBenefitContext.deductibleRemainingCents, 2500);
      assert.equal(unresolvedBody.memberBenefitContext.status, "CONSERVATIVE");
      assert.equal(unresolvedBody.memberBenefitContext.estimateKind, "CONSERVATIVE_BASE_ONLY");
      assert.equal(unresolvedBody.memberBenefitContext.pendingTreatment, "RESERVED_PROJECTED");
      assert.equal(unresolvedBody.memberBenefitContext.pendingDeductibleTreatment, "UNCHANGED_CONSERVATIVE");
      assert.equal(unresolvedBody.memberBenefitContext.rolloverTreatment, "EXCLUDED_UNCONFIRMED");
      assert.equal(unresolvedBody.baseline.ledgers[0].maximum.usedBeforeCents, 27710);
      assert.equal(unresolvedBody.baseline.ledgers[0].maximum.reservedBeforeCents, 9300);
      assert.equal(unresolvedBody.baseline.ledgers[0].procedures[0].maximumBeforeCents, 162990);
    }
    const unknownResponse = await context.request.post(`${baseURL}/api/demo/member-lookup`, { data: { ...matched.request, memberId: "SYN-MEMBER-9999" } });
    assert.equal(unknownResponse.status(), 200);
    assert.deepEqual(await unknownResponse.json(), { matched: false });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await capturePage(page, `${viewport.width}-${identity.memberId}-compare.png`);
    assert.deepEqual(observed.failures, []);
    results.push({ member: identity.memberId, viewport, passed: true, memberBenefitContext: benefit, originalFlow: true, submittedPlanOverrideBlocked: true, mismatchBlocked: mismatchFirst, expectedRouteCancellations: observed.cancellations });
    console.log(`${viewport.width}px ${identity.memberId} lookup and server-owned calculation passed`);
  } catch (error) {
    await page.screenshot({ path: resolve(outputDirectory, `${identity.memberId}-failure.png`), fullPage: true });
    await writeFile(resolve(outputDirectory, `${identity.memberId}-failure.txt`), JSON.stringify({ url: page.url(), failures: observed.failures, text: await page.locator("body").innerText() }, null, 2));
    throw error;
  } finally { await context.close(); }
}

try {
  if (!process.argv.includes("--states-only") && !process.argv.includes("--voice-only") && !process.argv.includes("--original-only") && !process.argv.includes("--member-only")) {
    await journey({ width: 1440, height: 1000 });
    await journey({ width: 390, height: 844 });
  }
  if (!process.argv.includes("--voice-only") && !process.argv.includes("--original-only") && !process.argv.includes("--member-only")) await states();
  if (process.argv.includes("--voice") || process.argv.includes("--voice-only")) await voiceJourney();
  if (process.argv.includes("--original") || process.argv.includes("--original-only")) {
    await originalJourney({ width: 1440, height: 1000 });
    await originalJourney({ width: 390, height: 844 });
  }
  if (process.argv.includes("--member") || process.argv.includes("--member-only")) {
    await memberJourney({ width: 1440, height: 1000 }, { name: "Parker Patel", memberId: "SYN-MEMBER-0021", dateOfBirth: "1974-08-19" }, { annual_maximum_total_cents: 150000, plan_paid_ytd_cents: 13360, annual_maximum_remaining_cents: 136640 }, true);
    await memberJourney({ width: 390, height: 844 }, { name: "Dakota Bennett", memberId: "SYN-MEMBER-0024", dateOfBirth: "2004-04-19" }, { annual_maximum_total_cents: 100000, plan_paid_ytd_cents: 52320, annual_maximum_remaining_cents: 47680 });
    await memberJourney({ width: 1440, height: 1000 }, { name: "Parker Irwin", memberId: "SYN-MEMBER-0002", dateOfBirth: "2018-02-28" }, { annual_maximum_total_cents: 200000, plan_paid_ytd_cents: 27710, annual_maximum_remaining_cents: 172290 });
  }
  await writeFile(resolve(outputDirectory, "results.json"), JSON.stringify({ baseURL, results }, null, 2));
  console.log(JSON.stringify({ passed: true, results, outputDirectory }, null, 2));
} catch (error) {
  await writeFile(resolve(outputDirectory, "results.json"), JSON.stringify({ baseURL, results, error: error.stack }, null, 2));
  throw error;
} finally {
  await browser.close();
}
