import { Webhook } from 'standardwebhooks';
import { describe, expect, it, vi } from 'vitest';
import { gatewayFromEnv } from './gateways.ts';
import {
  createSendSmsHandler,
  maskPhone,
  otpMessage,
  parseOtpRequest,
  type SmsGateway,
} from './handler.ts';

// The same verification index.ts uses, with a test secret.
const SECRET = Buffer.from('bairmair-test-secret-0123456789ab').toString('base64');
const webhook = new Webhook(SECRET);

function signedRequest(payload: unknown, opts: { secret?: Webhook; at?: Date } = {}): Request {
  const body = JSON.stringify(payload);
  const id = 'msg_test';
  const at = opts.at ?? new Date();
  const signature = (opts.secret ?? webhook).sign(id, at, body);
  return new Request('http://localhost/send-sms', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
      'webhook-signature': signature,
    },
    body,
  });
}

function setup(gateway?: SmsGateway) {
  const sent: { to: string; text: string }[] = [];
  const logs: { event: string; fields?: Record<string, unknown> }[] = [];
  const handler = createSendSmsHandler({
    verify: (body, headers) => webhook.verify(body, headers),
    gateway: gateway ?? {
      async send(to, text) {
        sent.push({ to, text });
      },
    },
    log: (event, fields) => logs.push({ event, fields }),
  });
  return { handler, sent, logs };
}

const payload = {
  user: { id: '6f1b0c2e-0000-4000-8000-000000000001', phone: '97699112233' },
  sms: { otp: '123456' },
};

describe('send-sms hook', () => {
  it('texts the OTP to the user and answers 200 {}', async () => {
    const { handler, sent } = setup();
    const res = await handler(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(sent).toEqual([{ to: '+97699112233', text: otpMessage('123456') }]);
  });

  it('on a phone change, texts the new number', async () => {
    const { handler, sent } = setup();
    await handler(signedRequest({ ...payload, sms: { otp: '654321', phone: '97688001122' } }));
    expect(sent[0]?.to).toBe('+97688001122');
  });

  it('rejects a bad signature without sending', async () => {
    const { handler, sent } = setup();
    const forger = new Webhook(Buffer.from('not-the-secret-0123456789abcdef').toString('base64'));
    const res = await handler(signedRequest(payload, { secret: forger }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { http_code: 401, message: 'invalid_signature' } });
    expect(sent).toEqual([]);
  });

  it('rejects a replayed (stale) request', async () => {
    const { handler, sent } = setup();
    const res = await handler(signedRequest(payload, { at: new Date(Date.now() - 10 * 60_000) }));
    expect(res.status).toBe(401);
    expect(sent).toEqual([]);
  });

  // Errors for Auth come back as HTTP 200 with an error body: Auth only reads the body of a 200
  // and passes http_code and message on to the app.
  it('refuses numbers outside Mongolia, with a reason Auth passes on', async () => {
    const { handler, sent } = setup();
    const res = await handler(signedRequest({ ...payload, user: { phone: '14155550100' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      error: { http_code: 400, message: 'unsupported_phone_number' },
    });
    expect(sent).toEqual([]);
  });

  it('reports gateway failures in the hook error format, without leaking the OTP', async () => {
    const { handler, logs } = setup({
      send: () => Promise.reject(new Error('gateway down')),
    });
    const res = await handler(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: { http_code: 500, message: 'sms_send_failed' } });
    expect(JSON.stringify(logs)).not.toContain('123456');
    expect(JSON.stringify(logs)).not.toContain('97699112233');
  });

  it('gives the gateway a deadline under Auth’s 5 s budget', async () => {
    const send = vi.fn<SmsGateway['send']>(async () => {});
    const handler = createSendSmsHandler({
      verify: (body, headers) => webhook.verify(body, headers),
      gateway: { send },
    });
    await handler(signedRequest(payload));
    const signal = send.mock.calls[0]?.[2];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it('answers 405 to anything but POST', async () => {
    const { handler } = setup();
    const res = await handler(new Request('http://localhost/send-sms'));
    expect(res.status).toBe(405);
  });

  it('fails clearly while no gateway is configured', async () => {
    const gateway = gatewayFromEnv(() => undefined);
    await expect(gateway.send('+97699112233', 'x', AbortSignal.timeout(1000))).rejects.toThrow(
      /SMS_GATEWAY is not set/,
    );
  });
});

describe('payload and message', () => {
  it('rejects malformed payloads', () => {
    expect(parseOtpRequest(null)).toBeNull();
    expect(parseOtpRequest({ user: { phone: '97699112233' }, sms: {} })).toBeNull();
    expect(parseOtpRequest({ user: { phone: '97699112233' }, sms: { otp: '12ab56' } })).toBeNull();
    expect(parseOtpRequest({ user: {}, sms: { otp: '123456' } })).toBeNull();
  });

  it('keeps the SMS in one unicode part (WeSend: 65 characters)', () => {
    expect(otpMessage('12345678').length).toBeLessThanOrEqual(65);
  });

  it('masks phone numbers for logs', () => {
    expect(maskPhone('+97699112233')).toBe('+976991****3');
  });
});
