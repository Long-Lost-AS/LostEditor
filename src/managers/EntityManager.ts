import { EntityDefinition, EntityInstance, Transform } from '../types'
import { tilesetManager } from './TilesetManager'

/**
 * EntityManager handles entity instances and hierarchy transformations
 */
export class EntityManager {
  /**
   * Get an entity definition by tileset ID and entity ID
   */
  getEntityDefinition(tilesetId: string, entityId: string): EntityDefinition | undefined {
    return tilesetManager.getEntityDefinition(tilesetId, entityId)
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
    const sprite = definition.sprite
    let minX = 0
    let minY = 0
    let maxX = sprite.width
    let maxY = sprite.height

    // Traverse children to expand bounding box
    if (definition.children) {
      this.traverseHierarchy(
        definition,
        (node, transform) => {
          const nodeSprite = node.sprite
          const nodeMinX = transform.x
          const nodeMinY = transform.y
          const nodeMaxX = transform.x + nodeSprite.width
          const nodeMaxY = transform.y + nodeSprite.height

          minX = Math.min(minX, nodeMinX)
          minY = Math.min(minY, nodeMinY)
          maxX = Math.max(maxX, nodeMaxX)
          maxY = Math.max(maxY, nodeMaxY)
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
