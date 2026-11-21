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
