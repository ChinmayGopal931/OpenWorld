// simple-server.ts - A minimal server to test Socket.io connections
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);

// Create a minimal Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Use longer timeouts
  pingTimeout: 60000,
  pingInterval: 25000
});

// Basic route to verify server is running
app.get('/', (req, res) => {
  res.send('Socket.io test server is running');
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`[TEST SERVER] Client connected: ${socket.id}`);
  
  // Just echo every event back to the client
  socket.onAny((eventName, ...args) => {
    console.log(`[TEST SERVER] Received ${eventName} from ${socket.id}:`, args);
    socket.emit(eventName + 'Response', { 
      received: args, 
      echo: true, 
      timestamp: Date.now() 
    });
  });
  
  // Handle ping specifically
  socket.on('ping', (data) => {
    console.log(`[TEST SERVER] Ping from ${socket.id}:`, data);
    socket.emit('pong', { timestamp: Date.now() });
  });
  
  // Handle join with minimal implementation
  socket.on('join', (data) => {
    try {
      console.log(`[TEST SERVER] Join request from ${socket.id}:`, data);
      
      // Send back minimal responses
      socket.emit('playerId', socket.id);
      
      socket.emit('initialState', {
        players: { [socket.id]: { 
          id: socket.id, 
          username: data.username,
          position: { x: 100, y: 100 },
          direction: 'down',
          isMoving: false,
          animationFrame: 0,
          color: '#2563EB'
        }},
        trees: [{ id: 1, x: 200, y: 200, size: 80, color: '#228B22' }]
      });
      
      console.log(`[TEST SERVER] Sent initialState to ${socket.id}`);
    } catch (err) {
      console.error(`[TEST SERVER] Error in join handler:`, err);
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[TEST SERVER] Client disconnected: ${socket.id}, Reason: ${reason}`);
  });
  
  // Handle explicit errors
  socket.on('error', (error) => {
    console.error(`[TEST SERVER] Socket error:`, error);
  });
});

// Start server
const PORT = 3002; // Use a different port from your main server
server.listen(PORT, () => {
  console.log(`[TEST SERVER] Simple test server running on port ${PORT}`);
});