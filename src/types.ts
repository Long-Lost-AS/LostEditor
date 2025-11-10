import type { z } from "zod";
import type {
	AnyTabSchema,
	BaseTabSchema,
	CollisionEditorTabSchema,
	EntityEditorTabSchema,
	EntityEditorViewStateSchema,
	LayerTypeSchema,
	MapTabSchema,
	MapViewStateSchema,
	PointSchema,
	PolygonColliderSchema,
	SpriteLayerSchema,
	SpriteRectSchema,
	TabTypeSchema,
	TerrainLayerSchema,
	TerrainTileSchema,
	TilesetTabSchema,
	TilesetViewStateSchema,
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

export type SpriteLayer = z.infer<typeof SpriteLayerSchema>;

// Runtime tile definition (after unpacking x/y from ID)
export interface TileDefinition {
	id: number; // Packed tile ID
	x: number; // Unpacked x position (always present at runtime)
	y: number; // Unpacked y position (always present at runtime)
	isCompound: boolean;
	width: number; // Width in pixels (0 = use tileset's tileWidth)
	height: number; // Height in pixels (0 = use tileset's tileHeight)
	origin: { x: number; y: number };
	colliders: PolygonCollider[];
	name: string;
	type: string;
	properties: Record<string, string>;
}

export interface EntityDefinition {
	id: string;
	name: string;
	type: string;
	sprites: SpriteLayer[]; // Multiple sprite layers for composition
	offset: { x: number; y: number };
	rotation: number;
	colliders: PolygonCollider[]; // Multiple colliders
	children: EntityDefinition[];
	properties: Record<string, string>; // Default custom properties
	filePath?: string; // Path to .lostentity file (undefined for inline entities)
}

// ===========================
// Autotiling Types
// ===========================

export type TerrainTile = z.infer<typeof TerrainTileSchema>;

export type TerrainLayer = z.infer<typeof TerrainLayerSchema>;

// Base tileset data (JSON-serializable)
export interface TilesetDataJson {
	version: string;
	name: string;
	id: string;
	order: number; // Numeric order for deterministic tileset ordering
	imagePath: string;
	tileWidth: number;
	tileHeight: number;
	tiles: TileDefinition[];
	terrainLayers: TerrainLayer[]; // Terrain layers for Godot-style autotiling (required, can be empty)
}

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

export interface EntityInstance {
	id: string; // Unique instance ID
	x: number; // Position on map (pixel coordinates)
	y: number; // Position on map (pixel coordinates)
	entityDefId: string; // Reference to entity definition
	tilesetId: string; // Reference to tileset containing the entity
	rotation: number;
	scale: { x: number; y: number };
	properties: Record<string, string>;
	children: EntityInstance[];
}

export type LayerType = z.infer<typeof LayerTypeSchema>;

export interface Layer {
	id: string;
	name: string;
	visible: boolean;
	type: LayerType;
	tiles: number[]; // Dense array of packed tile IDs (width * height entries, 0 = empty)
}

export interface MapData {
	id?: string; // Runtime-only field added by EditorContext for tracking loaded maps
	name: string;
	width: number;
	height: number;
	tileWidth: number;
	tileHeight: number;
	layers: Layer[];
	entities: EntityInstance[]; // Entities at map level, rendered on top of all tiles (required, can be empty)
}

// ===========================
// Serialized Map Types (for .lostmap files)
// ===========================

// Serialized layer format (version 4.0 - dense array)
export interface SerializedLayer {
	id: string;
	name: string;
	visible: boolean;
	type: LayerType;
	tiles: number[]; // Dense array of packed tile IDs (width * height entries)
}

// Serialized map format (what's stored in .lostmap files version 4.0)
export interface SerializedMapData {
	version: string; // Format version ("4.0")
	name: string;
	width: number;
	height: number;
	tileWidth: number;
	tileHeight: number;
	layers: SerializedLayer[];
	entities: EntityInstance[]; // Entities at map level (required, can be empty)
}

// ===========================
// Project Types
// ===========================

export interface ProjectData {
	version: string;
	name: string;
	tilesets: string[]; // Array of tileset file paths
	maps: string[]; // Array of map file paths (.lostmap files)
	projectDir?: string; // Project directory for resolving relative paths
	lastModified: string;
	openTabs: TabState; // Open tabs state
}

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
