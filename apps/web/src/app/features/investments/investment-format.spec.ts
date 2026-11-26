import {
  formatRate,
  formatUnits,
  parseTypedUnits,
  percentFromTna,
  tnaFromPercent,
} from './investment-format';

describe('investment formats', () => {
  it('TNA typed as a percentage goes to the API as a ratio, and back', () => {
    expect(tnaFromPercent('30')).toBe('0.300000');
    expect(tnaFromPercent('29,5')).toBe('0.295000');
    expect(tnaFromPercent('abc')).toBeUndefined();
    expect(tnaFromPercent('-3')).toBeUndefined();
    expect(percentFromTna('0.300000')).toBe('30');
    expect(percentFromTna('0.295000')).toBe('29,5');
  });

  it('units accept comma or dot with up to 8 decimals', () => {
    expect(parseTypedUnits('24,25357324')).toBe('24.25357324');
    expect(parseTypedUnits(' 150 ')).toBe('150');
    expect(parseTypedUnits('0,0015')).toBe('0.0015');
    expect(parseTypedUnits('1,123456789')).toBeUndefined();
    expect(parseTypedUnits('')).toBeUndefined();
  });

  it('units show grouped, without trailing zeros', () => {
    expect(formatUnits('174.25357324')).toBe('174,25357324');
    expect(formatUnits('150.00000000')).toBe('150');
    expect(formatUnits('12500.50000000')).toBe('12.500,5');
  });

  it('rates keep their sign', () => {
    expect(formatRate('0.0833')).toBe('+8,3 %');
    expect(formatRate('-0.1000')).toBe('−10,0 %');
  });
});
