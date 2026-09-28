// Ported from the SQL function public.normalize_phone_in (§2.1). Accepts
// '98450 12345', '+91-9845012345', '09845012345', '919845012345'.

export function normalizeIndianPhone(input: string | null | undefined): string | null {
  let d = (input ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2);
  else if (d.length === 11 && d.slice(0, 1) === '0') d = d.slice(1);
  if (/^[6-9][0-9]{9}$/.test(d)) return '+91' + d;
  return null;
}
