import { useEffect, useState, useRef } from "react";
import { getHealth, createPlan, ApiError, type Plan } from "./api";
import { saveProfile, loadProfile, type Profile } from "./profile";
import { ProfileForm } from "./ProfileForm";
import { PlanView } from "./PlanView";

type RequestState =
  | { status: "idle" }
  | { status: "loading"; slow: boolean }
  | { status: "error"; message: string };

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "NETWORK") {
      return "The server could not be reached.";
    }
    if (err.code === "RATE_LIMITED") {
      return "Too many requests. Wait a minute and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

export function App() {
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  const [mode, setMode] = useState<"family" | "community" | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({ status: "idle" });
  const [lastProfile, setLastProfile] = useState<Profile | null>(() => loadProfile());

  const planControllerRef = useRef<AbortController | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const planRegionRef = useRef<HTMLDivElement | null>(null);

  const cancelPending = () => {
    planControllerRef.current?.abort();
    clearTimeout(loadingTimerRef.current);
  };

  useEffect(() => {
    if (plan) {
      planRegionRef.current?.focus();
    }
  }, [plan]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setServerStatus("Waking the server, this can take up to 15 seconds.");
    }, 2000);

    getHealth(controller.signal)
      .then(() => {
        clearTimeout(timer);
        setServerStatus(null);
      })
      .catch(() => {
        clearTimeout(timer);
        if (!controller.signal.aborted) {
          setServerStatus("The server could not be reached.");
        }
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelPending();
    };
  }, []);

  const handlePlanSubmit = (profile: Profile) => {
    saveProfile(profile);
    setLastProfile(profile);

    cancelPending();
    const controller = new AbortController();
    planControllerRef.current = controller;

    setRequestState({ status: "loading", slow: false });

    loadingTimerRef.current = setTimeout(() => {
      setRequestState({ status: "loading", slow: true });
    }, 8000);

    createPlan(profile, controller.signal)
      .then((createdPlan) => {
        if (!controller.signal.aborted) {
          clearTimeout(loadingTimerRef.current);
          setPlan(createdPlan);
          setRequestState({ status: "idle" });
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          clearTimeout(loadingTimerRef.current);
          setRequestState({ status: "error", message: messageFor(err) });
        }
      });
  };

  const handleStartOver = () => {
    cancelPending();
    setPlan(null);
    setMode(null);
    setRequestState({ status: "idle" });
  };

  return (
    <div>
      <a href="#main" className="skip-link no-print">
        Skip to main content
      </a>
      <header>
        <h1>Urban Air Quality Assistant</h1>
      </header>
      <main id="main">
        {serverStatus && <p role="status" className="no-print">{serverStatus}</p>}

        {plan ? (
          <div
            ref={planRegionRef}
            role="region"
            aria-label="Your air quality plan"
            tabIndex={-1}
          >
            <p className="print-only print-title">
              {lastProfile ? `Clean Air Plan for ${lastProfile.location.name}` : "Clean Air Plan"}
            </p>
            <PlanView plan={plan} />
            <button type="button" className="no-print" onClick={handleStartOver}>
              Start over
            </button>
            <button type="button" className="no-print" onClick={() => window.print()}>
              Print plan
            </button>
          </div>
        ) : mode ? (
          <div>
            <ProfileForm
              mode={mode}
              initial={lastProfile}
              onSubmit={handlePlanSubmit}
              submitting={requestState.status === "loading"}
            />
            {requestState.status === "loading" && (
              <p role="status">
                Building your plan…
                {requestState.slow && " Still working. The wording step can take up to 20 seconds."}
              </p>
            )}
            {requestState.status === "error" && (
              <p role="alert">{requestState.message}</p>
            )}
          </div>
        ) : (
          <div className="start-screen">
            <button type="button" onClick={() => setMode("family")}>
              Plan for my family
            </button>
            <button type="button" onClick={() => setMode("community")}>
              Plan for my community
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
