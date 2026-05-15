import { describe, beforeEach, afterEach } from "vitest";
import { runCandidateQueueContract } from "@teamagent/ports/contracts";
import { SqliteCandidateQueue } from "../sqlite-candidate-queue.js";
import { openDb, closeDb } from "../schema.js";

describe("SqliteCandidateQueue", () => {
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    closeDb(db);
  });

  runCandidateQueueContract(() => new SqliteCandidateQueue(db));
});
