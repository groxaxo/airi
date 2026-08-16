/**
 * 3D World Manager
 *
 * Manages the 3D environment for multi-agent interactions.
 */

import type { AgentState, Vector3, WorldBounds } from '../types'

/**
 * Navigation node for pathfinding
 */
export interface NavNode {
  position: Vector3
  neighbors: NavNode[]
  walkable: boolean
}

/**
 * World area definition
 */
export interface WorldArea {
  id: string
  name: string
  bounds: WorldBounds
  type: 'open' | 'obstacle' | 'interaction-zone'
}

/**
 * World configuration
 */
export interface WorldConfig {
  bounds: WorldBounds
  areas?: WorldArea[]
  gridResolution?: number // For pathfinding grid
}

const DEFAULT_CONFIG: WorldConfig = {
  bounds: {
    min: { x: -20, y: 0, z: -20 },
    max: { x: 20, y: 10, z: 20 },
  },
  gridResolution: 1,
}

/**
 * WorldManager handles 3D environment and navigation.
 */
export class WorldManager {
  private config: WorldConfig
  private areas: Map<string, WorldArea> = new Map()
  private navGrid: Map<string, NavNode> = new Map()

  constructor(config: Partial<WorldConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initializeAreas()
    this.buildNavGrid()
  }

  /**
   * Get world bounds
   */
  getBounds(): WorldBounds {
    return this.config.bounds
  }

  /**
   * Check if a position is within world bounds
   */
  isInBounds(position: Vector3): boolean {
    const { min, max } = this.config.bounds
    return (
      position.x >= min.x
      && position.x <= max.x
      && position.y >= min.y
      && position.y <= max.y
      && position.z >= min.z
      && position.z <= max.z
    )
  }

  /**
   * Clamp a position to world bounds
   */
  clampToBounds(position: Vector3): Vector3 {
    const { min, max } = this.config.bounds
    return {
      x: Math.max(min.x, Math.min(max.x, position.x)),
      y: Math.max(min.y, Math.min(max.y, position.y)),
      z: Math.max(min.z, Math.min(max.z, position.z)),
    }
  }

  /**
   * Get the area at a position
   */
  getAreaAt(position: Vector3): WorldArea | undefined {
    for (const area of this.areas.values()) {
      if (this.isInArea(position, area)) {
        return area
      }
    }
    return undefined
  }

  /**
   * Check if a position is walkable
   */
  isWalkable(position: Vector3): boolean {
    if (!this.isInBounds(position)) {
      return false
    }

    const area = this.getAreaAt(position)
    return !area || area.type !== 'obstacle'
  }

  /**
   * Find path from one position to another (simple A* pathfinding)
   */
  findPath(from: Vector3, to: Vector3): Vector3[] {
    // Snap to grid
    const startKey = this.positionToKey(this.snapToGrid(from))
    const endKey = this.positionToKey(this.snapToGrid(to))

    const startNode = this.navGrid.get(startKey)
    const endNode = this.navGrid.get(endKey)

    if (!startNode || !endNode || !startNode.walkable || !endNode.walkable) {
      // Direct path if grid nodes not found
      return [from, to]
    }

    // A* pathfinding
    const openSet = new Set<NavNode>([startNode])
    const cameFrom = new Map<NavNode, NavNode>()
    const gScore = new Map<NavNode, number>()
    const fScore = new Map<NavNode, number>()

    gScore.set(startNode, 0)
    fScore.set(startNode, this.heuristic(startNode.position, endNode.position))

    while (openSet.size > 0) {
      // Find node with lowest fScore
      let current: NavNode | undefined
      let lowestF = Infinity
      for (const node of openSet) {
        const f = fScore.get(node) ?? Infinity
        if (f < lowestF) {
          lowestF = f
          current = node
        }
      }

      if (!current) {
        break
      }

      if (current === endNode) {
        // Reconstruct path
        const path: Vector3[] = [current.position]
        let node = current
        while (cameFrom.has(node)) {
          node = cameFrom.get(node)!
          path.unshift(node.position)
        }
        return path
      }

      openSet.delete(current)

      for (const neighbor of current.neighbors) {
        if (!neighbor.walkable) {
          continue
        }

        const tentativeG = (gScore.get(current) ?? Infinity)
          + this.distance(current.position, neighbor.position)

        if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
          cameFrom.set(neighbor, current)
          gScore.set(neighbor, tentativeG)
          fScore.set(neighbor, tentativeG + this.heuristic(neighbor.position, endNode.position))
          openSet.add(neighbor)
        }
      }
    }

    // No path found - return direct path
    return [from, to]
  }

  /**
   * Get random walkable position
   */
  getRandomWalkablePosition(): Vector3 {
    const { min, max } = this.config.bounds
    const maxAttempts = 100

    for (let i = 0; i < maxAttempts; i++) {
      const position: Vector3 = {
        x: min.x + Math.random() * (max.x - min.x),
        y: min.y, // Keep on ground level
        z: min.z + Math.random() * (max.z - min.z),
      }

      if (this.isWalkable(position)) {
        return position
      }
    }

    // Fallback to center
    return {
      x: (min.x + max.x) / 2,
      y: min.y,
      z: (min.z + max.z) / 2,
    }
  }

  /**
   * Get agents near a position
   */
  getAgentsNear(
    position: Vector3,
    agents: Map<string, AgentState>,
    radius: number,
  ): AgentState[] {
    const result: AgentState[] = []

    for (const agent of agents.values()) {
      if (this.distance(position, agent.position) <= radius) {
        result.push(agent)
      }
    }

    return result
  }

  /**
   * Add an area to the world
   */
  addArea(area: WorldArea): void {
    this.areas.set(area.id, area)
    this.buildNavGrid() // Rebuild nav grid with new area
  }

  /**
   * Remove an area from the world
   */
  removeArea(areaId: string): boolean {
    const removed = this.areas.delete(areaId)
    if (removed) {
      this.buildNavGrid()
    }
    return removed
  }

  /**
   * Get all areas
   */
  getAreas(): WorldArea[] {
    return Array.from(this.areas.values())
  }

  /**
   * Calculate distance between two positions
   */
  distance(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const dz = a.z - b.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  /**
   * Calculate direction from one position to another
   */
  direction(from: Vector3, to: Vector3): Vector3 {
    const d = this.distance(from, to)
    if (d === 0) {
      return { x: 0, y: 0, z: 0 }
    }
    return {
      x: (to.x - from.x) / d,
      y: (to.y - from.y) / d,
      z: (to.z - from.z) / d,
    }
  }

  private initializeAreas(): void {
    if (this.config.areas) {
      for (const area of this.config.areas) {
        this.areas.set(area.id, area)
      }
    }
  }

  private buildNavGrid(): void {
    this.navGrid.clear()

    const resolution = this.config.gridResolution ?? 1
    const { min, max } = this.config.bounds

    // Create nodes
    for (let x = min.x; x <= max.x; x += resolution) {
      for (let z = min.z; z <= max.z; z += resolution) {
        const position: Vector3 = { x, y: min.y, z }
        const key = this.positionToKey(position)

        const area = this.getAreaAt(position)
        const walkable = !area || area.type !== 'obstacle'

        this.navGrid.set(key, {
          position,
          neighbors: [],
          walkable,
        })
      }
    }

    // Connect neighbors
    for (const node of this.navGrid.values()) {
      const neighbors = this.getNeighborPositions(node.position, resolution)
      for (const neighborPos of neighbors) {
        const neighborKey = this.positionToKey(neighborPos)
        const neighborNode = this.navGrid.get(neighborKey)
        if (neighborNode) {
          node.neighbors.push(neighborNode)
        }
      }
    }
  }

  private isInArea(position: Vector3, area: WorldArea): boolean {
    const { min, max } = area.bounds
    return (
      position.x >= min.x
      && position.x <= max.x
      && position.y >= min.y
      && position.y <= max.y
      && position.z >= min.z
      && position.z <= max.z
    )
  }

  private snapToGrid(position: Vector3): Vector3 {
    const resolution = this.config.gridResolution ?? 1
    return {
      x: Math.round(position.x / resolution) * resolution,
      y: Math.round(position.y / resolution) * resolution,
      z: Math.round(position.z / resolution) * resolution,
    }
  }

  private positionToKey(position: Vector3): string {
    return `${position.x},${position.y},${position.z}`
  }

  private getNeighborPositions(position: Vector3, resolution: number): Vector3[] {
    const neighbors: Vector3[] = []

    // 8 directions (no vertical movement)
    const offsets = [
      { x: resolution, z: 0 },
      { x: -resolution, z: 0 },
      { x: 0, z: resolution },
      { x: 0, z: -resolution },
      { x: resolution, z: resolution },
      { x: resolution, z: -resolution },
      { x: -resolution, z: resolution },
      { x: -resolution, z: -resolution },
    ]

    for (const offset of offsets) {
      neighbors.push({
        x: position.x + offset.x,
        y: position.y,
        z: position.z + offset.z,
      })
    }

    return neighbors
  }

  private heuristic(a: Vector3, b: Vector3): number {
    // Euclidean distance heuristic
    return this.distance(a, b)
  }
}
