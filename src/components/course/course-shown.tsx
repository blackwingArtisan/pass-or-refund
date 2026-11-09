"use client";

import { createContext, useContext } from "react";
import { course, rubric } from "@/lib/course/content";
import type { EnrollmentView } from "@/lib/course/types";
import type { Rubric } from "@/lib/grading/frozen/score-items";

/** The course a learner's screens are about: the sample course, or a creator's own. */
export interface CourseShown {
  title: string;
  /** Who it's by, as the certificate says it. */
  byLine: string;
  passMark: number;
  rubric: Rubric;
  /** The sample course has lessons, prepared answers and a public rubric page; a creator's course has its link. */
  sample: boolean;
  /** Where a buyer checks their rubric fingerprint. */
  checkHref?: string;
}

export const SAMPLE_COURSE_SHOWN: CourseShown = { title: course.title, byLine: `by ${course.creator}`, passMark: course.passMark, rubric, sample: true };

export function shownFor(enrollment: Pick<EnrollmentView, "creatorCourse">): CourseShown {
  const own = enrollment.creatorCourse;
  return own ? { title: own.title, byLine: "a creator's course on Pass or Refund", passMark: own.rubric.passMark, rubric: own.rubric, sample: false, checkHref: own.path } : SAMPLE_COURSE_SHOWN;
}

const Shown = createContext<CourseShown>(SAMPLE_COURSE_SHOWN);
export const CourseShownProvider = Shown.Provider;
export const useCourseShown = () => useContext(Shown);
