import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTranscript } from "../lib/chat-response/state";
import { scenarios } from "./chat-response-fixture";

// Load client CSS inertly.
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const { ChatResponse } = require("../lib/chat-response/view") as typeof import("../lib/chat-response/view");

function assertTrailingWork(html: string, name: string) {
  assert.equal((html.match(/data-work-progress/g) ?? []).length, 1, `${name}: one work block`);
  assert.match(html, /<section[^>]*data-work-progress[\s\S]*<\/section><\/div>/, `${name}: work closes the response body`);
}

for (const scenario of scenarios) {
  const items = buildTranscript(scenario.messages, scenario.state);
  const html = renderToStaticMarkup(<>{items.map(item => <ChatResponse key={item.key} item={item} reference="fixture" />)}</>);
  const active = items.some(item => item.active);
  assert.equal((html.match(/data-chat-activity/g) ?? []).length, active ? 1 : 0, `${scenario.name}: one progress row`);
  assert.equal((html.match(/animate-spin/g) ?? []).length, active ? 1 : 0, `${scenario.name}: history never owns a spinner`);
  if (html.includes("data-work-progress")) assertTrailingWork(html, scenario.name);
  if (active) {
    assert.ok(html.indexOf('data-chat-response="user"') < html.indexOf("data-chat-activity"));
  }
  if (scenario.name === "Stopped") assert.match(html, /Stopped/);
  if (scenario.name === "Completed") { assert.match(html, /Worked/); assert.doesNotMatch(html, /Checked places/); }
}
console.log(`Rendered ${scenarios.length} response scenarios successfully.`);

// Exercise the actual Markdown integration.
const { markdownReply } = require("./markdown-fixture") as typeof import("./markdown-fixture");
const { idle, user, reply } = require("./chat-response-fixture") as typeof import("./chat-response-fixture");
const renderReply = (text: string) => {
  const item = buildTranscript([user, reply([], text)], { ...idle, busy: true }).at(-1)!;
  return renderToStaticMarkup(<ChatResponse item={item} reference="fixture" />);
};
const markdown = renderReply(markdownReply);
for (const pattern of [/<h2>A relaxed day in Florence<\/h2>/, /<strong>art<\/strong>/, /<em>a slow lunch<\/em>/, /<ul>/, /<ol>/, /<blockquote>/, /<table>/, /<thead>/, /<code>quiet mornings<\/code>/, /<pre tabindex="0"><code class="language-json">/, /type="checkbox"/]) assert.match(markdown, pattern);
assert.match(markdown, /href="https:\/\/example.com\/museum"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
assert.match(markdown, /class="markdown-table" role="region" aria-label="Table" tabindex="0"/);
assert.match(markdown, /id="chat-message-reply-one" class="chat-markdown"/);
assert.ok(markdown.indexOf('data-chat-activity') > markdown.indexOf('class="chat-markdown"'));
assertTrailingWork(markdown, "Markdown reply");

const unsafe = renderReply('[Bad link](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
assert.doesNotMatch(unsafe, /href="javascript:|<script|<img|onerror=/);
assert.match(unsafe, /Bad link/);

// User messages remain literal.
const userMarkdown = { ...user, parts: [{ type: "text" as const, text: "**Keep my original text**" }] };
const literal = renderToStaticMarkup(<ChatResponse item={buildTranscript([userMarkdown], idle)[0]} reference="fixture" />);
assert.match(literal, /\*\*Keep my original text\*\*/);
assert.doesNotMatch(literal, /<strong>|class="chat-markdown"/);

// Partial streaming syntax never breaks the response shell.
for (const partial of ["##", "**A relaxed", "[Museum](https://exam", "```json\n{\"pace\":", "| Stop | Time |\n| --- | --- |\n| Gallery |", markdownReply]) {
  const html = renderReply(partial);
  assert.equal((html.match(/data-chat-activity/g) ?? []).length, 1);
  assert.equal((html.match(/animate-spin/g) ?? []).length, 1);
  assertTrailingWork(html, "Partial streamed reply");
}
console.log("Rendered Markdown, safety, literal-user and streaming checks successfully.");

// Later content cannot follow progress.
const richReply = reply([], "Here is your plan.", "complete");
richReply.parts.push(
  { type: "data-commit", data: { summary: "Saved your itinerary", revision: 1 } },
  { type: "data-place", data: { id: "place_001", name: "Florence gallery", city: "Florence", photo: null } },
  { type: "data-attachment", data: { id: "file-one", name: "Travel notes.md", mediaType: "text/markdown", size: 20 } },
);
const richItem = buildTranscript([user, richReply], { ...idle, busy: true }).at(-1)!;
const richHtml = renderToStaticMarkup(<ChatResponse item={richItem} reference="fixture" />);
assertTrailingWork(richHtml, "Saved reply with place and file");
for (const content of ["Saved your itinerary", "Florence gallery", "Travel notes.md"]) {
  assert.ok(richHtml.indexOf(content) >= 0);
  assert.ok(richHtml.indexOf(content) < richHtml.indexOf("data-chat-activity"));
}
richReply.parts.push({ type: "data-action", data: { state: "saved", operationId: "save-one", message: "Saved", code: "OK", revision: 1 } });
assertTrailingWork(renderToStaticMarkup(<ChatResponse item={buildTranscript([user, richReply], { ...idle, busy: true }).at(-1)!} reference="fixture" />), "Action receipt");


// Restored provider failures keep actionable copy.
for (const [providerReason, pattern] of [["credits_exhausted", /add credits/], ["spend_limit", /billing limits/], ["rate_limit", /at least 9 seconds/]] as const) {
  const message = { ...reply([], "", "failed"), parts: [{ type: "data-failure" as const, data: { code: "provider_limit" as const, providerReason, retryAfterSeconds: 9, steps: 0, elapsedMs: 2200, finishReason: null } }] };
  const item = buildTranscript([user, message], idle).at(-1)!;
  const html = renderToStaticMarkup(<ChatResponse item={item} reference="fixture" onRetry={() => {}} />);
  assert.match(html, pattern);
  assert.match(html, /Retry reply/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /animate-spin|provider_limit|credits_exhausted/);
}
console.log("Rendered provider-limit recovery checks successfully.");

// Preview recent work; keep full history closed.
const steps = Array.from({ length: 7 }, (_, index) => ({ id: `step-${index}`, attempt: "12fd9d92-d38d-4a5e-93c1-09747c76a964", title: `Step ${index}`, status: "complete" as const, detail: "Saved detail", sources: [], documents: [] }));
const timing = { ...steps[0], id: "run", kind: "run" as const, startedAt: "2026-10-29T12:00:00.000Z", status: "running" as const };
const withWork = reply(steps, "Answer content");
withWork.parts.unshift({ type: "data-activity", data: timing });
const previewHtml = renderToStaticMarkup(<ChatResponse item={buildTranscript([user, withWork], { ...idle, busy: true }).at(-1)!} reference="fixture" />);
assertTrailingWork(previewHtml, "Four-step preview");
assert.equal((previewHtml.match(/<li /g) ?? []).length, 4);
assert.doesNotMatch(previewHtml, /Step [012]|activity-history|Saved detail/);
for (const index of [3, 4, 5, 6]) assert.match(previewHtml, new RegExp(`Step ${index}`));
const finished = { ...withWork, metadata: { status: "complete" as const, createdAt: "2026-10-29T12:00:00Z" }, parts: withWork.parts.map(part => part.type === "data-activity" && part.data.kind === "run" ? { ...part, data: { ...part.data, status: "complete" as const, elapsedMs: 24000 } } : part) };
const completedHtml = renderToStaticMarkup(<ChatResponse item={buildTranscript([user, finished], idle).at(-1)!} reference="fixture" />);
assertTrailingWork(completedHtml, "Collapsed completion");
assert.match(completedHtml, /Worked for 24s/);
assert.match(completedHtml, /aria-expanded="false"/);
assert.doesNotMatch(completedHtml, /work-preview|Step [0-6]|animate-spin|activity-history/);
console.log("Rendered work preview and persisted completion checks successfully.");

// Repeated actions share one row in preview and full history.
const repeated = Array.from({ length: 6 }, (_, index) => ({ ...steps[0], id: `guide-${index}`, title: "Review planning guidance", detail: `Guidance result ${index + 1}` }));
const repeatedReply = reply([...steps.slice(0, 4), ...repeated], "Answer content");
repeatedReply.parts.unshift({ type: "data-activity", data: timing });
const groupedHtml = renderToStaticMarkup(<ChatResponse item={buildTranscript([user, repeatedReply], { ...idle, busy: true }).at(-1)!} reference="fixture" />);
assertTrailingWork(groupedHtml, "Grouped preview");
assert.equal((groupedHtml.match(/<li /g) ?? []).length, 4);
assert.equal((groupedHtml.match(/<li[^>]*>Review planning guidance \(6\)<\/li>/g) ?? []).length, 1);
assert.match(groupedHtml, /Step 1/);
assert.doesNotMatch(groupedHtml, /Step 0|Guidance result/);

const { ActivityHistory } = require("../lib/activity/history") as typeof import("../lib/activity/history");
const historyEntries = repeated.map((entry, index) => ({ ...entry, status: index === 0 ? "failed" as const : "complete" as const,
  sources: [{ url: `https://example.com/source-${index}`, title: `Source ${index}` }],
  documents: [{ id: timing.attempt, name: "Travel notes.md" }],
}));
const historyHtml = renderToStaticMarkup(<ActivityHistory entries={historyEntries} reference="fixture" active={false} />);
assert.equal((historyHtml.match(/class="activity-step"/g) ?? []).length, 1);
assert.match(historyHtml, /Review planning guidance \(6\)/);
assert.match(historyHtml, /Could not finish/);
assert.equal((historyHtml.match(/Travel notes.md/g) ?? []).length, 1, "repeated document links are deduplicated");
for (let index = 0; index < 6; index++) {
  assert.match(historyHtml, new RegExp(`Guidance result ${index + 1}`));
  assert.match(historyHtml, new RegExp(`href="https://example.com/source-${index}"`));
}
console.log("Rendered consecutive activity counts and preserved evidence successfully.");
