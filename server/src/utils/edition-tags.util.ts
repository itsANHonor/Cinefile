/**
 * Utilities for parsing, normalizing, and querying comma-separated edition tags
 * stored in `physical_items.edition_notes`.
 */

/**
 * Parse a raw edition_notes value (comma-separated string or string array)
 * into a deduplicated array of trimmed tags, preserving first-seen casing.
 */
export function parseEditionTags(raw: unknown): string[] {
  if (!raw) return [];

  const parts: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        parts.push(...item.split(','));
      }
    }
  } else if (typeof raw === 'string') {
    parts.push(...raw.split(','));
  } else {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    const cleaned = part.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }

  return result;
}

/**
 * Build a map of lowercase tag -> canonical display tag from existing rows.
 * Chooses the most common casing variant (preferring capitalized variants on ties).
 */
export function buildCanonicalEditionTagMap(
  rows: Array<{ edition_notes?: string | null }>
): Map<string, string> {
  const variantCounts = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const tags = parseEditionTags(row.edition_notes);
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!variantCounts.has(key)) {
        variantCounts.set(key, new Map());
      }
      const variants = variantCounts.get(key)!;
      variants.set(tag, (variants.get(tag) || 0) + 1);
    }
  }

  const canonical = new Map<string, string>();
  for (const [key, variants] of variantCounts.entries()) {
    let bestTag = key;
    let bestCount = -1;
    for (const [variant, count] of variants.entries()) {
      const hasUpper = variant !== variant.toLowerCase();
      const bestHasUpper = bestTag !== bestTag.toLowerCase();
      if (
        count > bestCount ||
        (count === bestCount && hasUpper && !bestHasUpper)
      ) {
        bestTag = variant;
        bestCount = count;
      }
    }
    canonical.set(key, bestTag);
  }

  return canonical;
}

/**
 * Normalize an edition_notes input into a canonical comma-separated string
 * (e.g. "Steelbook, Collector's Edition"), or null if empty.
 */
export function normalizeEditionNotes(
  raw: unknown,
  canonicalMap?: Map<string, string>
): string | null {
  const tags = parseEditionTags(raw).map((tag) => {
    if (!canonicalMap) return tag;
    return canonicalMap.get(tag.toLowerCase()) ?? tag;
  });
  return tags.length > 0 ? tags.join(', ') : null;
}

/**
 * Apply multi-select edition tag filter to a Knex query on `physical_items`.
 * Matches whole comma-separated tags case-insensitively.
 */
export function applyEditionTagFilter(query: any, editionsParam: unknown): any {
  const tags = parseEditionTags(editionsParam);
  if (tags.length === 0) return query;

  return query.where(function (this: any) {
    tags.forEach((tag, index) => {
      const needle = `,${tag.toLowerCase()},`;
      const sql = `INSTR(',' || REPLACE(REPLACE(REPLACE(LOWER(TRIM(COALESCE(physical_items.edition_notes, ''))), ',  ', ','), ', ', ','), ' ,', ',') || ',', ?) > 0`;
      if (index === 0) {
        this.whereRaw(sql, [needle]);
      } else {
        this.orWhereRaw(sql, [needle]);
      }
    });
  });
}
