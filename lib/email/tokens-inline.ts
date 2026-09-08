import { tokens } from "@/lib/design/tokens";

/**
 * Inline style strings for the digest email.
 *
 * Everything here is a literal — no var(), no classes, no <style> block. Gmail's mobile
 * app strips <style>, and Outlook's Word rendering engine ignores most of it, so an
 * email's styling has to live on the element.
 */

const { color, font, radius } = tokens;

export const emailStyles = {
  body: `margin:0;padding:0;background:${color.paper200};`,
  container: `border-collapse:collapse;background:${color.paper000};border:1px solid ${color.line300};`,

  header: `padding:14px 22px;background:${color.paper200};border-bottom:3px solid ${color.ink900};`,
  wordmark: `font-size:16px;font-weight:700;color:${color.ink900};letter-spacing:-0.015em;font-family:${font.sans};`,
  headerMeta: `font-family:${font.mono};font-size:10.5px;letter-spacing:0.05em;color:${color.ink600};`,

  introCell: `padding:18px 22px 14px;border-bottom:1px solid ${color.line250};`,
  introHeadline: `font-size:17px;font-weight:600;letter-spacing:-0.015em;color:${color.ink900};margin-bottom:5px;font-family:${font.sans};`,
  introBody: `font-size:13px;line-height:1.5;color:${color.ink600};font-family:${font.sans};`,

  sectionPrimary: `padding:11px 22px 9px;background:${color.paper250};border-top:3px solid ${color.ink900};border-bottom:3px solid ${color.ink900};`,
  sectionPrimaryLabel: `font-family:${font.mono};font-size:10.5px;font-weight:600;letter-spacing:0.13em;color:${color.ink900};`,
  sectionSecondary: `padding:10px 22px 8px;background:${color.paper150};border-top:1px solid ${color.line300};border-bottom:1px solid ${color.line300};`,
  sectionSecondaryLabel: `font-family:${font.mono};font-size:10px;font-weight:500;letter-spacing:0.13em;color:${color.ink600};`,
  sectionNote: `font-size:11.5px;color:${color.ink600};font-family:${font.sans};`,

  cardTitle: `font-size:16px;font-weight:600;line-height:1.3;letter-spacing:-0.012em;color:${color.ink900};margin-bottom:8px;font-family:${font.sans};`,
  cardSolicitation: `font-family:${font.mono};font-size:10.5px;color:${color.ink500};`,
  metaStrip: `border-top:1px solid ${color.line100};margin-bottom:9px;`,
  metaLabel: `font-family:${font.mono};font-size:9px;letter-spacing:0.1em;color:${color.ink500};margin-bottom:2px;`,
  metaValue: `font-size:12.5px;color:${color.ink700};font-weight:500;line-height:1.35;font-family:${font.sans};`,
  metaValueMono: `font-family:${font.mono};font-size:11.5px;color:${color.ink700};line-height:1.35;`,

  earlyTitle: `font-size:13.5px;font-weight:600;line-height:1.3;color:${color.ink700};margin-bottom:3px;font-family:${font.sans};`,
  earlyMeta: `font-size:11.5px;color:${color.ink500};line-height:1.4;font-family:${font.sans};`,
  earlyDue: `font-family:${font.mono};font-size:11.5px;font-weight:500;color:${color.ink600};margin-bottom:3px;`,
  earlyLink: `font-size:11.5px;font-weight:500;color:${color.signalLink};text-decoration:underline;font-family:${font.sans};`,

  ctaRow: `padding:16px 22px;background:${color.paper150};border-top:1px solid ${color.line250};`,
  ctaLink: `font-size:13px;font-weight:600;color:${color.signalLink};text-decoration:none;font-family:${font.sans};`,
  footer: `padding:16px 22px 20px;background:${color.paper150};border-top:1px solid ${color.line200};font-size:11px;line-height:1.6;color:${color.ink500};font-family:${font.sans};`,
  footerLink: `color:${color.ink500};text-decoration:underline;`,
} as const;

/** Urgent rows are rust-flagged; the rest stay neutral. */
export function flagStyle(urgent: boolean): string {
  return urgent
    ? `display:inline-block;font-family:${font.mono};font-size:9.5px;font-weight:600;letter-spacing:0.1em;padding:3px 7px;border-radius:2px;background:${color.signalCritical};color:${color.paper000};`
    : `display:inline-block;font-family:${font.mono};font-size:9.5px;font-weight:600;letter-spacing:0.1em;padding:3px 7px;border-radius:2px;background:${color.paper300};color:${color.ink600};`;
}

export function dueStyle(urgent: boolean): string {
  return `font-family:${font.mono};font-size:${urgent ? "13px" : "12px"};font-weight:${urgent ? 600 : 500};color:${urgent ? color.signalCritical : color.ink700};letter-spacing:-0.01em;`;
}

/**
 * The primary call to action.
 *
 * The design file specifies the non-urgent variant as paper-000 with a dark border, but
 * that puts a near-white button on a paper-000 row: in Gmail it reads as disabled. Dark
 * on light reads as the action it is, and rust stays reserved for urgency alone.
 */
export function buttonStyle(urgent: boolean): string {
  return urgent
    ? `display:inline-block;font-size:12.5px;font-weight:700;color:${color.paper000};background:${color.signalCritical};padding:13px 20px;border-radius:${radius.base};text-decoration:none;letter-spacing:0.01em;font-family:${font.sans};`
    : `display:inline-block;font-size:12.5px;font-weight:600;color:${color.paper000};background:${color.ink900};padding:13px 20px;border-radius:${radius.base};text-decoration:none;letter-spacing:0.01em;font-family:${font.sans};`;
}

export function cardCellStyle(index: number, urgent: boolean): string {
  return `padding:16px 22px;border-bottom:1px solid ${color.line200};background:${index % 2 ? color.paper100 : color.paper000};border-left:3px solid ${urgent ? color.signalCritical : "transparent"};`;
}

export function earlyCellStyle(index: number): string {
  return `padding:11px 22px;border-bottom:1px solid ${color.line100};background:${index % 2 ? color.paper050 : color.paper000};`;
}
