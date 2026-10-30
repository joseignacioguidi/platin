import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import { AppException } from './app-exception';

const NUL = String.fromCharCode(0);

/**
 * Refuses the NUL character in any string of the body, query or params. Postgres can't store it
 * in text columns, so it used to end in a 500 (SEC-F10); no legitimate input carries it.
 */
@Injectable()
export class RejectNulPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (containsNul(value)) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'The request contains a NUL character',
      );
    }
    return value;
  }
}

function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes(NUL);
  if (depth > 20 || value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, item]) => key.includes(NUL) || containsNul(item, depth + 1),
  );
}
