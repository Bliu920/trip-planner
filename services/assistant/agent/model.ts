import "server-only";
import { openai } from "@ai-sdk/openai";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { createInstructions, closingInstructions } from "./context/instructions";
import { agentTools } from "./tools";
import { researchWeb, citedResearchSources } from "./tools/research";
import type { AgentEnvironment } from "./contracts";
import { ActionRun, actionKindOf, blocked } from "./actions";
import { reportAgentError, runProgress, contextSizes } from "./diagnostics";
import { completionFeedback, savedReplyContext, closingMessages, planningStage } from "./context/completion";
export class AgentConfigurationError extends Error { }
export const DEFAULT_MODEL = "gpt-6.1-terra";
export const SUPPORTED_MODELS: readonly string[] = [DEFAULT_MODEL, "gpt-6-luna"];
export const MAX_AGENT_STEPS = 50;
export const RECOVERY_STEPS = 5;
export const PLANNING_REASONING_EFFORT = "medium";
export function agentModel() {
  const configured = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  if (!SUPPORTED_MODELS.includes(configured))
    throw new AgentConfigurationError(
      `Unsupported OPENAI_MODEL. Use ${SUPPORTED_MODELS.join(" or ")}; review the Agent guide before changing providers.`,
    );
  return configured;
}
export function runPass(
  messages: ModelMessage[],
  environment: AgentEnvironment,
  signal: AbortSignal,
  onText: (text: string, startsStep?: boolean) => Promise<void>,
  actions = new ActionRun(environment),
  stepLimit = MAX_AGENT_STEPS,
  completionInstruction = "",
  replyOnly = false,
  onStep?: (finishReason: string) => void,
) {
  // Bind host capabilities.
  const tools = agentTools(environment, actions, process.env.AGENT_WEB_SEARCH === "false" ? undefined : async query => {
    const report = await researchWeb(query, agentModel(), signal, environment.operationId);
    const handles = environment.recordWebSources?.(report.sources.map(source => source.url), report.checkedAt);
    if (report.searched) environment.recordWebResearch?.();
    return { ...report, sourceCount: report.sources.length, sources: citedResearchSources(report.summary, report.sources).map(source => ({ ...source, sourceId: handles?.find(handle => handle.url === source.url)?.sourceId })) };
  });
  let protocolFeedback = "";
  const currentInstructions = createInstructions(environment, completionInstruction);
  let stage = planningStage(environment);
  const pass = completionInstruction ? "recovery" : "planning";
  console.info(JSON.stringify({ event: "agent_run_started", at: new Date().toISOString(), messageId: environment.operationId, model: agentModel(), reasoningEffort: stage.effort, reasoningPolicy: "phase_based", pass, stepLimit }));
  // Execute bounded workflow.
  return streamText({
    model: openai.responses(agentModel()),
    system: currentInstructions(stage.phase),
    messages,
    prepareStep: ({ stepNumber, messages: stepMessages }) => {
      stage = planningStage(environment);
      const current = currentInstructions(stage.phase);
      const reportContext = (instructions: string, history: ModelMessage[]) => console.info(JSON.stringify({ event: "agent_context_prepared", at: new Date().toISOString(), messageId: environment.operationId, pass, step: stepNumber + 1, instructionsBytes: Buffer.byteLength(instructions), planningPhase: stage.phase, reasoningEffort: stage.effort, ...contextSizes(history) }));
      const remaining = stepLimit - stepNumber;
      const published = savedReplyContext(environment);
      const saved = !!published || actions.state?.state === "saved";
      if (published) {
        stage = { phase: "review", effort: "low" };
        const instructions = closingInstructions(published);
        const finalMessages = closingMessages(messages);
        reportContext(instructions, finalMessages);
        return { toolChoice: "none" as const, instructions, messages: finalMessages, providerOptions: { openai: { store: false, reasoningEffort: "low", parallelToolCalls: false } } };
      }
      const content = actions.shouldStop ? "Execution stopped because persistence could not be confirmed. Do not make further changes. Explain the recorded problem without claiming a final save." : [saved ? "" : protocolFeedback, completionFeedback(environment), !saved && remaining <= 6
        ? `Run allowance: ${remaining} steps remain in this pass. Complete missing required itinerary and budget contents before committing. Empty initialization cannot be saved. Prioritize the host's next required work; skip optional research/documents and repeated reads. Never claim an unverified save.`
        : ""].filter(Boolean).join("\n");
      protocolFeedback = "";
      // Complete before answering.
      const toolChoice = replyOnly || saved || actions.shouldStop ? "none" as const
        : actions.needsRecovery ? "required" as const : "auto" as const;
      reportContext(`${current}\n${content}`, stepMessages);
      return { toolChoice, instructions: `${current}\n${content}`, providerOptions: { openai: { store: false, reasoningEffort: stage.effort, parallelToolCalls: false } } };
    },
    tools:
      process.env.AGENT_WEB_SEARCH !== "false"
        ? {
          ...tools,
          web_search: openai.tools.webSearch({ searchContextSize: "low" }),
        }
        : tools,
    toolChoice: replyOnly ? "none" : "auto",
    stopWhen: stepCountIs(stepLimit),
    maxOutputTokens: 14000,
    maxRetries: 0,
    abortSignal: signal,
    providerOptions: {
      openai: {
        store: false,
        parallelToolCalls: false,
        reasoningEffort: PLANNING_REASONING_EFFORT,
      },
    },
    onStepStart: async () => { await onText("", true); },
    onChunk: async ({ chunk }) => {
      if (chunk.type === "source" && chunk.sourceType === "url") environment.recordWebSources?.([chunk.url]);
      if (chunk.type === "text-delta") await onText(chunk.text);
    },
    repairToolCall: async ({ error, toolCall }) => {
      actions.inputFailure = reportAgentError(error, environment.operationId, "tool_input", toolCall.toolName in tools ? toolCall.toolName : "unknown");
      return null;
    },
    onStepFinish: async ({ sources, toolResults, content, stepNumber, finishReason, usage }) => {
      onStep?.(finishReason);
      const outcomes = toolResults.filter(result => result.toolName in tools).map(result => {
        const output = result.output as { outcome?: string; effect?: string; code?: string };
        const families: Record<string, string> = { createPlan: "plan", editPlan: "plan", createBudget: "budget", editBudget: "budget" };
        const failed = actions.inputFailure?.toolName;
        if (failed && (result.toolName === failed || families[failed] && families[failed] === families[result.toolName]) && (output.outcome === "succeeded" || output.effect === "staged")) {
          actions.inputFailure = null;
          console.info(JSON.stringify({ event: "agent_input_corrected", messageId: environment.operationId, toolName: result.toolName }));
        }
        return { toolName: result.toolName, outcome: output.outcome, effect: output.effect,
          code: typeof output.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(output.code) ? output.code : undefined };
      }).concat(content.flatMap(part => part.type === "tool-error" && part.toolName in tools
        ? [{ toolName: part.toolName, outcome: "invalid_input", effect: "none", code: "TOOL_INPUT_INVALID" }] : []));
      console.info(JSON.stringify({ event: "agent_step_finished", at: new Date().toISOString(), messageId: environment.operationId, model: agentModel(), planningPhase: stage.phase, reasoningEffort: stage.effort, pass, step: stepNumber + 1, finishReason, tools: outcomes, progress: runProgress(environment),
        inputTokens: usage.inputTokens, cachedInputTokens: usage.inputTokenDetails.cacheReadTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.outputTokenDetails.reasoningTokens }));
      for (const part of content) {
        if (part.type !== "tool-error" || !(part.toolName in tools)) continue;
        const detail = actions.inputFailure?.toolName === part.toolName ? actions.inputFailure : reportAgentError(part.error, environment.operationId, "tool_input", part.toolName);
        actions.inputFailure = detail;
        environment.artifacts?.rejectInput(part.toolName, part.input);
        const kind = actionKindOf(tools[part.toolName as keyof typeof tools]!);
        if (!kind) continue;
        const result = await actions.execute(kind, part.toolCallId, async () => blocked({ diagnostic: detail }, "TOOL_INPUT_INVALID", "Some details could not be validated. Correct them before saving.", "correct_input"));
        protocolFeedback = `Action result after tool protocol failure: ${JSON.stringify(result)}. Correct the reported fields and resubmit the rejected change. Reading unchanged state alone does not resolve it.`;
      }
      const urls = sources.flatMap(source => source.sourceType === "url" ? [source.url] : []);
      for (const result of toolResults) {
        if (result.toolName !== "web_search") continue;
        environment.recordWebResearch?.();
        const output = result.output as { action?: { url?: string | null }; sources?: { type: string; url?: string }[] };
        if (output?.action?.url) urls.push(output.action.url);
        for (const source of output?.sources ?? []) if (source.url) urls.push(source.url);
      }
      environment.recordWebSources?.(urls);
    },
    onError: ({ error }) => { reportAgentError(error, environment.operationId, "model"); },
  });
}
