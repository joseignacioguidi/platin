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

/**
 * Security headers for the web app (SEC-F08); /api gets its own from helmet in the API.
 * script-src allows 'unsafe-inline' because prerendered pages carry inline scripts (theme before
 * first paint, Angular's event replay and critical CSS loader) and Angular's autoCsp, which would
 * hash them, does not work together with prerendering yet. Everything else is locked down:
 * no framing, no plugins, no foreign base URI or form targets, and the only other origin the
 * page talks to is the API itself, for the /health wake-up.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = {
  'content-security-policy': contentSecurityPolicy,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export const config: VercelConfig = {
  framework: null,
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand: 'pnpm nx build web',
  outputDirectory: 'dist/apps/web/browser',
  // Header transforms need the low-level `routes` form, which can't be mixed with `rewrites`.
  routes: [
    // Every page except /api/* gets the security headers; `continue` keeps matching below.
    { src: '^/(?!api/).*', headers: securityHeaders, continue: true },
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
