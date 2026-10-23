import { Injectable } from '@nestjs/common';
import { Env, loadEnv } from './env';

/** Typed, validated access to environment variables. */
@Injectable()
export class AppConfig {
  readonly env: Env = loadEnv();
}
