// Send a password-reset email given an email, username or phone.
//
// Supabase Auth only takes an email, so a username/phone has to be resolved to
// one first. That lookup happens here with the service role: the reset email
// goes to the account's own address, but the client never learns it, and the
// reply is the same whether or not an account matched so this can't be used to
// probe which usernames/phones/emails exist.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { clientIp, resolveEmail, sha256Hex } from '../_shared/identity.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false } });

const WINDOW = '15 minutes';
const MAX_PER_IP = 20;               // all reset requests from one IP
const MAX_PER_IDENTIFIER = 5;        // one identifier from anywhere (caps mail-bombing a victim)
const MIN_MS = 700;                  // pad every reply so found vs. not-found take similar time
const TOO_MANY = { error: 'too_many_attempts', message: 'Too many reset requests. Try again in a few minutes.' };
const OK = { ok: true, message: "If an account matches, we've sent a password reset link to its email address." };

// Only pass a redirect through if it points at the reset-password screen
// (https://…/reset-password or a custom scheme like pincode://reset-password).
// Supabase also checks it against its own allow-list; this just keeps the
// function from being a general-purpose redirect picker.
const REDIRECT_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s]*reset-password\/?(\?[^\s#]*)?$/i;
function safeRedirect(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 512 || !REDIRECT_RE.test(v)) return undefined;
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Every reply waits out the same floor (plus jitter) so timing reveals nothing.
async function padded(make: () => Response, started: number): Promise<Response> {
  const left = MIN_MS - (Date.now() - started);
  await sleep(Math.max(left, 0) + Math.floor(Math.random() * 150));
  return make();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { identifier?: unknown; redirectTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request.' }, 400);
  }
  const { identifier } = body;
  if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 256) {
    return json({ error: 'bad_request', message: 'Invalid request.' }, 400);
  }

  const started = Date.now();
  const raw = identifier.trim();
  const redirectTo = safeRedirect(body.redirectTo);
  const ip = clientIp(req);

  // Forward the caller's IP so Auth's own per-IP rate limit is per user, not
  // one shared budget for this function's few outbound addresses.
  const anon = createClient(URL_, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'X-Forwarded-For': ip } },
  });

  try {
    // Records this attempt and checks both limits in one call (atomic).
    const { data: allowed, error: hitErr } = await admin.rpc('login_throttle_hit', {
      p_keys: [`reset-ip:${ip}`, `reset-id:${await sha256Hex(raw.toLowerCase())}`],
      p_max: [MAX_PER_IP, MAX_PER_IDENTIFIER],
      p_window: WINDOW,
    });
    if (hitErr) throw hitErr;
    if (allowed === false) return await padded(() => json(TOO_MANY, 429), started);

    const email = await resolveEmail(admin, raw);
    if (email) {
      const { error } = await anon.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      if (error) {
        // Never change the reply on a GoTrue error (including its per-account
        // "one email per minute" rate limit): that only fires for accounts that
        // exist, so surfacing it would reveal which identifiers are real.
        console.error('request-password-reset: auth error', error.status, error.code);
      }
    }

    return await padded(() => json(OK), started);
  } catch (e) {
    console.error('request-password-reset failed', e);
    return await padded(() => json({ error: 'server_error', message: 'Something went wrong. Try again.' }, 500), started);
  }
});
