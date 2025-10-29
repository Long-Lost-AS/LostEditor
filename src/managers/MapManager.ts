import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { MapData, Layer, Tile } from '../types'
import { MapFileSchema, LayerJson } from '../schemas'
import { fileManager } from './FileManager'

/**
 * MapManager handles loading, parsing, and managing map files
 */
export class MapManager {
  private maps: Map<string, MapData> = new Map()
  private loadingPromises: Map<string, Promise<MapData>> = new Map()

  /**
   * Load a map from a file path
   * @param mapPath - Path to the map JSON file (can be relative or absolute)
   * @returns Promise resolving to the loaded MapData
   */
  async loadMap(mapPath: string): Promise<MapData> {
    // Check if already loaded
    const existing = this.maps.get(mapPath)
    if (existing) {
      return existing
    }

    // Check if currently loading
    const loadingPromise = this.loadingPromises.get(mapPath)
    if (loadingPromise) {
      return loadingPromise
    }

    // Start loading
    const promise = this._loadMapInternal(mapPath)
    this.loadingPromises.set(mapPath, promise)

    try {
      const mapData = await promise
      this.maps.set(mapPath, mapData)
      return mapData
    } finally {
      this.loadingPromises.delete(mapPath)
    }
  }

  /**
   * Internal method to load a map file
   */
  private async _loadMapInternal(mapPath: string): Promise<MapData> {
    try {
      // Resolve the full path
      const fullPath = fileManager.resolvePath(mapPath)

      // Load the JSON file via Tauri FS plugin
      const rawData = await readTextFile(fullPath)

      // Parse and validate the JSON with Zod
      const rawJson = JSON.parse(rawData)
      const mapFileJson = MapFileSchema.parse(rawJson)

      console.log('Loading map from:', fullPath)

      // Convert tiles arrays to Map objects for efficient lookup
      const layers: Layer[] = mapFileJson.layers.map((layerJson: LayerJson) => {
        const tilesMap = new Map<string, Tile>()

        // Convert tiles array to Map with x,y as key
        layerJson.tiles.forEach((tile: Tile) => {
          const key = `${tile.x},${tile.y}`
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

      // Create the MapData object
      const mapData: MapData = {
        width: mapFileJson.width,
        height: mapFileJson.height,
        tileWidth: mapFileJson.tileWidth,
        tileHeight: mapFileJson.tileHeight,
        layers: layers
      }

      return mapData
    } catch (error) {
      console.error(`Error loading map from ${mapPath}:`, error)
      throw error
    }
  }

  /**
   * Get a loaded map by path
   */
  getMap(mapPath: string): MapData | undefined {
    return this.maps.get(mapPath)
  }

  /**
   * Get a loaded map by path (alias for getMap)
   */
  getMapByPath(mapPath: string): MapData | undefined {
    return this.getMap(mapPath)
  }

  /**
   * Update a map's cache key when its path changes
   */
  updateMapPath(oldPath: string, newPath: string): void {
    const map = this.maps.get(oldPath)
    if (map) {
      this.maps.delete(oldPath)
      this.maps.set(newPath, map)
      console.log(`Updated map cache key: ${oldPath} -> ${newPath}`)
    }
  }

  /**
   * Get all loaded maps
   */
  getAllMaps(): MapData[] {
    return Array.from(this.maps.values())
  }

  /**
   * Unload a map
   */
  unloadMap(mapPath: string): boolean {
    return this.maps.delete(mapPath)
  }

  /**
   * Unload all maps
   */
  unloadAll(): void {
    this.maps.clear()
    this.loadingPromises.clear()
  }

  /**
   * Reload a map (useful for hot-reloading during development)
   */
  async reloadMap(mapPath: string): Promise<MapData> {
    this.unloadMap(mapPath)
    return this.loadMap(mapPath)
  }

  /**
   * Check if a map is loaded
   */
  isLoaded(mapPath: string): boolean {
    return this.maps.has(mapPath)
  }

  /**
   * Save a map to disk
   * @param mapData - The map data to save
   * @param filePath - File path to save to
   * @param mapName - Optional name for the map
   */
  async saveMap(mapData: MapData, filePath: string, mapName?: string): Promise<void> {
    try {
      // Resolve the full path
      const fullPath = fileManager.resolvePath(filePath)

      // Convert Map objects back to arrays for JSON serialization
      const layers = mapData.layers.map((layer: Layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        type: layer.type,
        tiles: Array.from(layer.tiles.values()),
        entities: layer.entities
      }))

      // Prepare JSON data
      const jsonData = {
        version: '1.0',
        name: mapName || fileManager.basename(fullPath, '.lostmap'),
        width: mapData.width,
        height: mapData.height,
        tileWidth: mapData.tileWidth,
        tileHeight: mapData.tileHeight,
        layers: layers,
        lastModified: new Date().toISOString()
      }

      console.log('MapManager: Saving map with', layers.length, 'layers to', fullPath)

      // Write to file
      const jsonString = JSON.stringify(jsonData, null, 2)
      await writeTextFile(fullPath, jsonString)

      console.log('Saved map to:', fullPath)

      // Update the in-memory cache
      this.maps.set(filePath, mapData)
    } catch (error) {
      console.error(`Error saving map to ${filePath}:`, error)
      throw error
    }
  }
}

// Export a singleton instance
export const mapManager = new MapManager()
