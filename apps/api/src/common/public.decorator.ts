import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Skips the global JWT guard (auth endpoints and /health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
