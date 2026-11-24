import type { Plan } from "./api";

interface PlanViewProps {
  plan: Plan;
}

function formatHour(time: string, baseTime: string): string {
  const day = time.slice(0, 10) === baseTime.slice(0, 10) ? "today" : "tomorrow";
  const clock = time.slice(11, 16);
  return `${day} at ${clock}`;
}

export function PlanView({ plan }: PlanViewProps) {
  const aqiText =
    plan.air.usAqi !== null && plan.air.band
      ? `${plan.air.usAqi} (${plan.air.band.label})`
      : "Not available";

  const whoText =
    plan.air.whoRatio !== null
      ? `${plan.air.whoRatio.toFixed(1)}× the WHO 24-hour guideline`
      : "Not available";

  return (
    <article className="plan-view">
      <header>
        <h2>{plan.verdict.headline}</h2>
        {plan.verdict.note && <p>{plan.verdict.note}</p>}
      </header>

      <section className="plan-air">
        <p>
          Air quality: AQI {aqiText}, PM2.5 {whoText}
        </p>
        {plan.hours && (
          <div className="plan-hours">
            <p>
              Best hour: {formatHour(plan.hours.best.time, plan.air.time)}, PM2.5 {plan.hours.best.pm25} µg/m³
            </p>
            <p>
              Worst hour: {formatHour(plan.hours.worst.time, plan.air.time)}, PM2.5 {plan.hours.worst.pm25} µg/m³
            </p>
          </div>
        )}
      </section>

      {plan.narrative && (
        <section className="plan-narrative">
          {plan.generatedBy === "gemini" && <p>Wording by Gemini</p>}
          {plan.generatedBy === "nvidia" && <p>Wording by NVIDIA</p>}
          <p>{plan.narrative.summary}</p>
          <div>
            <h3>Daily routine</h3>
            {plan.narrative.routine.map((item, idx) => (
              <div key={idx}>
                <strong>{item.period}: </strong>
                <span>{item.advice}</span>
              </div>
            ))}
          </div>
          <div>
            <h3>Tips</h3>
            {plan.narrative.tips.map((tip, idx) => (
              <div key={idx}>
                <strong>{tip.title}</strong>
                <p>{tip.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="plan-actions">
        <h3>Recommended actions</h3>
        {plan.actions.map((action) => (
          <div key={action.id} className="plan-action">
            <h4>{action.title}</h4>
            <p>{action.detail}</p>
            <p>Because: {action.because}</p>
            {action.impact ? (
              <div className="plan-impact">
                <p>
                  Impact: {action.impact.value} {action.impact.unit} ({action.impact.basis})
                  {action.impact.source ? ` — ${action.impact.source}` : ""}
                </p>
                {action.impact.assumptions.length > 0 && (
                  <details>
                    <summary>Assumptions</summary>
                    <ul>
                      {action.impact.assumptions.map((assumption, idx) => (
                        <li key={idx}>{assumption}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ) : (
              <p>Impact: Not quantified.</p>
            )}
          </div>
        ))}
      </section>

      <footer>
        <p className="plan-disclaimer">{plan.disclaimer}</p>
        <p>
          Air data:{" "}
          <a
            href="https://open-meteo.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open-Meteo.com
          </a>
        </p>
      </footer>
    </article>
  );
}
