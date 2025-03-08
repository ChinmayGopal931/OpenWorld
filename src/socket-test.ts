// minimal-server.ts
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('Minimal test server running');
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('ping', () => {
    console.log(`Ping from ${socket.id}`);
    socket.emit('pong', { time: Date.now() });
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
  });
});

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`Minimal test server running on port ${PORT}`);
});