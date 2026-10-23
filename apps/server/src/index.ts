import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

const port = Number(process.env.PORT ?? 3000);
const db = openDatabase(process.env.NUHOKAI_DB ?? "data/nuhokai.db");
const app = createApp({ db });

export default { port, fetch: app.fetch, idleTimeout: 0 };
console.log(`nuhokai server on http://localhost:${port}`);
