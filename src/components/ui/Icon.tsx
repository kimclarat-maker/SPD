import type { SVGProps } from "react";

/**
 * One consistent line-icon set (24px grid, 1.75 stroke). Icons are decorative
 * by default; pass `label` when an icon carries meaning on its own.
 */
const paths = {
  menu: "M4 6h16M4 12h16M4 18h16",
  x: "M6 6l12 12M18 6L6 18",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3.6 9h16.8M3.6 15h16.8M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 18l-6-6 6-6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  checkCircle: "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12.5l2.8 2.8L16.5 9.5",
  alertTriangle: "M12 4l9 16H3l9-16zM12 10v4.5M12 17.5v.01",
  alertCircle: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7.5v5.5M12 16.5v.01",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5.5M12 7.5v.01",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3zM8.8 12.2l2.2 2.2 4.3-4.4",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 010 6.4M18.5 14.4c1.8.8 3 2.8 3 5.6",
  handshake: "M3 11l4-4 3 1 2-1.5 3 .5 3 3 3 1.5M3 11l6.5 6.5a1.6 1.6 0 002.3 0l.7-.7M21 12.5l-6.4 6.4a1.6 1.6 0 01-2.3 0M12 7.5l-2.8 2.8a1.5 1.5 0 002.1 2.1L13.5 10l4 4",
  clipboard: "M9 4h6v3H9zM9 5.5H6.5A1.5 1.5 0 005 7v12.5A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V7a1.5 1.5 0 00-1.5-1.5H15M8.5 12h7M8.5 16h5",
  map: "M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4zM9 4v14M15 6v14",
  smartphone: "M7.5 3h9A1.5 1.5 0 0118 4.5v15a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 19.5v-15A1.5 1.5 0 017.5 3zM11 17.5h2",
  fileText: "M14 3H7a1.5 1.5 0 00-1.5 1.5v15A1.5 1.5 0 007 21h10a1.5 1.5 0 001.5-1.5V7.5L14 3zM14 3v4.5h4.5M9 12.5h6M9 16h6",
  fileCheck: "M14 3H7a1.5 1.5 0 00-1.5 1.5v15A1.5 1.5 0 007 21h10a1.5 1.5 0 001.5-1.5V7.5L14 3zM14 3v4.5h4.5M9 14.5l2 2 4-4",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  inbox: "M3.5 13.5L6 5h12l2.5 8.5M3.5 13.5V19a1 1 0 001 1h15a1 1 0 001-1v-5.5M3.5 13.5H9l1 2.5h4l1-2.5h5.5",
  barChart: "M4 20h16M7 16.5V11M12 16.5V6M17 16.5v-3.5",
  history: "M3.5 12a8.5 8.5 0 102.5-6M3.5 4v4h4M12 7.5V12l3 2",
  lock: "M6.5 10.5h11a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19v-7a1.5 1.5 0 011.5-1.5zM8 10.5V7.5a4 4 0 018 0v3",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  eyeOff: "M4 4l16 16M10.6 6.2A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-2.7 3.5M6.4 7.4A15.6 15.6 0 002.5 12s3.5 6.5 9.5 6.5c1.5 0 2.9-.4 4.1-1M10 10.2a2.5 2.5 0 003.8 3.3",
  logOut: "M15 4h3.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H15M10 16.5L5.5 12 10 7.5M5.5 12H15",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  refresh: "M20 11a8 8 0 00-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0014.3 4.5L20 15.5M20 20v-4.5h-4.5",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  send: "M21 3L10 14M21 3l-6.5 18-4.5-7-7-4.5L21 3z",
  pen: "M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3zM14.5 7.5l3 3",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7.5V12l3 2",
  building: "M4 21V6.5L12 3l8 3.5V21M4 21h16M9 21v-4h6v4M8 9.5h1M11.5 9.5h1M15 9.5h1M8 13h1M11.5 13h1M15 13h1",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5",
  help: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17v.01",
  route: "M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h7.5a3 3 0 000-6h-7a3 3 0 010-6H16",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  mail: "M4 5.5h16A1.5 1.5 0 0121.5 7v10a1.5 1.5 0 01-1.5 1.5H4A1.5 1.5 0 012.5 17V7A1.5 1.5 0 014 5.5zM3 7l9 6 9-6",
  circle: "M12 4a8 8 0 100 16 8 8 0 000-16z",
  minusCircle: "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12h8",
  pauseCircle: "M12 3a9 9 0 100 18 9 9 0 000-18zM10 9v6M14 9v6",
  xCircle: "M12 3a9 9 0 100 18 9 9 0 000-18zM9 9l6 6M15 9l-6 6",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V16",
} as const;

export type IconName = keyof typeof paths;

/** Icons that point in a reading direction and must mirror in RTL layouts. */
const directional: ReadonlySet<IconName> = new Set(["chevronRight", "arrowRight", "arrowLeft", "logOut", "send"]);

type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  size?: number;
  label?: string;
};

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const classes = [directional.has(name) ? "flip-rtl" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      className={classes || undefined}
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
