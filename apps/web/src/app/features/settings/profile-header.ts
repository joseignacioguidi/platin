import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { LucidePencil } from '@lucide/angular';
import { updateUserRequestSchema } from '@platin/contracts';
import { PlButton } from '@platin/web-ui';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/errors';
import { INPUT_CLASS } from '../../core/forms/form-field';
import { initials } from '../../layout/nav-links';
import { SETTINGS_TEXTS } from './settings.texts';

/**
 * AUTH-10 "Vos": name and email as text. The pencil turns the name into a field in the same
 * place; Enter saves and Escape cancels. The email can't be edited.
 */
@Component({
  selector: 'pl-profile-header',
  imports: [ReactiveFormsModule, PlButton, LucidePencil],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="flex items-center gap-4 rounded-card bg-surface p-4 lg:px-6 lg:py-5"
      [attr.aria-label]="t.you"
    >
      <span
        class="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xl font-extrabold text-brand-strong lg:size-14"
        aria-hidden="true"
        >{{ initials() }}</span
      >
      @if (editing()) {
        <form
          class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          (submit)="$event.preventDefault(); save()"
          (keydown.escape)="cancel()"
        >
          <label for="profile-name" class="sr-only">{{ t.name }}</label>
          <input
            #nameInput
            id="profile-name"
            type="text"
            autocomplete="given-name"
            [class]="inputClass + ' min-w-0 flex-[1_1_12rem]'"
            [formControl]="name"
            [attr.aria-invalid]="!!error()"
            [attr.aria-describedby]="error() ? 'profile-name-error' : null"
          />
          <button plButton size="sm" type="submit" [disabled]="saving()">{{ t.saveName }}</button>
          <button plButton="ghost" size="sm" type="button" (click)="cancel()">
            {{ t.cancel }}
          </button>
          @if (error()) {
            <p id="profile-name-error" class="w-full text-sm text-expense-ink" role="alert">
              {{ error() }}
            </p>
          }
        </form>
      } @else {
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <p class="truncate text-lg font-extrabold lg:text-xl">{{ user()?.name || t.noName }}</p>
          <p class="truncate text-sm text-muted">{{ user()?.email }}</p>
          @if (message()) {
            <p class="text-sm text-brand-strong" role="status">{{ message() }}</p>
          }
        </div>
        <button
          #pencil
          plButton="secondary"
          size="icon"
          type="button"
          [attr.aria-label]="t.editName"
          [attr.title]="t.editName"
          (click)="edit()"
        >
          <svg lucidePencil [size]="18" aria-hidden="true"></svg>
        </button>
      }
    </section>
  `,
})
export class ProfileHeader {
  protected readonly t = SETTINGS_TEXTS.profile;
  protected readonly inputClass = INPUT_CLASS;
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  protected readonly user = this.auth.user;
  protected readonly initials = computed(() => initials(this.user()?.name, this.user()?.email));

  protected readonly name = inject(NonNullableFormBuilder).control('');
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly pencil = viewChild('pencil', { read: ElementRef<HTMLButtonElement> });

  protected edit(): void {
    this.name.setValue(this.user()?.name ?? '');
    this.error.set(null);
    this.message.set(null);
    this.editing.set(true);
    // The field takes the pencil's place: focus moves into it.
    afterNextRender(() => this.nameInput()?.nativeElement.select(), { injector: this.injector });
  }

  protected cancel(): void {
    this.close();
    this.error.set(null);
  }

  /** Back to text, with the focus on the pencil again. */
  private close(): void {
    this.editing.set(false);
    afterNextRender(() => this.pencil()?.nativeElement.focus(), { injector: this.injector });
  }

  protected async save(): Promise<void> {
    const parsed = updateUserRequestSchema.shape.name.safeParse(this.name.value.trim() || null);
    if (!parsed.success) {
      this.error.set(parsed.error.issues[0]?.message ?? null);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.auth.updateProfile({ name: parsed.data });
      this.close();
      this.message.set(this.t.saved);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}
