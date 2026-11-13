/**
 * Mongolian phone numbers: +976 followed by 8 digits. SMS codes go only to +976 numbers (the
 * send-sms hook refuses others), so the app accepts nothing else.
 */

const LOCAL_DIGITS = 8;

/**
 * Turns what a user typed into E.164 (`+97699112233`), or null if it is not 8 digits.
 * Accepts spaces, dashes and a leading `+976` / `976` / `00976`.
 */
export function normalizeMongolianPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');
  if (digits.length === LOCAL_DIGITS + 5 && digits.startsWith('00976')) digits = digits.slice(5);
  else if (digits.length === LOCAL_DIGITS + 3 && digits.startsWith('976')) digits = digits.slice(3);
  return digits.length === LOCAL_DIGITS ? `+976${digits}` : null;
}

/** `+97699112233` → `+976 9911 2233`. Other strings are returned unchanged. */
export function formatMongolianPhone(e164: string): string {
  const match = /^\+?976(\d{4})(\d{4})$/.exec(e164);
  return match ? `+976 ${match[1]} ${match[2]}` : e164;
}
