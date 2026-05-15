import { describe } from "vitest";
import { runAttributionBusContract } from "@teamagent/ports/contracts";
import { InMemoryAttributionBus } from "../in-memory-bus.js";

describe("InMemoryAttributionBus", () => {
  runAttributionBusContract(() => new InMemoryAttributionBus());
});
