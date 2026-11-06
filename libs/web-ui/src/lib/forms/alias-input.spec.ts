import { describe, expect, it } from 'vitest';
import { addAlias } from './alias-input';

describe('addAlias', () => {
  it('normalizes and does not repeat', () => {
    expect(addAlias([], ' Mércado Pago ', 10)).toEqual(['mercadopago']);
    expect(addAlias(['mp'], 'MP', 10)).toEqual(['mp']);
    expect(addAlias(['mp'], '   ', 10)).toEqual(['mp']);
  });

  it('stops at the maximum', () => {
    expect(addAlias(['a1', 'b1'], 'c1', 2)).toEqual(['a1', 'b1']);
  });
});
