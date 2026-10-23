import { authResponseSchema, loginRequestSchema, registerRequestSchema } from '@platin/contracts';
import { createZodDto } from 'nestjs-zod';

export class RegisterDto extends createZodDto(registerRequestSchema) {}
export class LoginDto extends createZodDto(loginRequestSchema) {}
export class AuthResponseDto extends createZodDto(authResponseSchema) {}
