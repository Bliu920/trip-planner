import "server-only";
import { openai } from "@ai-sdk/openai";

export const TITLE_MODEL = "gpt-6-luna";

export function titleModel() {
  const configured = process.env.OPENAI_TITLE_MODEL?.trim() || TITLE_MODEL;
  if (configured !== TITLE_MODEL) throw new Error(`Unsupported OPENAI_TITLE_MODEL. Use ${TITLE_MODEL}.`);
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("Project title generation requires OPENAI_API_KEY.");
  return openai.responses(configured);
}
