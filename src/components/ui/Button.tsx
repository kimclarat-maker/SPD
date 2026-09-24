import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "onDark";
type Size = "md" | "lg" | "sm";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconEnd?: IconName;
  fullWidth?: boolean;
  children: ReactNode;
  className?: string;
};

function classes({ variant = "primary", size = "md", fullWidth, className }: CommonProps) {
  return [styles.button, styles[variant], styles[size], fullWidth ? styles.full : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
}

function Content({ icon, iconEnd, children }: Pick<CommonProps, "icon" | "iconEnd" | "children">) {
  return (
    <>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
      {iconEnd && <Icon name={iconEnd} size={18} />}
    </>
  );
}

export function Button({
  variant,
  size,
  icon,
  iconEnd,
  fullWidth,
  className,
  children,
  type = "button",
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} data-button={variant ?? "primary"} className={classes({ variant, size, fullWidth, className, children })} {...rest}>
      <Content icon={icon} iconEnd={iconEnd}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  icon,
  iconEnd,
  fullWidth,
  className,
  children,
}: CommonProps & { href: string }) {
  return (
    <Link href={href} data-button={variant ?? "primary"} className={classes({ variant, size, fullWidth, className, children })}>
      <Content icon={icon} iconEnd={iconEnd}>
        {children}
      </Content>
    </Link>
  );
}
