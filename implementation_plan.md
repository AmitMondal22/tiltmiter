# Implementation Plan - Tiltmeter Monitoring System Dashboard Overhaul

Rebuild the application UI to strictly match the new **TILTMETER MONITORING SYSTEM** reference image, incorporating all new parameters, site/structure/device cascading selectors, 12 top KPI stat cards with mini sparkline trends, 3 time-series line graphs, polar tilt direction compass reticle, alarm summary counters, device status donut widget, sensor health table, recent events feed, and bottom metadata footer.

## User Review Required

> [!IMPORTANT]
> - **Complete Parameter Overhaul**: All old inclinometer-only parameters (e.g. depth profiles table) will be replaced with the exact parameters from the Tiltmeter Monitoring System reference image:
>   - **Topbar Selectors**: Site, Structure, Device dropdowns + User Admin profile + Date Range Picker + Live mode toggle.
>   - **Sidebar**: Donut status chart (Online: 12, Offline: 1, Alarm: 2, Total: 15).
>   - **12 KPI Cards**:
>     1. **X Tilt** (`+0.253°`, `+2.53 mm/m`) with blue sparkline
>     2. **Y Tilt** (`-0.187°`, `-1.87 mm/m`) with green sparkline
>     3. **Resultant Tilt** (`0.314°`, `3.14 mm/m`) with purple sparkline
>     4. **Tilt Direction** (`135.6°`, `SE`) with orange sparkline
>     5. **X Displacement** (`+12.45 mm`, `Total`) with cyan sparkline
>     6. **Y Displacement** (`-8.32 mm`, `Total`) with yellow sparkline
>     7. **Total Displacement** (`15.00 mm`, `Resultant`) with magenta sparkline
>     8. **Displacement Rate** (`0.48 mm/day`, `↑ 12% vs yesterday`)
>     9. **Tilt Rate** (`0.012 °/day`, `↑ 8% vs yesterday`)
>     10. **Temperature** (`28.6 °C`, `Normal`)
>     11. **Battery** (`78%`, `Good`)
>     12. **Signal Strength** (`-67 dBm`, `Good`), **Last Update**, **Status** (`ONLINE`)
>   - **3 Middle Charts**:
>     1. Tilt (°) vs Time (Tilt X, Tilt Y, Resultant Tilt)
>     2. Displacement (mm) vs Time (X Displacement, Y Displacement, Total Displacement)
>     3. Tilt Rate (mm/day) vs Time
>   - **5 Bottom Widgets**:
>     1. Tilt Direction compass vector reticle (`135.6° SE`)
>     2. Alarm Summary counters (Critical, Major, Minor, Warnings, Total)
>     3. Device Information (ID, Serial No, Firmware, Hardware, Location, Sampling/Logging Intervals)
>     4. Sensor Health (MEMS, Temp, Power, Calibration, Data Quality 100%, Last Calibration)
>     5. Recent Events timeline with severity icons
>   - **Footer Bar**: Timezone (Asia/Kolkata), Latitude/Longitude/Elevation, Data Source Live indicator, Copyright.

## Proposed Changes

### Data & State Model

#### [MODIFY] [src/mockData.js](file:///d:/inclinometer/frontend/src/mockData.js)
- Update mock dataset with Sites, Structures, and Tiltmeter Devices (`TTM-01`, `TTM-02`, `TTM-03`).
- Include X/Y/Resultant tilts, X/Y/Total displacements, Tilt direction angle & cardinal, Displacement rate, Tilt rate, sparkline history arrays, time series for 3 charts, alarm summary metrics, sensor health items, and recent events timeline.

---

### UI Components

#### [MODIFY] [src/components/Topbar.jsx](file:///d:/inclinometer/frontend/src/components/Topbar.jsx)
- Top bar layout matching screenshot:
  - App Logo: **TILTMETER MONITORING SYSTEM**
  - Dropdowns: **Site** (`Demo Project Site`), **Structure** (`Retaining Wall - RW01`), **Device** (`TTM-01 (Tiltmeter)`)
  - Status pill: `ONLINE` green badge
  - Notifications bell with `3` badge count, export icon, User Profile (`Admin Super Admin`)
  - Date Range Picker (`18 May 2025 00:00 - 18 May 2025 23:59`), Live button (`Live`).

#### [MODIFY] [src/components/Sidebar.jsx](file:///d:/inclinometer/frontend/src/components/Sidebar.jsx)
- Navigation links: Dashboard (Active), Real Time, Trends, Displacement, Alarms, Events, Devices, Reports, Configuration, Calibration, Users, System Settings.
- Bottom **Device Status Donut Widget**: Donut chart with Online (12), Offline (1), Alarm (2), and Total Devices (15).

#### [NEW] [src/components/TiltmeterStatCards.jsx](file:///d:/inclinometer/frontend/src/components/TiltmeterStatCards.jsx)
- Two-tier grid of stat cards:
  - Top row: 7 cards with embedded SVG sparklines for X Tilt, Y Tilt, Resultant Tilt, Tilt Direction, X Displacement, Y Displacement, Total Displacement.
  - Second row: 6 cards for Displacement Rate (with trend % badge), Tilt Rate (with trend % badge), Temperature, Battery, Signal Strength, Last Update, Status.

#### [NEW] [src/components/TiltmeterChartsRow.jsx](file:///d:/inclinometer/frontend/src/components/TiltmeterChartsRow.jsx)
- Row of 3 charts with 24 Hours dropdown filter:
  1. `Tilt (°) vs Time`
  2. `Displacement (mm) vs Time`
  3. `Tilt Rate (mm/day) vs Time`

#### [NEW] [src/components/TiltDirectionCompass.jsx](file:///d:/inclinometer/frontend/src/components/TiltDirectionCompass.jsx)
- Radial compass visualizer with N, NE, E, SE, S, SW, W, NW markers and an orange direction vector arrow pointing to `135.6° SE`.

#### [NEW] [src/components/AlarmSummaryWidget.jsx](file:///d:/inclinometer/frontend/src/components/AlarmSummaryWidget.jsx)
- Summary list with color-coded counter pills for Critical Alarms (1), Major Alarms (1), Minor Alarms (2), Warnings (1), and Total Active Alarms (5).

#### [NEW] [src/components/SensorHealthWidget.jsx](file:///d:/inclinometer/frontend/src/components/SensorHealthWidget.jsx)
- Status list for MEMS Sensor (OK), Temperature Sensor (OK), Power Supply (OK), Calibration Status (Valid), Data Quality (100%), Last Calibration date.

#### [NEW] [src/components/RecentEventsWidget.jsx](file:///d:/inclinometer/frontend/src/components/RecentEventsWidget.jsx)
- Event log items (Tilt X High Warning, Displacement Rate High, Battery Level Normal, Device Online, Calibration Completed) with severity icons and timestamps.

#### [NEW] [src/components/FooterBar.jsx](file:///d:/inclinometer/frontend/src/components/FooterBar.jsx)
- Bottom bar displaying Timezone (`Asia/Kolkata (IST)`), Coordinates (`22.5726° N, 88.3639° E`), Elevation (`18.6 m`), Data Source (`Live`), and Copyright.

#### [MODIFY] [src/App.jsx](file:///d:/inclinometer/frontend/src/App.jsx)
- Assemble the Tiltmeter Dashboard layout.

## Verification Plan

### Automated Tests
- Run `npm run build` to verify clean compilation.

### Manual Verification
- Test Site, Structure, and Device dropdown selectors.
- Verify all 12 top KPI cards render with mini sparkline graphs and rate trend badges.
- Verify the 3 time series charts and 24h filter dropdown.
- Verify Tilt Direction compass arrow, Alarm Summary counters, Sensor Health status, Recent Events timeline, Donut chart, and Footer metadata bar.
