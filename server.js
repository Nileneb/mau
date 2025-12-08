import express from "express";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import fetch from "node-fetch";
import fs from 'fs';
import Database from "better-sqlite3";

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_REPO = "habibidani/axia";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;

// SQLite DB (persistent: ./data/mau.db)
const DB_FILE = process.env.DB_FILE || "./data/mau.db";
let db;
try {
  db = new Database(DB_FILE);
  // Initialize tables
  db.prepare(
    `CREATE TABLE IF NOT EXISTS views (id INTEGER PRIMARY KEY CHECK (id = 1), visits INTEGER NOT NULL)`
  ).run();
  db.prepare(
    `CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY, name TEXT, moves INTEGER, time INTEGER, pairs INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
  ).run();

  // Ensure single row for views exists
  const row = db.prepare(`SELECT COUNT(*) as c FROM views WHERE id = 1`).get();
  if (!row || row.c === 0) {
    db.prepare(`INSERT INTO views (id, visits) VALUES (1, 0)`).run();
  }
  // eslint-disable-next-line no-console
  console.log(`[sqlite] DB opened at ${DB_FILE}`);
} catch (e) {
  console.error("Failed to open DB:", e);
  process.exit(1);
}

// Basic security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "https://avatars.githubusercontent.com"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'"]
      }
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// Parse JSON requests
app.use(express.json());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Static
app.use(express.static("public", { maxAge: "1h", etag: true }));

// Health endpoint
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// === Visitor counter API (SQLite) ===
app.get("/api/hit", (_req, res) => {
  try {
    db.prepare(`UPDATE views SET visits = visits + 1 WHERE id = 1`).run();
    const visit = db.prepare(`SELECT visits FROM views WHERE id = 1`).get();
    res.json({ visits: visit.visits });
  } catch (e) {
    res.status(500).json({ error: "db_error" });
  }
});

app.get("/api/views", (_req, res) => {
  try {
    const visit = db.prepare(`SELECT visits FROM views WHERE id = 1`).get();
    res.json({ visits: visit.visits });
  } catch (e) {
    res.status(500).json({ error: "db_error" });
  }
});

// Score endpoints
app.post("/api/scores", (req, res) => {
  const { name = "anonymous", moves, time, pairs } = req.body || {};
  if (typeof moves !== "number" || typeof time !== "number" || typeof pairs !== "number") {
    return res.status(400).json({ error: "invalid_payload" });
  }
  try {
    const stmt = db.prepare(`INSERT INTO scores (name, moves, time, pairs) VALUES (?, ?, ?, ?)`);
    const info = stmt.run(name, moves, time, pairs);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: "db_error" });
  }
});

app.get("/api/scores", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  try {
    // Order: fewer moves first, then lower time
    const rows = db.prepare(`SELECT id, name, moves, time, pairs, created_at FROM scores ORDER BY moves ASC, time ASC LIMIT ?`).all(limit);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "db_error" });
  }
});

// In-memory cache for GitHub data (10 minutes)
// Simple per-repo in-memory cache: { '<owner/repo>': { ts: number, data: object } }
const cacheByRepo = {};
const DEFAULT_WARM_REPOS = [
  'Nileneb/SupportedGrowControl',
  'Nileneb/growdash',
  'habibidani/axia'
];

function parseWarmRepos() {
  if (process.env.WARM_GITHUB_REPOS) {
    return process.env.WARM_GITHUB_REPOS.split(',').map(s => s.trim()).filter(Boolean);
  }
  const repoFile = process.env.WARM_GITHUB_REPOS_FILE || './deploy/repos.txt';
  try {
    if (fs.existsSync(repoFile)) {
      const content = fs.readFileSync(repoFile, 'utf8');
      return content.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
    }
  } catch (e) {
    // ignore and fallback
  }
  return DEFAULT_WARM_REPOS;
}

async function warmCacheForRepo(repo) {
  try {
    const apiUrl = `https://api.github.com/repos/${repo}`;
    const headers = {
      "User-Agent": "mau-linn-games",
      "Accept": "application/vnd.github+json"
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    const resp = await fetch(apiUrl, { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    const slim = {
      full_name: data.full_name,
      html_url: data.html_url,
      description: data.description,
      stargazers_count: data.stargazers_count,
      forks_count: data.forks_count,
      open_issues_count: data.open_issues_count,
      license: data.license?.spdx_id || null,
      pushed_at: data.pushed_at
    };
    cacheByRepo[repo] = { ts: Date.now(), data: slim };
    console.log(`[warm] Cached ${repo}`);
    return slim;
  } catch (e) {
    console.warn(`[warm] Failed to warm ${repo}:`, e && e.message);
    return null;
  }
}

async function warmInitialCache() {
  const repos = parseWarmRepos();
  if (!repos || repos.length === 0) return;
  const concurrency = 3;
  const q = [...repos];
  const workers = Array.from({ length: Math.min(concurrency, q.length) }, async () => {
    while (q.length) {
      const repo = q.shift();
      if (!repo) break;
      await warmCacheForRepo(repo);
    }
  });
  await Promise.all(workers);
}
const TEN_MIN = 10 * 60 * 1000;

app.get("/api/github", async (req, res) => {
  try {
    const repo = String(req.query.repo || GITHUB_REPO).trim();

    // Basic validation to avoid SSRF / unwanted URLs - only allow owner/repo
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
      return res.status(400).json({ error: "invalid_repo" });
    }

    const now = Date.now();
    const cached = cacheByRepo[repo];
    if (cached && now - cached.ts < TEN_MIN) {
      return res.json(cached.data);
    }

    const apiUrl = `https://api.github.com/repos/${repo}`;
    const headers = {
      "User-Agent": "mau-linn-games",
      "Accept": "application/vnd.github+json"
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

    const resp = await fetch(apiUrl, { headers });
    if (!resp.ok) {
      return res.status(resp.status).json({ error: "github_fetch_failed" });
    }
    const data = await resp.json();
    const slim = {
      full_name: data.full_name,
      html_url: data.html_url,
      description: data.description,
      stargazers_count: data.stargazers_count,
      forks_count: data.forks_count,
      open_issues_count: data.open_issues_count,
      license: data.license?.spdx_id || null,
      pushed_at: data.pushed_at
    };

    cacheByRepo[repo] = { ts: now, data: slim };
    res.json(slim);
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

// Fallback to index.html (SPA-style)
app.get("*", (_req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

app.listen(PORT, async () => {
  console.log(`mau.linn.games listening on http://0.0.0.0:${PORT}`);
  try {
    await warmInitialCache();
    console.log('[warm] Initial cache warmed');
  } catch (e) {
    console.warn('[warm] Initial cache warm failed', e && e.message);
  }
});
