import sample from "@/sample.json";

import type { SamSearchResponse } from "./types";

/**
 * Compile-time canary pinning our SAM types to the real response at the repo root.
 *
 * Nothing imports this module — it exists only so `tsc` checks the assignment. If SAM's
 * shape drifts and someone refreshes sample.json, `npm run typecheck` breaks here rather
 * than the mismatch surfacing as a runtime surprise during ingestion.
 */
const sampleConforms: SamSearchResponse = sample;

void sampleConforms;
