import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import { Marked } from "marked";

/**
 * Filesystem-backed blog posts.
 *
 * One markdown file per post under content/blog/, filename as slug. No CMS and no
 * database: posts are committed alongside the code, so adding one is a file drop and
 * the whole route prerenders at build time.
 */

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  /** ISO date from frontmatter, e.g. "2026-09-08". */
  date: string;
  /** Preformatted for display, e.g. "8 September 2026". */
  dateLabel: string;
}

export interface Post extends PostMeta {
  /** Rendered HTML body. Trusted — see renderMarkdown. */
  html: string;
}

/**
 * GitHub-flavoured markdown, which is what gives us pipe tables.
 *
 * Deliberately no syntax highlighting: code blocks render as plain monospace on the
 * dark surface, which is how the design system already presents code, and it avoids a
 * highlighting dependency for a handful of snippets.
 */
const marked = new Marked({ gfm: true, breaks: false });

/**
 * Wrap tables so a wide one scrolls inside its own container rather than pushing the
 * page body sideways — the same rule the dashboard table follows.
 */
marked.use({
  renderer: {
    table(token) {
      // Delegate to the default renderer, then wrap its output.
      const html = this.parser.renderer.constructor.prototype.table.call(this, token);
      return `<div class="table-scroll">${html}</div>`;
    },
  },
});

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function parse(slug: string, raw: string) {
  const { data, content } = matter(raw);
  const title = typeof data.title === "string" ? data.title : slug;
  const description = typeof data.description === "string" ? data.description : "";
  const date = typeof data.date === "string" ? data.date : toIsoDate(data.date);

  return { slug, title, description, date, dateLabel: formatDate(date), content };
}

/** gray-matter parses an unquoted YAML date into a Date; normalise back to a string. */
function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

/**
 * Strips the leading H1.
 *
 * The markdown carries one so the file reads correctly on GitHub and Dev.to, but the
 * page renders the title from frontmatter — keeping both would duplicate it.
 */
function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^\s*#\s+.*(\r?\n)+/, "");
}

export async function getPostSlugs(): Promise<string[]> {
  const entries = await readdir(CONTENT_DIR);
  return entries.filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3));
}

/** Posts newest first, without rendering any bodies. */
export async function getAllPosts(): Promise<PostMeta[]> {
  const slugs = await getPostSlugs();
  const posts = await Promise.all(
    slugs.map(async (slug) => {
      const raw = await readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf8");
      const { slug: postSlug, title, description, date, dateLabel } = parse(slug, raw);
      return { slug: postSlug, title, description, date, dateLabel };
    }),
  );
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPost(slug: string): Promise<Post | null> {
  // Defend the path join against a traversal attempt in the route segment.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  let raw: string;
  try {
    raw = await readFile(path.join(CONTENT_DIR, `${slug}.md`), "utf8");
  } catch {
    return null;
  }

  const { content, ...meta } = parse(slug, raw);
  /**
   * The rendered HTML is injected with dangerouslySetInnerHTML. That is safe *only*
   * because these files are authored by us and committed to the repository. Never
   * route user-supplied markdown through here without sanitising first.
   */
  const html = await marked.parse(stripLeadingH1(content));
  return { ...meta, html };
}
