import "server-only";
import { APICallError, StreamProviderError } from "ai";
import { replyFailureText, type ReplyFailure, type ReplyFailureCode } from "@/lib/chat/failure";

/** Saved diagnostics share the existing 1,000-character SQL envelope. */
const billingCodes = new Map<string, NonNullable<ReplyFailure["providerReason"]>>([
  ["credit_balance_exhausted", "credits_exhausted"], ["insufficient_quota", "quota"],
  ["organization_spend_limit_exceeded", "spend_limit"], ["project_spend_limit_exceeded", "spend_limit"],
  ["organization_usage_limit_exceeded", "usage_limit"], ["usage_limit_exceeded", "usage_limit"],
]);
const knownCodes = new Set([...billingCodes.keys(), "rate_limit_exceeded", "slow_down", "server_is_overloaded", "invalid_api_key", "model_not_found"]);
const knownTypes = new Set(["insufficient_quota", "rate_limit_error", "invalid_request_error", "api_error", "service_unavailable_error"]);
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
type LimitDetails = Pick<ReplyFailure, "providerReason" | "retryAfterSeconds" | "limitTokens" | "requestedTokens" | "usedTokens">;

/** Retain allowlisted facts only. Never return request bodies, raw headers or provider messages. */
export function providerDiagnostics(error: unknown) {
  if (!APICallError.isInstance(error) && !StreamProviderError.isInstance(error)) return null;
  let payload = object(error.data);
  if (!Object.keys(payload).length && APICallError.isInstance(error) && error.responseBody && error.responseBody.length <= 64000) {
    try { payload = object(JSON.parse(error.responseBody)); } catch { /* Non-JSON errors remain unclassified. */ }
  }
  const detail = object(payload.error ?? payload);
  const code = typeof detail.code === "string" ? detail.code : StreamProviderError.isInstance(error) && typeof error.code === "string" ? error.code : null;
  const type = typeof detail.type === "string" ? detail.type : StreamProviderError.isInstance(error) ? error.type : null;
  let providerReason: ReplyFailure["providerReason"];
  // Prefer specific billing codes.
  if (error.statusCode === 429) {
    providerReason = code ? billingCodes.get(code) : undefined;
    if (!providerReason && (code === "rate_limit_exceeded" || code === "slow_down" || type === "rate_limit_error")) providerReason = "rate_limit";
    if (!providerReason && type === "insufficient_quota") providerReason = "quota";
  }
  const message = typeof detail.message === "string" ? detail.message : error.message;
  const counts = providerReason === "rate_limit" && /\bTPM\b/i.test(message) ? message.match(/\bLimit\s+(\d+)(?:,\s*Used\s+(\d+))?,\s*Requested\s+(\d+)/i) : null;
  const tokenCounts = counts ? { limitTokens: Number(counts[1]), requestedTokens: Number(counts[3]), ...(counts[2] ? { usedTokens: Number(counts[2]) } : {}) } : undefined;
  if (tokenCounts && tokenCounts.requestedTokens > tokenCounts.limitTokens) providerReason = "request_too_large";
  const header = Object.entries(APICallError.isInstance(error) ? error.responseHeaders ?? {} : {}).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  const seconds = header && header.trim() ? /^\d+(\.\d+)?$/.test(header.trim()) ? Number(header) : (Date.parse(header) - Date.now()) / 1000 : NaN;
  const retryAfterSeconds = providerReason === "rate_limit" && Number.isFinite(seconds) && seconds > 0 && seconds <= 604800 ? Math.ceil(seconds) : undefined;
  return { statusCode: error.statusCode ?? null, providerCode: code && knownCodes.has(code) ? code : code ? "unrecognized" : null,
    providerType: type && knownTypes.has(type) ? type : type ? "unrecognized" : null,
    ...(providerReason ? { providerReason } : {}), ...(retryAfterSeconds ? { retryAfterSeconds } : {}), ...(tokenCounts && Object.values(tokenCounts).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1e12) ? tokenCounts : {}) };
}
const reported = new WeakSet<object>();
export function reportProviderFailure(error: unknown): LimitDetails {
  const diagnostic = providerDiagnostics(error);
  if (!diagnostic) return {};
  if (!reported.has(error as object)) {
    reported.add(error as object);
    console.warn(JSON.stringify({ event: "chat_provider_error", ...diagnostic }));
  }
  return { ...(diagnostic.providerReason ? { providerReason: diagnostic.providerReason } : {}), ...(diagnostic.retryAfterSeconds ? { retryAfterSeconds: diagnostic.retryAfterSeconds } : {}),
    ...("limitTokens" in diagnostic ? { limitTokens: diagnostic.limitTokens, requestedTokens: diagnostic.requestedTokens, ...("usedTokens" in diagnostic ? { usedTokens: diagnostic.usedTokens } : {}) } : {}) };
}
export function failureCode(error: unknown): ReplyFailureCode {
  if ((APICallError.isInstance(error) || StreamProviderError.isInstance(error)) && error.statusCode === 429) return "provider_limit";
  if (error instanceof Error && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "cancelled";
  return "provider_error";
}
export function chatErrorMessage(error: unknown) {
  return replyFailureText(failureCode(error), providerDiagnostics(error) ?? undefined);
}
