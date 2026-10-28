import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { LucidePlus, LucideTrash2 } from '@lucide/angular';
import {
  announcementSettingSchema,
  defaultRateSettingSchema,
  registrationSettingSchema,
  suggestedCategoriesSettingSchema,
  type ColorToken,
  type Setting,
  type SettingKey,
  type SuggestedCategory,
} from '@platin/contracts';
import type { CategoryKind, LocalDate, RateType } from '@platin/domain';
import {
  PL_COLOR_CHOICES,
  PlButton,
  PlDateField,
  PlSegmented,
  PlSegmentOption,
  PlSelect,
  PlSelectOption,
} from '@platin/web-ui';
import type { z } from 'zod';
import { errorMessage } from '../../core/errors';
import { FormField, INPUT_CLASS } from '../../core/forms/form-field';
import { CATEGORY_ICONS } from '../../core/icons';
import { ADMIN_API, AdminApi, formatInstant } from './admin.api';
import { ADMIN_TEXTS } from './admin.texts';

const T = ADMIN_TEXTS.settings;

/** Frame of each setting: title, hint, content, save button and its result. */
@Component({
  selector: 'pl-admin-setting-card',
  imports: [PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 rounded-card bg-surface p-5' },
  template: `
    <h2 class="text-lg font-bold">{{ heading() }}</h2>
    <p class="-mt-2 text-sm text-muted">{{ hint() }}</p>
    <ng-content />
    @if (error()) {
      <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
    }
    <div class="flex flex-wrap items-center gap-3">
      <button plButton type="button" [disabled]="saving()" (click)="save()()">
        {{ t.save }}
      </button>
      <span class="text-sm text-muted" role="status">
        {{ saved() ? t.saved : updatedAt() ? t.lastUpdate(updatedAt()!) : '' }}
      </span>
    </div>
  `,
})
export class AdminSettingCard {
  readonly heading = input.required<string>();
  readonly hint = input.required<string>();
  readonly save = input.required<() => void>();
  readonly saving = input(false);
  readonly saved = input(false);
  readonly error = input<string | null>(null);
  readonly updatedAt = input<string | null>(null);
  protected readonly t = T;
}

/** Loads one setting, fills the form once and saves it validated with its schema. */
@Directive()
abstract class SettingForm<S extends z.ZodType> {
  protected abstract readonly key: SettingKey;
  protected abstract readonly schema: S;
  protected abstract fill(value: z.infer<S>): void;
  protected abstract read(): unknown;

  private readonly api = inject(AdminApi);
  protected readonly t = T;
  protected readonly setting = httpResource<Setting>(() => `${ADMIN_API}/settings/${this.key}`);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly updatedAt = signal<string | null>(null);

  constructor() {
    effect(() => {
      const setting = this.setting.value();
      if (!setting) return;
      untracked(() => {
        this.updatedAt.set(formatInstant(setting.updatedAt));
        const parsed = this.schema.safeParse(setting.value);
        if (parsed.success) this.fill(parsed.data);
      });
    });
  }

  protected readonly submit = async (): Promise<void> => {
    this.saved.set(false);
    const parsed = this.schema.safeParse(this.read());
    if (!parsed.success) {
      this.error.set(parsed.error.issues[0]?.message ?? errorMessage(null));
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const setting = await this.api.updateSetting(this.key, parsed.data);
      this.updatedAt.set(formatInstant(setting.updatedAt));
      this.saved.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  };
}

@Component({
  selector: 'pl-admin-registration-setting',
  imports: [AdminSettingCard, PlSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-admin-setting-card
      [heading]="t.registration.title"
      [hint]="t.registration.hint"
      [save]="submit"
      [saving]="saving()"
      [saved]="saved()"
      [error]="error()"
      [updatedAt]="updatedAt()"
    >
      <pl-segmented
        class="max-w-xs"
        [label]="t.registration.title"
        [options]="options"
        [value]="open()"
        (valueChange)="open.set($event)"
      />
    </pl-admin-setting-card>
  `,
})
export class RegistrationSetting extends SettingForm<typeof registrationSettingSchema> {
  protected readonly key = 'registration';
  protected readonly schema = registrationSettingSchema;
  protected readonly open = signal(true);
  protected readonly options: PlSegmentOption<boolean>[] = [
    { value: true, label: T.registration.open },
    { value: false, label: T.registration.closed },
  ];
  protected fill(value: z.infer<typeof registrationSettingSchema>): void {
    this.open.set(value.open);
  }
  protected read(): unknown {
    return { open: this.open() };
  }
}

@Component({
  selector: 'pl-admin-announcement-setting',
  imports: [AdminSettingCard, FormField, PlDateField, PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-admin-setting-card
      [heading]="t.announcement.title"
      [hint]="t.announcement.hint"
      [save]="submit"
      [saving]="saving()"
      [saved]="saved()"
      [error]="error()"
      [updatedAt]="updatedAt()"
    >
      <pl-form-field [label]="t.announcement.text" controlId="announcement-text">
        <textarea
          id="announcement-text"
          rows="3"
          maxlength="280"
          [class]="input + ' py-3'"
          [placeholder]="t.announcement.placeholder"
          [value]="text()"
          (input)="text.set(value($event))"
        ></textarea>
      </pl-form-field>
      <div class="grid gap-3 sm:grid-cols-2">
        <pl-form-field [label]="t.announcement.startsOn" controlId="announcement-from">
          <pl-date-field
            inputId="announcement-from"
            [label]="t.announcement.startsOn"
            [placeholder]="t.announcement.noDate"
            [value]="startsOn()"
            (valueChange)="startsOn.set($event)"
          />
        </pl-form-field>
        <pl-form-field [label]="t.announcement.endsOn" controlId="announcement-to">
          <pl-date-field
            inputId="announcement-to"
            [label]="t.announcement.endsOn"
            [placeholder]="t.announcement.noDate"
            [min]="startsOn()"
            [value]="endsOn()"
            (valueChange)="endsOn.set($event)"
          />
        </pl-form-field>
      </div>
      @if (startsOn() || endsOn()) {
        <button plButton="ghost" size="sm" type="button" class="self-start" (click)="clearDates()">
          {{ t.announcement.clearDates }}
        </button>
      }
    </pl-admin-setting-card>
  `,
})
export class AnnouncementSetting extends SettingForm<typeof announcementSettingSchema> {
  protected readonly key = 'announcement';
  protected readonly schema = announcementSettingSchema;
  protected readonly input = INPUT_CLASS;
  protected readonly text = signal('');
  protected readonly startsOn = signal<LocalDate | null>(null);
  protected readonly endsOn = signal<LocalDate | null>(null);
  protected fill(value: z.infer<typeof announcementSettingSchema>): void {
    this.text.set(value.text);
    this.startsOn.set(value.startsOn);
    this.endsOn.set(value.endsOn);
  }
  protected read(): unknown {
    return { text: this.text(), startsOn: this.startsOn(), endsOn: this.endsOn() };
  }
  protected clearDates(): void {
    this.startsOn.set(null);
    this.endsOn.set(null);
  }
  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}

@Component({
  selector: 'pl-admin-default-rate-setting',
  imports: [AdminSettingCard, PlSegmented],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-admin-setting-card
      [heading]="t.defaultRate.title"
      [hint]="t.defaultRate.hint"
      [save]="submit"
      [saving]="saving()"
      [saved]="saved()"
      [error]="error()"
      [updatedAt]="updatedAt()"
    >
      <pl-segmented
        class="max-w-sm"
        [label]="t.defaultRate.title"
        [options]="options"
        [value]="rate()"
        (valueChange)="rate.set($event)"
      />
    </pl-admin-setting-card>
  `,
})
export class DefaultRateSetting extends SettingForm<typeof defaultRateSettingSchema> {
  protected readonly key = 'default-rate';
  protected readonly schema = defaultRateSettingSchema;
  protected readonly rate = signal<RateType>('MEP');
  protected readonly options: PlSegmentOption<RateType>[] = (
    ['OFICIAL', 'MEP', 'BLUE'] as const
  ).map((value) => ({ value, label: T.rates[value] }));
  protected fill(value: z.infer<typeof defaultRateSettingSchema>): void {
    this.rate.set(value.rateType);
  }
  protected read(): unknown {
    return { rateType: this.rate() };
  }
}

@Component({
  selector: 'pl-admin-categories-setting',
  imports: [AdminSettingCard, PlSelect, PlButton, LucidePlus, LucideTrash2],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-admin-setting-card
      [heading]="t.categories.title"
      [hint]="t.categories.hint"
      [save]="submit"
      [saving]="saving()"
      [saved]="saved()"
      [error]="error()"
      [updatedAt]="updatedAt()"
    >
      <ul class="flex flex-col gap-2">
        @for (category of categories(); track $index; let i = $index) {
          <li
            class="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border border-line-soft p-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
          >
            <input
              type="text"
              maxlength="40"
              [class]="input + ' col-span-2 md:col-span-1'"
              [attr.aria-label]="t.categories.name"
              [value]="category.name"
              (input)="patch(i, { name: value($event) })"
            />
            <pl-select
              [label]="t.categories.kind"
              [options]="kinds"
              [value]="category.kind"
              (valueChange)="$event && patch(i, { kind: $event })"
            />
            <pl-select
              [label]="t.categories.icon"
              [options]="icons"
              [value]="category.icon"
              (valueChange)="$event && patch(i, { icon: $event })"
            />
            <pl-select
              [label]="t.categories.color"
              [options]="colors"
              [value]="category.color"
              (valueChange)="$event && patch(i, { color: $event })"
            />
            <button
              plButton="ghost"
              size="icon"
              type="button"
              [attr.aria-label]="t.categories.remove(category.name)"
              (click)="removeAt(i)"
            >
              <svg lucideTrash2 [size]="18"></svg>
            </button>
          </li>
        }
      </ul>
      <button plButton="secondary" type="button" class="self-start" (click)="add()">
        <svg lucidePlus [size]="18"></svg>{{ t.categories.add }}
      </button>
    </pl-admin-setting-card>
  `,
})
export class CategoriesSetting extends SettingForm<typeof suggestedCategoriesSettingSchema> {
  protected readonly key = 'suggested-categories';
  protected readonly schema = suggestedCategoriesSettingSchema;
  protected readonly input = INPUT_CLASS;
  protected readonly categories = signal<SuggestedCategory[]>([]);
  protected readonly kinds: PlSelectOption<CategoryKind>[] = [
    { value: 'EXPENSE', label: T.categories.expense },
    { value: 'INCOME', label: T.categories.income },
  ];
  protected readonly icons: PlSelectOption<string>[] = CATEGORY_ICONS.map((icon) => ({
    value: icon.name,
    label: icon.label,
    icon: icon.name,
  }));
  protected readonly colors: PlSelectOption<ColorToken>[] = PL_COLOR_CHOICES.map((choice) => ({
    value: choice.tone,
    label: choice.label,
    tone: choice.tone,
  }));

  protected fill(value: z.infer<typeof suggestedCategoriesSettingSchema>): void {
    this.categories.set(value.categories);
  }
  protected read(): unknown {
    return { categories: this.categories() };
  }
  protected patch(index: number, changes: Partial<SuggestedCategory>): void {
    this.categories.update((list) =>
      list.map((category, i) => (i === index ? { ...category, ...changes } : category)),
    );
  }
  protected add(): void {
    this.categories.update((list) => [
      ...list,
      { name: '', kind: 'EXPENSE', icon: 'tag', color: 'muted' },
    ]);
  }
  protected removeAt(index: number): void {
    this.categories.update((list) => list.filter((_, i) => i !== index));
  }
  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}

/** ADM-05: global configuration, one form per key. */
@Component({
  selector: 'pl-admin-settings-page',
  imports: [RegistrationSetting, AnnouncementSetting, DefaultRateSetting, CategoriesSetting],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="mb-5 text-2xl font-bold tracking-[-0.03em]">{{ title }}</h1>
    <div class="flex flex-col gap-4">
      <pl-admin-registration-setting />
      <pl-admin-announcement-setting />
      <pl-admin-default-rate-setting />
      <pl-admin-categories-setting />
    </div>
  `,
})
export class AdminSettingsPage {
  protected readonly title = T.title;
}
