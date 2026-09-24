/**
 * Domain types shared by the portal UI and the service layer. These describe
 * the shapes a future API would return; the prototype fills them from
 * fictional seed data persisted in the browser.
 */

export type ISODate = string;

export type EntityType = "partner" | "intervention" | "fieldReport" | "exception" | "case" | "report" | "integration";

export type Sector = "health" | "wash" | "education" | "livelihoods" | "protection" | "shelter";

export interface Settlement {
  id: string;
  name: string;
  region: string;
  /** Position on the schematic map (0–100). Settlement-level only; never an individual location. */
  x: number;
  y: number;
  /** Approximate settlement-level coordinates for the GIS map. Never an individual location. */
  lat: number;
  lng: number;
}

export type PartnerStatus = "pending" | "approved" | "rejected" | "suspended";
export type DocumentStatus = "verified" | "pending" | "missing";

export interface PartnerDocument {
  id: string;
  name: string;
  status: DocumentStatus;
}

export interface PartnerAgreement {
  status: "not_requested" | "requested" | "signed";
  signedBy?: string;
  signedAt?: ISODate;
}

export interface Partner {
  id: string;
  ref: string;
  name: string;
  type: string;
  registrationNo: string;
  sectors: Sector[];
  settlementIds: string[];
  focalRole: string;
  submittedAt: ISODate;
  status: PartnerStatus;
  documents: PartnerDocument[];
  agreement: PartnerAgreement;
  updatedAt: ISODate;
}

export type InterventionStatus = "submitted" | "approved" | "returned" | "rejected" | "completed";

export interface Intervention {
  id: string;
  ref: string;
  title: string;
  partnerId: string;
  sector: Sector;
  settlementId: string;
  startDate: ISODate;
  endDate: ISODate;
  budgetUsd: number;
  fundingSource: string;
  targetReach: number;
  objective: string;
  activities: string[];
  status: InterventionStatus;
  submittedAt: ISODate;
  updatedAt: ISODate;
}

export type FieldReportStatus = "held" | "submitted" | "accepted" | "returned";

export interface FieldReport {
  id: string;
  ref: string;
  title: string;
  interventionId: string;
  submittedBy: string;
  channel: "offline" | "online";
  activityDate: ISODate;
  receivedAt: ISODate;
  reached: { women: number; men: number; children: number };
  distributed: { item: string; quantity: number }[];
  narrative: string;
  status: FieldReportStatus;
  /** Exceptions the (simulated) verification check will raise when this report is accepted. */
  pendingExceptionIds: string[];
  updatedAt: ISODate;
}

export type ExceptionStatus = "waiting" | "open" | "escalated" | "cleared" | "duplicate";
export type ExceptionReason = "duplicate" | "mismatch" | "missing";

export interface AssistanceException {
  id: string;
  ref: string;
  fieldReportId: string;
  /** Pseudonymous, masked reference. No names or precise locations are stored in the prototype. */
  householdRef: string;
  reason: ExceptionReason;
  detectedAt: ISODate;
  history: { item: string; partnerName: string; date: ISODate }[];
  verificationSummary: string;
  status: ExceptionStatus;
  updatedAt: ISODate;
}

export type CaseStatus = "new" | "assigned" | "in_progress" | "resolved" | "closed";
export type Priority = "high" | "medium" | "low";

export interface ServiceCase {
  id: string;
  ref: string;
  title: string;
  category: string;
  requesterRef: string;
  channel: string;
  settlementId: string;
  receivedAt: ISODate;
  dueAt: ISODate;
  priority: Priority;
  summary: string;
  assignedPartnerId?: string;
  resolution?: string;
  status: CaseStatus;
  updatedAt: ISODate;
}

export interface ReportFigures {
  partnersApproved: number;
  interventionsApproved: number;
  fieldReportsAccepted: number;
  peopleReached: number;
  exceptionsResolved: number;
  casesResolved: number;
  casesOpen: number;
  budgetApprovedUsd: number;
}

export type ReportStatus = "draft" | "signed" | "shared";

export interface NationalReport {
  id: string;
  ref: string;
  title: string;
  period: string;
  status: ReportStatus;
  sections: { title: string; body: string }[];
  signedBy?: string;
  signedAt?: ISODate;
  sharedAt?: ISODate;
  sharedCount?: number;
  frozenFigures?: ReportFigures;
  updatedAt: ISODate;
}

export type IntegrationStatus = "healthy" | "delayed" | "paused";

export interface Integration {
  id: string;
  ref: string;
  name: string;
  description: string;
  direction: string;
  status: IntegrationStatus;
  lastSyncAt: ISODate;
  updatedAt: ISODate;
}

export type OutboxKind = "sms" | "email" | "signature" | "exchange" | "verification";

export interface OutboxMessage {
  id: string;
  at: ISODate;
  kind: OutboxKind;
  recipient: string;
  message: string;
  entity: EntityType;
  entityId: string;
}

export interface AuditEntry {
  id: string;
  at: ISODate;
  /** null = system-generated */
  actor: string | null;
  /** Key under portal.auditActions */
  action: string;
  params: Record<string, string | number>;
  entity: EntityType | "session";
  entityId?: string;
  note?: string;
  simulated?: boolean;
}

export interface DemoState {
  version: number;
  seededAt: ISODate;
  partners: Partner[];
  interventions: Intervention[];
  fieldReports: FieldReport[];
  exceptions: AssistanceException[];
  cases: ServiceCase[];
  reports: NationalReport[];
  integrations: Integration[];
  outbox: OutboxMessage[];
  audit: AuditEntry[];
}

export interface DemoSession {
  username: string;
  displayName: string;
  role: "opm_national_coordinator";
  signedInAt: ISODate;
  demo: true;
}
