import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlateMath } from './PlateMath'
import type { PlateMathLoadModel } from './plateLoad'

const BARBELL: PlateMathLoadModel = { basis: 'barbell', measure: 'total', usesBar: true, plateMath: true }

const PLATE_MACHINE: PlateMathLoadModel = {
  basis: 'plate-loaded-machine',
  measure: 'total',
  usesBar: false,
  plateMath: true,
}

const DUMBBELL: PlateMathLoadModel = {
  basis: 'dumbbell',
  measure: 'per-hand',
  usesBar: false,
  plateMath: false,
}

const RACK = [
  { weight: 25, perSide: 4 },
  { weight: 20, perSide: 2 },
  { weight: 10, perSide: 2 },
  { weight: 5, perSide: 2 },
  { weight: 2.5, perSide: 2 },
  { weight: 1.25, perSide: 2 },
]

describe('PlateMath — an exact load', () => {
  it('reads as an equation a person can follow at the rack', () => {
    render(<PlateMath targetWeight={70} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    expect(screen.getByText('70 kg = bar + 25 per side')).toBeInTheDocument()
    expect(screen.getByText('20 kg bar + 25 kg per side')).toBeInTheDocument()
  })

  it('spells a run of plates out one plate at a time', () => {
    render(<PlateMath targetWeight={130} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    expect(screen.getByText('130 kg = bar + 25 + 25 + 5 per side')).toBeInTheDocument()
  })

  it('leaves the bar out of the equation when the exercise has no bar', () => {
    render(<PlateMath targetWeight={60} unit="kg" load={PLATE_MACHINE} inventory={RACK} />)

    expect(screen.getByText('60 kg = 25 + 5 per side')).toBeInTheDocument()
    expect(screen.getByText('30 kg per side')).toBeInTheDocument()
  })

  it('works in pounds', () => {
    render(
      <PlateMath
        targetWeight={135}
        unit="lb"
        load={BARBELL}
        barWeight={45}
        inventory={[{ weight: 45, perSide: 4 }]}
      />,
    )

    expect(screen.getByText('135 lb = bar + 45 per side')).toBeInTheDocument()
    expect(screen.getByText('45 lb bar + 45 lb per side')).toBeInTheDocument()
  })

  it('says "empty bar" rather than printing an equation with nothing on the right', () => {
    render(<PlateMath targetWeight={20} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    expect(screen.getByText('20 kg = empty bar')).toBeInTheDocument()
  })
})

describe('PlateMath — the honest near miss', () => {
  it('shows the weight it can really load and how far off the target that is', () => {
    render(<PlateMath targetWeight={61} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    expect(screen.getByText('60 kg = bar + 20 per side')).toBeInTheDocument()
    expect(screen.getByText('Closest loadable — 1 kg under the 61 kg target.')).toBeInTheDocument()
  })

  it('says "over" when the nearest loadable weight is heavier than asked', () => {
    render(
      <PlateMath
        targetWeight={28}
        unit="kg"
        load={BARBELL}
        barWeight={20}
        inventory={[{ weight: 5, perSide: 2 }]}
      />,
    )

    expect(screen.getByText('30 kg = bar + 5 per side')).toBeInTheDocument()
    expect(screen.getByText('Closest loadable — 2 kg over the 28 kg target.')).toBeInTheDocument()
  })

  it('never claims a near miss is exact', () => {
    render(<PlateMath targetWeight={61} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    expect(screen.queryByText('61 kg = bar + 20 per side')).not.toBeInTheDocument()
  })
})

describe('PlateMath — targets under the bar and empty racks', () => {
  it('tells a person the empty bar already outweighs the target', () => {
    render(<PlateMath targetWeight={15} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    expect(screen.getByText('20 kg = empty bar')).toBeInTheDocument()
    expect(
      screen.getByText('15 kg is under the bar — the empty bar already weighs 20 kg.'),
    ).toBeInTheDocument()
  })

  it('uses the bar weight it is given rather than assuming an Olympic bar', () => {
    render(<PlateMath targetWeight={40} unit="kg" load={BARBELL} barWeight={10} inventory={RACK} />)

    expect(screen.getByText('40 kg = bar + 10 + 5 per side')).toBeInTheDocument()
    expect(screen.getByText('10 kg bar + 15 kg per side')).toBeInTheDocument()
  })

  it('says the rack is empty instead of showing a bar-only equation on its own', () => {
    render(<PlateMath targetWeight={60} unit="kg" load={BARBELL} barWeight={20} inventory={[]} />)

    expect(screen.getByText('20 kg = empty bar')).toBeInTheDocument()
    expect(
      screen.getByText('No plates available — the empty bar is 40 kg under the 60 kg target.'),
    ).toBeInTheDocument()
  })

  it('offers no weight at all when there is neither a bar nor a plate', () => {
    render(<PlateMath targetWeight={60} unit="kg" load={PLATE_MACHINE} inventory={[]} />)

    expect(screen.getByText('No plates available')).toBeInTheDocument()
    expect(screen.getByText('Nothing to load for a 60 kg target.')).toBeInTheDocument()
  })
})

describe('PlateMath — dumbbells are per hand, not plate math', () => {
  it('says the number is what goes in each hand', () => {
    render(<PlateMath targetWeight={22.5} unit="kg" load={DUMBBELL} />)

    expect(screen.getByText('22.5 kg in each hand')).toBeInTheDocument()
    expect(screen.getByText('Per hand, not the total for both.')).toBeInTheDocument()
  })

  it('proposes no plates and no bar for a per-hand exercise', () => {
    render(<PlateMath targetWeight={22.5} unit="kg" load={DUMBBELL} barWeight={20} />)

    expect(screen.queryByText(/per side/)).not.toBeInTheDocument()
    expect(screen.queryByText(/bar/)).not.toBeInTheDocument()
  })
})

describe('PlateMath — exercises that have no plate breakdown', () => {
  it('renders nothing when the load model says plateMath is false', () => {
    const { container } = render(
      <PlateMath
        targetWeight={60}
        unit="kg"
        load={{ basis: 'cable-stack', measure: 'total', usesBar: false, plateMath: false }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an exercise that carries no external load', () => {
    const { container } = render(
      <PlateMath
        targetWeight={0}
        unit="kg"
        load={{ basis: 'bodyweight', measure: 'none', usesBar: false, plateMath: false }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})

describe('PlateMath — the ARIA contract', () => {
  it('is one named group so a screen reader can find and skip it', () => {
    render(<PlateMath targetWeight={70} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    expect(screen.getByRole('group', { name: 'How to load' })).toBeInTheDocument()
  })

  it('names the group after the exercise when it is given one', () => {
    render(
      <PlateMath
        targetWeight={70}
        unit="kg"
        load={BARBELL}
        barWeight={20}
        inventory={RACK}
        exerciseName="Barbell back squat"
      />,
    )

    expect(screen.getByRole('group', { name: 'How to load Barbell back squat' })).toBeInTheDocument()
  })

  it('reads the equation first and the caveat before the supporting detail', () => {
    render(<PlateMath targetWeight={61} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    const group = screen.getByRole('group', { name: 'How to load' })
    const lines = Array.from(group.querySelectorAll('p')).map((node) => node.textContent)

    expect(lines).toEqual([
      '60 kg = bar + 20 per side',
      'Closest loadable — 1 kg under the 61 kg target.',
      '20 kg bar + 20 kg per side',
    ])
  })

  it('renders no caveat line when the load is exact', () => {
    render(<PlateMath targetWeight={70} unit="kg" load={BARBELL} barWeight={20} inventory={RACK} />)

    const group = screen.getByRole('group', { name: 'How to load' })
    expect(group.querySelectorAll('p')).toHaveLength(2)
  })

  it('keeps a caller’s class name alongside its own', () => {
    render(
      <PlateMath
        targetWeight={70}
        unit="kg"
        load={BARBELL}
        barWeight={20}
        inventory={RACK}
        className="wc-test-class"
      />,
    )

    expect(screen.getByRole('group', { name: 'How to load' })).toHaveClass('wc-test-class')
  })
})
