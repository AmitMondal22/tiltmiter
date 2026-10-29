# Device Telemetry Data Packet & Calculation Engineering Guide

## 1. Overview & System Architecture

This document provides a comprehensive technical reference for the **Tiltmeter / Inclinometer Structural Health Monitoring System**. It details:
1. The exact structure of the telemetry data packets transmitted by edge IoT sensor nodes.
2. The complete mathematical and physical formulas converting raw sensor measurements (MEMS acceleration, angular rate, and baseline lengths) into engineering units:
   - **Tilt Angles** (degrees $^\circ$)
   - **Slope / Gradient** ($\text{mm/m}$)
   - **Linear & Total 3D Displacements** ($\text{mm}$)
   - **Tilt Direction & Compass Cardinal Bearing**
   - **Vibration RMS & Peak Acceleration** ($g$)
   - **Battery & CSQ Signal Percentages**
3. The end-to-end processing pipeline from device HTTP/WebSocket ingestion to database storage and frontend visualization.

```
+-------------------------------------------------------------------------------------------------+
|                                 EDGE HARDWARE / SENSOR NODE                                    |
|  - 3-Axis MEMS Accelerometer (ax, ay, az)                                                       |
|  - 3-Axis Gyroscope (gx, gy, gz)                                                               |
|  - Thermometer, Battery Voltage Monitor, CSQ Cellular Modem                                     |
+-------------------------------------------------------------------------------------------------+
                                               |
                                     JSON Packet over HTTP
                         POST /:deviceId or POST /api/telemetry/ingest
                                               v
+-------------------------------------------------------------------------------------------------+
|                                FASTIFY BACKEND INGESTION                                        |
|  1. Joi Schema Validation [ingestion.schema.js]                                                 |
|  2. Resultant Vector & Flat Mappings [ingestion.service.js]                                      |
|  3. Time-Series PostgreSQL Storage [telemetryStore.js, TelemetryRecord.js]          |
|  4. Threshold Alert Evaluation [alertEngineService.js]                                          |
|  5. Downlink Settings Response ({ sleep_count, wake_count, calibrate })                         |
|  6. Real-time WebSocket Broadcast [websocket.service.js]                                       |
+-------------------------------------------------------------------------------------------------+
                                               |
                                  WebSocket / REST API JSON
                                               v
+-------------------------------------------------------------------------------------------------+
|                                    REACT FRONTEND UI                                            |
|  1. Telemetry Normalization & Polar Bearing Math [telemetryHelper.js]                           |
|  2. KPI Stat Cards with Mini Sparklines [TiltmeterStatCards.jsx]                                |
|  3. Real-time Charts: Tilt (°), Displacement (mm), Peak G [TiltmeterChartsRow.jsx]              |
|  4. Compass Direction Vector Reticle [TiltDirectionCompass.jsx]                                 |
|  5. 2D/3D Bubble Horizon Visualizer [TiltPositionVisualizer.jsx, DeviceDetailPage.jsx]          |
+-------------------------------------------------------------------------------------------------+
```

---

## 2. Telemetry Packet Specification

Edge devices send sensor measurements formatted as a nested JSON payload via HTTP `POST` to `/:deviceId` or `/api/telemetry/ingest`.

### 2.1 Complete JSON Schema

```json
{
  "deviceId": "TM-001",
  "acceleration": {
    "ax": 6.11000,
    "ay": 1.35871,
    "az": 7.48188,
    "accMag": 9.75483
  },
  "gyroscope": {
    "gx": -0.000533,
    "gy": 0.000000,
    "gz": -0.003995,
    "gyroMag": 0.004030
  },
  "tilt": {
    "roll": 0.2530,
    "pitch": -0.1870,
    "tilt": 0.3146,
    "tiltStatus": "NORMAL"
  },
  "displacement": {
    "xDisplacement_mm": 12.450,
    "yDisplacement_mm": -8.320,
    "zDisplacement_mm": 0.000,
    "totalDisplacement_mm": 14.975
  },
  "vibration": {
    "vibration": 0.03484,
    "xVibrationRMS": 0.42756,
    "yVibrationRMS": 0.09366,
    "zVibrationRMS": 0.52555,
    "vibrationRMS": 0.68395,
    "vibrationPeak": 9.61712,
    "vibrationStatus": "NORMAL"
  },
  "environment": {
    "temperature": 28.12
  },
  "power": {
    "batteryVoltage": 13.03
  },
  "network": {
    "csq": 19
  },
  "calibration": {
    "calibrated": true
  },
  "timestamp": "2026-10-22T14:05:30.000Z"
}
```

### 2.2 Field Definitions & Data Types

| Field Path | Type | Unit | Description |
| :--- | :--- | :--- | :--- |
| `deviceId` | string | - | Unique hardware identifier (e.g. `TM-001`, `TTM-01`). |
| `acceleration.ax` | float | $\text{m/s}^2$ or $g$ | Instantaneous linear acceleration on X-axis. |
| `acceleration.ay` | float | $\text{m/s}^2$ or $g$ | Instantaneous linear acceleration on Y-axis. |
| `acceleration.az` | float | $\text{m/s}^2$ or $g$ | Instantaneous linear acceleration on Z-axis. |
| `acceleration.accMag`| float | $\text{m/s}^2$ or $g$ | 3D acceleration vector magnitude $\sqrt{a_x^2 + a_y^2 + a_z^2}$. |
| `gyroscope.gx, gy, gz` | float | $\text{rad/s}$ | Angular velocity around the X, Y, and Z axes. |
| `gyroscope.gyroMag` | float | $\text{rad/s}$ | Total angular rotation rate $\sqrt{\omega_x^2 + \omega_y^2 + \omega_z^2}$. |
| `tilt.roll` | float | Degrees ($^\circ$) | X-axis tilt angle relative to horizon / plumb line. |
| `tilt.pitch` | float | Degrees ($^\circ$) | Y-axis tilt angle relative to horizon / plumb line. |
| `tilt.tilt` | float | Degrees ($^\circ$) | Resultant 2D tilt magnitude $\sqrt{\text{roll}^2 + \text{pitch}^2}$. |
| `tilt.tiltStatus` | string | - | Threshold status: `'NORMAL'`, `'WARNING'`, `'CRITICAL'`. |
| `displacement.xDisplacement_mm` | float | $\text{mm}$ | Lateral displacement along the X-axis. |
| `displacement.yDisplacement_mm` | float | $\text{mm}$ | Lateral displacement along the Y-axis. |
| `displacement.zDisplacement_mm` | float | $\text{mm}$ | Vertical settlement / displacement along the Z-axis. |
| `displacement.totalDisplacement_mm` | float | $\text{mm}$ | 3D resultant displacement vector magnitude. |
| `vibration.vibrationRMS` | float | $g$ | Root Mean Square acceleration across the measurement window. |
| `vibration.vibrationPeak`| float | $g$ | Maximum peak-to-peak shock or vibration acceleration. |
| `environment.temperature` | float | $^\circ\text{C}$ | Sensor enclosure / ambient temperature. |
| `power.batteryVoltage` | float | $\text{V}$ | Supply voltage from internal battery / solar bank. |
| `network.csq` | integer | $0-31$ | Cellular Signal Quality index (AT+CSQ). |
| `calibration.calibrated` | boolean | - | True if baseline tare offset is applied. |
| `timestamp` | ISO-8601 string| - | UTC timestamp when readings were acquired. |

---

## 3. Detailed Calculation Formulas & Logic

### 3.1 Raw Acceleration to Tilt Angles ($\theta_x, \theta_y, \theta_{\text{res}}$)

MEMS accelerometers measure the projection of Earth's gravity vector ($\mathbf{g} \approx 9.80665\text{ m/s}^2$) onto the sensor's orthogonal axes.

```
        ^ Z (Vertical Plumb)
        |
        |      / Y (Pitch)
        |     /
        |    /
        |   /
        |  /
        | /
        +----------------> X (Roll)
```

#### Formulas:
1. **Total Acceleration Magnitude**:
   $$\text{accMag} = \|\mathbf{a}\| = \sqrt{a_x^2 + a_y^2 + a_z^2}$$

2. **Roll Angle ($\theta_x$ or X Tilt in degrees)**:
   $$\theta_x = \arcsin\left(\frac{a_x}{\text{accMag}}\right) \times \frac{180}{\pi} \quad \text{or} \quad \arctan\left(\frac{a_x}{\sqrt{a_y^2 + a_z^2}}\right) \times \frac{180}{\pi}$$

3. **Pitch Angle ($\theta_y$ or Y Tilt in degrees)**:
   $$\theta_y = \arcsin\left(\frac{a_y}{\text{accMag}}\right) \times \frac{180}{\pi} \quad \text{or} \quad \arctan\left(\frac{a_y}{\sqrt{a_x^2 + a_z^2}}\right) \times \frac{180}{\pi}$$

4. **Resultant Tilt Angle ($\theta_{\text{resultant}}$)**:
   As calculated in [`backend/src/modules/ingestion/ingestion.service.js:10`](file:///d:/inclinometer/backend/src/modules/ingestion/ingestion.service.js#L10) and [`frontend/src/utils/telemetryHelper.js:23`](file:///d:/inclinometer/frontend/src/utils/telemetryHelper.js#L23):
   $$\theta_{\text{resultant}} = \sqrt{\theta_x^2 + \theta_y^2}$$

---

### 3.2 Tilt Angle to Slope / Gradient ($\text{mm/m}$)

In civil engineering and geotechnical monitoring (such as retaining walls, bridge abutments, and tunnels), angular tilt is often expressed as **slope** or **deflection per unit length**:

$$\text{Slope} = \frac{\Delta \text{Deflection}}{\text{Length}}$$

For a standard baseline gauge length of $1\text{ meter}$ ($1000\text{ mm}$):

$$\text{Slope}_x\text{ (mm/m)} = 1000 \cdot \sin(\theta_x)$$
$$\text{Slope}_y\text{ (mm/m)} = 1000 \cdot \sin(\theta_y)$$

#### Small Angle Approximation:
For civil engineering structures, tilt angles are typically small ($\theta < 5^\circ$). Using Taylor series expansion:
$$\sin(\theta) \approx \tan(\theta) \approx \theta\text{ (in radians)}$$

Converting degrees to radians:
$$\theta_{\text{rad}} = \theta^\circ \times \frac{\pi}{180} \approx \theta^\circ \times 0.01745329$$

Therefore:
$$\text{Slope (mm/m)} \approx 1000 \times \left(\theta^\circ \times \frac{\pi}{180}\right) \approx 17.4533 \times \theta^\circ$$

#### Example Calculation:
- For Roll $\theta_x = +0.253^\circ$:
  $$\text{Slope}_x = 1000 \times \sin(0.253^\circ) \approx 1000 \times 0.0044156 = 4.416\text{ mm/m}$$
- Or when scaled directly against a fixed structural calibration arm:
  $$\Delta = L \cdot \sin(\theta)$$

---

### 3.3 Angle to Linear Displacement ($\text{mm}$)

When a tiltmeter or in-place inclinometer (IPI) is installed on a structure of height $H$ or an inclinometer segment casing of gauge length $L$:

```
        Plumb Reference
             |
             | \
             |  \  Angle θ
  Gauge      |   \
  Length (L) |    \
             |     \
             +------*  Deflection Δd = L * sin(θ - θ_baseline)
```

1. **X Lateral Displacement ($\text{mm}$)**:
   $$\Delta x = L \cdot \sin(\theta_x - \theta_{x,\text{baseline}})$$

2. **Y Lateral Displacement ($\text{mm}$)**:
   $$\Delta y = L \cdot \sin(\theta_y - \theta_{y,\text{baseline}})$$

3. **Total 3D Resultant Displacement ($\text{mm}$)**:
   Implemented in [`backend/src/modules/ingestion/ingestion.service.js:15`](file:///d:/inclinometer/backend/src/modules/ingestion/ingestion.service.js#L15) and [`frontend/src/utils/telemetryHelper.js:51`](file:///d:/inclinometer/frontend/src/utils/telemetryHelper.js#L51):
   $$\Delta_{\text{total}} = \sqrt{\Delta x^2 + \Delta y^2 + \Delta z^2}$$

#### Numerical Example:
Given:
- $\Delta x = 12.450\text{ mm}$
- $\Delta y = -8.320\text{ mm}$
- $\Delta z = 0.000\text{ mm}$

$$\Delta_{\text{total}} = \sqrt{(12.450)^2 + (-8.320)^2 + (0.000)^2} = \sqrt{155.0025 + 69.2224} = \sqrt{224.2249} \approx 14.974\text{ mm}$$

---

### 3.4 Tilt Direction & Compass Cardinal Bearing

To identify which compass direction the structure is leaning toward, the application computes the polar angle from the orthogonal tilt vectors $(\theta_x, \theta_y)$.

Implemented in [`frontend/src/utils/telemetryHelper.js:69-75`](file:///d:/inclinometer/frontend/src/utils/telemetryHelper.js#L69-L75):

```javascript
// Calculate radian angle in [-π, π]
const angleRad = Math.atan2(pitch, roll);

// Convert to degrees in [0, 360)
let angleDeg = (angleRad * 180) / Math.PI;
if (angleDeg < 0) angleDeg += 360;

// Discretize into 8 cardinal compass sectors
const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const cardinalIdx = Math.round(angleDeg / 45) % 8;
const cardinalStr = cardinals[cardinalIdx];
```

#### Compass Sector Table:
| Sector Index | Angle Range | Cardinal Direction |
| :---: | :---: | :---: |
| 0 | $337.5^\circ \text{ to } 22.5^\circ$ | **N** (North) |
| 1 | $22.5^\circ \text{ to } 67.5^\circ$ | **NE** (North-East) |
| 2 | $67.5^\circ \text{ to } 112.5^\circ$ | **E** (East) |
| 3 | $112.5^\circ \text{ to } 157.5^\circ$ | **SE** (South-East) |
| 4 | $157.5^\circ \text{ to } 202.5^\circ$ | **S** (South) |
| 5 | $202.5^\circ \text{ to } 247.5^\circ$ | **SW** (South-West) |
| 6 | $247.5^\circ \text{ to } 292.5^\circ$ | **W** (West) |
| 7 | $292.5^\circ \text{ to } 337.5^\circ$ | **NW** (North-West) |

---

### 3.5 Vibration RMS & Peak Acceleration

Vibration monitoring detects dynamic environmental disturbances (e.g. excavation, blasting, piling, or earthquakes).

1. **Root Mean Square (RMS) Vibration**:
   For $N$ acceleration samples over a sampling burst:
   $$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=1}^N (a_i - \bar{a})^2}$$
   Where $\bar{a}$ is the DC static gravity offset.

2. **Total Combined RMS**:
   $$\text{RMS}_{\text{total}} = \sqrt{\text{RMS}_x^2 + \text{RMS}_y^2 + \text{RMS}_z^2}$$

3. **Peak Acceleration ($g$)**:
   $$\text{Peak} = \max_{1 \le i \le N} |a_i - \bar{a}|$$

---

### 3.6 Power & Signal Percentages

Implemented in [`frontend/src/utils/telemetryHelper.js:57-66`](file:///d:/inclinometer/frontend/src/utils/telemetryHelper.js#L57-L66):

#### Battery Voltage to Percentage:
Assumes a standard $12\text{V} - 13\text{V}$ industrial lithium / solar battery system ($13.0\text{V} \implies 100\%$):
$$\text{Battery \%} = \min\left(100, \max\left(0, \text{round}\left(\frac{V_{\text{battery}}}{13.0} \times 100\right)\right)\right)$$

#### Cellular Signal CSQ to Percentage:
The 3GPP AT+CSQ index ranges from $0$ (marginal/no signal) to $31$ (optimal $\ge -51\text{ dBm}$):
$$\text{CSQ \%} = \min\left(100, \max\left(0, \text{round}\left(\frac{\text{CSQ}}{31} \times 100\right)\right)\right)$$

---

## 4. Ingestion Workflow & Backend API

### 4.1 Ingestion Endpoints

- `POST http://localhost:5001/:deviceId`
- `POST http://localhost:5001/api/telemetry/ingest/:deviceId`
- `POST http://localhost:5001/api/telemetry/ingest`

### 4.2 Ingestion Controller & Response

Located in [`backend/src/modules/ingestion/ingestion.controller.js`](file:///d:/inclinometer/backend/src/modules/ingestion/ingestion.controller.js):

When a device transmits a telemetry payload, the server returns configuration settings to govern sleep cycles and calibration:

```json
{
  "success": true,
  "device_id": "TM-001",
  "settings": {
    "sleep_count": 10,
    "wake_count": 30,
    "calibrate": false
  }
}
```

- `sleep_count`: Duration in minutes the sensor node stays in ultra-low-power sleep.
- `wake_count`: Duration in seconds the sensor stays active to sample, average, and transmit data.
- `calibrate`: If `true`, the node zeroes its internal offsets against current position (tare baseline).

### 4.3 Alert Evaluation Engine

Located in [`backend/src/services/alertEngineService.js`](file:///d:/inclinometer/backend/src/services/alertEngineService.js):

| Parameter | Threshold | Severity | Automated Action |
| :--- | :--- | :--- | :--- |
| **Resultant Tilt** | $> 1.0^\circ$ | `WARNING` | Creates Alarm record, broadcasts to dashboard. |
| **Resultant Tilt** | $> 2.0^\circ$ | `CRITICAL` | Creates Alarm & auto-generates Incident ticket (`INC-XXXXXX`). |
| **Displacement** | $> 10.0\text{ mm}$ | `CRITICAL` | Triggers Critical Displacement Alarm. |

---

## 5. Sample Integration Code

### 5.1 Python Telemetry Transmission Example

```python
import requests
import json
import time
import math

SERVER_URL = "http://localhost:5001/TM-001"

# Simulated physical parameters
roll_deg = 0.253       # degrees
pitch_deg = -0.187      # degrees
gauge_length_mm = 50000 # 50-meter retaining wall height

# 1. Compute Resultant Tilt
resultant_tilt = math.sqrt(roll_deg**2 + pitch_deg**2)

# 2. Compute Linear Displacements (mm)
x_disp_mm = gauge_length_mm * math.sin(math.radians(roll_deg))
y_disp_mm = gauge_length_mm * math.sin(math.radians(pitch_deg))
total_disp_mm = math.sqrt(x_disp_mm**2 + y_disp_mm**2)

payload = {
    "deviceId": "TM-001",
    "acceleration": {
        "ax": 9.806 * math.sin(math.radians(roll_deg)),
        "ay": 9.806 * math.sin(math.radians(pitch_deg)),
        "az": 9.806 * math.cos(math.radians(resultant_tilt)),
        "accMag": 9.806
    },
    "tilt": {
        "roll": round(roll_deg, 4),
        "pitch": round(pitch_deg, 4),
        "tilt": round(resultant_tilt, 4),
        "tiltStatus": "NORMAL"
    },
    "displacement": {
        "xDisplacement_mm": round(x_disp_mm, 3),
        "yDisplacement_mm": round(y_disp_mm, 3),
        "zDisplacement_mm": 0.0,
        "totalDisplacement_mm": round(total_disp_mm, 3)
    },
    "vibration": {
        "vibrationRMS": 0.045,
        "vibrationPeak": 0.18,
        "vibrationStatus": "NORMAL"
    },
    "environment": { "temperature": 28.5 },
    "power": { "batteryVoltage": 12.8 },
    "network": { "csq": 24 },
    "calibration": { "calibrated": True },
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
}

headers = {"Content-Type": "application/json"}
response = requests.post(SERVER_URL, data=json.dumps(payload), headers=headers)
print("Server Response:", response.status_code, response.json())
```

---

## 6. Key References in Codebase

- Ingestion Schema: [`backend/src/modules/ingestion/ingestion.schema.js`](file:///d:/inclinometer/backend/src/modules/ingestion/ingestion.schema.js)
- Ingestion Service: [`backend/src/modules/ingestion/ingestion.service.js`](file:///d:/inclinometer/backend/src/modules/ingestion/ingestion.service.js)
- Time-series Telemetry Handler: [`backend/src/services/telemetryStore.js`](file:///d:/inclinometer/backend/src/services/telemetryStore.js)
- Alert Engine: [`backend/src/services/alertEngineService.js`](file:///d:/inclinometer/backend/src/services/alertEngineService.js)
- Frontend Telemetry Parser: [`frontend/src/utils/telemetryHelper.js`](file:///d:/inclinometer/frontend/src/utils/telemetryHelper.js)
- Dashboard Stat Cards: [`frontend/src/components/TiltmeterStatCards.jsx`](file:///d:/inclinometer/frontend/src/components/TiltmeterStatCards.jsx)
- Multi-Axis Chart Visualizer: [`frontend/src/components/TiltmeterChartsRow.jsx`](file:///d:/inclinometer/frontend/src/components/TiltmeterChartsRow.jsx)
- Polar Compass Visualizer: [`frontend/src/components/TiltDirectionCompass.jsx`](file:///d:/inclinometer/frontend/src/components/TiltDirectionCompass.jsx)
