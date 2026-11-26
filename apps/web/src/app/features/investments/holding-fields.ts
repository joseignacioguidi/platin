import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { HoldingRequest, Instrument, Listing } from '@platin/contracts';
import type { Currency } from '@platin/domain';
import { PlSegmented, PlSegmentOption } from '@platin/web-ui';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { parseTypedUnits } from './investment-format';
import { InstrumentPicker } from './instrument-picker';
import { INVESTMENTS_TEXTS } from './investments.texts';

/** The instrument types the app can price (ADR 0040; phase 43 brings FCI). */
export const PRICED_INSTRUMENTS: readonly Instrument[] = ['MUTUAL_FUND'];

export interface HoldingDraft {
  mode: 'AUTO' | 'MANUAL';
  listing: Listing | null;
  /** Units it has today, as typed. */
  units: string;
}

export const emptyHoldingDraft = (): HoldingDraft => ({ mode: 'AUTO', listing: null, units: '' });

/** The request for PUT /pockets/:id/holding, null for "Lo sigo a mano", or an error. */
export function holdingRequest(
  draft: HoldingDraft,
): { request: HoldingRequest | null } | { error: string } {
  if (draft.mode === 'MANUAL') return { request: null };
  if (!draft.listing) return { error: INVESTMENTS_TEXTS.link.choose };
  const units = parseTypedUnits(draft.units || '0');
  if (units === undefined) return { error: INVESTMENTS_TEXTS.units.invalid };
  return { request: { instrumentId: draft.listing.id, initialUnits: units } };
}

/** INV-07: automatic price (instrument and units) or "Lo sigo a mano". */
@Component({
  selector: 'pl-holding-fields',
  imports: [PlSegmented, InstrumentPicker, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <div class="flex flex-col gap-1.5">
      <pl-segmented [label]="t.title" [options]="modes" [value]="draft().mode" (valueChange)="setMode($event)" />
      @if (draft().mode === 'MANUAL') {
        <p class="text-sm text-muted">{{ t.manualHint }}</p>
      }
    </div>
    @if (draft().mode === 'AUTO') {
      <pl-instrument-picker
        [type]="type()"
        [currency]="currency()"
        [selected]="draft().listing"
        (selectedChange)="setListing($event)"
      />
      <pl-form-field [label]="t.initialUnits(unitsName())" controlId="holding-units">
        <input
          id="holding-units"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          [class]="input + ' font-amount'"
          [value]="draft().units"
          (input)="setUnits($event)"
        />
      </pl-form-field>
    }
  `,
})
export class HoldingFields {
  protected readonly t = INVESTMENTS_TEXTS.link;
  protected readonly input = INPUT_CLASS;
  readonly type = input.required<Instrument>();
  readonly currency = input.required<Currency>();
  readonly draft = model.required<HoldingDraft>();

  protected readonly modes: PlSegmentOption<HoldingDraft['mode']>[] = [
    { value: 'AUTO', label: INVESTMENTS_TEXTS.link.title },
    { value: 'MANUAL', label: INVESTMENTS_TEXTS.link.manual },
  ];
  protected readonly unitsName = computed(() => INVESTMENTS_TEXTS.units.names[this.type()]);

  protected setMode(mode: HoldingDraft['mode']): void {
    this.draft.update((draft) => ({ ...draft, mode }));
  }

  protected setListing(listing: Listing | null): void {
    this.draft.update((draft) => ({ ...draft, listing }));
  }

  protected setUnits(event: Event): void {
    const units = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({ ...draft, units }));
  }
}
