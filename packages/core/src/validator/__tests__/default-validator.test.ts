import { runValidatorContract } from "@teamagent/ports/contracts";
import { defaultValidator } from "../index.js";

runValidatorContract(() => defaultValidator);
