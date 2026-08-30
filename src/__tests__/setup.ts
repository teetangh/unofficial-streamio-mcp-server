import { config } from "dotenv";

// Loads .env for local runs. CI injects the same variables directly, and
// existing environment variables always win.
config({ quiet: true });
