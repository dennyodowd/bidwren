#!/usr/bin/env node
/**
 * Drift guard between the two places design tokens necessarily live:
 *   app/globals.css   — owns the browser
 *   lib/design/tokens.ts — owns the digest email, which needs inline literals
 *
 * Generating one from the other was rejected: the design tool emits CSS, so codegen
 * would fight the round trip. A check just reports when they diverge.
 *
 * Deliberately dependency-free and regex-based so it cannot fail on module resolution.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const ts = readFileSync(join(root, "lib/design/tokens.ts"), "utf8");

// tokens.ts: colour key -> hex, e.g. `ink900: "#16181A",`
const colours = new Map();
for (const [, key, hex] of ts.matchAll(/^\s*(\w+):\s*"(#[0-9A-Fa-f]{6})",/gm)) {
  colours.set(key, hex.toLowerCase());
}

// tokens.ts: CSS variable name -> colour key, e.g. `"--ink-900": tokens.color.ink900,`
const expected = new Map();
for (const [, cssVar, key] of ts.matchAll(/"(--[a-z0-9-]+)":\s*tokens\.color\.(\w+)/g)) {
  const hex = colours.get(key);
  if (!hex) {
    console.error(`✗ tokens.ts maps ${cssVar} to unknown colour key "${key}"`);
    process.exit(1);
  }
  expected.set(cssVar, hex);
}

// globals.css: `--ink-900: #16181a;`
const actual = new Map();
for (const [, name, hex] of css.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6});/g)) {
  actual.set(name, hex.toLowerCase());
}

const problems = [];
for (const [name, hex] of expected) {
  if (!actual.has(name)) problems.push(`${name} is in tokens.ts but missing from globals.css`);
  else if (actual.get(name) !== hex) {
    problems.push(`${name} differs — globals.css ${actual.get(name)}, tokens.ts ${hex}`);
  }
}
for (const name of actual.keys()) {
  // Only colour variables are mirrored; geometry and type stay CSS-only.
  if (!expected.has(name) && /^--(ink|line|paper|signal)-/.test(name)) {
    problems.push(`${name} is in globals.css but not mirrored in tokens.ts`);
  }
}

if (problems.length > 0) {
  console.error("Design token drift detected:");
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`✓ ${expected.size} design tokens match between globals.css and tokens.ts`);
