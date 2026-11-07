import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { LucideSend, LucideTrash2 } from '@lucide/angular';
import {
  plainMessage,
  TEXT_ENTRY_MESSAGES,
  type TelegramLinkCode,
  type TelegramStatus,
  type UnparsedMessage,
} from '@platin/contracts';
import { localDateAt, type TextEntryError } from '@platin/domain';
import { formatDate, PlButton } from '@platin/web-ui';
import { firstValueFrom } from 'rxjs';
import { API } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { PROFILE_GROUP } from './profile-group';
import { SETTINGS_TEXTS } from './settings.texts';

/**
 * BOT-01 and BOT-06: link Telegram with a link or a code (10 minutes, one use), unlink it, and
 * the messages the bot did not understand. Hidden when the bot is not configured.
 */
@Component({
  selector: 'pl-telegram-settings',
  imports: [PlButton, LucideSend, LucideTrash2],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status.value()?.enabled) {
      <section [class]="group.section" aria-labelledby="telegram-title">
        <h2 id="telegram-title" [class]="group.title">{{ t.title }}</h2>
        <div [class]="group.body">
          <!-- AUTH-10: the state with its actions in the same row. -->
          <div class="flex flex-wrap items-center gap-3">
            <span
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-transfer-soft text-transfer"
              aria-hidden="true"
            >
              <svg lucideSend [size]="20"></svg>
            </span>
            <p class="min-w-0 flex-[1_1_12rem] text-sm text-muted">{{ statusText() }}</p>
            @if (linked()) {
              <div class="flex w-full gap-2 sm:w-auto">
                @if (!code()) {
                  <button
                    plButton="secondary"
                    size="sm"
                    type="button"
                    class="flex-1 sm:flex-none"
                    aria-describedby="telegram-relink-hint"
                    [disabled]="busy()"
                    (click)="createCode()"
                  >
                    {{ t.relink }}
                  </button>
                  <span id="telegram-relink-hint" class="sr-only">{{ t.relinkHint }}</span>
                }
                <button
                  plButton="secondary"
                  size="sm"
                  type="button"
                  class="flex-1 text-expense-ink! sm:flex-none"
                  [disabled]="busy()"
                  (click)="unlink()"
                >
                  {{ t.unlink }}
                </button>
              </div>
            } @else if (!code()) {
              <button plButton size="sm" type="button" [disabled]="busy()" (click)="createCode()">
                {{ t.link }}
              </button>
            }
          </div>
          <p class="text-[15px] text-muted">{{ t.intro }}</p>

          @if (error()) {
            <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
          }

          @if (code(); as code) {
            <div class="flex flex-col gap-3 rounded-2xl border border-line p-4">
              <a plButton size="lg" [href]="code.url" target="_blank" rel="noopener">
                {{ t.open }}
              </a>
              <p class="text-sm text-muted">{{ t.orSend }}</p>
              <p class="font-amount text-center text-xl font-semibold whitespace-nowrap">
                /vincular {{ code.code }}
              </p>
              <p class="text-center text-sm text-muted" role="timer" aria-live="off">
                {{ remaining() > 0 ? t.expiresIn(remainingText()) : t.expired }}
              </p>
              @if (remaining() === 0) {
                <button plButton="secondary" type="button" (click)="createCode()">
                  {{ t.newCode }}
                </button>
              }
            </div>
          }

          @if (linked()) {
            <div class="flex flex-col gap-2 border-t border-line-soft pt-4">
              <h3 class="text-[15px] font-bold">{{ t.unparsedTitle }}</h3>
              @if ((unparsed.value() ?? []).length === 0) {
                <p class="text-[13px] text-muted">{{ t.unparsedHint }} {{ t.unparsedEmpty }}</p>
              } @else {
                <p class="text-[13px] text-muted">{{ t.unparsedHint }}</p>
                <ul class="flex flex-col divide-y divide-line-soft">
                  @for (item of unparsed.value(); track item.id) {
                    <li class="flex min-h-14 items-center gap-2 py-2">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[15px]">{{ item.text }}</p>
                        <p class="text-xs text-muted">
                          {{ when(item.createdAt) }} · {{ reason(item.error) }}
                        </p>
                      </div>
                      <button
                        plButton="ghost"
                        size="icon"
                        type="button"
                        [attr.aria-label]="t.removeOne(item.text)"
                        (click)="removeOne(item)"
                      >
                        <svg lucideTrash2 [size]="18" aria-hidden="true"></svg>
                      </button>
                    </li>
                  }
                </ul>
                <button plButton="secondary" type="button" class="self-start" (click)="removeAll()">
                  {{ t.removeAll }}
                </button>
              }
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class TelegramSettings {
  protected readonly t = SETTINGS_TEXTS.telegram;
  protected readonly group = PROFILE_GROUP;
  private readonly http = inject(HttpClient);

  protected readonly status = httpResource<TelegramStatus>(() => `${API}/telegram/link`);
  protected readonly unparsed = httpResource<UnparsedMessage[]>(() =>
    this.status.value()?.link ? `${API}/telegram/unparsed` : undefined,
  );
  protected readonly code = signal<TelegramLinkCode | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly now = signal(Date.now());
  private codeCreatedAt = 0;

  protected readonly linked = computed(() => !!this.status.value()?.link);
  protected readonly statusText = computed(() => {
    const link = this.status.value()?.link;
    return link
      ? this.t.linkedAs(link.firstName ?? '', formatDate(localDateAt(new Date(link.linkedAt))))
      : this.t.notLinked;
  });
  /** Seconds until the code expires. */
  protected readonly remaining = computed(() => {
    const code = this.code();
    if (!code) return 0;
    return Math.max(0, Math.round((Date.parse(code.expiresAt) - this.now()) / 1000));
  });
  protected readonly remainingText = computed(() => {
    const seconds = this.remaining();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    const timer = setInterval(() => {
      if (!this.code()) return;
      this.now.set(Date.now());
      // Linked from the phone: the profile notices it while the code is shown.
      const link = this.status.value()?.link;
      if (link && Date.parse(link.linkedAt) >= this.codeCreatedAt) {
        this.code.set(null);
        this.unparsed.reload();
      } else if (this.remaining() % 5 === 0) {
        this.status.reload();
      }
    }, 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async createCode(): Promise<void> {
    await this.run(async () => {
      this.codeCreatedAt = Date.now() - 1000;
      this.code.set(
        await firstValueFrom(this.http.post<TelegramLinkCode>(`${API}/telegram/link-code`, {})),
      );
      this.now.set(Date.now());
    });
  }

  protected async unlink(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.delete(`${API}/telegram/link`));
      this.code.set(null);
      this.status.reload();
    });
  }

  protected async removeOne(item: UnparsedMessage): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.delete(`${API}/telegram/unparsed/${item.id}`));
      this.unparsed.reload();
    });
  }

  protected async removeAll(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.delete(`${API}/telegram/unparsed`));
      this.unparsed.reload();
    });
  }

  protected when(instant: string): string {
    return formatDate(localDateAt(new Date(instant)));
  }

  protected reason(code: string): string {
    const message = TEXT_ENTRY_MESSAGES[code as TextEntryError];
    return message ? plainMessage(message) : code;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
