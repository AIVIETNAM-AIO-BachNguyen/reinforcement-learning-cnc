"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ChevronRight,
  FlaskConical,
  Info,
} from "lucide-react";

import { FactoryLiveView } from "@/components/operations/factory-live-view";
import { AppShell } from "@/components/app-shell";
import { operationsOverviewFixture } from "@/lib/operations-ui/fixtures";
import type { AttentionItem } from "@/types/operations-ui";

const statusLabels: Record<AttentionItem["status"], string> = {
  NEEDS_REVIEW: "Needs review",
  ANALYZING: "AI analyzing",
  MONITORING: "Monitoring",
};
const severityLabels: Record<AttentionItem["severity"], string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export function DashboardPage() {
  const overview = operationsOverviewFixture;
  const needsReview = overview.attentionItems.filter(
    (item) => item.status === "NEEDS_REVIEW",
  ).length;
  const snapshotLabel = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(overview.snapshotAt));

  return (
    <AppShell title="Operations overview">
      <main className="dss-page">
        <header className="overview-heading">
          <div>
            <h1>Operations overview</h1>
            <p>Machine health, maintenance priorities and the next decision.</p>
          </div>
          <Link href="/decisions" className="primary-action">
            Review recommendations <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </header>

        <div className="snapshot-notice">
          <Info size={16} aria-hidden="true" />
          <p>
            <strong>Demo workspace.</strong> Recorded sample data, not live
            telemetry.
          </p>
          <span>{overview.factoryId}</span>
        </div>

        <dl className="overview-metrics" aria-label="Factory snapshot">
          <div className="metric-review">
            <dt>Awaiting review</dt>
            <dd>
              {needsReview}
              <span>case needs a decision</span>
            </dd>
          </div>
          <div>
            <dt>Monitored machines</dt>
            <dd>
              {overview.monitoredMachines}
              <span>in the factory snapshot</span>
            </dd>
          </div>
          <div>
            <dt>Active AI runs</dt>
            <dd>
              {overview.activeAgentRuns}
              <span>gathering evidence</span>
            </dd>
          </div>
          <div>
            <dt>Maintenance windows</dt>
            <dd>
              {overview.upcomingWindows}
              <span>upcoming in the snapshot</span>
            </dd>
          </div>
        </dl>

        <div className="priority-brief">
          <span className="priority-marker" aria-hidden="true" />
          <div>
            <strong>M03 needs a maintenance review</strong>
            <p>
              {overview.attentionItems[0].risk}.{" "}
              {overview.attentionItems[0].impact}.
            </p>
          </div>
          <Link href="/decisions" className="text-action">
            Open Decision Center <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <FactoryLiveView />

        <section
          className="attention-section"
          aria-labelledby="attention-heading"
        >
          <div className="section-heading">
            <div>
              <h2 id="attention-heading">Attention queue</h2>
              <p>
                {overview.attentionItems.length} cases to review, analyze or
                monitor
              </p>
            </div>
            <Link href="/decisions" className="text-action">
              Open full queue <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <table className="attention-table">
            <thead>
              <tr>
                <th scope="col">Machine / case</th>
                <th scope="col">Priority & status</th>
                <th scope="col">Risk & impact</th>
                <th scope="col">Recommended next step</th>
                <th scope="col">
                  <span className="sr-only">Review</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.attentionItems.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <span className="queue-machine">{item.machineId}</span>
                    <span className="queue-case">{item.title}</span>
                  </th>
                  <td>
                    <span
                      className={`severity severity-${item.severity.toLowerCase()}`}
                    >
                      {severityLabels[item.severity]}
                    </span>
                    <span className="cell-secondary">
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td>
                    <span>{item.risk}</span>
                    <span className="cell-secondary">{item.impact}</span>
                  </td>
                  <td>{item.action}</td>
                  <td>
                    <Link
                      href="/decisions"
                      className="queue-open"
                      aria-label={`Open review queue for ${item.machineId}`}
                    >
                      <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section
          className="workspace-resources"
          aria-label="Evidence and planning tools"
        >
          <div>
            <h2>Evidence & planning</h2>
            <p>Understand the recommendation before making a decision.</p>
          </div>
          <Link href="/agents">
            <Bot size={22} aria-hidden="true" />
            <span>
              <strong>Inspect agent activity</strong>
              <span>Tool results, evidence and validation events</span>
            </span>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href="/what-if">
            <FlaskConical size={22} aria-hidden="true" />
            <span>
              <strong>Compare a scenario</strong>
              <span>Test assumptions in an isolated simulation</span>
            </span>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
        <footer className="overview-footer">
          <span>Snapshot recorded {snapshotLabel} UTC</span>
          <span>Human review required before operational approval</span>
        </footer>
      </main>
    </AppShell>
  );
}
