import type { ReplyFailure } from "@/lib/chat/failure";
export { agentErrorDetail, reportAgentError } from "./errors";
export { runProgress, contextSizes } from "./metrics";
export { providerDiagnostics, reportProviderFailure, failureCode, chatErrorMessage } from "./provider";

export function boundedFailure(report: ReplyFailure): ReplyFailure {
  const compact = (detail: ReplyFailure["termination"]) => detail ? { ...detail,
    causeTypes: detail.causeTypes?.filter(type => ["AI_JSONParseError", "AI_TypeValidationError", "ZodError", "SyntaxError", "AbortError", "TimeoutError"].includes(type)).slice(0, 2),
    ...(detail.issues ? { issues: detail.issues.slice(0, 2).map(issue => ({ path: issue.path.slice(0, 100), code: issue.code, instruction: issue.instruction.slice(0, 100) })) } : {}) } : undefined;
  const result = { ...report, termination: compact(report.termination), inputFailure: compact(report.inputFailure) };
  while (JSON.stringify(result).length > 950 && result.inputFailure?.issues?.length) result.inputFailure.issues.pop();
  while (JSON.stringify(result).length > 950 && result.termination?.issues?.length) result.termination.issues.pop();
  if (JSON.stringify(result).length > 950) delete result.inputFailure;
  if (JSON.stringify(result).length > 950) delete result.progress;
  return result;
}
