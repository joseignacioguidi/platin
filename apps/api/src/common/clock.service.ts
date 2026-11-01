import { HttpStatus, Injectable } from '@nestjs/common';
import { compareDates, LocalDate, localDateAt, parseLocalDate } from '@platin/domain';
import { AppException } from './app-exception';
import { AppConfig } from '../config/app-config';

/**
 * The only place that reads the system clock. "Today" is the date in Buenos Aires; CLOCK_TODAY
 * (local and tests only) simulates another day.
 */
@Injectable()
export class ClockService {
  constructor(private readonly config: AppConfig) {}

  today(): LocalDate {
    const simulated = this.config.env.CLOCK_TODAY;
    return simulated ? parseLocalDate(simulated) : localDateAt(this.now());
  }

  /** Transfers, adjustments and confirmed movements are dated up to today (MOV-08). */
  assertNotFuture(date: LocalDate): void {
    if (compareDates(date, this.today()) > 0) {
      throw new AppException(
        'DATE_IN_FUTURE',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The date cannot be after today',
      );
    }
  }

  now(): Date {
    return new Date();
  }
}
