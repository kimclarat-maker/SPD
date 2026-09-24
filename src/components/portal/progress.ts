import type { CaseStatus, ExceptionStatus, FieldReportStatus, InterventionStatus, Partner } from "@/lib/types";
import { partnerChecks } from "@/lib/services/partners";

/** How far a record is through its workflow, for the header progress bar. */
export const progressFor = {
  case: (s: CaseStatus) => ({ new: 0, assigned: 35, in_progress: 65, resolved: 90, closed: 100 })[s],
  intervention: (s: InterventionStatus) => ({ submitted: 40, returned: 20, approved: 75, rejected: 100, completed: 100 })[s],
  fieldReport: (s: FieldReportStatus) => ({ held: 10, returned: 30, submitted: 50, accepted: 100 })[s],
  exception: (s: ExceptionStatus) => ({ waiting: 10, open: 40, escalated: 60, cleared: 100, duplicate: 100 })[s],
  partner: (p: Partner) => {
    if (p.status !== "pending") return 100;
    const verified = p.documents.filter((d) => d.status === "verified").length / p.documents.length;
    return Math.round(10 + verified * 50 + (partnerChecks(p).agreementSigned ? 20 : 0));
  },
  report: (status: "draft" | "signed" | "shared", checksPassed: number) =>
    status === "shared" ? 100 : status === "signed" ? 80 : Math.round((checksPassed / 3) * 60),
};
