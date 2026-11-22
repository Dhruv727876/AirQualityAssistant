# Urban Air Quality Assistant

## What this is

Urban Air Quality Assistant is a GenAI application designed to help families and communities navigate winter smog conditions. It provides tailored guidance on low-emission daily routines, indoor air quality practices, and sustainable alternatives suited to local contexts. Each recommendation transparently explains the direct environmental and health impacts of individual choices.

## Architecture

The project is structured as a two-tier monorepo with self-contained `client/` and `server/` packages:

```
/
  .gitignore
  README.md
  .github/workflows/ci.yml
  client/   (Vite + React + TypeScript)
  server/   (Express 5 + TypeScript)
```

The application separates the frontend and backend into two decoupled tiers. This architecture ensures the static client assets load instantly in the user's browser even if the backend server is experiencing a cold start or asleep on serverless infrastructure.

## Data sources

The application integrates with Open-Meteo for location search and live environmental metrics:
- **Open-Meteo Geocoding API**: Resolves location queries into geographic coordinates with administrative regions.
- **Open-Meteo Air Quality API**: Supplies atmospheric pollutant readings (`pm2_5`, `pm10`, and `us_aqi`). Air quality data is modelled data on a coarse grid (Copernicus Atmosphere Monitoring Service - CAMS via Open-Meteo), not street-level sensor readings. The `us_aqi` value is Open-Meteo's computation of the US EPA Air Quality Index based on standard EPA AQI category definitions.
- **Attribution**: Air quality and weather data by Open-Meteo.com (licensed under CC BY 4.0).

## Impact model

The application enforces a strict deterministic design rule: the LLM never produces numbers; the server computes every impact and labels its basis.

| Lever | What is computed | Basis | Source name |
| --- | --- | --- | --- |
| `n95-outdoors` | % of fine particles filtered (up to) | standard | NIOSH N95 respirator certification, 42 CFR Part 84 (95% minimum filtration of the test aerosol) |
| `shift-outdoor-activity` | % lower PM2.5 at the best waking hour than at the worst | forecast | Open-Meteo Air Quality API (Copernicus CAMS model) |
| `ventilate-at-low-hour` | % lower PM2.5 at the best waking hour than at the worst | forecast | Open-Meteo Air Quality API (Copernicus CAMS model) |
| `air-purifier` | % lower indoor PM2.5 than the same room without it (steady state) | rough estimate | none |
| `avoid-car-trips` | private-vehicle km avoided per week | arithmetic | none |

The WHO ratio is the PM2.5 reading divided by 15 µg/m³, the 24-hour guideline level from "WHO global air quality guidelines, 2021" (defined by WHO as the 99th percentile of daily means, i.e. exceeded on at most 3-4 days a year; basis: standard). The app compares it to a single hourly reading, so the ratio is indicative only. Forecast hours are in the location's local time and are labelled "today" or "tomorrow" relative to the current reading, and the best hour is the lowest forecast value in the waking window, which can still be unhealthy.

Heating and cooking fuel swaps are not quantified in this model. All figures are estimates, not medical advice.

The three physical constants used in the indoor air purifier model (ceiling height of 2.5 m, natural room air change rate of 0.5 per hour, and particle deposition rate of 0.2 per hour) are rough estimates with no source. The 06:00–21:00 waking window is also a rough estimate.

## Verdict

The plan builder assigns an actionable day verdict based on live US AQI and the profile's sensitivity. The EPA category boundaries (0–50, 51–100, 101–150, 151+) are published, while the stricter thresholds for sensitive profiles are this app's own conservative choice, not a published rule.

| US AQI Range | General (Not Sensitive) | Sensitive / Community | EPA AQI Category |
| --- | --- | --- | --- |
| 0 – 50 | `go` | `go` | Good |
| 51 – 100 | `go` | `caution` | Moderate |
| 101 – 150 | `caution` | `limit-outdoors` | Unhealthy for Sensitive Groups |
| 151 – 200 | `limit-outdoors` | `limit-outdoors` | Unhealthy |
| 201 – 300 | `limit-outdoors` | `limit-outdoors` | Very Unhealthy |
| 301+ | `limit-outdoors` | `limit-outdoors` | Hazardous |

If live air data is missing (`usAqi` is null), the verdict defaults to `unknown` ("Live air data is incomplete for this hour; plan cautiously.").

### Sensitive threshold rules
The thresholds for sensitive profiles are intentionally more conservative than standard EPA category boundaries:
- For general populations, precautions begin when air quality reaches "Unhealthy for Sensitive Groups" (AQI > 100).
- For sensitive populations, precautions begin at AQI > 50 ("Moderate"), shifting the verdict from `go` to `caution`, and escalate to `limit-outdoors` at AQI > 100 rather than waiting for AQI > 150 ("Unhealthy").
- A family profile is treated as sensitive if it reports any children (`children > 0`), older adults (`elderly > 0`), or flags `hasSensitiveMember: true`.

### Community mode rules
Community profiles are always evaluated under the sensitive thresholds regardless of individual member flags. In a community context, shared spaces and group activities may include individuals with respiratory vulnerabilities, young children, or elderly residents.

### Household aggregation
Only the commute impact is multiplied by the number of households; every other figure describes one typical household.

## AI layer

- **Wording only**: The model writes wording only; numbers come from the server. Digits in its output are rejected, so numerals cannot appear. The prompt also forbids statistics, but number words are not detected.
- **Provider order & fallback**: Calls try Gemini (`gemini-3-flash-preview`) first, then fall back to NVIDIA (`nvidia/nemotron-3.5-lightning-30b-a3b`). If both providers fail or return unusable text, the server returns the static plan at HTTP 200. Model IDs are constants at the top of llm.ts. Providers retire models (one returned HTTP 410 during development), and the static plan is what keeps the app working when that happens.
- **Privacy by design**: Only the location name, household composition (member counts, or the number of households), commute mode, heating and cooking type, whether a sensitive member is present, the air quality band label, the verdict level and the titles of the plan's actions are sent. Coordinates are never sent. The profile is never logged.
- **Prompt injection defence**: Untrusted input is encapsulated strictly inside a data payload; output is schema-validated and length-capped; clients must render it as text, never as HTML.
- **Latency & timeouts**: Responses are validated in full before display. The worst case is the air data call (5 s timeout) plus two 8-second provider timeouts, then the static plan.
- **Trade-off on precision**: Rejecting digits means the wording can't include times or amounts, which is accepted so the numbers can only come from the server. The wording is checked for shape, length and digits, not for consistency with the verdict. The verdict and actions come from the server and stay the source of truth.

## Run locally

### Server

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Copy the sample environment file and configure secrets:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### Client

1. Navigate to the client directory:
   ```bash
   cd client
   ```
2. Copy the sample environment file:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the client development server:
   ```bash
   npm run dev
   ```

## Environment variables

### Server (`server/.env`)

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `PORT` | HTTP port the server listens on | No | `8080` |
| `GEMINI_API_KEY` | API key for Google Gemini model services | Yes | - |
| `NVIDIA_API_KEY` | API key for NVIDIA API model services | Yes | - |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed URL origins for CORS | Yes | - |

### Client (`client/.env`)

| Variable | Description | Required | Default |
| --- | --- | --- | --- |
| `VITE_API_URL` | Base URL of the backend server API | No | `http://localhost:8080` |

## Decisions & trade-offs

- **Express 5 for native async errors**: Express 5 natively handles rejected promises in route handlers and middleware without requiring wrapping try/catch blocks or third-party async-handler helpers.
- **One AppError type with a code field instead of a class hierarchy**: A single `AppError` class with HTTP status, machine-readable `code`, and client message avoids deep class inheritance while standardizing the API error payload.
- **Zod for env/request/LLM-output validation**: Zod validates all configuration at process startup, failing early with explicit lists of all missing or invalid variables, and provides a unified schema framework for subsequent request and LLM-response validation.
- **No database in v1 - profile state stays in localStorage**: Eliminates operational overhead and external state dependencies for the initial baseline while keeping user profiles local, private, and immediately responsive.
- **Upstream bodies are zod-validated at the boundary and upstream errors are mapped to one 502 code**: External service boundaries are treated as untrusted; upstream schemas validate response structures immediately, and any network, timeout, or schema failure is mapped to a unified `UPSTREAM_ERROR` (502).
- **The server never forwards upstream text**: Internal upstream error messages, raw network traces, and third-party error bodies are never relayed to clients, preventing information disclosure.
- **Dedicated rate limit for /api/plan**: POST /api/plan has its own stricter rate limit (30 per 15 minutes per IP versus 100 for everything) because it is the endpoint that will call paid LLM APIs; both limits answer 429 in the standard error envelope.
- **Health check exempt from rate limiting**: /api/health is exempt from rate limiting because platform health checks and uptime monitors poll it and it calls no upstream; every other route shares the general limit.
- **Privacy for household profile data**: The household profile is personal data: it is validated strictly, never logged, never echoed back in error messages, and only held in the browser's localStorage.
