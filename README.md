# Urban Air Quality Assistant

## Live demo

- Client application: https://airqualityassistant-app.onrender.com
- Backend server API: https://airqualityassistant.onrender.com

The backend server runs on Render's free tier and sleeps after about 15 minutes idle. A cold start was measured at 12.8 s, and the client displays "Waking the server, this can take up to 15 seconds." after 2 s.

## What this is

Urban Air Quality Assistant is a GenAI application designed to help families and communities navigate winter smog conditions. It provides tailored guidance on low-emission daily routines, indoor air quality practices, and sustainable alternatives suited to local contexts. Each recommendation transparently explains the direct environmental and health impacts of individual choices.

## Architecture

The project is structured as a two-tier monorepo with self-contained `client/` and `server/` packages:

```
/
  .gitignore
  README.md
  render.yaml
  .github/workflows/ci.yml
  client/   (Vite + React + TypeScript)
  server/   (Express 5 + TypeScript)
```

The application separates the frontend and backend into two decoupled tiers. The static client is served separately from the API, so the page loads while the free-tier server wakes; the client shows a waking message meanwhile.

## Client

- Built with React, TypeScript, and Vite.
- Profile data is stored in `localStorage` only (no login, no database).
- Family and community are separate flows; the community flow asks for a household count, multiplies only the commute impact by it, and always uses the sensitive-profile verdict thresholds.
- Printable through a dedicated print stylesheet (no PDF library).
- Accessibility features include a skip link and focus moves to the plan when it appears.
- The client validates the server response with zod and shows an error instead of rendering malformed data.

## Data sources

The application integrates with Open-Meteo for location search and live environmental metrics:
- **Open-Meteo Geocoding API**: Resolves location queries into geographic coordinates with administrative regions.
- **Open-Meteo Air Quality API**: Supplies atmospheric pollutant readings (`pm2_5`, `pm10`, and `us_aqi`). Air quality data is modelled data on a coarse grid (Copernicus Atmosphere Monitoring Service - CAMS via Open-Meteo), not street-level sensor readings. The `us_aqi` value is Open-Meteo's computation of the US EPA Air Quality Index based on standard EPA AQI category definitions.
- **Attribution**: Air quality and weather data by [Open-Meteo.com](https://open-meteo.com) (licensed under CC BY 4.0).

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
- **Provider order & fallback**: Calls try Gemini (`gemini-3.1-flash-lite`) first, then fall back to NVIDIA (`nvidia/nemotron-3.5-lightning-30b-a3b`). If both providers fail or return unusable text, the server returns the static plan at HTTP 200. Model IDs are constants at the top of `llm.ts`. Providers retire models (one returned HTTP 410 during development), and the static plan is what keeps the app working when that happens.
- **Model selection**: Several larger Gemini models returned capacity errors or timeouts when measured, so the primary is the lite model that answered reliably. The NVIDIA model reasons by default, so thinking is switched off in the request.
- **Privacy by design**: Only the location name, household composition (member counts, or the number of households), commute mode, heating and cooking type, whether a sensitive member is present, the air quality band label, the verdict level and the titles of the plan's actions are sent. Coordinates are never sent. The profile is never logged.
- **Prompt injection defence**: Untrusted input is encapsulated strictly inside a data payload; output is schema-validated and length-capped; clients must render it as text, never as HTML.
- **Latency & timeouts**: Responses are validated in full before display. The worst case is the air data call (5 s timeout) plus two 8-second provider timeouts, then the static plan.
- **Trade-off on precision**: Rejecting digits means the wording can't include times or amounts, which is accepted so the numbers can only come from the server. The wording is checked for shape, length and digits, not for consistency with the verdict. The verdict and actions come from the server and stay the source of truth. Known limits: the wording is not checked against the plan or the household's real situation. In live testing some outputs advised keeping windows closed while cooking on gas, some suggested opening windows when the air was very unhealthy, and community wording read like household wording.

## Design decisions and trade-offs

- **The LLM never emits a number**: The server attaches a deterministic Impact computed from sourced coefficients; heating and cooking swaps show "Not quantified." Cost: fewer headline numbers.
- **Fallback chain Gemini, then NVIDIA, then a static plan returned with HTTP 200, so the user always gets a plan**: If live APIs fail, the user is never left without guidance. Cost: worst-case latency of about 21 s (5 s air data plus two 8 s provider timeouts).
- **Model choice was made by probing the live APIs, not from docs**: Several reasoning models returned empty content or timed out, and the NVIDIA call disables thinking with chat_template_kwargs. Tests mock providers and never call real APIs, so that failure class is covered only by the manual probes.
- **No database or login**: Simpler and private (the profile is never logged). Cost: no share link and no cross-device profile.
- **Air data is Open-Meteo modelled coarse-grid data, not a street-level sensor**: Open-Meteo CAMS data provides global reach without dedicated station infrastructure. Cost: coarse-grid data does not capture street-level or localized microclimate variations.
- **The client re-declares the plan and profile schemas instead of sharing a package between client and server**: No workspace tooling in a two-package repo. Cost: the two copies can drift; the response parse in the client turns drift into a visible error.
- **Express 5 for native async errors**: Express 5 natively handles rejected promises in route handlers and middleware without requiring wrapping try/catch blocks or third-party async-handler helpers.
- **One AppError type with a code field instead of a class hierarchy**: A single `AppError` class with HTTP status, machine-readable `code`, and client message avoids deep class inheritance while standardizing the API error payload.
- **Zod for env/request/LLM-output validation**: Zod validates all configuration at process startup, failing early with explicit lists of all missing or invalid variables, and provides a unified schema framework for subsequent request and LLM-response validation.
- **Upstream bodies are zod-validated at the boundary and upstream errors are mapped to one 502 code**: External service boundaries are treated as untrusted; upstream schemas validate response structures immediately, and any network, timeout, or schema failure is mapped to a unified `UPSTREAM_ERROR` (502).
- **The server never forwards upstream text**: Internal upstream error messages, raw network traces, and third-party error bodies are never relayed to clients, preventing information disclosure.
- **Dedicated rate limit for /api/plan**: POST /api/plan has its own stricter rate limit (30 per 15 minutes per IP versus 100 for everything) because it is the endpoint that will call paid LLM APIs; both limits answer 429 in the standard error envelope.
- **Health check exempt from rate limiting**: /api/health is exempt from rate limiting because platform health checks and uptime monitors poll it and it calls no upstream; every other route shares the general limit.
- **HTTP caching headers scoped by route and success status**: Successful GET /api/geocode responses carry Cache-Control public, max-age=3600; GET /api/air carries public, max-age=300; and POST /api/plan carries no-store. Headers are set only on success paths so errors are never cached by a browser or proxy. Hashed files under /assets/ are served with a one-year immutable header from render.yaml. Why: place names change rarely, upstream air data updates hourly, plans are personalised and LLM-written so they must never be stored. Cost: browser caches hold air responses for five minutes even if local conditions change quickly.
- **In-memory TTL cache for upstream lookups**: Geocode lookups are cached for one hour and air lookups for five minutes in a small Map-backed cache with a 500-entry cap per cache; at the cap the oldest inserted entry is evicted (insertion order, not true LRU). Only successful upstream responses are cached, so an Open-Meteo failure is retried on the next request. Plans are not cached. Trade-offs: the cache lives in one process, so it is empty after a restart or a free-tier sleep and is not shared between instances; this is acceptable at this scale and avoids adding Redis.
- **Privacy for household profile data**: The household profile is personal data: it is validated strictly, never logged, never echoed back in error messages, and only held in the browser's localStorage.
- **Hand-written service worker for offline shell availability**: A hand-written client/public/sw.js is registered only in the production build. Navigations are network-first with the cached shell as the offline fallback; hashed /assets/ files are cache-first; only same-origin GET requests are handled, so /api calls are never served from the worker and air data cannot go stale through it. Trade-offs: old hashed assets stay in the cache until the CACHE name is bumped; the cache write is not wrapped in event.waitUntil, so a worker killed mid-write can skip caching that one response; offline, the shell loads but plan requests fail; icons are a single SVG, which some browsers may not accept for an install prompt.
- **Accessible form validation and live search announcements**: Invalid fields get aria-invalid and aria-describedby pointing at the form alert; focus moves to the first invalid field after a failed submit; the alert lists human-readable field labels read from the DOM, and editing any field clears both the alert and the invalid state; the search-results count is announced through an aria-live region that is always in the DOM, because a live region added at the same moment as its text is often not announced. Why: states a screen-reader user cannot otherwise perceive. Cost: requires component label queries and form IDs to remain aligned.

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

The server's `ALLOWED_ORIGINS` must include the Vite dev origin (e.g. `http://localhost:5173`) or the browser will block requests.

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

The client reaches the server in development via `VITE_API_URL` configured in `client/.env`. The client Vite configuration does not include a reverse proxy.

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
| `VITE_API_URL` | Base URL of the server API; if unset, requests go to the page's own origin, which does not reach the server in dev because there is no Vite proxy (e.g. `http://localhost:8080`) | Yes for local dev and for any deploy | none |

## Deploy

- **Server**: Configured as a Render Web Service in the Render dashboard:
  - Root Directory: `server`
  - Build Command: `npm ci --include=dev && npm run build`
  - Start Command: `npm start`
  - Health Check Path: `/api/health`
  - Environment variables (`GEMINI_API_KEY`, `NVIDIA_API_KEY`, `ALLOWED_ORIGINS`) are set in the Render dashboard only. `ALLOWED_ORIGINS` on the server must equal the client's exact origin (no trailing slash or path), e.g. https://airqualityassistant-app.onrender.com.
  - The free server tier sleeps after about 15 minutes idle and a cold start was measured at about 13 seconds; an external uptime monitor pinging GET /api/health every 5 minutes keeps it warm, and it is configured outside this repository.
- **Client**: Configured as a Render Static Site declared in `render.yaml`:
  - Root Directory: `client`
  - Build Command: `npm ci && npm run build`
  - Static Publish Path: `dist`
  - Environment variable `VITE_API_URL` points to https://airqualityassistant.onrender.com (set in the dashboard).
  - Security headers are declared in `render.yaml` with Content-Security-Policy, where `connect-src` must list the server origin https://airqualityassistant.onrender.com, alongside `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `X-Frame-Options: DENY`.
