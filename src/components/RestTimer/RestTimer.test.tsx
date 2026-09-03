import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RestTimer } from './RestTimer'
import { adjustAccessibleName, formatAdjustLabel, formatRestClock, formatRestSpoken } from './restTimerFormat'

const START = 1_760_000_000_000

/**
 * A hand-cranked clock. Wall time and the interval are advanced separately on
 * purpose: that is the only way to simulate a tab that was frozen — the clock
 * moved, the interval did not — which is exactly the case a decrementing
 * counter gets wrong.
 */
function makeClock(start = START) {
  let current = start
  return {
    now: () => current,
    /** Move wall time only. No timers fire. This is a backgrounded tab. */
    skip(ms: number) {
      current += ms
    },
    /** Move wall time and let the interval catch up. This is a visible tab. */
    run(ms: number) {
      current += ms
      act(() => {
        vi.advanceTimersByTime(ms)
      })
    },
  }
}

/** What a browser fires when the tab comes back to the foreground. */
function returnToForeground() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function noop() {}

function baseProps(clock: ReturnType<typeof makeClock>, endsAt: number | null) {
  return {
    endsAt,
    onSkip: noop,
    onAdjust: noop,
    onComplete: noop,
    now: clock.now,
  }
}

describe('RestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing at all while idle', () => {
    const clock = makeClock()
    const { container } = render(<RestTimer {...baseProps(clock, null)} nextSetSummary="Set 2 of 4" />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('group', { name: 'Rest timer' })).not.toBeInTheDocument()
  })

  it('counts down from the end timestamp the caller supplied', () => {
    const clock = makeClock()
    render(<RestTimer {...baseProps(clock, START + 90_000)} />)

    expect(screen.getByText('1:30')).toBeInTheDocument()

    clock.run(30_000)
    expect(screen.getByText('1:00')).toBeInTheDocument()

    clock.run(53_000)
    expect(screen.getByText('0:07')).toBeInTheDocument()
  })

  it('picks up mid-rest when it is mounted late, rather than restarting', () => {
    const clock = makeClock()
    // The rest began 70 seconds ago and runs for 120. A fresh mount — a tab
    // reload, a route change — must land on 0:50, not 2:00.
    render(<RestTimer {...baseProps(clock, START + 50_000)} />)

    expect(screen.getByText('0:50')).toBeInTheDocument()
  })

  it('recomputes from the clock after a background gap, with no ticks to help it', () => {
    const clock = makeClock()
    const onComplete = vi.fn()
    render(<RestTimer {...baseProps(clock, START + 90_000)} onComplete={onComplete} />)

    // Sixty seconds of wall time pass with the interval frozen solid.
    clock.skip(60_000)
    returnToForeground()

    expect(screen.getByText('0:30')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('finishes a rest that ran out while the tab was in the background', () => {
    const clock = makeClock()
    const onComplete = vi.fn()
    render(<RestTimer {...baseProps(clock, START + 90_000)} onComplete={onComplete} />)

    clock.skip(5 * 60_000)
    returnToForeground()

    expect(screen.getByText('Go')).toBeInTheDocument()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('shows the next set target so the person knows what they are resting for', () => {
    const clock = makeClock()
    render(<RestTimer {...baseProps(clock, START + 60_000)} nextSetSummary="Set 3 of 4 — 8 reps @ 60 kg" />)

    expect(screen.getByText('Next set')).toBeInTheDocument()
    expect(screen.getByText('Set 3 of 4 — 8 reps @ 60 kg')).toBeInTheDocument()
  })

  it('is a bar, not a modal — nothing behind it is blocked', () => {
    const clock = makeClock()
    render(<RestTimer {...baseProps(clock, START + 60_000)} />)

    const bar = screen.getByRole('group', { name: 'Rest timer' })
    expect(bar).not.toHaveAttribute('aria-modal')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  describe('quick adjust and skip', () => {
    it('offers two large adjust controls and a skip, and no more', () => {
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 60_000)} />)

      // The plan warns off a cluster of tiny buttons: three, and they are all
      // real buttons, all enabled, all in the tab order.
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(3)
      for (const button of buttons) {
        expect(button).toHaveAttribute('type', 'button')
        expect(button).toBeEnabled()
        expect(button).not.toHaveAttribute('tabindex')
      }

      expect(screen.getByRole('button', { name: 'Subtract 15 seconds of rest' })).toHaveTextContent('-15s')
      expect(screen.getByRole('button', { name: 'Add 30 seconds of rest' })).toHaveTextContent('+30s')
      expect(screen.getByRole('button', { name: 'Skip rest' })).toHaveTextContent('Skip')
    })

    it('fires onAdjust with the exact signed delta', () => {
      const clock = makeClock()
      const onAdjust = vi.fn()
      render(<RestTimer {...baseProps(clock, START + 60_000)} onAdjust={onAdjust} />)

      fireEvent.click(screen.getByRole('button', { name: 'Add 30 seconds of rest' }))
      expect(onAdjust).toHaveBeenCalledWith(30)

      fireEvent.click(screen.getByRole('button', { name: 'Subtract 15 seconds of rest' }))
      expect(onAdjust).toHaveBeenLastCalledWith(-15)
      expect(onAdjust).toHaveBeenCalledTimes(2)
    })

    it('honours caller-supplied deltas', () => {
      const clock = makeClock()
      const onAdjust = vi.fn()
      render(<RestTimer {...baseProps(clock, START + 60_000)} adjustments={[-30, 60]} onAdjust={onAdjust} />)

      expect(screen.getByRole('button', { name: 'Add 1 minute of rest' })).toHaveTextContent('+1 min')

      fireEvent.click(screen.getByRole('button', { name: 'Subtract 30 seconds of rest' }))
      expect(onAdjust).toHaveBeenCalledWith(-30)
    })

    it('fires onSkip', () => {
      const clock = makeClock()
      const onSkip = vi.fn()
      render(<RestTimer {...baseProps(clock, START + 60_000)} onSkip={onSkip} />)

      fireEvent.click(screen.getByRole('button', { name: 'Skip rest' }))
      expect(onSkip).toHaveBeenCalledTimes(1)
    })

    it('turns skip into dismiss once the rest is over', () => {
      const clock = makeClock()
      const onSkip = vi.fn()
      render(<RestTimer {...baseProps(clock, START + 10_000)} onSkip={onSkip} />)

      clock.run(10_000)

      const done = screen.getByRole('button', { name: 'Dismiss rest timer' })
      expect(done).toHaveTextContent('Done')
      fireEvent.click(done)
      expect(onSkip).toHaveBeenCalledTimes(1)
    })

    it('keeps the adjust controls live after the rest has finished', () => {
      const clock = makeClock()
      const onAdjust = vi.fn()
      render(<RestTimer {...baseProps(clock, START + 5_000)} onAdjust={onAdjust} />)

      clock.run(5_000)

      fireEvent.click(screen.getByRole('button', { name: 'Add 30 seconds of rest' }))
      expect(onAdjust).toHaveBeenCalledWith(30)
    })
  })

  describe('completion', () => {
    it('fires onComplete exactly once, however long it keeps ticking', () => {
      const clock = makeClock()
      const onComplete = vi.fn()
      render(<RestTimer {...baseProps(clock, START + 30_000)} onComplete={onComplete} />)

      clock.run(29_000)
      expect(onComplete).not.toHaveBeenCalled()

      clock.run(1_000)
      expect(onComplete).toHaveBeenCalledTimes(1)

      clock.run(60_000)
      returnToForeground()
      returnToForeground()
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('shows a visible completed state', () => {
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 5_000)} />)

      expect(screen.getByRole('group', { name: 'Rest timer' })).toHaveAttribute('data-state', 'running')

      clock.run(5_000)

      expect(screen.getByRole('group', { name: 'Rest timer' })).toHaveAttribute('data-state', 'complete')
      expect(screen.getByText('Go')).toBeInTheDocument()
    })

    it('re-arms when the caller extends a rest that had already finished', () => {
      const clock = makeClock()
      const onComplete = vi.fn()
      const { rerender } = render(<RestTimer {...baseProps(clock, START + 5_000)} onComplete={onComplete} />)

      clock.run(5_000)
      expect(onComplete).toHaveBeenCalledTimes(1)

      // The caller handled +30s by pushing the target out.
      rerender(<RestTimer {...baseProps(clock, START + 35_000)} onComplete={onComplete} />)
      expect(screen.getByText('0:30')).toBeInTheDocument()
      expect(onComplete).toHaveBeenCalledTimes(1)

      clock.run(30_000)
      expect(onComplete).toHaveBeenCalledTimes(2)
    })

    it('stops asking the clock once it has landed on zero', () => {
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 5_000)} />)

      expect(vi.getTimerCount()).toBeGreaterThan(0)
      clock.run(5_000)
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('haptics', () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'vibrate')
    })

    function stubVibrate(impl: (pattern: number[]) => boolean) {
      const spy = vi.fn(impl)
      Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: spy })
      return spy
    }

    it('does not vibrate when the platform has no vibrate at all', () => {
      const clock = makeClock()
      const onComplete = vi.fn()
      expect(navigator.vibrate).toBeUndefined()

      render(<RestTimer {...baseProps(clock, START + 5_000)} onComplete={onComplete} vibrate />)
      expect(() => clock.run(5_000)).not.toThrow()

      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Go')).toBeInTheDocument()
    })

    it('does not vibrate when the caller has not opted in', () => {
      const spy = stubVibrate(() => true)
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 5_000)} />)

      clock.run(5_000)
      expect(spy).not.toHaveBeenCalled()
    })

    it('vibrates once on completion when it is supported and opted in', () => {
      const spy = stubVibrate(() => true)
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 5_000)} vibrate />)

      clock.run(5_000)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy.mock.calls[0][0]).toEqual([140, 70, 140])

      clock.run(20_000)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('survives a browser that refuses to vibrate', () => {
      stubVibrate(() => {
        throw new Error('vibrate blocked without a user gesture')
      })
      const clock = makeClock()
      const onComplete = vi.fn()
      render(<RestTimer {...baseProps(clock, START + 5_000)} onComplete={onComplete} vibrate />)

      expect(() => clock.run(5_000)).not.toThrow()
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('the ARIA contract', () => {
    it('gives the remaining time a readable text form, not just digits', () => {
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 151_000)} />)

      const timer = screen.getByRole('timer')
      expect(timer).toHaveTextContent('2 minutes 31 seconds remaining')
      // The glanceable digits exist for eyes only.
      expect(screen.getByText('2:31')).toHaveAttribute('aria-hidden', 'true')
    })

    it('keeps the ticking readout out of the live region', () => {
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 60_000)} />)

      const timer = screen.getByRole('timer')
      expect(timer).toHaveAttribute('aria-live', 'off')

      const status = screen.getByRole('status')
      expect(status).toBeEmptyDOMElement()

      clock.run(1_000)
      clock.run(1_000)
      clock.run(1_000)
      expect(screen.getByText('0:57')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('announces completion politely, and names the next set', () => {
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 5_000)} nextSetSummary="Set 3 of 4 — 8 reps @ 60 kg" />)

      clock.run(5_000)

      expect(screen.getByRole('status')).toHaveTextContent(
        'Rest complete. Next set: Set 3 of 4 — 8 reps @ 60 kg',
      )
      expect(screen.getByRole('timer')).toHaveTextContent('Rest complete')
    })

    it('announces completion without a next set too', () => {
      const clock = makeClock()
      render(<RestTimer {...baseProps(clock, START + 5_000)} />)

      clock.run(5_000)
      expect(screen.getByRole('status')).toHaveTextContent('Rest complete.')
    })
  })

  it('respects prefers-reduced-motion', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const css = readFileSync(join(here, 'RestTimer.module.css'), 'utf8')

    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).not.toHaveLength(0)
    // The completion flash is the one thing a reduced-motion user asked us to drop.
    expect(block).toMatch(/animation:\s*none/)
    expect(block).toMatch(/transition:\s*none/)
    expect(block).toMatch(/transform:\s*none/)
  })
})

describe('rest timer text', () => {
  it('formats the clock with seconds rounded up', () => {
    expect(formatRestClock(151_000)).toBe('2:31')
    expect(formatRestClock(150_001)).toBe('2:31')
    expect(formatRestClock(7_000)).toBe('0:07')
    expect(formatRestClock(720_000)).toBe('12:00')
  })

  it('never formats a negative clock', () => {
    expect(formatRestClock(0)).toBe('0:00')
    expect(formatRestClock(-5_000)).toBe('0:00')
  })

  it('spells the remaining time out for assistive tech', () => {
    expect(formatRestSpoken(151_000)).toBe('2 minutes 31 seconds')
    expect(formatRestSpoken(61_000)).toBe('1 minute 1 second')
    expect(formatRestSpoken(120_000)).toBe('2 minutes')
    expect(formatRestSpoken(45_000)).toBe('45 seconds')
    expect(formatRestSpoken(0)).toBe('0 seconds')
  })

  it('labels an adjustment with its sign, and in minutes when it is whole', () => {
    expect(formatAdjustLabel(30)).toBe('+30s')
    expect(formatAdjustLabel(-15)).toBe('-15s')
    expect(formatAdjustLabel(60)).toBe('+1 min')
    expect(formatAdjustLabel(-120)).toBe('-2 min')
    expect(formatAdjustLabel(-90)).toBe('-90s')
  })

  it('names an adjustment in words', () => {
    expect(adjustAccessibleName(30)).toBe('Add 30 seconds of rest')
    expect(adjustAccessibleName(-15)).toBe('Subtract 15 seconds of rest')
    expect(adjustAccessibleName(-1)).toBe('Subtract 1 second of rest')
    expect(adjustAccessibleName(60)).toBe('Add 1 minute of rest')
    expect(adjustAccessibleName(-120)).toBe('Subtract 2 minutes of rest')
  })
})
