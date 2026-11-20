import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
import { SCAN_APP_BUNDLE_ID } from '@bairmair/db';
import { APPLE_ROOT_CA_G3 } from './apple-root-ca';
import { AppleVerificationError, type AppleVerifier } from './apple-iap';

/**
 * Apple's `SignedDataVerifier` behind our `AppleVerifier`: checks the signature and the
 * certificate chain up to Apple Root CA - G3 (with online revocation checks), the bundle id and
 * the environment.
 *
 * Both environments are accepted: Production needs the app's Apple ID (`APPLE_APP_ID`, the
 * number in App Store Connect → App Information); Sandbox is TestFlight, sandbox testers and App
 * Review, which buys in the sandbox even with the store build. Data is tried against Production
 * first and against Sandbox when it names the other environment.
 */
export function appleVerifier(options: { appAppleId: number | null }): AppleVerifier {
  const roots = [Buffer.from(APPLE_ROOT_CA_G3, 'base64')];
  const verifiers: SignedDataVerifier[] = [];
  if (options.appAppleId !== null) {
    verifiers.push(
      new SignedDataVerifier(
        roots,
        true,
        Environment.PRODUCTION,
        SCAN_APP_BUNDLE_ID,
        options.appAppleId,
      ),
    );
  }
  verifiers.push(new SignedDataVerifier(roots, true, Environment.SANDBOX, SCAN_APP_BUNDLE_ID));

  async function verify<T>(run: (verifier: SignedDataVerifier) => Promise<T>): Promise<T> {
    let last: unknown = null;
    for (const verifier of verifiers) {
      try {
        return await run(verifier);
      } catch (cause) {
        if (!(cause instanceof VerificationException)) throw cause;
        // Apple's OCSP responder or a network hiccup: let the caller retry (5xx).
        if (cause.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) throw cause;
        last = cause;
        if (cause.status !== VerificationStatus.INVALID_ENVIRONMENT) break;
      }
    }
    const status = last instanceof VerificationException ? VerificationStatus[last.status] : '?';
    throw new AppleVerificationError(`apple verification failed: ${status}`);
  }

  return {
    transaction: (jws) => verify((v) => v.verifyAndDecodeTransaction(jws)),
    renewal: (jws) => verify((v) => v.verifyAndDecodeRenewalInfo(jws)),
    notification: (jws) => verify((v) => v.verifyAndDecodeNotification(jws)),
  };
}

/** `APPLE_APP_ID` as a number, or null when unset (Sandbox only). */
export function appAppleIdFromEnv(): number | null {
  const value = process.env.APPLE_APP_ID?.trim();
  if (!value) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('APPLE_APP_ID must be a number');
  return id;
}
