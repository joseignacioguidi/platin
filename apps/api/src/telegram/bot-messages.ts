import { TEXT_ENTRY_DATA_MESSAGES } from '@platin/contracts';
import type { TextEntryDataError } from '@platin/domain';

/** CURRENCY_NOT_ENABLED, NO_BALANCE_IN_CURRENCY and a source that no longer exists. */
export function dataErrorMessage(error: TextEntryDataError): string {
  switch (error.error) {
    case 'CURRENCY_NOT_ENABLED':
      return TEXT_ENTRY_DATA_MESSAGES.currencyNotEnabled(error.currency);
    case 'NO_BALANCE_IN_CURRENCY':
      return TEXT_ENTRY_DATA_MESSAGES.noBalanceInCurrency(error.accountName, error.currency);
    case 'SOURCE_NOT_FOUND':
      return TEXT_ENTRY_DATA_MESSAGES.sourceNotFound;
  }
}
