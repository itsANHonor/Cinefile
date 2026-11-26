/**
 * Pure heuristic parser that turns noisy retail product records (e.g. from UPCitemdb)
 * into structured Cinefile format/edition suggestions and clean TMDb search queries.
 */

export interface RawBarcodeProductInput {
  title?: string | null;
  brand?: string | null;
  description?: string | null;
  offers?: Array<{ title?: string | null }> | null;
}

export interface ParsedBarcodeMetadata {
  cleanedQuery: string;
  alternateQueries: string[];
  collectionQuery: string | null;
  suggestedItemName: string;
  suggestedFormats: string[];
  suggestedEditionTags: string[];
  mediaTypeHint: 'movie' | 'tv';
  seasonHints: number[];
  isLikelyBoxSet: boolean;
  yearHint: number | null;
}

const CANONICAL_FORMAT_ORDER = [
  '4K UHD',
  '3D Blu-ray',
  'Blu-ray',
  'DVD',
  'Digital-UHD',
  'Digital-HD',
  'Digital-SD',
  'LaserDisc',
  'VHS',
] as const;

const EDITION_LABEL_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\bcriterion(?:\s+collection)?\b/i, tag: 'Criterion Collection' },
  { pattern: /\barrow(?:\s+video|\s+films)?\b/i, tag: 'Arrow Video' },
  { pattern: /\bscream\s+factory\b/i, tag: 'Scream Factory' },
  { pattern: /\bshout!?\s*factory\b/i, tag: 'Shout! Factory' },
  { pattern: /\bkino\s+lorber\b/i, tag: 'Kino Lorber' },
  { pattern: /\bvinegar\s+syndrome\b/i, tag: 'Vinegar Syndrome' },
  { pattern: /\bmasters\s+of\s+cinema\b/i, tag: 'Masters of Cinema' },
  { pattern: /\bsecond\s+sight\b/i, tag: 'Second Sight' },
  { pattern: /\bseverin(?:\s+films)?\b/i, tag: 'Severin' },
  { pattern: /\b88\s+films\b/i, tag: '88 Films' },
  { pattern: /\bwarner\s+archive\b/i, tag: 'Warner Archive' },
  { pattern: /\bparamount\s+presents\b/i, tag: 'Paramount Presents' },
  { pattern: /\bvestron(?:\s+video)?\b/i, tag: 'Vestron Video' },
  { pattern: /\bradiance(?:\s+films)?\b/i, tag: 'Radiance Films' },
  { pattern: /\bstudiocanal\b/i, tag: 'StudioCanal' },
  { pattern: /\ba24\b/i, tag: 'A24' },
  { pattern: /\bpowerhouse(?:\s+films)?\b|\bindicator\s+series\b/i, tag: 'Indicator' },
  { pattern: /\bbfi\b/i, tag: 'BFI' },
];

const EDITION_FEATURE_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\bsteel\s*book\b/i, tag: 'Steelbook' },
  { pattern: /\bslip\s*cover\b/i, tag: 'Slipcover' },
  { pattern: /\bmedia\s*book\b/i, tag: 'Mediabook' },
  { pattern: /\bdigi\s*book\b/i, tag: 'Digibook' },
  { pattern: /\bdigi\s*pak\b/i, tag: 'Digipak' },
  { pattern: /\bcollector'?s\s+edition\b/i, tag: "Collector's Edition" },
  { pattern: /\blimited\s+edition\b/i, tag: 'Limited Edition' },
  { pattern: /\bspecial\s+edition\b/i, tag: 'Special Edition' },
  { pattern: /\bdirector'?s\s+cut\b/i, tag: "Director's Cut" },
  { pattern: /\bextended\s+(?:edition|cut|version)\b/i, tag: 'Extended Edition' },
  { pattern: /\bunrated(?:\s+(?:edition|cut|version))?\b/i, tag: 'Unrated' },
  { pattern: /\bultimate\s+edition\b/i, tag: 'Ultimate Edition' },
  { pattern: /\bbox\s*set\b/i, tag: 'Box Set' },
];

const WORD_TO_SEASON: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

function detectFormats(combinedText: string): string[] {
  const found = new Set<string>();

  const has4K = /\b(4k|ultra\s*hd|uhd)\b/i.test(combinedText);
  const has3D = /\b(3d\s*blu[\s-]?ray|blu[\s-]?ray\s*3d|reald\s*3d)\b/i.test(combinedText);
  const hasBluRayToken = /\b(blu[\s-]?ray|bluray|bd)\b/i.test(combinedText);
  const hasBluRayCombo =
    /\b(4k|ultra\s*hd|uhd)[^a-z0-9]{0,12}(?:\+|\/|&|and|w\/|with)[^a-z0-9]{0,12}(blu[\s-]?ray|bluray|bd)\b/i.test(
      combinedText
    ) ||
    /\b4k\s+ultra\s+hd\s+blu[\s-]?ray\s*\/\s*blu[\s-]?ray\b/i.test(combinedText) ||
    /\buhd\s*\/\s*bd\b/i.test(combinedText) ||
    /\bblu[\s-]?ray\s*(?:\+|\/)\s*4k\b/i.test(combinedText);
  const hasDvd = /\bdvd\b/i.test(combinedText);
  const hasLaserDisc = /\blaser\s*disc\b/i.test(combinedText);
  const hasVhs = /\bvhs\b/i.test(combinedText);

  const explicitlyNoDigital = /\bno\s+digital(?:\s+(?:copy|code|hd))?\b/i.test(combinedText);
  const hasDigital =
    !explicitlyNoDigital &&
    /\b(digital\s+(?:copy|hd|uhd|4k|code|download)|w\/digital|with\s+digital|\+\s*digital)\b/i.test(
      combinedText
    );

  if (has4K) found.add('4K UHD');
  if (has3D) found.add('3D Blu-ray');

  if (hasBluRayToken) {
    if (!has4K && !has3D) {
      found.add('Blu-ray');
    } else if (has4K && hasBluRayCombo) {
      found.add('Blu-ray');
    } else if (has3D && /\+\s*blu[\s-]?ray\b|\b2d\s*blu[\s-]?ray\b/i.test(combinedText)) {
      found.add('Blu-ray');
    }
  }

  if (hasDvd) found.add('DVD');
  if (hasLaserDisc) found.add('LaserDisc');
  if (hasVhs) found.add('VHS');

  if (hasDigital) {
    if (has4K && /\bdigital\s*(?:uhd|4k)\b/i.test(combinedText)) {
      found.add('Digital-UHD');
    } else if (has4K || hasBluRayToken || /\bdigital\s*hd\b/i.test(combinedText)) {
      found.add('Digital-HD');
    } else {
      found.add('Digital-SD');
    }
  }

  return CANONICAL_FORMAT_ORDER.filter((f) => found.has(f));
}

function detectEditionTags(primaryTitle: string, brand: string, offerTitles: string[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const addTag = (tag: string) => {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  };

  const labelText = [brand, primaryTitle, ...offerTitles].filter(Boolean).join(' ');
  for (const { pattern, tag } of EDITION_LABEL_PATTERNS) {
    if (pattern.test(labelText)) {
      addTag(tag);
    }
  }

  const titleAndOffers = [primaryTitle, ...offerTitles].filter(Boolean).join(' ');
  for (const { pattern, tag } of EDITION_FEATURE_PATTERNS) {
    if (pattern.test(titleAndOffers)) {
      addTag(tag);
    }
  }

  const anniversaryMatch = titleAndOffers.match(/\b(\d+(?:st|nd|rd|th)\s+anniversary)\b/i);
  if (anniversaryMatch) {
    const formatted = anniversaryMatch[1].replace(/\banniversary\b/i, 'Anniversary');
    addTag(`${formatted} Edition`);
  } else if (/\banniversary\s+edition\b/i.test(titleAndOffers)) {
    addTag('Anniversary Edition');
  }

  return tags;
}

function detectTVHints(text: string): { isTV: boolean; seasons: number[] } {
  const seasons = new Set<number>();
  let isTV = false;

  const rangeRegex = /\bseasons?\s+(\d{1,2})\s*(?:-|–|to|&|\+)\s*(\d{1,2})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = rangeRegex.exec(text)) !== null) {
    isTV = true;
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    if (start > 0 && end >= start && end - start <= 25) {
      for (let s = start; s <= end; s++) seasons.add(s);
    }
  }

  const singleRegex = /\b(?:season|series)\s+(\d{1,2})\b/gi;
  while ((match = singleRegex.exec(text)) !== null) {
    isTV = true;
    const num = parseInt(match[1], 10);
    if (num > 0 && num <= 50) seasons.add(num);
  }

  const ordinalRegex =
    /\b(?:complete\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/gi;
  while ((match = ordinalRegex.exec(text)) !== null) {
    isTV = true;
    const num = WORD_TO_SEASON[match[1].toLowerCase()];
    if (num) seasons.add(num);
  }

  const numericOrdinalRegex = /\b(?:complete\s+)?(\d{1,2})(?:st|nd|rd|th)\s+season\b/gi;
  while ((match = numericOrdinalRegex.exec(text)) !== null) {
    isTV = true;
    const num = parseInt(match[1], 10);
    if (num > 0 && num <= 50) seasons.add(num);
  }

  if (/\b(complete\s+series|tv\s+series|television\s+series|mini[\s-]?series)\b/i.test(text)) {
    isTV = true;
  }

  return {
    isTV,
    seasons: Array.from(seasons).sort((a, b) => a - b),
  };
}

function detectBoxSet(titleAndOffers: string, isTV: boolean): boolean {
  if (isTV) return false;
  // Strip boutique label names containing "Collection" so single Criterion/Signature releases aren't flagged
  const withoutLabels = titleAndOffers
    .replace(/\b(?:the\s+)?criterion\s+collection\b/gi, '')
    .replace(/\bsignature\s+collection\b/gi, '')
    .replace(/\barchive\s+collection\b/gi, '')
    .replace(/\bclassic\s+collection\b/gi, '');

  return /\b(trilogy|quadrilogy|pentology|hexalogy|anthology|box\s*set|double\s+feature|triple\s+feature|complete\s+(?:collection|saga|film\s+collection)|ultimate\s+(?:collection|trilogy)|motion\s+picture\s+trilogy|\d+[\s-]?(?:film|movie)\s+(?:collection|set|pack)|scarlet\s+box|limited\s+edition\s+box)\b/i.test(
    withoutLabels
  );
}

function isBracketNoise(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return true;
  if (/^\d{4}$/.test(trimmed)) return true;
  if (/^(?:G|PG|PG-13|R|NC-17|NR|UR|TV-[A-Z0-9]+)$/i.test(trimmed)) return true;
  if (/^[A-Z0-9]{10}$/.test(trimmed)) return true; // ASIN in parens like (B08DG5HVJ6)
  return /\b(4k|ultra\s*hd|uhd|blu[\s-]?ray|bluray|bd|dvd|vhs|laser\s*disc|3d|digital|disc|discs|pc|criterion|arrow|shout|scream\s*factory|kino|steel\s*book|slip\s*cover|collector|limited|special|anniversary|ultimate|director'?s\s+cut|extended|unrated|widescreen|full\s*screen|region|import|uk|us|new|sealed|used|remastered|restored|color|b&w|subtitled|dubbed|combo|pack|set|no\s+digital|brand\s+new)\b/i.test(
    trimmed
  );
}

function stripNoiseFromTitle(raw: string, preserveBoxSetWords: boolean): string {
  let s = raw.trim();

  // Remove "directed by ..." trailing metadata
  s = s.replace(/\s+directed\s+by\s+.+$/i, '');

  // Remove leading distributor/studio prefixes commonly seen on Shop.com / distributor listings
  s = s.replace(
    /^(?:studio\s+distribution\s+servi(?:ces)?|universal\s+studios(?:\s+home\s+entertainment)?|warner\s+bros\.?|paramount(?:\s+pictures)?|sony\s+pictures|20th\s+century\s+fox|lionsgate)\s+/i,
    ''
  );

  // Strip parenthetical and bracketed metadata tags iteratively (handles nested brackets)
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/\(([^()]*)\)|\[([^\[\]]*)\]/g, (full, p1, p2) => {
      const inner = (p1 ?? p2 ?? '').trim();
      return isBracketNoise(inner) ? ' ' : full;
    });
  }

  // Strip format combos and standalone format keywords
  s = s
    .replace(/\b4k[\s-]*uhd\s*\/\s*blu[\s-]?ray(?:\s*\/\s*digital)?\b/gi, ' ')
    .replace(/\b4k\s+ultra\s+hd(?:\s+blu[\s-]?ray)?\b/gi, ' ')
    .replace(/\bultra\s+hd(?:\s+blu[\s-]?ray)?\b/gi, ' ')
    .replace(/\buhd\s*\/\s*bd\b/gi, ' ')
    .replace(/\b3d\s+blu[\s-]?ray\b|\bblu[\s-]?ray\s+3d\b/gi, ' ')
    .replace(/\b\d+x\s*blu[\s-]?ray\b/gi, ' ')
    .replace(/\b(?:4k|uhd|blu[\s-]?ray|bluray|dvd|vhs|laser\s*disc)\b/gi, ' ')
    .replace(/\b(?:w\/|with|\+|&)?\s*digital\s*(?:hd|uhd|4k|copy|code|download)?\b/gi, ' ')
    .replace(/\bno\s+digital(?:\s+code|\s+copy)?\b/gi, ' ');

  // Strip condition, packaging, region, disc counts, boutique labels, and eBay listing junk
  s = s
    .replace(/\b(?:brand\s+)?new\s*\/\s*sealed\b/gi, ' ')
    .replace(/\b(?:brand\s+new|factory\s+sealed|sealed|unopened|mint|used|refurbished)\b/gi, ' ')
    .replace(/\bw\/\s*[^-–|]+$/i, ' ')
    .replace(/\b\d+[\s-]?(?:disc|discs|pc)\s*(?:set|box\s*set|edition|pack)?\b/gi, ' ')
    .replace(/\bregion\s*(?:free|all|[abc0-6](?:\s*,\s*[abc0-6])*)\b/gi, ' ')
    .replace(/\b(?:uk|us|eu)\s*(?:edition|import|release)?\b/gi, ' ')
    .replace(
      /\b(?:the\s+)?(?:criterion\s+collection|arrow\s+video|arrow\s+films|arrow|shout!?\s*factory|scream\s*factory|kino\s*lorber|vinegar\s*syndrome|masters\s+of\s+cinema|warner\s+archive|paramount\s+presents|studiocanal)\b/gi,
      ' '
    )
    .replace(
      /\b(?:steel\s*book|slip\s*cover|media\s*book|digi\s*book|digi\s*pak|widescreen|full\s*screen|anamorpic|anamorphic|remastered|restored|uncut|unrated)\b/gi,
      ' '
    )
    .replace(
      /\b(?:\d+(?:st|nd|rd|th)\s+anniversary|anniversary|collector'?s|limited|special|deluxe|ultimate|definitive|theatrical|extended|director'?s)\s*(?:edition|cut|version|release)?\b/gi,
      ' '
    )
    .replace(/\b(?:movies|brand|all)\s*$/i, ' ')
    .replace(/\b[A-Z]{2}\d{6,}\b/g, ' '); // SKU codes like BR61212628

  // Strip TV season markers for clean TMDb TV show lookup
  s = s
    .replace(/\b(?:the\s+)?complete\s+(?:series|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+season\b/gi, ' ')
    .replace(/\b(?:the\s+)?complete\s+series\b/gi, ' ')
    .replace(/\bseasons?\s+\d{1,2}(?:\s*(?:-|–|to|&|\+)\s*\d{1,2})?\b/gi, ' ')
    .replace(/\bseries\s+\d{1,2}\b/gi, ' ');

  if (!preserveBoxSetWords) {
    s = s
      .replace(
        /\b(?:the\s+)?(?:motion\s+picture\s+trilogy|ultimate\s+trilogy|complete\s+trilogy|trilogy|quadrilogy|pentology|hexalogy|anthology|box\s*set|complete\s+collection|complete\s+saga|double\s+feature|triple\s+feature|\d+[\s-]?(?:film|movie)\s+(?:collection|set|pack)|set|box)\b/gi,
        ' '
      );
  }

  // Clean orphaned punctuation & collapse whitespace
  s = s
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/(?:\s*[-–—|/+,:;]+)+\s*$/g, '')
    .replace(/^\s*(?:[-–—|/+,:;]+\s*)+/g, '')
    .replace(/\s*[:\-–—]\s*[:\-–—]\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim();

  return s;
}

function extractYearHint(primaryTitle: string, offerTitles: string[]): number | null {
  const texts = [primaryTitle, ...offerTitles];
  for (const text of texts) {
    const match = text.match(/[\[(]((?:19|20)\d{2})[\])]/);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 1900 && year <= new Date().getFullYear() + 1) {
        return year;
      }
    }
  }
  return null;
}

export function parseBarcodeProduct(input: RawBarcodeProductInput): ParsedBarcodeMetadata {
  const primaryTitle = (input.title || '').trim();
  const brand = (input.brand || '').trim();
  const offerTitles = (input.offers || [])
    .map((o) => (o?.title || '').trim())
    .filter(Boolean);

  const titleAndOffers = [primaryTitle, ...offerTitles].filter(Boolean).join(' ');
  const suggestedFormats = detectFormats(titleAndOffers);
  const suggestedEditionTags = detectEditionTags(primaryTitle, brand, offerTitles);
  const tvHints = detectTVHints(titleAndOffers);
  const isLikelyBoxSet = detectBoxSet(titleAndOffers, tvHints.isTV);
  const yearHint = extractYearHint(primaryTitle, offerTitles);

  const suggestedItemName = stripNoiseFromTitle(primaryTitle, true) || primaryTitle;
  const cleanedBase = stripNoiseFromTitle(primaryTitle, false) || suggestedItemName;

  const altSet = new Set<string>();
  const addAlt = (candidate: string) => {
    const trimmed = candidate.trim();
    if (trimmed && trimmed.length >= 2 && trimmed.toLowerCase() !== cleanedBase.toLowerCase()) {
      altSet.add(trimmed);
    }
  };

  // If title has a colon subtitle, try before the colon (e.g. "Hellraiser: The Scarlet Box" -> "Hellraiser")
  if (cleanedBase.includes(':')) {
    addAlt(cleanedBase.split(':')[0]);
  }
  // If title has a dash separator, try before the dash
  if (cleanedBase.includes(' - ')) {
    addAlt(cleanedBase.split(' - ')[0]);
  }
  // Try stripping leading article
  if (/^(?:the|a|an)\s+/i.test(cleanedBase)) {
    addAlt(cleanedBase.replace(/^(?:the|a|an)\s+/i, ''));
  }
  // Try cleaned offer titles as alternates (often cleaner than an eBay primary title)
  for (const offerTitle of offerTitles.slice(0, 4)) {
    const cleanedOffer = stripNoiseFromTitle(offerTitle, false);
    if (cleanedOffer && cleanedOffer.length >= 2) {
      addAlt(cleanedOffer);
    }
  }
  // For multi-word box-set titles like "Hellraiser Scarlet", also add first 1-2 words for collection search
  if (isLikelyBoxSet) {
    const words = cleanedBase.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      addAlt(words.slice(0, Math.min(2, words.length)).join(' '));
      if (words[0].length >= 4 && !/^(the|a|an|lord|back|star|mad|bad)$/i.test(words[0])) {
        addAlt(words[0]);
      }
    }
  }

  let collectionQuery: string | null = null;
  if (isLikelyBoxSet) {
    collectionQuery = cleanedBase || suggestedItemName || null;
  }

  return {
    cleanedQuery: cleanedBase,
    alternateQueries: Array.from(altSet).slice(0, 6),
    collectionQuery,
    suggestedItemName,
    suggestedFormats,
    suggestedEditionTags,
    mediaTypeHint: tvHints.isTV ? 'tv' : 'movie',
    seasonHints: tvHints.seasons,
    isLikelyBoxSet,
    yearHint,
  };
}
