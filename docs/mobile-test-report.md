# Mobile test report

The template every phase fills in before submitting for review. Workout Conductor is used on a
phone, one-handed, often with a larger system font — so the mobile matrix is a gate, not a
courtesy check.

Copy this file's tables into the phase report, or update this file in place and link it. Record
what was actually observed. "Assumed fine" is not a result.

**Current status: Phase 0 — shell only.** Only the app shell, navigation, and placeholder screens
exist, so every feature row below is marked `shell only`. They become real rows in the phase that
builds the feature.

## How to run it

```bash
npm run dev            # then use device emulation, or a real phone on the LAN
npm run test:e2e       # the Playwright mobile-viewport specs
npm run shots          # capture the screenshots in docs/screenshots/
```

Zoom is exercised through the browser's page zoom and, on a real device, through the Android
display size and font size settings. Both matter: page zoom scales everything, while Android font
scaling grows text inside a fixed layout, which is the harsher test.

## Viewport and zoom matrix

Result key: `pass` / `fail` / `n/a`.

**Phase 0 run — 2026-09-01, all 16 combinations pass.** Measured against the production
build served on the deployed sub-path, driven with Chromium at `deviceScaleFactor: 3`,
`isMobile: true`. Page zoom is emulated the way the browser implements it: the CSS viewport
shrinks by the zoom factor, so 360 px at 150% lays out in 240 CSS px. Every one of the five
routes was checked at every combination for four conditions — `documentElement.scrollWidth`
never exceeding `window.innerWidth`, the bottom navigation still rendered with all five
items, every navigation item at least 44 px tall, and exactly one `<h1>` per route.

### 360 px wide

| Zoom | No horizontal overflow | Layout intact | Text readable | Nav reachable | Notes               |
| ---- | ---------------------- | ------------- | ------------- | ------------- | ------------------- |
| 100% | pass                   | pass          | pass          | pass          | CSS viewport 360 px |
| 115% | pass                   | pass          | pass          | pass          | CSS viewport 313 px |
| 130% | pass                   | pass          | pass          | pass          | CSS viewport 277 px |
| 150% | pass                   | pass          | pass          | pass          | CSS viewport 240 px |

### 375 px wide

| Zoom | No horizontal overflow | Layout intact | Text readable | Nav reachable | Notes               |
| ---- | ---------------------- | ------------- | ------------- | ------------- | ------------------- |
| 100% | pass                   | pass          | pass          | pass          | CSS viewport 375 px |
| 115% | pass                   | pass          | pass          | pass          | CSS viewport 326 px |
| 130% | pass                   | pass          | pass          | pass          | CSS viewport 288 px |
| 150% | pass                   | pass          | pass          | pass          | CSS viewport 250 px |

### 412 px wide

| Zoom | No horizontal overflow | Layout intact | Text readable | Nav reachable | Notes               |
| ---- | ---------------------- | ------------- | ------------- | ------------- | ------------------- |
| 100% | pass                   | pass          | pass          | pass          | CSS viewport 412 px |
| 115% | pass                   | pass          | pass          | pass          | CSS viewport 358 px |
| 130% | pass                   | pass          | pass          | pass          | CSS viewport 317 px |
| 150% | pass                   | pass          | pass          | pass          | CSS viewport 275 px |

### 430 px wide

| Zoom | No horizontal overflow | Layout intact | Text readable | Nav reachable | Notes               |
| ---- | ---------------------- | ------------- | ------------- | ------------- | ------------------- |
| 100% | pass                   | pass          | pass          | pass          | CSS viewport 430 px |
| 115% | pass                   | pass          | pass          | pass          | CSS viewport 374 px |
| 130% | pass                   | pass          | pass          | pass          | CSS viewport 331 px |
| 150% | pass                   | pass          | pass          | pass          | CSS viewport 287 px |

## Structural checks

The page itself must never scroll sideways; wide content scrolls inside its own container.

| Check                                        | Phase 0 | Result | Notes                        |
| -------------------------------------------- | ------- | ------ | ---------------------------- |
| No horizontal overflow, any width or zoom    | applies |        | The hard one                 |
| Bottom nav fixed, above the gesture bar      | applies |        | `--wc-safe-bottom` respected |
| Content not hidden behind the bottom nav     | applies |        | Reserve `--wc-nav-h`         |
| Safe-area insets respected at the top        | applies |        | Notch and status bar         |
| Tap targets at least 44 px                   | applies |        | Nav and icon buttons too     |
| Primary actions in the lower two-thirds      | applies |        | Thumb reach, 6.5" phone      |
| Focus visible for keyboard and switch access | applies |        |                              |
| Contrast meets AA for body text and controls | applies |        | Lime on charcoal             |
| Reduced-motion preference honoured           | applies |        |                              |

## Android keyboard behaviour

| Check                                                      | Phase 0    | Result | Notes                |
| ---------------------------------------------------------- | ---------- | ------ | -------------------- |
| Focused input stays visible when the keyboard opens        | shell only |        |                      |
| Layout does not jump or reflow permanently after dismissal | shell only |        |                      |
| Bottom navigation does not float above the keyboard        | shell only |        |                      |
| Numeric fields open the numeric keypad                     | shell only |        | Weight and rep entry |
| Enter / next moves between set fields sensibly             | shell only |        |                      |

## Feature checks

These become real rows in the phase that builds them.

| Check                                                | Phase 0    | Result | Notes                                      |
| ---------------------------------------------------- | ---------- | ------ | ------------------------------------------ |
| Dialogs and sheets fit at 150% zoom without clipping | shell only |        | Phase 1+                                   |
| Dialogs are dismissible and trap focus               | shell only |        | Phase 1+                                   |
| Set logging is comfortable one-handed                | shell only |        | Phase 5                                    |
| Set logging survives rotation without data loss      | shell only |        | Phase 5                                    |
| Duration dropdown is reachable and readable          | shell only |        | Phase 3 — the one 15/30/45/Default control |
| Duration change rebuilds rather than truncates       | shell only |        | Phase 3                                    |
| Alternatives sheet is scrollable and legible         | shell only |        | Phase 2 / 5                                |
| Calibration loading state appears and resolves       | shell only |        | Phase 4 — states what it is recalculating  |
| Calibration overlay does not block logged work       | shell only |        | Phase 4                                    |
| Active workout resumes correctly after backgrounding | shell only |        | Phase 5                                    |
| Active workout resumes after a full app restart      | shell only |        | Phase 5                                    |
| Update prompt is suppressed during an active workout | shell only |        | Phase 8                                    |

## Devices and browsers exercised

| Device / emulation | Browser | OS  | Notes |
| ------------------ | ------- | --- | ----- |
|                    |         |     |       |

## Issues found

| #   | Severity | Width / zoom | Description | Status |
| --- | -------- | ------------ | ----------- | ------ |
|     |          |              |             |        |
