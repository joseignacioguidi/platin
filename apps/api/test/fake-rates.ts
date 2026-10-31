import { FetchedRate, RateProvider } from '../src/rates/rate-provider';

/** Rates for tests: no network. `failing` simulates DolarApi being down. */
export class FakeRateProvider extends RateProvider {
  readonly name = 'fake';
  failing = false;
  calls = 0;
  rates: FetchedRate[] = [
    { type: 'OFICIAL', buy: '1500', sell: '1550' },
    { type: 'MEP', buy: '1190', sell: '1200' },
    { type: 'BLUE', buy: '1545', sell: '1565' },
    { currency: 'EUR', type: 'OFICIAL', buy: '1600', sell: '1680' },
    { currency: 'BRL', type: 'OFICIAL', buy: '270', sell: '285' },
    { currency: 'CLP', type: 'OFICIAL', buy: '1.55', sell: '1.65' },
    { currency: 'UYU', type: 'OFICIAL', buy: '36', sell: '38' },
  ];

  async fetchAll(): Promise<FetchedRate[]> {
    this.calls += 1;
    if (this.failing) throw new Error('DolarApi is down');
    return this.rates;
  }
}
