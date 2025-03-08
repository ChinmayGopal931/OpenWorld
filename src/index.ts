// server/src/index.ts
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import cors from 'cors';
import { GameWorld } from './game/GameWorld';
import { GameEvent, GameEventType, Player} from './types/Player';
import { logger } from './utils/logger';
import { validatePlayerMovement } from './utils/validation';

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const MAX_PLAYERS_PER_WORLD = parseInt(process.env.MAX_PLAYERS_PER_WORLD || '100');

// Set up Express app
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST']
  }
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

  logger.info(`New connection: ${socket.id}`);

  // Handle player join request
  socket.on('player:join', ({ username, worldId = 'default' }) => {
    try {
      // Get or create the requested game world
      const gameWorld = getOrCreateWorld(worldId);
      currentWorldId = worldId;

      // Check if world is full
      if (gameWorld.isFull()) {
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

      // Send join confirmation to the player
      socket.emit('player:joined', {
        player: currentPlayer,
        worldId,
        timestamp: Date.now()
      });

      // Send existing players to the new player
      const existingPlayers = gameWorld.getPlayers().filter(p => p.id !== playerId);
      if (existingPlayers.length > 0) {
        socket.emit('world:players', {
          players: existingPlayers,
          timestamp: Date.now()
        });
      }

      // Send world chunks around player
      const chunks = gameWorld.getChunksNearPosition(currentPlayer.position);
      socket.emit('world:chunks', {
        chunks,
        timestamp: Date.now()
      });

      // Broadcast the new player to all other players
      socket.to(worldId).emit('player:joined', {
        player: currentPlayer,
        worldId,
        timestamp: Date.now()
      });

      logger.info(`Player ${currentPlayer.username} (${playerId}) joined world ${worldId}`);
    } catch (error) {
      logger.error('Error in player:join handler', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Handle player movement
  socket.on('player:move', (data) => {
    if (!currentPlayer || !currentWorldId) return;

    try {
      // Validate the movement data
      if (!validatePlayerMovement(data)) {
        logger.warn(`Invalid movement data from ${currentPlayer.id}`);
        return;
      }

      const { position, direction, isMoving } = data;

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

      socket.to(currentWorldId).emit('player:move', moveEvent);

      // Check if player entered new chunks and send them if needed
      const newChunks = gameWorld.getNewChunksForPlayer(currentPlayer);
      if (newChunks.length > 0) {
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
    if (!currentPlayer || !currentWorldId) return;

    try {
      // Basic message validation
      const trimmedMessage = message.trim();
      if (!trimmedMessage || trimmedMessage.length > 500) return;

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
      
      logger.debug(`Chat from ${currentPlayer.username}: ${trimmedMessage.substring(0, 20)}${trimmedMessage.length > 20 ? '...' : ''}`);
    } catch (error) {
      logger.error('Error in chat:message handler', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (currentPlayer && currentWorldId) {
      const gameWorld = gameWorlds.get(currentWorldId);
      
      if (gameWorld) {
        // Remove player from world
        gameWorld.removePlayer(currentPlayer.id);
        
        // Broadcast player leave event
        socket.to(currentWorldId).emit('player:left', {
          playerId: currentPlayer.id,
          timestamp: Date.now()
        });
        
        logger.info(`Player ${currentPlayer.username} (${currentPlayer.id}) left world ${currentWorldId}`);
        
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
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    worldCount: gameWorlds.size,
    playerCount: Array.from(gameWorlds.values()).reduce((acc, world) => acc + world.getPlayerCount(), 0)
  });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  logger.info(`CORS origin set to ${CORS_ORIGIN}`);
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