import { convertFileSrc } from '@tauri-apps/api/core'
import { TilesetData, TileDefinition, EntityDefinition } from '../types'
import { TilesetDataSchema, type TilesetDataJson } from '../schemas'
import { fileManager } from './FileManager'
import { FileLoader } from './FileLoader'
import { FileNotFoundError } from '../errors/FileErrors'

/**
 * TilesetManager handles loading, parsing, and managing tileset files
 */
class TilesetManager extends FileLoader<TilesetData, TilesetDataJson> {
  /**
   * Zod schema for tileset validation
   */
  protected get schema() {
    return TilesetDataSchema
  }

  /**
   * Prepare tileset data for serialization by filtering runtime-only fields
   */
  protected prepareForSave(data: TilesetData): TilesetDataJson {
    // Get projectDir for making paths relative
    const projectDir = fileManager.getProjectDir()

    // Determine base directory for relative paths
    const baseDir = projectDir || fileManager.dirname(data.filePath || '')
    const relativeImagePath = fileManager.makeRelativeTo(baseDir, data.imagePath)

    return {
      name: data.name,
      id: data.id,
      imagePath: relativeImagePath,
      tileWidth: data.tileWidth,
      tileHeight: data.tileHeight,
      tiles: data.tiles.map(tile => {
        // Filter out any runtime-only properties that might exist
        const { id, x, y, width, height, colliders, name, type, bitmasks } = tile
        return { id, x, y, width, height, colliders, name, type, bitmasks }
      }),
      entities: data.entities
    }
  }

  /**
   * Post-process validated JSON data by loading images and resolving paths
   */
  protected async postProcess(validated: TilesetDataJson, filePath: string): Promise<TilesetData> {
    const projectDir = fileManager.getProjectDir()

    // Resolve image path
    // If projectDir is available, resolve relative to it (all paths relative to assets root)
    // Otherwise, fall back to resolving relative to the tileset file
    const baseDir = projectDir || fileManager.dirname(filePath)
    const imagePath = fileManager.normalize(fileManager.join(baseDir, validated.imagePath))

    console.log('Loading tileset image:', {
      filePath,
      projectDir,
      baseDir,
      relativeImagePath: validated.imagePath,
      finalImagePath: imagePath
    })

    // Load the image
    const imageElement = await this.loadImage(imagePath)

    // Create the TilesetData object with runtime fields
    return {
      ...validated,
      id: validated.id || this.generateId(filePath),
      imagePath: imagePath, // Use resolved absolute path
      imageData: imageElement,
      filePath: filePath // Set the filePath so we know where this tileset was loaded from
    }
  }

  /**
   * Load an image file and return an HTMLImageElement
   */
  async loadImage(imagePath: string): Promise<HTMLImageElement> {
    // First verify the file exists to prevent browser cache hits
    const { exists } = await import('@tauri-apps/plugin-fs')
    const fileExists = await exists(imagePath)

    if (!fileExists) {
      throw new FileNotFoundError(imagePath, 'Load image')
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
  private generateId(tilesetPath: string): string {
    const basename = fileManager.basename(tilesetPath, '.lostset')
    return basename.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  /**
   * Get a loaded tileset by path
   */
  getTileset(tilesetPath: string): TilesetData | undefined {
    const fullPath = fileManager.resolvePath(tilesetPath)
    const normalizedPath = fileManager.normalize(fullPath)
    return this.cache.get(normalizedPath)
  }

  /**
   * Get a loaded tileset by path (alias for getTileset)
   */
  getTilesetByPath(tilesetPath: string): TilesetData | undefined {
    return this.getTileset(tilesetPath)
  }

  /**
   * Update the imagePath in all loaded tilesets when an image is moved
   */
  updateImagePath(oldImagePath: string, newImagePath: string): void {
    const normalizedOld = fileManager.normalize(oldImagePath)
    const normalizedNew = fileManager.normalize(newImagePath)

    for (const tileset of this.cache.values()) {
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
    return Array.from(this.cache.values()).find(t => t.id === tilesetId)
  }

  /**
   * Get a tile definition from a tileset
   */
  getTileDefinition(tilesetId: string, tileId: string): TileDefinition | undefined {
    const tileset = Array.from(this.cache.values()).find(t => t.id === tilesetId)
    if (!tileset) return undefined
    return tileset.tiles.find(t => t.id === tileId)
  }

  /**
   * Get an entity definition from a tileset
   */
  getEntityDefinition(tilesetId: string, entityId: string): EntityDefinition | undefined {
    const tileset = Array.from(this.cache.values()).find(t => t.id === tilesetId)
    if (!tileset) return undefined
    return tileset.entities.find(e => e.id === entityId)
  }

  /**
   * Get all loaded tilesets
   */
  getAllTilesets(): TilesetData[] {
    return Array.from(this.cache.values())
  }

  /**
   * Unload a tileset
   */
  unloadTileset(tilesetPath: string): boolean {
    const fullPath = fileManager.resolvePath(tilesetPath)
    const normalizedPath = fileManager.normalize(fullPath)

    // Get the tileset before deleting to clear image
    const tileset = this.cache.get(normalizedPath)
    if (tileset?.imageData) {
      tileset.imageData.src = ''
    }

    this.cache.delete(normalizedPath)
    return true
  }

  /**
   * Unload all tilesets
   */
  unloadAll(): void {
    // Clear image src to help browser garbage collection and cache invalidation
    for (const tileset of this.cache.values()) {
      if (tileset.imageData) {
        tileset.imageData.src = ''
      }
    }
    this.clearCache()
  }

  /**
   * Reload a tileset (useful for hot-reloading during development)
   */
  async reloadTileset(tilesetPath: string): Promise<TilesetData> {
    this.invalidate(tilesetPath)
    return this.load(tilesetPath)
  }

  /**
   * Check if a tileset is loaded
   */
  isLoaded(tilesetPath: string): boolean {
    const fullPath = fileManager.resolvePath(tilesetPath)
    const normalizedPath = fileManager.normalize(fullPath)
    return this.cache.has(normalizedPath)
  }

  /**
   * Save a tileset to disk
   * @param tileset - The tileset data to save
   * @param filePath - Optional file path (uses tileset.filePath if not provided)
   */
  async saveTileset(tileset: TilesetData, filePath?: string): Promise<void> {
    const targetPath = filePath || tileset.filePath
    if (!targetPath) {
      throw new Error('No file path specified for saving tileset')
    }

    // Update the tileset's filePath before saving
    tileset.filePath = targetPath

    await this.save(tileset, targetPath)
  }

  /**
   * Legacy method: Load a tileset (now without projectDir parameter)
   * @deprecated Use load() instead
   */
  async loadTileset(tilesetPath: string): Promise<TilesetData> {
    return this.load(tilesetPath)
  }
}

// Export a singleton instance
export const tilesetManager = new TilesetManager()
