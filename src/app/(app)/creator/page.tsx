import { CreatorScreen } from "@/components/course/creator-screen";
import { creatorCoursePath } from "@/lib/course/creator-courses";
import { exampleCreatorCourseId } from "@/lib/course/example-creator-course";

export const metadata = { title: "Put your course on the guarantee" };

export default function CreatorPage() {
  return <CreatorScreen exampleHref={creatorCoursePath(exampleCreatorCourseId())} />;
}
