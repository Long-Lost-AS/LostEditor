import { z } from 'zod'

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
  width: z.number().optional(),
  height: z.number().optional(),
  colliders: z.array(PolygonColliderSchema).optional(),
  name: z.string().optional(),
  type: z.string().optional()
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
  imagePath: z.string(),
  tileWidth: z.number(),
  tileHeight: z.number(),
  tiles: z.array(TileDefinitionSchema).optional(),
  terrainLayers: z.array(TerrainLayerSchema).optional()
})

// ===========================
// Map Schemas
// ===========================

export const TileSchema = z.object({
  x: z.number(),
  y: z.number(),
  tilesetId: z.string(),
  tileId: z.number(),
  // For compound tiles: which cell within the compound tile
  cellX: z.number().optional(),
  cellY: z.number().optional()
})

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
  tiles: z.array(TileSchema).default([]), // Will be converted to Map in code
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

// Map file schema (for .lostmap files)
export const MapFileSchema = z.object({
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  tileWidth: z.number().positive(),
  tileHeight: z.number().positive(),
  layers: z.array(LayerSchema).default([]),
  lastModified: z.string()
})

// ===========================
// Project Schemas
// ===========================

export const ProjectDataSchema = z.object({
  name: z.string(),
  tilesets: z.array(z.string()).default([]),
  maps: z.array(z.string()).default([]),
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
export function createDefaultMapData(name: string = 'Untitled Map'): MapDataJson {
  return MapDataSchema.parse({
    name,
    width: 32,
    height: 32,
    tileWidth: 16,
    tileHeight: 16,
    layers: [createDefaultLayer('Layer 1', 'tile')]
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
