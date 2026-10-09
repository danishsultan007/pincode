// Mirrors the DB check constraint on profiles.username (§2.2).
export const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;

// Mirrors the reserved-word check in username_available() / profiles_guard
// (20260927000200_profiles.sql): blocks names that could pass for staff.
export const RESERVED_USERNAME_RE = /(pincode|admin|moderator|official|support|staff)/i;

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAME_RE.test(value);
}

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}
