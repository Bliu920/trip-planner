import assert from "node:assert/strict";
import { test } from "node:test";
import { BudgetReview } from "../services/budgets";
import { checkBudgetPrices } from "../lib/budget";
import { unknownBudget, fixturePricedBudget } from "./plan-fixture";

const gap = { entryId: "stay", reason: "not_found" as const, explanation: "Opened the official rates page after a targeted search; it requires a private quote and displays no rate." };
const offline = { ...gap, reason: "search_unavailable" as const, explanation: "Online search is disabled and no applicable receipt or rate document was supplied." };

test("price checks distinguish missing amounts, partial coverage and sourced zero", () => {
  const b = fixturePricedBudget();
  Object.assign(b.entries[0], { pricing: "confirmed", unitMin: 0, unitMax: 0 });
  assert.equal(checkBudgetPrices(b).coverage, "priced");
  b.entries.push({ ...unknownBudget().entries[0], id: "meal" });
  assert.deepEqual(checkBudgetPrices(b).findings.map(f => f.entryId), ["meal"]);
  assert.equal(checkBudgetPrices(b).coverage, "partial");
  assert.equal(checkBudgetPrices(unknownBudget()).coverage, "unpriced");
});

test("earlier search and repeated proposals cannot satisfy follow-up checks", () => {
  const review = new BudgetReview(true), b = unknownBudget();
  review.recordResearch();
  assert.deepEqual(review.inspect(b, "plan", null, false).pending, ["stay"]);
  assert.throws(() => review.resolve(b, [offline]), /search is enabled/);
  review.inspect(b, "plan", null, false);
  assert.throws(() => review.resolve(b, [gap]), /targeted web-search follow-up/);
  assert.throws(() => review.resolve(b, [{ ...gap, reason: "missing_details" }]), /targeted web-search follow-up/);
  review.recordResearch();
  const resolved = review.resolve(b, [gap]);
  const report = review.inspect(resolved, "plan", null, false);
  assert.equal(report.readyToCommit, true);
  assert.equal(report.coverage, "unpriced", "completion is not price confirmation");
  assert.equal(resolved.entries[0].unitMin, null);
  assert.match(resolved.entries[0].assumptions, /private quote/);
});

test("resolution requires a pending check and validates the entire request before mutation", () => {
  const review = new BudgetReview(false), b = unknownBudget();
  assert.throws(() => review.resolve(b, [offline]), /No pending/);
  review.inspect(b, "plan", null, false);
  assert.throws(() => review.resolve(b, [offline, { ...offline, entryId: "invented" }]), /No pending/);
  assert.equal(review.inspect(b, "plan", null, false).readyToCommit, false);
  assert.throws(() => review.resolve(b, [offline, offline]), /distinct/);
  const long = structuredClone(b); long.entries[0].assumptions = "x".repeat(4000);
  review.inspect(long, "plan", null, false);
  assert.throws(() => review.resolve(long, [offline]), /4000/);
  assert.equal(review.inspect(long, "plan", null, false).readyToCommit, false);
});

test("disabled research can be explained without fabricating prices", () => {
  const review = new BudgetReview(false), b = unknownBudget();
  review.inspect(b, "plan", null, false);
  const result = review.resolve(b, [offline]);
  assert.equal(review.inspect(result, "plan", null, false).readyToCommit, true);
  assert.deepEqual(result.entries[0].sources, []);
  assert.equal(result.entries[0].unitMax, null);
  assert.match(result.entries[0].assumptions, /Price still unknown/);
  assert.doesNotMatch(result.entries[0].assumptions, /search_unavailable|missing_details|not_found/);
});

test("changed costs, scope, plan and reload invalidate unresolved-cost acknowledgments", () => {
  for (const change of ["quantity", "scope", "plan", "reload"] as const) {
    const review = new BudgetReview(false), b = unknownBudget();
    review.inspect(b, "plan", null, false);
    const resolved = review.resolve(b, [offline]);
    if (change === "quantity") resolved.entries[0].quantity++;
    if (change === "scope") { resolved.scope = "party"; resolved.travelers = 2; }
    if (change === "reload") review.reset();
    assert.equal(review.inspect(resolved, change === "plan" ? "changed" : "plan", null, false).readyToCommit, false, change);
  }
});

test("partial edits preserve unchanged existing unknown costs but full reviews reopen checks", () => {
  const review = new BudgetReview(true), existing = unknownBudget(), next = structuredClone(existing);
  next.limit = 500;
  assert.equal(review.inspect(next, "plan", existing, true).readyToCommit, true);
  assert.equal(review.inspect(next, "plan", existing, false).readyToCommit, false);
});

test("pricing one cost preserves the follow-up observation for other unchanged gaps", () => {
  const review = new BudgetReview(true), b = unknownBudget();
  b.entries.push({ ...b.entries[0], id: "meal" });
  review.inspect(b, "plan", null, false);
  review.recordResearch();
  b.entries[0] = fixturePricedBudget().entries[0];
  assert.deepEqual(review.inspect(b, "plan", null, false).pending, ["meal"]);
  const resolved = review.resolve(b, [{ ...gap, entryId: "meal" }]);
  assert.equal(review.inspect(resolved, "plan", null, false).coverage, "partial");
});

test("recording follow-up evidence on an unknown cost does not demand another search", () => {
  const review = new BudgetReview(true), b = unknownBudget();
  review.inspect(b, "plan", null, false);
  review.recordResearch();
  b.entries[0].assumptions = "Follow-up found a quote-only page, no amount.";
  b.entries[0].sources = [{ ...fixturePricedBudget().entries[0].sources[0], detail: "Page asks for a private quote; no public rate." }];
  review.inspect(b, "plan", null, false);
  const result = review.resolve(b, [gap]);
  assert.equal(review.inspect(result, "plan", null, false).readyToCommit, true);
});
