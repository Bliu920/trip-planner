import { tool, type FlexibleSchema } from "ai";
import type { ActionPayload } from "@/lib/actions";
import { ActionRun, type ActionKind } from "./run";
export { ActionRun } from "./run";
export { succeeded, blocked } from "./results";
const kinds = new WeakMap<object, ActionKind>();
export const actionKindOf = (value: object) => kinds.get(value);

/** Every application tool enters through this checked execution boundary. */
export function actionTool<Input>(run: ActionRun, kind: ActionKind, definition: {
  description: string;
  inputSchema: FlexibleSchema<Input>;
  execute(input: Input): Promise<ActionPayload> | ActionPayload;
}) {
  // Execute and validate results.
  const action = tool({ ...definition, execute: (input, options) => run.executeOnce(kind, options.toolCallId, input, async () => definition.execute(input)) });
  kinds.set(action, kind);
  return action;
}
