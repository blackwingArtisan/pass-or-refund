"use client";

import { showError } from "@/components/error-toast";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useKit } from "@/components/kit/kit-provider";
import { CheckoutButton } from "@/components/paypal/checkout-button";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { course, COURSE_PRICE_CENTS, lessons, rubric } from "@/lib/course/content";
import { formatCents } from "@/lib/course/policy";
import type { EnrollmentView } from "@/lib/course/types";
import { Guarantee } from "./guarantee";
import { RubricOnSale } from "./rubric-receipt";

/** Stops the checkout quietly: this learner paid already, so they're on their way to the course. */
class AlreadyPaid extends Error {}

export function CourseScreen() {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const router = useRouter();
  const [learnerName, setLearnerName] = useState("");
  const [learnerEmail, setLearnerEmail] = useState("");
  const enrollmentId = useRef("");
  const name = learnerName.trim();
  const email = learnerEmail.trim();
  const ready = Boolean(name) && /^\S+@\S+\.\S+$/.test(email);

  async function createOrder() {
    const created = await kitFetch<{ enrollmentId: string; orderId?: string; alreadyPaid?: boolean }>("/api/enrollments", { json: { learnerName: name, learnerEmail: email } });
    enrollmentId.current = created.enrollmentId;
    if (!created.orderId) {
      router.push(`/learn/${created.enrollmentId}`);
      throw new AlreadyPaid();
    }
    return { orderId: created.orderId };
  }

  /** If the answer got lost, PayPal may still have the money, so ask before saying anything failed. */
  async function onApprove({ orderId }: { orderId: string }) {
    const url = `/api/enrollments/${enrollmentId.current}`;
    await kitFetch(`${url}/pay`, { json: { orderId } }).catch(async () => {
      const enrollment = await kitFetch<EnrollmentView>(url).catch(() => null);
      if (!enrollment || enrollment.status === "unpaid") throw new Error("We couldn't confirm your payment. Please don't pay again. Buy with the same email in a minute and we'll check with PayPal first.");
    });
    router.push(`/learn/${enrollmentId.current}`);
  }

  return (
    <>
      <PageHeader eyebrow={`By ${course.creator}`} title={course.title} description={course.subtitle} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="What's inside" description={`${lessons.length} short lessons, then a final check of ${rubric.questions.length} written questions. Pass mark ${course.passMark} out of 100.`} />
          <CardBody>
            <ol className="space-y-3">
              {lessons.map((lesson) => (
                <li key={lesson.number} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">{lesson.number}</span>
                  <div>
                    <p className="font-medium text-zinc-900">{lesson.name}</p>
                    <p className="line-clamp-2 text-sm text-zinc-500">{lesson.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-zinc-400">{course.creatorNote}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={formatCents(COURSE_PRICE_CENTS)} description="One payment, taken by PayPal when you buy." />
          <CardBody className="space-y-4">
            <Guarantee />
            <RubricOnSale />
            <Field label="Your name" hint="It goes on your certificate." htmlFor="learner-name">
              <Input id="learner-name" data-testid="learner-name" value={learnerName} maxLength={80} onChange={(e) => setLearnerName(e.target.value)} placeholder="Alex Rivera" />
            </Field>
            <Field label="Your email" hint="Guarantee: one refund per PayPal account. It is matched on this address and the PayPal account that pays." htmlFor="learner-email">
              <Input id="learner-email" data-testid="learner-email" type="email" value={learnerEmail} maxLength={200} onChange={(e) => setLearnerEmail(e.target.value)} placeholder="alex@example.com" />
            </Field>
            <CheckoutButton
              createOrder={createOrder}
              onApprove={onApprove}
              onError={(e) => {
                if (!(e instanceof AlreadyPaid)) showError(toast, "The payment didn't go through", e);
              }}
              amountLabel={formatCents(COURSE_PRICE_CENTS)}
              disabled={!ready}
              buyerEmail={email}
              label={`Buy for ${formatCents(COURSE_PRICE_CENTS)}`}
            />
            {ready ? null : <p className="text-xs text-zinc-500">Add your name and email to buy.</p>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
