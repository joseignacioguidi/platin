import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorCode, ProblemDetails } from '@platin/contracts';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { AppException } from './app-exception';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/** Renders every error as RFC 9457 Problem Details. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const problem = this.toProblem(exception);
    if (problem.status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    const known = clientErrorOf(exception);
    if (known) return known;
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      return {
        type: 'about:blank',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'The request is not valid',
        code: 'VALIDATION_FAILED',
        errors:
          zodError instanceof ZodError
            ? zodError.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
              }))
            : [],
      };
    }
    if (exception instanceof AppException) {
      return {
        type: 'about:blank',
        title: titleFor(exception.getStatus()),
        status: exception.getStatus(),
        detail: exception.message,
        code: exception.code,
        ...(exception.errors ? { errors: exception.errors } : {}),
        ...exception.extensions,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: 'about:blank',
        title: titleFor(status),
        status,
        detail: exception.message,
        code: CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED'),
      };
    }
    return {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Client mistakes that surface as something other than an HttpException, mapped to a 4xx
 * instead of a 500 (SEC-F10):
 * - body-parser errors (body too large, unsupported encoding), which carry `status` and
 *   `expose: true` (http-errors). Malformed JSON already arrives as a 400.
 * - an amount whose base-currency value does not fit Decimal(18,2) (Prisma P2020).
 * - a NUL character that Postgres refuses in text columns (P2039 / 22021), as a last line of
 *   defense behind RejectNulPipe.
 */
function clientErrorOf(exception: unknown): ProblemDetails | undefined {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2020') {
      return problem(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'AMOUNT_TOO_LARGE',
        'The amount is too large',
      );
    }
    if (exception.code === 'P2039' || JSON.stringify(exception.meta ?? {}).includes('22021')) {
      return problem(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'The request is not valid');
    }
    return undefined;
  }
  const http = exception as { status?: unknown; expose?: unknown; type?: unknown } | null;
  if (
    http &&
    typeof http === 'object' &&
    http.expose === true &&
    typeof http.status === 'number' &&
    http.status >= 400 &&
    http.status < 500
  ) {
    const code = http.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_FAILED';
    return problem(http.status, code, 'The request is not valid');
  }
  return undefined;
}

function problem(status: number, code: string, detail: string): ProblemDetails {
  return { type: 'about:blank', title: titleFor(status), status, detail, code };
}

function titleFor(status: number): string {
  const name = HttpStatus[status];
  if (!name) return 'Error';
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
