import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Activity, CalendarDays, Users, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { StudioCutApiError } from "../lib/account-api";

type DailyUsagePoint = {
  date: string;
  newUsers: number;
  activeUsers: number;
  events: number;
};

type AdminOverview = {
  totalUsers: number;
  newUsers30d: number;
  activeUsers7d: number;
  daily: DailyUsagePoint[];
  eventCounts: Array<{ eventType: string; count: number }>;
};

type AdminUser = {
  email: string;
  displayName: string;
  phoneNumber: string | null;
  joinedAt: string;
  lastActiveAt: string | null;
};

type AdminUsers = { users: AdminUser[]; totalCount: number };

async function adminFetch<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new StudioCutApiError(
      body.error || "Could not load the admin dashboard.",
      response.status,
    );
  }
  return (await response.json()) as T;
}

function formatDay(date: string): string {
  const day = date.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not yet active";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function eventLabel(eventType: string): string {
  return eventType.replaceAll("_", " ");
}

export default function AdminPage() {
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => adminFetch<AdminOverview>("/api/admin/overview"),
    retry: false,
  });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => adminFetch<AdminUsers>("/api/admin/users?limit=100&offset=0"),
    retry: false,
  });

  const error = overview.error ?? users.error;
  const forbidden =
    error instanceof StudioCutApiError && error.status === 403;
  const loading = overview.isLoading || users.isLoading;

  if (loading) {
    return (
      <main className="grid min-h-full place-items-center bg-background text-sm text-muted-foreground">
        Loading admin dashboard…
      </main>
    );
  }

  if (error || !overview.data || !users.data) {
    return (
      <main className="min-h-full bg-background px-5 py-8 text-foreground sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to projects
          </Link>
          <section className="mt-8 rounded-2xl border border-border bg-card p-6">
            <h1 className="text-xl font-semibold">
              {forbidden ? "Admin access only" : "Dashboard unavailable"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {forbidden
                ? "This account is not on the StudioCut admin allowlist."
                : error?.message || "Please try again shortly."}
            </p>
          </section>
        </div>
      </main>
    );
  }

  const data = overview.data;
  const charts = data.daily.map((point) => ({
    ...point,
    day: formatDay(point.date),
  }));

  return (
    <main className="min-h-full bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="size-4" /> Back to projects
            </Link>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              StudioCut administration
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Users & activity
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Contact details and privacy-consented usage events. Projects and
              imported media remain in each user’s browser.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            Newest 100 accounts shown
          </div>
        </header>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            icon={<Users className="size-4" />}
            label="Registered users"
            value={data.totalUsers}
          />
          <MetricCard
            icon={<UserPlus className="size-4" />}
            label="New in the last 30 days"
            value={data.newUsers30d}
          />
          <MetricCard
            icon={<Activity className="size-4" />}
            label="Active in the last 7 days"
            value={data.activeUsers7d}
          />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Signups and active users</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Daily totals for the last 30 days
            </p>
            <div className="mt-5 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} minTickGap={26} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="newUsers" name="New users" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="activeUsers" name="Active users" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <h2 className="text-sm font-semibold">App activity</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Privacy-limited events, last 30 days
            </p>
            <div className="mt-5 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.eventCounts.map((item) => ({ ...item, event: eventLabel(item.eventType) }))} layout="vertical" margin={{ top: 6, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis type="category" dataKey="event" width={115} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                  />
                  <Bar dataKey="count" name="Events" fill="hsl(var(--primary))" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-end justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold">Registered accounts</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {users.data.totalCount} accounts · phone numbers are user-submitted and not verified
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium sm:px-6">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium sm:px-6">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.data.users.map((user) => (
                  <tr key={`${user.email}-${user.joinedAt}`} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium sm:px-6">{user.displayName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3 font-mono text-xs">{user.phoneNumber || "Not provided"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatTimestamp(user.joinedAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground sm:px-6">{formatTimestamp(user.lastActiveAt)}</td>
                  </tr>
                ))}
                {users.data.users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                      No profiles have been completed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
