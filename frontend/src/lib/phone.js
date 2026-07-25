export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function indianPhoneDigits(value) {
  const digits = phoneDigits(value);
  if (!digits) return '';
  if (digits.length >= 12 && digits.startsWith('91')) return digits.slice(-10);
  return digits.slice(-10);
}

export function formatIndianPhone(value, fallback = '') {
  const digits = indianPhoneDigits(value);
  return digits ? `+91 ${digits}` : fallback;
}

export function formatDialPhone(value, fallback = '') {
  const digits = indianPhoneDigits(value);
  return digits ? `+91${digits}` : fallback;
}
