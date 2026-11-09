"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { GradeReceiptScreen } from "@/components/course/grade-receipt-screen";
import { SkeletonCard } from "@/components/ui";

function Receipt() {
  const { id } = useParams<{ id: string }>();
  return <GradeReceiptScreen id={id} />;
}

/** useParams() suspends on a dynamic route. */
export default function GradeReceiptPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <Receipt />
    </Suspense>
  );
}
