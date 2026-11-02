"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useKit } from "@/components/kit/kit-provider";
import { CheckoutButton } from "@/components/paypal/checkout-button";
import { PageHeader } from "@/components/shell/app-shell";
import { useToast } from "@/components/toast";
import { Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { course, COURSE_PRICE_CENTS, lessons, rubric } from "@/lib/course/content";
import { formatCents } from "@/lib/course/policy";
import { Guarantee } from "./guarantee";

export function CourseScreen() {
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const router = useRouter();
  const [learnerName, setLearnerName] = useState("");
  const enrollmentId = useRef("");
  const name = learnerName.trim();

  async function createOrder() {
    const created = await kitFetch<{ enrollmentId: string; orderId: string }>("/api/enrollments", { json: { learnerName: name } });
    enrollmentId.current = created.enrollmentId;
    return { orderId: created.orderId };
  }

  async function onApprove({ orderId }: { orderId: string }) {
    await kitFetch(`/api/enrollments/${enrollmentId.current}/pay`, { json: { orderId } });
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
            <Field label="Your name" hint="It goes on your certificate." htmlFor="learner-name">
              <Input id="learner-name" data-testid="learner-name" value={learnerName} maxLength={80} onChange={(e) => setLearnerName(e.target.value)} placeholder="Alex Rivera" />
            </Field>
            <CheckoutButton
              createOrder={createOrder}
              onApprove={onApprove}
              onError={(e) => toast({ title: "The payment didn't go through", description: e.message, variant: "error" })}
              amountLabel={formatCents(COURSE_PRICE_CENTS)}
              disabled={!name}
              label={`Buy for ${formatCents(COURSE_PRICE_CENTS)}`}
            />
            {name ? null : <p className="text-xs text-zinc-500">Add your name to buy.</p>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
