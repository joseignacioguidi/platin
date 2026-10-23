import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, ProblemFieldError } from '@platin/contracts';

/** Business error with a stable code, rendered as Problem Details. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    status: HttpStatus,
    detail?: string,
    readonly errors?: ProblemFieldError[],
  ) {
    super(detail ?? code, status);
  }

  static notFound(detail = 'Resource not found'): AppException {
    return new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, detail);
  }
}
