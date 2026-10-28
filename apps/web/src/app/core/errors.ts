import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails, problemDetailsSchema } from '@platin/contracts';

/** User-facing messages for stable error codes. */
const MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: 'Revisá los datos ingresados.',
  INVALID_CREDENTIALS: 'El email o la contraseña no son correctos.',
  EMAIL_TAKEN: 'Ya existe una cuenta con ese email.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Esperá un minuto y probá de nuevo.',
  NOT_FOUND: 'No encontramos lo que buscabas.',
  CARD_STATEMENT_CLOSED: 'El resumen ya está cerrado y no se puede modificar.',
  ACCOUNT_SUSPENDED: 'Tu cuenta está suspendida. Si creés que es un error, escribinos.',
  REGISTRATION_CLOSED: 'Por ahora el registro está cerrado.',
  ADMIN_SELF_ACTION: 'No podés hacer eso con tu propia cuenta.',
  CONFIRMATION_MISMATCH: 'El email no coincide con el del usuario.',
  FORBIDDEN: 'No tenés permiso para hacer eso.',
  SERVICE_UNAVAILABLE: 'El servidor no está disponible. Probá de nuevo en un rato.',
};

const FALLBACK = 'Algo salió mal. Probá de nuevo.';
const OFFLINE = 'No hay conexión con el servidor.';

export function problemOf(error: unknown): ProblemDetails | undefined {
  if (!(error instanceof HttpErrorResponse)) return undefined;
  const parsed = problemDetailsSchema.safeParse(error.error);
  return parsed.success ? parsed.data : undefined;
}

/** Message to show for any error coming from the API. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 0) return OFFLINE;
  const problem = problemOf(error);
  return (problem && MESSAGES[problem.code]) ?? FALLBACK;
}
