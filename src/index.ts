// server/src/index.ts
// Update your server code with these CORS fixes and debugging improvements

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import cors from 'cors';
import { GameWorld } from './game/GameWorld';
import { GameEvent, GameEventType, Player } from './types/Player';
import { logger } from './utils/logger';
import { validatePlayerMovement } from './utils/validation';

// Load environment variables
dotenv.config();

// Configuration - IMPORTANT: Updated to allow all origins or specify your actual client origin
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'; // Update to match your client!
const MAX_PLAYERS_PER_WORLD = parseInt(process.env.MAX_PLAYERS_PER_WORLD || '100');

// Set up Express app with proper CORS
const app = express();

// Configure CORS for Express routes
app.use(cors({
  origin: '*', // Allow all origins for testing, or set to your specific client origin
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server with proper CORS configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: '*', // Allow all origins for testing, or set to your specific client origin
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Additional options for debugging
  connectTimeout: 30000,
  pingTimeout: 30000,
  pingInterval: 10000
});

// Debug middleware for Socket.IO
io.use((socket, next) => {
  logger.info(`New connection attempt: ${socket.id} from ${socket.handshake.address}`);
  
  // Debug origin info
  logger.info(`Origin: ${socket.handshake.headers.origin}`);
  logger.info(`Headers: ${JSON.stringify(socket.handshake.headers)}`);
  
  next();
});

// Game worlds map (support for multiple worlds/instances)
const gameWorlds = new Map<string, GameWorld>();

// Get or create a game world
function getOrCreateWorld(worldId: string): GameWorld {
  if (!gameWorlds.has(worldId)) {
    logger.info(`Creating new game world: ${worldId}`);
    const newWorld = new GameWorld(worldId, MAX_PLAYERS_PER_WORLD);
    gameWorlds.set(worldId, newWorld);
    return newWorld;
  }
  return gameWorlds.get(worldId)!;
}

// Socket.IO connection handler
io.on('connection', (socket) => {
  let currentPlayer: Player | null = null;
  let currentWorldId: string | null = null;

  logger.info(`New connection established: ${socket.id}`);

  // Handle player join request
  socket.on('player:join', ({ username, worldId = 'default' }) => {
    try {
      logger.info(`Player ${username} is attempting to join world ${worldId}`);
      
      // Get or create the requested game world
      const gameWorld = getOrCreateWorld(worldId);
      currentWorldId = worldId;

      // Check if world is full
      if (gameWorld.isFull()) {
        logger.warn(`World ${worldId} is full, rejecting player ${username}`);
        socket.emit('error', { message: 'World is full' });
        return;
      }

      // Create new player
      const playerId = uuidv4();
      currentPlayer = {
        id: playerId,
        username: username || `Player-${playerId.substring(0, 5)}`,
        position: gameWorld.getSpawnPosition(),
        direction: 'down',
        isMoving: false,
        lastUpdate: Date.now()
      };

      // Add player to world
      gameWorld.addPlayer(currentPlayer);

      // Join the socket to the world's room
      socket.join(worldId);

      logger.info(`Player ${currentPlayer.username} (${playerId}) joined world ${worldId} at position (${currentPlayer.position.x}, ${currentPlayer.position.y})`);

      // Send join confirmation to the player
      socket.emit('player:joined', {
        player: currentPlayer,
        worldId,
        timestamp: Date.now()
      });

      // Send existing players to the new player
      const existingPlayers = gameWorld.getPlayers().filter(p => p.id !== playerId);
      logger.info(`Sending ${existingPlayers.length} existing players to ${username}`);
      
      if (existingPlayers.length > 0) {
        socket.emit('world:players', {
          players: existingPlayers,
          timestamp: Date.now()
        });
      }

      // Send world chunks around player
      const chunks = gameWorld.getChunksNearPosition(currentPlayer.position);
      logger.info(`Sending ${chunks.length} chunks to ${username}`);
      
      socket.emit('world:chunks', {
        chunks,
        timestamp: Date.now()
      });

      // Broadcast the new player to all other players
      logger.info(`Broadcasting new player ${username} to other players in world ${worldId}`);
      
      socket.to(worldId).emit('player:joined', {
        player: currentPlayer,
        worldId,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error in player:join handler', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Handle player movement
  socket.on('player:move', (data) => {
    if (!currentPlayer || !currentWorldId) {
      logger.warn(`Received movement from unauthenticated player: ${socket.id}`);
      return;
    }

    try {
      // Validate the movement data
      if (!validatePlayerMovement(data)) {
        logger.warn(`Invalid movement data from ${currentPlayer.id}: ${JSON.stringify(data)}`);
        return;
      }

      const { position, direction, isMoving } = data;

      // Debug occasional position updates
      if (Math.random() < 0.01) {
        logger.debug(`Player ${currentPlayer.username} moved to (${position.x}, ${position.y})`);
      }

      // Update player in world
      const gameWorld = gameWorlds.get(currentWorldId)!;
      
      // Simple anti-cheat: check if movement is within reasonable limits
      const lastPosition = currentPlayer.position;
      const movementDistance = Math.sqrt(
        Math.pow(position.x - lastPosition.x, 2) + 
        Math.pow(position.y - lastPosition.y, 2)
      );

      // If the movement is too large, reject it
      const MAX_MOVEMENT_PER_UPDATE = 20; // Adjust based on your game's movement speed
      if (movementDistance > MAX_MOVEMENT_PER_UPDATE) {
        logger.warn(`Suspicious movement from ${currentPlayer.id}: distance=${movementDistance}`);
        // Option 1: Reject the movement
        return;
        // Option 2: Teleport player back (uncommenting the line below would enable this)
        // socket.emit('player:teleport', { position: lastPosition });
      }

      // Update player data
      currentPlayer.position = position;
      currentPlayer.direction = direction;
      currentPlayer.isMoving = isMoving;
      currentPlayer.lastUpdate = Date.now();

      // Update in world
      gameWorld.updatePlayer(currentPlayer);

      // Broadcast movement to other players
      const moveEvent: GameEvent = {
        type: GameEventType.PLAYER_MOVE,
        timestamp: Date.now(),
        data: {
          playerId: currentPlayer.id,
          position,
          direction,
          isMoving
        }
      };

      // Debug occasional broadcasts
      if (Math.random() < 0.01) {
        logger.debug(`Broadcasting movement of ${currentPlayer.username} to ${gameWorld.getPlayerCount() - 1} other players`);
      }

      socket.to(currentWorldId).emit('player:move', moveEvent);

      // Check if player entered new chunks and send them if needed
      const newChunks = gameWorld.getNewChunksForPlayer(currentPlayer);
      if (newChunks.length > 0) {
        logger.debug(`Sending ${newChunks.length} new chunks to ${currentPlayer.username}`);
        socket.emit('world:chunks', {
          chunks: newChunks,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error('Error in player:move handler', error);
    }
  });

  // Handle chat messages
  socket.on('chat:message', (message) => {
    if (!currentPlayer || !currentWorldId) {
      logger.warn(`Received chat from unauthenticated client: ${socket.id}`);
      return;
    }

    try {
      // Basic message validation
      const trimmedMessage = message.trim();
      if (!trimmedMessage || trimmedMessage.length > 500) {
        logger.warn(`Invalid chat message from ${currentPlayer.id}: length=${message.length}`);
        return;
      }

      logger.info(`Chat from ${currentPlayer.username}: ${trimmedMessage.substring(0, 50)}${trimmedMessage.length > 50 ? '...' : ''}`);

      const chatEvent = {
        type: GameEventType.CHAT_MESSAGE,
        timestamp: Date.now(),
        data: {
          playerId: currentPlayer.id,
          username: currentPlayer.username,
          message: trimmedMessage
        }
      };

      // Broadcast to all players in the world
      io.to(currentWorldId).emit('chat:message', chatEvent);
    } catch (error) {
      logger.error('Error in chat:message handler', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (currentPlayer && currentWorldId) {
      const gameWorld = gameWorlds.get(currentWorldId);
      
      if (gameWorld) {
        logger.info(`Player ${currentPlayer.username} (${currentPlayer.id}) left world ${currentWorldId}`);
        
        // Remove player from world
        gameWorld.removePlayer(currentPlayer.id);
        
        // Broadcast player leave event
        socket.to(currentWorldId).emit('player:left', {
          playerId: currentPlayer.id,
          timestamp: Date.now()
        });
        
        // Clean up empty worlds after a delay
        if (gameWorld.getPlayerCount() === 0) {
          setTimeout(() => {
            // Check again after timeout to make sure it's still empty
            if (gameWorld.getPlayerCount() === 0) {
              gameWorlds.delete(currentWorldId!);
              logger.info(`Removed empty world: ${currentWorldId}`);
            }
          }, 60000); // Clean up after 1 minute
        }
      }
    }
    
    logger.info(`Connection closed: ${socket.id}`);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  // Count total players across all worlds
  const totalPlayers = Array.from(gameWorlds.values()).reduce(
    (acc, world) => acc + world.getPlayerCount(), 0
  );
  
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    worldCount: gameWorlds.size,
    playerCount: totalPlayers,
    worlds: Array.from(gameWorlds.entries()).map(([id, world]) => ({
      id,
      players: world.getPlayerCount()
    }))
  });
});

// Debug endpoint to get current state
app.get('/debug', (req, res) => {
  const worldData = Array.from(gameWorlds.entries()).map(([id, world]) => ({
    id,
    playerCount: world.getPlayerCount(),
    players: world.getPlayers().map(p => ({
      id: p.id,
      username: p.username,
      position: p.position,
      direction: p.direction,
      isMoving: p.isMoving,
      lastUpdate: new Date(p.lastUpdate).toISOString()
    }))
  }));
  
  res.status(200).json({
    socketConnections: io.engine.clientsCount,
    worlds: worldData
  });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  logger.info(`CORS origin set to ${CORS_ORIGIN} (actual config set to allow all origins for testing)`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function shutdown(signal: string) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  
  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Notify all connected clients
    io.emit('server:shutdown', { message: 'Server is shutting down' });
    
    // Close Socket.IO connections
    io.close(() => {
      logger.info('All connections closed');
      process.exit(0);
    });
  });
  
  // Force shutdown after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}