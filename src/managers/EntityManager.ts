import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { EntityDefinition, EntityInstance, Transform } from '../types'
import { EntityDefinitionSchema } from '../schemas'
import { tilesetManager } from './TilesetManager'
import { fileManager } from './FileManager'

/**
 * EntityManager handles entity instances and hierarchy transformations
 */
export class EntityManager {
  private entities: Map<string, EntityDefinition> = new Map()
  private loadingPromises: Map<string, Promise<EntityDefinition>> = new Map()
  /**
   * Get an entity definition by tileset ID and entity ID
   */
  getEntityDefinition(tilesetId: string, entityId: string): EntityDefinition | undefined {
    return tilesetManager.getEntityDefinition(tilesetId, entityId)
  }

  /**
   * Load an entity from a .lostentity file
   * @param entityPath - Path to the entity file (can be relative or absolute)
   * @param projectDir - Optional project directory to resolve paths relative to
   * @returns Promise resolving to the loaded EntityDefinition
   */
  async loadEntity(entityPath: string, projectDir?: string): Promise<EntityDefinition> {
    // Check if already loaded
    const existing = this.entities.get(entityPath)
    if (existing) {
      return existing
    }

    // Check if currently loading
    const loadingPromise = this.loadingPromises.get(entityPath)
    if (loadingPromise) {
      return loadingPromise
    }

    // Start loading
    const promise = this._loadEntityInternal(entityPath, projectDir)
    this.loadingPromises.set(entityPath, promise)

    try {
      const entity = await promise
      this.entities.set(entityPath, entity)
      return entity
    } finally {
      this.loadingPromises.delete(entityPath)
    }
  }

  /**
   * Internal method to load an entity file
   */
  private async _loadEntityInternal(entityPath: string, projectDir?: string): Promise<EntityDefinition> {
    try {
      // Resolve the full path
      let fullPath: string
      if (projectDir && !fileManager.isAbsolute(entityPath)) {
        fullPath = fileManager.normalize(fileManager.join(projectDir, entityPath))
      } else {
        fullPath = fileManager.resolvePath(entityPath)
      }

      // Load the JSON file
      const rawData = await readTextFile(fullPath)

      // Parse and validate the JSON with Zod
      const rawJson = JSON.parse(rawData)
      const entityJson = EntityDefinitionSchema.parse(rawJson)

      // Create the EntityDefinition object with the file path
      const entity: EntityDefinition = {
        ...entityJson,
        filePath: entityPath
      }

      console.log(`Loaded entity from ${entityPath}:`, entity)
      return entity
    } catch (error) {
      console.error(`Error loading entity from ${entityPath}:`, error)
      throw error
    }
  }

  /**
   * Save an entity to a .lostentity file
   * @param entity - The entity definition to save
   * @param filePath - Optional file path (uses entity.filePath if not provided)
   * @param projectDir - Optional project directory to save paths relative to
   */
  async saveEntity(entity: EntityDefinition, filePath?: string, projectDir?: string): Promise<void> {
    const targetPath = filePath || entity.filePath
    if (!targetPath) {
      throw new Error('No file path specified for saving entity')
    }

    try {
      // Resolve the full path
      const fullPath = fileManager.resolvePath(targetPath)

      // Prepare JSON data
      const jsonData = {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        sprites: entity.sprites,
        offset: entity.offset,
        rotation: entity.rotation,
        colliders: entity.colliders,
        children: entity.children,
        properties: entity.properties
      }

      console.log('EntityManager: Saving entity to', fullPath)

      // Write to file
      const jsonString = JSON.stringify(jsonData, null, 2)
      await writeTextFile(fullPath, jsonString)

      console.log('Saved entity to:', fullPath)

      // Update the in-memory entity with the file path
      entity.filePath = targetPath
      this.entities.set(targetPath, entity)
    } catch (error) {
      console.error(`Error saving entity to ${targetPath}:`, error)
      throw error
    }
  }

  /**
   * Create a new blank entity definition
   * @param name - Optional name for the entity
   * @returns A new EntityDefinition with default values
   */
  createEntity(name?: string): EntityDefinition {
    const id = this._generateEntityId()
    return {
      id,
      name: name || 'New Entity',
      type: undefined,
      sprites: [],
      offset: undefined,
      rotation: undefined,
      colliders: undefined,
      children: undefined,
      properties: undefined,
      filePath: undefined
    }
  }

  /**
   * Generate a unique entity ID
   */
  private _generateEntityId(): string {
    return `entity-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Get a loaded entity by path
   */
  getEntityByPath(entityPath: string): EntityDefinition | undefined {
    return this.entities.get(entityPath)
  }

  /**
   * Unload an entity
   */
  unloadEntity(entityPath: string): boolean {
    return this.entities.delete(entityPath)
  }

  /**
   * Unload all entities
   */
  unloadAll(): void {
    this.entities.clear()
    this.loadingPromises.clear()
  }

  /**
   * Create a new entity instance from a definition
   */
  createInstance(
    tilesetId: string,
    entityDefId: string,
    x: number,
    y: number
  ): EntityInstance | null {
    const definition = this.getEntityDefinition(tilesetId, entityDefId)
    if (!definition) {
      console.error(`Entity definition not found: ${tilesetId}/${entityDefId}`)
      return null
    }

    const instance: EntityInstance = {
      id: this._generateInstanceId(),
      x,
      y,
      entityDefId,
      tilesetId,
      rotation: definition.rotation || 0,
      scale: { x: 1, y: 1 }
    }

    return instance
  }

  /**
   * Generate a unique instance ID
   */
  private _generateInstanceId(): string {
    return `entity-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Get the full transform hierarchy for an entity instance
   * Returns an array of transforms from root to leaf
   */
  getTransformHierarchy(
    instance: EntityInstance,
    definition?: EntityDefinition
  ): Transform[] {
    if (!definition) {
      definition = this.getEntityDefinition(instance.tilesetId, instance.entityDefId)
      if (!definition) return []
    }

    const transforms: Transform[] = []

    // Root transform from instance
    transforms.push({
      x: instance.x,
      y: instance.y,
      rotation: instance.rotation || 0,
      scale: instance.scale || { x: 1, y: 1 }
    })

    return transforms
  }

  /**
   * Recursively traverse an entity definition hierarchy
   * Calls the callback for each node with its accumulated transform
   */
  traverseHierarchy(
    definition: EntityDefinition,
    callback: (node: EntityDefinition, transform: Transform, depth: number) => void,
    parentTransform: Transform = { x: 0, y: 0, rotation: 0, scale: { x: 1, y: 1 } },
    depth: number = 0
  ): void {
    // Calculate this node's transform
    const offset = definition.offset || { x: 0, y: 0 }
    const rotation = definition.rotation || 0

    // Apply parent transform to this node
    const transform: Transform = {
      x: parentTransform.x + offset.x * parentTransform.scale.x,
      y: parentTransform.y + offset.y * parentTransform.scale.y,
      rotation: parentTransform.rotation + rotation,
      scale: parentTransform.scale
    }

    // Call the callback for this node
    callback(definition, transform, depth)

    // Recursively process children
    if (definition.children) {
      for (const child of definition.children) {
        this.traverseHierarchy(child, callback, transform, depth + 1)
      }
    }
  }

  /**
   * Find a child entity definition by ID within a hierarchy
   */
  findChildById(root: EntityDefinition, childId: string): EntityDefinition | undefined {
    if (root.id === childId) {
      return root
    }

    if (root.children) {
      for (const child of root.children) {
        const found = this.findChildById(child, childId)
        if (found) return found
      }
    }

    return undefined
  }

  /**
   * Get all entity definitions from all loaded tilesets
   */
  getAllEntityDefinitions(): Array<{ tilesetId: string; entity: EntityDefinition }> {
    const allEntities: Array<{ tilesetId: string; entity: EntityDefinition }> = []

    const tilesets = tilesetManager.getAllTilesets()
    for (const tileset of tilesets) {
      for (const entity of tileset.entities) {
        allEntities.push({
          tilesetId: tileset.id,
          entity
        })
      }
    }

    return allEntities
  }

  /**
   * Flatten an entity hierarchy into a list of all nodes
   */
  flattenHierarchy(root: EntityDefinition): EntityDefinition[] {
    const nodes: EntityDefinition[] = [root]

    if (root.children) {
      for (const child of root.children) {
        nodes.push(...this.flattenHierarchy(child))
      }
    }

    return nodes
  }

  /**
   * Calculate the bounding box for an entity definition
   * Returns { x, y, width, height } relative to the entity's origin
   */
  calculateBoundingBox(definition: EntityDefinition): {
    x: number
    y: number
    width: number
    height: number
  } {
    let minX = 0
    let minY = 0
    let maxX = 0
    let maxY = 0

    // Calculate bounding box from all sprite layers
    if (definition.sprites && definition.sprites.length > 0) {
      for (const spriteLayer of definition.sprites) {
        const offset = spriteLayer.offset || { x: 0, y: 0 }
        const layerMinX = offset.x
        const layerMinY = offset.y
        const layerMaxX = offset.x + spriteLayer.sprite.width
        const layerMaxY = offset.y + spriteLayer.sprite.height

        minX = Math.min(minX, layerMinX)
        minY = Math.min(minY, layerMinY)
        maxX = Math.max(maxX, layerMaxX)
        maxY = Math.max(maxY, layerMaxY)
      }
    }

    // Traverse children to expand bounding box
    if (definition.children) {
      this.traverseHierarchy(
        definition,
        (node, transform) => {
          // Calculate bounding box for child's sprite layers
          if (node.sprites && node.sprites.length > 0) {
            for (const spriteLayer of node.sprites) {
              const offset = spriteLayer.offset || { x: 0, y: 0 }
              const nodeMinX = transform.x + offset.x
              const nodeMinY = transform.y + offset.y
              const nodeMaxX = transform.x + offset.x + spriteLayer.sprite.width
              const nodeMaxY = transform.y + offset.y + spriteLayer.sprite.height

              minX = Math.min(minX, nodeMinX)
              minY = Math.min(minY, nodeMinY)
              maxX = Math.max(maxX, nodeMaxX)
              maxY = Math.max(maxY, nodeMaxY)
            }
          }
        }
      )
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  /**
   * Clone an entity instance (useful for duplication)
   */
  cloneInstance(instance: EntityInstance): EntityInstance {
    return {
      ...instance,
      id: this._generateInstanceId(),
      children: instance.children ? instance.children.map(c => this.cloneInstance(c)) : undefined
    }
  }
}

// Export a singleton instance
export const entityManager = new EntityManager()
