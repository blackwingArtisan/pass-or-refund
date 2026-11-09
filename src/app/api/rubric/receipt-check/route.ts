import { z } from "zod";
import { checkGradeReceipt } from "@/lib/course/grade-receipt";
import { readJson, route } from "@/lib/http";

/** Public: anyone holding a grade receipt can check it against the record. */
export const POST = route(async (req) => checkGradeReceipt(await readJson(req, z.unknown())));
