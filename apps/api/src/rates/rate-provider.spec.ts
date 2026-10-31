import { parseCotizaciones, parseDolarApi } from './rate-provider';

describe('DolarApi parsing', () => {
  it('reads the dollar types without going through floats', () => {
    const body =
      '[{"moneda":"USD","casa":"oficial","compra":1500.1,"venta":1550.35},' +
      '{"moneda":"USD","casa":"bolsa","compra":1190,"venta":1200.5},' +
      '{"moneda":"USD","casa":"cripto","compra":1,"venta":2}]';
    expect(parseDolarApi(body)).toEqual([
      { type: 'OFICIAL', buy: '1500.1', sell: '1550.35' },
      { type: 'MEP', buy: '1190', sell: '1200.5' },
    ]);
  });

  it('reads EUR, BRL, CLP and UYU from /v1/cotizaciones at the oficial rate, skipping the dollar', () => {
    const body =
      '[{"moneda":"USD","casa":"oficial","compra":1500,"venta":1550},' +
      '{"moneda":"EUR","casa":"oficial","compra":1600.25,"venta":1680.5},' +
      '{"moneda":"BRL","casa":"oficial","compra":270,"venta":285},' +
      '{"moneda":"CLP","casa":"oficial","compra":1.55,"venta":1.6512},' +
      '{"moneda":"UYU","casa":"oficial","compra":36,"venta":38},' +
      '{"moneda":"XYZ","casa":"oficial","compra":1,"venta":1}]';
    expect(parseCotizaciones(body)).toEqual([
      { currency: 'EUR', type: 'OFICIAL', buy: '1600.25', sell: '1680.5' },
      { currency: 'BRL', type: 'OFICIAL', buy: '270', sell: '285' },
      { currency: 'CLP', type: 'OFICIAL', buy: '1.55', sell: '1.6512' },
      { currency: 'UYU', type: 'OFICIAL', buy: '36', sell: '38' },
    ]);
  });
});
