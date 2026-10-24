import { Injectable } from '@nestjs/common';
import { LocalDate, localDateAt, parseLocalDate } from '@platin/domain';
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

  now(): Date {
    return new Date();
  }
}
