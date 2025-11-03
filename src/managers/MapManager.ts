import { MapData, Layer, Tile, SerializedMapData } from '../types'
import { MapFileSchema, type MapFileJson, validateMapData, createDefaultMapData } from '../schemas'
import { fileManager } from './FileManager'
import { FileLoader } from './FileLoader'
import { serializeMapData, deserializeMapData } from '../utils/mapSerializer'
import { writeTextFile } from '@tauri-apps/plugin-fs'

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
   * Prepare map data for serialization using serializeMapData
   */
  protected prepareForSave(data: MapData): MapFileJson {
    // Use serializeMapData to convert to version 4.0 format
    return serializeMapData(data) as any as MapFileJson
  }

  /**
   * Post-process validated JSON data
   * Handles version 1 (tilesetId), version 2 (firstgid), version 3 (BigInt), and version 4 (dense array)
   */
  protected async postProcess(validated: MapFileJson, filePath: string): Promise<MapData> {
    // Check which version format this is
    const version = 'version' in validated ? validated.version : '1.0'

    if (version === '4.0') {
      // Version 4: Dense array with regular numbers - deserialize directly
      const serialized = validated as unknown as SerializedMapData
      return deserializeMapData(serialized)
    }

    if (version === '3.0') {
      // Version 3: BigInt global tile IDs (sparse array) - convert to dense array
      const v3Data = validated as any
      const width = v3Data.width
      const height = v3Data.height

      const layers: Layer[] = v3Data.layers.map((layerJson: any) => {
        // Initialize dense array with zeros
        const tiles = new Array(width * height).fill(0)

        // Convert sparse tiles to dense array
        layerJson.tiles?.forEach((tile: any) => {
          const index = tile.y * width + tile.x
          // Convert BigInt string to number (will be migrated to new format on save)
          tiles[index] = Number(BigInt(tile.gid))
        })

        return {
          id: layerJson.id,
          name: layerJson.name,
          visible: layerJson.visible,
          type: layerJson.type,
          tiles,
          entities: layerJson.entities,
          autotilingEnabled: layerJson.autotilingEnabled !== false
        }
      })

      return {
        name: v3Data.name,
        width,
        height,
        tileWidth: v3Data.tileWidth,
        tileHeight: v3Data.tileHeight,
        layers
      }
    }

    if (version === '2.0') {
      // Version 2: firstgid format (sparse array) - convert to dense array
      const v2Data = validated as any
      const width = v2Data.width
      const height = v2Data.height

      const layers: Layer[] = v2Data.layers.map((layerJson: any) => {
        // Initialize dense array with zeros
        const tiles = new Array(width * height).fill(0)

        // Convert sparse tiles to dense array
        layerJson.tiles?.forEach((tile: any) => {
          const index = tile.y * width + tile.x
          tiles[index] = tile.gid
        })

        return {
          id: layerJson.id,
          name: layerJson.name,
          visible: layerJson.visible,
          type: layerJson.type,
          tiles,
          entities: layerJson.entities,
          autotilingEnabled: layerJson.autotilingEnabled !== false
        }
      })

      return {
        name: v2Data.name,
        width,
        height,
        tileWidth: v2Data.tileWidth,
        tileHeight: v2Data.tileHeight,
        layers
      }
    }

    // Version 1: Old format with tilesetId (sparse array) - convert to dense array
    const v1Data = validated as any
    const width = v1Data.width
    const height = v1Data.height

    const layers: Layer[] = v1Data.layers.map((layerJson: any) => {
      // Initialize dense array with zeros
      const tiles = new Array(width * height).fill(0)

      // Convert sparse tiles to dense array
      // Note: v1 format uses tilesetId strings, these need to be converted to new packed IDs on save
      layerJson.tiles?.forEach((tile: any) => {
        const index = tile.y * width + tile.x
        tiles[index] = tile.tileId
      })

      return {
        id: layerJson.id,
        name: layerJson.name,
        visible: layerJson.visible,
        type: layerJson.type,
        tiles,
        entities: layerJson.entities,
        autotilingEnabled: layerJson.autotilingEnabled !== false
      }
    })

    return {
      name: v1Data.name,
      width,
      height,
      tileWidth: v1Data.tileWidth,
      tileHeight: v1Data.tileHeight,
      layers
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

    // Serialize to version 3.0 format (BigInt global tile IDs)
    const serialized = serializeMapData(mapData)

    // Save the serialized data
    const fullPath = fileManager.resolvePath(filePath)
    const normalizedPath = fileManager.normalize(fullPath)

    // Format tiles array with width-based rows for readability
    const jsonString = this.formatMapJSON(serialized, mapData.width)
    await writeTextFile(fullPath, jsonString)

    // Update cache with the runtime format
    this.cache.set(normalizedPath, mapData)
  }

  /**
   * Format map JSON with tiles arranged in rows matching map width
   * @private
   */
  private formatMapJSON(serialized: SerializedMapData, mapWidth: number): string {
    // First, stringify everything except tiles arrays normally
    const replacer = (key: string, value: any) => {
      // Don't process tiles arrays here - we'll handle them manually
      if (key === 'tiles' && Array.isArray(value)) {
        return '__TILES_PLACEHOLDER__'
      }
      return value
    }

    let jsonString = JSON.stringify(serialized, replacer, 2)

    // Now replace each tiles placeholder with formatted flat array (row-based line breaks)
    serialized.layers.forEach((layer) => {
      if (layer.tiles && layer.tiles.length > 0) {
        // Build a flat array string with line breaks every mapWidth tiles
        const parts: string[] = []
        for (let i = 0; i < layer.tiles.length; i += mapWidth) {
          const row = layer.tiles.slice(i, i + mapWidth)
          parts.push(row.join(', '))
        }
        const formattedTiles = `[\n        ${parts.join(',\n        ')}\n      ]`

        // Replace the first occurrence of the placeholder
        jsonString = jsonString.replace('"__TILES_PLACEHOLDER__"', formattedTiles)
      }
    })

    return jsonString
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
