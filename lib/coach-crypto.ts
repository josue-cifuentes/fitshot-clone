import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;

function getKey(): Buffer {
  const raw = process.env.COACH_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      "COACH_ENCRYPTION_KEY must be set (min 16 chars; use 64 hex chars for AES-256)."
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return scryptSync(raw, "fitshot-coach-salt", KEY_LEN);
}

export function encryptSecret(plain: string): {
  cipherText: string;
  iv: string;
  tag: string;
} {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    cipherText: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(parts: {
  cipherText: string;
  iv: string;
  tag: string;
}): string {
  const key = getKey();
  const iv = Buffer.from(parts.iv, "base64");
  const tag = Buffer.from(parts.tag, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(parts.cipherText, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
