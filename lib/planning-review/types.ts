export type ReviewIssue = {
  code: string;
  artifact: string;
  message: string;
  nextAction: string;
  itemIds?: string[];
};
export type DayCoverage = {
  dayId: string;
  itemCount: number;
  concreteCount: number;
  mealIds: string[];
  timedCount: number;
  missingTimeIds: string[];
};
export type PlanningReview = {
  fingerprint: string;
  blockers: ReviewIssue[];
  findings: ReviewIssue[];
  days: DayCoverage[];
  costs: {
    entries: number;
    priced: number;
    unknown: number;
    unlinkedMealIds: string[];
    unlinkedStayIds: string[];
  };
  readyToPublish: boolean;
  qualityComplete: boolean;
};
