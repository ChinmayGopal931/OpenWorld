// server/src/game/ChunkGenerator.ts
import { Tree, Bush, Flower, WorldChunk } from '../types/Player';

export class ChunkGenerator {
  private worldWidth: number;
  private worldHeight: number;
  private chunkSize: number;
  
  // Global ID counters to ensure uniqueness
  private nextTreeId: number = 1000000;
  private nextBushId: number = 2000000;
  private nextFlowerId: number = 3000000;
  
  constructor(worldWidth: number, worldHeight: number, chunkSize: number) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.chunkSize = chunkSize;
  }
  
  /**
   * Creates a seeded random number generator
   */
  private createSeededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }
  
  /**
   * Check if a new element would collide with existing elements
   */
  private checkCollisionWithExistingElements(
    x: number,
    y: number,
    size: number,
    existingElements: Array<{ x: number, y: number, size?: number }>
  ): boolean {
    // Add buffer space between elements
    const buffer = 10;
    
    for (const element of existingElements) {
      const elementSize = element.size || 10;
      
      // Simple circular collision detection
      const distance = Math.sqrt(
        Math.pow(x + size/2 - (element.x + elementSize/2), 2) + 
        Math.pow(y + size/2 - (element.y + elementSize/2), 2)
      );
      
      if (distance < (size/2 + elementSize/2 + buffer)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Generate trees within a chunk
   */
  private generateTrees(
    chunkX: number,
    chunkY: number,
    seed: number
  ): Tree[] {
    const random = this.createSeededRandom(seed);
    const trees: Tree[] = [];
    
    // Number of trees based on position in world
    const count = 5 + Math.floor((Math.sin(seed) + 1) * 5); // 5-15 trees
    
    for (let i = 0; i < count; i++) {
      const size = 80 + Math.floor(random() * 40);
      const variant = Math.floor(random() * 3);
      
      // Try to find a valid position
      let attempts = 0;
      let validPosition = false;
      let x = 0, y = 0;
      
      while (!validPosition && attempts < 50) {
        attempts++;
        x = chunkX * this.chunkSize + Math.floor(random() * (this.chunkSize - size));
        y = chunkY * this.chunkSize + Math.floor(random() * (this.chunkSize - size));
        
        validPosition = !this.checkCollisionWithExistingElements(x, y, size, trees);
      }
      
      if (validPosition) {
        trees.push({
          id: this.nextTreeId++,
          x,
          y,
          size,
          color: `hsl(${110 + random() * 30}, ${70 + random() * 10}%, ${35 + random() * 15}%)`,
          variant
        });
      }
    }
    
    return trees;
  }
  
  /**
   * Generate bushes within a chunk
   */
  private generateBushes(
    chunkX: number,
    chunkY: number,
    seed: number,
    existingElements: Array<{ x: number, y: number, size?: number }>
  ): Bush[] {
    const random = this.createSeededRandom(seed + 1);
    const bushes: Bush[] = [];
    
    // Number of bushes based on position in world
    const count = 8 + Math.floor((Math.cos(seed) + 1) * 7); // 8-22 bushes
    
    for (let i = 0; i < count; i++) {
      const size = 40 + Math.floor(random() * 20);
      const variant = Math.floor(random() * 3);
      
      // Try to find a valid position
      let attempts = 0;
      let validPosition = false;
      let x = 0, y = 0;
      
      while (!validPosition && attempts < 50) {
        attempts++;
        x = chunkX * this.chunkSize + Math.floor(random() * (this.chunkSize - size));
        y = chunkY * this.chunkSize + Math.floor(random() * (this.chunkSize - size));
        
        validPosition = !this.checkCollisionWithExistingElements(
          x, y, size, [...existingElements, ...bushes]
        );
      }
      
      if (validPosition) {
        bushes.push({
          id: this.nextBushId++,
          x,
          y,
          size,
          color: `hsl(${100 + random() * 50}, ${65 + random() * 15}%, ${30 + random() * 15}%)`,
          variant
        });
      }
    }
    
    return bushes;
  }
  
  /**
   * Generate flowers within a chunk
   */
  private generateFlowers(
    chunkX: number,
    chunkY: number,
    seed: number,
    existingElements: Array<{ x: number, y: number, size?: number }>
  ): Flower[] {
    const random = this.createSeededRandom(seed + 2);
    const flowers: Flower[] = [];
    
    // Number of flowers based on position in world
    const count = 15 + Math.floor((Math.sin(seed * 0.1) + 1) * 10); // 15-35 flowers
    
    const flowerColors = [
      '#FF5733', // Orange
      '#DAF7A6', // Light Green
      '#FFC300', // Yellow
      '#C70039', // Red
      '#900C3F', // Maroon
      '#581845', // Purple
      '#FFFFFF', // White
      '#FFC0CB', // Pink
      '#3D85C6'  // Blue
    ];
    
    for (let i = 0; i < count; i++) {
      // Flowers are small, so less collision checking needed
      const x = chunkX * this.chunkSize + Math.floor(random() * this.chunkSize);
      const y = chunkY * this.chunkSize + Math.floor(random() * this.chunkSize);
      const color = flowerColors[Math.floor(random() * flowerColors.length)];
      
      // Simple check to avoid placing flowers directly on trees or bushes
      let validPosition = true;
      
      for (const element of existingElements) {
        const elementSize = element.size || 10;
        const distance = Math.sqrt(
          Math.pow(x - (element.x + elementSize/2), 2) + 
          Math.pow(y - (element.y + elementSize/2), 2)
        );
        
        if (distance < elementSize/2) {
          validPosition = false;
          break;
        }
      }
      
      if (validPosition) {
        flowers.push({
          id: this.nextFlowerId++,
          x,
          y,
          color
        });
      }
    }
    
    return flowers;
  }
  
  /**
   * Generate a complete chunk
   */
  public generateChunk(chunkX: number, chunkY: number): WorldChunk {
    // Use coordinated-based seed for deterministic generation
    const chunkSeed = chunkX * 10000 + chunkY;
    
    // Generate trees first
    const trees = this.generateTrees(chunkX, chunkY, chunkSeed);
    
    // Generate bushes, avoiding trees
    const bushes = this.generateBushes(chunkX, chunkY, chunkSeed, trees);
    
    // Generate flowers, avoiding trees and bushes
    const flowers = this.generateFlowers(chunkX, chunkY, chunkSeed, [...trees, ...bushes]);
    
    return {
      x: chunkX,
      y: chunkY,
      trees,
      bushes,
      flowers,
      isLoaded: true
    };
  }
}