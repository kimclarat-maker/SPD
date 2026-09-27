/**
 * Domain types shared by the portal UI and the service layer. These describe
 * the shapes a future API would return; the prototype fills them from
 * fictional seed data persisted in the browser. Future partner, field
 * operations, caseworker, refugee, and M&E portals are expected to reuse
 * these records and the workflows in src/lib/services.
 */

export type ISODate = string;

export type EntityType =
  | "partner"
  | "intervention"
  | "fieldReport"
  | "form"
  | "indicator"
  | "review"
  | "case"
  | "document"
  | "report"
  | "integration"
  | "user"
  | "config"
  | "assistance"
  | "verification"
  | "fieldTask"
  | "fieldIssue";

export type AuditEntity = EntityType | "session";

export type Sector = "health" | "wash" | "education" | "livelihoods" | "protection" | "shelter";

export interface Settlement {
  id: string;
  name: string;
  district: string;
  region: string;
  /** Position on the schematic map (0–100). Settlement-level only; never an individual location. */
  x: number;
  y: number;
  /** Approximate settlement-level coordinates for the GIS map. Never an individual location. */
  lat: number;
  lng: number;
  active: boolean;
}

export interface SectorDef {
  id: Sector;
  name: string;
  active: boolean;
}

export type ServicePointType = "health_facility" | "water_point" | "school" | "distribution_point" | "help_desk" | "reception_centre";

/** A public facility or service location. Never a household or an individual. */
export interface ServicePoint {
  id: string;
  name: string;
  settlementId: string;
  type: ServicePointType;
  lat: number;
  lng: number;
}

export interface Comment {
  id: string;
  at: ISODate;
  author: string;
  text: string;
}

/* ------------------------------------------------------------------ Access */

export type Permission =
  | "partner.review"
  | "partner.decide"
  | "intervention.review"
  | "intervention.decide"
  | "field.review"
  | "forms.manage"
  | "beneficiary.aggregate"
  | "beneficiary.review"
  | "case.monitor"
  | "case.assign"
  | "document.review"
  | "document.sign"
  | "report.generate"
  | "report.export"
  | "report.submit"
  | "integration.view"
  | "integration.retry"
  | "audit.view"
  | "admin.users"
  | "admin.reference"
  | "admin.security";

export type RoleId =
  | "opm_coordinator"
  | "me_officer"
  | "system_admin"
  | "partner_focal"
  | "field_officer"
  | "field_supervisor"
  | "caseworker"
  | "partner_admin"
  | "partner_staff";

/**
 * Permissions inside the Partner Portal. They only ever apply to the user's own
 * organisation and can never grant OPM permissions. Administrator-only
 * permissions cannot be delegated to partner staff.
 */
export type PartnerPermission =
  | "profile.edit"
  | "documents.manage"
  | "proposals.manage"
  | "team.manage"
  | "progress.update"
  | "fieldReports.submit"
  | "surveys.collect"
  | "beneficiaries.verify"
  | "assistance.record"
  | "finance.submit"
  | "reports.export"
  | "agreements.sign";

/**
 * Permissions inside the Field Operations Portal. They apply only to the
 * user's assigned settlement and interventions and never grant OPM or
 * Partner Portal permissions.
 */
export type FieldPermission =
  | "visits.report"
  | "surveys.collect"
  | "beneficiaries.verify"
  | "assistance.record"
  | "issues.raise"
  | "referrals.create"
  | "work.assign"
  | "work.review";

export interface GeoScope {
  level: "national" | "region" | "settlement";
  /** Region names or settlement ids, depending on the level. Empty for national. */
  ids: string[];
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: RoleId;
  scope: GeoScope;
  status: "active" | "invited" | "deactivated";
  invitedAt?: ISODate;
  lastActiveAt?: ISODate;
  /** Partner Portal users belong to exactly one organisation. */
  partnerId?: string;
  /** Job title inside the partner organisation. */
  title?: string;
  /** Delegated partner permissions (administrators also hold the administrator-only ones). */
  partnerPermissions?: PartnerPermission[];
  /** Interventions a partner staff member or field officer is assigned to. Administrators see all of the organisation's work. */
  interventionIds?: string[];
  /** Field Operations Portal users: the organisation they work for (a partner id). */
  fieldOrganisationId?: string;
  /** Field Operations Portal permissions. */
  fieldPermissions?: FieldPermission[];
}

/* ---------------------------------------------------------------- Partners */

export type PartnerStatus =
  | "draft"
  | "submitted"
  | "completeness_review"
  | "verification"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "suspended";

export type VerificationOutcome = "not_run" | "match" | "mismatch" | "timeout" | "unavailable";

export interface ExternalVerification {
  outcome: VerificationOutcome;
  at?: ISODate;
  reference?: string;
  detail?: string;
  /** Always true in this prototype: no real registry was contacted. */
  simulated: true;
  /** Outcomes the next simulated calls will return, in order (demo scripting). */
  script?: VerificationOutcome[];
}

export interface OperatingPermission {
  settlementId: string;
  sector: Sector;
  validUntil: ISODate;
}

export interface PartnerContacts {
  email: string;
  phone: string;
  address: string;
  website?: string;
}

export interface KeyPerson {
  id: string;
  name: string;
  role: string;
  email: string;
}

/** The part of a partner profile the organisation maintains. */
export interface PartnerProfileData {
  name: string;
  acronym: string;
  type: string;
  registrationNo: string;
  ngoPermitNo: string;
  tin: string;
  focalRole: string;
  contacts: PartnerContacts;
  sectors: Sector[];
  settlementIds: string[];
  personnel: KeyPerson[];
}

export type ProfileField = keyof PartnerProfileData;

/** A change an approved partner asks OPM to make to its profile. Nothing changes until OPM approves. */
export interface ProfileChangeRequest {
  id: string;
  ref: string;
  submittedAt: ISODate;
  submittedBy: string;
  fields: ProfileField[];
  proposed: Partial<PartnerProfileData>;
  previous: Partial<PartnerProfileData>;
  reason: string;
  status: "under_review" | "approved" | "returned";
  decidedAt?: ISODate;
  decidedBy?: string;
  decisionNote?: string;
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
  /** Accreditation end date, set on approval or renewal. */
  accreditedUntil?: ISODate;
  assignedReviewer?: string;
  verification: { ursb: ExternalVerification; ngoBureau: ExternalVerification };
  permissions: OperatingPermission[];
  comments: Comment[];
  renewal?: { requestedAt: ISODate; status: "pending" | "approved" };
  updatedAt: ISODate;
  /* Partner Portal profile details (optional for records created before the portal). */
  acronym?: string;
  ngoPermitNo?: string;
  tin?: string;
  contacts?: PartnerContacts;
  personnel?: KeyPerson[];
  profileChanges?: ProfileChangeRequest[];
  /** Internal partner notes. Never shown in the OPM workspace. */
  partnerNotes?: Comment[];
}

export type ComplianceStatus = "compliant" | "expiring" | "expired" | "incomplete";

/* ----------------------------------------------------------- Interventions */

export type InterventionStatus =
  | "draft"
  | "submitted"
  | "coordination_review"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "active"
  | "completed"
  | "closed";

export interface Milestone {
  id: string;
  title: string;
  dueAt: ISODate;
  done: boolean;
}

export interface Intervention {
  id: string;
  ref: string;
  title: string;
  partnerId: string;
  sector: Sector;
  settlementId: string;
  servicePointIds: string[];
  startDate: ISODate;
  endDate: ISODate;
  budgetUsd: number;
  fundingSource: string;
  targetGroup: string;
  targetReach: number;
  objective: string;
  activities: string[];
  indicatorTargets: { indicatorId: string; target: number }[];
  milestones: Milestone[];
  status: InterventionStatus;
  assignedTo?: string;
  /** Overlaps a coordinator has reviewed and recorded a resolution for. */
  overlapResolutions: { interventionId: string; note: string; by: string; at: ISODate }[];
  comments: Comment[];
  submittedAt: ISODate;
  updatedAt: ISODate;
  /* Partner Portal details (optional for records created before the portal). */
  /** Where the work happens inside the settlement. */
  location?: string;
  /** How field teams report on this intervention (shown in the Field Operations Portal). */
  reportingInstructions?: string;
  expectedOutputs?: string[];
  budgetLines?: BudgetLine[];
  /** The partner's explanation of how an overlap with other work is handled. */
  overlapResponse?: string;
  /** Proposal versions: each submission or resubmission. */
  revisions?: { version: number; at: ISODate; by: string; note: string }[];
  changeRequests?: InterventionChangeRequest[];
  progressUpdates?: ProgressUpdate[];
  risks?: RiskFlag[];
  financialUpdates?: FinancialUpdate[];
  /** Internal partner notes. Never shown in the OPM workspace. */
  partnerNotes?: Comment[];
  createdBy?: string;
}

export interface BudgetLine {
  id: string;
  category: string;
  amountUsd: number;
}

export type ChangeRequestStatus = "submitted" | "approved" | "rejected";

export interface ScopeValues {
  objective?: string;
  activities?: string[];
  settlementId?: string;
  servicePointIds?: string[];
  endDate?: ISODate;
  budgetUsd?: number;
}

/** Amendment to an approved intervention's scope, location, dates or budget. Nothing changes until OPM approves. */
export interface InterventionChangeRequest {
  id: string;
  ref: string;
  at: ISODate;
  by: string;
  reason: string;
  proposed: ScopeValues;
  previous: ScopeValues;
  status: ChangeRequestStatus;
  decidedAt?: ISODate;
  decidedBy?: string;
  decisionNote?: string;
}

export type UpdateReviewStatus = "awaiting_review" | "acknowledged" | "returned";

export interface ProgressUpdate {
  id: string;
  at: ISODate;
  by: string;
  summary: string;
  /** Milestone the partner reports as done; it counts as done only once OPM acknowledges it. */
  milestoneId?: string;
  evidenceDocumentId?: string;
  status: UpdateReviewStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: ISODate;
}

export interface RiskFlag {
  id: string;
  at: ISODate;
  by: string;
  kind: "delay" | "risk";
  severity: Priority;
  description: string;
  mitigation: string;
  status: "open" | "acknowledged" | "closed";
  opmNote?: string;
}

export interface ExpenditureEntry {
  id: string;
  date: ISODate;
  budgetLineId: string;
  description: string;
  amountUsd: number;
  documentId?: string;
}

export type FinancialUpdateStatus = "draft" | "submitted" | "accepted" | "returned";

export interface FinancialUpdate {
  id: string;
  ref: string;
  period: string;
  entries: ExpenditureEntry[];
  status: FinancialUpdateStatus;
  submittedAt?: ISODate;
  submittedBy?: string;
  decidedAt?: ISODate;
  decidedBy?: string;
  comments: Comment[];
  updatedAt: ISODate;
}

/* ------------------------------------------------------------ Field reports */

export type FieldReportKind = "site_visit" | "activity_update" | "survey" | "distribution";

/**
 * Field submission lifecycle, as seen by the coordinator:
 * saved offline → awaiting sync → synced (or needs review) → accepted / returned / escalated.
 * A conflict means two device versions arrived and neither was overwritten.
 */
export type FieldReportStatus =
  | "draft"
  | "saved_offline"
  | "awaiting_sync"
  | "synced"
  | "needs_review"
  | "conflict"
  | "accepted"
  | "returned"
  | "escalated";

export type ValidationCode =
  | "intervention_not_approved"
  | "gps_outside_settlement"
  | "missing_attachment"
  | "reach_above_plan"
  | "late_submission"
  | "form_version_retired";

export interface FieldReportVersion {
  id: string;
  device: string;
  collectedBy: string;
  savedAt: ISODate;
  reached: { women: number; men: number; children: number };
  indicatorValues: { indicatorId: string; value: number }[];
  narrative: string;
}

export interface Attachment {
  id: string;
  name: string;
  kind: "photo" | "document" | "signature_sheet";
  sizeKb: number;
}

export interface FieldReport {
  id: string;
  ref: string;
  title: string;
  kind: FieldReportKind;
  interventionId: string;
  formId: string;
  formVersion: number;
  servicePointId?: string;
  submittedBy: string;
  channel: "offline" | "online";
  collectedAt: ISODate;
  syncedAt?: ISODate;
  /** Service-point-level GPS tag (a facility, never a household). */
  gps?: { lat: number; lng: number; accuracyM: number };
  reached: { women: number; men: number; children: number };
  indicatorValues: { indicatorId: string; value: number }[];
  distributed: { item: string; quantity: number; households: number }[];
  attachments: Attachment[];
  narrative: string;
  status: FieldReportStatus;
  validationIssues: ValidationCode[];
  comments: Comment[];
  /** Present while two device versions disagree; both are kept until a reviewer chooses. */
  conflict?: { versions: FieldReportVersion[]; resolvedVersionId?: string; resolvedBy?: string; resolvedAt?: ISODate; note?: string };
  /** Beneficiary reviews the (simulated) duplicate check raises when this report is accepted. */
  pendingReviewIds: string[];
  /** Outcome the simulated device sync will produce (demo scripting). */
  syncScript?: "clean" | "issues";
  updatedAt: ISODate;
  /* Partner Portal details. */
  activityType?: string;
  locationNote?: string;
  outputs?: string;
  challenges?: string;
  /** Survey answers, kept against the form version used when they were collected. */
  answers?: { questionId: string; value: string }[];
  /** Earlier submitted versions; nothing is overwritten when a report is corrected. */
  history?: FieldReportSnapshot[];
  partnerNotes?: Comment[];
  /** Partner Portal user who created the record. */
  createdByUserId?: string;
  /* Field Operations Portal details. */
  /** Follow-up actions the field officer recorded. */
  followUpActions?: string;
  /** Why no GPS position was captured, when the device could not provide one. */
  gpsUnavailableReason?: string;
  /** Reviewer comments tied to one field of the report; shown beside that field to the submitter. */
  fieldComments?: FieldComment[];
  /** Device record id. Makes uploads idempotent, so a retried sync never creates a second record. */
  clientRecordId?: string;
  /** Assigned field task this report completes. */
  taskId?: string;
}

/** A reviewer comment on one field of a field report. */
export interface FieldComment {
  id: string;
  field: FieldReportField;
  text: string;
  by: string;
  at: ISODate;
  /** Submission version (history length) the comment refers to. */
  version: number;
}

/** Fields of a field visit or activity report that a reviewer can point to. */
export type FieldReportField =
  | "visitAt"
  | "activityType"
  | "location"
  | "gps"
  | "observations"
  | "workCompleted"
  | "reached"
  | "indicators"
  | "challenges"
  | "followUp"
  | "attachments";

export interface FieldReportSnapshot {
  version: number;
  at: ISODate;
  by: string;
  note: string;
  reached: { women: number; men: number; children: number };
  indicatorValues: { indicatorId: string; value: number }[];
  narrative: string;
  outputs?: string;
  answers?: { questionId: string; value: string }[];
  /** Device revision id, so a retried resubmission is recognised instead of recorded twice. */
  clientRevisionId?: string;
}

/* ----------------------------------------------------- Surveys & indicators */

export type FormVersionStatus = "draft" | "published" | "retired";

export interface FormQuestion {
  id: string;
  label: string;
  type: "number" | "text" | "choice" | "gps" | "photo" | "date";
  required: boolean;
  indicatorId?: string;
  /** Answer choices for a choice question (Yes / No when not set). */
  options?: string[];
}

export interface FormVersion {
  version: number;
  status: FormVersionStatus;
  createdAt: ISODate;
  publishedAt?: ISODate;
  retiredAt?: ISODate;
  changeNote: string;
  questions: FormQuestion[];
}

export interface FieldForm {
  id: string;
  ref: string;
  title: string;
  purpose: string;
  kind: FieldReportKind;
  sector: Sector | "cross_sector";
  deploymentStart: ISODate;
  deploymentEnd: ISODate;
  interventionIds: string[];
  versions: FormVersion[];
  updatedAt: ISODate;
}

export interface IndicatorDef {
  id: string;
  code: string;
  name: string;
  unit: string;
  sector: Sector;
  /** National target for the reporting period. */
  target: number;
  frequency: "monthly" | "quarterly";
  active: boolean;
}

/* ----------------------------------------------- Beneficiary & assistance */

export type ProgresOutcome = "not_requested" | "success" | "unavailable" | "inconclusive";

export type ReviewStatus = "waiting" | "open" | "in_review" | "escalated" | "resolved_valid" | "resolved_duplicate";

export interface BeneficiaryReview {
  id: string;
  ref: string;
  kind: "possible_duplicate" | "verification_issue";
  /** Source field report, when the review came from a distribution report. */
  fieldReportId?: string;
  /** Source assistance entry, when the review came from the Partner Portal. */
  assistanceId?: string;
  /** Intervention of the source assistance entry. */
  interventionId?: string;
  /** Masked reference shown to anyone who can see the queue. */
  householdMasked: string;
  /** Minimum restricted detail, revealed only to a permitted reviewer who records a reason. */
  restricted: {
    householdRef: string;
    householdSize: number;
    association: string;
    progresId: string;
  };
  detectedAt: ISODate;
  summary: string;
  history: { item: string; partnerName: string; date: ISODate; source: string }[];
  progres: { outcome: ProgresOutcome; at?: ISODate; detail?: string; attempts: number; script: ProgresOutcome[] };
  status: ReviewStatus;
  assignedTo?: string;
  notes: Comment[];
  /** Assistance is never blocked by a review; overrides are logged if a reviewer changes the default. */
  overrides: { at: ISODate; by: string; note: string }[];
  updatedAt: ISODate;
}

export type BeneficiaryVerificationStatus = "pending" | "verified" | "inconclusive" | "unavailable" | "needs_review";

/**
 * A partner's request to confirm a beneficiary reference against ProGres v4
 * (SIMULATED). Only the minimum needed is kept: the reference and, optionally,
 * the household size. No names or contact details.
 */
export interface BeneficiaryVerification {
  id: string;
  ref: string;
  partnerId: string;
  interventionId: string;
  beneficiaryRef: string;
  householdSize?: number;
  purpose: string;
  status: BeneficiaryVerificationStatus;
  requestedAt: ISODate;
  requestedBy: string;
  resultAt?: ISODate;
  detail?: string;
  attempts: number;
  simulated: true;
  /* Field Operations Portal details. */
  clientRecordId?: string;
  /** The officer confirmed the person understood the purpose of the check. */
  consentConfirmed?: boolean;
  /** Queued on a device while offline, then sent when connectivity returned. */
  queuedOffline?: boolean;
}

export type AssistanceStatus = "recorded" | "flagged" | "cleared" | "corrected";

/** Assistance delivered under an approved intervention. A review flag never blocks it. */
export interface AssistanceRecord {
  id: string;
  ref: string;
  partnerId: string;
  interventionId: string;
  verificationId?: string;
  beneficiaryRef: string;
  assistanceType: string;
  quantity: number;
  unit: string;
  valueUsd?: number;
  deliveredAt: ISODate;
  settlementId: string;
  servicePointId?: string;
  responsibleStaff: string;
  recordedBy: string;
  recordedAt: ISODate;
  reviewId?: string;
  status: AssistanceStatus;
  /* Field Operations Portal details. */
  clientRecordId?: string;
  taskId?: string;
  /** Delivery evidence (names and sizes only; no file is stored in this prototype). */
  evidence?: Attachment[];
  note?: string;
  /** How the entry reached the central system. */
  channel?: "online" | "offline";
}

/* ------------------------------------------------------- Refugee services */

export type CaseServiceType =
  | "inquiry"
  | "registration"
  | "family_attestation"
  | "asylum_certificate"
  | "refugee_id"
  | "rsd_interview"
  | "renewal"
  | "verification"
  | "document_other";

export type CaseStatus = "received" | "assigned" | "in_progress" | "awaiting_info" | "resolved" | "closed";
export type Priority = "high" | "medium" | "low";

export interface ServiceCase {
  id: string;
  ref: string;
  serviceType: CaseServiceType;
  settlementId: string;
  priority: Priority;
  receivedAt: ISODate;
  dueAt: ISODate;
  status: CaseStatus;
  escalated: boolean;
  assignedTeam?: string;
  channel: string;
  summary: string;
  nextAction: string;
  /** Sensitive requester details; masked unless the viewer has case-level access. */
  requester: { name: string; individualId: string; phone: string; household: string };
  documents: { id: string; name: string; status: "authorised" | "pending" | "issued" }[];
  appointments: { id: string; kind: string; at: ISODate; location: string; status: "scheduled" | "attended" | "missed" | "cancelled" }[];
  messages: { id: string; at: ISODate; direction: "in" | "out"; text: string; channel: "sms" | "help_desk" | "portal" }[];
  internalNotes: Comment[];
  resolution?: string;
  /** Users who have been granted case-level access (with a recorded reason). */
  accessGrants: { user: string; at: ISODate; reason: string }[];
  updatedAt: ISODate;
  /** Set when a field officer referred the need. The officer sees only the referral status, never the case. */
  referral?: { fieldIssueId: string; byUserId: string; by: string; at: ISODate };
}

/* ------------------------------------------------ Documents & approvals */

export type DocumentCategory = "mou" | "partner_document" | "intervention_evidence" | "approval" | "correspondence";
export type Classification = "public" | "internal" | "restricted" | "confidential";
export type DocumentStatus = "missing" | "draft" | "in_review" | "changes_requested" | "approved" | "rejected";
export type SignatureStatus = "not_required" | "not_requested" | "requested" | "signed" | "declined";

export interface DocumentVersion {
  version: number;
  at: ISODate;
  author: string;
  note: string;
  sizeKb: number;
}

export interface ApprovalStep {
  id: string;
  role: string;
  assignee?: string;
  decision?: "approved" | "changes_requested" | "rejected";
  by?: string;
  at?: ISODate;
  note?: string;
}

export interface DocumentRecord {
  id: string;
  ref: string;
  title: string;
  category: DocumentCategory;
  owner: string;
  related?: { entity: EntityType; id: string };
  classification: Classification;
  required?: boolean;
  expiresAt?: ISODate;
  versions: DocumentVersion[];
  status: DocumentStatus;
  route: ApprovalStep[];
  signature: { status: SignatureStatus; signer?: string; requestedAt?: ISODate; signedAt?: ISODate; simulated: true };
  updatedAt: ISODate;
}

/* ------------------------------------------------------------- Reporting */

export type ReportLevel = "national" | "district" | "settlement" | "sector" | "partner" | "intervention";
export type ReportSectionKey =
  | "interventions"
  | "partners"
  | "assistance"
  | "cases"
  | "surveys"
  | "indicators"
  | "funding";

export interface ReportFilters {
  from?: ISODate;
  to?: ISODate;
  district?: string;
  settlementId?: string;
  sector?: Sector;
  partnerId?: string;
  interventionId?: string;
}

export interface SavedReport {
  id: string;
  ref: string;
  title: string;
  level: ReportLevel;
  period: string;
  filters: ReportFilters;
  sections: ReportSectionKey[];
  status: "draft" | "generated" | "submitted";
  generatedAt?: ISODate;
  /** Figures frozen when the report is generated, so later edits do not change a submitted report. */
  snapshot?: Record<string, number>;
  createdBy: string;
  updatedAt: ISODate;
}

export type ExchangeTarget = "amp" | "nimes";
export type ExchangeStatus = "not_prepared" | "prepared" | "submitted" | "accepted" | "partial" | "failed";

export interface DataExchange {
  id: string;
  target: ExchangeTarget;
  reportId: string;
  period: string;
  status: ExchangeStatus;
  records: number;
  errors: { field: string; message: string }[];
  preparedAt?: ISODate;
  submittedAt?: ISODate;
  runId?: string;
}

/* ------------------------------------------------------------ Integrations */

export type IntegrationId = "progres" | "amp" | "ursb" | "ngo_bureau" | "nimes";
export type IntegrationHealth = "healthy" | "degraded" | "failing" | "paused";
export type RunOutcome = "success" | "timeout" | "mismatch" | "partial" | "unavailable" | "inconclusive";

export interface IntegrationRun {
  id: string;
  integrationId: IntegrationId;
  at: ISODate;
  operation: string;
  trigger: "scheduled" | "manual" | "retry" | "workflow";
  outcome: RunOutcome;
  records: number;
  errors: number;
  message: string;
  durationMs: number;
  retryOf?: string;
  related?: { entity: EntityType; id: string };
}

export interface Integration {
  id: IntegrationId;
  name: string;
  owner: string;
  purpose: string;
  direction: "inbound" | "outbound" | "two_way";
  health: IntegrationHealth;
  /** Outcomes the next simulated retries will return, in order (demo scripting). */
  retryScript: RunOutcome[];
}

/* ----------------------------------------------------- Notifications/audit */

export type NotificationKind =
  | "changes_requested"
  | "assigned_review"
  | "deadline"
  | "overdue"
  | "document_expiry"
  | "sync_failed"
  | "integration_failed"
  | "decision";

export interface StoredNotification {
  id: string;
  at: ISODate;
  kind: NotificationKind;
  /** Key under portal.notify */
  message: string;
  params: Record<string, string | number>;
  entity: EntityType;
  entityId: string;
  /** Partner Portal notifications go only to that organisation; field notifications only to that user. Neither appears in the OPM inbox. */
  audience?: { partnerId?: string; userId?: string };
}

export type AuditCategory = "decision" | "status" | "access" | "export" | "integration" | "config" | "session" | "record";

export interface AuditEntry {
  id: string;
  at: ISODate;
  /** null = system-generated */
  actor: string | null;
  /** Key under portal.auditActions */
  action: string;
  category: AuditCategory;
  params: Record<string, string | number>;
  entity: AuditEntity;
  entityId?: string;
  /** Human-readable reference captured at the time, so the entry reads well even if the record changes. */
  entityRef?: string;
  note?: string;
  simulated?: boolean;
  sensitive?: boolean;
}

/* -------------------------------------------------------------- Config */

export interface ApprovalRoute {
  id: string;
  name: string;
  appliesTo: DocumentCategory | "partner" | "intervention";
  steps: string[];
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: "email" | "sms" | "in_app";
  subject: string;
  body: string;
  active: boolean;
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  ipAllowlist: string;
  exportWatermark: boolean;
}

export interface DemoState {
  version: number;
  seededAt: ISODate;
  settlements: Settlement[];
  sectors: SectorDef[];
  servicePoints: ServicePoint[];
  teams: string[];
  partners: Partner[];
  interventions: Intervention[];
  fieldReports: FieldReport[];
  forms: FieldForm[];
  indicators: IndicatorDef[];
  reviews: BeneficiaryReview[];
  cases: ServiceCase[];
  documents: DocumentRecord[];
  reports: SavedReport[];
  exchanges: DataExchange[];
  integrations: Integration[];
  runs: IntegrationRun[];
  notifications: StoredNotification[];
  notificationReads: string[];
  users: UserAccount[];
  approvalRoutes: ApprovalRoute[];
  templates: NotificationTemplate[];
  security: SecuritySettings;
  audit: AuditEntry[];
  verifications: BeneficiaryVerification[];
  assistance: AssistanceRecord[];
  partnerReports: PartnerReport[];
  fieldTasks: FieldTask[];
  fieldIssues: FieldIssue[];
}

/* -------------------------------------------------- Field operations */

export type FieldTaskKind = "visit" | "activity" | "survey" | "assistance" | "follow_up";
export type FieldTaskStatus = "assigned" | "in_progress" | "submitted" | "completed" | "cancelled";

/** What an assistance task allows the officer to deliver to one household. */
export interface FieldTaskAllocation {
  /** Household reference needed to deliver. Cached on the device only while the task is assigned. */
  householdRef: string;
  assistanceType: string;
  quantity: number;
  unit: string;
}

/** Every change to a task is a new version; nothing is overwritten. */
export interface FieldTaskVersion {
  version: number;
  at: ISODate;
  by: string;
  note: string;
  changes: { field: string; from: string; to: string }[];
}

/** Work assigned to a field officer by a settlement supervisor. */
export interface FieldTask {
  id: string;
  ref: string;
  kind: FieldTaskKind;
  title: string;
  instructions: string;
  interventionId: string;
  settlementId: string;
  servicePointId?: string;
  formId?: string;
  dueAt: ISODate;
  priority: Priority;
  status: FieldTaskStatus;
  assignedTo: string;
  assignedBy: string;
  assignedAt: ISODate;
  allocation?: FieldTaskAllocation;
  version: number;
  versions: FieldTaskVersion[];
  /** Central records produced from this task (field reports, assistance entries). */
  linkedIds: string[];
  updatedAt: ISODate;
}

export type FieldIssueCategory = "service_gap" | "safeguarding" | "infrastructure" | "failed_distribution" | "follow_up" | "referral";
export type FieldIssueStatus = "received" | "assigned" | "in_progress" | "resolved" | "closed";

/** A problem or need a field officer flags. Safeguarding details are restricted to the protection team. */
export interface FieldIssue {
  id: string;
  ref: string;
  category: FieldIssueCategory;
  priority: Priority;
  settlementId: string;
  servicePointId?: string;
  interventionId?: string;
  locationNote: string;
  description: string;
  evidence: Attachment[];
  /** Team the item was routed to. */
  routedTo: string;
  status: FieldIssueStatus;
  /** Restricted items show only their category and status outside the receiving team. */
  restricted: boolean;
  raisedByUserId: string;
  raisedBy: string;
  raisedAt: ISODate;
  /** For referrals: the service requested and the caseworker case created (the officer never opens it). */
  serviceType?: CaseServiceType;
  caseId?: string;
  updates: { at: ISODate; by: string; text: string; status: FieldIssueStatus }[];
  clientRecordId?: string;
  updatedAt: ISODate;
}

export type PartnerReportSection = "progress" | "fieldActivities" | "indicators" | "assistance" | "coverage" | "expenditure";

/** A report a partner generated about its own work. Figures are frozen when it is generated. */
export interface PartnerReport {
  id: string;
  ref: string;
  partnerId: string;
  title: string;
  interventionId?: string;
  from?: ISODate;
  to?: ISODate;
  sections: PartnerReportSection[];
  generatedAt: ISODate;
  generatedBy: string;
  snapshot: Record<string, number>;
  exports: { format: "PDF" | "Excel" | "CSV"; at: ISODate; by: string }[];
}

export interface DemoSession {
  userId: string;
  username: string;
  displayName: string;
  role: RoleId;
  scope: GeoScope;
  signedInAt: ISODate;
  demo: true;
  /** Set for Partner Portal users: the only organisation whose records they can see. */
  partnerId?: string;
}

/** Field Operations Portal roles. */
export const FIELD_ROLES: readonly RoleId[] = ["field_officer", "field_supervisor"];
