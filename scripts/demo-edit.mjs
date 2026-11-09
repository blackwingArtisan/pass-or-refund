#!/usr/bin/env node
/**
 * npm run demo:edit — turns the raw demo recording into the cut for the submission. Reads
 * videos/demo-edit.json (written by demo/demo.spec.ts): the stretches of the main recording to
 * keep, with PayPal's checkout window (its own recording) spliced in where it opened. Drops the
 * grading waits, adds a silent audio track, scales to 1920x1200, and fails at 2:30 or longer. The
 * narration is laid on afterwards from videos/voiceover.json (round4/scripts/narrate.mjs).
 * Needs ffmpeg + ffprobe (brew install ffmpeg).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

process.env.PATH = `${process.env.FFMPEG_DIR ? `${process.env.FFMPEG_DIR}:` : ""}${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`;
const LIMIT_SECONDS = 150;
/** YouTube serves 1080p-class quality from this size; the take is recorded at 1280x800. */
const OUT_SIZE = process.env.DEMO_OUT_SIZE ?? "1920x1200";
const OUT = process.argv[2] ?? "videos/demo-pass-or-refund.mp4";
const plan = JSON.parse(fs.readFileSync("videos/demo-edit.json", "utf8"));

const sources = [...new Set(plan.parts.map((p) => p.src))];
const inputs = sources.flatMap((src) => ["-i", plan.videos[src]]);
const [W, H] = (plan.size ?? "1280x800").split("x").map(Number);
/** A part with a zoom eases in over 1.5 s to `to` times, toward its anchor, and holds there. */
const zoomOf = (z) => (z ? `,zoompan=z='min(1+${(z.to - 1).toFixed(3)}*on/45,${z.to})':x='(iw-iw/zoom)*${z.ax.toFixed(3)}':y='(ih-ih/zoom)*${z.ay.toFixed(3)}':d=1:s=${W}x${H}:fps=30` : "");
const filters = plan.parts.map((part, i) => {
  const trim = `trim=start=${part.from.toFixed(2)}${part.to === undefined ? "" : `:end=${part.to.toFixed(2)}`}`;
  return `[${sources.indexOf(part.src)}:v]${trim},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x18181b,fps=30${zoomOf(part.zoom)},setsar=1[v${i}]`;
});
const [OW, OH] = OUT_SIZE.split("x").map(Number);
const concat = `${plan.parts.map((_, i) => `[v${i}]`).join("")}concat=n=${plan.parts.length}:v=1:a=0,scale=${OW}:${OH}:flags=lanczos[v]`;

execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  ...inputs,
  "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
  "-filter_complex", [...filters, concat].join(";"),
  "-map", "[v]", "-map", `${sources.length}:a`, "-shortest", "-map_metadata", "-1",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
  OUT,
], { stdio: "inherit" });

const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT]).toString());
console.log(`${OUT}: ${seconds.toFixed(1)}s from ${plan.parts.length} parts`);
if (seconds >= LIMIT_SECONDS) {
  console.error(`Too long: limit is ${LIMIT_SECONDS}s. Shorten captions in demo/demo.spec.ts.`);
  process.exit(1);
}
