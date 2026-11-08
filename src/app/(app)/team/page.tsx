import { TeamGate } from "@/components/course/team-gate";
import { TeamScreen } from "@/components/course/team-screen";

export default function TeamPage() {
  return (
    <TeamGate title="Course team">
      <TeamScreen />
    </TeamGate>
  );
}
