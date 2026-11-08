import { TestBed } from '@angular/core/testing';
import { LandingChat, MESSAGE_STAGGER_MS } from './landing-chat';

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

describe('LandingChat (LAN-03)', () => {
  let callback: ObserverCallback | undefined;
  const disconnect = vi.fn();

  function stub(options: { reducedMotion?: boolean; top?: number }) {
    callback = undefined;
    disconnect.mockClear();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: ObserverCallback) {
          callback = cb;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce') && !!options.reducedMotion,
    }));
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: options.top ?? 2000,
    } as DOMRect);
  }

  async function render() {
    const fixture = TestBed.createComponent(LandingChat);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const messages = () => [...host.querySelectorAll<HTMLElement>('[data-chat-message]')];
    return { fixture, host, messages };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws the whole sample conversation, hidden from screen readers but summarized', async () => {
    stub({});
    const { host, messages } = await render();
    expect(messages().map((m) => m.textContent?.trim())).toEqual([
      'super 45k visa 3c',
      expect.stringContaining('Gasto · $ 45.000 · Supermercado'),
      'Guardado. Te quedan $ 412.300 este mes.',
      '/libre',
      '≈ $ 17.179 por día hasta el 30/11.',
    ]);
    expect(
      host.querySelector('[data-chat-message]')?.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
    expect(host.querySelector('.sr-only')?.textContent).toContain('super 45k visa 3c');
    // Sample buttons are drawings, not controls.
    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('Telegram · disponible');
    expect(host.textContent).toContain('WhatsApp · próximamente');
  });

  it('waits below the fold and plays the messages in one by one, once', async () => {
    stub({});
    const { fixture, messages } = await render();
    expect(messages().every((m) => m.classList.contains('msg-waiting'))).toBe(true);

    callback?.([{ isIntersecting: false }]);
    fixture.detectChanges();
    expect(messages()[0].classList.contains('msg-waiting')).toBe(true);

    callback?.([{ isIntersecting: true }]);
    fixture.detectChanges();
    expect(disconnect).toHaveBeenCalled();
    expect(messages().every((m) => m.classList.contains('msg-in'))).toBe(true);
    expect(messages().map((m) => m.style.animationDelay)).toEqual(
      [0, 1, 2, 3, 4].map((i) => `${i * MESSAGE_STAGGER_MS}ms`),
    );
  });

  it('keeps everything still under reduced motion', async () => {
    stub({ reducedMotion: true });
    const { messages } = await render();
    expect(callback).toBeUndefined();
    expect(messages().some((m) => m.className.includes('msg-'))).toBe(false);
  });

  it('does not hide the messages when the chat is already on screen at hydration', async () => {
    stub({ top: 300 });
    const { messages } = await render();
    expect(callback).toBeUndefined();
    expect(messages().some((m) => m.className.includes('msg-'))).toBe(false);
  });
});
