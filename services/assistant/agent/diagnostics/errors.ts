import { z } from "zod";
import { planAuthoringInput, budgetAuthoringInput } from "../authoring/inputs";
import { AISDKError, APICallError, InvalidToolInputError, JSONParseError, StreamProviderError, ToolChoiceViolationError, TypeValidationError } from "ai";
import type { AgentErrorDetail } from "@/lib/chat/failure";

const fields = new Set("plan items days itemIds startDate startLocation endLocation id title kind reason optional keep reservation location from to mode timing type schedule period start end duration minMinutes maxMinutes date time binding basis sources explanation value label address city latitude longitude geoEvidenceId placeId itemId coverage nights afterDayIds checkIn checkOut state notes relatedItemIds text url accessedAt documentId revision evidenceId budget entries category planItemIds pricing unit quantity unitMin unitMax assumptions currency scope travelers limit exclusions checkedAt detail documentRevision operations reviewed editToken authorizedItemIds name markdown expectedRevision".split(" "));
const types = new Set(["AI_InvalidToolInputError", "AI_TypeValidationError", "AI_JSONParseError", "AI_ToolChoiceViolationError", "AI_APICallError", "AI_NoSuchToolError", "AI_ToolCallRepairError", "AI_InvalidResponseDataError", "AI_NoOutputGeneratedError", "AI_MessageConversionError", "AI_InvalidArgumentError", "ZodError", "SyntaxError", "AbortError", "TimeoutError", "Error", "TypeError"]);
const values = new Set("fixed suggested EUR party per_person estimated confirmed unknown visit meal stay travel rest free_time catalog specified area item hotel restaurant research assumption user inference direct_edit interval arrival departure walk car train bus flight boat other nights dates booked unbooked".split(" "));
// Derive public schema names.
function registerSchema(value: unknown) {
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (node.properties && typeof node.properties === "object") Object.keys(node.properties).forEach(key => fields.add(key));
  if (Array.isArray(node.enum)) node.enum.filter(item => typeof item === "string").forEach(item => values.add(item));
  if (typeof node.const === "string") values.add(node.const);
  Object.values(node).forEach(child => Array.isArray(child) ? child.forEach(registerSchema) : registerSchema(child));
}
[planAuthoringInput, budgetAuthoringInput].forEach(schema => registerSchema(z.toJSONSchema(schema)));

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const errorType = (error: unknown) => {
  const name = String(record(error).name);
  if (types.has(name) || ["RangeError", "AggregateError"].includes(name) || AISDKError.isInstance(error) && /^AI_[A-Za-z]{1,70}Error$/.test(name)) return name;
  return typeof error === "string" ? "ThrownString" : error === undefined ? "ThrownUndefined" : "OtherError";
};

/** Keep schema facts, never argument values or raw error messages. */
export function agentErrorDetail(error: unknown): AgentErrorDetail {
  const chain: unknown[] = [];
  for (let current = error; current && chain.length < 6 && !chain.includes(current); current = record(current).cause) chain.push(current);
  const messages = chain.map(value => typeof value === "string" ? value : typeof record(value).message === "string" ? String(record(value).message) : "").join("\n");
  const diagnosticCode = [/text part .+ not found/, /reasoning part .+ not found/].some(pattern => pattern.test(messages)) ? "STREAM_PART_MISSING"
    : /fetch failed/i.test(messages) ? "NETWORK_FETCH_FAILED" : /^terminated$/m.test(messages) ? "STREAM_TERMINATED" : undefined;
  const systemCode = chain.map(value => record(value).code).find(code => ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(String(code))) as string | undefined;
  const chunk = record(record(error).chunk), chunkType = record(error).chunkType ?? chunk.type;
  const issues: NonNullable<AgentErrorDetail["issues"]> = [];
  for (const cause of chain) {
    const rows = record(cause).issues;
    if (!Array.isArray(rows)) continue;
    const pending = rows.slice(0, 12);
    for (let visited = 0; pending.length && issues.length < 12 && visited < 48; visited++) {
      const issue = record(pending.shift()), code = String(issue.code);
      // Expand bounded union branches.
      if (code === "invalid_union" && Array.isArray(issue.errors)) {
        const nested = issue.errors.slice(0, 4).flatMap(branch => Array.isArray(branch) ? branch.slice(0, 12) : []);
        if (nested.length) { pending.unshift(...nested); continue; }
      }
      if (!["invalid_type", "invalid_value", "invalid_union", "unrecognized_keys", "too_small", "too_big", "invalid_format", "custom"].includes(code)) continue;
      const path = Array.isArray(issue.path) ? issue.path.slice(0, 16).map(part => typeof part === "number" && Number.isSafeInteger(part) ? String(part) : fields.has(String(part)) ? String(part) : "*").join(".") : "";
      const expected = ["string", "number", "object", "array", "tuple", "boolean", "null", "undefined"].includes(String(issue.expected)) ? String(issue.expected) : null;
      const choices = Array.isArray(issue.values) && issue.values.length <= 12 && issue.values.every(value => typeof value === "string" && values.has(value)) ? issue.values as string[] : [];
      const extraKeys = Array.isArray(issue.keys) ? issue.keys.filter(key => typeof key === "string" && fields.has(key)).slice(0, 8) : [];
      const instruction = code === "invalid_type" && expected ? `Expected ${expected}.`
        : choices.length ? `Use one of: ${choices.join(", ")}.`
        : code === "unrecognized_keys" ? extraKeys.length ? `Remove unrecognized fields, including: ${extraKeys.join(", ")}.` : "Remove fields not declared by this tool."
          : code === "invalid_union" || code === "invalid_value" ? "Use the documented variant and its required fields."
          : code === "too_small" || code === "too_big" ? typeof (code === "too_big" ? issue.maximum : issue.minimum) === "number" && Number.isSafeInteger(code === "too_big" ? issue.maximum : issue.minimum) && Number(code === "too_big" ? issue.maximum : issue.minimum) <= 10000000
            ? `Use ${code === "too_big" ? "at most" : "at least"} ${code === "too_big" ? issue.maximum : issue.minimum}${issue.origin === "array" ? " items" : ""}.`
            : "Use the field's documented size or numeric bounds."
              : code === "invalid_format" ? "Use the field's documented format." : "Check this field against the tool's constraints.";
      issues.push({ path: path || "(root)", code, instruction });
    }
  }
  const kind = InvalidToolInputError.isInstance(error) ? "tool_input" : ToolChoiceViolationError.isInstance(error) ? "tool_choice"
    : APICallError.isInstance(error) || StreamProviderError.isInstance(error) ? "provider" : chain.some(JSONParseError.isInstance) ? "parse" : chain.some(TypeValidationError.isInstance) ? "validation"
      : errorType(error) === "AbortError" ? "abort" : errorType(error) === "TimeoutError" ? "timeout" : "other";
  return { kind, errorType: errorType(error), causeTypes: chain.slice(1).map(errorType), ...(issues.length ? { issues } : {}),
    ...(diagnosticCode ? { diagnosticCode } : {}), ...(systemCode ? { systemCode } : {}),
    ...(["text-start", "text-delta", "text-end", "reasoning-start", "reasoning-delta", "reasoning-end", "tool-call", "tool-result", "tool-input-start", "tool-input-delta", "tool-input-end", "error", "finish"].includes(String(chunkType)) ? { chunkType: String(chunkType) } : {}),
    ...(ToolChoiceViolationError.isInstance(error) ? { toolChoice: error.toolChoice.type,
      responseTypes: [...new Set(error.content.map(part => part.type))].filter(type => ["text", "reasoning", "tool-call"].includes(type)) } : {}) };
}

const reported = new WeakSet<object>();
export function reportAgentError(error: unknown, messageId: string, phase: "model" | "stream" | "execute" | "tool_input", toolName?: string, stage?: AgentErrorDetail["stage"]) {
  const detail = { ...agentErrorDetail(error), ...(toolName ? { toolName } : {}), ...(stage ? { stage } : {}) };
  if (!error || typeof error !== "object" || !reported.has(error)) {
    if (error && typeof error === "object") reported.add(error);
    console.warn(JSON.stringify({ event: "agent_error", messageId, phase, ...detail }));
  }
  return detail;
}
