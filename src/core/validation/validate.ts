import type { ZodType } from 'zod'
import { profileIntegrityIssues, profileSchema, type Profile } from './schemas'

/**
 * The validation result shape the rest of the app speaks.
 *
 * Storage, backup, and the profile store never touch Zod directly — they take a
 * `Validator`. That keeps one validation owner (this folder) and lets the storage
 * layer be tested with a hand-written validator when a failure needs forcing.
 */

export interface ValidationIssue {
  /** Dotted path into the value, e.g. `schedule.sessionsPerWeek`. Empty for the root. */
  readonly path: string
  readonly message: string
}

export type ValidationResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: ValidationIssue[] }

export interface Validator<T> {
  validate(value: unknown): ValidationResult<T>
}

function pathToString(path: readonly PropertyKey[]): string {
  return path.map((segment) => String(segment)).join('.')
}

/** Wraps a Zod schema in the app-facing `Validator` interface. */
export function schemaValidator<T>(schema: ZodType<T>): Validator<T> {
  return {
    validate(value) {
      const result = schema.safeParse(value)
      if (result.success) return { ok: true, value: result.data }
      return {
        ok: false,
        issues: result.error.issues.map((issue) => ({
          path: pathToString(issue.path),
          message: issue.message,
        })),
      }
    },
  }
}

/** Renders issues as one readable line — for error banners, never for control flow. */
export function formatIssues(issues: readonly ValidationIssue[], limit = 5): string {
  if (issues.length === 0) return ''
  const shown = issues
    .slice(0, limit)
    .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))
  const extra = issues.length - shown.length
  return extra > 0 ? `${shown.join('; ')} (+${extra} more)` : shown.join('; ')
}

/**
 * Field rules plus the cross-field rules. This is the profile validator every
 * write path uses; nothing should call `profileSchema.safeParse` directly.
 */
export const profileValidator: Validator<Profile> = {
  validate(value) {
    const parsed = schemaValidator(profileSchema).validate(value)
    if (!parsed.ok) return parsed

    const profile = parsed.value as Profile
    const integrity = profileIntegrityIssues(profile)
    if (integrity.length > 0) return { ok: false, issues: integrity }

    return { ok: true, value: profile }
  },
}

/** Convenience wrapper for one-off checks in UI code. */
export function parseProfile(value: unknown): ValidationResult<Profile> {
  return profileValidator.validate(value)
}
