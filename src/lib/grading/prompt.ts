/** The sealed prompt, filled in for this app's course. Server only. */
import { courseText, rubric } from "@/lib/course/content";
import { renderRubric } from "./frozen/packet";
import { systemPrompt, userPrompt } from "./frozen/prompts";
import type { Answers } from "./frozen/score-items";

export const graderSystemPrompt = () => systemPrompt("checklist", "strict", courseText, renderRubric(rubric));
export const graderUserPrompt = (answers: Answers) => userPrompt(rubric, answers);
