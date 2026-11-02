/**
 * The one sample course. Lessons and questions here are what the learner reads and what the
 * grader is shown, so the two can't drift apart. Safe to import in the browser.
 * Ines Marlowe is a made-up creator; the course was written for this demo.
 */
import rubricJson from "./rubric.json";
import type { Rubric } from "@/lib/grading/frozen/score-items";

export const rubric: Rubric = rubricJson;

/** The only price in the app. Every demo amount comes from this constant. */
export const COURSE_PRICE_CENTS = 4_900;
export const CURRENCY = "USD";

export const course = {
  slug: rubric.course,
  title: rubric.title,
  subtitle: "Keep a kitchen knife sharp with one stone and twenty minutes.",
  creator: "Ines Marlowe",
  creatorNote: "Ines Marlowe is a made-up creator. This sample course was written for the demo.",
  passMark: rubric.passMark,
};

export interface Lesson {
  number: number;
  name: string;
  text: string;
}

export const lessons: Lesson[] = [
  {
    number: 1,
    name: "Rolled or worn",
    text: "A knife feels dull for one of two reasons. Either the thin edge has rolled over to one side, or the edge has worn away. A honing steel pushes a rolled edge back into line. Honing removes almost no metal, so it can't rebuild a worn edge. Sharpening on a stone grinds away metal to form a new edge. If a knife is still dull right after honing, the edge is worn and it needs a stone. More honing will not help.",
  },
  {
    number: 2,
    name: "Setting up the stone",
    text: "This course uses a 1000-grit water stone, the right stone for routine sharpening. Soak it in water until the bubbles stop, which takes about ten minutes. Lay a damp towel under the stone so it can't slide while you work. A 400-grit stone is only for repairing chips, and a 3000-grit stone is only for polishing.",
  },
  {
    number: 3,
    name: "Holding the angle",
    text: "Sharpen a Western chef's knife at 20 degrees per side and a Japanese knife at 15 degrees per side. To check your angle, colour the bevel with a marker and take one light stroke. If the ink comes off only at the back of the bevel, your angle is too low. If it comes off only at the very edge, your angle is too high. When the ink comes off evenly you have found the angle. Hold that same angle on every stroke.",
  },
  {
    number: 4,
    name: "Reading the burr",
    text: "Don't count strokes or watch the clock. Sharpen one side until you can feel a burr, a tiny wire of metal, on the opposite side of the edge. Find it by sliding your thumb off the edge, never along it. The burr must run the whole length of the edge, heel to tip, before you flip the knife, because a gap in the burr is a part of the edge you haven't reached yet. Then do the same on the second side. Finish by removing the burr with a few light alternating strokes, one per side, or by stropping on leather or newspaper. A burr left on the knife snaps off and the knife feels dull within a day.",
  },
  {
    number: 5,
    name: "Keeping the edge",
    text: "Cutting on glass, stone or ceramic crushes the edge, so use a wood or plastic board. Dishwasher heat, detergent and knocks all damage the edge, so wash the knife by hand and dry it straight away. Hone about once a week. Sharpen on the stone about every three months for home cooking. To test the edge, slice a sheet of paper: a sharp knife cuts it cleanly without tearing.",
  },
];

/** Which lesson teaches each rubric item, for the study list. */
export const lessonForItem: Record<string, number> = {
  q1a: 1,
  q1b: 1,
  q1c: 1,
  q2a: 2,
  q2b: 2,
  q2c: 3,
  q2d: 3,
  q3a: 4,
  q3b: 4,
  q3c: 4,
  q4a: 5,
  q4b: 5,
  q4c: 5,
  q4d: 5,
};

/** Course text in the sealed packet format, the part above "## Rubric". */
export const courseText = [
  `# ${course.title}`,
  "",
  "## Course content",
  lessons.map((l) => `**Lesson ${l.number}: ${l.name}.** ${l.text}`).join("\n\n"),
  "",
  "## Final check",
  ...rubric.questions.map((q) => `**${q.id.toUpperCase()}.** ${q.text}`),
].join("\n");
