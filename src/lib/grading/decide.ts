/**
 * The frozen decision rule, band(66,73; inner 69-70), from the sealed grading spike (FROZEN.md).
 * Grade once. Under 66 fails, over 73 passes. From 66 to 73, grade twice more and take the median:
 * 71 or more passes, 68 or less fails, and 69 or 70 goes to a person.
 *
 * Do not retune these numbers. Any change voids the sealed-set result.
 */
export const BAND_LOW = 66;
export const BAND_HIGH = 73;
export const MEDIAN_PASS = 71;
export const MEDIAN_FAIL = 68;

export type Outcome = "pass" | "fail" | "review";

/** True when one grade decides the attempt and no extra grades are needed. */
export function isDecidedByFirstGrade(first: number): boolean {
  return first < BAND_LOW || first > BAND_HIGH;
}

export function medianOfThree(totals: readonly [number, number, number]): number {
  return [...totals].sort((a, b) => a - b)[1];
}

export function outcomeOfFirstGrade(first: number): Outcome {
  if (isDecidedByFirstGrade(first)) return first < BAND_LOW ? "fail" : "pass";
  throw new Error(`${first} is inside the band, so it needs two more grades.`);
}

export function outcomeOfMedian(median: number): Outcome {
  if (median >= MEDIAN_PASS) return "pass";
  return median <= MEDIAN_FAIL ? "fail" : "review";
}
