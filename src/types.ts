// ===========================
// Collision Types
// ===========================

export interface PolygonCollider {
  id?: string
  name?: string
  type?: string
  points: Array<{ x: number; y: number }>
}

// ===========================
// Tileset Types
// ===========================

export interface SpriteRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SpriteLayer {
  id: string
  name?: string
  type?: string
  tilesetId: string          // Reference to tileset containing sprite
  sprite: SpriteRect         // Region in tileset
  offset?: { x: number; y: number }
  origin?: { x: number; y: number }  // Pivot point for rotation/entity anchor (normalized 0-1, where 0.5,0.5 is center)
  rotation?: number
  zIndex: number             // For layer ordering (higher = front)
  ysortOffset?: number       // Y-sort offset for depth sorting
}

export interface TileDefinition {
  id: string
  x: number
  y: number
  width?: number    // For compound tiles: width in pixels
  height?: number   // For compound tiles: height in pixels
  colliders?: PolygonCollider[]  // Multiple colliders
  name?: string     // User-defined name for the tile
  type?: string     // Type classification for the tile
  bitmasks?: Record<string, number>  // Godot-style bitmask: terrain type -> 9-bit value (0-511) representing 3x3 grid
}

export interface EntityDefinition {
  id: string
  name?: string
  type?: string
  sprites: SpriteLayer[]         // Multiple sprite layers for composition
  offset?: { x: number; y: number }
  rotation?: number
  colliders?: PolygonCollider[]  // Multiple colliders
  children?: EntityDefinition[]
  properties?: Record<string, string>  // Default custom properties
  filePath?: string              // Path to .lostentity file (undefined for inline entities)
}

// ===========================
// Autotiling Types
// ===========================

export interface TerrainLayer {
  id: string
  name: string  // The terrain identifier (e.g., "Grass", "Dirt")
}

// Deprecated: kept for backward compatibility during migration
export type AutotileGroup = TerrainLayer

export interface TilesetData {
  version: string
  name: string
  id: string
  imagePath: string
  imageData?: HTMLImageElement
  filePath?: string  // Path to the .lostset file (undefined for unsaved tilesets)
  tileWidth: number
  tileHeight: number
  tiles: TileDefinition[]
  entities: EntityDefinition[]
  terrainLayers?: TerrainLayer[]  // Terrain layers for Godot-style autotiling
  autotileGroups?: AutotileGroup[]  // Deprecated: kept for backward compatibility
}

// ===========================
// Map Types
// ===========================

export interface Tile {
  x: number              // Position on map (grid coordinates)
  y: number              // Position on map (grid coordinates)
  tilesetId: string      // Reference to tileset
  tileId: string         // Reference to tile within tileset
  // For compound tiles: which cell within the compound tile (offset in tiles)
  cellX?: number
  cellY?: number
}

export interface EntityInstance {
  id: string             // Unique instance ID
  x: number              // Position on map (pixel coordinates)
  y: number              // Position on map (pixel coordinates)
  entityDefId: string    // Reference to entity definition
  tilesetId: string      // Reference to tileset containing the entity
  rotation?: number      // Instance-specific rotation override
  scale?: { x: number; y: number }
  properties?: Record<string, any>
  children?: EntityInstance[]  // Instance-specific child overrides
}

export type LayerType = 'tile' | 'entity'

export interface Layer {
  id: string
  name: string
  visible: boolean
  type: LayerType
  tiles: Map<string, Tile>        // For tile layers
  entities: EntityInstance[]       // For entity layers
  autotilingEnabled?: boolean      // Whether autotiling is enabled for this layer (default: true)
}

export interface MapData {
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  layers: Layer[]
}

// ===========================
// Project Types
// ===========================

export interface ProjectData {
  version: string
  name: string
  tilesets: string[]              // Array of tileset file paths
  maps: string[]                  // Array of map file paths (.lostmap files)
  projectDir?: string             // Project directory for resolving relative paths
  lastModified: string
  openTabs?: TabState             // Open tabs state
}

// ===========================
// Editor Types
// ===========================

export type Tool = 'pencil' | 'eraser' | 'fill' | 'rect' | 'entity' | 'collision'

export interface CollisionEditState {
  tilesetId: string
  targetType: 'tile' | 'entity'
  targetId: string
  polygon: PolygonCollider
  selectedPointIndex: number | null
}

// ===========================
// Tab Types
// ===========================

export type TabType = 'map' | 'tileset' | 'entity-editor'

export interface BaseTab {
  id: string
  type: TabType
  title: string
  isDirty: boolean
  filePath?: string
}

export interface MapViewState {
  zoom: number
  panX: number
  panY: number
  currentLayerId: string | null
  gridVisible: boolean
  selectedTilesetId: string | null
  selectedTileId: string | null
  selectedEntityDefId: string | null
  currentTool: Tool
}

export interface MapTab extends BaseTab {
  type: 'map'
  mapId: string               // Unique identifier for the map
  mapData: MapData            // In-memory map data
  viewState: MapViewState
}

export interface TilesetViewState {
  scale: number
  selectedTileRegion: { x: number; y: number; width: number; height: number } | null
}

export interface TilesetTab extends BaseTab {
  type: 'tileset'
  tilesetId: string  // Reference to tileset by ID, not the full data
  viewState: TilesetViewState
}

export interface EntityEditorViewState {
  scale: number
  panX: number
  panY: number
  selectedSpriteLayerId: string | null
  selectedChildId: string | null
}

export interface EntityEditorTab extends BaseTab {
  type: 'entity-editor'
  entityId: string            // Unique identifier for the entity
  entityData: EntityDefinition  // In-memory entity data
  viewState: EntityEditorViewState
}

export type AnyTab = MapTab | TilesetTab | EntityEditorTab

export interface TabState {
  tabs: AnyTab[]
  activeTabId: string | null
}

// ===========================
// Utility Types
// ===========================

export interface Point {
  x: number
  y: number
}

export interface Transform {
  x: number
  y: number
  rotation: number
  scale: { x: number; y: number }
}
