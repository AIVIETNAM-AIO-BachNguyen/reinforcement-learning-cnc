import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import type { DecisionCaseEventsResponse, DecisionCaseListResponse } from "../../lib/operations-api/decision-case-reads";

const api = process.env.DECISION_CASES_LIVE_API_URL!.replace(/\/+$/, "");
const factoryId = process.env.DECISION_CASES_LIVE_FACTORY_ID ?? "factory-demo-01";

/** No route interception, mock adapter, seeding, commands or DB writes.
 * Supply a read-access account and an already provisioned stable test factory.
 */
test("real backend discovery, scoped cursors, reopening and complete audit remain read-only", async ({ page }, info) => {
  const unauthenticated = await page.request.get(`${api}/api/v1/decision-cases`, { params: { factory_id: factoryId, limit: "1" } });
  expect(unauthenticated.status()).toBe(401);
  await page.goto("/login");
  await page.getByLabel("Username").fill(process.env.DECISION_CASES_LIVE_USERNAME!);
  await page.locator('input[autocomplete="current-password"]').fill(process.env.DECISION_CASES_LIVE_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  const commands: string[] = [];
  page.on("request", request => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/v1/decision-cases")) commands.push(request.method());
  });
  const pages: DecisionCaseListResponse["meta"][] = [];
  const rows: DecisionCaseListResponse["data"] = [];
  let cursor: string | null = null;
  do {
    const response = await page.request.get(`${api}/api/v1/decision-cases`, { params: { factory_id: factoryId, limit: "1", ...(cursor ? { cursor } : {}) } });
    expect(response.status()).toBe(200);
    const payload = await response.json() as DecisionCaseListResponse;
    expect(payload.success).toBe(true);
    expect(payload.meta.factory_id).toBe(factoryId);
    rows.push(...payload.data); pages.push(payload.meta);
    if (!payload.meta.has_more) break;
    expect(payload.meta.next_cursor).toBeTruthy();
    expect(payload.meta.next_cursor).not.toBe(cursor);
    cursor = payload.meta.next_cursor;
  } while (cursor);
  expect(rows.length, "Provision at least two cases for real cursor acceptance").toBeGreaterThanOrEqual(2);
  expect(new Set(rows.map(row => row.decision_case_id)).size).toBe(rows.length);
  const selected = rows.find(row => ["COMMITTED", "REJECTED", "FAILED", "CANCELLED"].includes(row.status));
  expect(selected, "Provision a stable terminal case with at least two public events").toBeTruthy();
  const caseId = selected!.decision_case_id;
  const filtered = await page.request.get(`${api}/api/v1/decision-cases`, { params: { factory_id: factoryId, status: selected!.status, mode: selected!.mode } });
  expect(filtered.status()).toBe(200);
  const matching = await filtered.json() as DecisionCaseListResponse;
  expect(matching.data.every(row => row.status === selected!.status && row.mode === selected!.mode)).toBe(true);
  const denied = await page.request.get(`${api}/api/v1/decision-cases`, { params: { factory_id: "factory-not-accessible-or-unknown" } });
  expect(denied.status()).toBe(404);
  const eventPages: DecisionCaseEventsResponse["meta"][] = [];
  const events: DecisionCaseEventsResponse["data"] = [];
  let after = 0;
  do {
    const response = await page.request.get(`${api}/api/v1/decision-cases/${encodeURIComponent(caseId)}/events`, { params: { after_sequence: String(after), limit: "1" } });
    expect(response.status()).toBe(200);
    const payload = await response.json() as DecisionCaseEventsResponse;
    events.push(...payload.data); eventPages.push(payload.meta);
    if (!payload.meta.has_more) break;
    expect(payload.meta.next_after_sequence).toBeGreaterThan(after);
    after = payload.meta.next_after_sequence;
  } while (true);
  expect(events.length).toBeGreaterThanOrEqual(2);
  expect(new Set(events.map(event => event.sequence)).size).toBe(events.length);
  await page.goto(`/operations/cases?${new URLSearchParams({ factory_id: factoryId, status: selected!.status, mode: selected!.mode })}`);
  await expect(page.getByRole("note").first()).toContainText("Live Operations API");
  await expect(page.getByRole("button", { name: "Refresh cases" })).toBeEnabled();
  while (!await page.getByRole("link", { name: `Open recommendation for ${caseId}` }).count()) {
    await page.getByRole("button", { name: "Load more cases" }).click();
    await expect(page.getByRole("button", { name: "Refresh cases" })).toBeEnabled();
  }
  await page.screenshot({ path: info.outputPath("real-list.png"), fullPage: true });
  await page.getByRole("link", { name: `Open recommendation for ${caseId}` }).click();
  await expect(page).toHaveURL(new RegExp(`recommendations\\?caseId=${caseId}`));
  const timeline = page.getByRole("list", { name: "Decision case audit events" });
  await expect(timeline.getByRole("listitem")).toHaveCount(events.length);
  expect(await timeline.getByRole("listitem").evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("data-sequence"))))).toEqual(events.map(event => event.sequence));
  await page.locator("#decision-case-audit").screenshot({ path: info.outputPath("real-timeline.png") });
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("button", { name: "Refresh history" })).toBeEnabled();
  await expect(timeline.getByRole("listitem")).toHaveCount(events.length);
  await page.reload();
  await expect(timeline.getByRole("listitem")).toHaveCount(events.length);
  expect(commands).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true });
  expect(sha.status).toBe(0);
  await info.attach("real-api-evidence.json", { contentType: "application/json", body: Buffer.from(JSON.stringify({ sha: sha.stdout.trim(), project: info.project.name, factoryId, caseId, pages, eventPages, sequences: events.map(event => event.sequence), commands, intercepted: false }, null, 2)) });
});
