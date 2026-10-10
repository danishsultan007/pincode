// Identifier helpers shared by the Edge Functions that accept an email,
// username or phone (login-with-identifier, request-password-reset).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const E164_IN_RE = /^\+91[6-9]\d{9}$/;

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Returns the account email, or null if there is none. `admin` must be a
// service-role client.
export async function resolveEmail(admin: SupabaseClient, raw: string): Promise<string | null> {
  if (EMAIL_RE.test(raw)) return raw.toLowerCase();

  let id: string | null = null;
  if (E164_IN_RE.test(raw)) {
    const { data, error } = await admin.from('private_profiles').select('id').eq('phone_e164', raw).maybeSingle();
    if (error) throw error;
    id = data?.id ?? null;
  } else {
    // profiles.username is citext, so .eq is case-insensitive.
    const { data, error } = await admin.from('profiles').select('id').eq('username', raw).maybeSingle();
    if (error) throw error;
    id = data?.id ?? null;
  }
  if (!id) return null;

  const { data, error } = await admin.from('private_profiles').select('email').eq('id', id).maybeSingle();
  if (error) throw error;
  return data?.email ?? null;
}

export function clientIp(req: Request): string {
  // Prefer headers the platform sets itself; a client-supplied X-Forwarded-For
  // only ever contributes its LAST (proxy-appended) entry.
  const direct = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
  if (direct) return direct.trim();
  const xff = (req.headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return xff[xff.length - 1] ?? 'unknown';
}
