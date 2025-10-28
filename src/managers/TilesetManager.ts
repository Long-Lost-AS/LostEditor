import { convertFileSrc } from '@tauri-apps/api/core'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { TilesetData, TileDefinition, EntityDefinition } from '../types'
import { TilesetDataSchema } from '../schemas'
import { fileManager } from './FileManager'

/**
 * TilesetManager handles loading, parsing, and managing tileset files
 */
export class TilesetManager {
  private tilesets: Map<string, TilesetData> = new Map()
  private loadingPromises: Map<string, Promise<TilesetData>> = new Map()

  /**
   * Load a tileset from a file path
   * @param tilesetPath - Path to the tileset JSON file (can be relative or absolute)
   * @returns Promise resolving to the loaded TilesetData
   */
  async loadTileset(tilesetPath: string): Promise<TilesetData> {
    // Check if already loaded
    const existing = this.tilesets.get(tilesetPath)
    if (existing) {
      return existing
    }

    // Check if currently loading
    const loadingPromise = this.loadingPromises.get(tilesetPath)
    if (loadingPromise) {
      return loadingPromise
    }

    // Start loading
    const promise = this._loadTilesetInternal(tilesetPath)
    this.loadingPromises.set(tilesetPath, promise)

    try {
      const tileset = await promise
      this.tilesets.set(tilesetPath, tileset)
      return tileset
    } finally {
      this.loadingPromises.delete(tilesetPath)
    }
  }

  /**
   * Internal method to load a tileset file
   */
  private async _loadTilesetInternal(tilesetPath: string): Promise<TilesetData> {
    try {
      // Resolve the full path
      const fullPath = fileManager.resolvePath(tilesetPath)

      // Load the JSON file via Tauri FS plugin
      const rawData = await readTextFile(fullPath)

      // Parse and validate the JSON with Zod
      const rawJson = JSON.parse(rawData)
      const tilesetJson = TilesetDataSchema.parse(rawJson)

      // Load the tileset image
      const tilesetDir = fileManager.dirname(fullPath)  // Use fullPath, not tilesetPath
      const imagePath = fileManager.normalize(fileManager.join(tilesetDir, tilesetJson.imagePath))

      console.log('Loading tileset image:', { tilesetPath, fullPath, tilesetDir, relativeImagePath: tilesetJson.imagePath, finalImagePath: imagePath })

      const imageElement = await this._loadImage(imagePath)

      // Create the TilesetData object
      const tileset: TilesetData = {
        ...tilesetJson,
        id: tilesetJson.id || this._generateId(tilesetPath),
        imagePath: imagePath, // Use resolved absolute path, not the relative one from JSON
        imageData: imageElement
      }

      return tileset
    } catch (error) {
      console.error(`Error loading tileset from ${tilesetPath}:`, error)
      throw error
    }
  }

  /**
   * Load an image file and return an HTMLImageElement
   */
  private async _loadImage(imagePath: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        resolve(img)
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${imagePath}`))
      }

      // Use Tauri's convertFileSrc to load the image
      img.src = convertFileSrc(imagePath)
    })
  }

  /**
   * Generate a unique ID for a tileset based on its path
   */
  private _generateId(tilesetPath: string): string {
    const basename = fileManager.basename(tilesetPath, '.lostset')
    return basename.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  /**
   * Get a loaded tileset by path
   */
  getTileset(tilesetPath: string): TilesetData | undefined {
    return this.tilesets.get(tilesetPath)
  }

  /**
   * Get a loaded tileset by ID
   */
  getTilesetById(tilesetId: string): TilesetData | undefined {
    return Array.from(this.tilesets.values()).find(t => t.id === tilesetId)
  }

  /**
   * Get a tile definition from a tileset
   */
  getTileDefinition(tilesetId: string, tileId: string): TileDefinition | undefined {
    const tileset = Array.from(this.tilesets.values()).find(t => t.id === tilesetId)
    if (!tileset) return undefined
    return tileset.tiles.find(t => t.id === tileId)
  }

  /**
   * Get an entity definition from a tileset
   */
  getEntityDefinition(tilesetId: string, entityId: string): EntityDefinition | undefined {
    const tileset = Array.from(this.tilesets.values()).find(t => t.id === tilesetId)
    if (!tileset) return undefined
    return tileset.entities.find(e => e.id === entityId)
  }

  /**
   * Get all loaded tilesets
   */
  getAllTilesets(): TilesetData[] {
    return Array.from(this.tilesets.values())
  }

  /**
   * Unload a tileset
   */
  unloadTileset(tilesetPath: string): boolean {
    return this.tilesets.delete(tilesetPath)
  }

  /**
   * Unload all tilesets
   */
  unloadAll(): void {
    this.tilesets.clear()
    this.loadingPromises.clear()
  }

  /**
   * Reload a tileset (useful for hot-reloading during development)
   */
  async reloadTileset(tilesetPath: string): Promise<TilesetData> {
    this.unloadTileset(tilesetPath)
    return this.loadTileset(tilesetPath)
  }

  /**
   * Check if a tileset is loaded
   */
  isLoaded(tilesetPath: string): boolean {
    return this.tilesets.has(tilesetPath)
  }
}

// Export a singleton instance
export const tilesetManager = new TilesetManager()
