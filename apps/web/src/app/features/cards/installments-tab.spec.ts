import type { InstallmentStatement } from '@platin/contracts';
import { parsePeriod } from '@platin/domain';
import { clampStart, nextToPayIndex, pageStartFor } from './installments-tab';

const statement = (
  period: string,
  status: InstallmentStatement['status'],
): InstallmentStatement => ({
  period: parsePeriod(period),
  dueDate: `${period}-05`,
  status,
  installmentsTotal: { ARS: '1000.00', USD: '0.00' },
  installmentsCount: 1,
  releases: { ARS: '0.00', USD: '0.00' },
});

describe('nextToPayIndex', () => {
  it('the oldest closed statement not fully paid', () => {
    const list = [
      statement('2026-08', 'PAID'),
      statement('2026-09', 'PARTIALLY_PAID'),
      statement('2026-10', 'CLOSED'),
      statement('2026-11', 'OPEN'),
    ];
    expect(nextToPayIndex(list)).toBe(1);
  });

  it('the open one when everything closed is paid', () => {
    expect(nextToPayIndex([statement('2026-09', 'PAID'), statement('2026-10', 'OPEN')])).toBe(1);
  });

  it('the last one when all are paid, and -1 when there are none', () => {
    expect(nextToPayIndex([statement('2026-08', 'PAID'), statement('2026-09', 'PAID')])).toBe(1);
    expect(nextToPayIndex([])).toBe(-1);
  });
});

describe('chart pages of 6', () => {
  it('start at the chosen statement when there is room', () => {
    expect(pageStartFor(2, 12)).toBe(2);
  });

  it('keep the page full near the end, and from 0 with few statements', () => {
    expect(pageStartFor(10, 12)).toBe(6);
    expect(pageStartFor(3, 4)).toBe(0);
  });

  it('arrows stay within the first and the last statement', () => {
    expect(clampStart(-6, 12)).toBe(0);
    expect(clampStart(12, 12)).toBe(6);
  });
});
