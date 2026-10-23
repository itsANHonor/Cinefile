function normalizeTags(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const seen = new Set();
  const tags = [];
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

exports.up = async function(knex) {
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
};

exports.down = async function(_knex) {
  // Normalization is non-destructive; no rollback needed
};
