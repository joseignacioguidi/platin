import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/** argon2id with OWASP's recommended parameters (19 MiB, 2 iterations). */
@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
