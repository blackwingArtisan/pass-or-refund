import { connection, type NextRequest } from "next/server";
import { isTeam, TEAM_ONLY_CHANNELS } from "@/lib/course/team-access";
import { timeline } from "@/lib/events/bus";
import { withoutEmails } from "@/lib/http";
import type { TimelineEvent } from "@/lib/events/types";

/**
 * Server-Sent Events stream of timeline events. ?channels=<session>,global
 * Sends the buffered history first (event: snapshot), then live events (event: timeline).
 * The course team's channel needs the team passcode, and no email address goes out on any channel.
 */
export async function GET(req: NextRequest) {
  await connection();
  const team = isTeam(req);
  const channels = (req.nextUrl.searchParams.get("channels") ?? "global")
    .split(",")
    .filter((c) => c && (team || !TEAM_ONLY_CHANNELS.includes(c)));
  const runId = req.nextUrl.searchParams.get("runId") ?? undefined;
  const encoder = new TextEncoder();
  const matches = (e: TimelineEvent) => channels.includes(e.channel) && (!runId || e.runId === runId);
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(withoutEmails(data))}\n\n`));
      send("snapshot", timeline.history({ channels, runId }));
      const unsubscribe = timeline.subscribe((e) => {
        if (matches(e)) send("timeline", e);
      });
      const ping = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      cleanup = () => {
        unsubscribe();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
