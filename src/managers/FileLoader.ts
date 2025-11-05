import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { fileManager } from './FileManager'
import { FileOperationError, ValidationError, SerializationError } from '../errors/FileErrors'
import type { z } from 'zod'

/**
 * Base class for file loaders with caching and validation
 *
 * TData: Runtime data type (e.g., TilesetData with HTMLImageElement)
 * TJson: Serializable JSON type (e.g., TilesetDataJson without HTMLImageElement)
 */
export abstract class FileLoader<TData, TJson> {
  /**
   * Cache of loaded data keyed by file path
   */
  protected cache: Map<string, TData> = new Map()

  /**
   * Map of in-progress loading promises to prevent concurrent loads
   */
  protected loadingPromises: Map<string, Promise<TData>> = new Map()

  /**
   * Zod schema for validation
   * Subclasses must implement this getter
   */
  protected abstract get schema(): z.ZodType<TJson>

  /**
   * Prepare runtime data for serialization
   * Override to filter out runtime-only fields
   *
   * @param data Runtime data
   * @returns Serializable JSON object
   */
  protected abstract prepareForSave(data: TData): TJson

  /**
   * Post-process validated data after loading
   * Override to add runtime fields, load additional assets, etc.
   *
   * @param validated Validated JSON data
   * @param filePath Full path to the file
   * @returns Runtime data with additional processing
   */
  protected abstract postProcess(validated: TJson, filePath: string): Promise<TData>

  /**
   * Load a file with caching and concurrent load protection
   *
   * @param relativePath Relative path to the file
   * @returns Loaded and validated data
   */
  async load(relativePath: string): Promise<TData> {
    // Resolve to absolute path using FileManager
    const fullPath = fileManager.resolvePath(relativePath)
    const normalizedPath = fileManager.normalize(fullPath)

    // Check cache first
    const cached = this.cache.get(normalizedPath)
    if (cached) {
      return cached
    }

    // Check if already loading
    const loadingPromise = this.loadingPromises.get(normalizedPath)
    if (loadingPromise) {
      return loadingPromise
    }

    // Start new load
    const promise = this._loadInternal(relativePath, fullPath, normalizedPath)
    this.loadingPromises.set(normalizedPath, promise)

    try {
      const data = await promise
      this.cache.set(normalizedPath, data)
      return data
    } finally {
      this.loadingPromises.delete(normalizedPath)
    }
  }

  /**
   * Internal load implementation
   *
   * @param relativePath Original relative path
   * @param fullPath Resolved absolute path
   * @param normalizedPath Normalized path for caching
   */
  private async _loadInternal(
    relativePath: string,
    fullPath: string,
    normalizedPath: string
  ): Promise<TData> {
    try {
      // Read file
      const rawData = await readTextFile(fullPath)

      // Parse JSON
      const rawJson = JSON.parse(rawData)

      // Validate with schema
      const validated = this.schema.parse(rawJson) as TJson

      // Post-process (load additional assets, transform data, etc.)
      const data = await this.postProcess(validated, normalizedPath)

      return data
    } catch (error) {
      // Wrap errors with context
      if (error instanceof Error) {
        if (error.name === 'ZodError') {
          throw new ValidationError(fullPath, (error as any).errors, error)
        }
        throw new FileOperationError('Load', fullPath, error)
      }
      throw error
    }
  }

  /**
   * Save data to a file
   *
   * @param data Runtime data to save
   * @param relativePath Relative path where to save
   */
  async save(data: TData, relativePath: string): Promise<void> {
    // Resolve to absolute path
    const fullPath = fileManager.resolvePath(relativePath)
    const normalizedPath = fileManager.normalize(fullPath)

    try {
      // Prepare data for serialization
      const jsonData = this.prepareForSave(data)

      // Serialize to JSON
      const jsonString = JSON.stringify(jsonData, null, 2)

      // Write to file
      await writeTextFile(fullPath, jsonString)

      // Update cache
      this.cache.set(normalizedPath, data)
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('JSON')) {
          throw new SerializationError(fullPath, error)
        }
        throw new FileOperationError('Save', fullPath, error)
      }
      throw error
    }
  }

  /**
   * Update the path of a cached item (e.g., when file is renamed/moved)
   *
   * @param oldPath Old file path
   * @param newPath New file path
   */
  updatePath(oldPath: string, newPath: string): void {
    const oldNormalized = fileManager.normalize(fileManager.resolvePath(oldPath))
    const newNormalized = fileManager.normalize(fileManager.resolvePath(newPath))

    const data = this.cache.get(oldNormalized)
    if (data) {
      this.cache.delete(oldNormalized)
      this.cache.set(newNormalized, data)
    }
  }

  /**
   * Invalidate cache for a specific file
   *
   * @param relativePath Path to invalidate
   */
  invalidate(relativePath: string): void {
    const fullPath = fileManager.resolvePath(relativePath)
    const normalizedPath = fileManager.normalize(fullPath)
    this.cache.delete(normalizedPath)
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear()
    this.loadingPromises.clear()
  }

  /**
   * Get all cached paths
   */
  getCachedPaths(): string[] {
    return Array.from(this.cache.keys())
  }
}
