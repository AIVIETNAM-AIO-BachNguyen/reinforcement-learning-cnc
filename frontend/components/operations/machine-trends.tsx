import { ArrowUpRight } from "lucide-react";
import { factoryReplayMachines } from "@/lib/operations-ui/factory-replay";

export function MachineTrends({
  onInspect,
}: {
  onInspect: (id: string) => void;
}) {
  const points = (values: readonly number[]) =>
    values
      .map((value, index) => `${5 + index * 50},${80 - value * 0.7}`)
      .join(" ");
  return (
    <section
      className="machine-trends"
      aria-labelledby="machine-trends-heading"
    >
      <div className="trend-section-heading">
        <h2 id="machine-trends-heading">Health & load trends</h2>
        <p>Six recorded samples · 8h · Select a machine for evidence</p>
        <span className="trend-legend">
          <span>— Health</span>
          <span>┄ Load</span>
        </span>
      </div>
      <div className="trend-grid">
        {factoryReplayMachines.map((machine) => {
          const change = machine.health - machine.healthSamples[0];
          return (
            <button
              key={machine.id}
              type="button"
              className={`trend-machine ${machine.status === "RISK" ? "trend-at-risk" : ""}`}
              onClick={() => onInspect(machine.id)}
              aria-label={`Inspect trend evidence for ${machine.id}`}
            >
              <span className="trend-machine-heading">
                <strong>
                  {machine.id} <span>{machine.name}</span>
                </strong>
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
              <span className="trend-machine-metric">
                <strong>{machine.health}%</strong>
                <span>
                  health{" "}
                  <span className="numeric">
                    {change > 0 ? "+" : ""}
                    {change} pp
                  </span>{" "}
                  vs first sample
                </span>
              </span>
              <span className="trend-chart">
                <span className="trend-y-axis" aria-hidden="true">
                  <span>100%</span>
                  <span>0%</span>
                </span>
                <svg
                  viewBox="0 0 260 90"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${machine.id} health from ${machine.healthSamples[0]}% to ${machine.health}%; load from ${machine.loadSamples[0]}% to ${machine.load}% over 8 hours`}
                >
                  <path d="M5 10H255M5 80H255" className="trend-guide" />
                  <polyline
                    points={points(machine.healthSamples)}
                    className="trend-health-line"
                  />
                  <polyline
                    points={points(machine.loadSamples)}
                    className="trend-load-line"
                  />
                </svg>
              </span>
              <span className="trend-x-axis" aria-hidden="true">
                <span>00:00</span>
                <span>08:00</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
