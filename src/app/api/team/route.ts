import { listEnrollments } from "@/lib/course/enrollments";
import { route } from "@/lib/http";

export const GET = route(async () => ({ enrollments: listEnrollments() }));
