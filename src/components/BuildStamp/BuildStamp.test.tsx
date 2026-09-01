import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BuildStamp } from './BuildStamp'

describe('BuildStamp', () => {
  it('carries the data-testid every screenshot and smoke test keys off', () => {
    render(<BuildStamp />)
    expect(screen.getByTestId('build-marker')).toBeInTheDocument()
  })

  it('prints the marker and the formatted build stamp', () => {
    render(<BuildStamp />)
    expect(screen.getByTestId('build-marker')).toHaveTextContent(
      'test-marker · build abcdef1 · 2026-09-01 14:22 UTC',
    )
  })

  it('is never empty — an unlabelled build is an untraceable build', () => {
    render(<BuildStamp />)
    expect(screen.getByTestId('build-marker').textContent?.trim().length ?? 0).toBeGreaterThan(0)
  })
})
