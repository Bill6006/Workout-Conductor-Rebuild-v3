import { expect, test } from '@playwright/test'
import { prepareError, readSettings, readStoredProfile, startFresh } from './appState'
import { ROUTES, SETUP_ROUTE, SETUP_STEPS } from './routes'
import {
  SETUP_STEP_COUNT,
  choice,
  dayToggle,
  expectOnStep,
  goForward,
  stepHeading,
  walkSetup,
} from './setupFlow'

/**
 * First-run setup, end to end in a real browser.
 *
 * Every test here starts from a genuine first visit — no profile, no draft, no
 * remembered step — because the gate's whole job is deciding what an unset-up
 * device may see.
 */

test.beforeEach(async ({ page }) => {
  await startFresh(page)
})

test('a first visit lands on setup instead of in the app', async ({ page }) => {
  await page.goto('./')

  expect(await prepareError(page), 'the test seed itself failed').toBeNull()
  await expect(page).toHaveURL(new RegExp(`${SETUP_ROUTE.hash}$`))
  await expect(stepHeading(page, 0)).toBeVisible()

  // Nothing from the app leaks through behind the gate.
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start Workout' })).toHaveCount(0)
})

test('every deep link is sent to setup until it is finished', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(`./${route.hash}`)

    await expect(page, `${route.tab} must not skip setup`).toHaveURL(new RegExp(`${SETUP_ROUTE.hash}$`))
    await expect(stepHeading(page, 0)).toBeVisible()
  }
})

test('walking every step and finishing lands on Today with the chosen answers', async ({ page }) => {
  await page.goto('./')

  await walkSetup(page, async (index) => {
    const step = SETUP_STEPS[index]

    if (step.name === 'Goals') {
      await choice(page, 'Main goal', 'Get stronger').click()
      await choice(page, 'Second goal', 'Bigger arms').click()
    }

    if (step.name === 'Experience') {
      await choice(page, 'Experience', 'Advanced').click()
      await choice(page, 'Training style', 'Strength').click()
    }

    if (step.name === 'Schedule') {
      await page.getByRole('spinbutton', { name: 'Typical session length' }).fill('45')
      await dayToggle(page, 'Days you can train', 'Wednesday').click()
    }

    if (step.name === 'Places') {
      // Two locations are pre-filled; the first is the one the app opens with.
      // Every control on this step carries its place's name, because otherwise
      // the two are indistinguishable to anything that reads by name.
      await page.getByRole('textbox', { name: 'Name Gym', exact: true }).fill('Ironworks Gym')
    }

    if (step.name === 'Training') {
      await page.getByRole('switch', { name: 'Circuits', exact: true }).click()
      await choice(page, 'Rest between sets', 'Long').click()
      await choice(page, 'Weights are shown in', 'kg').click()
    }

    if (step.name === 'Limits') {
      await page.getByRole('switch', { name: 'Knee trouble', exact: true }).click()
      await page.getByRole('textbox', { name: 'Exercises you like' }).fill('Front squat')
      await page.getByRole('button', { name: 'Add a liked exercise', exact: true }).click()
    }

    if (step.name === 'Review') {
      // The last chance to notice a wrong answer, so it has to show them all.
      const review = page.getByRole('main')
      await expect(review).toContainText('Get stronger')
      await expect(review).toContainText('Bigger arms')
      await expect(review).toContainText('Advanced')
      await expect(review).toContainText('45 min')
      await expect(review).toContainText('Ironworks Gym')
      await expect(review).toContainText('Front squat')
    }
  })

  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)

  const facts = page.getByTestId('today-facts')
  await expect(facts).toContainText('Ironworks Gym')
  await expect(facts).toContainText('45 min')
  await expect(facts).toContainText('Strength')

  // The same answers, read back out of the settings surface.
  await page.goto('./#/settings')
  const main = page.getByRole('main')
  await expect(main).toContainText('Get stronger')
  await expect(main).toContainText('Advanced')
  await expect(main).toContainText('Front squat')
  await expect(main).toContainText('Knee')

  const stored = await readStoredProfile(page)
  expect(stored?.goals.primary).toBe('get-stronger')
  expect(stored?.trainingStyle).toBe('strength')
  expect(stored?.schedule.typicalDurationMin).toBe(45)
  expect(stored?.onboardingCompletedAt).not.toBeNull()

  // The draft has no life after setup is written.
  const settings = await readSettings(page)
  expect(Object.keys(settings)).not.toContain('wc:onboarding-draft')
  expect(Object.keys(settings)).not.toContain('wc:onboarding-step')
})

test('"Skip setup" writes the documented defaults and opens the app', async ({ page }) => {
  await page.goto('./')

  await page.getByRole('button', { name: 'Skip setup', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByTestId('today-facts')).toContainText('60 min')

  // Skipping is a real completion, not a one-render bypass.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
  expect((await readStoredProfile(page))?.onboardingCompletedAt).not.toBeNull()
})

test('a reload part-way through setup resumes on the same step with the answers kept', async ({ page }) => {
  await page.goto('./')

  await goForward(page, 0)
  await expectOnStep(page, 1)
  await choice(page, 'Main goal', 'Get stronger').click()
  await goForward(page, 1)
  await expectOnStep(page, 2)

  const saved = await readSettings(page)
  expect(Object.keys(saved)).toContain('wc:onboarding-draft')
  expect(Object.keys(saved)).toContain('wc:onboarding-step')

  await page.reload()

  await expectOnStep(page, 2)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expectOnStep(page, 1)
  await expect(choice(page, 'Main goal', 'Get stronger')).toHaveAttribute('aria-checked', 'true')

  // A half-finished setup writes nothing durable.
  expect(await readStoredProfile(page)).toBeNull()
})

test('a step with a required answer refuses to move forward', async ({ page }) => {
  await page.goto('./')

  await goForward(page, 0)
  await goForward(page, 1)
  await goForward(page, 2)
  await expectOnStep(page, 3)

  for (const day of ['Monday', 'Tuesday', 'Thursday', 'Saturday']) {
    await dayToggle(page, 'Days you can train', day).click()
  }

  await goForward(page, 3)

  await expect(page.getByText('Pick at least one day you can train.').first()).toBeVisible()
  await expectOnStep(page, 3)

  await dayToggle(page, 'Days you can train', 'Wednesday').click()
  await goForward(page, 3)
  await expectOnStep(page, 4)
})

test('a place with no name blocks the step that owns it', async ({ page }) => {
  await page.goto('./')

  await goForward(page, 0)
  await goForward(page, 1)
  await goForward(page, 2)
  await goForward(page, 3)
  await expectOnStep(page, 4)

  await page.getByRole('textbox', { name: 'Name Gym', exact: true }).fill('')
  await goForward(page, 4)

  await expect(page.getByText('Give this place a name.').first()).toBeVisible()
  await expectOnStep(page, 4)
})

test('setup keeps exactly one h1 on every step', async ({ page }) => {
  await page.goto('./')

  await walkSetup(page, async (index) => {
    const headings = await page.locator('h1').allTextContents()
    expect(headings, `step ${index + 1} of ${SETUP_STEP_COUNT}`).toEqual([SETUP_STEPS[index].heading])
  })

  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible()
})
