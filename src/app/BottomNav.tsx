import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navigation'
import styles from './BottomNav.module.css'

/** NavLink sets `aria-current="page"` on the active tab for us. */
export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <ul className={styles.list} role="list">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon

          return (
            <li key={item.id} className={styles.item}>
              <NavLink
                to={item.path}
                end
                className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
              >
                <Icon className={styles.icon} />
                <span className={styles.label}>{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
