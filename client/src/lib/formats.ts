import { PhysicalFormat } from '../types';

/**
 * Canonical order for physical formats. Display lists, filter chips, and
 * statistics should use this ordering unless a facet endpoint returns a
 * different server-defined order. The synthetic "all" value from
 * `PhysicalFormat` is intentionally excluded because it is a filter sentinel,
 * not a real format.
 */
export const PHYSICAL_FORMATS: PhysicalFormat[] = [
  '4K UHD',
  '3D Blu-ray',
  'Blu-ray',
  'DVD',
  'Digital-UHD',
  'Digital-HD',
  'Digital-SD',
  'LaserDisc',
  'VHS',
];

/**
 * Human-readable short label for each format.
 */
export const formatLabels: Record<PhysicalFormat, string> = {
  '4K UHD': '4K UHD',
  '3D Blu-ray': '3D Blu-ray',
  'Blu-ray': 'Blu-ray',
  DVD: 'DVD',
  'Digital-UHD': 'Digital UHD',
  'Digital-HD': 'Digital HD',
  'Digital-SD': 'Digital SD',
  LaserDisc: 'LaserDisc',
  VHS: 'VHS',
  all: 'All Formats',
};

/**
 * Tailwind color classes used for format badges and statistics.
 * Keys intentionally include only the most common physical formats; callers
 * should fall back to a neutral badge for any other value.
 */
export const formatBadgeClasses: Record<string, string> = {
  '4K UHD': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  '3D Blu-ray': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'Blu-ray': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DVD: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Digital-UHD': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'Digital-HD': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  'Digital-SD': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  LaserDisc: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  VHS: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

/**
 * Stable sort comparator for formats based on the canonical order.
 */
export function compareFormats(a: string, b: string): number {
  const indexA = PHYSICAL_FORMATS.indexOf(a as PhysicalFormat);
  const indexB = PHYSICAL_FORMATS.indexOf(b as PhysicalFormat);
  if (indexA === -1 && indexB === -1) return a.localeCompare(b);
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;
  return indexA - indexB;
}

/**
 * Returns true if the supplied string is a known physical format.
 */
export function isPhysicalFormat(value: string): value is PhysicalFormat {
  return PHYSICAL_FORMATS.includes(value as PhysicalFormat);
}

/**
 * Sort an array of format strings into canonical order, dropping unknowns.
 */
export function sortFormatStrings(formats: string[]): string[] {
  return formats.filter(isPhysicalFormat).sort(compareFormats);
}

/**
 * Sort an array of {format, count} objects into canonical order, keeping
 * unknown entries at the end in alphabetical order.
 */
export function sortFormatCounts<T extends { format: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareFormats(a.format, b.format));
}
