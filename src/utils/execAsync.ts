import { exec } from "child_process";
import { promisify } from "util";

export const execAsync: typeof exec.__promisify__ = promisify(exec);
