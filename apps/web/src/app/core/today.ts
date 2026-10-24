import { computed, Injectable, signal } from '@angular/core';
import { LocalDate, localDateAt, periodOf } from '@platin/domain';

/**
 * "Today" in Buenos Aires for the UI (default dates, month selectors). Business rules don't
 * read it: the API decides with its own clock.
 */
@Injectable({ providedIn: 'root' })
export class Today {
  readonly date = signal<LocalDate>(localDateAt(new Date()));
  readonly period = computed(() => periodOf(this.date()));

  /** Re-reads the clock (when the app comes back after midnight). */
  refresh(): void {
    this.date.set(localDateAt(new Date()));
  }
}
