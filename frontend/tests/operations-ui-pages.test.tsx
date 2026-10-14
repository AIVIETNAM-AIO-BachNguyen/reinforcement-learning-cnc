import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AgentControlRoomPage } from "@/components/pages/agent-control-room-page";
import { DashboardPage } from "@/components/pages/dashboard-page";
import { FactoryLiveView } from "@/components/operations/factory-live-view";
import { WhatIfWorkspacePage } from "@/components/pages/what-if-workspace-page";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("operations UI ports", () => {
  it("opens with an operational attention queue and links to review workflows", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Operations overview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Attention queue" }),
    ).toBeInTheDocument();
    const queue = screen.getByRole("table");
    expect(within(queue).getByText("M03")).toBeInTheDocument();
    expect(
      within(queue).getByText("71% failure probability"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Recorded sample data, not live telemetry/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open full queue/i }),
    ).toHaveAttribute("href", "/decisions");
  });

  it("updates machine evidence and exact demo samples when selecting a cell", async () => {
    const user = userEvent.setup();
    render(<FactoryLiveView />);
    const details = screen.getByLabelText("Selected machine details");
    expect(within(details).getByText("risk-M03-t120")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "00:00" }));
    expect(within(details).getByText("88%")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Inspect M01 Milling cell" }),
    );
    expect(
      within(details).getByRole("heading", { name: "M01 · Milling cell" }),
    ).toBeInTheDocument();
    expect(within(details).getByText("Not reported")).toBeInTheDocument();
    expect(
      within(details).queryByText("risk-M03-t120"),
    ).not.toBeInTheDocument();
    expect(
      within(details).getByRole("link", { name: "Open review queue" }),
    ).toHaveAttribute("href", "/decisions");
  });

  it("steps and resets demo dispatch without claiming maintenance completed or changing health", async () => {
    const user = userEvent.setup();
    render(<FactoryLiveView />);
    expect(
      screen.getByRole("button", { name: "Play simulation" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Advance simulation" }),
    );
    expect(screen.getByText("Technician dispatched")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Advance simulation" }),
    );
    expect(screen.getByText("Service started")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Advance simulation" }),
    ).toBeDisabled();
    expect(
      within(screen.getByLabelText("Selected machine details")).getAllByText(
        "62%",
      ),
    ).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Reset simulation" }));
    expect(screen.getByText("Risk detected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Advance simulation" }),
    ).toBeEnabled();
    expect(screen.getByText("None assigned")).toBeInTheDocument();
  });

  it("pauses autoplay and stops at the last replay state", () => {
    vi.useFakeTimers();
    try {
      const view = render(<FactoryLiveView />);
      fireEvent.click(screen.getByRole("button", { name: "Play simulation" }));
      act(() => {
        vi.advanceTimersByTime(2800);
      });
      expect(screen.getByText("Technician dispatched")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Pause simulation" }));
      act(() => {
        vi.advanceTimersByTime(5600);
      });
      expect(screen.getByText("Technician dispatched")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Play simulation" }));
      act(() => {
        vi.advanceTimersByTime(2800);
      });
      expect(screen.getByText("Service started")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Play simulation" }),
      ).toHaveTextContent("Replay");
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders v3 agent runs and inspects an authoritative event", async () => {
    const user = userEvent.setup();
    render(<AgentControlRoomPage />);

    expect(
      screen.getByRole("heading", { name: "Agent Control Room" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("PdM Agent")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Inspect Resource Agent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Inspect Production Impact Agent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Inspect RA-QMIX Policy" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Inspect Resource Agent" }),
    );
    expect(
      within(screen.getByLabelText("Agent details")).getByText(
        "check_technician_eligibility",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Inspect Deterministic Validator" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Checkpoint and CTDE adapter not present"),
    ).toBeInTheDocument();
    expect(screen.getByText("13 events")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Risk tool completed/ }),
    );

    expect(screen.getByLabelText("Selected event detail")).toHaveTextContent(
      "tool.completed",
    );
    expect(screen.getByLabelText("Selected event detail")).toHaveTextContent(
      "health-M03-001",
    );
    expect(screen.getByLabelText("Selected event detail")).toHaveTextContent(
      "failure_probability",
    );
  });

  it("shows simulator-owned results only after running a scenario", async () => {
    const user = userEvent.setup();
    render(<WhatIfWorkspacePage />);

    expect(
      screen.getByRole("heading", { name: "No simulation result" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Technician unavailable/ }),
    );
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    expect(
      screen.getByRole("heading", { name: "Baseline vs simulated plan" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sim-run-tech-001/)).toBeInTheDocument();
    expect(screen.getByText("RELIABILITY PRIORITY")).toBeInTheDocument();
    expect(
      screen.getByText("T04 reaches 78% utilization."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cannot create a committed schedule/i),
    ).toBeInTheDocument();
  });
});
