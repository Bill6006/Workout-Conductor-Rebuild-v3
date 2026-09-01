import { expect, type Locator, type Page } from '@playwright/test'
import { SETUP_STEPS } from './routes'

/**
 * Driving the setup flow.
 *
 * Every step is identified by its own `h1` and by the "Step n of 8" counter, so a
 * step that silently fails to advance fails the assertion rather than the next
 * step's selector — the difference between a readable failure and a mystery.
 *
 * There are no timeouts here. Each move waits on the next step's heading, which
 * is the app telling us it arrived.
 */

export const SETUP_STEP_COUNT = SETUP_STEPS.length

export function stepHeading(page: Page, index: number): Locator {
  return page.getByRole('heading', { level: 1, name: SETUP_STEPS[index].heading, exact: true })
}

export async function expectOnStep(page: Page, index: number): Promise<void> {
  await expect(stepHeading(page, index), `expected setup step ${index + 1}`).toBeVisible()
  await expect(page.getByText(`Step ${index + 1} of ${SETUP_STEP_COUNT}`, { exact: true })).toBeVisible()
}

/** The forward control for a step — "Start setup", "Continue", or "Finish setup". */
export function forwardButton(page: Page, index: number): Locator {
  return page.getByRole('button', { name: SETUP_STEPS[index].forward, exact: true })
}

export async function goForward(page: Page, index: number): Promise<void> {
  await forwardButton(page, index).click()
}

/**
 * Walks the whole flow from the welcome step to a written profile, running
 * `onStep` while each step is on screen. Returns once setup has been left.
 */
export async function walkSetup(page: Page, onStep?: (index: number) => Promise<void>): Promise<void> {
  for (let index = 0; index < SETUP_STEP_COUNT; index += 1) {
    await expectOnStep(page, index)
    await onStep?.(index)
    await goForward(page, index)
  }
}

/** A ChoiceCard inside the radiogroup a FormField label names. */
export function choice(page: Page, group: string, option: string): Locator {
  return page.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name: option })
}

/** A DayPicker toggle, named by the full weekday. */
export function dayToggle(page: Page, group: string, day: string): Locator {
  return page
    .getByRole('group', { name: group, exact: true })
    .getByRole('checkbox', { name: day, exact: true })
}
