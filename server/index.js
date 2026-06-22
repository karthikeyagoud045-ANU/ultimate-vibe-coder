#!/usr/bin/env node

/**
 * Antigravity IDE — WebSocket Server for Yjs Collaboration
 *
 * A lightweight custom WebSocket server that relays Yjs document
 * updates and awareness data between connected clients.
 * In production, persists documents to Supabase.
 *
 * Usage:
 *   node server/index.js
 *
 * Environment variables:
 *   PORT — Server port (default: 8080)
 *   HOST — Server host (default: 0.0.0.0)
 *   NODE_ENV — "production" or "development"
 *   SUPABASE_URL — Supabase project URL (production)
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (production)
 *   ALLOWED_ORIGINS — Comma-separated list of allowed origins (production)
 */

const http = require("http");
const WebSocket = require("ws");
const Y = require("yjs");
const syncProtocol = require("y-protocols/sync");
const awarenessProtocol = require("y-protocols/awareness");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");

const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Supabase client (only initialized in production)
let supabase = null;

if (IS_PRODUCTION && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  console.log("[Supabase] Client initialized for document persistence");
}

// Message types matching y-websocket protocol
const messageSync = 0;
const messageAwareness = 1;

// Rate limiting for WebSocket connections
const rateLimits = new Map();
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const RATE_LIMIT_MAX_MESSAGES = 100; // Max messages per window

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  record.count++;
  if (record.count > RATE_LIMIT_MAX_MESSAGES) {
    return false;
  }
  return true;
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimits.delete(ip);
    }
  }
}, 10000);

// Store documents and their awareness instances by room
const docs = new Map();

// Dirty rooms that need to be persisted
const dirtyRooms = new Set();

// Debounced persistence
let persistTimeout = null;

function schedulePersistence() {
  if (persistTimeout) return;
  persistTimeout = setTimeout(async () => {
    persistTimeout = null;
    await persistDirtyRooms();
  }, 5000);
}

async function persistDirtyRooms() {
  if (!supabase || dirtyRooms.size === 0) return;

  const roomsToPersist = Array.from(dirtyRooms);
  dirtyRooms.clear();

  for (const roomName of roomsToPersist) {
    const state = docs.get(roomName);
    if (!state) continue;

    try {
      const stateVector = Y.encodeStateAsUpdate(state.doc);
      const base64State = Buffer.from(stateVector).toString("base64");

      const { error } = await supabase
        .from("yjs_documents")
        .upsert(
          {
            room_id: roomName,
            state_vector: base64State,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "room_id" }
        );

      if (error) {
        console.error(`[Supabase] Failed to persist room "${roomName}":`, error.message);
      } else {
        console.log(`[Supabase] Persisted room "${roomName}"`);
      }
    } catch (err) {
      console.error(`[Supabase] Error persisting room "${roomName}":`, err.message);
    }
  }
}

async function loadDocument(roomName) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("yjs_documents")
      .select("state_vector")
      .eq("room_id", roomName)
      .single();

    if (error || !data) return null;

    const stateVector = Buffer.from(data.state_vector, "base64");
    return stateVector;
  } catch (err) {
    console.error(`[Supabase] Error loading room "${roomName}":`, err.message);
    return null;
  }
}

function getYDoc(docname) {
  if (docs.has(docname)) {
    return docs.get(docname);
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const conns = new Set();

  const state = { doc, awareness, conns };
  docs.set(docname, state);

  // When the doc updates, broadcast to all connected clients
  doc.on("update", (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    conns.forEach((conn) => {
      if (conn !== origin && conn.readyState === WebSocket.OPEN) {
        try {
          conn.send(message);
        } catch {
          // Client disconnected
        }
      }
    });

    // Mark room as dirty for persistence
    if (IS_PRODUCTION) {
      dirtyRooms.add(docname);
      schedulePersistence();
    }
  });

  // When awareness changes, broadcast to all connected clients
  awareness.on("update", ({ added, updated, removed }) => {
    const changedClients = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);

    conns.forEach((conn) => {
      if (conn.readyState === WebSocket.OPEN) {
        try {
          conn.send(message);
        } catch {
          // Client disconnected
        }
      }
    });
  });

  return state;
}

// CORS origin check
function isOriginAllowed(origin) {
  if (!origin) return true;

  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (!allowedOrigins) return true;

  const allowed = allowedOrigins.split(",").map((o) => o.trim());
  return allowed.includes(origin);
}

// Create HTTP server for health checks
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;

  // CORS headers
  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "antigravity-ws",
        env: IS_PRODUCTION ? "production" : "development",
        uptime: Math.floor(process.uptime()),
        activeRooms: docs.size,
        connectedClients: Array.from(docs.values()).reduce(
          (sum, s) => sum + s.conns.size,
          0
        ),
        persistence: supabase ? "supabase" : "memory",
      })
    );
  } else if (req.url === "/health/ready") {
    // Readiness probe for Fly.io
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ready" }));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on("connection", async (ws, req) => {
  const roomName = req.url?.slice(1)?.split("?")[0] || "default";
  const origin = req.headers.origin;

  // Check CORS for WebSocket connections
  if (!isOriginAllowed(origin)) {
    console.warn(`[WS] Rejected connection from disallowed origin: ${origin}`);
    ws.close(1008, "Origin not allowed");
    return;
  }

  const { doc, awareness, conns } = getYDoc(roomName);
  conns.add(ws);

  console.log(
    `[${new Date().toISOString()}] + Client joined room "${roomName}" (${conns.size} in room)`
  );

  // If this is the first connection and we have Supabase, load persisted state
  if (conns.size === 1 && supabase) {
    const persistedState = await loadDocument(roomName);
    if (persistedState) {
      Y.applyUpdate(doc, persistedState);
      console.log(`[Supabase] Loaded persisted state for room "${roomName}"`);
    }
  }

  // Send initial sync step 1
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, messageSync);
  syncProtocol.writeSyncStep1(syncEncoder, doc);
  ws.send(encoding.toUint8Array(syncEncoder));

  // Send current awareness state
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        awareness,
        Array.from(awarenessStates.keys())
      )
    );
    ws.send(encoding.toUint8Array(awarenessEncoder));
  }

  ws.on("message", (data) => {
    // Rate limit check
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(clientIp)) {
      console.warn(`[WS] Rate limit exceeded for ${clientIp}`);
      ws.close(1008, "Rate limit exceeded");
      return;
    }

    try {
      const message = new Uint8Array(data);
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc, ws);

          // If there's a response (sync step 2), send it
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
          break;
        }
        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(
            awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
          break;
        }
        default:
          console.warn(`Unknown message type: ${messageType}`);
      }
    } catch (err) {
      console.error("Error processing message:", err.message);
    }
  });

  ws.on("close", () => {
    conns.delete(ws);

    // Remove awareness state for this client
    if (awareness.states.has(ws)) {
      awarenessProtocol.removeAwarenessStates(awareness, [ws], null);
    }

    console.log(
      `[${new Date().toISOString()}] - Client left room "${roomName}" (${conns.size} in room)`
    );

    // Clean up empty rooms after a delay (only in development)
    if (conns.size === 0 && !IS_PRODUCTION) {
      setTimeout(() => {
        if (conns.size === 0) {
          docs.delete(roomName);
          console.log(
            `[${new Date().toISOString()}] × Room "${roomName}" cleaned up`
          );
        }
      }, 30000);
    }
  });

  ws.on("error", (err) => {
    console.error(
      `[${new Date().toISOString()}] ! WebSocket error in room "${roomName}":`,
      err.message
    );
  });
});

// Start the server
server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   ⚡ Antigravity IDE — WebSocket Server      ║
║                                              ║
║   Listening on ${HOST}:${PORT}                  ║
║   Health:  http://localhost:${PORT}/health      ║
║   Env:     ${IS_PRODUCTION ? "production " : "development"}                     ║
║   Storage: ${supabase ? "Supabase      " : "In-Memory     "}                     ║
║                                              ║
║   Ready for collaborative editing!           ║
╚══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log("\n[WS] Shutting down WebSocket server...");

  // Persist all dirty rooms before shutdown
  if (IS_PRODUCTION && dirtyRooms.size > 0) {
    console.log(`[WS] Persisting ${dirtyRooms.size} dirty rooms...`);
    await persistDirtyRooms();
  }

  wss.close(() => {
    server.close(() => {
      console.log("[WS] Server stopped.");
      process.exit(0);
    });
  });
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
