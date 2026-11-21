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

The WHO ratio is the PM2.5 reading divided by 15 µg/m³, the 24-hour mean guideline from "WHO global air quality guidelines, 2021" (basis: standard). The guideline is a 24-hour mean while the app compares it to a single hourly reading, so the ratio is indicative only.

Heating and cooking fuel swaps are not quantified in this model. All figures are estimates, not medical advice.

The three physical constants used in the indoor air purifier model (ceiling height of 2.5 m, natural room air change rate of 0.5 per hour, and particle deposition rate of 0.2 per hour) are rough estimates with no source.

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
