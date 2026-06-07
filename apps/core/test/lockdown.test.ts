import { describe, expect, test } from "bun:test";
import {
  hashLockdownPin,
  hasConfiguredLockdownPin,
  isLockdownPin,
  verifyLockdownPin,
} from "../src/lockdown.ts";

describe("lockdown", () => {
  test("accepts only 4 digit PINs", () => {
    expect(isLockdownPin("1234")).toBe(true);
    expect(isLockdownPin("123")).toBe(false);
    expect(isLockdownPin("12345")).toBe(false);
    expect(isLockdownPin("12a4")).toBe(false);
  });

  test("hashes and verifies a PIN without storing the cleartext value", async () => {
    const settings = await hashLockdownPin("4821");

    expect(settings.enabled).toBe(true);
    expect(settings.pinHash).not.toBe("4821");
    expect(settings.pinSalt.length).toBeGreaterThan(0);
    expect(hasConfiguredLockdownPin(settings)).toBe(true);
    expect(await verifyLockdownPin("4821", settings)).toBe(true);
    expect(await verifyLockdownPin("4822", settings)).toBe(false);
  });

  test("rejects invalid PINs before hashing", async () => {
    await expect(hashLockdownPin("abcd")).rejects.toThrow("Enter a 4 digit PIN.");
  });
});
