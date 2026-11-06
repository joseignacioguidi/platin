import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { merchantPatternSchema, type MerchantRule } from '@platin/contracts';
import type { CategoryKind } from '@platin/domain';
import { PlButton, PlCategorySelect, PlSegmented, PlSegmentOption, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { CategoriesStore } from './categories.store';
import { CATEGORIES_TEXTS } from './categories.texts';
import { MerchantRulesStore } from './merchant-rules.store';

export interface RuleFormData {
  rule?: MerchantRule;
  /** A new rule for this category (from its detail). */
  categoryId?: string;
}

/** TXT-03: create, edit or delete a merchant rule. */
@Component({
  selector: 'pl-rule-form-sheet',
  imports: [PlSheet, PlButton, PlSegmented, PlCategorySelect, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet [heading]="rule ? r.editTitle : r.newTitle">
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()" novalidate>
        <pl-form-field
          [label]="r.pattern"
          controlId="rule-pattern"
          [hint]="r.patternHint"
          [error]="patternError()"
        >
          <input
            id="rule-pattern"
            type="text"
            maxlength="40"
            autocapitalize="off"
            [class]="input"
            [placeholder]="r.patternPlaceholder"
            [value]="pattern()"
            [attr.aria-invalid]="!!patternError()"
            (input)="pattern.set(value($event))"
          />
        </pl-form-field>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{{ r.kind }}</span>
          <pl-segmented
            [label]="r.kind"
            [options]="kinds"
            [value]="kind()"
            (valueChange)="setKind($event)"
          />
        </div>
        <pl-form-field [label]="r.category" controlId="rule-category">
          <pl-category-select
            inputId="rule-category"
            [label]="r.category"
            [kind]="kind()"
            [categories]="categories.categories()"
            [recentIds]="categories.recentIds()"
            [value]="categoryId()"
            (valueChange)="categoryId.set($event)"
          />
        </pl-form-field>
        @if (error()) {
          <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
        }
        <button plButton size="lg" type="submit" [disabled]="saving()">
          {{ rule ? r.save : r.create }}
        </button>
        @if (rule) {
          <button plButton="danger" type="button" [disabled]="saving()" (click)="remove()">
            {{ r.delete }}
          </button>
        }
      </form>
    </pl-sheet>
  `,
})
export class RuleFormSheet {
  protected readonly r = CATEGORIES_TEXTS.rules;
  protected readonly input = INPUT_CLASS;
  private readonly data = inject<RuleFormData>(DIALOG_DATA);
  protected readonly rule = this.data.rule;
  protected readonly categories = inject(CategoriesStore);
  private readonly store = inject(MerchantRulesStore);
  private readonly ref = inject(DialogRef);

  protected readonly kinds: PlSegmentOption<CategoryKind>[] = [
    { value: 'EXPENSE', label: CATEGORIES_TEXTS.kindSingular.EXPENSE },
    { value: 'INCOME', label: CATEGORIES_TEXTS.kindSingular.INCOME },
  ];
  private readonly initialCategory = this.rule?.categoryId ?? this.data.categoryId ?? null;
  protected readonly pattern = signal(this.rule?.pattern ?? '');
  protected readonly categoryId = signal<string | null>(this.initialCategory);
  protected readonly kind = signal<CategoryKind>(
    this.categories.byId(this.initialCategory)?.kind ?? 'EXPENSE',
  );
  protected readonly patternError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setKind(kind: CategoryKind): void {
    if (kind === this.kind()) return;
    this.kind.set(kind);
    this.categoryId.set(null);
  }

  protected async save(): Promise<void> {
    const parsed = merchantPatternSchema.safeParse(this.pattern());
    this.patternError.set(parsed.success ? null : (parsed.error.issues[0]?.message ?? null));
    const categoryId = this.categoryId();
    if (!parsed.success) return;
    if (!categoryId) {
      this.error.set(this.r.errors.category);
      return;
    }
    await this.run(() =>
      this.rule
        ? this.store.update(this.rule.id, { pattern: parsed.data, categoryId })
        : this.store.create({ pattern: parsed.data, categoryId }),
    );
  }

  protected async remove(): Promise<void> {
    const rule = this.rule;
    if (rule) await this.run(() => this.store.remove(rule.id));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await action();
      this.ref.close(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
