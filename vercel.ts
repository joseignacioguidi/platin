import { deploymentEnv, routes, type VercelConfig } from '@vercel/config/v1';

/**
 * Vercel is the single entry point: it serves the Angular build and forwards /api/* to Render,
 * adding the secret header the API checks (see docs/adr/0002-vercel-ts.md).
 *
 * Env vars in the Vercel project:
 * - API_DIRECT_URL: Render URL, e.g. https://platin-api.onrender.com (read at build time).
 * - ORIGIN_SECRET: same value as in Render (resolved by Vercel at request time).
 */
const apiOrigin = (process.env.API_DIRECT_URL ?? '').replace(/\/$/, '');
if (process.env.VERCEL && !apiOrigin) {
  throw new Error('API_DIRECT_URL must be set in the Vercel project');
}

export const config: VercelConfig = {
  framework: null,
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand: 'pnpm nx build web',
  outputDirectory: 'dist/apps/web/browser',
  // Header transforms need the low-level `routes` form, which can't be mixed with `rewrites`.
  routes: [
    routes.rewrite('/api/(.*)', `${apiOrigin}/api/$1`, {
      requestHeaders: { 'x-origin-secret': deploymentEnv('ORIGIN_SECRET') },
      responseHeaders: { 'cache-control': 'no-store' },
    }),
    { handle: 'filesystem' },
    { src: '/(ingresar|registro)/?', dest: '/$1/index.html' },
    // Prerendered pages (/, /ingresar, /registro) are files; client routes (/app/**)
    // fall back to the client-only shell that Angular emits as index.csr.html.
    { src: '/(.*)', dest: '/index.csr.html' },
  ],
};
