"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CreatorCourseScreen } from "@/components/course/creator-course-screen";
import { SkeletonCard } from "@/components/ui";

function Course() {
  const { id } = useParams<{ id: string }>();
  return <CreatorCourseScreen id={id} />;
}

/** useParams() suspends on a dynamic route. */
export default function CreatorCoursePage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <Course />
    </Suspense>
  );
}
