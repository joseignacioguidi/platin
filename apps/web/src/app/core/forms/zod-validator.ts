import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { z } from 'zod';

/**
 * Validates a form control with a field schema from libs/contracts, so the form and the API
 * apply the same rules. The error is `{ zod: 'message' }`.
 */
export function zodValidator(schema: z.ZodType): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const result = schema.safeParse(control.value);
    return result.success ? null : { zod: result.error.issues[0]?.message ?? 'Dato inválido' };
  };
}

/** First error message of a control, once the user touched it. */
export function fieldError(control: AbstractControl): string | null {
  if (!control.touched || !control.errors) return null;
  const zod: unknown = control.errors['zod'];
  if (typeof zod === 'string') return zod;
  if (control.errors['required']) return 'Este dato es obligatorio';
  return 'Dato inválido';
}
