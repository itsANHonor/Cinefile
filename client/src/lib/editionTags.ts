/**
 * Client-side helpers for parsing and formatting comma-separated edition tags.
 */

export function parseEditionTags(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw.flatMap((r) => r.split(',')) : raw.split(',');
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of parts) {
    const cleaned = part.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(cleaned);
    }
  }

  return tags;
}

export function formatEditionTags(tags: string[]): string {
  return parseEditionTags(tags).join(', ');
}
