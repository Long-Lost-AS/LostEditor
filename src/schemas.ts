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

export const TileDefinitionSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  colliders: z.array(PolygonColliderSchema).optional(),
  name: z.string().optional(),
  type: z.string().optional()
})

// Entity definition is recursive, so we need to define it with z.lazy
export const EntityDefinitionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    sprite: SpriteRectSchema,
    offset: z.object({
      x: z.number(),
      y: z.number()
    }).optional(),
    rotation: z.number().optional(),
    colliders: z.array(PolygonColliderSchema).optional(),
    children: z.array(EntityDefinitionSchema).optional()
  })
)

export const TilesetDataSchema = z.object({
  version: z.string(),
  name: z.string(),
  id: z.string().optional(),
  imagePath: z.string(),
  tileWidth: z.number(),
  tileHeight: z.number(),
  tiles: z.array(TileDefinitionSchema).default([]),
  entities: z.array(EntityDefinitionSchema).default([])
})

// ===========================
// Map Schemas
// ===========================

export const TileSchema = z.object({
  x: z.number(),
  y: z.number(),
  tilesetId: z.string(),
  tileId: z.string(),
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
    properties: z.record(z.any()).optional(),
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
  entities: z.array(EntityInstanceSchema).default([])
})

export const MapDataSchema = z.object({
  width: z.number(),
  height: z.number(),
  tileWidth: z.number(),
  tileHeight: z.number(),
  layers: z.array(LayerSchema)
})

// Map file schema (for .lostmap files)
export const MapFileSchema = z.object({
  version: z.string(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  tileWidth: z.number(),
  tileHeight: z.number(),
  layers: z.array(LayerSchema),
  lastModified: z.string()
})

// ===========================
// Project Schemas
// ===========================

export const ProjectDataSchema = z.object({
  version: z.string(),
  name: z.string(),
  tilesets: z.array(z.string()).default([]),
  maps: z.array(z.string()).default([]),
  projectDir: z.string().optional(),
  lastModified: z.string()
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
