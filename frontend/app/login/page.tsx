"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LoginPage } from "@/components/pages/login-page";
import { hasToken, isAuthBypassed, login } from "@/lib/auth";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthBypassed()) {
      router.replace("/");
      return;
    }
    void hasToken().then((loggedIn) => {
      if (loggedIn) router.replace("/");
    });
  }, [router]);

  async function handleSubmit(username: string, password: string) {
    await login(username, password);
    router.replace("/");
  }

  return (
    <main className="login-workspace">
      <section className="login-introduction">
        <div className="login-brand">
          <span className="brand-symbol">M</span>
          <span>
            Maintenance AI<span>Industrial decision support</span>
          </span>
        </div>
        <div className="login-argument">
          <h1>
            Clarity for every
            <br />
            maintenance decision.
          </h1>
          <p>
            Understand machine condition, review the evidence and evaluate the
            next action in one focused workspace.
          </p>
          <div className="login-process">
            <div>
              <strong>Understand</strong>
              <span>Machine observations and policy evidence</span>
            </div>
            <div>
              <strong>Evaluate</strong>
              <span>Alternatives and their operational tradeoffs</span>
            </div>
            <div>
              <strong>Decide</strong>
              <span>Human review with a recorded rationale</span>
            </div>
          </div>
        </div>
        <p className="login-footer">CNC maintenance · Evidence-led planning</p>
      </section>
      <section className="login-entry">
        <LoginPage onSubmit={handleSubmit} />
      </section>
    </main>
  );
}
