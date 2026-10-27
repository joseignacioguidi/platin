import { addMonths, Period } from '@platin/domain';
import { formatPeriod } from '../format/format';
import { PlSelectOption } from './select';

/**
 * Months around `center` as select options ("Octubre 2026"), oldest first: replaces
 * `<input type="month">`, which Firefox and Safari on desktop don't support.
 */
export function periodOptions(
  center: Period,
  monthsBefore: number,
  monthsAfter: number,
): PlSelectOption<Period>[] {
  const options: PlSelectOption<Period>[] = [];
  for (let offset = -monthsBefore; offset <= monthsAfter; offset++) {
    const period = addMonths(center, offset);
    options.push({ value: period, label: formatPeriod(period), keywords: period });
  }
  return options;
}
