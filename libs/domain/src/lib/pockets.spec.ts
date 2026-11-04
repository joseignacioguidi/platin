import { canChangeKind, canPayCards, transferHasAccount, transferIntent } from './pockets';

describe('transferIntent', () => {
  it('names the transfer by the kinds of its pockets', () => {
    expect(transferIntent('AVAILABLE', 'SAVINGS')).toBe('SAVE');
    expect(transferIntent('AVAILABLE', 'INVESTMENT')).toBe('INVEST');
    expect(transferIntent('INVESTMENT', 'AVAILABLE')).toBe('REDEEM');
    expect(transferIntent('SAVINGS', 'AVAILABLE')).toBe('REDEEM');
    expect(transferIntent('AVAILABLE', 'AVAILABLE')).toBe('MOVE');
  });

  it('moving money to or from a spending reserve is a move', () => {
    expect(transferIntent('AVAILABLE', 'SPENDING')).toBe('MOVE');
    expect(transferIntent('SPENDING', 'AVAILABLE')).toBe('MOVE');
  });
});

describe('transferHasAccount', () => {
  it('needs an account balance on one end', () => {
    expect(transferHasAccount('AVAILABLE', 'SAVINGS')).toBe(true);
    expect(transferHasAccount('INVESTMENT', 'AVAILABLE')).toBe(true);
    expect(transferHasAccount('AVAILABLE', 'AVAILABLE')).toBe(true);
    expect(transferHasAccount('SAVINGS', 'INVESTMENT')).toBe(false);
    expect(transferHasAccount('SPENDING', 'SAVINGS')).toBe(false);
  });
});

describe('canPayCards', () => {
  it('accepts the account balance and spending reserves', () => {
    expect(canPayCards('AVAILABLE')).toBe(true);
    expect(canPayCards('SPENDING')).toBe(true);
    expect(canPayCards('SAVINGS')).toBe(false);
    expect(canPayCards('INVESTMENT')).toBe(false);
  });
});

describe('canChangeKind', () => {
  it('changes only between reserve uses', () => {
    expect(canChangeKind('SPENDING', 'SAVINGS')).toBe(true);
    expect(canChangeKind('INVESTMENT', 'SPENDING')).toBe(true);
    expect(canChangeKind('SAVINGS', 'AVAILABLE')).toBe(false);
    expect(canChangeKind('AVAILABLE', 'SPENDING')).toBe(false);
    expect(canChangeKind('AVAILABLE', 'AVAILABLE')).toBe(true);
  });
});
