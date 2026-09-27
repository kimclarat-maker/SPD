"use client";

import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { PartnerPermission, RoleId } from "@/lib/types";
import { partnerAdminOnly, partnerDelegable } from "@/lib/demo/reference";
import { invitePartnerUser, listTeam, setPartnerUserStatus, updatePartnerUser, type TeamMember } from "@/lib/services/partnerAccount";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextField } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { AuditList } from "@/components/portal/AuditTimeline";
import { ConfirmDialog } from "@/components/portal/ConfirmDialog";
import { Gate, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const roles: RoleId[] = ["partner_staff", "partner_admin"];

interface Draft {
  name: string;
  email: string;
  title: string;
  role: RoleId;
  permissions: PartnerPermission[];
  interventionIds: string[];
}

export function TeamView() {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(listTeam);
  const [editing, setEditing] = useState<TeamMember | "new" | null>(null);
  const [statusChange, setStatusChange] = useState<{ member: TeamMember; to: "active" | "deactivated" } | null>(null);

  return (
    <>
      <PageHeader title={t("partner.team.title")} intro={t("partner.team.intro")} />
      <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
        {() => {
          const d = q.data!;
          return (
            <div className={portal.stack}>
              <Notice tone="info">{t("partner.team.boundaries")}</Notice>
              <Section
                title={t("partner.team.members")}
                actions={
                  d.canManage &&
                  editing === null && (
                    <Button size="sm" icon="userPlus" onClick={() => setEditing("new")}>
                      {t("partner.team.invite")}
                    </Button>
                  )
                }
              >
                {editing && <MemberForm member={editing === "new" ? undefined : editing} interventions={d.interventions} onClose={() => setEditing(null)} />}
                <div className={portal.tableScroll} role="region" aria-label={t("partner.team.members")} tabIndex={0}>
                  <table className={portal.table} style={{ minWidth: 820 }}>
                    <thead>
                      <tr>
                        <th scope="col">{t("partner.team.name")}</th>
                        <th scope="col">{t("partner.team.role")}</th>
                        <th scope="col">{t("partner.team.permissions")}</th>
                        <th scope="col">{t("partner.team.interventions")}</th>
                        <th scope="col">{t("partner.proposals.status")}</th>
                        {d.canManage && <th scope="col">{t("partner.common.action")}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {d.members.map((m) => (
                        <tr key={m.id}>
                          <th scope="row">
                            <span className={portal.recordLink}>{m.name}</span>
                            <span className={portal.ref}>
                              {m.title ?? "—"} · {m.email}
                              {m.id === d.me && ` · ${t("partner.team.you")}`}
                            </span>
                          </th>
                          <td>{t(`portal.roles.${m.role}` as MessageKey)}</td>
                          <td>
                            <span className={portal.small}>{m.permissionsEffective.map((p) => t(`partner.permissions.${p.replace(".", "_")}` as MessageKey)).join(", ") || "—"}</span>
                          </td>
                          <td>
                            <span className={portal.small}>{m.role === "partner_admin" ? t("partner.workspace.allInterventions") : d.interventions.filter((i) => (m.interventionIds ?? []).includes(i.id)).map((i) => i.ref).join(", ") || "—"}</span>
                          </td>
                          <td>
                            <StatusBadge entity="user" status={m.status} />
                            {m.invitedAt && m.status === "invited" && <span className={portal.ref}>{t("partner.team.invitedOn", { date: formatDate(m.invitedAt) })}</span>}
                          </td>
                          {d.canManage && (
                            <td>
                              {m.id === d.me ? (
                                <span className={`${portal.small} ${portal.muted}`}>{t("partner.team.selfNote")}</span>
                              ) : (
                                <span className={portal.buttonRow}>
                                  <Button size="sm" variant="secondary" icon="pen" disabled={editing !== null} aria-label={`${t("partner.team.edit")}: ${m.name}`} onClick={() => setEditing(m)}>
                                    {t("partner.team.edit")}
                                  </Button>
                                  {m.status === "deactivated" ? (
                                    <Button size="sm" variant="ghost" icon="refresh" aria-label={`${t("partner.team.reactivate")}: ${m.name}`} onClick={() => setStatusChange({ member: m, to: "active" })}>
                                      {t("partner.team.reactivate")}
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="ghost" icon="minusCircle" aria-label={`${t("partner.team.deactivate")}: ${m.name}`} onClick={() => setStatusChange({ member: m, to: "deactivated" })}>
                                      {t("partner.team.deactivate")}
                                    </Button>
                                  )}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={`${portal.small} ${portal.muted}`}>{t("partner.team.adminOnly", { list: partnerAdminOnly.map((p) => t(`partner.permissions.${p.replace(".", "_")}` as MessageKey)).join(", ") })}</p>
              </Section>

              {d.history.length > 0 && (
                <Section title={t("partner.team.activity")}>
                  <p className={`${portal.small} ${portal.muted}`}>{t("partner.team.activityHint")}</p>
                  <AuditList entries={d.history} emptyLabel={t("portal.detail.timelineEmpty")} />
                </Section>
              )}

              <ConfirmDialog
                open={Boolean(statusChange)}
                title={statusChange ? `${statusChange.to === "active" ? t("partner.team.reactivate") : t("partner.team.deactivate")}: ${statusChange.member.name}` : ""}
                body={statusChange?.to === "deactivated" ? <p className={portal.small}>{t("partner.team.deactivateHint")}</p> : undefined}
                confirmLabel={statusChange?.to === "active" ? t("partner.team.reactivate") : t("partner.team.deactivate")}
                danger={statusChange?.to === "deactivated"}
                onClose={() => setStatusChange(null)}
                onConfirm={(reason) => setPartnerUserStatus(statusChange!.member.id, statusChange!.to, reason)}
              />
            </div>
          );
        }}
      </Gate>
    </>
  );
}

function MemberForm({ member, interventions, onClose }: { member?: TeamMember; interventions: { id: string; ref: string; title: string }[]; onClose: () => void }) {
  const { t } = useI18n();
  const fid = useId();
  const [draft, setDraft] = useState<Draft>({
    name: member?.name ?? "",
    email: member?.email ?? "",
    title: member?.title ?? "",
    role: member?.role ?? "partner_staff",
    permissions: (member?.partnerPermissions ?? ["fieldReports.submit"]).filter((p) => partnerDelegable.includes(p)),
    interventionIds: member?.interventionIds ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const action = useServiceAction();
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    const e: Record<string, string> = {};
    if (!member) {
      if (!draft.name.trim()) e.name = t("portal.validation.required");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) e.email = t("partner.team.emailInvalid");
    }
    if (!draft.title.trim()) e.title = t("portal.validation.required");
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await action.run(
      "save",
      () => (member ? updatePartnerUser(member.id, { title: draft.title, role: draft.role, permissions: draft.permissions, interventionIds: draft.interventionIds }) : invitePartnerUser(draft)),
      member ? t("partner.team.updated") : t("partner.team.invited"),
    );
    if (ok) onClose();
  }

  return (
    <div className={portal.stack}>
      <h3 className={portal.subheading}>{member ? `${t("partner.team.edit")}: ${member.name}` : t("partner.team.invite")}</h3>
      <div className={styles.formGrid}>
        {!member && (
          <>
            <TextField id={`${fid}-name`} label={t("partner.team.name")} requiredLabel={t("common.requiredMarker")} value={draft.name} error={errors.name} onChange={(e) => set({ name: e.target.value })} />
            <TextField id={`${fid}-email`} type="email" label={t("partner.team.email")} requiredLabel={t("common.requiredMarker")} value={draft.email} error={errors.email} onChange={(e) => set({ email: e.target.value })} />
          </>
        )}
        <TextField id={`${fid}-title`} label={t("partner.team.jobTitle")} requiredLabel={t("common.requiredMarker")} value={draft.title} error={errors.title} onChange={(e) => set({ title: e.target.value })} />
        <SelectField id={`${fid}-role`} label={t("partner.team.role")} hint={t("partner.team.roleHint")} value={draft.role} onChange={(e) => set({ role: e.target.value as RoleId })}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {t(`portal.roles.${r}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <fieldset className={`${styles.fieldset} ${styles.wide}`}>
          <legend className={styles.legend}>{t("partner.team.permissions")}</legend>
          <p className={`${portal.small} ${portal.muted}`}>{t("partner.team.permissionsHint")}</p>
          <div className={styles.checkGrid}>
            {partnerDelegable.map((p) => (
              <label key={p} className={portal.checkRow}>
                <input type="checkbox" checked={draft.permissions.includes(p)} onChange={(e) => set({ permissions: e.target.checked ? [...draft.permissions, p] : draft.permissions.filter((x) => x !== p) })} />
                {t(`partner.permissions.${p.replace(".", "_")}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
        {draft.role === "partner_staff" && (
          <fieldset className={`${styles.fieldset} ${styles.wide}`}>
            <legend className={styles.legend}>{t("partner.team.interventions")}</legend>
            {interventions.length === 0 ? (
              <p className={portal.muted}>{t("partner.team.noInterventions")}</p>
            ) : (
              <div className={styles.checkGrid}>
                {interventions.map((i) => (
                  <label key={i.id} className={portal.checkRow}>
                    <input type="checkbox" checked={draft.interventionIds.includes(i.id)} onChange={(e) => set({ interventionIds: e.target.checked ? [...draft.interventionIds, i.id] : draft.interventionIds.filter((x) => x !== i.id) })} />
                    {i.ref} {i.title}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
      </div>
      {!member && (
        <p className={portal.small}>
          <Badge tone="simulated">{t("common.simulated")}</Badge> {t("partner.team.inviteSimulated")}
        </p>
      )}
      <div className={portal.buttonRow}>
        <Button icon={member ? "check" : "userPlus"} disabled={Boolean(action.pending)} onClick={save}>
          {action.pending ? t("common.loading") : member ? t("partner.team.save") : t("partner.team.sendInvite")}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </div>
      {action.error && (
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      )}
    </div>
  );
}
