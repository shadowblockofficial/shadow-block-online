
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("SHADOW BLOCK room server is running");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function leave(ws) {
  const code = ws.roomCode;
  if (!code) return;

  const room = rooms.get(code);
  ws.roomCode = null;
  if (!room) return;

  room.delete(ws);
  for (const client of room) {
    send(client, { type: "peer_left" });
  }
  if (room.size === 0) rooms.delete(code);
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Invalid JSON" });
    }

    if (msg.type === "create_room") {
      leave(ws);
      const code = makeCode();
      const room = new Set([ws]);
      rooms.set(code, room);
      ws.roomCode = code;
      return send(ws, { type: "room_created", code });
    }

    if (msg.type === "join_room") {
      const code = String(msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);

      if (!room) {
        return send(ws, { type: "error", message: "Room not found" });
      }
      if (room.size >= 2) {
        return send(ws, { type: "error", message: "Room is full" });
      }

      leave(ws);
      room.add(ws);
      ws.roomCode = code;
      send(ws, { type: "room_joined", code });
      for (const client of room) {
        if (client !== ws) send(client, { type: "peer_joined" });
      }
      return;
    }

    if (msg.type === "relay") {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      for (const client of room) {
        if (client !== ws) send(client, { type: "relay", data: msg.data });
      }
    }
  });

  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});

const port = process.env.PORT || 10000;
server.listen(port, "0.0.0.0", () => {
  console.log(`SHADOW BLOCK server listening on ${port}`);
});
