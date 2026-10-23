import { LocalDate, parseLocalDate, parsePeriod, Period } from './dates';
import { Money } from './money';

export const ars = (amount: string): Money => Money.of(amount, 'ARS');
export const usd = (amount: string): Money => Money.of(amount, 'USD');
export const d = (value: string): LocalDate => parseLocalDate(value);
export const p = (value: string): Period => parsePeriod(value);
