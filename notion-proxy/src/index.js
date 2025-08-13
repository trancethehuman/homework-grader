import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8765;
const NOTION_CLIENT_ID =
  process.env.NOTION_CLIENT_ID || "234d872b-594c-80ec-9dac-00379870e655";
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.REDIRECT_URI || "http://localhost:8765/callback";

// Optional helper: when running locally while using a hosted authUrl, allow CORS from that origin
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

if (!NOTION_CLIENT_SECRET) {
  console.warn(
    "NOTION_CLIENT_SECRET is not set. Configure in Render environment variables."
  );
}

const pendingTokens = new Map();

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/auth/login", (req, res) => {
  const state = req.query.state || "";
  const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${encodeURIComponent(
    NOTION_CLIENT_ID
  )}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

app.get("/auth/start", (req, res) => {
  const state = Math.random().toString(36).slice(2);
  const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${encodeURIComponent(
    NOTION_CLIENT_ID
  )}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&state=${encodeURIComponent(state)}`;
  pendingTokens.set(state, null);
  res.json({ authUrl, state });
});

app.get("/auth/status/:state", (req, res) => {
  const { state } = req.params;
  if (!pendingTokens.has(state)) {
    return res.status(404).json({ status: "not_found" });
  }
  const token = pendingTokens.get(state);
  if (!token) {
    return res.json({ status: "pending" });
  }
  res.json({ status: "complete", token });
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state || "";
  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }

  try {
    const basic = Buffer.from(
      `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
    ).toString("base64");
    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res
        .status(500)
        .send(
          `<html><body><h2>Token exchange failed</h2><pre>${text}</pre></body></html>`
        );
    }

    const data = await response.json();
    if (state && pendingTokens.has(state)) {
      pendingTokens.set(state, data);
    }
    res.send(
      "<html><body><h2>Notion authorization complete</h2><p>You can return to the CLI.</p></body></html>"
    );
  } catch (error) {
    res
      .status(500)
      .send(
        `<html><body><h2>Token exchange error</h2><pre>${error.message}</pre></body></html>`
      );
  }
});

app.post("/exchange", async (req, res) => {
  const { code, redirect_uri } = req.body || {};
  if (!code || !redirect_uri) {
    return res.status(400).json({ error: "Missing code or redirect_uri" });
  }
  try {
    const basic = Buffer.from(
      `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
    ).toString("base64");
    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      return res
        .status(500)
        .json({ error: "Token exchange failed", details: text });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Token exchange error", message: error.message });
  }
});

app.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ error: "Missing refresh_token" });
  }

  try {
    const basic = Buffer.from(
      `${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`
    ).toString("base64");
    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: "Refresh failed", details: text });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Refresh error", message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Notion proxy listening on :${PORT}`);
});
