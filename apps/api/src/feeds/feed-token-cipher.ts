import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfig } from '../config/app-config';

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The connections' credentials at rest (ADR 0037): AES-256-GCM with FEED_TOKEN_KEY, stored as
 * iv | tag | ciphertext. They never leave the server nor go to the logs.
 */
@Injectable()
export class FeedTokenCipher {
  private readonly key: Buffer | null;

  constructor(config: AppConfig) {
    const raw = config.env.FEED_TOKEN_KEY;
    this.key = raw ? Buffer.from(raw, 'base64') : null;
  }

  encrypt(plain: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.requireKey(), iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), body]));
  }

  decrypt(stored: Uint8Array): string {
    const data = Buffer.from(stored);
    const decipher = createDecipheriv('aes-256-gcm', this.requireKey(), data.subarray(0, IV_BYTES));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  private requireKey(): Buffer {
    if (!this.key) throw new Error('FEED_TOKEN_KEY is not set');
    return this.key;
  }
}
