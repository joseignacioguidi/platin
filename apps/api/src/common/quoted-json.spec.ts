import { parseQuotedArray, parseQuotedJson } from './quoted-json';

describe('parseQuotedJson', () => {
  it('turns the numbers of the given keys into decimal strings, nested too', () => {
    const body = '{"bitcoin":{"usd":97123.4567891234},"tether":{"usd":1}}';
    expect(parseQuotedJson(body, ['usd'])).toEqual({
      bitcoin: { usd: '97123.4567891234' },
      tether: { usd: '1' },
    });
  });

  it('keeps many decimals and writes exponents as plain decimals', () => {
    const body = '[{"vcp":20615.519123456789,"c":1.2e-7,"other":3.5}]';
    expect(parseQuotedArray(body, ['vcp', 'c'], 'test')).toEqual([
      { vcp: '20615.519123456789', c: '0.00000012', other: 3.5 },
    ]);
  });

  it('leaves null and strings alone', () => {
    expect(parseQuotedJson('{"c":null,"d":"12"}', ['c', 'd'])).toEqual({ c: null, d: '12' });
  });

  it('an array source that answers an object is an error', () => {
    expect(() => parseQuotedArray('{"error":"x"}', ['c'], 'Data912')).toThrow(
      'Unexpected Data912 response',
    );
  });
});
