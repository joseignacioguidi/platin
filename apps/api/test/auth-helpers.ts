import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  /** `Cookie` header value with the refresh token. */
  cookie: string;
}

let counter = 0;

/** Registers a fresh user and returns its tokens. */
export async function registerUser(
  app: INestApplication,
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<TestUser> {
  counter += 1;
  const email = overrides.email ?? `user${counter}-${Date.now()}@test.platin`;
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password: overrides.password ?? 'una-clave-segura', name: overrides.name })
    .expect(201);
  return {
    id: res.body.user.id,
    email,
    accessToken: res.body.accessToken,
    cookie: refreshCookie(res.headers['set-cookie']),
  };
}

/** Extracts `platin_rt=...` from a Set-Cookie header. */
export function refreshCookie(setCookie: string | string[] | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = list.find((value) => value.startsWith('platin_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie.split(';')[0];
}

/** Authenticated supertest agent helpers. */
export function as(app: INestApplication, user: TestUser) {
  const server = app.getHttpServer();
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${user.accessToken}`);
  return {
    get: (url: string) => auth(request(server).get(url)),
    post: (url: string) => auth(request(server).post(url)),
    patch: (url: string) => auth(request(server).patch(url)),
    put: (url: string) => auth(request(server).put(url)),
    delete: (url: string) => auth(request(server).delete(url)),
  };
}
