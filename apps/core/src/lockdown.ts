import { timingSafeEqual, randomBytes, pbkdf2 } from "node:crypto";
import { promisify } from "node:util";
import type { LockdownSettings } from "@felix/contracts";

const pbkdf2Async = promisify(pbkdf2);
const PIN_PATTERN = /^\d{4}$/;
const PIN_HASH_ITERATIONS = 210_000;
const PIN_HASH_KEY_LENGTH = 32;
const PIN_HASH_DIGEST = "sha256";
const PIN_SALT_BYTES = 16;

export function isLockdownPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

export function hasConfiguredLockdownPin(settings: LockdownSettings): boolean {
  return settings.enabled && settings.pinHash.length > 0 && settings.pinSalt.length > 0;
}

export async function hashLockdownPin(pin: string): Promise<LockdownSettings> {
  if (!isLockdownPin(pin)) throw new Error("Enter a 4 digit PIN.");

  const salt = randomBytes(PIN_SALT_BYTES).toString("base64");
  const hash = await derivePinHash(pin, salt);
  return {
    enabled: true,
    pinHash: hash.toString("base64"),
    pinSalt: salt,
  };
}

export async function verifyLockdownPin(
  pin: string,
  settings: LockdownSettings,
): Promise<boolean> {
  if (!isLockdownPin(pin) || !hasConfiguredLockdownPin(settings)) return false;

  const expected = Buffer.from(settings.pinHash, "base64");
  if (expected.byteLength !== PIN_HASH_KEY_LENGTH) return false;

  const actual = await derivePinHash(pin, settings.pinSalt);
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
}

function derivePinHash(pin: string, salt: string): Promise<Buffer> {
  return pbkdf2Async(pin, salt, PIN_HASH_ITERATIONS, PIN_HASH_KEY_LENGTH, PIN_HASH_DIGEST);
}
