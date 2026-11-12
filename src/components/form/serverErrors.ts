/**
 * Puts a server error code on the field it belongs to. `fields` maps a code to a form field name.
 * Returns true when the code was mapped (the caller shows a general message otherwise).
 * The message is an i18n key: `${keyPrefix}.${code}`.
 */
export function applyServerError(
  code: string,
  fields: Record<string, string>,
  setError: (name: string, e: { type: 'server'; message: string }) => void,
  keyPrefix: 'admin.error' | 'settings.error' = 'admin.error'
): boolean {
  const name = fields[code];
  if (!name) return false;
  setError(name, { type: 'server', message: `${keyPrefix}.${code}` });
  return true;
}
