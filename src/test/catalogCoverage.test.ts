import { describe, expect, it } from 'vitest'
import { EQUIPMENT_IDS, defaultEquipmentFor, type EquipmentId } from '../catalog/equipment/equipment'
import { EXERCISES } from '../catalog/exercises/catalog'
import { MOVEMENT_PATTERN_IDS } from '../catalog/movementPatterns/movementPatterns'
import { MUSCLE_GROUP_IDS, rollUpMuscles, type MuscleGroupId } from '../catalog/muscles/muscles'
import { KNOWN_PROGRESSION_FAMILIES } from '../catalog/taxonomy/taxonomy'
import type { Exercise } from '../catalog/exercises/exerciseSchema'

/**
 * IS THE CATALOG ENOUGH TO ANSWER THE QUESTIONS THE PRODUCT ASKS IT?
 *
 * `catalog.test.ts` (owned by the integration agent) proves the data is WELL
 * FORMED: every entry parses, every id resolves, nothing collides. That is a
 * different question from whether the data is SUFFICIENT — a catalog can be
 * perfectly consistent and still leave a person with a kettlebell, a travel
 * bag, or a shoulder they cannot load with nothing to do. Structural validity
 * is checked there; reachability is checked here, and the two must not be
 * merged, because one fails on a typo and the other fails on a gap.
 *
 * WHY REACHABILITY IS A TEST AND NOT A REVIEW. Every one of these gaps is
 * invisible from inside a single region file, and none of them makes anything
 * look broken. An unused equipment id renders a chip that changes nothing; a
 * muscle group with no entries silently removes itself from the picker's
 * filters; a location with no viable exercises produces an empty screen in
 * Phase 3 rather than an error in Phase 2. They surface as "the app did nothing"
 * long after the data was written, which is exactly the class of defect a
 * whole-catalog test is for.
 *
 * KNOWN GAPS ARE PINNED, NOT WAIVED. Where the shipped data genuinely falls
 * short, the shortfall is written down as an explicit list with the reasoning
 * beside it, so the count cannot grow without a test failing. A pinned gap is a
 * debt somebody can read; a loosened assertion is a debt nobody can find. When
 * an entry is added that closes one, the fix is to delete the pinned id — never
 * to relax the assertion around it.
 */

/** Primary muscle groups, the way every consumer computes them. */
function groupsOf(exercise: Exercise): readonly MuscleGroupId[] {
  return rollUpMuscles(exercise.primaryMuscles)
}

function inGroup(group: MuscleGroupId): Exercise[] {
  return EXERCISES.filter((exercise) => groupsOf(exercise).includes(group))
}

/** True when every piece of kit the exercise REQUIRES is in `kit`. */
function doableWith(exercise: Exercise, kit: ReadonlySet<string>): boolean {
  return exercise.equipment.every((id) => kit.has(id))
}

/* ------------------------------------------------------------------ *
 * Muscle-group reach
 * ------------------------------------------------------------------ */

/**
 * Groups the muscle model declares that the catalog has no PRIMARY work for.
 *
 * `adductors` is the one, and it is a real hole rather than a naming mismatch:
 * eleven entries list `adductors` as a SECONDARY muscle (a sumo deadlift, the
 * wide-stance squats, the lunges), so the muscle is reachable as a side effect
 * and unreachable as a target. Nothing in the catalog is filed under the
 * `hip-adduction` movement pattern either, and `hip-adduction` is one of the
 * progression families `taxonomy.ts` already plans for — so the vocabulary, the
 * pattern list, and the family registry are all ready and only the entries are
 * missing. The same is true of `hip-abduction`: no entry uses that pattern, and
 * no entry lists `glute-medius-minimus` as primary, so the abductor half of the
 * hip is described by the model and absent from the data.
 *
 * IT IS NOT USER-VISIBLE TODAY. `MUSCLE_GROUPS_IN_CATALOG` filters empty groups
 * out of the picker, so nobody is offered a filter that finds nothing. It
 * becomes visible the moment a generator is asked for a balanced lower-body
 * session, or the alternatives ranker is asked to replace an abduction machine
 * a later phase adds — the pool would be empty and the result would be an
 * honest but useless "nothing trains this".
 */
const MUSCLE_GROUPS_WITH_NO_PRIMARY_WORK: readonly MuscleGroupId[] = ['adductors']

/**
 * Movement patterns no entry uses. Same hole, seen from the pattern axis: the
 * frontal-plane hip patterns are declared and unpopulated.
 */
const MOVEMENT_PATTERNS_WITH_NO_EXERCISES = ['hip-abduction', 'hip-adduction']

describe('every muscle group the model declares can be trained', () => {
  it('has at least one exercise per group, apart from the pinned gap', () => {
    const empty = MUSCLE_GROUP_IDS.filter((group) => inGroup(group).length === 0)

    expect(empty, 'a declared muscle group with no exercise cannot be programmed for').toEqual(
      MUSCLE_GROUPS_WITH_NO_PRIMARY_WORK,
    )
  })

  it('gives every populated group more than one option, so a swap is possible', () => {
    // One exercise for a whole muscle group is a catalog that can name the
    // muscle and never offer an alternative for it. The ranker would return
    // `no-candidates-in-catalog` for the only entry there is.
    const thin = MUSCLE_GROUP_IDS.filter((group) => {
      const count = inGroup(group).length
      return count > 0 && count < 2
    })

    expect(thin, 'these groups have exactly one exercise, so nothing can substitute for it').toEqual([])
  })

  it('uses every movement pattern it declares, apart from the pinned pair', () => {
    const used = new Set(EXERCISES.map((exercise) => exercise.movementPattern))
    const unused = MOVEMENT_PATTERN_IDS.filter((pattern) => !used.has(pattern))

    expect([...unused].sort()).toEqual([...MOVEMENT_PATTERNS_WITH_NO_EXERCISES].sort())
  })
})

/* ------------------------------------------------------------------ *
 * Equipment reach
 * ------------------------------------------------------------------ */

/**
 * Equipment a person can tick at a location that unlocks nothing.
 *
 * `bodyweight-only` is BY DESIGN and documented as such in `equipment.ts`: it
 * names the ABSENCE of equipment, so no exercise requires it and
 * `isConstraintOnlyEquipment` exists to say so. It is listed here to be
 * accounted for, not because it is a gap.
 *
 * `trap-bar` IS a gap. It was added to the equipment list this phase for the
 * catalog's benefit and no entry uses it, required or optional, so ticking it
 * in setup changes nothing about what the app will ever offer. The honest fixes
 * are a trap-bar deadlift entry (its own `hinge-barbell`-adjacent family,
 * because the load is not interchangeable with a straight bar) or removing the
 * id — but an id may never be removed once profiles carry it, which is why this
 * is written down rather than left to be noticed.
 */
const EQUIPMENT_USED_BY_NOTHING: readonly EquipmentId[] = ['trap-bar', 'bodyweight-only']

/**
 * Equipment that only ever appears as OPTIONAL, so owning it alone unlocks
 * nothing.
 *
 * This is the sharper form of the same problem, and `adjustable-dumbbells` is
 * the one that will bite a real person. Every dumbbell exercise requires the id
 * `dumbbells`; `adjustable-dumbbells` is listed only as optional. The home seed
 * ticks both, so the default profile hides it — but a person who owns one
 * adjustable pair, unticks "Dumbbells" because they do not own a rack of them,
 * and keeps "Adjustable dumbbells" loses all 30-odd dumbbell exercises at that
 * location, with no message explaining why. There is no equipment aliasing in
 * the model (an exercise names exactly the ids it needs, deliberately, so the
 * equipment conflict stays decidable), so the fix belongs in the equipment
 * model — an "implies" relation, or an authoring rule that dumbbell entries
 * require neither id specifically — not in a rule bolted onto the conflict
 * engine.
 *
 * `kettlebell` is the milder case: optional on a goblet squat and a Russian
 * twist, required by nothing, so a kettlebell-only home setup gets zero
 * exercises out of it.
 */
const EQUIPMENT_NEVER_REQUIRED: readonly EquipmentId[] = [
  'trap-bar',
  'adjustable-dumbbells',
  'kettlebell',
  'bodyweight-only',
]

describe('every equipment id a person can tick leads somewhere', () => {
  it('is used by at least one exercise, apart from the pinned ids', () => {
    const mentioned = new Set<string>()
    for (const exercise of EXERCISES) {
      for (const id of exercise.equipment) mentioned.add(id)
      for (const id of exercise.optionalEquipment) mentioned.add(id)
    }

    const unused = EQUIPMENT_IDS.filter((id) => !mentioned.has(id))

    expect(unused, 'equipment nothing in the catalog mentions').toEqual(EQUIPMENT_USED_BY_NOTHING)
  })

  it('is REQUIRED by at least one exercise, apart from the pinned ids', () => {
    const required = new Set<string>()
    for (const exercise of EXERCISES) for (const id of exercise.equipment) required.add(id)

    const optionalOnly = EQUIPMENT_IDS.filter((id) => !required.has(id))

    expect(
      optionalOnly,
      'equipment that unlocks no exercise on its own — owning only this gives a person nothing',
    ).toEqual(EQUIPMENT_NEVER_REQUIRED)
  })

  it('never requires more equipment than a fully equipped gym has', () => {
    const gym = new Set<string>(defaultEquipmentFor('gym'))
    const impossible = EXERCISES.filter((exercise) => !doableWith(exercise, gym)).map(
      (exercise) => `${exercise.id}: ${exercise.equipment.filter((id) => !gym.has(id)).join(', ')}`,
    )

    expect(impossible, 'an exercise nobody can ever do').toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * Location reach — what a person can actually do where they are
 * ------------------------------------------------------------------ */

/**
 * The muscle groups a person training at HOME, with the equipment setup seeds a
 * home location with, has nothing for.
 *
 * Empty, and that is the load-bearing fact: home is the location most people
 * train at, and every populated group has at least one entry that works there.
 */
describe('a home setup can train everything', () => {
  it('has at least one exercise for every populated muscle group', () => {
    const home = new Set<string>(defaultEquipmentFor('home'))

    const unreachable = MUSCLE_GROUP_IDS.filter((group) => {
      const all = inGroup(group)
      return all.length > 0 && all.every((exercise) => !doableWith(exercise, home))
    })

    expect(unreachable, 'muscle groups a home trainee cannot work at all').toEqual([])
  })

  it('offers a bodyweight-only option for the major groups', () => {
    // The floor beneath every other guarantee: no kit at all, anywhere, and
    // still something for the chest, the legs, the glutes and the core. These
    // four are what a person with nothing can train, and every one of them has
    // an entry whose `equipment` list is empty.
    const bare = new Set<string>()

    for (const group of ['chest', 'quads', 'glutes', 'core'] as const) {
      const options = inGroup(group).filter((exercise) => doableWith(exercise, bare))
      expect(options.length, `no equipment-free exercise for ${group}`).toBeGreaterThan(0)
    }
  })
})

/**
 * TRAVEL IS THE THIN ONE, and this is the shape of the hole.
 *
 * `defaultEquipmentFor('travel')` seeds resistance bands and nothing else. With
 * that kit the catalog can train the chest, the back, the legs, the glutes and
 * the core — and NOTHING for the shoulders, biceps, triceps or forearms. The
 * band entries that exist are `band-chest-press`, `band-chest-fly`,
 * `band-seated-row` and `band-assisted-pull-up`; there is no band overhead
 * press, no band curl, and no band pushdown, and no bodyweight entry covers
 * those groups either.
 *
 * IT MATTERS BECAUSE TRAVEL IS A LOCATION KIND THE PRODUCT OFFERS. A person who
 * sets one up and asks for an upper-body session in Phase 3 gets a session with
 * no shoulder or arm work in it and no explanation, because from the generator's
 * point of view nothing was excluded — there was never anything to exclude.
 *
 * The assertion below therefore states what travel CAN do rather than pretending
 * the gap is not there, and pins the four groups it cannot, so that adding a
 * band press closes a named hole rather than silently improving a number.
 */
const GROUPS_WITH_NO_TRAVEL_OPTION: readonly MuscleGroupId[] = ['shoulders', 'biceps', 'triceps', 'forearms']

describe('a travel setup', () => {
  it('trains what it can, and the groups it cannot are the pinned four', () => {
    const travel = new Set<string>(defaultEquipmentFor('travel'))

    const unreachable = MUSCLE_GROUP_IDS.filter((group) => {
      const all = inGroup(group)
      return all.length > 0 && all.every((exercise) => !doableWith(exercise, travel))
    })

    expect(unreachable, 'muscle groups a travelling trainee has nothing for').toEqual(
      GROUPS_WITH_NO_TRAVEL_OPTION,
    )
  })

  /**
   * Entries the CATALOG calls travel-suitable that the app's own travel SEED
   * cannot equip. The disagreement is real and the catalog is the side that is
   * right: a suspension trainer is the archetypal thing people travel with, and
   * a bench dip wants a hotel-room chair rather than a gym bench. What is narrow
   * is `defaultEquipmentFor('travel')`, which seeds only resistance bands and
   * `bodyweight-only`.
   *
   * The consequence is small but real and it compounds the thin-travel gap
   * above: a person who accepts the seeded travel location as offered is refused
   * two of the four upper-body pulling and pressing options the catalog
   * deliberately marked for them, and the exclusion reads `equipment-unavailable`
   * — technically true, and not the reason a person would recognise. Adding
   * `suspension-trainer` to the travel seed is a one-line change in
   * `equipment.ts` and would close two of the three.
   */
  const TRAVEL_MARKED_BEYOND_THE_SEED = [
    'bench-dip: needs flat-bench',
    'suspension-trainer-chest-press: needs suspension-trainer',
    'suspension-trainer-row: needs suspension-trainer',
  ]

  it('agrees with the travel seed about what travels, apart from the pinned three', () => {
    // A candidate has to clear BOTH gates — the kit and the location — so an
    // entry marked travel-suitable that the travel seed cannot equip is a
    // promise the app then refuses to keep.
    const travel = new Set<string>(defaultEquipmentFor('travel'))
    const contradictory = EXERCISES.filter(
      (exercise) => exercise.locationSuitability.includes('travel') && !doableWith(exercise, travel),
    )
      .map((exercise) => `${exercise.id}: needs ${exercise.equipment.join(', ')}`)
      .sort()

    expect(contradictory, 'marked travel-suitable but needs kit the travel seed does not have').toEqual(
      TRAVEL_MARKED_BEYOND_THE_SEED,
    )
  })

  it('never marks something travel-suitable that needs a fixed gym machine', () => {
    // The direction that would be indefensible rather than merely narrow.
    const fixed: readonly EquipmentId[] = [
      'cable-machine',
      'lat-pulldown',
      'leg-press',
      'selectorised-machines',
      'smith-machine',
      'squat-rack',
      'landmine',
      'barbell',
    ]

    const impossible = EXERCISES.filter(
      (exercise) =>
        exercise.locationSuitability.includes('travel') &&
        exercise.equipment.some((id) => fixed.includes(id)),
    ).map((exercise) => exercise.id)

    expect(impossible).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * Limitations — is there still a session after one is declared?
 * ------------------------------------------------------------------ */

describe('a declared limitation still leaves a workable catalog', () => {
  it('leaves plenty of quad work when barbell squats are ruled out', () => {
    // `avoidBarbellSquat` is a whole profile toggle, so the catalog has to have
    // an answer for it rather than a single fallback. Ten-plus options means the
    // ranker has a pool to work with rather than one forced substitution.
    const quads = inGroup('quads')
    const withoutBarbellSquat = quads.filter(
      (exercise) => !exercise.contraindicatedFor.includes('barbell-squat'),
    )

    expect(withoutBarbellSquat.length).toBeGreaterThanOrEqual(10)
    // And the ones that ARE ruled out are the barbell squats themselves, not a
    // scattering of unrelated entries that happened to get the flag.
    expect(
      quads.filter((exercise) => exercise.contraindicatedFor.includes('barbell-squat')).map((e) => e.id),
    ).toEqual(['barbell-back-squat', 'barbell-front-squat'])
  })

  for (const flag of ['shoulder', 'knee', 'lower-back'] as const) {
    it(`leaves work for every populated muscle group with a ${flag} limitation`, () => {
      const stranded = MUSCLE_GROUP_IDS.filter((group) => {
        const all = inGroup(group)
        return all.length > 0 && all.every((exercise) => exercise.contraindicatedFor.includes(flag))
      })

      expect(stranded, `a ${flag} limitation removes these groups entirely`).toEqual([])
    })
  }

  it('names a limitation in prose whenever it contraindicates for it', () => {
    // The engine reads `contraindicatedFor`; a person reads the considerations.
    // An exercise that is blocked with no explanation reads as the app being
    // arbitrary, which is the one thing a safety refusal must not read as.
    const notes: Record<string, keyof Exercise> = {
      shoulder: 'shoulderConsiderations',
      knee: 'kneeConsiderations',
      'lower-back': 'lowerBackConsiderations',
    }

    const silent = EXERCISES.flatMap((exercise) =>
      exercise.contraindicatedFor
        .filter((flag) => flag in notes && String(exercise[notes[flag]] ?? '').trim() === '')
        .map((flag) => `${exercise.id}: contraindicated for ${flag} with nothing said about it`),
    )

    expect(silent).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * Progression families — can history actually travel?
 * ------------------------------------------------------------------ */

describe('progression families', () => {
  it('never leaves a loaded exercise in a family of one with no substitution route', () => {
    // A family with a single member is fine in itself — it just means history
    // does not travel. It is only a problem when that entry ALSO has no
    // hand-picked substitutions, because then a person who cannot do it today
    // has neither an inheriting swap nor a curated one.
    const byFamily = new Map<string, Exercise[]>()
    for (const exercise of EXERCISES) {
      const list = byFamily.get(exercise.progressionFamily)
      if (list) list.push(exercise)
      else byFamily.set(exercise.progressionFamily, [exercise])
    }

    const stranded = [...byFamily.entries()]
      .filter(([, members]) => members.length === 1)
      .filter(([, [only]]) => only.commonSubstitutions.length === 0)
      .map(([family, [only]]) => `${only.id} (family ${family})`)

    expect(stranded, 'alone in its family and with no hand-picked swap').toEqual([])
  })

  /**
   * ═══ THE SHARPEST DEFECT IN THE PHASE 2 DATA ═══
   *
   * Seven progression families hold BOTH a `per-hand` and a `total` movement.
   * `progressionCarriesAcross` is family identity, so every one of these pairs
   * is declared to carry a working weight across a swap — and `load.measure` is
   * what says the number MEANS. `taxonomy.ts` states the stakes itself:
   * "Getting this wrong doubles or halves a user's history."
   *
   * Two are unambiguous:
   *
   *   `shrug`  — `barbell-shrug` is 100 kg TOTAL; `dumbbell-shrug` is per-hand.
   *              Swapping one for the other inherits 100 kg PER HAND, which is
   *              a 200 kg prescription off a 100 kg lift.
   *   `triceps-extension-dumbbell` — both members are dumbbell work, and they
   *              still disagree: the overhead extension is one dumbbell in two
   *              hands (`total`), the kickback is per-hand. Same implement, same
   *              family, double the weight.
   *
   * Five more mix a per-hand dumbbell movement with a cable or machine one
   * measured on the stack: `chest-fly`, `lateral-raise`, `front-raise`,
   * `rear-delt`, `calf-raise-standing`. These halve rather than double — a 12 kg
   * per-hand lateral raise becomes a 12 kg stack setting — which is the safer
   * direction and still wrong.
   *
   * WHERE THE FAULT ACTUALLY IS. Not in the entries: the region authors filed
   * each one under the family `KNOWN_PROGRESSION_FAMILIES` offers, and every
   * `load` block is individually correct. The registry is what is wrong. It
   * carries the implement in the id exactly where the taxonomy's own comment
   * says it must — `horizontal-press-barbell`, `-dumbbell`, `-machine` — and
   * drops it precisely for the isolation families, where `lateral-raise`,
   * `front-raise`, `rear-delt`, `chest-fly` and `shrug` have no implement
   * suffix at all and therefore collect every implement into one family. The
   * fix is in `taxonomy.ts`: split these the way the press families are already
   * split, then repoint the entries.
   *
   * IT IS USER-VISIBLE IN PHASE 5, not in some later abstraction: the
   * alternatives ranker reports `progression.preservesHistory` and renders
   * "keeps your progression" text from it, so the app will actively tell someone
   * their weight carries over onto a lift where it does not.
   *
   * PINNED, NOT WAIVED. An eighth family joining this list fails the test.
   */
  const FAMILIES_MIXING_PER_HAND_AND_TOTAL = [
    'calf-raise-standing',
    'chest-fly',
    'front-raise',
    'lateral-raise',
    'rear-delt',
    'triceps-extension-dumbbell',
  ]

  /**
   * Families that pair an unloaded movement with a loaded one. Softer, and
   * mostly defensible: `vertical-pull-bodyweight` holds weighted pull-ups
   * (`bodyweight-loadable`, `total`) beside a band-assisted one, and
   * `leg-curl` holds three machines beside a Nordic curl. Nothing doubles here —
   * there is no number on the unloaded side to inherit — but `preservesHistory`
   * still reports `true` for a swap that cannot preserve anything, so Phase 5
   * would claim continuity across a machine-to-floor swap.
   */
  const FAMILIES_MIXING_LOADED_AND_UNLOADED = [
    'calf-raise-standing',
    'horizontal-press-bodyweight',
    'leg-curl',
    'leg-extension',
    'trunk-flexion',
    'vertical-pull-bodyweight',
  ]

  function familiesMixing(a: string, b: string): string[] {
    const byFamily = new Map<string, Set<string>>()
    for (const exercise of EXERCISES) {
      const measures = byFamily.get(exercise.progressionFamily) ?? new Set<string>()
      measures.add(exercise.load.measure)
      byFamily.set(exercise.progressionFamily, measures)
    }

    return [...byFamily.entries()]
      .filter(([, measures]) => measures.has(a) && measures.has(b))
      .map(([family]) => family)
      .sort()
  }

  it('never mixes per-hand and total load inside one family, apart from the pinned six', () => {
    expect(
      familiesMixing('per-hand', 'total'),
      'these families would inherit a doubled or halved working weight across a swap',
    ).toEqual(FAMILIES_MIXING_PER_HAND_AND_TOTAL)
  })

  it('never mixes loaded and unloaded members, apart from the pinned six', () => {
    const mixed = [
      ...new Set([...familiesMixing('none', 'total'), ...familiesMixing('none', 'per-hand')]),
    ].sort()

    expect(mixed, 'these families claim continuity across a swap that carries no load').toEqual(
      FAMILIES_MIXING_LOADED_AND_UNLOADED,
    )
  })

  it('keeps `usesBar` consistent within a family', () => {
    // The one that Plate Math reads directly. A family holding a bar movement
    // and a non-bar one would carry a load that silently includes — or omits —
    // the bar's own 20 kg.
    const byFamily = new Map<string, Set<boolean>>()
    for (const exercise of EXERCISES) {
      const bars = byFamily.get(exercise.progressionFamily) ?? new Set<boolean>()
      bars.add(exercise.load.usesBar)
      byFamily.set(exercise.progressionFamily, bars)
    }

    const mixed = [...byFamily.entries()]
      .filter(([, bars]) => bars.size > 1)
      .map(([family]) => family)
      .sort()

    expect(mixed, 'a family where the bar weight is sometimes included and sometimes not').toEqual([])
  })

  it('lists no registry family that is entirely empty, apart from the pinned three', () => {
    // The registry is advisory and may legitimately run ahead of the data, but a
    // family nothing uses is a promise about inheritance nobody can rely on.
    //
    // The two hip families mirror the missing abduction/adduction exercises
    // above: the same gap, seen from the progression axis. `lunge-barbell` is a
    // third: the catalog ships dumbbell and bodyweight lunges and no barbell
    // one, so a barbell lunge added later has a family waiting for it.
    const used = new Set(EXERCISES.map((exercise) => exercise.progressionFamily))
    const empty = KNOWN_PROGRESSION_FAMILIES.filter((family) => !used.has(family))

    expect([...empty].sort()).toEqual(['hip-abduction', 'hip-adduction', 'lunge-barbell'])
  })
})

/* ------------------------------------------------------------------ *
 * Prose — the fields a person reads
 * ------------------------------------------------------------------ */

/**
 * Words that mean an entry was drafted and never finished. Matched
 * case-insensitively on a word boundary so a legitimate use inside a longer word
 * ("stubborn") does not trip it.
 */
const PLACEHOLDER_WORDS = [
  'todo',
  'tbd',
  'tba',
  'lorem',
  'ipsum',
  'placeholder',
  'fixme',
  'xxx',
  'coming soon',
  'description here',
  'fill in',
  'write me',
  'sample text',
]

const PLACEHOLDER_PATTERN = new RegExp(`\\b(${PLACEHOLDER_WORDS.join('|')})\\b`, 'i')

/** Every human-readable string on one entry, with a label for the failure message. */
function proseOf(exercise: Exercise): { where: string; text: string }[] {
  return [
    { where: 'name', text: exercise.name },
    ...exercise.aliases.map((text, index) => ({ where: `aliases[${index}]`, text })),
    ...exercise.instructionSteps.map((text, index) => ({ where: `instructionSteps[${index}]`, text })),
    ...exercise.commonMistakes.map((text, index) => ({ where: `commonMistakes[${index}]`, text })),
    { where: 'shoulderConsiderations', text: exercise.shoulderConsiderations },
    { where: 'kneeConsiderations', text: exercise.kneeConsiderations },
    { where: 'lowerBackConsiderations', text: exercise.lowerBackConsiderations },
  ]
}

describe('the prose a person reads is finished', () => {
  it('gives every exercise at least two instruction steps', () => {
    // The schema already demands two; this says it over the whole catalog so a
    // gap is reported by name rather than as a parse failure buried in a list.
    const thin = EXERCISES.filter((exercise) => exercise.instructionSteps.length < 2).map((e) => e.id)

    expect(thin).toEqual([])
  })

  it('gives every exercise at least one common mistake', () => {
    // `commonMistakes` is optional in the schema — correctly, because a future
    // entry may genuinely have none — but a shipped catalog where an entry has
    // none is an entry somebody stopped writing halfway.
    const missing = EXERCISES.filter((exercise) => exercise.commonMistakes.length === 0).map((e) => e.id)

    expect(missing).toEqual([])
  })

  it('has no placeholder text anywhere', () => {
    const found = EXERCISES.flatMap((exercise) =>
      proseOf(exercise)
        .filter((entry) => PLACEHOLDER_PATTERN.test(entry.text))
        .map((entry) => `${exercise.id}.${entry.where}: "${entry.text}"`),
    )

    expect(found).toEqual([])
  })

  it('has no blank or whitespace-only prose in a field that is present', () => {
    const blank = EXERCISES.flatMap((exercise) =>
      proseOf(exercise)
        // An empty considerations string is the documented "nothing to add";
        // a string of spaces is not, and neither is an empty instruction step.
        .filter((entry) => entry.text !== '' && entry.text.trim() === '')
        .map((entry) => `${exercise.id}.${entry.where}`),
    )

    expect(blank).toEqual([])
  })

  it('writes instruction steps as sentences, not as fragments of a list', () => {
    // A step that is three words long is a heading somebody meant to expand.
    const stunted = EXERCISES.flatMap((exercise) =>
      exercise.instructionSteps
        .filter((step) => step.trim().length < 15)
        .map((step) => `${exercise.id}: "${step}"`),
    )

    expect(stunted).toEqual([])
  })

  it('never repeats an instruction step within one exercise', () => {
    const repeated = EXERCISES.filter((exercise) => {
      const seen = new Set(exercise.instructionSteps.map((step) => step.trim().toLowerCase()))
      return seen.size !== exercise.instructionSteps.length
    }).map((exercise) => exercise.id)

    expect(repeated).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * Metadata later phases depend on
 * ------------------------------------------------------------------ */

describe('the metadata later phases were promised', () => {
  it('gives Plate Math a coherent load model on every entry', () => {
    // Restating the schema's refinements over the whole catalog, so a violation
    // is reported as a named entry rather than a parse error.
    const wrong = EXERCISES.flatMap((exercise) => {
      const { basis, measure, usesBar, plateMath } = exercise.load
      const issues: string[] = []
      if (usesBar && !plateMath) issues.push('on a bar but plateMath is false')
      const unloaded = basis === 'bodyweight' || basis === 'unloaded'
      if ((measure === 'none') !== unloaded) issues.push(`measure ${measure} with basis ${basis}`)
      return issues.map((issue) => `${exercise.id}: ${issue}`)
    })

    expect(wrong).toEqual([])
  })

  it('counts a hold in seconds rather than in reps', () => {
    // A `repUnit: 'seconds'` entry is the whole reason the field exists. If none
    // shipped, the set logger would be free to assume reps and nobody would find
    // out until a plank was logged as "3".
    const timed = EXERCISES.filter((exercise) => exercise.repUnit === 'seconds')

    expect(timed.map((exercise) => exercise.id)).toEqual(['farmers-carry', 'plank', 'side-plank'])
    for (const exercise of timed) {
      // Seconds, not reps: a 30-second hold is a plausible range, three is not.
      expect(exercise.typicalRepRange.max, exercise.id).toBeGreaterThanOrEqual(15)
    }
  })

  it('leaves every timed exercise out of plate math', () => {
    for (const exercise of EXERCISES) {
      if (exercise.repUnit !== 'seconds') continue
      // A carry is loaded and timed; a plank is neither. What must not happen is
      // a timed exercise whose load measure claims a per-rep weight progression.
      expect(exercise.load.usesBar, `${exercise.id} is timed and on a bar`).toBe(false)
    }
  })

  /**
   * `hip-flexors` is the one group with no warm-up route and no drop-set-safe
   * entry, and on inspection that is CORRECT data rather than a gap. All three
   * of its entries — `hanging-knee-raise`, `hanging-leg-raise`,
   * `lying-leg-raise` — are `isolation` accessory work: nothing ramps into a
   * hanging leg raise, and there is no load to drop off one. It is pinned so
   * that a group acquiring the same shape for the wrong reason still fails.
   */
  const GROUPS_WITH_NO_WARM_UP_ROUTE: readonly MuscleGroupId[] = ['hip-flexors']
  const GROUPS_WITH_NO_DROP_SET: readonly MuscleGroupId[] = ['hip-flexors']

  it('gives the warm-up ramp something to work with in every muscle group', () => {
    const nothingToRampWith = MUSCLE_GROUP_IDS.filter((group) => {
      const all = inGroup(group)
      return all.length > 0 && all.every((exercise) => exercise.warmUpSuitability === 'unsuitable')
    })

    expect(nothingToRampWith, 'no warm-up route into these groups').toEqual(GROUPS_WITH_NO_WARM_UP_ROUTE)
  })

  it('offers a specific ramp inside every family that carries a bar', () => {
    // A specific ramp is the same movement at a lighter load, so it has to come
    // from inside the family. A barbell lift with no ramp-able family member is
    // one a person would be asked to walk up to cold.
    const barFamilies = new Set(
      EXERCISES.filter((exercise) => exercise.load.usesBar).map((exercise) => exercise.progressionFamily),
    )

    const unrampable = [...barFamilies]
      .filter((family) =>
        EXERCISES.filter((exercise) => exercise.progressionFamily === family).every(
          (exercise) => exercise.warmUpSuitability !== 'specific-ramp',
        ),
      )
      .sort()

    expect(unrampable, 'a barbell family with nothing in it that can serve as a ramp').toEqual([])
  })

  it('declares a grip-heavy pairing wherever grip demand is high', () => {
    // The superset rule reads `gripHeavy`; a person reads nothing. An exercise
    // whose grip demand is `high` and which does not declare itself grip-heavy
    // would be paired straight into a second grip-limited movement.
    //
    // The converse is deliberately NOT asserted: four entries declare
    // `gripHeavy` at a `moderate` demand (`dumbbell-row`,
    // `chest-supported-dumbbell-row`, `seated-cable-row`, `dumbbell-calf-raise`),
    // which is coherent — `gripDemand` is absolute, `gripHeavy` is relative to
    // the target muscle, and on a row the grip does give out first.
    const undeclared = EXERCISES.filter(
      (exercise) => exercise.gripDemand === 'high' && !exercise.supersetCompatibility.gripHeavy,
    ).map((exercise) => exercise.id)

    expect(undeclared).toEqual([])
  })

  it('never claims a station an exercise has no equipment for', () => {
    // `stationId: null` is a real answer (floor, mat, standing). What must not
    // happen is an exercise claiming the squat rack or the cable tower without
    // requiring the kit that station is made of — the engine would then reserve
    // a station the person may not have.
    const needs: Partial<Record<string, EquipmentId>> = {
      'squat-rack': 'squat-rack',
      'smith-machine': 'smith-machine',
      'cable-tower': 'cable-machine',
      'lat-pulldown-station': 'lat-pulldown',
      'leg-press-station': 'leg-press',
      'selectorised-machine': 'selectorised-machines',
      'pull-up-bar': 'pull-up-bar',
      'preacher-station': 'preacher-bench',
      'back-extension-station': 'back-extension-bench',
    }

    const unfounded = EXERCISES.flatMap((exercise) => {
      const station = exercise.supersetCompatibility.stationId
      if (station === null) return []
      const required = needs[station]
      if (!required) return []
      // Optional equipment counts: a standing overhead press can be cleaned from
      // the floor, but it still occupies the rack when one is used, and a missed
      // station contention sends someone across the gym mid-superset.
      const canUse = exercise.equipment.includes(required) || exercise.optionalEquipment.includes(required)
      if (canUse) return []
      return [`${exercise.id}: claims ${station} without requiring or optionally using ${required}`]
    })

    expect(unfounded).toEqual([])
  })

  it('lets a drop set happen somewhere in every populated muscle group', () => {
    const noDropSet = MUSCLE_GROUP_IDS.filter((group) => {
      const all = inGroup(group)
      return all.length > 0 && all.every((exercise) => !exercise.safeForDropSet)
    })

    expect(noDropSet, 'a group where the drop-set technique can never be used').toEqual(
      GROUPS_WITH_NO_DROP_SET,
    )
  })

  it('never calls a barbell lift safe for a drop set', () => {
    // Stripping plates mid-set alone is the thing `safeForDropSet` exists to
    // refuse. A bar movement marked safe would put somebody under a loaded bar
    // wrestling collars between reps.
    const unsafe = EXERCISES.filter((exercise) => exercise.load.usesBar && exercise.safeForDropSet).map(
      (exercise) => exercise.id,
    )

    expect(unsafe).toEqual([])
  })
})
