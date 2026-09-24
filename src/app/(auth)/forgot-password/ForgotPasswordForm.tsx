"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { requestPasswordReset } from "@/lib/services/session";
import styles from "../auth.module.css";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim()) {
      setError(t("auth.forgot.errorRequired"));
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    setSubmitting(true);
    await requestPasswordReset(identifier);
    router.push("/forgot-password/requested");
  }

  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{t("auth.forgot.title")}</h1>
        <p className={styles.intro}>{t("auth.forgot.intro")}</p>
      </div>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          ref={inputRef}
          id="identifier"
          name="identifier"
          label={t("auth.forgot.username")}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" size="lg" fullWidth disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
        </Button>
      </form>
      <Link href="/sign-in" className={styles.textLink}>
        <Icon name="arrowLeft" size={18} />
        &nbsp;{t("auth.forgot.backToSignIn")}
      </Link>
    </div>
  );
}
