/**
 * Design tokens as TypeScript literals, for the digest email.
 *
 * These values necessarily exist twice — here and in app/globals.css. Email clients
 * strip <style> blocks (Gmail's mobile app) and do not reliably support var()
 * (Outlook's Word rendering engine), so every style in an email must be an inline
 * literal. The browser side cannot use these, and the email side cannot use the CSS.
 *
 * `npm run check:tokens` asserts the two stay in step rather than generating one from
 * the other: the design tool emits CSS, so codegen would fight the round trip.
 */

export const tokens = {
  color: {
    ink900: "#16181A",
    ink700: "#3E4348",
    ink600: "#4A4F55",
    ink500: "#5C6268",
    ink450: "#6C7278",
    ink350: "#9AA0A6",

    line300: "#C8C8C2",
    line250: "#D8D8D2",
    line200: "#E0E0DA",
    line100: "#E7E7E2",
    lineDot: "#A8AEB4",
    lineDivider: "#DEDED8",

    paper300: "#E6E6E0",
    paper250: "#E9E9E3",
    paper200: "#EFEFEB",
    paper150: "#F2F2ED",
    paper100: "#F7F7F3",
    paper050: "#F4F4F0",
    paper000: "#FBFBF9",

    signalCritical: "#8E2F14",
    signalLink: "#2B4C8C",
    signalLive: "#8FBF6A",
    signalMute: "#B8BCC0",
  },
  radius: {
    base: "3px",
    lg: "4px",
  },
  /**
   * A system stack, not IBM Plex.
   *
   * The design canvas loads Plex from Google Fonts, but that <link> is canvas chrome:
   * remote webfonts do not survive most email clients, so the email degrades to system
   * fonts by design rather than by accident.
   */
  font: {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
} as const;

/** Maps each token onto its CSS custom property name, for the drift guard. */
export const CSS_VARIABLE_MAP: Record<string, string> = {
  "--ink-900": tokens.color.ink900,
  "--ink-700": tokens.color.ink700,
  "--ink-600": tokens.color.ink600,
  "--ink-500": tokens.color.ink500,
  "--ink-450": tokens.color.ink450,
  "--ink-350": tokens.color.ink350,
  "--line-300": tokens.color.line300,
  "--line-250": tokens.color.line250,
  "--line-200": tokens.color.line200,
  "--line-100": tokens.color.line100,
  "--line-dot": tokens.color.lineDot,
  "--line-divider": tokens.color.lineDivider,
  "--paper-300": tokens.color.paper300,
  "--paper-250": tokens.color.paper250,
  "--paper-200": tokens.color.paper200,
  "--paper-150": tokens.color.paper150,
  "--paper-100": tokens.color.paper100,
  "--paper-050": tokens.color.paper050,
  "--paper-000": tokens.color.paper000,
  "--signal-critical": tokens.color.signalCritical,
  "--signal-link": tokens.color.signalLink,
  "--signal-live": tokens.color.signalLive,
  "--signal-mute": tokens.color.signalMute,
};
