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

export interface TileDefinition {
  id: string
  x: number
  y: number
  width?: number    // For compound tiles: width in pixels
  height?: number   // For compound tiles: height in pixels
  colliders?: PolygonCollider[]  // Multiple colliders
  name?: string     // User-defined name for the tile
  type?: string     // Type classification for the tile
}

export interface EntityDefinition {
  id: string
  sprite: SpriteRect
  offset?: { x: number; y: number }
  rotation?: number
  colliders?: PolygonCollider[]  // Multiple colliders
  children?: EntityDefinition[]
}

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

export type AnyTab = MapTab | TilesetTab

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
