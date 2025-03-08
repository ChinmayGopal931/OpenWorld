import { Position } from '../types/Player';

interface MovementData {
  position: Position;
  direction: 'up' | 'down' | 'left' | 'right';
  isMoving: boolean;
}

/**
 * Validate player movement data
 */
export function validatePlayerMovement(data: any): data is MovementData {
  if (!data || typeof data !== 'object') return false;
  
  // Check position
  if (!data.position || typeof data.position !== 'object') return false;
  if (typeof data.position.x !== 'number' || typeof data.position.y !== 'number') return false;
  
  // Check direction
  if (!['up', 'down', 'left', 'right'].includes(data.direction)) return false;
  
  // Check isMoving
  if (typeof data.isMoving !== 'boolean') return false;
  
  return true;
}