import { Suspense } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Fingerprint } from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { checkFingerprint, rubricFingerprint, rubricOnSaleNow } from "@/lib/course/rubric-lock";

export const metadata = { title: "The public rubric" };

/** "3f2a9c1e04b7" -> "3f2a 9c1e 04b7", easier to compare by eye. */
const grouped = (fingerprint: string) => fingerprint.match(/.{1,4}/g)?.join(" ") ?? fingerprint;

function CheckResult({ version, fingerprint }: { version: string; fingerprint: string }) {
  const check = checkFingerprint({ version, fingerprint });
  const matches = check.status === "matches";
  return (
    <div
      data-testid="fingerprint-check"
      data-status={check.status}
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${matches ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        {matches ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
        <span data-testid="fingerprint-verdict">{matches ? "Matches" : "Changed since you bought"}</span>
      </p>
      <p className="mt-1">
        Your receipt says rubric v{check.bought.version}, fingerprint <code className="font-mono">{grouped(check.bought.fingerprint)}</code>. This page shows v{check.onSale.version}, fingerprint{" "}
        <code className="font-mono">{grouped(check.onSale.fingerprint)}</code>.
      </p>
      <p className="mt-1">
        {matches
          ? "The rubric below is word for word the one you bought."
          : check.boughtOnFile
            ? `The rubric on sale now differs from yours. Your attempts are still graded on v${check.bought.version}, the one you bought.`
            : "We have no rubric with your fingerprint on file, so grading would stop rather than use different words. Contact the course team."}
      </p>
    </div>
  );
}

type Search = Promise<{ v?: string; fp?: string }>;

/** Only the check reads the address, so the rest of the page prerenders. */
async function CheckFromAddress({ searchParams, version }: { searchParams: Search; version: string }) {
  const { v, fp } = await searchParams;
  return fp ? <CheckResult version={v ?? version} fingerprint={fp} /> : null;
}

export default function RubricPage({ searchParams }: { searchParams: Search }) {
  const { version, rubric } = rubricOnSaleNow();
  const fingerprint = rubricFingerprint(rubric);
  return (
    <>
      <PageHeader eyebrow="Public rubric" title={rubric.title} description={`Every learner is graded on these lines. Pass mark ${rubric.passMark} of 100. Any change to a single character changes the fingerprint.`} />
      <Suspense fallback={null}>
        <CheckFromAddress searchParams={searchParams} version={version} />
      </Suspense>
      <Card className="mb-6">
        <CardBody className="space-y-3 text-sm text-zinc-700">
          <p className="flex flex-wrap items-center gap-x-1.5">
            <Fingerprint className="size-4 text-brand" aria-hidden /> Rubric <span data-testid="public-rubric-version">v{version}</span>, fingerprint{" "}
            <code data-testid="public-rubric-fingerprint" className="font-mono text-zinc-900">
              {grouped(fingerprint)}
            </code>
          </p>
          <form action="/rubric" method="get" className="flex flex-wrap items-center gap-2" data-testid="fingerprint-form">
            <input type="hidden" name="v" value={version} />
            <label htmlFor="fp" className="text-zinc-600">
              Check the fingerprint on your receipt:
            </label>
            <input id="fp" name="fp" placeholder="3f2a 9c1e 04b7" className="w-40 rounded-md border border-zinc-300 px-2 py-1 font-mono text-sm" data-testid="fingerprint-input" />
            <button type="submit" className="rounded-md bg-brand px-3 py-1 text-sm font-medium text-brand-foreground" data-testid="fingerprint-submit">
              Check
            </button>
          </form>
          <p className="text-xs text-zinc-500">
            Or check it yourself: the fingerprint is the first 12 characters of the SHA-256 of{" "}
            <Link href={`/api/rubric/v${version}.json`} className="underline" data-testid="rubric-download">
              this file
            </Link>{" "}
            (<code>shasum -a 256 rubric-v{version}.json</code>).
          </p>
        </CardBody>
      </Card>
      <div className="space-y-4">
        {rubric.questions.map((q, i) => (
          <Card key={q.id} data-testid="public-rubric-question">
            <CardHeader title={`Question ${i + 1}, ${q.points} points`} description={q.text} />
            <CardBody>
              <ul className="space-y-1.5 text-sm text-zinc-700">
                {q.items.map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <span className="w-12 shrink-0 tabular-nums text-zinc-500">{item.points} pts</span>
                    <span>{item.text}</span>
                  </li>
                ))}
                {q.caps.map((cap) => (
                  <li key={cap.id} className="flex gap-3 text-zinc-500">
                    <span className="w-12 shrink-0 tabular-nums">max {cap.max}</span>
                    <span>{cap.text}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
