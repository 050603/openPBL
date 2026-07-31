import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSecret = {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
};

export function encryptCredential(value: string, aad: string): EncryptedSecret | null {
  if (!value) return null;
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: Uint8Array.from(ciphertext),
    iv: Uint8Array.from(iv),
    authTag: Uint8Array.from(cipher.getAuthTag()),
  };
}

export function decryptCredential(
  encrypted: Uint8Array | null,
  iv: Uint8Array | null,
  authTag: Uint8Array | null,
  aad: string,
): string {
  if (!encrypted) return "";
  if (!iv || !authTag) throw new Error("Encrypted provider credential is incomplete.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(authTag));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted)),
    decipher.final(),
  ]).toString("utf8");
}

function encryptionKey(): Buffer {
  const raw = process.env.PROVIDER_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PROVIDER_ENCRYPTION_KEY is required.");
    }
    // Development-only deterministic key; never accepted by production env validation.
    return Buffer.alloc(32, 0);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PROVIDER_ENCRYPTION_KEY must decode to 32 bytes.");
  return key;
}
