/** The sealed prompt, filled in for this app's course and the rubric the learner bought. Server only. */
import { courseText, rubric as published } from "@/lib/course/content";
import { renderRubric } from "./frozen/packet";
import { systemPrompt, userPrompt } from "./frozen/prompts";
import type { Answers, Rubric } from "./frozen/score-items";

export const graderSystemPrompt = (rubric: Rubric = published) => systemPrompt("checklist", "strict", courseText, renderRubric(rubric));
export const graderUserPrompt = (answers: Answers, rubric: Rubric = published) => userPrompt(rubric, answers);
