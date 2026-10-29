import "server-only";
import { generateText } from "ai";
import { titleModel } from "./model";
import { readTitle, titleInstructions, titlePrompt } from "./prompt";

export async function generateProjectTitle(prompt: string, signal?: AbortSignal): Promise<string> {
  // Validate title input.
  const input = titlePrompt(prompt);
  const deadline = AbortSignal.timeout(8000);
  const abortSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  abortSignal.throwIfAborted();

  // Generate a bounded title.
  const result = await generateText({
    model: titleModel(),
    system: titleInstructions,
    prompt: input,
    maxOutputTokens: 128,
    maxRetries: 0,
    abortSignal,
    providerOptions: { openai: { store: false, reasoningEffort: "none", textVerbosity: "low" } },
  });

  // Validate complete output.
  if (result.finishReason !== "stop") throw new Error("Project title generation did not complete.");
  return readTitle(result.text);
}
