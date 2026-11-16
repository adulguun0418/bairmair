import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createErrorReporter, pathOnly } from '../src/server/error-reporting';

interface SentEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
}

/** A fake fetch that records the events posthog-node sends. */
function recordingFetch() {
  const sent: { url: string; events: SentEvent[] }[] = [];
  const fetch = async (url: string, options: { body?: unknown }) => {
    const body = options.body;
    const text =
      typeof body === 'string'
        ? body
        : gunzipSync(
            Buffer.from(body instanceof Blob ? await body.arrayBuffer() : (body as ArrayBuffer)),
          ).toString();
    const parsed = JSON.parse(text) as { batch: SentEvent[] };
    sent.push({ url, events: parsed.batch });
    return { status: 200, text: async () => '{}', json: async () => ({}) };
  };
  return { sent, fetch };
}

describe('createErrorReporter', () => {
  it('sends an anonymous $exception to the EU host and waits for it', async () => {
    const { sent, fetch } = recordingFetch();
    const report = createErrorReporter('phc_test', { fetch });

    await report(new TypeError('boom'), { path: '/listings/abc', route: '/[lang]/listings/[id]' });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toMatch(/^https:\/\/eu\.i\.posthog\.com\//);
    const [event] = sent[0]!.events;
    expect(event!.event).toBe('$exception');
    expect(event!.properties).toMatchObject({
      path: '/listings/abc',
      route: '/[lang]/listings/[id]',
      runtime: 'server',
      $process_person_profile: false,
      $geoip_disable: true,
    });
    const [exception] = event!.properties.$exception_list as { type: string; value: string }[];
    expect(exception).toMatchObject({ type: 'TypeError', value: 'boom' });
  });

  it('never throws when sending fails', async () => {
    const report = createErrorReporter('phc_test', {
      fetch: async () => {
        throw new Error('offline');
      },
    });
    await expect(report(new Error('boom'))).resolves.toBeUndefined();
  });
});

describe('pathOnly', () => {
  it('drops the query string and fragment', () => {
    expect(pathOnly('/search?q=Зайсан&type=sale')).toBe('/search');
    expect(pathOnly('/sign-in?next=%2Faccount')).toBe('/sign-in');
    expect(pathOnly('/listings/abc#space')).toBe('/listings/abc');
    expect(pathOnly('/')).toBe('/');
  });
});
