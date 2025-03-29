// server.js (Cleaned + MongoDB Integrated)
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// MongoDB connection
mongoose.connect("mongodb+srv://admin:admin@cluster0.zzinnu7.mongodb.net/chatx?retryWrites=true&w=majority&appName=Cluster0", { family: 4 })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from /client
app.use(express.static(path.join(__dirname, 'client')));

// Mongoose model
const User = require('./models/User');

// === AUTHENTICATION ROUTES ===

app.post('/register', async (req, res) => {
  const { username, password, dob, gender } = req.body;
  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: "User already exists" });

    const newUser = new User({ username, password, dob, gender, contacts: [], messages: [] });
    await newUser.save();
    res.status(200).json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: "Server error during registration" });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username, password });
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    res.status(200).json({ message: "Login successful", username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Server error during login" });
  }
});

// === WEBSOCKET HANDLING ===
let clients = {};
let groups = {};

wss.on("connection", (ws, req) => {
  console.log('New WebSocket connection');
  let username = null; // declared once here

  ws.on("message", async (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error("Invalid JSON:", error);
      return;
    }

    // === WS AUTH ===
    if (message.type === "connect") {
      username = message.username; // ✅ update the outer username

      if (clients[username]) {
        ws.send(JSON.stringify({ type: "error", message: "Username already taken" }));
        ws.close();
        return;
      }

      clients[username] = ws;
      console.log(`${username} connected`);

      // ✅ AUTH RESPONSE FIXED
      ws.send(JSON.stringify({
        type: "connect-response",
        success: true
      }));

      broadcastUserList();
    }

    // === CHAT MESSAGE ===
    else if (message.type === "message") {
      const isGroup = message.recipient.startsWith("group-");
      const timestamp = new Date();
      const payload = {
        type: "message",
        sender: message.sender,
        recipient: message.recipient,
        message: message.message,
        timestamp: timestamp.toLocaleString()
      };

      // Save to MongoDB for both sender and recipient
      try {
        const chatEntry = {
          with: message.recipient,
          chat: {
            sender: message.sender,
            message: message.message,
            timestamp: timestamp
          }
        };

        await User.updateOne({ username: message.sender }, {
          $addToSet: { contacts: message.recipient },
          $push: { messages: chatEntry }
        });

        await User.updateOne({ username: message.recipient }, {
          $addToSet: { contacts: message.sender },
          $push: { messages: { ...chatEntry, with: message.sender } }
        });
      } catch (err) {
        console.error("MongoDB chat save error:", err);
      }

      // Broadcast
      if (isGroup && groups[message.recipient]) {
        groups[message.recipient].forEach(member => {
          if (member !== message.sender && clients[member]) {
            clients[member].send(JSON.stringify(payload));
          }
        });
      } else if (clients[message.recipient]) {
        clients[message.recipient].send(JSON.stringify(payload));
      }
    }
  });

  // === CLEAN DISCONNECT ===
  ws.on("close", () => {
    if (username && clients[username]) {
      console.log(`${username} disconnected`);
      delete clients[username];
      broadcastUserList();
    }
  });
});

// === ACTIVE USER BROADCAST ===
function broadcastUserList() {
  const users = Object.keys(clients);
  const msg = JSON.stringify({ type: "updateUsers", users });
  for (let user in clients) {
    if (clients[user].readyState === WebSocket.OPEN) {
      clients[user].send(msg);
    }
  }
}

// === FALLBACK FOR ROUTES (SPA) ===
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/index.html'));
});

// === START SERVER ===
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server (HTTP + WS) running on port ${PORT}`);
});
