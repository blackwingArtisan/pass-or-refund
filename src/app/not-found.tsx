import Link from "next/link";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/ui";

/** Any address the app doesn't have: the usual header and nav, and a way back. */
export default function NotFound() {
  return (
    <AppShell>
      <div data-testid="not-found" className="mx-auto max-w-xl py-12">
        <EmptyState
          title="There's no page here"
          description="The link may be mistyped, or the page may have moved."
          action={
            <div className="flex flex-wrap justify-center gap-4 text-sm font-medium">
              <Link href="/" className="text-brand">
                Home
              </Link>
              <Link href="/course" className="text-brand">
                The course
              </Link>
            </div>
          }
        />
      </div>
    </AppShell>
  );
}
