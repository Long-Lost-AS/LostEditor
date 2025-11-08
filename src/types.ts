// ===========================
// Collision Types
// ===========================

export interface PolygonCollider {
	id?: string;
	name?: string;
	type?: string;
	points: Array<{ x: number; y: number }>;
	properties?: Record<string, string>;
}

// ===========================
// Tileset Types
// ===========================

export interface SpriteRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SpriteLayer {
	id: string;
	name?: string;
	type?: string;
	tilesetId: string; // Reference to tileset containing sprite
	sprite: SpriteRect; // Region in tileset
	offset?: { x: number; y: number };
	origin?: { x: number; y: number }; // Pivot point for rotation/entity anchor (normalized 0-1, where 0.5,0.5 is center)
	rotation?: number;
	zIndex: number; // For layer ordering (higher = front)
	ysortOffset?: number; // Y-sort offset for depth sorting
}

export interface TileDefinition {
	id: number; // Packed tile ID (sprite position + tileset index + flips)
	x: number; // Sprite x position in tileset image
	y: number; // Sprite y position in tileset image
	isCompound?: boolean; // True if this is a compound/multi-tile sprite
	width?: number; // For compound tiles: width in pixels
	height?: number; // For compound tiles: height in pixels
	origin?: { x: number; y: number }; // Origin point in normalized coordinates (0-1), defaults to top-left (0,0)
	colliders?: PolygonCollider[]; // Multiple colliders
	name?: string; // User-defined name for the tile
	type?: string; // Type classification for the tile
	properties?: Record<string, string>; // Custom properties for compound tiles
}

export interface EntityDefinition {
	id: string;
	name?: string;
	type?: string;
	sprites: SpriteLayer[]; // Multiple sprite layers for composition
	offset?: { x: number; y: number };
	rotation?: number;
	colliders?: PolygonCollider[]; // Multiple colliders
	children?: EntityDefinition[];
	properties?: Record<string, string>; // Default custom properties
	filePath?: string; // Path to .lostentity file (undefined for inline entities)
}

// ===========================
// Autotiling Types
// ===========================

export interface TerrainTile {
	tileId: number; // Packed tile ID
	bitmask: number; // 9-bit value (0-511) representing 3x3 grid
}

export interface TerrainLayer {
	id: string;
	name: string; // The terrain identifier (e.g., "Grass", "Dirt")
	tiles: TerrainTile[]; // Tiles that belong to this terrain with their bitmasks (required, can be empty)
}

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
	rotation?: number; // Instance-specific rotation override
	scale?: { x: number; y: number };
	properties?: Record<string, string>;
	children?: EntityInstance[]; // Instance-specific child overrides
}

export type LayerType = "tile" | "entity";

export interface Layer {
	id: string;
	name: string;
	visible: boolean;
	type: LayerType;
	tiles: number[]; // Dense array of packed tile IDs (width * height entries, 0 = empty)
	entities: EntityInstance[]; // For entity layers
	autotilingEnabled?: boolean; // Whether autotiling is enabled for this layer (default: true)
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
	entities: EntityInstance[]; // Entities unchanged
	autotilingEnabled?: boolean;
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
	openTabs?: TabState; // Open tabs state
}

// ===========================
// Editor Types
// ===========================

export type Tool =
	| "pointer"
	| "pencil"
	| "eraser"
	| "fill"
	| "rect"
	| "entity"
	| "collision";

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

export type TabType = "map" | "tileset" | "entity-editor" | "collision-editor";

export interface BaseTab {
	id: string;
	type: TabType;
	title: string;
	isDirty: boolean;
	filePath?: string;
}

export interface MapViewState {
	zoom: number;
	panX: number;
	panY: number;
	currentLayerId: string | null;
	gridVisible: boolean;
	selectedTilesetId: string | null;
	selectedTileId: number | null;
	selectedEntityDefId: string | null;
	currentTool: Tool;
}

export interface MapTab extends BaseTab {
	type: "map";
	mapId: string; // Unique identifier for the map (reference to EditorContext.maps array)
	mapFilePath: string; // File path for save operations
	mapData?: MapData; // [DEPRECATED] In-memory map data - use EditorContext.getMapById() instead
	viewState: MapViewState;
}

export interface TilesetViewState {
	scale: number;
	selectedTileRegion: {
		x: number;
		y: number;
		width: number;
		height: number;
	} | null;
}

export interface TilesetTab extends BaseTab {
	type: "tileset";
	tilesetId: string; // Reference to tileset by ID, not the full data
	viewState: TilesetViewState;
}

export interface EntityEditorViewState {
	scale: number;
	panX: number;
	panY: number;
	selectedSpriteLayerId: string | null;
	selectedChildId: string | null;
}

export interface EntityEditorTab extends BaseTab {
	type: "entity-editor";
	entityId: string; // Unique identifier for the entity
	entityData: EntityDefinition; // In-memory entity data
	viewState: EntityEditorViewState;
}

export interface CollisionEditorTab extends BaseTab {
	type: "collision-editor";
	sourceType: "tile" | "entity";
	sourceId: string; // tilesetId or entityId
	sourceTabId?: string; // Parent tab ID (for entities)
	tileId?: number; // Only used when sourceType is 'tile'
}

export type AnyTab = MapTab | TilesetTab | EntityEditorTab | CollisionEditorTab;

export interface TabState {
	tabs: AnyTab[];
	activeTabId: string | null;
}

// ===========================
// Utility Types
// ===========================

export interface Point {
	x: number;
	y: number;
}

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
