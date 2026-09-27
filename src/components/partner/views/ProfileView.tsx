"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { PartnerProfileData, ProfileField, Sector } from "@/lib/types";
import {
  getPartnerProfile,
  ORGANISATION_TYPES,
  profileIssues,
  saveProfileDraft,
  submitProfileChange,
  type ProfileFieldState,
  type ProfileIssue,
} from "@/lib/services/partnerAccount";
import { useServiceAction } from "@/lib/services/hooks";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { ErrorSummary, Gate, ReadOnlyField, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const issueField: Record<ProfileIssue, string> = {
  name: "pf-name",
  type: "pf-type",
  registrationNo: "pf-reg",
  ngoPermitNo: "pf-permit",
  tin: "pf-tin",
  tinFormat: "pf-tin",
  focalRole: "pf-focal",
  contactEmail: "pf-email",
  contactEmailFormat: "pf-email",
  contactPhone: "pf-phone",
  contactAddress: "pf-address",
  sectors: "pf-sectors",
  settlementIds: "pf-areas",
  personnel: "pf-person-0-name",
  personnelEmail: "pf-person-0-email",
};

const FORMAT: ProfileIssue[] = ["tinFormat", "contactEmailFormat", "personnelEmail"];

export function ProfileView() {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(getPartnerProfile);
  const [form, setForm] = useState<PartnerProfileData | null>(null);
  const [reason, setReason] = useState("");
  const [shownIssues, setShownIssues] = useState<ProfileIssue[]>([]);
  const [reasonError, setReasonError] = useState<string>();
  const summaryRef = useRef<HTMLDivElement>(null);
  const action = useServiceAction();
  const baseId = useId();

  // Load the saved profile into the form, and again whenever it changes elsewhere (e.g. after an OPM decision).
  const savedKey = q.data ? JSON.stringify(q.data.profile) + q.data.mode : "";
  useEffect(() => {
    if (q.data) setForm(structuredClone(q.data.profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  useEffect(() => {
    if (shownIssues.length) summaryRef.current?.focus();
  }, [shownIssues]);

  return (
    <Gate loading={!q.data || !form} denied={q.denied} notFound={q.notFound} backHref="/partner">
      {() => {
        const d = q.data!;
        const f = form!;
        const states = d.states;
        const editable = (field: ProfileField) => d.canEdit && states[field] === "editable";
        const anyEditable = d.canEdit && Object.values(states).some((s) => s === "editable");
        const set = (patch: Partial<PartnerProfileData>) => setForm({ ...f, ...patch });
        const setContact = (key: keyof PartnerProfileData["contacts"], value: string) => set({ contacts: { ...f.contacts, [key]: value } });
        const errorFor = (...keys: ProfileIssue[]) => {
          const hit = keys.find((k) => shownIssues.includes(k));
          return hit ? t(`partner.profile.issues.${hit}` as MessageKey) : undefined;
        };
        const districts = [...new Set(d.options.settlements.filter((s) => f.settlementIds.includes(s.id)).map((s) => s.district))];

        const text = (field: ProfileField, id: string, label: string, value: string, onChange: (v: string) => void, issue: ProfileIssue[], extra: { hint?: string; type?: string; autoComplete?: string } = {}) =>
          editable(field) ? (
            <TextField
              id={id}
              label={
                <span className={styles.fieldHead}>
                  {label} <StatusBadge entity="profileField" status={states[field]} />
                </span>
              }
              value={value}
              hint={extra.hint}
              type={extra.type}
              autoComplete={extra.autoComplete}
              error={errorFor(...issue)}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <ReadOnlyField label={label} value={value} state={states[field] as ProfileFieldState} />
          );

        async function save() {
          const all = profileIssues(f);
          if (d.mode === "draft") {
            const format = all.filter((i) => FORMAT.includes(i));
            setShownIssues(format);
            if (format.length) return;
            await action.run("save", () => saveProfileDraft(f), t("partner.profile.saved"));
          } else {
            setShownIssues(all);
            const missingReason = !reason.trim();
            setReasonError(missingReason ? t("partner.profile.reasonRequired") : undefined);
            if (all.length || missingReason) return;
            if (await action.run("change", () => submitProfileChange(f, reason), t("partner.profile.changeSubmitted"))) setReason("");
          }
        }

        return (
          <>
            <PageHeader
              eyebrow={d.partner.ref}
              title={t("partner.profile.title")}
              intro={t(`partner.profile.intro.${d.mode}` as MessageKey)}
              meta={<StatusBadge entity="partner" status={d.partner.status} />}
            />
            <div className={portal.stack}>
              <div className={styles.legendRow} aria-label={t("partner.profile.legend")}>
                <span className={portal.small}>{t("partner.profile.legend")}:</span>
                {(["editable", "under_review", "verified", "locked"] as const).map((s) => (
                  <StatusBadge key={s} entity="profileField" status={s} />
                ))}
              </div>
              <p className={`${portal.small} ${portal.muted}`}>{t("partner.profile.legendHelp")}</p>

              {d.pendingChange && (
                <Notice tone="info" title={t("partner.profile.pendingTitle", { ref: d.pendingChange.ref })}>
                  {t("partner.profile.pendingBody", { date: formatDate(d.pendingChange.submittedAt) })}
                </Notice>
              )}
              {d.mode === "in_review" && <Notice tone="info">{t("partner.profile.inReview")}</Notice>}
              {!d.canEdit && <Notice tone="info">{t("partner.profile.readOnlyRole")}</Notice>}
              {d.mode === "draft" && d.canEdit && (
                <Notice tone="info">
                  {t("partner.profile.draftHint")}{" "}
                  <Link href="/partner/accreditation">{t("partner.profile.goAccreditation")}</Link>
                </Notice>
              )}

              <ErrorSummary focusRef={summaryRef} items={shownIssues.map((i) => ({ id: i === "personnel" || i === "personnelEmail" ? issueField[i] : issueField[i], message: t(`partner.profile.issues.${i}` as MessageKey) }))} />

              <Section title={t("partner.profile.organisation")}>
                <div className={styles.formGrid}>
                  {text("name", "pf-name", t("partner.profile.fields.name"), f.name, (v) => set({ name: v }), ["name"], { autoComplete: "organization" })}
                  {text("acronym", "pf-acronym", t("partner.profile.fields.acronym"), f.acronym, (v) => set({ acronym: v }), [])}
                  {editable("type") ? (
                    <SelectField
                      id="pf-type"
                      label={
                        <span className={styles.fieldHead}>
                          {t("partner.profile.fields.type")} <StatusBadge entity="profileField" status={states.type} />
                        </span>
                      }
                      value={f.type}
                      error={errorFor("type")}
                      onChange={(e) => set({ type: e.target.value })}
                    >
                      <option value="">{t("portal.common.choose")}</option>
                      {ORGANISATION_TYPES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </SelectField>
                  ) : (
                    <ReadOnlyField label={t("partner.profile.fields.type")} value={f.type} state={states.type} />
                  )}
                  {text("registrationNo", "pf-reg", t("partner.profile.fields.registrationNo"), f.registrationNo, (v) => set({ registrationNo: v }), ["registrationNo"], { hint: t("partner.profile.hints.registrationNo") })}
                  {text("ngoPermitNo", "pf-permit", t("partner.profile.fields.ngoPermitNo"), f.ngoPermitNo, (v) => set({ ngoPermitNo: v }), ["ngoPermitNo"], { hint: t("partner.profile.hints.ngoPermitNo") })}
                  {text("tin", "pf-tin", t("partner.profile.fields.tin"), f.tin, (v) => set({ tin: v }), ["tin", "tinFormat"], { hint: t("partner.profile.hints.tin") })}
                </div>
                <p className={`${portal.small} ${portal.muted}`}>{t("partner.profile.verifiedNote")}</p>
              </Section>

              <Section title={t("partner.profile.contacts")}>
                <div className={styles.formGrid}>
                  {text("contacts", "pf-email", t("partner.profile.fields.email"), f.contacts.email, (v) => setContact("email", v), ["contactEmail", "contactEmailFormat"], { type: "email", autoComplete: "email" })}
                  {text("contacts", "pf-phone", t("partner.profile.fields.phone"), f.contacts.phone, (v) => setContact("phone", v), ["contactPhone"], { type: "tel", autoComplete: "tel" })}
                  {text("contacts", "pf-address", t("partner.profile.fields.address"), f.contacts.address, (v) => setContact("address", v), ["contactAddress"], { autoComplete: "street-address" })}
                  {text("contacts", "pf-website", t("partner.profile.fields.website"), f.contacts.website ?? "", (v) => setContact("website", v), [], { type: "url" })}
                  {text("focalRole", "pf-focal", t("partner.profile.fields.focalRole"), f.focalRole, (v) => set({ focalRole: v }), ["focalRole"])}
                </div>
              </Section>

              <Section title={t("partner.profile.areas")}>
                <div className={styles.formGrid}>
                  <fieldset className={styles.fieldset} id="pf-sectors" aria-describedby={errorFor("sectors") ? `${baseId}-sec-err` : undefined}>
                    <legend className={styles.fieldHead}>
                      <span className={styles.legend}>{t("partner.profile.fields.sectors")}</span> <StatusBadge entity="profileField" status={states.sectors} />
                    </legend>
                    {errorFor("sectors") && (
                      <p id={`${baseId}-sec-err`} className={portal.fieldError}>
                        {errorFor("sectors")}
                      </p>
                    )}
                    <div className={styles.checkGrid}>
                      {d.options.sectors.map((s) => (
                        <label key={s.id} className={portal.checkRow}>
                          <input
                            type="checkbox"
                            checked={f.sectors.includes(s.id)}
                            disabled={!editable("sectors")}
                            onChange={(e) => set({ sectors: e.target.checked ? [...f.sectors, s.id as Sector] : f.sectors.filter((x) => x !== s.id) })}
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset} id="pf-areas" aria-describedby={errorFor("settlementIds") ? `${baseId}-area-err` : undefined}>
                    <legend className={styles.fieldHead}>
                      <span className={styles.legend}>{t("partner.profile.fields.settlements")}</span> <StatusBadge entity="profileField" status={states.settlementIds} />
                    </legend>
                    {errorFor("settlementIds") && (
                      <p id={`${baseId}-area-err`} className={portal.fieldError}>
                        {errorFor("settlementIds")}
                      </p>
                    )}
                    <div className={styles.checkGrid}>
                      {d.options.settlements.map((s) => (
                        <label key={s.id} className={portal.checkRow}>
                          <input
                            type="checkbox"
                            checked={f.settlementIds.includes(s.id)}
                            disabled={!editable("settlementIds")}
                            onChange={(e) => set({ settlementIds: e.target.checked ? [...f.settlementIds, s.id] : f.settlementIds.filter((x) => x !== s.id) })}
                          />
                          {s.name} <span className={portal.muted}>({s.district})</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <p className={portal.small}>
                  <strong>{t("partner.profile.fields.districts")}:</strong> {districts.length ? districts.join(", ") : "—"}
                </p>
                {d.mode === "approved" && <p className={`${portal.small} ${portal.muted}`}>{t("partner.profile.lockedAreas")}</p>}
              </Section>

              <Section title={t("partner.profile.personnel")} actions={<StatusBadge entity="profileField" status={states.personnel} />}>
                {f.personnel.map((person, index) => (
                  <div key={person.id} className={styles.listRowWide}>
                    {editable("personnel") ? (
                      <>
                        <TextField id={`pf-person-${index}-name`} label={t("partner.profile.fields.personName")} value={person.name} error={index === 0 ? errorFor("personnel") : undefined} onChange={(e) => set({ personnel: f.personnel.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)) })} />
                        <TextField id={`pf-person-${index}-role`} label={t("partner.profile.fields.personRole")} value={person.role} onChange={(e) => set({ personnel: f.personnel.map((x, i) => (i === index ? { ...x, role: e.target.value } : x)) })} />
                        <TextField id={`pf-person-${index}-email`} type="email" label={t("partner.profile.fields.personEmail")} value={person.email} error={index === 0 ? errorFor("personnelEmail") : undefined} onChange={(e) => set({ personnel: f.personnel.map((x, i) => (i === index ? { ...x, email: e.target.value } : x)) })} />
                        <Button variant="ghost" size="sm" icon="trash" aria-label={`${t("partner.common.remove")}: ${person.name || index + 1}`} onClick={() => set({ personnel: f.personnel.filter((_, i) => i !== index) })}>
                          {t("partner.common.remove")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <ReadOnlyField label={t("partner.profile.fields.personName")} value={person.name} />
                        <ReadOnlyField label={t("partner.profile.fields.personRole")} value={person.role} />
                        <ReadOnlyField label={t("partner.profile.fields.personEmail")} value={person.email} />
                        <span />
                      </>
                    )}
                  </div>
                ))}
                {editable("personnel") && (
                  <div>
                    <Button size="sm" variant="secondary" icon="plus" onClick={() => set({ personnel: [...f.personnel, { id: `kp-${Date.now().toString(36)}`, name: "", role: "", email: "" }] })}>
                      {t("partner.profile.addPerson")}
                    </Button>
                  </div>
                )}
              </Section>

              {d.mode === "approved" && anyEditable && (
                <Section title={t("partner.profile.changeTitle")}>
                  <p className={portal.small}>{t("partner.profile.changeHint")}</p>
                  <TextAreaField id="pf-reason" label={t("partner.profile.changeReason")} requiredLabel={t("common.requiredMarker")} value={reason} error={reasonError} onChange={(e) => setReason(e.target.value)} />
                </Section>
              )}

              {anyEditable && (
                <div className={styles.formActions}>
                  <Button icon={d.mode === "draft" ? "check" : "send"} disabled={Boolean(action.pending) || Boolean(d.pendingChange && d.mode === "approved")} aria-busy={Boolean(action.pending) || undefined} onClick={save}>
                    {action.pending ? t("common.loading") : d.mode === "draft" ? t("partner.profile.saveDraft") : t("partner.profile.submitChange")}
                  </Button>
                  <Button variant="secondary" onClick={() => (setForm(structuredClone(d.profile)), setShownIssues([]), action.clear())}>
                    {t("partner.profile.discard")}
                  </Button>
                  {d.mode === "draft" && (
                    <>
                      <Button
                        variant="ghost"
                        icon="pen"
                        onClick={() =>
                          set({
                            ngoPermitNo: f.ngoPermitNo || "NGOB/FIC/2026/1187",
                            tin: f.tin || "1004455621",
                            contacts: { ...f.contacts, phone: f.contacts.phone || "+256 700 000 533", address: f.contacts.address || "Plot 12, Mbarara Road, Isingiro (fictional)" },
                          })
                        }
                      >
                        {t("partner.profile.demoFill")}
                      </Button>
                      <ButtonLink href="/partner/accreditation" variant="ghost" iconEnd="arrowRight">
                        {t("partner.profile.goAccreditation")}
                      </ButtonLink>
                    </>
                  )}
                  <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
                  {action.error && (
                    <Notice tone="error" role="alert">
                      {action.error}
                    </Notice>
                  )}
                </div>
              )}

              {d.changes.length > 0 && (
                <Section title={t("partner.profile.changeHistory")}>
                  <ul className={portal.rowList}>
                    {d.changes.map((c) => (
                      <li key={c.id} className={portal.rowItem}>
                        <span className={portal.rowMain}>
                          <strong>{c.ref}</strong>
                          <span className={portal.ref}>
                            {formatDate(c.submittedAt)} · {c.submittedBy} · {c.fields.map((x) => t(`partner.profile.fieldNames.${x}` as MessageKey)).join(", ")}
                          </span>
                          <span className={portal.small}>“{c.reason}”</span>
                          {c.decisionNote && (
                            <span className={portal.small}>
                              <strong>{t("partner.common.opmComment")}:</strong> {c.decisionNote} ({c.decidedBy})
                            </span>
                          )}
                        </span>
                        <StatusBadge entity="profileChange" status={c.status} />
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          </>
        );
      }}
    </Gate>
  );
}
