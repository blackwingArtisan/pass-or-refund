import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardBody } from "@/components/ui";
import { COURSE_PRICE_CENTS } from "@/lib/course/content";
import { formatCents, GUARANTEE_TERMS } from "@/lib/course/policy";

export const metadata = { title: "Guarantee terms" };

/** Every rule of the guarantee. The course page and the fail screen show the four-line summary. */
export default function TermsPage() {
  return (
    <>
      <PageHeader eyebrow="The guarantee" title={`The ${formatCents(COURSE_PRICE_CENTS)} guarantee, in full`} description="The code that decides a refund follows these rules exactly." />
      <Card>
        <CardBody>
          <ol data-testid="guarantee-terms" className="list-decimal space-y-2 pl-5 text-sm text-zinc-700">
            {GUARANTEE_TERMS.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm">
            <Link href="/course" className="font-medium text-brand underline">
              Back to the course
            </Link>
          </p>
        </CardBody>
      </Card>
    </>
  );
}
