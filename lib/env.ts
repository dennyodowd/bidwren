/**
 * The only module in the app that reads `process.env`.
 *
 * A missing variable is a loud error, never a silent default — there are no fallback
 * literals in this file. See CLAUDE.md, "Conventions".
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local locally, or in the Vercel project settings.`,
    );
  }
  return value;
}

/**
 * Reads an optional variable, returning undefined rather than a stand-in value.
 *
 * Only `CRON_SECRET` legitimately uses this: Vercel injects it into scheduled
 * invocations, but it is normally absent in local development.
 */
export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

/**
 * The app's public origin, normalised.
 *
 * APP_URL is hand-entered in two places (.env.local and Vercel), and it gets embedded
 * verbatim into every digest email — including the plain-text part, where a reader sees
 * the raw string. Round-tripping through URL lowercases the host and drops any trailing
 * slash or stray path, so a typo like "https://bidwren.coM" cannot reach a recipient.
 *
 * Throws on a value that is not a valid absolute URL, rather than sending mail with a
 * broken link in it.
 */
export function requireAppUrl(): string {
  const raw = requireEnv("APP_URL");
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(
      `APP_URL is not a valid absolute URL: "${raw}". Expected something like https://bidwren.com`,
    );
  }
}
