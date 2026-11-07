import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Movement, MovementsPage } from '@platin/contracts';
import { RefreshBus } from '../core/data/refresh-bus';
import { PendingCount, pendingCountLabel } from './pending-count';

const pending = (id: string) => ({ id, kind: 'TRANSACTION' }) as unknown as Movement;

describe('pendingCountLabel', () => {
  it('shows nothing without pending movements', () => {
    expect(pendingCountLabel(0)).toBeNull();
  });

  it('shows the number up to 99 and "99+" from 100', () => {
    expect(pendingCountLabel(2)).toBe('2');
    expect(pendingCountLabel(99)).toBe('99');
    expect(pendingCountLabel(100)).toBe('99+');
  });
});

describe('PendingCount (NAV-01, COM-05)', () => {
  async function flush(http: HttpTestingController, page: MovementsPage): Promise<void> {
    const request = http.expectOne((r) => r.url === '/api/v1/movements');
    expect(request.request.params.get('status')).toBe('PENDING');
    expect(request.request.params.get('limit')).toBe('100');
    expect(request.request.params.get('until')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    request.flush(page);
    // httpResource publishes the answer after a turn of the event loop.
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const counter = TestBed.inject(PendingCount);
    TestBed.tick();
    return { counter, http: TestBed.inject(HttpTestingController) };
  }

  it('counts the pending movements up to today', async () => {
    const { counter, http } = setup();
    await flush(http, { items: [pending('a'), pending('b')], nextCursor: null });
    expect(counter.count()).toBe(2);
    expect(counter.label()).toBe('2');
  });

  it('reads "99+" when there is another page', async () => {
    const { counter, http } = setup();
    const items = Array.from({ length: 100 }, (_, i) => pending(String(i)));
    await flush(http, { items, nextCursor: 'next' });
    expect(counter.label()).toBe('99+');
  });

  it('reloads when movements change, so confirming clears it', async () => {
    const { counter, http } = setup();
    await flush(http, { items: [pending('a'), pending('b')], nextCursor: null });
    TestBed.inject(RefreshBus).invalidate('movements');
    TestBed.tick();
    await flush(http, { items: [], nextCursor: null });
    expect(counter.count()).toBe(0);
    expect(counter.label()).toBeNull();
  });
});
