// Sign in with email, username or phone.
//
// Supabase Auth only takes an email, so a username/phone has to be resolved to
// one first. Doing that in a database function callable by anyone leaked every
// user's email; here the lookup happens with the service role and the client
// only ever receives a session. Unknown identifier and wrong password return
// the same error so this can't be used to probe which usernames/phones exist.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { clientIp, resolveEmail, sha256Hex } from '../_shared/identity.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });

const WINDOW = '15 minutes';
const MAX_PER_IP = 60;               // all attempts from one IP
const MAX_PER_IDENTIFIER_IP = 8;     // one identifier from one IP
const MAX_PER_IDENTIFIER = 50;       // one identifier from anywhere (looser, so a stranger can't lock you out cheaply)
const MIN_FAIL_MS = 600;             // pad failures so unknown vs. known accounts take similar time
const INVALID = { error: 'invalid_credentials', message: 'Invalid login credentials' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request.' }, 400);
  }
  const { identifier, password } = body;
  if (
    typeof identifier !== 'string' || typeof password !== 'string' ||
    !identifier.trim() || !password ||
    identifier.length > 256 || password.length > 1024
  ) {
    return json({ error: 'bad_request', message: 'Invalid request.' }, 400);
  }

  const started = Date.now();
  const raw = identifier.trim();
  const ip = clientIp(req);
  const idHash = await sha256Hex(raw.toLowerCase());
  const idKey = `id:${idHash}`;
  const idIpKey = `idip:${await sha256Hex(`${raw.toLowerCase()}|${ip}`)}`;

  // Forward the caller's IP so Auth's own per-IP rate limit is per user, not
  // one shared budget for this function's few outbound addresses.
  const anon = createClient(URL_, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'X-Forwarded-For': ip } },
  });

  const invalid = async () => {
    const left = MIN_FAIL_MS - (Date.now() - started);
    if (left > 0) await sleep(left + Math.floor(Math.random() * 150));
    return json(INVALID, 401);
  };

  try {
    // Records this attempt and checks all limits in one call (atomic).
    const { data: allowed, error: hitErr } = await admin.rpc('login_throttle_hit', {
      p_keys: [`ip:${ip}`, idIpKey, idKey],
      p_max: [MAX_PER_IP, MAX_PER_IDENTIFIER_IP, MAX_PER_IDENTIFIER],
      p_window: WINDOW,
    });
    if (hitErr) throw hitErr;
    if (allowed === false) {
      return json({
        error: 'too_many_attempts',
        message: 'Too many attempts. Try again in a few minutes, or sign in with your email.',
      }, 429);
    }

    const email = await resolveEmail(admin, raw);
    if (!email) {
      // Spend a real sign-in call so response time doesn't reveal an unknown identifier.
      await anon.auth.signInWithPassword({ email: 'nobody@invalid.example', password });
      return await invalid();
    }

    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      // GoTrue only reports email_not_confirmed after the password verified,
      // so it is safe to tell the caller.
      if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message ?? '')) {
        return json({ error: 'email_not_confirmed', message: 'Email not confirmed' }, 403);
      }
      // Auth being rate-limited or down is not a wrong password.
      if (error && error.code !== 'invalid_credentials' && (error.status === 429 || (error.status ?? 0) >= 500)) {
        return json({ error: 'auth_unavailable', message: 'Sign-in is busy right now. Try again in a moment.' }, 503);
      }
      return await invalid();
    }

    await admin.rpc('login_throttle_clear', { p_key: idIpKey });
    const s = data.session;
    return json({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      token_type: s.token_type,
    });
  } catch (e) {
    console.error('login-with-identifier failed', e);
    return json({ error: 'server_error', message: 'Something went wrong. Try again.' }, 500);
  }
});
