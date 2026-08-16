import { describe, expect, it } from 'vitest'

import { WorldManager } from './manager'

describe('worldManager', () => {
  it('should create with default bounds', () => {
    const world = new WorldManager()
    const bounds = world.getBounds()

    expect(bounds.min).toBeDefined()
    expect(bounds.max).toBeDefined()
  })

  it('should check if position is in bounds', () => {
    const world = new WorldManager({
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 },
      },
    })

    expect(world.isInBounds({ x: 5, y: 5, z: 5 })).toBe(true)
    expect(world.isInBounds({ x: 0, y: 0, z: 0 })).toBe(true)
    expect(world.isInBounds({ x: 10, y: 10, z: 10 })).toBe(true)
    expect(world.isInBounds({ x: -1, y: 5, z: 5 })).toBe(false)
    expect(world.isInBounds({ x: 11, y: 5, z: 5 })).toBe(false)
  })

  it('should clamp position to bounds', () => {
    const world = new WorldManager({
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 },
      },
    })

    const clamped = world.clampToBounds({ x: 15, y: -5, z: 5 })
    expect(clamped).toEqual({ x: 10, y: 0, z: 5 })
  })

  it('should check walkability', () => {
    const world = new WorldManager({
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 },
      },
      areas: [
        {
          id: 'obstacle',
          name: 'Wall',
          type: 'obstacle',
          bounds: {
            min: { x: 4, y: 0, z: 4 },
            max: { x: 6, y: 2, z: 6 },
          },
        },
      ],
    })

    expect(world.isWalkable({ x: 0, y: 0, z: 0 })).toBe(true)
    expect(world.isWalkable({ x: 5, y: 1, z: 5 })).toBe(false) // In obstacle
    expect(world.isWalkable({ x: 15, y: 0, z: 0 })).toBe(false) // Out of bounds
  })

  it('should get area at position', () => {
    const world = new WorldManager({
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 20, y: 10, z: 20 },
      },
      areas: [
        {
          id: 'zone1',
          name: 'Zone 1',
          type: 'interaction-zone',
          bounds: {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 5, y: 5, z: 5 },
          },
        },
      ],
    })

    const area = world.getAreaAt({ x: 2, y: 2, z: 2 })
    expect(area).toBeDefined()
    expect(area?.id).toBe('zone1')

    const noArea = world.getAreaAt({ x: 10, y: 0, z: 10 })
    expect(noArea).toBeUndefined()
  })

  it('should calculate distance', () => {
    const world = new WorldManager()

    const d1 = world.distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })
    expect(d1).toBe(5) // 3-4-5 triangle

    const d2 = world.distance({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })
    expect(d2).toBe(0)
  })

  it('should calculate direction', () => {
    const world = new WorldManager()

    const dir = world.direction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })
    expect(dir.x).toBe(1)
    expect(dir.y).toBe(0)
    expect(dir.z).toBe(0)

    const zeroDir = world.direction({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 })
    expect(zeroDir).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('should find path between positions', () => {
    const world = new WorldManager({
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 0, z: 10 },
      },
      gridResolution: 1,
    })

    const path = world.findPath(
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 },
    )

    expect(path.length).toBeGreaterThan(0)
    expect(path[0]).toEqual({ x: 0, y: 0, z: 0 })
    expect(path[path.length - 1]).toEqual({ x: 5, y: 0, z: 5 })
  })

  it('should get random walkable position', () => {
    const world = new WorldManager({
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 0, z: 10 },
      },
    })

    const pos = world.getRandomWalkablePosition()
    expect(world.isInBounds(pos)).toBe(true)
    expect(world.isWalkable(pos)).toBe(true)
  })

  it('should add and remove areas', () => {
    const world = new WorldManager()

    world.addArea({
      id: 'new-area',
      name: 'New Area',
      type: 'interaction-zone',
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 5, y: 5, z: 5 },
      },
    })

    expect(world.getAreas()).toHaveLength(1)

    const removed = world.removeArea('new-area')
    expect(removed).toBe(true)
    expect(world.getAreas()).toHaveLength(0)
  })

  it('should get agents near a position', () => {
    const world = new WorldManager()

    const agents = new Map([
      ['alice', {
        config: { id: 'alice', name: 'Alice', systemPrompt: '', model: { provider: '', model: '' }, memory: { shortTermCapacity: 10, enableLongTerm: false } },
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        activity: { type: 'idle' as const },
        goals: [],
        isSpeaking: false,
      }],
      ['bob', {
        config: { id: 'bob', name: 'Bob', systemPrompt: '', model: { provider: '', model: '' }, memory: { shortTermCapacity: 10, enableLongTerm: false } },
        position: { x: 10, y: 0, z: 10 },
        rotation: { x: 0, y: 0, z: 0 },
        activity: { type: 'idle' as const },
        goals: [],
        isSpeaking: false,
      }],
    ])

    const near = world.getAgentsNear({ x: 0, y: 0, z: 0 }, agents, 5)
    expect(near).toHaveLength(1)
    expect(near[0].config.id).toBe('alice')
  })
})
