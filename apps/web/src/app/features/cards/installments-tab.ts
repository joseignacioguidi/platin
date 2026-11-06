import type { InstallmentStatement } from '@platin/contracts';

/** Statements shown at a time in the "Cuotas por resumen" chart. */
export const CHART_PAGE = 6;

/**
 * TAR-05: the statement chosen on entering, the next one to pay: the oldest closed and not fully
 * paid; else the open one; else the last one. -1 for an empty list.
 */
export function nextToPayIndex(list: readonly InstallmentStatement[]): number {
  const unpaid = list.findIndex((s) => s.status === 'CLOSED' || s.status === 'PARTIALLY_PAID');
  if (unpaid >= 0) return unpaid;
  const open = list.findIndex((s) => s.status === 'OPEN');
  return open >= 0 ? open : list.length - 1;
}

/** First statement of the page that shows `index`, starting at it when there is room. */
export function pageStartFor(index: number, total: number, size = CHART_PAGE): number {
  return clampStart(index, total, size);
}

/** A page start within [0, total − size]. */
export function clampStart(start: number, total: number, size = CHART_PAGE): number {
  return Math.max(0, Math.min(start, total - size));
}
