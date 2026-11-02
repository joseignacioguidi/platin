import {
  dataSummarySchema,
  resetRequestSchema,
  updateUserRequestSchema,
  userSchema,
} from '@platin/contracts';
import { createZodDto } from 'nestjs-zod';

export class UserDto extends createZodDto(userSchema) {}
export class UpdateUserDto extends createZodDto(updateUserRequestSchema) {}
export class DataSummaryDto extends createZodDto(dataSummarySchema) {}
export class ResetRequestDto extends createZodDto(resetRequestSchema) {}
