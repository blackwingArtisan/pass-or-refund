/** Test files run side by side in separate workers, so each worker needs its own data dir. */
import os from "node:os";
import path from "node:path";

process.env.KIT_DATA_DIR = path.join(os.tmpdir(), `kit-test-data-${process.ppid}-${process.env.VITEST_POOL_ID ?? "0"}`);
