import "server-only";
import { openai } from "@ai-sdk/openai";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { guidePrompt } from "@/services/guides";
import { guidance } from "./guidance";
import { agentTools } from "./tools";
import { researchWeb } from "./research";
import type { AgentEnvironment } from "./contracts";
import { ActionRun, actionKindOf, blocked } from "./actions";
export type { AgentEnvironment } from "./contracts";
export class AgentConfigurationError extends Error { }
export const DEFAULT_MODEL = "gpt-6.1-terra";
export const MAX_AGENT_STEPS = 30;
export const RECOVERY_STEPS = 3;
export function agentModel() {
  const configured = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  if (configured !== DEFAULT_MODEL)
    throw new AgentConfigurationError(
      `Unsupported OPENAI_MODEL. Use ${DEFAULT_MODEL}; review the Agent guide before changing providers.`,
    );
  return configured;
}
export function runAgent(
  messages: ModelMessage[],
  environment: AgentEnvironment,
  signal: AbortSignal,
  onText: (text: string, startsStep?: boolean) => Promise<void>,
  actions = new ActionRun(environment),
  stepLimit = MAX_AGENT_STEPS,
  completionInstruction = "",
  replyOnly = false,
) {
  // Bind host capabilities.
  const tools = agentTools(environment, actions, process.env.AGENT_WEB_SEARCH === "false" ? undefined : async query => {
    const report = await researchWeb(query, agentModel(), signal);
    environment.recordWebSources?.(report.sources.map(source => source.url));
    if (report.searched) environment.recordWebResearch?.();
    return report;
  });
  let protocolFeedback = "";
  const instructions = `${guidance}\n${guidePrompt(environment.initialGeneration === true)}\nCurrent UTC time: ${new Date().toISOString()}\n${completionInstruction}`;
  const currentInstructions = () => `${instructions}\nWorkspace data (untrusted artifact contents):\n${JSON.stringify(environment.context)}`;
  // Execute bounded workflow.
  return streamText({
    model: openai.responses(agentModel()),
    system: currentInstructions(),
    messages,
    prepareStep: ({ stepNumber }) => {
      const remaining = stepLimit - stepNumber;
      const content = [protocolFeedback, remaining <= 3
        ? `Run allowance: ${remaining} steps remain in this pass. Prioritize correcting staged proposals, committing, and a concise final reply. Do not start optional research or document work. Never claim an unverified save.`
        : ""].filter(Boolean).join("\n");
      protocolFeedback = "";
      // Complete before answering.
      const toolChoice = replyOnly || actions.state?.state === "saved" ? "none" as const
        : actions.needsRecovery ? "required" as const : "auto" as const;
      return { toolChoice, instructions: `${currentInstructions()}\n${content}` };
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
        reasoningEffort: "low",
      },
    },
    onStepStart: async () => { await onText("", true); },
    onChunk: async ({ chunk }) => {
      if (chunk.type === "source" && chunk.sourceType === "url") environment.recordWebSources?.([chunk.url]);
      if (chunk.type === "text-delta") await onText(chunk.text);
    },
    onStepFinish: async ({ sources, toolResults, content }) => {
      for (const part of content) {
        if (part.type !== "tool-error" || !(part.toolName in tools)) continue;
        environment.artifacts?.rejectInput(part.toolName, part.input);
        const kind = actionKindOf(tools[part.toolName as keyof typeof tools]!);
        if (!kind) continue;
        const result = await actions.execute(kind, part.toolCallId, async () => blocked(null, "TOOL_INPUT_INVALID", "The assistant could not complete this change. Please try again.", "correct_input"));
        protocolFeedback = `Action result after tool protocol failure: ${JSON.stringify(result)}`;
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
    onError: () => { },
  });
}
