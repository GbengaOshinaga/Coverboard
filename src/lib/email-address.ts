import { z } from "zod";

/**
 * Email addresses are stored and looked up in lower case, so Jo@Care.co.uk
 * and jo@care.co.uk are one account: nobody can sign up again with different
 * capitals, be invited twice, or fail to sign in for typing their address
 * differently. Every place an address comes in uses one of these.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A zod email field that trims and lower-cases before checking the format. */
export function emailField(message = "Invalid email address") {
  return z.string().trim().toLowerCase().email(message);
}
