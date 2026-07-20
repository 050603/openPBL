// Password hashing utilities using Node's built-in scrypt.
// Scrypt is intentionally chosen to avoid extra native dependencies (bcrypt).
// Runs on Node.js runtime (not Edge).

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  // Format: scrypt$N$r$p$saltHex$hashHex
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], "hex");
    const expectedHash = Buffer.from(parts[5], "hex");
    const actualHash = scryptSync(password, salt, expectedHash.length, {
      N,
      r,
      p,
    });
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
