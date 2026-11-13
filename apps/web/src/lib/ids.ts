const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether a URL segment is a (lowercase) UUID, before it reaches a uuid column. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
