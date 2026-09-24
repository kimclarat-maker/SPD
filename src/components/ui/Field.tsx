import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon";
import styles from "./Field.module.css";

type FieldShellProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  requiredLabel?: string;
  children: ReactNode;
  after?: ReactNode;
};

/** Label, hint, and error wiring shared by every input. */
export function FieldShell({ id, label, hint, error, requiredLabel, children, after }: FieldShellProps) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {requiredLabel && <span className={styles.required}> {requiredLabel}</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          <Icon name="alertCircle" size={16} />
          <span>{error}</span>
        </p>
      )}
      <div className={styles.control}>
        {children}
        {after}
      </div>
    </div>
  );
}

export function describedBy(id: string, hint?: ReactNode, error?: string) {
  return [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

type TextFieldProps = Omit<FieldShellProps, "children"> &
  InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function TextField({ id, label, hint, error, requiredLabel, after, className, ref, ...input }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} requiredLabel={requiredLabel} after={after}>
      <input
        ref={ref}
        id={id}
        className={`${styles.input} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldShell>
  );
}

type SelectFieldProps = Omit<FieldShellProps, "children"> &
  SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode; ref?: Ref<HTMLSelectElement> };

export function SelectField({ id, label, hint, error, requiredLabel, children, ref, ...select }: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} requiredLabel={requiredLabel}>
      <select
        ref={ref}
        id={id}
        className={`${styles.input} ${styles.select}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type TextAreaFieldProps = Omit<FieldShellProps, "children"> &
  TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function TextAreaField({ id, label, hint, error, requiredLabel, ref, ...textarea }: TextAreaFieldProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} requiredLabel={requiredLabel}>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        className={`${styles.input} ${styles.textarea}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...textarea}
      />
    </FieldShell>
  );
}
