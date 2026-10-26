
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("SHADOW BLOCK room server is running");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function leave(ws) {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  ws.roomCode = null;
  if (!room) return;
  room.delete(ws);
  for (const client of room) send(client, { type: "opponent_left" });
  if (room.size === 0) rooms.delete(code);
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Geçersiz mesaj." });
    }

    const action = msg.action || msg.type;

    if (action === "create_room") {
      leave(ws);
      const code = makeCode();
      rooms.set(code, new Set([ws]));
      ws.roomCode = code;
      ws.seat = "blue";
      return send(ws, { type: "room_created", code, seat: ws.seat });
    }

    if (action === "join_room") {
      const code = String(msg.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: "error", message: "Oda bulunamadı." });
      if (room.size >= 2) return send(ws, { type: "error", message: "Oda dolu." });

      leave(ws);
      room.add(ws);
      ws.roomCode = code;
      ws.seat = "purple";
      send(ws, { type: "room_joined", code, seat: ws.seat });
      for (const client of room) {
        if (client !== ws) send(client, { type: "player_joined" });
      }
      return;
    }

    if (action === "state") {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      for (const client of room) {
        if (client !== ws) send(client, { type: "state", data: msg.data || {} });
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
