import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * "A course a creator made here": the example course set up on /creator, with who made it said
 * plainly. On /creator it stands on its own; on the home page it runs on inside a sentence.
 */
export function ExampleCourseLink({ href, testId, where }: { href: string; testId: string; where: "creator" | "landing" }) {
  if (where === "landing") {
    return (
      <>
        <Link href={href} className="font-medium text-brand underline" data-testid={testId}>
          A course a creator made here
        </Link>{" "}
        <span data-testid={`${testId}-who`}>(made on /creator by the app&rsquo;s team).</span>
      </>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-brand underline" data-testid={testId}>
        A course a creator made here <ArrowRight className="size-3.5" aria-hidden />
      </Link>
      <span className="text-xs text-zinc-500" data-testid={`${testId}-who`}>
        Made on this form by the app&rsquo;s team, so you can see a creator&rsquo;s course end to end.
      </span>
    </span>
  );
}
