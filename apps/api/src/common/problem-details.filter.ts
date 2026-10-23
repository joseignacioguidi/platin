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

function titleFor(status: number): string {
  const name = HttpStatus[status];
  if (!name) return 'Error';
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
