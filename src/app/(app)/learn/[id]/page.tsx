"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { LearnerScreen } from "@/components/course/learner-screen";
import { SkeletonCard } from "@/components/ui";

function Learner() {
  const { id } = useParams<{ id: string }>();
  return <LearnerScreen id={id} />;
}

/** useParams() suspends on a dynamic route. */
export default function LearnPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <Learner />
    </Suspense>
  );
}
