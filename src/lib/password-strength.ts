/**
 * Password strength policy.
 *
 * Backed by zxcvbn-ts (TypeScript port of Dropbox's zxcvbn). zxcvbn scores
 * a password from 0 (trivially guessable) to 4 (very unguessable) based on
 * entropy, dictionary lookups, keyboard walks, repeat patterns and date
 * formats. Coverboard's policy:
 *
 *   - Minimum length: 8 characters (Zod-enforced upstream; cheap to check
 *     and gives a clear UX error before we run the scorer).
 *   - Minimum zxcvbn score: 2 ("somewhat guessable" — 10^4 to 10^6 guesses).
 *     Blocks "password", "qwerty1234", "letmein!", every leaked-password
 *     list, basic dictionary words and keyboard walks. Doesn't require
 *     complexity rules (NCSC-aligned).
 *   - User context: the candidate password is checked against the user's
 *     email/name/org name so an admin called "Alice" at "Acme" can't pick
 *     "alice@acme1".
 *
 * The English dictionary + common-substitution table from zxcvbn-ts adds
 * ~60KB minified to the server bundle. We deliberately don't ship this to
 * the browser — the signup form submits, the server scores, and any reject
 * comes back with a friendly message. Cheap, sufficient for the launch
 * threshold.
 */
import { zxcvbnOptions, zxcvbn } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

let initialised = false;
function ensureInit(): void {
  if (initialised) return;
  zxcvbnOptions.setOptions({
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
  });
  initialised = true;
}

export const MIN_PASSWORD_SCORE = 2;

export type StrengthResult = {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  /** Human-readable suggestion when ok=false. */
  message: string;
};

/**
 * Evaluate a candidate password against the project's strength policy.
 * `userInputs` are strings that get added to the dictionary — typically the
 * user's email, name and org name — so "alice@acme" doesn't pick "alice123".
 */
export function evaluatePasswordStrength(
  password: string,
  userInputs: ReadonlyArray<string> = []
): StrengthResult {
  ensureInit();

  const cleanedInputs = userInputs
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .flatMap((s) => {
      // Pass the raw input AND its email-local-part. zxcvbn matches the
      // whole string, so "alice@example.com" wouldn't catch "alice" on its
      // own without this split.
      const parts = [s];
      const localPart = s.includes("@") ? s.split("@")[0] : null;
      if (localPart) parts.push(localPart);
      return parts;
    });

  const result = zxcvbn(password, cleanedInputs);
  const score = result.score as 0 | 1 | 2 | 3 | 4;

  if (score >= MIN_PASSWORD_SCORE) {
    return { ok: true, score, message: "" };
  }

  // Prefer zxcvbn's own warning when it offers one — its phrasing tends to
  // be more specific than anything we'd write ("This is a top-100 common
  // password.").
  const warning = result.feedback.warning;
  const suggestion = result.feedback.suggestions[0];
  const message =
    warning && warning.length > 0
      ? warning
      : suggestion && suggestion.length > 0
      ? suggestion
      : "Please choose a stronger password — try adding more words or making it longer.";

  return { ok: false, score, message };
}
