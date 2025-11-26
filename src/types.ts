import type { z } from "zod";
import type {
	AnyTabSchema,
	BaseTabSchema,
	CollisionEditorTabSchema,
	EntityDefinitionSchema,
	EntityEditorTabSchema,
	EntityEditorViewStateSchema,
	LayerSchema,
	MapDataSchema,
	MapTabSchema,
	MapViewStateSchema,
	PointInstanceSchema,
	PointSchema,
	PolygonColliderSchema,
	ProjectDataSchema,
	SerializedLayerSchema,
	SerializedMapDataSchema,
	SpriteRectSchema,
	SpriteSchema,
	TabTypeSchema,
	TerrainLayerSchema,
	TerrainTileSchema,
	TileDefinitionSchema,
	TileReferenceSchema,
	TilesetDataSchema,
	TilesetTabSchema,
	TilesetViewStateSchema,
	TintColorSchema,
	ToolSchema,
} from "./schemas";

// ===========================
// Collision Types
// ===========================

export type PolygonCollider = z.infer<typeof PolygonColliderSchema>;

// ===========================
// Tileset Types
// ===========================

export type SpriteRect = z.infer<typeof SpriteRectSchema>;

export type TintColor = z.infer<typeof TintColorSchema>;

export type Sprite = z.infer<typeof SpriteSchema>;

// Tile definition - inferred from schema
// Note: x and y are pixel coordinates identifying the sprite position in the tileset image
export type TileDefinition = z.infer<typeof TileDefinitionSchema>;

// Tile reference - used for tile selection in the editor
export type TileReference = z.infer<typeof TileReferenceSchema>;

// EntityDefinition must be manually defined (not inferred) because it's recursive
// The schema uses z.lazy() which prevents type inference with z.infer<>
export interface EntityDefinition {
	id: string;
	name: string;
	type: string;
	sprites: Sprite[]; // Multiple sprites for composition
	offset: { x: number; y: number };
	rotation: number;
	colliders: PolygonCollider[]; // Multiple colliders
	properties: Record<string, string>; // Default custom properties
	filePath?: string; // Path to .lostentity file (undefined for inline entities)
}

// ===========================
// Autotiling Types
// ===========================

export type TerrainTile = z.infer<typeof TerrainTileSchema>;

export type TerrainLayer = z.infer<typeof TerrainLayerSchema>;

// Base tileset data (JSON-serializable) - inferred from schema
export type TilesetDataJson = z.infer<typeof TilesetDataSchema>;
export type TileDefinitionJson = z.infer<typeof TileDefinitionSchema>;
export type ProjectDataJson = z.infer<typeof ProjectDataSchema>;
export type MapFileJson = z.infer<typeof SerializedMapDataSchema>;
export type EntityDefinitionJson = z.infer<typeof EntityDefinitionSchema>;

// Loaded tileset with image data (runtime only)
export interface LoadedTileset extends TilesetDataJson {
	imageData: HTMLImageElement; // Always present after loading
	filePath: string; // Path to the .lostset file (required for loaded tilesets)
}

// Union type for tileset data (use LoadedTileset when rendering)
export type TilesetData = TilesetDataJson & {
	imageData?: HTMLImageElement;
	filePath?: string; // Path to the .lostset file (undefined for unsaved tilesets)
};

// ===========================
// Map Types
// ===========================

export interface Tile {
	x: number; // Position on map (grid coordinates)
	y: number; // Position on map (grid coordinates)
	tileId: number; // Packed tile ID (sprite position + tileset index + flips)
	// For compound tiles: which cell within the compound tile (offset in tiles)
	cellX?: number;
	cellY?: number;
}

// EntityInstance must be manually defined (not inferred) because it's recursive
// The schema uses z.lazy() which prevents type inference with z.infer<>
export interface EntityInstance {
	id: string; // Unique instance ID
	x: number; // Position on map (pixel coordinates)
	y: number; // Position on map (pixel coordinates)
	entityDefId: string; // Reference to entity definition
	rotation: number;
	scale: { x: number; y: number };
	properties: Record<string, string>;
}

// PointInstance - inferred from schema
export type PointInstance = z.infer<typeof PointInstanceSchema>;

export type Layer = z.infer<typeof LayerSchema>;

// MapData inferred from schema, with runtime-only filePath field
export type MapData = z.infer<typeof MapDataSchema> & {
	filePath?: string; // Runtime-only field for tracking where map was loaded from
};

// ===========================
// Serialized Map Types (for .lostmap files)
// ===========================

// Serialized layer format (version 5.0 - chunk-based) - inferred from schema
export type SerializedLayer = z.infer<typeof SerializedLayerSchema>;

// Serialized map format (what's stored in .lostmap files version 5.0) - inferred from schema
export type SerializedMapData = z.infer<typeof SerializedMapDataSchema>;

// ===========================
// Project Types
// ===========================

export type ProjectData = z.infer<typeof ProjectDataSchema>;

// ===========================
// Editor Types
// ===========================

export type Tool = z.infer<typeof ToolSchema>;

// Selection state as discriminated union
export type SelectionState =
	| { type: "none" }
	| {
			type: "tile";
			tilesetId: string;
			tileId: number;
			tileX: number;
			tileY: number;
	  }
	| { type: "entity"; tilesetId: string; entityDefId: string }
	| { type: "terrain"; tilesetId: string; terrainLayerId: string };

export interface CollisionEditState {
	tilesetId: string;
	targetType: "tile" | "entity";
	targetId: string;
	polygon: PolygonCollider;
	selectedPointIndex: number | null;
}

// ===========================
// Tab Types
// ===========================

export type TabType = z.infer<typeof TabTypeSchema>;

// Inferred from schemas (schemas.ts is the single source of truth)
export type BaseTab = z.infer<typeof BaseTabSchema>;
export type MapViewState = z.infer<typeof MapViewStateSchema>;
export type MapTab = z.infer<typeof MapTabSchema>;
export type TilesetViewState = z.infer<typeof TilesetViewStateSchema>;
export type TilesetTab = z.infer<typeof TilesetTabSchema>;
export type EntityEditorViewState = z.infer<typeof EntityEditorViewStateSchema>;
export type EntityEditorTab = z.infer<typeof EntityEditorTabSchema>;
export type CollisionEditorTab = z.infer<typeof CollisionEditorTabSchema>;
export type AnyTab = z.infer<typeof AnyTabSchema>;

export interface TabState {
	tabs: AnyTab[];
	activeTabId: string | null;
}

// ===========================
// Utility Types
// ===========================

export type Point = z.infer<typeof PointSchema>;

export interface Transform {
	x: number;
	y: number;
	rotation: number;
	scale: { x: number; y: number };
}

// ===========================
// Type Guards
// ===========================

export function isLoadedTileset(
	tileset: TilesetData,
): tileset is LoadedTileset {
	return tileset.imageData !== undefined && tileset.filePath !== undefined;
}

export function hasImageData(
	tileset: TilesetData,
): tileset is TilesetData & { imageData: HTMLImageElement } {
	return tileset.imageData !== undefined;
}
