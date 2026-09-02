import { BODY_REGIONS, MUSCLE_GROUP_IDS, MUSCLE_IDS, type BodyRegion } from '../muscles/muscles'
import type { MuscleGroupId, MuscleId } from '../muscles/muscles'
import {
  MOVEMENT_CHAINS,
  MOVEMENT_PATTERN_IDS,
  MOVEMENT_PLANES,
  type MovementChain,
  type MovementPatternId,
  type MovementPlane,
} from '../movementPatterns/movementPatterns'
import { JOINT_IDS, STRESS_INTENSITIES, type JointId, type StressIntensity } from '../taxonomy/joints'
import {
  DIFFICULTY_SCALE,
  GRIP_DEMAND_SCALE,
  STABILITY_DEMAND_SCALE,
  SUITABILITY_SCALE,
  TRANSITION_COST_SCALE,
  WARM_UP_SUITABILITY_SCALE,
  type Difficulty,
  type GripDemand,
  type StabilityDemand,
  type Suitability,
  type TransitionCost,
  type WarmUpSuitability,
} from '../taxonomy/scales'
import {
  COMPETING_DEMANDS,
  LIMITATION_FLAGS,
  LOAD_BASES,
  LOAD_MEASURES,
  LOCATION_SUITABILITIES,
  REP_UNITS,
  STATION_IDS,
  TRAINING_ROLES,
  type CompetingDemand,
  type LimitationFlag,
  type LoadBasis,
  type LoadMeasure,
  type LocationSuitability,
  type RepUnit,
  type StationId,
  type TrainingRole,
} from '../taxonomy/taxonomy'
import { MEDIA_KINDS, type MediaKind } from '../media/mediaSchema'
import type { LabelEntry } from './labels'

/**
 * Display copy for the Phase 2 catalog vocabularies.
 *
 * Same owner, same rule as `labels.ts`: this folder is the ONLY place a stored
 * value is turned into a string a person reads. A feature module that needs a
 * muscle name, a pattern name, or the word for a difficulty rung imports it from
 * here and never writes its own map — that is the defect this catalogue exists to
 * prevent, and `catalogLabels.test.ts` asserts every value of every enum is
 * covered exactly once.
 *
 * It is a second FILE rather than more of `labels.ts` for one reason: `labels.ts`
 * is reached from screens that load at boot, and these arrays are only wanted by
 * screens that show exercises. Separate modules let the bundler keep them out of
 * the first paint.
 *
 * `plane` and `chain` are here too, even though nothing renders them today. The
 * rule is "every stored vocabulary has copy"; an enum with no copy is the one that
 * eventually reaches a screen as a raw id.
 */

export const MUSCLE_GROUP_LABELS: readonly LabelEntry<MuscleGroupId>[] = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'biceps', label: 'Biceps' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'forearms', label: 'Forearms' },
  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glutes', label: 'Glutes' },
  { value: 'adductors', label: 'Inner thigh', shortLabel: 'Inner' },
  { value: 'hip-flexors', label: 'Hip flexors', shortLabel: 'Hips' },
  { value: 'calves', label: 'Calves' },
  { value: 'core', label: 'Core' },
]

export const MUSCLE_LABELS: readonly LabelEntry<MuscleId>[] = [
  { value: 'upper-chest', label: 'Upper chest' },
  { value: 'mid-chest', label: 'Mid chest' },
  { value: 'lower-chest', label: 'Lower chest' },

  { value: 'lats', label: 'Lats' },
  { value: 'upper-back', label: 'Upper back' },
  { value: 'lower-back', label: 'Lower back' },
  { value: 'upper-traps', label: 'Traps' },

  { value: 'front-delt', label: 'Front delt' },
  { value: 'side-delt', label: 'Side delt' },
  { value: 'rear-delt', label: 'Rear delt' },

  { value: 'biceps-long-head', label: 'Biceps long head', shortLabel: 'Biceps, long' },
  { value: 'biceps-short-head', label: 'Biceps short head', shortLabel: 'Biceps, short' },
  { value: 'brachialis', label: 'Brachialis' },

  { value: 'triceps-long-head', label: 'Triceps long head', shortLabel: 'Triceps, long' },
  { value: 'triceps-lateral-head', label: 'Triceps lateral head', shortLabel: 'Triceps, lateral' },
  { value: 'triceps-medial-head', label: 'Triceps medial head', shortLabel: 'Triceps, medial' },

  { value: 'brachioradialis', label: 'Brachioradialis' },
  { value: 'forearm-flexors', label: 'Forearm flexors' },
  { value: 'forearm-extensors', label: 'Forearm extensors' },

  { value: 'quads', label: 'Quads' },
  { value: 'hamstrings', label: 'Hamstrings' },
  { value: 'glute-max', label: 'Glute max' },
  { value: 'glute-medius-minimus', label: 'Side glutes', shortLabel: 'Glute med' },
  { value: 'adductors', label: 'Adductors' },
  { value: 'hip-flexors', label: 'Hip flexors' },
  { value: 'gastrocnemius', label: 'Calf, upper' },
  { value: 'soleus', label: 'Calf, lower' },

  { value: 'rectus-abdominis', label: 'Abs' },
  { value: 'obliques', label: 'Obliques' },
  { value: 'deep-core', label: 'Deep core' },
]

export const BODY_REGION_LABELS: readonly LabelEntry<BodyRegion>[] = [
  { value: 'upper', label: 'Upper body', shortLabel: 'Upper' },
  { value: 'lower', label: 'Lower body', shortLabel: 'Lower' },
  { value: 'core', label: 'Core' },
]

export const MOVEMENT_PATTERN_LABELS: readonly LabelEntry<MovementPatternId>[] = [
  { value: 'horizontal-push', label: 'Horizontal push', shortLabel: 'Press' },
  { value: 'horizontal-pull', label: 'Horizontal pull', shortLabel: 'Row' },
  { value: 'vertical-push', label: 'Overhead push', shortLabel: 'Overhead' },
  { value: 'vertical-pull', label: 'Vertical pull', shortLabel: 'Pull-up' },
  { value: 'squat', label: 'Squat' },
  { value: 'hinge', label: 'Hinge' },
  { value: 'lunge', label: 'Lunge' },
  { value: 'hip-extension', label: 'Hip extension', shortLabel: 'Thrust' },
  { value: 'carry', label: 'Carry' },
  { value: 'calf-raise', label: 'Calf raise' },
  { value: 'knee-flexion', label: 'Leg curl' },
  { value: 'knee-extension', label: 'Leg extension' },
  { value: 'hip-abduction', label: 'Hip abduction', shortLabel: 'Abduction' },
  { value: 'hip-adduction', label: 'Hip adduction', shortLabel: 'Adduction' },
  { value: 'isolation-curl', label: 'Arm curl', shortLabel: 'Curl' },
  { value: 'isolation-extension', label: 'Triceps extension', shortLabel: 'Extension' },
  { value: 'isolation-raise', label: 'Shoulder raise', shortLabel: 'Raise' },
  { value: 'isolation-fly', label: 'Fly' },
  { value: 'shrug', label: 'Shrug' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'anti-extension', label: 'Anti-extension', shortLabel: 'Plank' },
  { value: 'anti-rotation', label: 'Anti-rotation' },
  { value: 'anti-lateral-flexion', label: 'Anti-side-bend', shortLabel: 'Side bend' },
]

export const MOVEMENT_PLANE_LABELS: readonly LabelEntry<MovementPlane>[] = [
  { value: 'sagittal', label: 'Front to back', shortLabel: 'Sagittal' },
  { value: 'frontal', label: 'Side to side', shortLabel: 'Frontal' },
  { value: 'transverse', label: 'Across the body', shortLabel: 'Across' },
  { value: 'mixed', label: 'Mixed planes', shortLabel: 'Mixed' },
]

export const MOVEMENT_CHAIN_LABELS: readonly LabelEntry<MovementChain>[] = [
  { value: 'upper-push', label: 'Upper push', shortLabel: 'Push' },
  { value: 'upper-pull', label: 'Upper pull', shortLabel: 'Pull' },
  { value: 'lower', label: 'Lower body', shortLabel: 'Legs' },
  { value: 'trunk', label: 'Trunk' },
  { value: 'loaded-carry', label: 'Loaded carry', shortLabel: 'Carry' },
]

export const TRAINING_ROLE_LABELS: readonly LabelEntry<TrainingRole>[] = [
  { value: 'primary-strength', label: 'Main strength lift', shortLabel: 'Main lift' },
  { value: 'secondary-strength', label: 'Second strength lift', shortLabel: 'Second lift' },
  { value: 'primary-hypertrophy', label: 'Main size work', shortLabel: 'Main size' },
  { value: 'secondary-hypertrophy', label: 'More size work', shortLabel: 'More size' },
  { value: 'isolation', label: 'Isolation' },
  { value: 'specialisation', label: 'Specialisation', shortLabel: 'Focus' },
  { value: 'corrective', label: 'Corrective' },
  { value: 'warm-up', label: 'Warm-up' },
  { value: 'finisher', label: 'Finisher' },
]

export const JOINT_LABELS: readonly LabelEntry<JointId>[] = [
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'knee', label: 'Knee' },
  { value: 'hip', label: 'Hip' },
  { value: 'ankle', label: 'Ankle' },
  { value: 'lower-back', label: 'Lower back' },
  { value: 'neck', label: 'Neck' },
]

export const STRESS_INTENSITY_LABELS: readonly LabelEntry<StressIntensity>[] = [
  { value: 'low', label: 'Light load' },
  { value: 'moderate', label: 'Moderate load' },
  { value: 'high', label: 'Heavy load' },
]

export const SUITABILITY_LABELS: readonly LabelEntry<Suitability>[] = [
  { value: 'unsuitable', label: 'Not suited' },
  { value: 'limited', label: 'Limited' },
  { value: 'moderate', label: 'Reasonable' },
  { value: 'good', label: 'Good' },
  { value: 'excellent', label: 'Excellent' },
]

export const GRIP_DEMAND_LABELS: readonly LabelEntry<GripDemand>[] = [
  { value: 'none', label: 'No grip demand', shortLabel: 'None' },
  { value: 'low', label: 'Light on the grip', shortLabel: 'Light' },
  { value: 'moderate', label: 'Some grip demand', shortLabel: 'Some' },
  { value: 'high', label: 'Grip-limited', shortLabel: 'Heavy' },
]

export const STABILITY_DEMAND_LABELS: readonly LabelEntry<StabilityDemand>[] = [
  { value: 'low', label: 'Stable' },
  { value: 'moderate', label: 'Some balance needed', shortLabel: 'Some balance' },
  { value: 'high', label: 'Needs balance' },
  { value: 'very-high', label: 'Very unstable', shortLabel: 'Unstable' },
]

export const DIFFICULTY_LABELS: readonly LabelEntry<Difficulty>[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export const TRANSITION_COST_LABELS: readonly LabelEntry<TransitionCost>[] = [
  { value: 'low', label: 'Quick to set up', shortLabel: 'Quick' },
  { value: 'moderate', label: 'Some setup', shortLabel: 'Some' },
  { value: 'high', label: 'Slow to set up', shortLabel: 'Slow' },
]

export const WARM_UP_SUITABILITY_LABELS: readonly LabelEntry<WarmUpSuitability>[] = [
  { value: 'unsuitable', label: 'Not a warm-up', shortLabel: 'No' },
  { value: 'specific-ramp', label: 'Ramp up on it', shortLabel: 'Ramp' },
  { value: 'general', label: 'Good general warm-up', shortLabel: 'General' },
]

export const LOCATION_SUITABILITY_LABELS: readonly LabelEntry<LocationSuitability>[] = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
  { value: 'travel', label: 'Travel' },
]

export const STATION_LABELS: readonly LabelEntry<StationId>[] = [
  { value: 'squat-rack', label: 'Squat rack' },
  { value: 'bench-station', label: 'Bench station', shortLabel: 'Bench' },
  { value: 'smith-machine', label: 'Smith machine', shortLabel: 'Smith' },
  { value: 'cable-tower', label: 'Cable tower', shortLabel: 'Cables' },
  { value: 'lat-pulldown-station', label: 'Lat pulldown', shortLabel: 'Pulldown' },
  { value: 'seated-row-station', label: 'Seated row', shortLabel: 'Row' },
  { value: 'leg-press-station', label: 'Leg press' },
  { value: 'selectorised-machine', label: 'Machine' },
  { value: 'pull-up-bar', label: 'Pull-up bar' },
  { value: 'dip-station', label: 'Dip station', shortLabel: 'Dips' },
  { value: 'preacher-station', label: 'Preacher bench', shortLabel: 'Preacher' },
  { value: 'back-extension-station', label: 'Back extension', shortLabel: 'Extension' },
  { value: 'dumbbell-rack', label: 'Dumbbell rack', shortLabel: 'Dumbbells' },
  { value: 'platform', label: 'Lifting platform', shortLabel: 'Platform' },
]

export const COMPETING_DEMAND_LABELS: readonly LabelEntry<CompetingDemand>[] = [
  { value: 'grip', label: 'Grip' },
  { value: 'core-bracing', label: 'Core bracing', shortLabel: 'Bracing' },
  { value: 'lower-back', label: 'Lower back' },
  { value: 'balance', label: 'Balance' },
  { value: 'systemic', label: 'Whole-body fatigue', shortLabel: 'Fatigue' },
]

export const LOAD_BASIS_LABELS: readonly LabelEntry<LoadBasis>[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'machine-stack', label: 'Machine stack', shortLabel: 'Stack' },
  { value: 'plate-loaded-machine', label: 'Plate-loaded machine', shortLabel: 'Plate machine' },
  { value: 'cable-stack', label: 'Cable stack', shortLabel: 'Cable' },
  { value: 'band', label: 'Band' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'bodyweight-loadable', label: 'Bodyweight plus load', shortLabel: 'Weighted' },
  { value: 'weight-plate', label: 'Weight plate', shortLabel: 'Plate' },
  { value: 'unloaded', label: 'No load' },
]

export const LOAD_MEASURE_LABELS: readonly LabelEntry<LoadMeasure>[] = [
  { value: 'per-hand', label: 'Per hand' },
  { value: 'total', label: 'Total load', shortLabel: 'Total' },
  { value: 'none', label: 'No load recorded', shortLabel: 'None' },
]

export const REP_UNIT_LABELS: readonly LabelEntry<RepUnit>[] = [
  { value: 'reps', label: 'Reps' },
  { value: 'seconds', label: 'Seconds held', shortLabel: 'Seconds' },
]

export const LIMITATION_FLAG_LABELS: readonly LabelEntry<LimitationFlag>[] = [
  { value: 'shoulder', label: 'Shoulder trouble', shortLabel: 'Shoulder' },
  { value: 'knee', label: 'Knee trouble', shortLabel: 'Knee' },
  { value: 'lower-back', label: 'Lower-back trouble', shortLabel: 'Lower back' },
  { value: 'barbell-squat', label: 'Avoiding barbell squats', shortLabel: 'No barbell squat' },
]

export const MEDIA_KIND_LABELS: readonly LabelEntry<MediaKind>[] = [
  { value: 'poster', label: 'Still image', shortLabel: 'Poster' },
  { value: 'demonstration', label: 'Demonstration' },
  { value: 'icon', label: 'Icon' },
]

function labelFrom<T extends string>(entries: readonly LabelEntry<T>[], value: T): string {
  return entries.find((entry) => entry.value === value)?.label ?? value
}

export const muscleLabel = (value: MuscleId) => labelFrom(MUSCLE_LABELS, value)
export const muscleGroupLabel = (value: MuscleGroupId) => labelFrom(MUSCLE_GROUP_LABELS, value)
export const bodyRegionLabel = (value: BodyRegion) => labelFrom(BODY_REGION_LABELS, value)
export const movementPatternLabel = (value: MovementPatternId) => labelFrom(MOVEMENT_PATTERN_LABELS, value)
export const movementPlaneLabel = (value: MovementPlane) => labelFrom(MOVEMENT_PLANE_LABELS, value)
export const movementChainLabel = (value: MovementChain) => labelFrom(MOVEMENT_CHAIN_LABELS, value)
export const trainingRoleLabel = (value: TrainingRole) => labelFrom(TRAINING_ROLE_LABELS, value)
export const jointLabel = (value: JointId) => labelFrom(JOINT_LABELS, value)
export const stressIntensityLabel = (value: StressIntensity) => labelFrom(STRESS_INTENSITY_LABELS, value)
export const suitabilityLabel = (value: Suitability) => labelFrom(SUITABILITY_LABELS, value)
export const gripDemandLabel = (value: GripDemand) => labelFrom(GRIP_DEMAND_LABELS, value)
export const stabilityDemandLabel = (value: StabilityDemand) => labelFrom(STABILITY_DEMAND_LABELS, value)
export const difficultyLabel = (value: Difficulty) => labelFrom(DIFFICULTY_LABELS, value)
export const transitionCostLabel = (value: TransitionCost) => labelFrom(TRANSITION_COST_LABELS, value)
export const warmUpSuitabilityLabel = (value: WarmUpSuitability) =>
  labelFrom(WARM_UP_SUITABILITY_LABELS, value)
export const locationSuitabilityLabel = (value: LocationSuitability) =>
  labelFrom(LOCATION_SUITABILITY_LABELS, value)
export const stationLabel = (value: StationId) => labelFrom(STATION_LABELS, value)
export const competingDemandLabel = (value: CompetingDemand) => labelFrom(COMPETING_DEMAND_LABELS, value)
export const loadBasisLabel = (value: LoadBasis) => labelFrom(LOAD_BASIS_LABELS, value)
export const loadMeasureLabel = (value: LoadMeasure) => labelFrom(LOAD_MEASURE_LABELS, value)
export const repUnitLabel = (value: RepUnit) => labelFrom(REP_UNIT_LABELS, value)
export const limitationFlagLabel = (value: LimitationFlag) => labelFrom(LIMITATION_FLAG_LABELS, value)
export const mediaKindLabel = (value: MediaKind) => labelFrom(MEDIA_KIND_LABELS, value)

/**
 * Every catalogue in this file, paired with the vocabulary it covers. The test
 * walks this list, so adding a value to an enum without adding its copy fails
 * here rather than rendering a raw id at somebody.
 */
export const CATALOG_LABEL_SETS: readonly {
  readonly name: string
  readonly values: readonly string[]
  readonly entries: readonly LabelEntry<string>[]
}[] = [
  { name: 'MuscleGroup', values: MUSCLE_GROUP_IDS, entries: MUSCLE_GROUP_LABELS },
  { name: 'Muscle', values: MUSCLE_IDS, entries: MUSCLE_LABELS },
  { name: 'BodyRegion', values: BODY_REGIONS, entries: BODY_REGION_LABELS },
  { name: 'MovementPattern', values: MOVEMENT_PATTERN_IDS, entries: MOVEMENT_PATTERN_LABELS },
  { name: 'MovementPlane', values: MOVEMENT_PLANES, entries: MOVEMENT_PLANE_LABELS },
  { name: 'MovementChain', values: MOVEMENT_CHAINS, entries: MOVEMENT_CHAIN_LABELS },
  { name: 'TrainingRole', values: TRAINING_ROLES, entries: TRAINING_ROLE_LABELS },
  { name: 'Joint', values: JOINT_IDS, entries: JOINT_LABELS },
  { name: 'StressIntensity', values: STRESS_INTENSITIES, entries: STRESS_INTENSITY_LABELS },
  { name: 'Suitability', values: SUITABILITY_SCALE.values, entries: SUITABILITY_LABELS },
  { name: 'GripDemand', values: GRIP_DEMAND_SCALE.values, entries: GRIP_DEMAND_LABELS },
  { name: 'StabilityDemand', values: STABILITY_DEMAND_SCALE.values, entries: STABILITY_DEMAND_LABELS },
  { name: 'Difficulty', values: DIFFICULTY_SCALE.values, entries: DIFFICULTY_LABELS },
  { name: 'TransitionCost', values: TRANSITION_COST_SCALE.values, entries: TRANSITION_COST_LABELS },
  {
    name: 'WarmUpSuitability',
    values: WARM_UP_SUITABILITY_SCALE.values,
    entries: WARM_UP_SUITABILITY_LABELS,
  },
  { name: 'LocationSuitability', values: LOCATION_SUITABILITIES, entries: LOCATION_SUITABILITY_LABELS },
  { name: 'Station', values: STATION_IDS, entries: STATION_LABELS },
  { name: 'CompetingDemand', values: COMPETING_DEMANDS, entries: COMPETING_DEMAND_LABELS },
  { name: 'LoadBasis', values: LOAD_BASES, entries: LOAD_BASIS_LABELS },
  { name: 'LoadMeasure', values: LOAD_MEASURES, entries: LOAD_MEASURE_LABELS },
  { name: 'RepUnit', values: REP_UNITS, entries: REP_UNIT_LABELS },
  { name: 'LimitationFlag', values: LIMITATION_FLAGS, entries: LIMITATION_FLAG_LABELS },
  { name: 'MediaKind', values: MEDIA_KINDS, entries: MEDIA_KIND_LABELS },
]
