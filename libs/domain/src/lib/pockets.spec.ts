import { intentFits, transferIntent } from './pockets';

describe('transferIntent', () => {
  it('names the transfer by the kinds of its pockets', () => {
    expect(transferIntent('AVAILABLE', 'SAVINGS')).toBe('SAVE');
    expect(transferIntent('AVAILABLE', 'INVESTMENT')).toBe('INVEST');
    expect(transferIntent('SAVINGS', 'INVESTMENT')).toBe('INVEST');
    expect(transferIntent('INVESTMENT', 'AVAILABLE')).toBe('REDEEM');
    expect(transferIntent('SAVINGS', 'AVAILABLE')).toBe('REDEEM');
    expect(transferIntent('AVAILABLE', 'AVAILABLE')).toBe('MOVE');
    expect(transferIntent('SAVINGS', 'SAVINGS')).toBe('MOVE');
    expect(transferIntent('INVESTMENT', 'INVESTMENT')).toBe('MOVE');
  });
});

describe('intentFits', () => {
  it('accepts MOVE anywhere and the others only where they apply', () => {
    expect(intentFits('MOVE', 'AVAILABLE', 'SAVINGS')).toBe(true);
    expect(intentFits('SAVE', 'AVAILABLE', 'SAVINGS')).toBe(true);
    expect(intentFits('SAVE', 'AVAILABLE', 'INVESTMENT')).toBe(false);
    expect(intentFits('REDEEM', 'AVAILABLE', 'AVAILABLE')).toBe(false);
  });
});
