// === Full Game Hub Concept for "PromptParty" ===
// Extended with reconnection support, voice voting, player scores, multiple rounds, AI voice synthesis, and game conclusion

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');

// Load environment variables from .env file
require('dotenv').config(); // See .env.example for setup instructions

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let lobbies = {};
const disconnectedUsers = {}; // store for potential reconnections

const MAX_ROUNDS = 5;
const RECONNECT_TIMEOUT = 30000; // 30 seconds to reconnect

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create_lobby', ({ lobbyId, username }) => {
    socket.join(lobbyId);
    lobbies[lobbyId] = {
      users: [{ id: socket.id, username, score: 0 }],
      gameMode: null,
      currentImage: null,
      currentPrompt: null,
      votes: {},
      voiceSubmissions: [],
      voiceVotes: {},
      round: 1,
      state: 'waiting'
    };
    io.to(lobbyId).emit('lobby_update', lobbies[lobbyId]);
  });

  socket.on('join_lobby', ({ lobbyId, username }) => {
    socket.join(lobbyId);
    if (lobbies[lobbyId]) {
      if (disconnectedUsers[username] && disconnectedUsers[username].lobbyId === lobbyId) {
        const user = lobbies[lobbyId].users.find(u => u.username === username);
        if (user) user.id = socket.id;
        delete disconnectedUsers[username];
      } else {
        lobbies[lobbyId].users.push({ id: socket.id, username, score: 0 });
      }
      io.to(lobbyId).emit('lobby_update', lobbies[lobbyId]);
    }
  });

  socket.on('select_mode', ({ lobbyId, mode }) => {
    if (lobbies[lobbyId]) {
      lobbies[lobbyId].gameMode = mode;
      io.to(lobbyId).emit('mode_selected', mode);
    }
  });

  socket.on('submit_prompt', ({ lobbyId, prompt, image }) => {
    if (lobbies[lobbyId]) {
      lobbies[lobbyId].currentPrompt = prompt;
      lobbies[lobbyId].currentImage = image;
      lobbies[lobbyId].state = 'guessing';
      io.to(lobbyId).emit('new_image', image);
    }
  });

  socket.on('submit_guess', ({ lobbyId, guess, userId }) => {
    if (lobbies[lobbyId]) {
      if (!lobbies[lobbyId].votes[userId]) {
        lobbies[lobbyId].votes[userId] = guess;
      }
    }
  });

  socket.on('submit_voice', ({ lobbyId, audioURL, userId }) => {
    if (lobbies[lobbyId]) {
      const username = lobbies[lobbyId].users.find(u => u.id === userId)?.username || 'Unknown';
      lobbies[lobbyId].voiceSubmissions.push({ userId, username, audioURL });
      io.to(lobbyId).emit('new_voice', { userId, username, audioURL });
    }
  });

  socket.on('vote_voice', ({ lobbyId, votedId }) => {
    if (lobbies[lobbyId]) {
      if (!lobbies[lobbyId].voiceVotes[votedId]) lobbies[lobbyId].voiceVotes[votedId] = 0;
      lobbies[lobbyId].voiceVotes[votedId]++;
    }
  });

  socket.on('generate_voice', async ({ lobbyId, text, voiceType }) => {
    try {
      const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
        text,
        voice_settings: { stability: 0.5, similarity_boost: 0.5 }
      }, {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      });

      const audioBuffer = Buffer.from(response.data, 'binary');
      io.to(lobbyId).emit('ai_voice_ready', { audio: audioBuffer.toString('base64') });
    } catch (error) {
      console.error('Voice generation error:', error);
    }
  });

  socket.on('end_round', ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    const correctPrompt = lobby.currentPrompt;
    const results = [];

    for (const user of lobby.users) {
      const guess = lobby.votes[user.id];
      if (guess === correctPrompt) user.score += 1;
      results.push({
        username: user.username,
        guess,
        correct: guess === correctPrompt,
        score: user.score
      });
    }

    Object.entries(lobby.voiceVotes).forEach(([votedId, count]) => {
      const user = lobby.users.find(u => u.id === votedId);
      if (user) user.score += count;
    });

    io.to(lobbyId).emit('round_results', results);

    lobby.state = 'waiting';
    lobby.votes = {};
    lobby.voiceSubmissions = [];
    lobby.voiceVotes = {};
    lobby.round += 1;

    if (lobby.round > MAX_ROUNDS) {
      const finalScores = lobby.users.map(u => ({ username: u.username, score: u.score }));
      io.to(lobbyId).emit('game_will_end');
      setTimeout(() => {
        io.to(lobbyId).emit('game_over', finalScores);
        delete lobbies[lobbyId];
      }, 3000);
    }
  });

  socket.on('disconnect', () => {
    for (let lobbyId in lobbies) {
      const lobby = lobbies[lobbyId];
      const userIndex = lobby.users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        const user = lobby.users[userIndex];
        disconnectedUsers[user.username] = {
          lobbyId,
          timeout: setTimeout(() => {
            delete disconnectedUsers[user.username];
            io.to(lobbyId).emit('reconnect_timeout_expired', { username: user.username });
          }, RECONNECT_TIMEOUT)
        };
        console.log(`User ${user.username} disconnected, waiting ${RECONNECT_TIMEOUT / 1000}s for reconnection.`);
      }
      lobby.users = lobby.users.filter(u => u.id !== socket.id);

      if (lobby.users.length === 0) {
        delete lobbies[lobbyId];
        console.log(`Lobby ${lobbyId} deleted due to no active users.`);
      } else {
        io.to(lobbyId).emit('lobby_update', lobby);
      }
    }
  });
});

server.listen(4000, () => console.log('Server running on port 4000'));
