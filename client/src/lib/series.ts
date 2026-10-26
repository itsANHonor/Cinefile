import { PhysicalItem, Series } from '../types';

export interface SeriesRun {
  series: Series;
  startIndex: number;
  endIndex: number;
  count: number;
}

export interface RowSeriesSegment {
  series: Series;
  startCol: number;
  spanCols: number;
  totalInRun: number;
  continuesFromPrevRow: boolean;
  continuesToNextRow: boolean;
}

export interface GridRowGroup {
  rowIndex: number;
  items: Array<{
    item: PhysicalItem;
    index: number;
    activeSeries: Series | null;
  }>;
  segments: RowSeriesSegment[];
}

export function getItemSeriesList(physicalItem: PhysicalItem): Series[] {
  const map = new Map<number, Series>();
  for (const media of physicalItem.media ?? []) {
    for (const s of media.series ?? []) {
      if (s && typeof s.id === 'number' && !map.has(s.id)) {
        map.set(s.id, s);
      }
    }
  }

  const list = Array.from(map.values());
  if (list.length <= 1) return list;

  const preferredId =
    physicalItem.sort_series_id ||
    physicalItem.primary_series_id ||
    physicalItem.media?.find((m) => m.primary_series_id)?.primary_series_id;

  if (preferredId != null) {
    const idx = list.findIndex((s) => s.id === preferredId);
    if (idx > 0) {
      const [preferred] = list.splice(idx, 1);
      list.unshift(preferred);
    }
  }

  return list;
}

export function getPrimaryItemSeries(physicalItem: PhysicalItem): Series | null {
  const list = getItemSeriesList(physicalItem);
  return list[0] ?? null;
}

export function computeGridRowsWithSeries(
  items: PhysicalItem[],
  columns: number,
  options: { showSingleItemSeries?: boolean } = {}
): GridRowGroup[] {
  const safeCols = Math.max(1, columns);
  const minRunLength = options.showSingleItemSeries ? 1 : 2;

  const itemPrimarySeries = items.map((item) => getPrimaryItemSeries(item));
  const activeRunByIndex = new Map<number, SeriesRun>();

  let i = 0;
  while (i < items.length) {
    const currentSeries = itemPrimarySeries[i];
    if (!currentSeries) {
      i += 1;
      continue;
    }

    let j = i;
    while (
      j + 1 < items.length &&
      itemPrimarySeries[j + 1]?.id === currentSeries.id
    ) {
      j += 1;
    }

    const count = j - i + 1;
    if (count >= minRunLength) {
      const run: SeriesRun = {
        series: currentSeries,
        startIndex: i,
        endIndex: j,
        count,
      };
      for (let k = i; k <= j; k += 1) {
        activeRunByIndex.set(k, run);
      }
    }

    i = j + 1;
  }

  const rows: GridRowGroup[] = [];
  const totalRows = Math.ceil(items.length / safeCols);

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex += 1) {
    const rowStart = rowIndex * safeCols;
    const rowEnd = Math.min(items.length, rowStart + safeCols) - 1;
    const rowItems: GridRowGroup['items'] = [];
    const segments: RowSeriesSegment[] = [];

    let colIdx = rowStart;
    while (colIdx <= rowEnd) {
      const run = activeRunByIndex.get(colIdx);
      if (!run) {
        colIdx += 1;
        continue;
      }

      const segStart = colIdx;
      let segEnd = colIdx;
      while (
        segEnd + 1 <= rowEnd &&
        activeRunByIndex.get(segEnd + 1) === run
      ) {
        segEnd += 1;
      }

      segments.push({
        series: run.series,
        startCol: segStart - rowStart + 1,
        spanCols: segEnd - segStart + 1,
        totalInRun: run.count,
        continuesFromPrevRow: run.startIndex < rowStart,
        continuesToNextRow: run.endIndex > rowEnd,
      });

      colIdx = segEnd + 1;
    }

    for (let idx = rowStart; idx <= rowEnd; idx += 1) {
      const run = activeRunByIndex.get(idx);
      rowItems.push({
        item: items[idx],
        index: idx,
        activeSeries: run ? run.series : null,
      });
    }

    rows.push({
      rowIndex,
      items: rowItems,
      segments,
    });
  }

  return rows;
}
