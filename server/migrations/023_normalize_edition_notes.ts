import { Knex } from 'knex';

function normalizeTags(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(',')) {
    const cleaned = part.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(cleaned);
    }
  }
  return tags.length > 0 ? tags.join(', ') : null;
}

export async function up(knex: Knex): Promise<void> {
  const rows = await knex('physical_items')
    .whereNotNull('edition_notes')
    .select('id', 'edition_notes');

  for (const row of rows) {
    const normalized = normalizeTags(row.edition_notes);
    if (normalized !== row.edition_notes) {
      await knex('physical_items')
        .where({ id: row.id })
        .update({ edition_notes: normalized });
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Normalization is non-destructive; no rollback needed
}
