import { MapData, Layer, Tile } from '../types'
import { MapFileSchema, type MapFileJson } from '../schemas'
import { fileManager } from './FileManager'
import { FileLoader } from './FileLoader'

/**
 * Generate a consistent tile key from coordinates
 * Validates that coordinates are integers to prevent data corruption
 * @param x - X coordinate (must be integer)
 * @param y - Y coordinate (must be integer)
 * @returns String key in format "x,y"
 */
export function makeTileKey(x: number, y: number): string {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    console.warn(`Non-integer tile coordinates: (${x}, ${y}). Rounding to integers.`)
    x = Math.round(x)
    y = Math.round(y)
  }
  return `${x},${y}`
}

/**
 * MapManager handles loading, parsing, and managing map files
 */
class MapManager extends FileLoader<MapData, MapFileJson> {
  /**
   * Zod schema for map validation
   */
  protected get schema() {
    return MapFileSchema
  }

  /**
   * Prepare map data for serialization by converting Map objects to arrays
   */
  protected prepareForSave(data: MapData): MapFileJson {
    // Convert Map objects back to arrays for JSON serialization
    const layers = data.layers.map((layer: Layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      type: layer.type,
      tiles: Array.from(layer.tiles.values()),
      entities: layer.entities
    }))

    return {
      name: data.name || 'Untitled Map',
      width: data.width,
      height: data.height,
      tileWidth: data.tileWidth,
      tileHeight: data.tileHeight,
      layers: layers,
      lastModified: new Date().toISOString()
    }
  }

  /**
   * Post-process validated JSON data by converting tile arrays to Map objects
   */
  protected async postProcess(validated: MapFileJson, filePath: string): Promise<MapData> {
    // Convert tiles arrays to Map objects for efficient lookup
    const layers: Layer[] = validated.layers.map((layerJson) => {
      const tilesMap = new Map<string, Tile>()

      // Convert tiles array to Map with x,y as key
      layerJson.tiles.forEach((tile: Tile) => {
        const key = makeTileKey(tile.x, tile.y)
        tilesMap.set(key, tile)
      })

      return {
        id: layerJson.id,
        name: layerJson.name,
        visible: layerJson.visible,
        type: layerJson.type,
        tiles: tilesMap,
        entities: layerJson.entities
      }
    })

    return {
      name: validated.name,
      width: validated.width,
      height: validated.height,
      tileWidth: validated.tileWidth,
      tileHeight: validated.tileHeight,
      layers: layers
    }
  }

  /**
   * Get a loaded map by path
   */
  getMap(mapPath: string): MapData | undefined {
    const fullPath = fileManager.resolvePath(mapPath)
    const normalizedPath = fileManager.normalize(fullPath)
    return this.cache.get(normalizedPath)
  }

  /**
   * Get all loaded maps
   */
  getAllMaps(): MapData[] {
    return Array.from(this.cache.values())
  }

  /**
   * Save a map to disk
   * @param mapData - The map data to save
   * @param filePath - File path where to save
   * @param mapName - Optional custom name for the map
   */
  async saveMap(mapData: MapData, filePath: string, mapName?: string): Promise<void> {
    // Set custom name if provided
    if (mapName) {
      mapData.name = mapName
    }

    await this.save(mapData, filePath)
  }

  /**
   * Unload all maps
   */
  unloadAll(): void {
    this.clearCache()
  }

  /**
   * Legacy method: Load a map
   * @deprecated Use load() instead
   */
  async loadMap(mapPath: string): Promise<MapData> {
    return this.load(mapPath)
  }
}

// Export a singleton instance
export const mapManager = new MapManager()
