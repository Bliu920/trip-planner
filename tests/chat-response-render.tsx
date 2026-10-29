import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTranscript } from "../lib/chat-response/state";
import { scenarios } from "./chat-response-fixture";

// Load client CSS inertly.
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const { ChatResponse } = require("../lib/chat-response/view") as typeof import("../lib/chat-response/view");

for (const scenario of scenarios) {
  const items = buildTranscript(scenario.messages, scenario.state);
  const html = renderToStaticMarkup(<>{items.map(item => <ChatResponse key={item.key} item={item} reference="fixture" />)}</>);
  const active = items.some(item => item.active);
  assert.equal((html.match(/data-chat-activity/g) ?? []).length, active ? 1 : 0, `${scenario.name}: one progress row`);
  assert.equal((html.match(/animate-spin/g) ?? []).length, active ? 1 : 0, `${scenario.name}: history never owns a spinner`);
  if (active) {
    assert.match(html, /data-chat-response="assistant"><div[^>]*data-chat-activity/, `${scenario.name}: progress is the first child`);
    assert.ok(html.indexOf('data-chat-response="user"') < html.indexOf("data-chat-activity"));
    assert.match(html, /class="[^"]*h-7[^"]*" data-chat-activity/, `${scenario.name}: constant row height`);
  }
  if (scenario.name === "Stopped") assert.match(html, /Interrupted/);
  if (scenario.name === "Completed") assert.match(html, /Checked places/);
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
assert.ok(markdown.indexOf('data-chat-activity') < markdown.indexOf('class="chat-markdown"'));

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
  assert.match(html, /data-chat-response="assistant"><div[^>]*data-chat-activity/);
}
console.log("Rendered Markdown, safety, literal-user and streaming checks successfully.");
