import { convertFileSrc } from '@tauri-apps/api/core'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
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
   * @param projectDir - Optional project directory to resolve image paths relative to
   * @returns Promise resolving to the loaded TilesetData
   */
  async loadTileset(tilesetPath: string, projectDir?: string): Promise<TilesetData> {
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
    const promise = this._loadTilesetInternal(tilesetPath, projectDir)
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
  private async _loadTilesetInternal(tilesetPath: string, projectDir?: string): Promise<TilesetData> {
    try {
      // Resolve the full path
      // If projectDir is provided and tilesetPath is relative, resolve relative to projectDir
      let fullPath: string
      if (projectDir && !fileManager.isAbsolute(tilesetPath)) {
        fullPath = fileManager.normalize(fileManager.join(projectDir, tilesetPath))
      } else {
        fullPath = fileManager.resolvePath(tilesetPath)
      }

      // Load the JSON file via Tauri FS plugin
      const rawData = await readTextFile(fullPath)

      // Parse and validate the JSON with Zod
      const rawJson = JSON.parse(rawData)
      const tilesetJson = TilesetDataSchema.parse(rawJson)

      // Load the tileset image
      // If projectDir is provided, resolve image path relative to it (all paths relative to assets root)
      // Otherwise, fall back to resolving relative to the tileset file (old behavior for backward compatibility)
      const baseDir = projectDir || fileManager.dirname(fullPath)
      const imagePath = fileManager.normalize(fileManager.join(baseDir, tilesetJson.imagePath))

      console.log('Loading tileset image:', {
        tilesetPath,
        fullPath,
        projectDir,
        baseDir,
        relativeImagePath: tilesetJson.imagePath,
        finalImagePath: imagePath
      })

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
    // First verify the file exists to prevent browser cache hits
    const { exists } = await import('@tauri-apps/plugin-fs')
    const fileExists = await exists(imagePath)

    if (!fileExists) {
      throw new Error(`Image file does not exist: ${imagePath}`)
    }

    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        resolve(img)
      }

      img.onerror = () => {
        reject(new Error(`Failed to load image: ${imagePath}`))
      }

      // Use Tauri's convertFileSrc with cache-busting timestamp
      // This prevents browser from serving stale cached images
      const cacheBuster = `?t=${Date.now()}`
      img.src = convertFileSrc(imagePath) + cacheBuster
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
   * Get a loaded tileset by path (alias for getTileset)
   */
  getTilesetByPath(tilesetPath: string): TilesetData | undefined {
    return this.getTileset(tilesetPath)
  }

  /**
   * Update a tileset's cache key when its path changes
   */
  updateTilesetPath(oldPath: string, newPath: string): void {
    const tileset = this.tilesets.get(oldPath)
    if (tileset) {
      this.tilesets.delete(oldPath)
      tileset.filePath = newPath
      this.tilesets.set(newPath, tileset)
      console.log(`Updated tileset cache key: ${oldPath} -> ${newPath}`)
    }
  }

  /**
   * Update the imagePath in all loaded tilesets when an image is moved
   */
  updateImagePath(oldImagePath: string, newImagePath: string): void {
    const normalizedOld = fileManager.normalize(oldImagePath)
    const normalizedNew = fileManager.normalize(newImagePath)

    for (const tileset of this.tilesets.values()) {
      const normalizedTilesetImagePath = fileManager.normalize(tileset.imagePath)
      if (normalizedTilesetImagePath === normalizedOld) {
        tileset.imagePath = normalizedNew
        console.log(`Updated tileset ${tileset.name} imagePath: ${oldImagePath} -> ${newImagePath}`)
      }
    }
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
    // Clear image src to help browser garbage collection and cache invalidation
    for (const tileset of this.tilesets.values()) {
      if (tileset.imageData) {
        tileset.imageData.src = ''
      }
    }
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

  /**
   * Save a tileset to disk
   * @param tileset - The tileset data to save
   * @param filePath - Optional file path (uses tileset.filePath if not provided)
   * @param projectDir - Optional project directory to save paths relative to (defaults to tileset directory for backward compatibility)
   */
  async saveTileset(tileset: TilesetData, filePath?: string, projectDir?: string): Promise<void> {
    const targetPath = filePath || tileset.filePath
    if (!targetPath) {
      throw new Error('No file path specified for saving tileset')
    }

    try {
      // Resolve the full path
      const fullPath = fileManager.resolvePath(targetPath)

      // If projectDir is provided, make image path relative to it (all paths relative to assets root)
      // Otherwise, fall back to tileset directory (old behavior for backward compatibility)
      const baseDir = projectDir || fileManager.dirname(fullPath)
      const relativeImagePath = fileManager.makeRelativeTo(baseDir, tileset.imagePath)

      // Prepare JSON data (exclude runtime-only fields like imageData and cells)
      const jsonData = {
        version: tileset.version,
        name: tileset.name,
        id: tileset.id,
        imagePath: relativeImagePath,
        tileWidth: tileset.tileWidth,
        tileHeight: tileset.tileHeight,
        tiles: tileset.tiles.map(tile => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { cells, ...rest } = tile as any
          return rest
        }),
        entities: tileset.entities
      }

      console.log('TilesetManager: Saving', jsonData.tiles.length, 'tiles to', fullPath)

      // Write to file
      const jsonString = JSON.stringify(jsonData, null, 2)
      await writeTextFile(fullPath, jsonString)

      console.log('Saved tileset to:', fullPath)

      // Update the in-memory tileset with the file path
      tileset.filePath = targetPath
      this.tilesets.set(targetPath, tileset)
    } catch (error) {
      console.error(`Error saving tileset to ${targetPath}:`, error)
      throw error
    }
  }
}

// Export a singleton instance
export const tilesetManager = new TilesetManager()
