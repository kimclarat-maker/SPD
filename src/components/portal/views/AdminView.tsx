"use client";

import { useCallback, useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { ApprovalRoute, GeoScope, IndicatorDef, NotificationTemplate, RoleId, SecuritySettings, Sector, UserAccount } from "@/lib/types";
import {
  addSettlement,
  getAdminData,
  getSecuritySettings,
  inviteUser,
  renameSector,
  saveApprovalRoute,
  saveIndicator,
  saveSecuritySettings,
  saveTemplate,
  setIndicatorActive,
  setSectorActive,
  setSettlementActive,
  setUserStatus,
  updateUserAccess,
} from "@/lib/services/admin";
import { allPermissions, plannedRoles, rolePermissions, sectorIds } from "@/lib/demo/reference";
import { getSession } from "@/lib/services/session";
import { useCan, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState, Section } from "@/components/portal/PageHeader";
import { PageTabs } from "@/components/portal/RecordPage";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { PermissionDenied } from "@/components/portal/RecordBits";
import { ConfirmDialog } from "@/components/portal/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import styles from "@/components/portal/portal.module.css";

const roles: RoleId[] = ["opm_coordinator", "me_officer", "system_admin", "partner_focal", "field_officer", "field_supervisor", "caseworker"];
const tabs = ["users", "roles", "reference", "indicators", "routes", "templates", "security"] as const;
type Tab = (typeof tabs)[number];

type Pending = { title: string; body?: React.ReactNode; confirmLabel: string; danger?: boolean; fields?: React.ReactNode; validate?: () => boolean; run: (reason: string) => Promise<unknown> } | null;

function ScopeEditor({ value, onChange, idPrefix, error }: { value: GeoScope; onChange: (s: GeoScope) => void; idPrefix: string; error?: string }) {
  const { t } = useI18n();
  const { data } = useServiceQuery(getAdminData);
  const regions = [...new Set((data?.settlements ?? []).map((s) => s.region))].sort();
  const options = value.level === "region" ? regions.map((r) => ({ id: r, name: r })) : (data?.settlements ?? []).map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className={styles.stack}>
      <SelectField id={`${idPrefix}-lvl`} label={t("portal.admin.scopeLevel")} value={value.level} onChange={(e) => onChange({ level: e.target.value as GeoScope["level"], ids: [] })}>
        {(["national", "region", "settlement"] as const).map((l) => (
          <option key={l} value={l}>
            {t(`portal.admin.scopeLevels.${l}` as MessageKey)}
          </option>
        ))}
      </SelectField>
      {value.level !== "national" && (
        <fieldset className={styles.checkGroup}>
          <legend className={styles.subheading}>{t("portal.admin.scopeAreas")}</legend>
          {error && <p className={styles.fieldError}>{error}</p>}
          <div className={styles.checkColumns}>
            {options.map((o) => (
              <label key={o.id} className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={value.ids.includes(o.id)}
                  onChange={(e) => onChange({ ...value, ids: e.target.checked ? [...value.ids, o.id] : value.ids.filter((x) => x !== o.id) })}
                />
                <span>{o.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function AdminView({ initialTab }: { initialTab?: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const id = useId();
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>(tabs.includes(initialTab as Tab) ? (initialTab as Tab) : "users");
  const { data } = useServiceQuery(getAdminData);
  const [pending, setPending] = useState<Pending>(null);
  const [invite, setInvite] = useState<{ name: string; email: string; role: RoleId; scope: GeoScope }>({ name: "", email: "", role: "opm_coordinator", scope: { level: "national", ids: [] } });
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [draftAccess, setDraftAccess] = useState<{ role: RoleId; scope: GeoScope } | null>(null);
  const [accessError, setAccessError] = useState<string>();
  const [newSettlement, setNewSettlement] = useState({ name: "", district: "", region: "", lat: "", lng: "" });
  const [indicatorDraft, setIndicatorDraft] = useState<Omit<IndicatorDef, "id" | "active"> & { id?: string }>({ code: "", name: "", unit: "", sector: "health", target: 0, frequency: "monthly" });
  const [routeDrafts, setRouteDrafts] = useState<Record<string, string>>({});
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, Pick<NotificationTemplate, "subject" | "body" | "active">>>({});
  const [sectorNames, setSectorNames] = useState<Record<string, string>>({});
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [formError, setFormError] = useState<string>();
  const me = getSession()?.userId;

  const canUsers = can("admin.users");
  const canReference = can("admin.reference");
  const canSecurity = can("admin.security");
  const { data: securityData } = useServiceQuery(() => (canSecurity ? getSecuritySettings() : Promise.resolve(null)), [canSecurity]);

  const selectTab = useCallback(
    (next: string) => {
      setTab(next as Tab);
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
    },
    [router, pathname],
  );

  if (!canUsers && !canReference && !canSecurity) {
    return (
      <>
        <PageHeader title={t("portal.admin.title")} />
        <PermissionDenied />
      </>
    );
  }
  if (!data) return <LoadingState label={t("common.loading")} />;

  const confirm = (p: NonNullable<Pending>) => {
    setFormError(undefined);
    setPending(p);
  };

  const users = (
    <div className={styles.stack}>
      {!canUsers ? (
        <PermissionDenied />
      ) : (
        <>
          <div className={styles.tableScroll} role="region" aria-label={t("portal.admin.users")} tabIndex={0}>
            <table className={`${styles.table} ${styles.tableCompact}`}>
              <caption className="visually-hidden">{t("portal.admin.users")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("portal.admin.name")}</th>
                  <th scope="col">{t("portal.admin.role")}</th>
                  <th scope="col">{t("portal.admin.scope")}</th>
                  <th scope="col">{t("portal.table.status")}</th>
                  <th scope="col">{t("portal.admin.lastActive")}</th>
                  <th scope="col">{t("portal.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u: UserAccount) => (
                  <tr key={u.id}>
                    <th scope="row">
                      {u.name}
                      <span className={styles.ref}>{u.email}</span>
                    </th>
                    <td>
                      {t(`portal.roles.${u.role}` as MessageKey)}
                      {plannedRoles.includes(u.role) && <span className={styles.ref}>{t("portal.admin.plannedPortal")}</span>}
                    </td>
                    <td>{u.scope.level === "national" ? t("portal.scope.national") : `${t(`portal.admin.scopeLevels.${u.scope.level}` as MessageKey)}: ${u.scope.ids.join(", ")}`}</td>
                    <td>
                      <StatusBadge entity="user" status={u.status} />
                    </td>
                    <td>{u.lastActiveAt ? formatDate(u.lastActiveAt) : u.invitedAt ? t("portal.admin.invitedOn", { date: formatDate(u.invitedAt) }) : "—"}</td>
                    <td>
                      {u.id === me ? (
                        <span className={styles.muted}>{t("portal.admin.you")}</span>
                      ) : (
                        <span className={styles.buttonRow}>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="key"
                            aria-label={`${t("portal.admin.changeAccess")}: ${u.name}`}
                            onClick={() => {
                              const initial = { role: u.role, scope: u.scope };
                              setDraftAccessBoth(initial);
                              setAccessError(undefined);
                              confirm({
                                title: `${t("portal.admin.changeAccess")}: ${u.name}`,
                                confirmLabel: t("portal.admin.saveAccess"),
                                run: (reason) => {
                                  const current = draftAccessRef.current ?? initial;
                                  return updateUserAccess(u.id, current.role, current.scope, reason);
                                },
                              });
                            }}
                          >
                            {t("portal.admin.changeAccess")}
                          </Button>
                          {u.status === "deactivated" ? (
                            <Button size="sm" variant="ghost" icon="refresh" aria-label={`${t("portal.admin.reactivate")}: ${u.name}`} onClick={() => confirm({ title: `${t("portal.admin.reactivate")}: ${u.name}`, confirmLabel: t("portal.admin.reactivate"), run: (r) => setUserStatus(u.id, "active", r) })}>
                              {t("portal.admin.reactivate")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="minusCircle"
                              aria-label={`${t("portal.admin.deactivate")}: ${u.name}`}
                              onClick={() => confirm({ title: `${t("portal.admin.deactivate")}: ${u.name}`, body: <p>{t("portal.admin.deactivateBody")}</p>, confirmLabel: t("portal.admin.deactivate"), danger: true, run: (r) => setUserStatus(u.id, "deactivated", r) })}
                            >
                              {t("portal.admin.deactivate")}
                            </Button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Section title={t("portal.admin.invite")}>
            <form
              className={styles.inlineGrid}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const errs: Record<string, string> = {};
                if (!invite.name.trim()) errs.name = t("portal.validation.required");
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(invite.email.trim())) errs.email = t("portal.validation.email");
                if (invite.scope.level !== "national" && invite.scope.ids.length === 0) errs.scope = t("portal.validation.chooseOne");
                setInviteErrors(errs);
                if (Object.keys(errs).length) return;
                confirm({
                  title: t("portal.admin.inviteConfirm", { name: invite.name }),
                  body: <p>{t("portal.admin.inviteBody", { role: t(`portal.roles.${invite.role}` as MessageKey) })}</p>,
                  confirmLabel: t("portal.admin.sendInvite"),
                  run: async (r) => {
                    await inviteUser(invite, r);
                    setInvite({ name: "", email: "", role: "opm_coordinator", scope: { level: "national", ids: [] } });
                  },
                });
              }}
            >
              <TextField id={`${id}-in`} label={t("portal.admin.name")} value={invite.name} error={inviteErrors.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              <TextField id={`${id}-ie`} type="email" label={t("portal.admin.email")} value={invite.email} error={inviteErrors.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              <SelectField id={`${id}-ir`} label={t("portal.admin.role")} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as RoleId })}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {t(`portal.roles.${r}` as MessageKey)}
                    {plannedRoles.includes(r) ? ` — ${t("portal.admin.plannedPortal")}` : ""}
                  </option>
                ))}
              </SelectField>
              <ScopeEditor idPrefix={`${id}-is`} value={invite.scope} error={inviteErrors.scope} onChange={(scope) => setInvite({ ...invite, scope })} />
              <div>
                <Button type="submit" icon="userPlus">
                  {t("portal.admin.invite")}
                </Button>
              </div>
            </form>
          </Section>
        </>
      )}
    </div>
  );

  const rolesTab = (
    <div className={styles.stack}>
      <p className={`${styles.small} ${styles.muted}`}>{t("portal.admin.rolesIntro")}</p>
      <div className={styles.tableScroll} role="region" aria-label={t("portal.admin.rolesTab")} tabIndex={0}>
        <table className={`${styles.table} ${styles.tableCompact} ${styles.matrix}`}>
          <caption className="visually-hidden">{t("portal.admin.rolesTab")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("portal.admin.permission")}</th>
              {roles.map((r) => (
                <th key={r} scope="col">
                  {t(`portal.roles.${r}` as MessageKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPermissions.map((p) => (
              <tr key={p}>
                <th scope="row">
                  {t(`portal.permissions.${p.replace(".", "_")}` as MessageKey)}
                  <span className={styles.ref}>{p}</span>
                </th>
                {roles.map((r) => (
                  <td key={r} className={styles.center}>
                    {rolePermissions[r].includes(p) ? <Icon name="check" size={16} label={t("common.yes")} /> : <span className={styles.muted} aria-label={t("common.no")}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${styles.small} ${styles.muted}`}>{t("portal.admin.caseAccessNote")}</p>
    </div>
  );

  const reference = !canReference ? (
    <PermissionDenied />
  ) : (
    <div className={styles.stack}>
      <Section title={t("portal.admin.sectors")}>
        <ul className={styles.rowList}>
          {data.sectors.map((s) => (
            <li key={s.id} className={styles.rowItem}>
              <span className={styles.rowMain}>
                <label htmlFor={`${id}-sec-${s.id}`} className="visually-hidden">
                  {t("portal.admin.sectorName")}
                </label>
                <input id={`${id}-sec-${s.id}`} className={styles.inlineInput} value={sectorNames[s.id] ?? s.name} onChange={(e) => setSectorNames({ ...sectorNames, [s.id]: e.target.value })} />
              </span>
              <Badge tone={s.active ? "success" : "neutral"}>{s.active ? t("portal.admin.active") : t("portal.admin.inactive")}</Badge>
              <span className={styles.buttonRow}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!sectorNames[s.id] || sectorNames[s.id] === s.name}
                  onClick={() => confirm({ title: t("portal.admin.renameConfirm", { name: s.name }), confirmLabel: t("common.save"), run: (r) => renameSector(s.id, sectorNames[s.id], r) })}
                >
                  {t("common.save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm({ title: `${s.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate")}: ${s.name}`, body: s.active ? <p>{t("portal.admin.deactivateReference")}</p> : undefined, confirmLabel: s.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate"), danger: s.active, run: (r) => setSectorActive(s.id, !s.active, r) })}>
                  {s.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t("portal.admin.settlements")}>
        <ul className={styles.rowList}>
          {data.settlements.map((s) => (
            <li key={s.id} className={styles.rowItem}>
              <span className={styles.rowMain}>
                <span>{s.name}</span>
                <span className={styles.ref}>
                  {s.district} · {s.region} · {s.lat.toFixed(3)}, {s.lng.toFixed(3)}
                </span>
              </span>
              <Badge tone={s.active ? "success" : "neutral"}>{s.active ? t("portal.admin.active") : t("portal.admin.inactive")}</Badge>
              <Button size="sm" variant="ghost" onClick={() => confirm({ title: `${s.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate")}: ${s.name}`, body: s.active ? <p>{t("portal.admin.deactivateReference")}</p> : undefined, confirmLabel: s.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate"), danger: s.active, run: (r) => setSettlementActive(s.id, !s.active, r) })}>
                {s.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate")}
              </Button>
            </li>
          ))}
        </ul>
        <form
          className={styles.inlineGrid}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const lat = Number(newSettlement.lat);
            const lng = Number(newSettlement.lng);
            if (!newSettlement.name.trim() || !newSettlement.district.trim() || !newSettlement.region.trim() || !newSettlement.lat || !newSettlement.lng || Number.isNaN(lat) || Number.isNaN(lng)) {
              setFormError(t("portal.validation.allRequired"));
              return;
            }
            setFormError(undefined);
            confirm({
              title: t("portal.admin.addSettlementConfirm", { name: newSettlement.name }),
              confirmLabel: t("portal.admin.addSettlement"),
              run: async (r) => {
                await addSettlement({ name: newSettlement.name, district: newSettlement.district, region: newSettlement.region, lat, lng }, r);
                setNewSettlement({ name: "", district: "", region: "", lat: "", lng: "" });
              },
            });
          }}
        >
          <p className={styles.subheading}>{t("portal.admin.addSettlement")}</p>
          <TextField id={`${id}-sn`} label={t("portal.admin.name")} value={newSettlement.name} onChange={(e) => setNewSettlement({ ...newSettlement, name: e.target.value })} />
          <TextField id={`${id}-sd`} label={t("portal.filters.district")} value={newSettlement.district} onChange={(e) => setNewSettlement({ ...newSettlement, district: e.target.value })} />
          <TextField id={`${id}-sr`} label={t("portal.admin.region")} value={newSettlement.region} onChange={(e) => setNewSettlement({ ...newSettlement, region: e.target.value })} />
          <TextField id={`${id}-sla`} label={t("portal.admin.latitude")} inputMode="decimal" value={newSettlement.lat} onChange={(e) => setNewSettlement({ ...newSettlement, lat: e.target.value })} />
          <TextField id={`${id}-slo`} label={t("portal.admin.longitude")} inputMode="decimal" value={newSettlement.lng} onChange={(e) => setNewSettlement({ ...newSettlement, lng: e.target.value })} />
          {formError && <p className={styles.fieldError} role="alert">{formError}</p>}
          <p className={`${styles.small} ${styles.muted}`}>{t("portal.admin.settlementNote")}</p>
          <div>
            <Button type="submit" variant="secondary" icon="plus">
              {t("portal.admin.addSettlement")}
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );

  const indicators = !canReference ? (
    <PermissionDenied />
  ) : (
    <div className={styles.stack}>
      <ul className={styles.rowList}>
        {data.indicators.map((i) => (
          <li key={i.id} className={styles.rowItem}>
            <span className={styles.rowMain}>
              <span>
                <strong>{i.code}</strong> {i.name}
              </span>
              <span className={styles.ref}>
                {i.unit} · {t("portal.admin.targetValue", { target: formatNumber(i.target) })} · {t(`portal.surveys.frequency.${i.frequency}` as MessageKey)}
              </span>
            </span>
            <StatusBadge entity="indicator" status={i.active ? "active" : "inactive"} />
            <span className={styles.buttonRow}>
              <Button size="sm" variant="secondary" icon="pen" onClick={() => setIndicatorDraft({ id: i.id, code: i.code, name: i.name, unit: i.unit, sector: i.sector, target: i.target, frequency: i.frequency })}>
                {t("portal.admin.edit")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => confirm({ title: `${i.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate")}: ${i.code}`, confirmLabel: i.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate"), danger: i.active, run: (r) => setIndicatorActive(i.id, !i.active, r) })}>
                {i.active ? t("portal.admin.deactivate") : t("portal.admin.reactivate")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <Section title={indicatorDraft.id ? t("portal.admin.editIndicator", { code: indicatorDraft.code }) : t("portal.admin.addIndicator")}>
        <form
          className={styles.inlineGrid}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!indicatorDraft.code.trim() || !indicatorDraft.name.trim() || !indicatorDraft.unit.trim() || !(indicatorDraft.target > 0)) {
              setFormError(t("portal.validation.allRequired"));
              return;
            }
            setFormError(undefined);
            confirm({
              title: indicatorDraft.id ? t("portal.admin.editIndicator", { code: indicatorDraft.code }) : t("portal.admin.addIndicator"),
              body: indicatorDraft.id ? <p>{t("portal.admin.indicatorChangeBody")}</p> : undefined,
              confirmLabel: t("common.save"),
              run: async (r) => {
                await saveIndicator(indicatorDraft, r);
                setIndicatorDraft({ code: "", name: "", unit: "", sector: "health", target: 0, frequency: "monthly" });
              },
            });
          }}
        >
          <TextField id={`${id}-ic`} label={t("portal.admin.code")} value={indicatorDraft.code} onChange={(e) => setIndicatorDraft({ ...indicatorDraft, code: e.target.value })} />
          <TextField id={`${id}-inm`} label={t("portal.admin.name")} value={indicatorDraft.name} onChange={(e) => setIndicatorDraft({ ...indicatorDraft, name: e.target.value })} />
          <TextField id={`${id}-iu`} label={t("portal.admin.unit")} value={indicatorDraft.unit} onChange={(e) => setIndicatorDraft({ ...indicatorDraft, unit: e.target.value })} />
          <TextField id={`${id}-it`} type="number" min={1} label={t("portal.surveys.target")} value={indicatorDraft.target || ""} onChange={(e) => setIndicatorDraft({ ...indicatorDraft, target: Number(e.target.value) })} />
          <SelectField id={`${id}-is`} label={t("portal.filters.sector")} value={indicatorDraft.sector} onChange={(e) => setIndicatorDraft({ ...indicatorDraft, sector: e.target.value as Sector })}>
            {sectorIds.map((s) => (
              <option key={s} value={s}>
                {data.sectors.find((x) => x.id === s)?.name ?? s}
              </option>
            ))}
          </SelectField>
          <SelectField id={`${id}-if`} label={t("portal.admin.frequency")} value={indicatorDraft.frequency} onChange={(e) => setIndicatorDraft({ ...indicatorDraft, frequency: e.target.value as IndicatorDef["frequency"] })}>
            <option value="monthly">{t("portal.surveys.frequency.monthly")}</option>
            <option value="quarterly">{t("portal.surveys.frequency.quarterly")}</option>
          </SelectField>
          {formError && <p className={styles.fieldError} role="alert">{formError}</p>}
          <div className={styles.buttonRow}>
            <Button type="submit" icon="check">
              {t("common.save")}
            </Button>
            {indicatorDraft.id && (
              <Button variant="ghost" onClick={() => setIndicatorDraft({ code: "", name: "", unit: "", sector: "health", target: 0, frequency: "monthly" })}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </form>
      </Section>
    </div>
  );

  const routes = !canReference ? (
    <PermissionDenied />
  ) : (
    <div className={styles.stack}>
      <p className={`${styles.small} ${styles.muted}`}>{t("portal.admin.routesIntro")}</p>
      {data.approvalRoutes.map((r: ApprovalRoute) => (
        <Section key={r.id} title={r.name}>
          <TextAreaField
            id={`${id}-route-${r.id}`}
            label={t("portal.admin.routeSteps")}
            hint={t("portal.admin.routeStepsHint")}
            rows={Math.max(3, r.steps.length + 1)}
            value={routeDrafts[r.id] ?? r.steps.join("\n")}
            onChange={(e) => setRouteDrafts({ ...routeDrafts, [r.id]: e.target.value })}
          />
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon="check"
              disabled={routeDrafts[r.id] === undefined || routeDrafts[r.id] === r.steps.join("\n")}
              onClick={() => confirm({ title: t("portal.admin.saveRoute", { name: r.name }), body: <p>{t("portal.admin.routeBody")}</p>, confirmLabel: t("common.save"), run: (reason) => saveApprovalRoute(r.id, (routeDrafts[r.id] ?? "").split("\n"), reason) })}
            >
              {t("common.save")}
            </Button>
          </div>
        </Section>
      ))}
    </div>
  );

  const templates = !canReference ? (
    <PermissionDenied />
  ) : (
    <div className={styles.stack}>
      {data.templates.map((tpl) => {
        const d = templateDrafts[tpl.id] ?? { subject: tpl.subject, body: tpl.body, active: tpl.active };
        const changed = d.subject !== tpl.subject || d.body !== tpl.body || d.active !== tpl.active;
        return (
          <Section key={tpl.id} title={tpl.name} actions={<Badge tone="neutral">{t(`portal.admin.channels.${tpl.channel}` as MessageKey)}</Badge>}>
            {tpl.channel !== "sms" && <TextField id={`${id}-ts-${tpl.id}`} label={t("portal.admin.subject")} value={d.subject} onChange={(e) => setTemplateDrafts({ ...templateDrafts, [tpl.id]: { ...d, subject: e.target.value } })} />}
            <TextAreaField id={`${id}-tb-${tpl.id}`} label={t("portal.admin.body")} hint={t("portal.admin.placeholders")} value={d.body} onChange={(e) => setTemplateDrafts({ ...templateDrafts, [tpl.id]: { ...d, body: e.target.value } })} />
            <label className={styles.checkRow}>
              <input type="checkbox" checked={d.active} onChange={(e) => setTemplateDrafts({ ...templateDrafts, [tpl.id]: { ...d, active: e.target.checked } })} />
              <span>{t("portal.admin.active")}</span>
            </label>
            <div>
              <Button size="sm" variant="secondary" icon="check" disabled={!changed} onClick={() => confirm({ title: t("portal.admin.saveTemplate", { name: tpl.name }), confirmLabel: t("common.save"), run: (r) => saveTemplate(tpl.id, d, r) })}>
                {t("common.save")}
              </Button>
            </div>
          </Section>
        );
      })}
    </div>
  );

  const current = security ?? securityData ?? null;
  const securityTab = !canSecurity ? (
    <PermissionDenied title={t("portal.admin.securityDeniedTitle")} body={t("portal.admin.securityDenied")} />
  ) : !current ? (
    <LoadingState label={t("common.loading")} />
  ) : (
    <Section title={t("portal.admin.securityTab")}>
      <TextField id={`${id}-sec-t`} type="number" min={5} max={240} label={t("portal.admin.sessionTimeout")} value={current.sessionTimeoutMinutes} onChange={(e) => setSecurity({ ...current, sessionTimeoutMinutes: Number(e.target.value) })} />
      <label className={styles.checkRow}>
        <input type="checkbox" checked={current.mfaRequired} onChange={(e) => setSecurity({ ...current, mfaRequired: e.target.checked })} />
        <span>{t("portal.admin.mfa")}</span>
      </label>
      <label className={styles.checkRow}>
        <input type="checkbox" checked={current.exportWatermark} onChange={(e) => setSecurity({ ...current, exportWatermark: e.target.checked })} />
        <span>{t("portal.admin.watermark")}</span>
      </label>
      <TextAreaField id={`${id}-sec-ip`} label={t("portal.admin.ipAllowlist")} value={current.ipAllowlist} onChange={(e) => setSecurity({ ...current, ipAllowlist: e.target.value })} />
      <div>
        <Button icon="check" onClick={() => confirm({ title: t("portal.admin.saveSecurity"), confirmLabel: t("common.save"), danger: true, run: (r) => saveSecuritySettings(current, r) })}>
          {t("common.save")}
        </Button>
      </div>
    </Section>
  );

  return (
    <>
      <PageHeader title={t("portal.admin.title")} intro={t("portal.admin.intro")} />
      <PageTabs
        label={t("portal.admin.title")}
        active={tab}
        onChange={selectTab}
        tabs={[
          { id: "users", label: t("portal.admin.users"), content: users },
          { id: "roles", label: t("portal.admin.rolesTab"), content: rolesTab },
          { id: "reference", label: t("portal.admin.reference"), content: reference },
          { id: "indicators", label: t("portal.admin.indicators"), content: indicators },
          { id: "routes", label: t("portal.admin.routes"), content: routes },
          { id: "templates", label: t("portal.admin.templates"), content: templates },
          { id: "security", label: t("portal.admin.securityTab"), content: securityTab },
        ]}
      />
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title ?? ""}
        body={pending?.body}
        confirmLabel={pending?.confirmLabel ?? t("common.confirm")}
        danger={pending?.danger}
        onClose={() => {
          setPending(null);
          setDraftAccess(null);
        }}
        validate={() => {
          if (draftAccess && draftAccess.scope.level !== "national" && draftAccess.scope.ids.length === 0) {
            setAccessError(t("portal.validation.chooseOne"));
            return false;
          }
          return true;
        }}
        onConfirm={(reason) => pending!.run(reason)}
      >
        {draftAccess && (
          <>
            <SelectField id={`${id}-ar`} label={t("portal.admin.role")} value={draftAccess.role} onChange={(e) => setDraftAccessBoth({ ...draftAccess, role: e.target.value as RoleId })}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`portal.roles.${r}` as MessageKey)}
                </option>
              ))}
            </SelectField>
            <ScopeEditor idPrefix={`${id}-as`} value={draftAccess.scope} error={accessError} onChange={(scope) => setDraftAccessBoth({ ...draftAccess, scope })} />
          </>
        )}
      </ConfirmDialog>
    </>
  );

  function setDraftAccessBoth(next: { role: RoleId; scope: GeoScope }) {
    draftAccessRef.current = next;
    setDraftAccess(next);
    setAccessError(undefined);
  }
}

/** Latest role/scope choice in the access dialog, read when the change is confirmed. */
const draftAccessRef: { current: { role: RoleId; scope: GeoScope } | null } = { current: null };
