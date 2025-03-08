// server/src/game/GameWorld.ts
import { Player,  Position, WorldChunk  } from '../types/Player';
import { ChunkGenerator } from './ChunkGenerator';
import { logger } from '../utils/logger';

export class GameWorld {
  private id: string;
  private players: Map<string, Player>;
  private maxPlayers: number;
  private chunkGenerator: ChunkGenerator;
  private loadedChunks: Map<string, WorldChunk> = new Map();
  private playerChunks: Map<string, Set<string>> = new Map();
  
  // World boundaries
  private worldWidth: number = 5000;
  private worldHeight: number = 5000;
  private chunkSize: number = 500;
  
  constructor(id: string, maxPlayers: number) {
    this.id = id;
    this.players = new Map();
    this.maxPlayers = maxPlayers;
    this.chunkGenerator = new ChunkGenerator(this.worldWidth, this.worldHeight, this.chunkSize);
  }
  
  /**
   * Get a chunk key from coordinates
   */
  private getChunkKey(x: number, y: number): string {
    const chunkX = Math.floor(x / this.chunkSize);
    const chunkY = Math.floor(y / this.chunkSize);
    return `${chunkX},${chunkY}`;
  }
  
  /**
   * Get the chunks that contain a position
   */
  private getChunksForPosition(position: Position, distance: number = 2): string[] {
    const centerChunkX = Math.floor(position.x / this.chunkSize);
    const centerChunkY = Math.floor(position.y / this.chunkSize);
    
    const chunkKeys: string[] = [];
    
    // Get chunks in square around position
    for (let x = centerChunkX - distance; x <= centerChunkX + distance; x++) {
      for (let y = centerChunkY - distance; y <= centerChunkY + distance; y++) {
        // Skip if outside world boundaries
        if (x < 0 || y < 0 || 
            x * this.chunkSize >= this.worldWidth || 
            y * this.chunkSize >= this.worldHeight) {
          continue;
        }
        
        chunkKeys.push(`${x},${y}`);
      }
    }
    
    return chunkKeys;
  }
  
  /**
   * Get a random spawn position in the world
   */
  public getSpawnPosition(): Position {
    // Start in center area of the world
    return {
      x: this.worldWidth / 2 + (Math.random() * 200 - 100),
      y: this.worldHeight / 2 + (Math.random() * 200 - 100)
    };
  }
  
  /**
   * Check if the world is full
   */
  public isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }
  
  /**
   * Add a player to the world
   */
  public addPlayer(player: Player): void {
    if (this.players.has(player.id)) {
      logger.warn(`Player ${player.id} already exists in world ${this.id}`);
      return;
    }
    
    this.players.set(player.id, player);
    
    // Track chunks for the new player
    const chunkKeys = this.getChunksForPosition(player.position);
    this.playerChunks.set(player.id, new Set(chunkKeys));
    
    // Load chunks if not already loaded
    for (const key of chunkKeys) {
      this.getOrGenerateChunk(key);
    }
  }
  
  /**
   * Update player data
   */
  public updatePlayer(player: Player): void {
    if (!this.players.has(player.id)) {
      logger.warn(`Cannot update player ${player.id} - not found in world ${this.id}`);
      return;
    }
    
    this.players.set(player.id, player);
  }
  
  /**
   * Remove a player from the world
   */
  public removePlayer(playerId: string): void {
    this.players.delete(playerId);
    this.playerChunks.delete(playerId);
  }
  
  /**
   * Get all players in the world
   */
  public getPlayers(): Player[] {
    return Array.from(this.players.values());
  }
  
  /**
   * Get player count
   */
  public getPlayerCount(): number {
    return this.players.size;
  }
  
  /**
   * Get or generate a chunk
   */
  private getOrGenerateChunk(chunkKey: string): WorldChunk {
    if (this.loadedChunks.has(chunkKey)) {
      return this.loadedChunks.get(chunkKey)!;
    }
    
    // Parse chunk coordinates
    const [chunkXStr, chunkYStr] = chunkKey.split(',');
    const chunkX = parseInt(chunkXStr);
    const chunkY = parseInt(chunkYStr);
    
    // Generate new chunk
    const chunk = this.chunkGenerator.generateChunk(chunkX, chunkY);
    this.loadedChunks.set(chunkKey, chunk);
    
    return chunk;
  }
  
  /**
   * Get all chunks near a position
   */
  public getChunksNearPosition(position: Position, distance: number = 2): WorldChunk[] {
    const chunkKeys = this.getChunksForPosition(position, distance);
    return chunkKeys.map(key => this.getOrGenerateChunk(key));
  }
  
  /**
   * Get new chunks for a player that has moved
   */
  public getNewChunksForPlayer(player: Player): WorldChunk[] {
    // Get current chunk keys for player position
    const currentChunkKeys = this.getChunksForPosition(player.position);
    
    // Get previously loaded chunk keys for player
    const prevChunkKeys = this.playerChunks.get(player.id) || new Set<string>();
    
    // Find new chunks
    const newChunkKeys = currentChunkKeys.filter(key => !prevChunkKeys.has(key));
    
    // Update player chunks
    this.playerChunks.set(player.id, new Set(currentChunkKeys));
    
    // Generate and return new chunks
    return newChunkKeys.map(key => this.getOrGenerateChunk(key));
  }
  
  /**
   * Get chunk for a specific position
   */
  public getChunkAtPosition(position: Position): WorldChunk {
    const chunkKey = this.getChunkKey(position.x, position.y);
    return this.getOrGenerateChunk(chunkKey);
  }
}