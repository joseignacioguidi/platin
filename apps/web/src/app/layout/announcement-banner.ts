import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { LucideMegaphone, LucideX } from '@lucide/angular';
import type { CurrentAnnouncement } from '@platin/contracts';
import { API } from '../core/api';
import { LAYOUT_TEXTS } from './layout.texts';

const DISMISSED_KEY = 'platin.dismissedAnnouncement';

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** The admin's global announcement (ADM-05), above the content; dismissable for the session. */
@Component({
  selector: 'pl-announcement-banner',
  imports: [LucideMegaphone, LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (text(); as text) {
      <div
        class="mb-4 flex items-start gap-3 rounded-2xl bg-pending-soft py-2 pl-4 pr-1 text-pending-ink"
        role="status"
      >
        <svg lucideMegaphone [size]="20" class="mt-2.5 shrink-0" aria-hidden="true"></svg>
        <p class="flex-1 py-2 text-[15px]">{{ text }}</p>
        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-pending"
          [attr.aria-label]="texts.dismissAnnouncement"
          (click)="dismiss(text)"
        >
          <svg lucideX [size]="18"></svg>
        </button>
      </div>
    }
  `,
})
export class AnnouncementBanner {
  protected readonly texts = LAYOUT_TEXTS;
  private readonly current = httpResource<CurrentAnnouncement>(
    () => `${API}/announcements/current`,
  );
  private readonly dismissed = signal(readDismissed());

  protected readonly text = computed(() => {
    const text = this.current.value()?.announcement?.text ?? null;
    return text && text !== this.dismissed() ? text : null;
  });

  protected dismiss(text: string): void {
    this.dismissed.set(text);
    try {
      sessionStorage.setItem(DISMISSED_KEY, text);
    } catch {
      // Private mode: dismissed only until the page reloads.
    }
  }
}
