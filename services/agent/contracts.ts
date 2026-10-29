import type { Plan, PlanFinding, SourceRef } from "@/lib/plan";
import type { DocumentEdit } from "@/lib/documents/text";
import type { CatalogQuery } from "@/lib/catalog";
// Capabilities are supplied by the host application.
export interface AgentEnvironment {
  artifacts?: ArtifactEnvironment;
  operationId: string;
  recordAction(state: import("@/lib/actions").ActionState): Promise<void>;
  verifyCommit(): Promise<{ saved: boolean; receipt: { revision: number; summary: string; operation_id: string } | null; snapshot: unknown }>;
  context: unknown;
  initialGeneration?: boolean;
  resolvePlace?(query: import("@/lib/journeys").PositionQuery): Promise<unknown>;
  getJourneys?(): Promise<unknown>;
  proposeBudget?(budget: import("@/lib/budget").Budget, reviewed: boolean): Promise<unknown>;
  resolveBudgetGaps?(gaps: import("@/services/budgets").BudgetGap[]): Promise<unknown>;
  recordWebSources?(urls: string[]): void;
  recordWebResearch?(): void;
  describeCatalog(): unknown;
  search(query: CatalogQuery): unknown;
  places(ids: string[]): unknown;
  readDocument(
    id: string,
    revision: number | null,
  ): Promise<unknown>;
  readMessage(id: string): Promise<unknown>;
  stageDocument(edit: DocumentEdit): Promise<unknown>;
  saveBrief(markdown: string, expectedRevision: number): Promise<unknown>;
  propose(
    plan: Plan,
    authorizedItemIds: string[],
  ): Promise<{ findings: PlanFinding[]; valid: boolean }>;
  reload(): Promise<unknown>;
  commit(summary: string, handledInputIds: string[]): Promise<unknown>;
  withdraw(operationId: string): Promise<unknown>;
  source: SourceRef;
}

export type ArtifactView = "effective" | "saved";
export type PlanRead = { view: ArtifactView; selector: "full" | "summary" | "days" | "items" | "stays" | "unscheduled"; ids: string[] };
export type BudgetRead = { view: ArtifactView; selector: "full" | "summary" | "categories" | "entries" | "planItems"; ids: string[] };
export interface ArtifactEnvironment {
  provideSelectedDocuments(ids: string[]): void;
  manifest(): unknown;
  readEnvironment(): Promise<unknown>;
  readPlan(input: PlanRead): unknown;
  readBudget(input: BudgetRead): unknown;
  listDocuments(input: { view: ArtifactView; kind: string | null; format: string | null; query: string | null; cursor: string | null; limit: number }): unknown;
  readDocument(input: { id: string; view: ArtifactView; contentRevision: number | null }): Promise<unknown>;
  createPlan(token: string, plan: Plan, authorized: string[]): Promise<unknown>;
  editPlan(token: string, operations: import("@/lib/plan").PlanOperation[], authorized: string[]): Promise<unknown>;
  createBudget(token: string, budget: import("@/lib/budget").Budget, reviewed: boolean): Promise<unknown>;
  editBudget(token: string, operations: import("@/lib/budget").BudgetOperation[]): Promise<unknown>;
  createDocument(token: string, name: string, kind: "research" | "working" | "planning_context", content: string): Promise<unknown>;
  editDocument(token: string, id: string, operations: import("@/services/documents/edits").DocumentOperation[]): Promise<unknown>;
  saveBrief(token: string, content: string, expectedRevision: number): Promise<unknown>;
  resolveBudgetGaps(token: string, gaps: import("@/services/budgets").BudgetGap[]): Promise<unknown>;
  inspectChanges(): Promise<unknown>;
  reload(token: string): Promise<unknown>;
  commit(token: string, summary: string, handled: string[]): Promise<unknown>;
  rejectInput(tool: string, input: unknown): void;
}
