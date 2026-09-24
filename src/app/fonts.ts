import { Archivo, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";

/**
 * Typography shared by the landing page and the coordinator portal:
 * Archivo for headings, Source Sans 3 for text, IBM Plex Mono for record
 * references. Latin subsets only; Arabic uses the system Arabic stack.
 */
export const displayFont = Archivo({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

export const bodyFont = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
});

export const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-mono",
});

export const brandFontVariables = `${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`;
