import { tokens } from "@/lib/design/tokens";
import type { NoticeCardData } from "@/lib/notices/dto";
import { CLOSING_SOON_HOURS } from "@/lib/notices/urgency";

import {
  buttonStyle,
  cardCellStyle,
  dueStyle,
  earlyCellStyle,
  emailStyles as s,
  flagStyle,
} from "./tokens-inline";

const { color, font } = tokens;

export interface DigestData {
  /** Biddable notices — solicitations, combined synopses, presolicitations. */
  biddable: NoticeCardData[];
  /** Everything else: sources sought, awards, justifications, unknown types. */
  earlyStage: NoticeCardData[];
  dashboardUrl: string;
  recipientEmail: string;
  sentAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The email's urgency threshold is 5 days — wider than the dashboard row's 72 hours. */
function isUrgent(notice: NoticeCardData): boolean {
  return (
    notice.deadlineState === "open" &&
    notice.hoursRemaining !== null &&
    notice.hoursRemaining < CLOSING_SOON_HOURS
  );
}

function flagLabel(notice: NoticeCardData): string {
  if (!isUrgent(notice)) return "NEW OVERNIGHT";
  const days = Math.floor((notice.hoursRemaining ?? 0) / 24);
  if (days <= 0) return "CLOSES TODAY";
  return `CLOSES IN ${days} DAY${days === 1 ? "" : "S"}`;
}

/**
 * The due line, honest about missing data.
 *
 * About a fifth of real notices carry no response date at all, so this must not invent
 * one or imply the notice has closed.
 */
function dueLabel(notice: NoticeCardData): string {
  if (notice.deadlineState === "none") return "No response date given";
  if (notice.deadlineState === "closed") return "Response period closed";
  return `Response due ${notice.deadlineLongLabel}`;
}

function metaCell(label: string, value: string, styleOverride?: string): string {
  return `<div style="${s.metaLabel}">${label}</div><div style="${styleOverride ?? s.metaValue}">${escapeHtml(value)}</div>`;
}

function renderBiddableCard(notice: NoticeCardData, index: number): string {
  const urgent = isUrgent(notice);
  const setAsideNaics = [notice.setAside, notice.naicsCode].filter(Boolean).join(" · ") || "—";

  return `
<tr><td style="${cardCellStyle(index, urgent)}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="vertical-align:top;padding-bottom:7px"><div style="${flagStyle(urgent)}">${flagLabel(notice)}</div></td>
    <td style="text-align:right;vertical-align:top;padding-bottom:7px;${s.cardSolicitation}">${escapeHtml(notice.solicitationNumber ?? "")}</td>
  </tr></table>
  <div style="${s.cardTitle}">${escapeHtml(notice.title)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="${s.metaStrip}"><tr>
    <td style="padding:7px 10px 7px 0;width:38%;vertical-align:top">${metaCell("AGENCY", [notice.agencyShort, notice.agencyOffice].filter(Boolean).join(" — ") || "—")}</td>
    <td style="padding:7px 10px;width:34%;vertical-align:top">${metaCell("NOTICE TYPE", notice.type)}</td>
    <td style="padding:7px 0 7px 10px;width:28%;vertical-align:top">${metaCell("SET-ASIDE · NAICS", setAsideNaics, s.metaValueMono)}</td>
  </tr></table>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="vertical-align:middle"><div style="${dueStyle(urgent)}">${dueLabel(notice)}</div></td>
    ${notice.uiLink ? `<td style="text-align:right;vertical-align:middle"><a href="${escapeHtml(notice.uiLink)}" style="${buttonStyle(urgent)}">Open notice</a></td>` : ""}
  </tr></table>
</td></tr>`;
}

function renderEarlyRow(notice: NoticeCardData, index: number): string {
  const meta = [
    [notice.agencyShort, notice.agencyOffice].filter(Boolean).join(" — "),
    notice.type,
    [notice.setAside, notice.naicsCode].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");

  return `
<tr><td style="${earlyCellStyle(index)}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="vertical-align:middle;padding-right:12px">
      <div style="${s.earlyTitle}">${escapeHtml(notice.title)}</div>
      <div style="${s.earlyMeta}">${escapeHtml(meta)}</div>
    </td>
    <td style="text-align:right;vertical-align:middle;white-space:nowrap">
      <div style="${s.earlyDue}">${dueLabel(notice)}</div>
      ${notice.uiLink ? `<a href="${escapeHtml(notice.uiLink)}" style="${s.earlyLink}">View notice</a>` : ""}
    </td>
  </tr></table>
</td></tr>`;
}

export function digestSubject(data: DigestData): string {
  return `${data.biddable.length} biddable · ${data.earlyStage.length} early-stage`;
}

export function renderDigestHtml(data: DigestData): string {
  const { biddable, earlyStage } = data;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(data.sentAt)
    .toUpperCase()
    .replace(/,/g, "");

  const soonest = biddable.find(isUrgent);
  const lede = soonest
    ? `Posted to SAM.gov under your watched NAICS codes. One closes ${soonest.countdownLabel === "CLOSED" ? "imminently" : `in ${soonest.countdownLabel}`}.`
    : "Posted to SAM.gov under your watched NAICS codes.";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bidwren daily digest</title></head>
<body style="${s.body}">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${color.paper200}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="640" style="${s.container};max-width:640px">

  <tr><td style="${s.header}">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="vertical-align:middle;${s.wordmark}">Bidwren</td>
      <td style="text-align:right;${s.headerMeta}">DAILY DIGEST · ${dateLabel}</td>
    </tr></table>
  </td></tr>

  <tr><td style="${s.introCell}">
    <div style="${s.introHeadline}">${biddable.length} biddable ${biddable.length === 1 ? "opportunity" : "opportunities"}, ${earlyStage.length} worth watching</div>
    <div style="${s.introBody}">${lede}</div>
  </td></tr>

  ${
    biddable.length > 0
      ? `<tr><td style="${s.sectionPrimary}">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="${s.sectionPrimaryLabel}">BIDDABLE NOW</td>
      <td style="text-align:right;${s.sectionNote}">Solicitations and presolicitations you can respond to</td>
    </tr></table>
  </td></tr>
  ${biddable.map(renderBiddableCard).join("")}`
      : ""
  }

  ${
    earlyStage.length > 0
      ? `<tr><td style="${s.sectionSecondary}">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="${s.sectionSecondaryLabel}">EARLY-STAGE · MARKET RESEARCH</td>
      <td style="text-align:right;${s.sectionNote}">No bid yet — but it shapes the coming RFP</td>
    </tr></table>
  </td></tr>
  ${earlyStage.map(renderEarlyRow).join("")}`
      : ""
  }

  <tr><td style="${s.ctaRow}">
    <a href="${escapeHtml(data.dashboardUrl)}" style="${s.ctaLink}">View all open opportunities on the dashboard &rarr;</a>
  </td></tr>

  <tr><td style="${s.footer}">
    Sent to ${escapeHtml(data.recipientEmail)} · Source: SAM.gov Contract Opportunities API.<br>
    <a href="${escapeHtml(data.dashboardUrl)}" style="${s.footerLink}">Open the dashboard</a>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Plain-text alternative — helps deliverability and doubles as a fast smoke test. */
export function renderDigestText(data: DigestData): string {
  const line = (notice: NoticeCardData) =>
    [
      `- ${notice.title}`,
      `  ${[notice.agencyShort, notice.type, notice.naicsCode].filter(Boolean).join(" · ")}`,
      `  ${dueLabel(notice)}`,
      notice.uiLink ? `  ${notice.uiLink}` : null,
    ]
      .filter(Boolean)
      .join("\n");

  const parts = [
    `Bidwren daily digest`,
    `${data.biddable.length} biddable, ${data.earlyStage.length} worth watching`,
    "",
  ];

  if (data.biddable.length > 0) {
    parts.push("BIDDABLE NOW", "Solicitations and presolicitations you can respond to", "");
    parts.push(data.biddable.map(line).join("\n\n"), "");
  }
  if (data.earlyStage.length > 0) {
    parts.push("EARLY-STAGE / MARKET RESEARCH", "No bid yet — but it shapes the coming RFP", "");
    parts.push(data.earlyStage.map(line).join("\n\n"), "");
  }

  parts.push(`View all open opportunities: ${data.dashboardUrl}`, "", `Sent to ${data.recipientEmail} · Source: SAM.gov`);
  return parts.join("\n");
}

/** Exported for the render check — the email must never reference a webfont. */
export const EMAIL_FONT_STACK = font.sans;
