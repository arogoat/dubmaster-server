# DubMaster Server 🧠

Socket.io backend server for DubMaster.

## 🌐 Hosting

This server is hosted at:
https://dubmaster-server.onrender.com

## 🧱 Stack
- Node.js
- Express
- Socket.io

## 🧪 Local Development

```bash
npm install
node server.js
```

Runs on port `4000`.

## 📡 Socket Events

- `create_lobby` → { lobbyId, username }
- `join_lobby` → { lobbyId, username }
- `select_mode` → { lobbyId, mode }
- `lobby_update` → Broadcasted to all users

## 📁 Structure

- `server.js` – Main socket logic
- In-memory lobby state

> No persistent storage – all game state is in memory.

## 🔗 Related Repository
[dubmaster-frontend](https://github.com/arogoat/dubmaster-frontend)
