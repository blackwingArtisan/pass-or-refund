/** Ids of made-up records. Browser safe. */
export const SAMPLE_PASS_ID = "sample_pass";
/** Sample cohort learners are sample_1..sample_36; the passing sample learner is sample_pass. */
export const isSampleId = (id: string) => id.startsWith("sample_");
