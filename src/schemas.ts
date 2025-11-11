import { z } from "zod";
import type { EntityDefinition, EntityInstance } from "./types";
import { generateId } from "./utils/id";

// ===========================
// Collision Schemas
// ===========================

export const PointSchema = z.object({
	x: z.number(),
	y: z.number(),
});

export const PolygonColliderSchema = z.object({
	id: z.string().default(""),
	name: z.string().default(""),
	type: z.string().default(""),
	points: z.array(PointSchema),
	properties: z.record(z.string(), z.string()).default({}),
});

// ===========================
// Tileset Schemas
// ===========================

export const SpriteRectSchema = z.object({
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
});

export const SpriteLayerSchema = z.object({
	id: z.string(),
	name: z.string().default(""),
	type: z.string().default(""),
	tilesetId: z.string(),
	sprite: SpriteRectSchema,
	offset: z
		.object({
			x: z.number(),
			y: z.number(),
		})
		.default({ x: 0, y: 0 }),
	origin: z
		.object({
			x: z.number(),
			y: z.number(),
		})
		.default({ x: 0, y: 0 }),
	rotation: z.number().default(0),
	zIndex: z.number(),
	ysortOffset: z.number().default(0),
});

export const TileDefinitionSchema = z.object({
	id: z.number(), // Packed tile ID (contains x, y, tileset index, and flip flags)
	isCompound: z.boolean().default(false), // True if this is a compound/multi-tile sprite
	width: z.number().default(0), // Width in pixels (0 = use tileset's tileWidth)
	height: z.number().default(0), // Height in pixels (0 = use tileset's tileHeight)
	origin: z
		.object({
			x: z.number(),
			y: z.number(),
		})
		.default({ x: 0, y: 0 }),
	colliders: z.array(PolygonColliderSchema).default([]),
	name: z.string().default(""),
	type: z.string().default(""),
	properties: z.record(z.string(), z.string()).default({}),
});

export const TerrainTileSchema = z.object({
	tileId: z.number(),
	bitmask: z.number(),
});

export const TerrainLayerSchema = z.object({
	id: z.string(),
	name: z.string(),
	tiles: z.array(TerrainTileSchema).default([]),
});

// Entity definition is recursive, so we need to define it with z.lazy
export const EntityDefinitionSchema: z.ZodType<EntityDefinition> = z.lazy(() =>
	z.object({
		id: z.string(),
		name: z.string().default(""),
		type: z.string().default(""),
		sprites: z.array(SpriteLayerSchema).default([]),
		offset: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.default({ x: 0, y: 0 }),
		rotation: z.number().default(0),
		colliders: z.array(PolygonColliderSchema).default([]),
		children: z.array(EntityDefinitionSchema).default([]),
		properties: z.record(z.string(), z.string()).default({}),
		filePath: z.string().optional(),
	}),
);

export const TilesetDataSchema = z.object({
	version: z.string().default("1.0"),
	name: z.string(),
	id: z.string().default(""),
	order: z.number().int().nonnegative(), // Numeric order for deterministic ordering
	imagePath: z.string(),
	tileWidth: z.number(),
	tileHeight: z.number(),
	tiles: z.array(TileDefinitionSchema).default([]),
	terrainLayers: z.array(TerrainLayerSchema).default([]),
});

// ===========================
// Map Schemas
// ===========================

// Entity instance is also recursive
export const EntityInstanceSchema: z.ZodType<EntityInstance> = z.lazy(() =>
	z.object({
		id: z.string(),
		x: z.number(),
		y: z.number(),
		entityDefId: z.string(),
		tilesetId: z.string(),
		rotation: z.number().default(0),
		scale: z
			.object({
				x: z.number(),
				y: z.number(),
			})
			.default({ x: 1, y: 1 }),
		properties: z.record(z.string(), z.string()).default({}),
		children: z.array(EntityInstanceSchema).default([]),
	}),
);

export const PointInstanceSchema = z.object({
	id: z.string(),
	x: z.number(),
	y: z.number(),
	name: z.string().default(""),
	type: z.string().default(""),
	properties: z.record(z.string(), z.string()).default({}),
});

export const LayerSchema = z.object({
	id: z.string(),
	name: z.string(),
	visible: z.boolean(),
	tiles: z.array(z.number()).default([]), // Dense array of packed tile IDs
});

export const MapDataSchema = z.object({
	name: z.string(),
	width: z.number().positive(),
	height: z.number().positive(),
	tileWidth: z.number().positive(),
	tileHeight: z.number().positive(),
	layers: z.array(LayerSchema).default([]),
	entities: z.array(EntityInstanceSchema).default([]),
	points: z.array(PointInstanceSchema).default([]),
	colliders: z.array(PolygonColliderSchema).default([]),
});

// Schemas for serialized format (version 4.0 - dense array with regular numbers)
export const SerializedLayerSchema = z.object({
	id: z.string(),
	name: z.string(),
	visible: z.boolean(),
	tiles: z.array(z.number()).default([]), // Dense array of packed tile IDs
});

export const SerializedMapDataSchema = z.object({
	version: z.literal("4.0"), // New version
	name: z.string(),
	width: z.number().positive(),
	height: z.number().positive(),
	tileWidth: z.number().positive(),
	tileHeight: z.number().positive(),
	layers: z.array(SerializedLayerSchema).default([]),
	entities: z.array(EntityInstanceSchema).default([]), // Entities at map level (required, can be empty)
	points: z.array(PointInstanceSchema).default([]), // Points at map level (required, can be empty)
	colliders: z.array(PolygonColliderSchema).default([]), // Colliders at map level (required, can be empty)
});

// Map file schema (for .lostmap files) - version 4.0 only
export const MapFileSchema = SerializedMapDataSchema;

// ===========================
// Tab Schemas
// ===========================

export const ToolSchema = z.enum([
	"pointer",
	"pencil",
	"eraser",
	"fill",
	"rect",
	"entity",
	"collision",
	"point",
]);

export const TabTypeSchema = z.enum([
	"map-editor",
	"tileset-editor",
	"entity-editor",
	"collision-editor",
]);

export const BaseTabSchema = z.object({
	id: z.string(),
	type: TabTypeSchema,
	title: z.string(),
	isDirty: z.boolean(),
	filePath: z.string().optional(),
});

export const MapViewStateSchema = z.object({
	zoom: z.number(),
	panX: z.number(),
	panY: z.number(),
	currentLayerId: z.string().nullable(),
	gridVisible: z.boolean(),
	selectedTilesetId: z.string().nullable(),
	selectedTileId: z.number().nullable(),
	selectedEntityDefId: z.string().nullable(),
	currentTool: ToolSchema,
});

// Undo/redo history schemas for tab persistence
export const MapUndoHistorySchema = z.object({
	past: z.array(MapDataSchema),
	present: MapDataSchema,
	future: z.array(MapDataSchema),
});

export const MapTabSchema = BaseTabSchema.extend({
	type: z.literal("map-editor"),
	mapId: z.string(),
	mapFilePath: z.string().optional(),
	viewState: MapViewStateSchema,
	undoHistory: MapUndoHistorySchema.optional(),
});

export const TilesetViewStateSchema = z.object({
	scale: z.number(),
	selectedTileRegion: z
		.object({
			x: z.number(),
			y: z.number(),
			width: z.number(),
			height: z.number(),
		})
		.nullable(),
});

const TilesetUndoStateSchema = z.object({
	tiles: z.array(TileDefinitionSchema),
	terrainLayers: z.array(TerrainLayerSchema),
});

export const TilesetUndoHistorySchema = z.object({
	past: z.array(TilesetUndoStateSchema),
	present: TilesetUndoStateSchema,
	future: z.array(TilesetUndoStateSchema),
});

export const TilesetTabSchema = BaseTabSchema.extend({
	type: z.literal("tileset-editor"),
	tilesetId: z.string(),
	viewState: TilesetViewStateSchema,
	undoHistory: TilesetUndoHistorySchema.optional(),
});

export const EntityEditorViewStateSchema = z.object({
	scale: z.number(),
	panX: z.number(),
	panY: z.number(),
	selectedSpriteLayerId: z.string().nullable(),
	selectedChildId: z.string().nullable(),
});

export const EntityUndoHistorySchema = z.object({
	past: z.array(EntityDefinitionSchema),
	present: EntityDefinitionSchema,
	future: z.array(EntityDefinitionSchema),
});

export const EntityEditorTabSchema = BaseTabSchema.extend({
	type: z.literal("entity-editor"),
	entityId: z.string(),
	entityData: EntityDefinitionSchema,
	viewState: EntityEditorViewStateSchema,
	undoHistory: EntityUndoHistorySchema.optional(),
});

export const CollisionEditorTabSchema = BaseTabSchema.extend({
	type: z.literal("collision-editor"),
	sourceType: z.enum(["tile", "entity"]),
	sourceId: z.string(),
	sourceTabId: z.string().optional(),
	tileId: z.number().optional(),
});

export const AnyTabSchema = z.discriminatedUnion("type", [
	MapTabSchema,
	TilesetTabSchema,
	EntityEditorTabSchema,
	CollisionEditorTabSchema,
]);

// ===========================
// Project Schemas
// ===========================

export const ProjectDataSchema = z.object({
	version: z.string().default("1.0"),
	name: z.string(),
	tilesets: z.array(z.string()).default([]), // Array of tileset file paths
	maps: z.array(z.string()).default([]), // Array of map file paths
	projectDir: z.string().optional(),
	lastModified: z.string(),
	openTabs: z
		.object({
			tabs: z.array(AnyTabSchema),
			activeTabId: z.string().nullable(),
		})
		.default({ tabs: [], activeTabId: null }),
});

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
	lastOpenedProject: z.string().nullable(),
});

// ===========================
// Factory Functions
// ===========================

/**
 * Create valid default map data
 * Used by EditorContext when creating new maps
 */
export function createDefaultMapData(
	name: string = "Untitled Map",
	width: number = 32,
	height: number = 32,
): z.infer<typeof MapDataSchema> {
	return MapDataSchema.parse({
		name,
		width,
		height,
		tileWidth: 16,
		tileHeight: 16,
		layers: [
			{
				id: generateId(),
				name: "Layer 1",
				visible: true,
				tiles: new Array(width * height).fill(0), // Initialize dense array with zeros
			},
		],
		entities: [], // Map-level entities
		points: [], // Map-level points
		colliders: [], // Map-level colliders
	});
}
