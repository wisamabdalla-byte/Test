// Libyan mobile numbers: +218 9X XXXXXXX, where 91/93/95 are Al-Madar and 92/94 are Libyana.
const OPERATORS = { 91: 'Al-Madar', 92: 'Libyana', 93: 'Al-Madar', 94: 'Libyana', 95: 'Al-Madar' };

// Accepts "0912345678", "912345678", "+218912345678", "00218 91-234-5678", etc.
// Returns { e164, operator } or null if the number is not a valid Libyan mobile.
function normalizeLibyanMobile(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+218')) digits = digits.slice(4);
  else if (digits.startsWith('00218')) digits = digits.slice(5);
  else if (digits.startsWith('218') && digits.length === 12) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^9[1-5]\d{7}$/.test(digits)) return null;
  return { e164: `+218${digits}`, operator: OPERATORS[digits.slice(0, 2)] };
}

module.exports = { normalizeLibyanMobile };
