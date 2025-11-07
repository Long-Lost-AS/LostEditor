import { z } from 'zod'

// Note: BigIntSchema removed - we now use regular numbers for tile IDs

// ===========================
// Collision Schemas
// ===========================

export const PointSchema = z.object({
  x: z.number(),
  y: z.number()
})

export const PolygonColliderSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  points: z.array(PointSchema)
})

// ===========================
// Tileset Schemas
// ===========================

export const SpriteRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
})

export const SpriteLayerSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  tilesetId: z.string(),
  sprite: SpriteRectSchema,
  offset: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  origin: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  rotation: z.number().optional(),
  zIndex: z.number(),
  ysortOffset: z.number().optional()
})

export const TileDefinitionSchema = z.object({
  id: z.number(),
  x: z.number().optional(),  // Optional in saved files (unpacked from ID on load)
  y: z.number().optional(),  // Optional in saved files (unpacked from ID on load)
  isCompound: z.boolean().optional(),  // True if this is a compound/multi-tile sprite
  width: z.number().optional(),
  height: z.number().optional(),
  origin: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  colliders: z.array(PolygonColliderSchema).optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  properties: z.record(z.string()).optional()
})

export const TerrainTileSchema = z.object({
  tileId: z.number(),
  bitmask: z.number()
})

export const TerrainLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  tiles: z.array(TerrainTileSchema).optional()
})

// Entity definition is recursive, so we need to define it with z.lazy
export const EntityDefinitionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.string().optional(),
    sprites: z.array(SpriteLayerSchema).default([]),
    offset: z.object({
      x: z.number(),
      y: z.number()
    }).optional(),
    rotation: z.number().optional(),
    colliders: z.array(PolygonColliderSchema).optional(),
    children: z.array(EntityDefinitionSchema).optional(),
    properties: z.record(z.string()).optional(),
    filePath: z.string().optional()
  })
)

export const TilesetDataSchema = z.object({
  name: z.string(),
  id: z.string().optional(),
  order: z.number().int().nonnegative(), // Numeric order for deterministic ordering
  imagePath: z.string(),
  tileWidth: z.number(),
  tileHeight: z.number(),
  tiles: z.array(TileDefinitionSchema).optional(),
  terrainLayers: z.array(TerrainLayerSchema).optional()
})

// ===========================
// Map Schemas
// ===========================

// TileSchema removed - tiles are now stored as dense array of numbers

// Entity instance is also recursive
export const EntityInstanceSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    x: z.number(),
    y: z.number(),
    entityDefId: z.string(),
    tilesetId: z.string(),
    rotation: z.number().optional(),
    scale: z.object({
      x: z.number(),
      y: z.number()
    }).optional(),
    properties: z.record(z.string()).optional(),
    children: z.array(EntityInstanceSchema).optional()
  })
)

export const LayerTypeSchema = z.enum(['tile', 'entity'])

export const LayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  type: LayerTypeSchema,
  tiles: z.array(z.number()).default([]), // Dense array of packed tile IDs
  entities: z.array(EntityInstanceSchema).default([]),
  autotilingEnabled: z.boolean().optional().default(true)
})

export const MapDataSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  tileWidth: z.number().positive(),
  tileHeight: z.number().positive(),
  layers: z.array(LayerSchema).default([])
})

// Schemas for serialized format (version 4.0 - dense array with regular numbers)
export const SerializedLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  type: LayerTypeSchema,
  tiles: z.array(z.number()).default([]),  // Dense array of packed tile IDs
  entities: z.array(EntityInstanceSchema).default([]),
  autotilingEnabled: z.boolean().optional().default(true)
})

export const SerializedMapDataSchema = z.object({
  version: z.literal("4.0"),  // New version
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  tileWidth: z.number().positive(),
  tileHeight: z.number().positive(),
  layers: z.array(SerializedLayerSchema).default([]),
  entities: z.array(EntityInstanceSchema).optional().default([])  // Entities at map level
})

// Map file schema (for .lostmap files) - accepts old and new formats
export const MapFileSchema = z.union([
  // Version 1: Original format (without version field, with tilesetId)
  z.object({
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    tileWidth: z.number().positive(),
    tileHeight: z.number().positive(),
    layers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      visible: z.boolean(),
      type: LayerTypeSchema,
      tiles: z.array(z.object({
        x: z.number(),
        y: z.number(),
        tilesetId: z.string(),
        tileId: z.number(),
        cellX: z.number().optional(),
        cellY: z.number().optional()
      })).default([]),
      entities: z.array(EntityInstanceSchema).default([]),
      autotilingEnabled: z.boolean().optional().default(true)
    })).default([]),
    lastModified: z.string()
  }),
  // Version 2: firstgid format (with version "2.0" and tilesetReferences)
  z.object({
    version: z.literal("2.0"),
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    tileWidth: z.number().positive(),
    tileHeight: z.number().positive(),
    tilesetReferences: z.array(z.object({
      id: z.string(),
      source: z.string(),
      firstgid: z.number(),
      tileCount: z.number()
    })),
    layers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      visible: z.boolean(),
      type: LayerTypeSchema,
      tiles: z.array(z.object({
        x: z.number(),
        y: z.number(),
        gid: z.number(),
        cellX: z.number().optional(),
        cellY: z.number().optional()
      })).default([]),
      entities: z.array(EntityInstanceSchema).default([]),
      autotilingEnabled: z.boolean().optional().default(true)
    })).default([])
  }),
  // Version 3: BigInt global tile IDs (with version "3.0" - sparse array)
  z.object({
    version: z.literal("3.0"),
    name: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
    tileWidth: z.number().positive(),
    tileHeight: z.number().positive(),
    layers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      visible: z.boolean(),
      type: LayerTypeSchema,
      tiles: z.array(z.object({
        x: z.number(),
        y: z.number(),
        gid: z.string(),  // BigInt as string
        cellX: z.number().optional(),
        cellY: z.number().optional()
      })).default([]),
      entities: z.array(EntityInstanceSchema).default([]),
      autotilingEnabled: z.boolean().optional().default(true)
    })).default([])
  }),
  // Version 4: Dense array with regular numbers (current format)
  SerializedMapDataSchema
])

// ===========================
// Project Schemas
// ===========================

export const ProjectDataSchema = z.object({
  name: z.string(),
  projectDir: z.string().optional(),
  lastModified: z.string(),
  openTabs: z.object({
    tabs: z.array(z.any()),
    activeTabId: z.string().optional()
  }).optional()
})

// ===========================
// Settings Schema
// ===========================

export const EditorSettingsSchema = z.object({
  gridVisible: z.boolean(),
  defaultMapWidth: z.number(),
  defaultMapHeight: z.number(),
  defaultTileWidth: z.number(),
  defaultTileHeight: z.number(),
  autoSaveInterval: z.number(), // in minutes, 0 = disabled
  recentFilesLimit: z.number(),
  recentFiles: z.array(z.string()),
  lastOpenedProject: z.string().nullable()
})

// ===========================
// Type Inference
// ===========================

// These let us infer TypeScript types from Zod schemas
export type TilesetDataJson = z.infer<typeof TilesetDataSchema>
export type ProjectDataJson = z.infer<typeof ProjectDataSchema>
export type MapFileJson = z.infer<typeof MapFileSchema>
export type MapDataJson = z.infer<typeof MapDataSchema>
export type TileDefinitionJson = z.infer<typeof TileDefinitionSchema>
export type EntityDefinitionJson = z.infer<typeof EntityDefinitionSchema>
export type EntityInstanceJson = z.infer<typeof EntityInstanceSchema>
export type LayerJson = z.infer<typeof LayerSchema>

// ===========================
// Factory Functions
// ===========================

/**
 * Create a valid default layer
 */
export function createDefaultLayer(name: string = 'Layer 1', type: 'tile' | 'entity' = 'tile'): LayerJson {
  return LayerSchema.parse({
    id: `layer-${Date.now()}`,
    name,
    visible: true,
    type,
    tiles: [],
    entities: [],
    autotilingEnabled: true
  })
}

/**
 * Create valid default map data
 */
export function createDefaultMapData(name: string = 'Untitled Map', width: number = 32, height: number = 32): MapDataJson {
  return MapDataSchema.parse({
    name,
    width,
    height,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{
      id: `layer-${Date.now()}`,
      name: 'Layer 1',
      visible: true,
      type: 'tile' as const,
      tiles: new Array(width * height).fill(0), // Initialize dense array with zeros
      entities: [],
      autotilingEnabled: true
    }]
  })
}

/**
 * Validate and ensure MapData is complete
 */
export function ensureValidMapData(data: any): MapDataJson {
  // Parse with schema - this will throw if invalid
  return MapDataSchema.parse(data)
}

/**
 * Check if data is valid MapData without throwing
 * Returns true if valid, false otherwise
 */
export function validateMapData(data: any): boolean {
  try {
    MapDataSchema.parse(data)
    return true
  } catch (error) {
    console.warn('MapData validation failed:', error)
    return false
  }
}
