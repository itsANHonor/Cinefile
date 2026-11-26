/**
 * Shared constants for the Cinefile application.
 */

/**
 * Standard Blu-ray case width in millimeters.
 * Used to convert between simplified "unit" capacity and precise mm measurements.
 * 1 unit = 15mm (allows realistic finger space between cases)
 */
export const STANDARD_UNIT_MM = 15;

/**
 * Previous standard unit width (12.5mm). Only used by the one-time
 * source-aware migration that upgrades existing shelves to 15mm.
 */
export const LEGACY_STANDARD_UNIT_MM = 12.5;

/**
 * Default Physical Library name (seeded on first run).
 */
export const DEFAULT_LIBRARY_NAME = 'default';
export const DEFAULT_LIBRARY_DISPLAY_NAME = 'My Physical Library';
