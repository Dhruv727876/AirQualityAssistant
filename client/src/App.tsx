import { useEffect, useState } from "react";
import { apiFetch } from "./api";

interface HealthResponse {
  status: string;
  uptimeSeconds: number;
}

type Status = "pending" | "ready" | "error";

export function App() {
  const [status, setStatus] = useState<Status>("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<HealthResponse>("/api/health")
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus("error");
          const message = error instanceof Error ? error.message : "Failed to connect to server";
          setErrorMessage(message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <header>
        <h1>Urban Air Quality Assistant</h1>
      </header>
      <main>
        {status === "pending" && (
          <p role="status" aria-live="polite">
            Connecting to server…
          </p>
        )}
        {status === "ready" && <p>Server ready</p>}
        {status === "error" && (
          <p role="alert">
            {errorMessage ? `Error: ${errorMessage}` : "Failed to connect to server"}
          </p>
        )}
      </main>
    </div>
  );
}

