import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdatePrompt } from './UpdatePrompt'

/**
 * This file replaces the settled stub installed in src/test/setup.ts with a
 * drivable one, so the two toast states can be reached. Under a real Vite dev
 * server the PWA plugin's virtual module never reports them, which is why the
 * prompt is otherwise unexercised until a deployed service worker updates.
 */
const sw = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(async () => {}),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [sw.offlineReady, sw.setOfflineReady],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}))

beforeEach(() => {
  sw.needRefresh = false
  sw.offlineReady = false
  sw.setNeedRefresh.mockClear()
  sw.setOfflineReady.mockClear()
  sw.updateServiceWorker.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('UpdatePrompt', () => {
  it('renders nothing while the worker is settled', () => {
    const { container } = render(<UpdatePrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('when a new version is waiting', () => {
    beforeEach(() => {
      sw.needRefresh = true
    })

    it('announces the update politely and promises data is kept', () => {
      render(<UpdatePrompt />)
      const toast = screen.getByRole('status')

      expect(toast).toHaveAttribute('aria-live', 'polite')
      expect(screen.getByText('New version available')).toBeInTheDocument()
      expect(screen.getByText(/everything saved on this device is kept/i)).toBeInTheDocument()
    })

    it('activates the waiting worker when Update is pressed', async () => {
      const user = userEvent.setup()
      render(<UpdatePrompt />)

      await user.click(screen.getByRole('button', { name: 'Update' }))
      expect(sw.updateServiceWorker).toHaveBeenCalledWith(true)
    })

    it('dismisses without updating when Later is pressed', async () => {
      const user = userEvent.setup()
      render(<UpdatePrompt />)

      await user.click(screen.getByRole('button', { name: 'Later' }))
      expect(sw.setNeedRefresh).toHaveBeenCalledWith(false)
      expect(sw.updateServiceWorker).not.toHaveBeenCalled()
    })
  })

  describe('when the app has just become available offline', () => {
    beforeEach(() => {
      sw.offlineReady = true
    })

    it('shows a compact confirmation with no actions', () => {
      render(<UpdatePrompt />)

      expect(screen.getByText('Ready to work offline')).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('clears itself after four seconds', () => {
      vi.useFakeTimers()
      render(<UpdatePrompt />)

      expect(sw.setOfflineReady).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(4000)
      })

      expect(sw.setOfflineReady).toHaveBeenCalledWith(false)
    })
  })

  it('prefers the update prompt over the offline toast when both are set', () => {
    sw.needRefresh = true
    sw.offlineReady = true
    render(<UpdatePrompt />)

    expect(screen.getByText('New version available')).toBeInTheDocument()
    expect(screen.queryByText('Ready to work offline')).not.toBeInTheDocument()
  })
})
