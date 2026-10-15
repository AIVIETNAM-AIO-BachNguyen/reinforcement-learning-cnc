"use client";

import Link from "next/link";
import { OperationsPanel, OperationsStatus } from "./operations-shell";
import { AsyncState } from "@/components/research/async-state";
import type { OperationsApiClient, OperationsCommitMetadata } from "@/lib/operations-api/client";
import { useDecisionCaseEvents } from "@/lib/operations-api/use-decision-case-events";
import { formatDateTime } from "@/lib/operations/format";

export function DecisionCaseAuditTimeline({ api, caseId, publication, refreshToken }: {
  api: OperationsApiClient; caseId: string; publication?: OperationsCommitMetadata | null; refreshToken?: string | number;
}) {
  const { state, refresh } = useDecisionCaseEvents({ api, caseId, refreshToken });
  return (
    <section id="decision-case-audit" className="min-w-0 scroll-mt-20">
      <OperationsPanel title="Audit timeline" description="Server-ordered event history. Sequence is not case revision; raw requests and notes are not exposed.">
        <div className="min-w-0 space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-xs text-[var(--color-ash-gray)]">{state.kind === "ready" ? `${state.events.length} events · ${state.pages.length} pages read${state.busy ? " · refreshing history" : " · complete read"}` : "Reading authoritative history"}</p><button type="button" onClick={refresh} disabled={state.busy} className="min-h-10 rounded-md border bg-white px-4 text-sm font-medium disabled:opacity-50">Refresh history</button></div>
          {state.kind === "loading" ? <AsyncState compact kind="loading" title="Loading audit history" description="Reading every event page before showing the timeline." /> : null}
          {state.kind !== "ready" && state.kind !== "loading" ? <AsyncState compact kind="error" title={state.kind === "unauthorized" ? "History access required" : "Audit history could not be loaded"} description={state.message} onRetry={refresh} action={state.kind === "unauthorized" ? <Link href="/login" className="min-h-10 rounded-md border bg-white px-4 py-2 text-sm font-medium">Sign in</Link> : undefined} /> : null}
          {state.kind === "ready" && !state.events.length ? <AsyncState compact kind="empty" title="No audit events" description="The Events API returned an empty history. No events are inferred from the case status." /> : null}
          {state.kind === "ready" && state.events.length ? <ol aria-label="Decision case audit events" className="min-w-0 space-y-3">{state.events.map(event => <li key={event.id} data-sequence={event.sequence} className="min-w-0 rounded-lg border border-[var(--color-stone-border)] bg-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-all text-sm font-semibold">#{event.sequence} · {event.type}</h3>{event.payload.command ? <OperationsStatus value={event.payload.command} /> : null}</div>
            <p className="mt-2 break-words text-xs text-[var(--color-ash-gray)] [overflow-wrap:anywhere]">{event.actor.kind} · {event.actor.id} · <time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time></p>
            <dl className="mt-3 grid min-w-0 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-[var(--color-ash-gray)]">Transition</dt><dd className="mt-1 break-all">{event.payload.from_status && event.payload.to_status ? `${event.payload.from_status} → ${event.payload.to_status}` : event.payload.status ?? "Not provided"}</dd></div>
              <div><dt className="text-[var(--color-ash-gray)]">Candidate / version</dt><dd className="mt-1 break-all font-mono">{event.payload.candidate_plan_id ?? "Not provided"} · {event.payload.candidate_version ?? "Not provided"}</dd></div>
              <div><dt className="text-[var(--color-ash-gray)]">Head plan version / case revision</dt><dd className="mt-1">{event.payload.plan_version ?? "Not provided"} / {event.payload.revision ?? "Not provided"}</dd></div>
              {event.payload.recommendation_id ? <div><dt className="text-[var(--color-ash-gray)]">Recommendation</dt><dd className="mt-1 break-all font-mono">{event.payload.recommendation_id}</dd></div> : null}
              {event.payload.candidate_hash ? <div><dt className="text-[var(--color-ash-gray)]">Candidate hash</dt><dd className="mt-1 break-all font-mono">{event.payload.candidate_hash}</dd></div> : null}
              {event.payload.schedule_hash ? <div><dt className="text-[var(--color-ash-gray)]">Schedule hash</dt><dd className="mt-1 break-all font-mono">{event.payload.schedule_hash}</dd></div> : null}
            </dl>
          </li>)}</ol> : null}
          {state.kind === "ready" && publication?.decision_case_id === caseId ? <aside aria-label="Authoritative case publication" className="min-w-0 rounded-md border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 [overflow-wrap:anywhere]"><p className="font-semibold">Publication metadata from case detail</p><p className="mt-2">Schedule {publication.schedule_id} · revision {publication.schedule_revision} · published plan version {publication.plan_version}</p><p className="mt-1">Snapshot {publication.snapshot_id}</p><p className="mt-1">Committed by {publication.actor_id} · {formatDateTime(publication.committed_at)}</p></aside> : null}
        </div>
      </OperationsPanel>
    </section>
  );
}
