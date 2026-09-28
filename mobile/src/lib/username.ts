// Mirrors the DB check constraint on profiles.username (§2.2).
export const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}
