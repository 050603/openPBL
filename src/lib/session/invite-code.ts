// Generates a 6-character invite code using only visually distinct characters.
// Excludes 0/O/1/I/L to avoid confusion.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function isValidInviteCode(code: string): boolean {
  return /^[A-Z2-9]{6}$/.test(code.trim().toUpperCase());
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}
