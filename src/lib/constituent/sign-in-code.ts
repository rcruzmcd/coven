/**
 * The words the one-time sign-in code (#1765) shows, shared by the action and
 * the forms. None of them varies with whether the address is known.
 */

/** The one answer to "send me a code", match or no match. */
export const SIGN_IN_CODE_SENT =
  "If we have details for this address, we've sent a 6-digit code.";

export const SIGN_IN_CODE_RATE_LIMITED =
  "Too many codes asked for. Wait a few minutes and try again.";

export const SIGN_IN_CODE_INVALID_EMAIL = "Enter a valid email address.";

/** Wrong, expired or already used: never "no account for this address". */
export const SIGN_IN_CODE_REJECTED =
  "That code didn't work. It may have expired. Check it, or send a new one.";

export const SIGN_IN_CODE_LENGTH = 6;

/** Digits only, so a pasted "123 456" or "123-456" still verifies. */
export function normalizeSignInCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, SIGN_IN_CODE_LENGTH);
}
