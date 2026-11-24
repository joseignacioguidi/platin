import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PlButton, PlSheet } from '@platin/web-ui';
import { errorMessage } from '../../core/errors';
import { AccountsStore } from '../accounts/accounts.store';
import { FeedsStore } from './feeds.store';
import { FEEDS_TEXTS } from './feeds.texts';

/**
 * MPG-01, back from Mercado Pago: which platin wallet is Mercado Pago, or "Crear Mercado Pago".
 * Closes with the chosen account id, so the screen can offer adjusting its balance.
 */
@Component({
  selector: 'pl-feed-account-sheet',
  imports: [PlSheet, PlButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <pl-sheet>
      <h2 class="text-xl font-extrabold">{{ t.title }}</h2>
      <p class="text-[15px] text-muted">{{ t.body }}</p>

      @if (wallets().length > 0) {
        <div class="flex flex-col gap-2" role="radiogroup" [attr.aria-label]="t.title">
          @for (account of wallets(); track account.id) {
            <button
              type="button"
              role="radio"
              class="flex min-h-14 items-center justify-between gap-3 rounded-2xl border px-4 text-left text-[15px] font-semibold"
              [class.border-brand]="selected() === account.id"
              [class.border-line]="selected() !== account.id"
              [attr.aria-checked]="selected() === account.id"
              (click)="selected.set(account.id)"
            >
              {{ account.name }}
            </button>
          }
        </div>
      } @else {
        <p class="text-sm text-muted">{{ t.none }}</p>
      }

      @if (error()) {
        <p class="rounded-2xl bg-expense-soft px-4 py-3 text-sm" role="alert">{{ error() }}</p>
      }

      <button
        plButton
        size="lg"
        type="button"
        [disabled]="busy() || !selected()"
        (click)="choose()"
      >
        {{ t.choose }}
      </button>
      <button plButton="secondary" type="button" [disabled]="busy()" (click)="create()">
        {{ t.create }}
      </button>
    </pl-sheet>
  `,
})
export class FeedAccountSheet {
  protected readonly t = FEEDS_TEXTS.account;
  private readonly ref = inject<DialogRef<string>>(DialogRef);
  private readonly accounts = inject(AccountsStore);
  private readonly feeds = inject(FeedsStore);

  protected readonly wallets = computed(() =>
    this.accounts.accounts().filter((account) => account.kind === 'WALLET'),
  );
  protected readonly selected = signal<string | null>(
    this.feeds.connection()?.account?.id ??
      this.wallets().find((account) => /mercado\s*pago/i.test(account.name))?.id ??
      null,
  );
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async choose(): Promise<void> {
    const id = this.selected();
    if (id) await this.run(() => this.save(id));
  }

  /** "Crear Mercado Pago": a wallet with its balance in pesos, then connected. */
  protected async create(): Promise<void> {
    await this.run(async () => {
      const taken = new Set(this.accounts.accounts().map((a) => a.name.toLowerCase()));
      let name: string = this.t.defaultName;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${this.t.defaultName} ${n}`;
      const account = await this.accounts.create({ name, kind: 'WALLET', initialBalance: '0' });
      await this.save(account.id);
    });
  }

  private async save(accountId: string): Promise<void> {
    await this.feeds.setAccount(accountId);
    this.ref.close(accountId);
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
