import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Heart, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import { recordUsageEvent } from "../lib/account-api";

const DONATION_NAME = "Muhammad Rameez Qaiser";
const DONATION_NUMBER = "03322373087";

export default function SupportPage() {
  const [copied, setCopied] = useState(false);
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) recordUsageEvent("support_opened");
  }, [isLoaded, isSignedIn]);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(DONATION_NUMBER);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="min-h-full bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to StudioCut
        </Link>

        <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-9">
          <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Heart className="size-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Support the editor
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Help StudioCut keep growing.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            If StudioCut has been useful, you can send a voluntary contribution
            through JazzCash using the account details below.
          </p>

          <div className="mt-8 rounded-2xl border border-border bg-background p-5">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              JazzCash transfer details
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Account name</dt>
                <dd className="mt-1 text-sm font-semibold">{DONATION_NAME}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">JazzCash number</dt>
                <dd className="mt-1 font-mono text-base font-semibold tracking-wide">
                  {DONATION_NUMBER}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => void copyNumber()}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Number copied" : "Copy JazzCash number"}
            </button>
          </div>

          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            Donations are sent directly through JazzCash. StudioCut does not
            process or automatically verify transfers.
          </p>
        </section>
      </div>
    </main>
  );
}
