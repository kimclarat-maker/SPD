"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { getSession, signIn } from "@/lib/services/session";
import { DEMO_ENABLED, demoAccount } from "@/lib/demo/config";
import styles from "../auth.module.css";

type Errors = { username?: string; password?: string };

export function SignInForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Already in a demonstration session: go straight to the portal.
  useEffect(() => {
    if (getSession()) router.replace("/portal");
  }, [router]);

  const hasErrors = Boolean(errors.username || errors.password || formError);
  useEffect(() => {
    if (hasErrors) summaryRef.current?.focus();
  }, [hasErrors, errors, formError]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Errors = {};
    if (!username.trim()) nextErrors.username = t("auth.signIn.errorUsernameRequired");
    if (!password) nextErrors.password = t("auth.signIn.errorPasswordRequired");
    setErrors(nextErrors);
    setFormError(null);
    if (nextErrors.username || nextErrors.password) return;

    setSubmitting(true);
    const result = await signIn(username, password);
    if (result.ok) {
      router.push("/portal");
      return;
    }
    setSubmitting(false);
    setPassword("");
    setFormError(result.reason === "disabled" ? t("auth.signIn.errorDemoDisabled") : t("auth.signIn.errorInvalid"));
  }

  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{t("auth.signIn.title")}</h1>
        <p className={styles.intro}>{t("auth.signIn.intro")}</p>
      </div>

      {hasErrors && (
        <div ref={summaryRef} tabIndex={-1} className={styles.errorSummary} role="alert">
          <Notice tone="error" title={t("common.errorSummary")}>
            {formError ? (
              <p>{formError}</p>
            ) : (
              <ul>
                {errors.username && (
                  <li>
                    <a href="#username">{errors.username}</a>
                  </li>
                )}
                {errors.password && (
                  <li>
                    <a href="#password">{errors.password}</a>
                  </li>
                )}
              </ul>
            )}
          </Notice>
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          id="username"
          name="username"
          label={t("auth.signIn.username")}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
          required
        />
        <TextField
          id="password"
          name="password"
          label={t("auth.signIn.password")}
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
          className={styles.passwordInput}
          after={
            <button
              type="button"
              className={styles.reveal}
              aria-controls="password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={18} />
              {showPassword ? t("auth.signIn.hidePassword") : t("auth.signIn.showPassword")}
            </button>
          }
        />
        <span className="visually-hidden" aria-live="polite">
          {showPassword ? t("auth.signIn.passwordShown") : ""}
        </span>

        <div className={styles.row}>
          <Link href="/forgot-password" className={styles.textLink}>
            {t("auth.signIn.forgot")}
          </Link>
        </div>

        <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? t("auth.signIn.submitting") : t("auth.signIn.submit")}
        </Button>
      </form>

      <Notice tone="info">{t("auth.signIn.mfaNote")}</Notice>

      {DEMO_ENABLED && demoAccount && (
        <section className={styles.demo} aria-labelledby="demo-title">
          <div className={styles.demoHead}>
            <Badge tone="simulated">{t("common.simulated")}</Badge>
            <h2 id="demo-title" style={{ fontSize: "var(--text-base)" }}>
              {t("auth.signIn.demoTitle")}
            </h2>
          </div>
          <p>{t("auth.signIn.demoBody")}</p>
          <dl className={styles.demoList}>
            <dt>{t("auth.signIn.demoUsername")}</dt>
            <dd>{demoAccount.username}</dd>
            <dt>{t("auth.signIn.demoPassword")}</dt>
            <dd>{demoAccount.password}</dd>
          </dl>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!demoAccount) return;
                setUsername(demoAccount.username);
                setPassword(demoAccount.password);
                setErrors({});
                setFormError(null);
              }}
            >
              {t("auth.signIn.demoFill")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
