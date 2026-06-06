/**
 * Static file contents for a new Felix mini app. The manager writes
 * these into the mini app folder, then installs deps and starts Vite.
 *
 * The template is a Vite app plus a Vite middleware plugin that exposes
 * a tiny data API backed by the mini app's own SQLite file (felix.db).
 * Kids' code talks to it through the friendly `felixData` helper.
 */
export interface TemplateContext {
  name: string;
}

export interface TemplateFile {
  path: string;
  content: string;
}

export function templateFiles(ctx: TemplateContext): TemplateFile[] {
  const jsSafeName = ctx.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const htmlSafeName = escapeHtml(ctx.name);
  return [
    {
      path: "package.json",
      content: `${JSON.stringify(
        {
          name: "felix-mini-app",
          private: true,
          type: "module",
          scripts: {
            dev: "vite",
            build: "vite build",
          },
          dependencies: {
            vite: "^6.0.0",
          },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: "vite.config.js",
      content: `import { defineConfig } from "vite";
import { felixData } from "./felix/data-plugin.js";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    strictPort: true,
  },
  plugins: [felixData()],
});
`,
    },
    {
      path: "felix/data-plugin.js",
      content: `import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dbFile = join(dirname(fileURLToPath(import.meta.url)), "..", "felix.db");

function openDb() {
  const db = new DatabaseSync(dbFile);
  db.exec(
    "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
      "CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));" +
      "CREATE INDEX IF NOT EXISTS items_collection_idx ON items (collection);",
  );
  return db;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

// Vite plugin that adds a small JSON data API to the dev server.
export function felixData() {
  return {
    name: "felix-data",
    configureServer(server) {
      server.middlewares.use("/felix-data", async (req, res) => {
        const db = openDb();
        try {
          const body = await readBody(req);
          const action = body.action;
          if (action === "set") {
            db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
              .run(body.key, JSON.stringify(body.value));
            return send(res, 200, { ok: true });
          }
          if (action === "get") {
            const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(body.key);
            return send(res, 200, { value: row ? JSON.parse(row.value) : null });
          }
          if (action === "add") {
            const info = db.prepare("INSERT INTO items (collection, data) VALUES (?, ?)")
              .run(body.collection, JSON.stringify(body.data));
            return send(res, 200, { id: info.lastInsertRowid });
          }
          if (action === "all") {
            const rows = db.prepare("SELECT id, data, created_at FROM items WHERE collection = ? ORDER BY id DESC")
              .all(body.collection);
            return send(res, 200, {
              items: rows.map((r) => ({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.data) })),
            });
          }
          return send(res, 400, { error: "Unknown action" });
        } catch (err) {
          return send(res, 500, { error: String(err) });
        } finally {
          db.close();
        }
      });
    },
  };
}
`,
    },
    {
      path: ".felix/about.json",
      content: `${JSON.stringify({ name: ctx.name, emoji: "🚀", app_description: "" }, null, 2)}\n`,
    },
    {
      path: "felix/data.js",
      content: `// Friendly data helper for your app. No SQL needed!
async function call(payload) {
  const res = await fetch("/felix-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export const felixData = {
  // Save one value you can read back later, e.g. felixData.set("score", 10)
  async set(key, value) {
    await call({ action: "set", key, value });
  },
  // Read a value back, e.g. const score = await felixData.get("score")
  async get(key) {
    const r = await call({ action: "get", key });
    return r.value;
  },
  // Add an item to a list, e.g. felixData.add("todos", { text: "Play" })
  async add(collection, data) {
    const r = await call({ action: "add", collection, data });
    return r.id;
  },
  // Get everything in a list, e.g. const todos = await felixData.all("todos")
  async all(collection) {
    const r = await call({ action: "all", collection });
    return r.items;
  },
};
`,
    },
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${htmlSafeName}</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <main id="app">
      <h1>${htmlSafeName}</h1>
      <p>Welcome to your new mini app! Ask Felix to help you build it.</p>
    </main>
    <script type="module" src="/main.js"></script>
  </body>
</html>
`,
    },
    {
      path: "main.js",
      content: `import { felixData } from "./felix/data.js";

// Your app code goes here! Felix will help you build it.
console.log("Hello from ${jsSafeName}!");

// Example: felixData lets you save and load data.
// await felixData.set("greeting", "Hi!");
// const greeting = await felixData.get("greeting");
`,
    },
    {
      path: "style.css",
      content: `:root {
  font-family: system-ui, -apple-system, sans-serif;
}
body {
  margin: 0;
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: #f5f7ff;
  color: #1a1a2e;
}
#app {
  text-align: center;
  padding: 2rem;
}
`,
    },
    {
      path: ".gitignore",
      content: `node_modules/
dist/
felix.db
.pi/
`,
    },
  ];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
