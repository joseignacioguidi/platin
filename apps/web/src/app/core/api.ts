import { API_DIRECT_URL } from '../../env.generated';

/** Same-origin API prefix (Vercel forwards it to Render; the dev server proxies it). */
export const API = '/api/v1';

/**
 * Health URL used to wake the server. Goes straight to Render when configured,
 * so the first request doesn't depend on Vercel's rewrite while Render boots.
 */
export const HEALTH_URL = `${API_DIRECT_URL}${API}/health`;
