import { useEffect, useState } from "react";
import { getHealth } from "./api";

export function App() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatusMessage("Waking the server, this can take up to 15 seconds.");
    }, 2000);

    getHealth(controller.signal)
      .then(() => {
        clearTimeout(timer);
        setStatusMessage(null);
      })
      .catch(() => {
        clearTimeout(timer);
        if (!controller.signal.aborted) {
          setStatusMessage("The server could not be reached.");
        }
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <div>
      <header>
        <h1>Urban Air Quality Assistant</h1>
      </header>
      <main>
        {statusMessage ? <p role="status">{statusMessage}</p> : null}
      </main>
    </div>
  );
}
