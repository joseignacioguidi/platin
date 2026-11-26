import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import type { TermDeposit, TermDepositRequest } from '@platin/contracts';
import { compareDates, Currency, LocalDate, parseLocalDate } from '@platin/domain';
import { parseTypedAmount, PlDateField } from '@platin/web-ui';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { percentFromTna, tnaFromPercent } from './investment-format';
import { INVESTMENTS_TEXTS } from './investments.texts';

/** What the four fields hold, as typed. */
export interface TermDepositDraft {
  principal: string;
  tna: string;
  startDate: LocalDate | null;
  endDate: LocalDate | null;
}

export const emptyTermDepositDraft = (): TermDepositDraft => ({
  principal: '',
  tna: '',
  startDate: null,
  endDate: null,
});

export function draftFromTerms(terms: TermDeposit): TermDepositDraft {
  return {
    principal: terms.principal.replace('.', ','),
    tna: percentFromTna(terms.tna),
    startDate: parseLocalDate(terms.startDate),
    endDate: parseLocalDate(terms.endDate),
  };
}

/** The request for PUT /pockets/:id/term-deposit, or the message of the first problem. */
export function termDepositRequest(
  draft: TermDepositDraft,
): { request: TermDepositRequest } | { error: string } {
  const errors = INVESTMENTS_TEXTS.termDeposit.errors;
  const principal = parseTypedAmount(draft.principal);
  if (!principal || !/[1-9]/.test(principal)) {
    return { error: errors.principal };
  }
  const tna = tnaFromPercent(draft.tna);
  if (tna === undefined) return { error: errors.tna };
  if (!draft.startDate || !draft.endDate) return { error: errors.dates };
  if (compareDates(draft.endDate, draft.startDate) <= 0) return { error: errors.order };
  return { request: { principal, tna, startDate: draft.startDate, endDate: draft.endDate } };
}

/** INV-12: capital, TNA, start and end of a term deposit. */
@Component({
  selector: 'pl-term-deposit-fields',
  imports: [FormField, PlDateField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <pl-form-field [label]="t.principal + ' (' + currency() + ')'" controlId="td-principal">
      <input
        id="td-principal"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [class]="input + ' font-amount'"
        [value]="draft().principal"
        (input)="set('principal', $event)"
      />
    </pl-form-field>
    <pl-form-field [label]="t.tna" controlId="td-tna">
      <input
        id="td-tna"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        [class]="input + ' font-amount'"
        [placeholder]="t.tnaPlaceholder"
        [value]="draft().tna"
        (input)="set('tna', $event)"
      />
    </pl-form-field>
    <div class="grid grid-cols-2 gap-3">
      <pl-form-field [label]="t.startDate" controlId="td-start">
        <pl-date-field
          inputId="td-start"
          [label]="t.startDate"
          [value]="draft().startDate"
          (valueChange)="setDate('startDate', $event)"
        />
      </pl-form-field>
      <pl-form-field [label]="t.endDate" controlId="td-end">
        <pl-date-field
          inputId="td-end"
          [label]="t.endDate"
          [min]="draft().startDate"
          [value]="draft().endDate"
          (valueChange)="setDate('endDate', $event)"
        />
      </pl-form-field>
    </div>
  `,
})
export class TermDepositFields {
  protected readonly t = INVESTMENTS_TEXTS.termDeposit;
  protected readonly input = INPUT_CLASS;
  readonly draft = model.required<TermDepositDraft>();
  readonly currency = input.required<Currency>();

  protected set(field: 'principal' | 'tna', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected setDate(field: 'startDate' | 'endDate', value: LocalDate | null): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }
}
