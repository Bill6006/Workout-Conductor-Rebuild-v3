export * from './schemas'
export * from './validate'

/**
 * TYPES ONLY, DELIBERATELY.
 *
 * This barrel is imported at runtime by the onboarding and settings screens,
 * which are on the boot path. `export * from './workoutSchema'` would put the
 * whole generated-session model — a large Zod tree nothing needs before a person
 * opens a session — on the first-paint chunk, and `src/test/bootChunkGuard.test.ts`
 * would fail on the catalog field names it carries.
 *
 * `export type *` is erased outright by `verbatimModuleSyntax`, so the types are
 * reachable from here and cost nothing. Anything that needs the SCHEMAS, the
 * validators, or `workoutListRows` imports './workoutSchema' directly.
 */
export type * from './workoutSchema'
