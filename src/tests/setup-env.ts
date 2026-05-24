import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env.local for tests. Production runtime uses Next.js's built-in loader.
// `override: true` ensures .env.local wins over any (possibly empty) values
// already set in the parent shell — tests should always reflect .env.local.
config({ path: resolve(process.cwd(), ".env.local"), override: true });
