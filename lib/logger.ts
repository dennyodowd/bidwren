/**
 * Structured logging for the cron handlers.
 *
 * CLAUDE.md requires every outbound SAM.gov request to be logged with its URL, status
 * and record count, so throttling can be reconstructed after the fact. These logs go to
 * Vercel's function logs; the same entries are also persisted to `ingest_runs.request_log`.
 */

/** Query-string keys whose values must never reach a log line. */
const SECRET_PARAMS = new Set(["api_key", "apikey", "secret", "token", "key"]);

/**
 * Strips credentials from a URL before logging.
 *
 * The SAM.gov key travels in an `X-Api-Key` header rather than the query string, so in
 * normal operation there is nothing to strip — this exists so that a future fallback to
 * the `api_key` query parameter cannot silently start leaking the key into logs.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (SECRET_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "[redacted]");
      }
    }
    return parsed.toString();
  } catch {
    return "[unparseable url]";
  }
}

type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
