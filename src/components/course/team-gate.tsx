"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { useKit } from "@/components/kit/kit-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Button, Card, CardBody, Field, Input, SkeletonCard } from "@/components/ui";

/**
 * The course team's pages ask for the passcode once. It's printed in the For judges box on the
 * home page; the server keeps the browser signed in with a cookie for a week.
 */
export function TeamGate({ title, children }: { title: string; children: ReactNode }) {
  const { kitFetch } = useKit();
  const [team, setTeam] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    kitFetch<{ team: boolean }>("/api/team/session")
      .then((r) => live && setTeam(r.team))
      .catch(() => live && setTeam(false));
    return () => {
      live = false;
    };
  }, [kitFetch]);

  async function enter(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await kitFetch("/api/team/session", { json: { passcode } });
      setTeam(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (team === null) return <SkeletonCard />;
  if (team) return <>{children}</>;
  return (
    <>
      <PageHeader title={title} description="This page is for the course team. It shows every learner's grades and refunds." />
      <Card className="max-w-md">
        <CardBody>
          <form onSubmit={enter} className="space-y-4" data-testid="team-passcode-form">
            <p className="flex items-center gap-2 font-medium text-zinc-900">
              <LockKeyhole className="size-4 text-brand" /> Enter the course team passcode
            </p>
            <Field label="Passcode" htmlFor="team-passcode" error={error || undefined} hint={<>Judging? It&rsquo;s in the For judges box on <Link href="/#judges" className="underline">the home page</Link>.</>}>
              <Input id="team-passcode" data-testid="team-passcode" autoComplete="off" value={passcode} maxLength={100} onChange={(e) => setPasscode(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy} disabled={!passcode.trim()} data-testid="team-passcode-submit">
              Open the course team view
            </Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
