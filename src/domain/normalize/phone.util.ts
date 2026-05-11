const BRAZIL_COUNTRY_CODE = '55';
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  if (!digits) return raw;

  if (E164_REGEX.test(raw)) {
    return raw;
  }

  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+${BRAZIL_COUNTRY_CODE}${digits}`;
  }

  if (digits.length > 13) {
    return `+${digits}`;
  }

  return `+${BRAZIL_COUNTRY_CODE}${digits}`;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}
