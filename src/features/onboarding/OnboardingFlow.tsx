import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PrimaryAction } from '../../components/PrimaryAction'
import { StepProgress } from '../../components/StepProgress'
import { useProfile } from '../../core/state'
import type { Profile } from '../../core/validation'
import { answersFromProfile, answersToPatch, createDefaultAnswers, type OnboardingAnswers } from './answers'
import { clearDraft, isDraftStorageAvailable, readDraft, saveDraft } from './draft'
import {
  stepIndex,
  stepsForMode,
  validateStep,
  type OnboardingMode,
  type OnboardingStepId,
  type StepIssue,
} from './steps'
import { ExperienceStep } from './ExperienceStep'
import { GoalsStep } from './GoalsStep'
import { LimitsStep } from './LimitsStep'
import { LocationsStep } from './LocationsStep'
import { ReviewStep } from './ReviewStep'
import { ScheduleStep } from './ScheduleStep'
import { TrainingStep } from './TrainingStep'
import { WelcomeStep } from './WelcomeStep'
import styles from './OnboardingFlow.module.css'

export type OnboardingOutcome = 'completed' | 'skipped'

export interface OnboardingFlowProps {
  /** `rerun` drops the welcome step and the skip action. Default `first-run`. */
  mode?: OnboardingMode
  /**
   * Starting values. Omit to read the profile from the store — pass `null`
   * explicitly to force the documented defaults regardless of what is stored.
   */
  initialProfile?: Profile | null
  /** Controlled step. Provide it with `onStepChange` to drive setup from a route. */
  step?: OnboardingStepId
  onStepChange?: (step: OnboardingStepId) => void
  /** Called once the profile is written — `'skipped'` when defaults were taken. */
  onFinish?: (outcome: OnboardingOutcome) => void
  /** Renders an "Exit setup" control when provided. The draft is kept. */
  onExit?: () => void
  className?: string
}

const STORAGE_WARNING =
  'This browser is not keeping site data, so a half-finished setup will not be remembered if you close the tab.'

/**
 * Step-by-step setup.
 *
 * Answers live in one draft object here and are mirrored to localStorage on every
 * change, so closing the tab loses nothing. The profile itself is written once, at
 * the end, through `useProfile()` — this screen never touches IndexedDB.
 *
 * Browser history is deliberately untouched. The flow can be driven from a route
 * by passing `step` + `onStepChange`; on its own it keeps its place in the draft
 * instead, so a reload resumes where the person stopped rather than trapping them
 * behind eight history entries.
 */
export function OnboardingFlow({
  mode = 'first-run',
  initialProfile,
  step,
  onStepChange,
  onFinish,
  onExit,
  className,
}: OnboardingFlowProps) {
  const { profile, saving, ensureProfile, updateProfile, completeOnboarding } = useProfile()
  const steps = useMemo(() => stepsForMode(mode), [mode])

  // Resolved once: a saved draft beats the stored profile, because it is the more
  // recent thing the person typed.
  const [initial] = useState(() => {
    const draft = readDraft()
    const source = initialProfile !== undefined ? initialProfile : profile
    return {
      answers: draft ? draft.answers : source ? answersFromProfile(source) : createDefaultAnswers(),
      stepId: draft?.stepId ?? null,
      seeded: draft !== null || source !== null,
    }
  })

  const [answers, setAnswers] = useState<OnboardingAnswers>(initial.answers)
  const answersRef = useRef(initial.answers)
  const seeded = useRef(initial.seeded)

  const [internalStep, setInternalStep] = useState<OnboardingStepId>(() => {
    const resumed = initial.stepId
    return resumed && steps.some((entry) => entry.id === resumed) ? resumed : steps[0].id
  })
  const current = step ?? internalStep
  const currentRef = useRef(current)
  currentRef.current = current

  const [issues, setIssues] = useState<readonly StepIssue[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [returnToReview, setReturnToReview] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const mounted = useRef(true)
  const settled = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // The profile can arrive after this screen mounts (storage is async). Seed from
  // it only while nothing has been entered — never overwrite live answers.
  useEffect(() => {
    if (seeded.current) return
    const source = initialProfile !== undefined ? initialProfile : profile
    if (!source) return
    seeded.current = true
    const next = answersFromProfile(source)
    answersRef.current = next
    setAnswers(next)
  }, [initialProfile, profile])

  // Focus the new step's heading so a screen reader announces where it landed.
  // Skipped on the first render: nothing changed, and stealing focus on arrival
  // would yank the page for everyone else.
  useEffect(() => {
    if (!settled.current) {
      settled.current = true
      return
    }
    headingRef.current?.focus()
    document.documentElement.scrollTop = 0
  }, [current])

  const update = useCallback((patch: Partial<OnboardingAnswers>) => {
    const next = { ...answersRef.current, ...patch }
    answersRef.current = next
    setAnswers(next)
    saveDraft(currentRef.current, next)
  }, [])

  const goTo = useCallback(
    (next: OnboardingStepId) => {
      setIssues([])
      setSaveError(null)
      if (step === undefined) setInternalStep(next)
      onStepChange?.(next)
      saveDraft(next, answersRef.current)
    },
    [step, onStepChange],
  )

  const index = stepIndex(steps, current)
  const definition = steps[index]
  const isReview = definition.id === 'review'
  const isWelcome = definition.id === 'welcome'
  const busy = saving || working

  async function writeProfile(outcome: OnboardingOutcome) {
    setWorking(true)
    setSaveError(null)
    try {
      // `ensureProfile` creates the default record on a first run and returns the
      // existing one on a re-run, so nothing is wiped either way.
      const created = await ensureProfile()
      if (!created.ok) {
        setSaveError(created.message)
        return false
      }

      if (outcome === 'completed') {
        const saved = await updateProfile(answersToPatch(answersRef.current))
        if (!saved.ok) {
          setSaveError(saved.message)
          return false
        }
      }

      const finished = await completeOnboarding()
      if (!finished.ok) {
        setSaveError(finished.message)
        return false
      }

      clearDraft()
      return true
    } finally {
      if (mounted.current) setWorking(false)
    }
  }

  async function finish() {
    if (await writeProfile('completed')) onFinish?.('completed')
  }

  async function skip() {
    if (await writeProfile('skipped')) onFinish?.('skipped')
  }

  function forward() {
    const problems = validateStep(current, answersRef.current)
    if (problems.length > 0) {
      setIssues(problems)
      return
    }

    if (isReview) {
      void finish()
      return
    }

    if (returnToReview) {
      setReturnToReview(false)
      goTo('review')
      return
    }

    goTo(steps[Math.min(index + 1, steps.length - 1)].id)
  }

  function back() {
    setReturnToReview(false)
    goTo(steps[Math.max(index - 1, 0)].id)
  }

  function edit(target: OnboardingStepId) {
    setReturnToReview(true)
    goTo(target)
  }

  const forwardLabel = isWelcome
    ? 'Start setup'
    : isReview
      ? 'Finish setup'
      : returnToReview
        ? 'Done'
        : 'Continue'

  const body = renderStep(definition.id, answers, update, issues, edit)

  return (
    <div className={[styles.flow, className].filter(Boolean).join(' ')}>
      <div className={styles.top}>
        <StepProgress
          className={styles.progress}
          current={index + 1}
          total={steps.length}
          stepName={definition.name}
        />
        {onExit && (
          <button type="button" className={styles.exit} onClick={onExit}>
            Exit setup
          </button>
        )}
      </div>

      <div className={styles.head}>
        <h1 className={styles.title} ref={headingRef} tabIndex={-1}>
          {definition.heading}
        </h1>
        {definition.subtitle && <p className={styles.subtitle}>{definition.subtitle}</p>}
      </div>

      <div className={styles.body}>{body}</div>

      {/*
       * Gathered for the eye, not for the ear. Every message here is also
       * rendered by the field that can fix it, and `FormField` gives that copy
       * `role="alert"` — so the field announces it the moment it appears. This
       * summary used to sit in a live region as well, which meant a blocked
       * step said the same sentence twice. It is announced once now, by the
       * control the person has to go back to.
       */}
      {issues.length > 0 && (
        <ul className={styles.alertList} role="list">
          {issues.map((issue) => (
            <li key={`${issue.field}|${issue.message}`} className={styles.alert}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {/*
       * A failed save has no field to belong to, so it keeps the live region —
       * always in the DOM, so assistive tech is already watching when it lands.
       */}
      <div className={styles.alerts} role="status" aria-live="polite">
        {saveError && <p className={styles.failure}>{saveError}</p>}
      </div>

      {!isDraftStorageAvailable() && <p className={styles.note}>{STORAGE_WARNING}</p>}

      <div className={styles.dock}>
        <div className={styles.actions}>
          {index > 0 && (
            <PrimaryAction variant="ghost" className={styles.back} onClick={back} disabled={busy}>
              Back
            </PrimaryAction>
          )}
          {isWelcome && mode === 'first-run' && (
            <PrimaryAction
              variant="ghost"
              className={styles.back}
              onClick={() => void skip()}
              disabled={busy}
            >
              Skip setup
            </PrimaryAction>
          )}
          <PrimaryAction className={styles.forward} onClick={forward} disabled={busy}>
            {busy ? 'Saving…' : forwardLabel}
          </PrimaryAction>
        </div>
      </div>
    </div>
  )
}

function renderStep(
  id: OnboardingStepId,
  answers: OnboardingAnswers,
  onChange: (patch: Partial<OnboardingAnswers>) => void,
  issues: readonly StepIssue[],
  onEdit: (step: OnboardingStepId) => void,
) {
  const props = { answers, onChange, issues }

  switch (id) {
    case 'welcome':
      return <WelcomeStep />
    case 'goals':
      return <GoalsStep {...props} />
    case 'experience':
      return <ExperienceStep {...props} />
    case 'schedule':
      return <ScheduleStep {...props} />
    case 'locations':
      return <LocationsStep {...props} />
    case 'training':
      return <TrainingStep {...props} />
    case 'limits':
      return <LimitsStep {...props} />
    case 'review':
      return <ReviewStep answers={answers} onEdit={onEdit} />
  }
}
