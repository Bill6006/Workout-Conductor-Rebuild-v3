import type { ComponentType, SVGProps } from 'react'
import { PlanIcon, ProgressIcon, SettingsIcon, TodayIcon, WorkoutIcon } from './navIcons'

export type NavId = 'today' | 'workout' | 'progress' | 'plan' | 'settings'

export interface NavItem {
  readonly id: NavId
  readonly path: string
  readonly label: string
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>
}

/**
 * The single source of truth for navigation: the route table, the bottom tab
 * bar, and the navigation tests all read this array. Adding a tab is one edit.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'today', path: '/', label: 'Today', icon: TodayIcon },
  { id: 'workout', path: '/workout', label: 'Workout', icon: WorkoutIcon },
  { id: 'progress', path: '/progress', label: 'Progress', icon: ProgressIcon },
  { id: 'plan', path: '/plan', label: 'Plan', icon: PlanIcon },
  { id: 'settings', path: '/settings', label: 'Settings', icon: SettingsIcon },
]
