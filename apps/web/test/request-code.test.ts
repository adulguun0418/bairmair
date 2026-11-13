import { describe, expect, it, vi } from 'vitest';
import { requestCode, verifyTurnstile, type RequestCodeDeps } from '@/server/request-code';

function deps(captchaOk = true, failure: { code: string; status: number } | null = null) {
  const verifyCaptcha = vi.fn<RequestCodeDeps['verifyCaptcha']>(async () => captchaOk);
  const sendCode = vi.fn<RequestCodeDeps['sendCode']>(async () => failure);
  return { verifyCaptcha, sendCode };
}

describe('requestCode', () => {
  it('checks the captcha, then sends the code to the normalized number', async () => {
    const d = deps();
    const result = await requestCode(d, { phone: '9911 2233', captchaToken: 'tok' }, '1.2.3.4');
    expect(result).toEqual({ ok: true, phone: '+97699112233' });
    expect(d.verifyCaptcha).toHaveBeenCalledWith('tok', '1.2.3.4');
    expect(d.sendCode).toHaveBeenCalledWith('+97699112233');
  });

  it('refuses a non-Mongolian or malformed number before anything else', async () => {
    const d = deps();
    for (const phone of ['+1 202 555 0100', '123', 42, undefined]) {
      expect(await requestCode(d, { phone, captchaToken: 'tok' }, null)).toEqual({
        ok: false,
        status: 400,
        error: 'invalid_phone',
      });
    }
    expect(d.verifyCaptcha).not.toHaveBeenCalled();
    expect(d.sendCode).not.toHaveBeenCalled();
  });

  it('sends nothing without a valid captcha', async () => {
    const missing = deps();
    expect(await requestCode(missing, { phone: '99112233' }, null)).toMatchObject({
      error: 'captcha_failed',
    });
    expect(missing.verifyCaptcha).not.toHaveBeenCalled();

    const rejected = deps(false);
    expect(
      await requestCode(rejected, { phone: '99112233', captchaToken: 'bad' }, null),
    ).toMatchObject({ ok: false, status: 400, error: 'captcha_failed' });
    expect(rejected.sendCode).not.toHaveBeenCalled();
  });

  it('passes Auth’s refusal on (rate limit, SMS failure)', async () => {
    const d = deps(true, { code: 'over_sms_send_rate_limit', status: 429 });
    expect(await requestCode(d, { phone: '99112233', captchaToken: 'tok' }, null)).toEqual({
      ok: false,
      status: 429,
      error: 'over_sms_send_rate_limit',
    });
  });
});

describe('verifyTurnstile', () => {
  it('posts secret, token and IP to Cloudflare and reads `success`', async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return Response.json({ success: true });
    }) as typeof fetch;
    expect(await verifyTurnstile('secret', 'tok', '1.2.3.4', fetchImpl)).toBe(true);
    expect(calls[0]?.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(new URLSearchParams(calls[0]?.body)).toEqual(
      new URLSearchParams({ secret: 'secret', response: 'tok', remoteip: '1.2.3.4' }),
    );
  });

  it('is false for a failed check or an HTTP error', async () => {
    const no = (async () => Response.json({ success: false })) as typeof fetch;
    const down = (async () => new Response('', { status: 502 })) as typeof fetch;
    expect(await verifyTurnstile('s', 't', null, no)).toBe(false);
    expect(await verifyTurnstile('s', 't', null, down)).toBe(false);
  });
});
