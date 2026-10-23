import request from 'supertest';
import { createTestApp, TestContext } from '../../test/test-app';

describe('GET /api/v1/health', () => {
  let ctx: TestContext;

  afterEach(async () => {
    await ctx?.app.close();
  });

  it('answers ok when the database is reachable', async () => {
    ctx = await createTestApp();
    const res = await request(ctx.app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  describe('with ORIGIN_SECRET set', () => {
    beforeEach(async () => {
      ctx = await createTestApp({ ORIGIN_SECRET: 'vercel-secret' });
    });

    it('keeps /health public', async () => {
      await request(ctx.app.getHttpServer()).get('/api/v1/health').expect(200);
    });

    it('rejects other routes without the header as Problem Details', async () => {
      const res = await request(ctx.app.getHttpServer()).get('/api/v1/anything').expect(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    });

    it('lets requests with the header through', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/anything')
        .set('x-origin-secret', 'vercel-secret')
        .expect(404);
      expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });
  });
});
