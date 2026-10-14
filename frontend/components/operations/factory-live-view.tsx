"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

import { operationsOverviewFixture } from "@/lib/operations-ui/fixtures";
import {
  factoryReplayMachines,
  factoryReplaySampleTimes,
  factoryReplayStages,
} from "@/lib/operations-ui/factory-replay";

type MachineStatus = "OPERATING" | "RISK" | "MAINTENANCE";
const statusLabels: Record<MachineStatus, string> = {
  OPERATING: "Operating",
  RISK: "Needs attention",
  MAINTENANCE: "Under maintenance",
};

function MachineDrawing() {
  return (
    <svg viewBox="0 0 180 110" className="machine-drawing" aria-hidden="true">
      <path d="M24 24 50 10 157 10 133 24Z" fill="var(--machine-top)" />
      <path d="M133 24 157 10 157 89 133 104Z" fill="var(--machine-side)" />
      <rect
        x="24"
        y="24"
        width="109"
        height="80"
        rx="3"
        fill="var(--machine-front)"
      />
      <rect
        x="34"
        y="34"
        width="67"
        height="57"
        rx="2"
        fill="var(--machine-window)"
      />
      <path
        d="M67 36v24m-7 0h14l-4 12h-6Z"
        fill="none"
        stroke="var(--machine-tool)"
        strokeWidth="5"
      />
      <path d="M44 81h49" stroke="var(--machine-tool)" strokeWidth="6" />
      <rect
        x="108"
        y="37"
        width="16"
        height="14"
        rx="1"
        fill="var(--machine-screen)"
      />
      <path
        d="M110 43h4l2-3 3 6 3-3"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
      />
      <circle cx="111" cy="59" r="2" fill="var(--machine-screen)" />
      <circle cx="121" cy="59" r="2" fill="var(--machine-tool)" />
      <path d="M27 106h104" stroke="var(--machine-side)" strokeWidth="4" />
    </svg>
  );
}

export function FactoryLiveView() {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedMachine, setSelectedMachine] = useState<string>("M03");
  const [sample, setSample] = useState(5);
  const stage = factoryReplayStages[step];
  const maintenanceStarted = step === 2;
  const activeMachine =
    factoryReplayMachines.find((machine) => machine.id === selectedMachine) ??
    factoryReplayMachines[2];
  const activeStatus: MachineStatus =
    activeMachine.id === "M03" && maintenanceStarted
      ? "MAINTENANCE"
      : activeMachine.status;
  const attention = operationsOverviewFixture.attentionItems.find(
    (item) => item.machineId === selectedMachine,
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      setStep((current) =>
        Math.min(current + 1, factoryReplayStages.length - 1),
      );
      if (step >= factoryReplayStages.length - 2) setPlaying(false);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  const selectMachine = (id: string) => {
    setSelectedMachine(id);
    setSample(5);
  };
  const points = (values: readonly number[]) =>
    values.map((value, index) => `${16 + index * 60},${108 - value}`).join(" ");

  return (
    <section
      className="factory-workspace"
      aria-labelledby="factory-live-heading"
    >
      <div className="factory-toolbar">
        <div>
          <h2 id="factory-live-heading">Factory floor</h2>
          <p>3 demo cells shown · Select a machine to inspect</p>
        </div>
        <div className="replay-controls">
          <span className="replay-clock">
            Demo replay <strong>{stage.time}</strong>
          </span>
          <button
            type="button"
            className="control-button"
            aria-label={playing ? "Pause simulation" : "Play simulation"}
            onClick={() => {
              if (step === 2) setStep(0);
              setPlaying((current) => !current);
            }}
          >
            {playing ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {playing ? "Pause" : step === 2 ? "Replay" : "Play"}
          </button>
          <button
            type="button"
            className="control-button icon-control"
            aria-label="Advance simulation"
            title="Advance simulation"
            disabled={step === 2}
            onClick={() => {
              setPlaying(false);
              setStep((current) => Math.min(current + 1, 2));
            }}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="control-button icon-control"
            aria-label="Reset simulation"
            title="Reset simulation"
            onClick={() => {
              setStep(0);
              setPlaying(false);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="factory-content">
        <div className="factory-floor">
          <div className="factory-map">
            <div className="floor-label">
              <span>Production cells</span>
              <span>Demo layout</span>
            </div>
            <div className="machine-cells">
              {factoryReplayMachines.map((machine) => {
                const status: MachineStatus =
                  machine.id === "M03" && maintenanceStarted
                    ? "MAINTENANCE"
                    : machine.status;
                return (
                  <button
                    key={machine.id}
                    type="button"
                    className={`machine-cell machine-${status.toLowerCase()} ${machine.id === selectedMachine ? "is-selected" : ""}`}
                    aria-label={`Inspect ${machine.id} ${machine.name}`}
                    aria-pressed={machine.id === selectedMachine}
                    onClick={() => selectMachine(machine.id)}
                  >
                    <span className="machine-cell-top">
                      <span className="machine-id">{machine.id}</span>
                      <span
                        className={`status-dot status-${status.toLowerCase()}`}
                      />
                    </span>
                    <MachineDrawing />
                    <strong>{machine.name}</strong>
                    <span className="machine-status">
                      {statusLabels[status]}
                    </span>
                    <span className="machine-load">
                      <span>Load</span>
                      <strong>{machine.load}%</strong>
                    </span>
                    <span className="machine-load-track">
                      <span style={{ width: `${machine.load}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="service-lane">
              <span className="service-lane-line" />
              {step > 0 ? (
                <span className="dispatch-label">
                  <Wrench size={15} aria-hidden="true" />
                  T02 → M03{" "}
                  <span>
                    {maintenanceStarted ? "In service" : "Dispatched"}
                  </span>
                </span>
              ) : (
                <span className="dispatch-label">
                  <Wrench size={15} aria-hidden="true" />
                  Service aisle
                </span>
              )}
            </div>
            <div className="technician-bay">
              <div>
                <strong>Technician bay</strong>
                <span>
                  {step > 0 ? "2 available · 1 assigned" : "3 available"}
                </span>
              </div>
              <div className="technician-crew">
                {["T01", "T02", "T03"].map((id) => (
                  <span
                    key={id}
                    className={`technician ${id === "T02" && step > 0 ? "technician-assigned" : ""}`}
                  >
                    <UserRound size={17} aria-hidden="true" />
                    <strong>{id}</strong>
                    <span>{id === "T02" ? stage.technician : "Available"}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="replay-event" aria-live="polite">
            <span className="event-time">{stage.time}</span>
            <div>
              <strong>{stage.title}</strong>
              <p>{stage.description}</p>
            </div>
            <span>
              {step + 1} / {factoryReplayStages.length}
            </span>
          </div>
        </div>
        <aside
          className="machine-inspector"
          aria-label="Selected machine details"
        >
          <div className="inspector-title">
            <h3>
              {activeMachine.id} · {activeMachine.name}
            </h3>
            <span
              className={`machine-state state-${activeStatus.toLowerCase()}`}
            >
              <span
                className={`status-dot status-${activeStatus.toLowerCase()}`}
              />
              {statusLabels[activeStatus]}
            </span>
          </div>
          <div
            className={`machine-recommendation ${activeMachine.id === "M03" ? "recommendation-urgent" : ""}`}
          >
            <strong>{attention?.title ?? "Stable production"}</strong>
            <p>{attention?.action ?? "Continue monitoring the machine."}</p>
            {attention && <span>{attention.impact}</span>}
          </div>
          <dl className="machine-signals">
            <div>
              <dt>Failure risk</dt>
              <dd>{attention?.risk ?? "Not reported"}</dd>
            </div>
            <div>
              <dt>Demo health</dt>
              <dd>{activeMachine.health}%</dd>
            </div>
            <div>
              <dt>Current load</dt>
              <dd>{activeMachine.load}%</dd>
            </div>
            <div>
              <dt>Technician in replay</dt>
              <dd>
                {activeMachine.id === "M03" && step > 0
                  ? `T02 · ${maintenanceStarted ? "In service" : "Dispatched"}`
                  : "None assigned"}
              </dd>
            </div>
          </dl>
          <div className="machine-trend">
            <div className="trend-heading">
              <h4>Health & load</h4>
              <span>Demo samples · 8h</span>
            </div>
            <svg
              viewBox="0 0 332 116"
              role="img"
              aria-label={`Demo health and load samples for ${activeMachine.id}`}
            >
              <polyline
                points={points(activeMachine.healthSamples)}
                fill="none"
                stroke="var(--trend-health)"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <polyline
                points={points(activeMachine.loadSamples)}
                fill="none"
                stroke="var(--trend-load)"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {activeMachine.healthSamples.map((value, index) => (
                <circle
                  key={index}
                  cx={16 + index * 60}
                  cy={108 - value}
                  r={sample === index ? 5 : 3}
                  fill="var(--trend-health)"
                />
              ))}
              {activeMachine.loadSamples.map((value, index) => (
                <circle
                  key={index}
                  cx={16 + index * 60}
                  cy={108 - value}
                  r={sample === index ? 5 : 3}
                  fill="var(--trend-load)"
                />
              ))}
            </svg>
            <div className="trend-times" aria-label="Inspect demo trend sample">
              {factoryReplaySampleTimes.map((time, index) => (
                <button
                  type="button"
                  key={time}
                  aria-pressed={sample === index}
                  onClick={() => setSample(index)}
                >
                  {time}
                </button>
              ))}
            </div>
            <p className="trend-readout">
              <span>{factoryReplaySampleTimes[sample]}</span>
              <span className="trend-health">
                Health <strong>{activeMachine.healthSamples[sample]}%</strong>
              </span>
              <span className="trend-load">
                Load <strong>{activeMachine.loadSamples[sample]}%</strong>
              </span>
            </p>
          </div>
          {attention && (
            <p className="machine-evidence">
              Evidence <span>{attention.evidence}</span>
            </p>
          )}
          <Link href="/decisions" className="inspector-action">
            Open review queue <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </section>
  );
}
