"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ErrorBoundary } from "@/components/error-boundary";
import { getUserFromToken, logout, type TokenUser } from "@/lib/auth";

const navigation = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/decisions", label: "Decision Center", icon: ClipboardCheck },
  { href: "/agents", label: "Agent Control Room", icon: Bot },
  { href: "/what-if", label: "What-if Workspace", icon: SlidersHorizontal },
];

function NavItem({
  href,
  label,
  icon: Icon,
  collapsed,
}: {
  href: string;
  label: string;
  icon: typeof Activity;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`workspace-nav-link ${active ? "is-active" : ""}`}
    >
      <Icon size={19} aria-hidden="true" />
      <span className={collapsed ? "sr-only" : undefined}>{label}</span>
    </Link>
  );
}

export function AppShell({
  children,
  title = "Operations overview",
}: {
  children: ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<TokenUser | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );

  useEffect(() => {
    try {
      if (localStorage.getItem("dss-density") === "compact")
        setDensity("compact");
    } catch {
      /* Storage may be disabled; the control still works for this session. */
    }
  }, []);

  const changeDensity = (value: "comfortable" | "compact") => {
    setDensity(value);
    try {
      localStorage.setItem("dss-density", value);
    } catch {
      /* Session-only preference. */
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getUserFromToken().then((currentUser) => {
      if (cancelled) return;
      if (!currentUser) router.replace("/login");
      else setUser(currentUser);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!user)
    return (
      <div className="workspace-loading" role="status">
        <Activity size={24} aria-hidden="true" />
        <p>Opening your workspace…</p>
      </div>
    );
  const displayName = user.fullName || user.username || user.role;

  return (
    <div
      className={`workspace-shell ${collapsed ? "sidebar-collapsed" : ""}`}
      data-density={density}
    >
      <a href="#workspace-content" className="skip-link">
        Skip to content
      </a>
      <aside className="workspace-sidebar" aria-label="Workspace sidebar">
        <Link
          href="/overview"
          className="workspace-brand"
          title="Maintenance AI"
        >
          <span className="brand-symbol">
            <Activity size={23} aria-hidden="true" />
          </span>
          <span className={collapsed ? "sr-only" : "brand-name"}>
            Maintenance AI<span>Factory operations</span>
          </span>
        </Link>
        <nav aria-label="Primary navigation" className="workspace-navigation">
          <p className={collapsed ? "sr-only" : "nav-group-label"}>
            Operations
          </p>
          {navigation.map((item) => (
            <NavItem key={item.href} {...item} collapsed={collapsed} />
          ))}
          <p
            className={
              collapsed ? "sr-only" : "nav-group-label nav-group-secondary"
            }
          >
            Research & administration
          </p>
          <NavItem
            href="/experiments"
            label="Experiments"
            icon={FlaskConical}
            collapsed={collapsed}
          />
          {user.role === "ADMIN" && (
            <NavItem
              href="/admin"
              label="Users"
              icon={Users}
              collapsed={collapsed}
            />
          )}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="workspace-nav-link sidebar-toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight size={18} aria-hidden="true" />
            ) : (
              <ChevronLeft size={18} aria-hidden="true" />
            )}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
          <div className="workspace-account">
            <span className="account-avatar" aria-hidden="true">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className={collapsed ? "sr-only" : "account-name"}>
              <p>{displayName}</p>
              <span>{user.role === "ADMIN" ? "Administrator" : user.role}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="workspace-nav-link"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={18} aria-hidden="true" />
            <span className={collapsed ? "sr-only" : undefined}>Log out</span>
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={15} aria-hidden="true" />
            <p>{title}</p>
          </div>
          <div
            className="workspace-display-controls"
            role="group"
            aria-label="Display density"
          >
            <span>Density</span>
            {(["comfortable", "compact"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={density === value}
                onClick={() => changeDensity(value)}
              >
                {value === "comfortable" ? "Comfortable" : "Compact"}
              </button>
            ))}
          </div>
        </header>
        <div id="workspace-content" tabIndex={-1}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
