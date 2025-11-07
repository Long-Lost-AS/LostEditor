import { type EntityDefinitionJson, EntityDefinitionSchema } from "../schemas";
import type { EntityDefinition, EntityInstance, Transform } from "../types";
import { FileLoader } from "./FileLoader";
import { fileManager } from "./FileManager";
import { tilesetManager } from "./TilesetManager";

/**
 * EntityManager handles entity instances and hierarchy transformations
 */
class EntityManager extends FileLoader<EntityDefinition, EntityDefinitionJson> {
	/**
	 * Zod schema for entity validation
	 */
	protected get schema() {
		return EntityDefinitionSchema;
	}

	/**
	 * Prepare entity data for serialization by excluding filePath
	 */
	protected prepareForSave(data: EntityDefinition): EntityDefinitionJson {
		// Exclude filePath from serialization (runtime-only field)
		const { filePath, ...jsonData } = data;
		return jsonData as EntityDefinitionJson;
	}

	/**
	 * Post-process validated JSON data by adding filePath
	 */
	protected async postProcess(
		validated: EntityDefinitionJson,
		filePath: string,
	): Promise<EntityDefinition> {
		// Add filePath as a runtime field
		return {
			...validated,
			filePath: filePath,
		};
	}

	/**
	 * Get an entity definition by entity ID
	 * Note: tilesetId parameter is ignored (legacy parameter, entities are no longer stored in tilesets)
	 */
	getEntityDefinition(
		tilesetId: string,
		entityId: string,
	): EntityDefinition | undefined {
		// Search through all loaded entities to find one with matching ID
		return this.getAllEntities().find((e) => e.id === entityId);
	}

	/**
	 * Get a loaded entity by path
	 */
	getEntity(entityPath: string): EntityDefinition | undefined {
		const fullPath = fileManager.resolvePath(entityPath);
		const normalizedPath = fileManager.normalize(fullPath);
		return this.cache.get(normalizedPath);
	}

	/**
	 * Get all loaded entities
	 */
	getAllEntities(): EntityDefinition[] {
		return Array.from(this.cache.values());
	}

	/**
	 * Save an entity to disk
	 * @param entity - The entity definition to save
	 * @param filePath - Optional file path (uses entity.filePath if not provided)
	 */
	async saveEntity(entity: EntityDefinition, filePath?: string): Promise<void> {
		const targetPath = filePath || entity.filePath;
		if (!targetPath) {
			throw new Error("No file path specified for saving entity");
		}

		// Update the entity's filePath before saving
		entity.filePath = targetPath;

		await this.save(entity, targetPath);
	}

	/**
	 * Legacy method: Load an entity
	 * @deprecated Use load() instead
	 */
	async loadEntity(entityPath: string): Promise<EntityDefinition> {
		return this.load(entityPath);
	}

	/**
	 * Create a new entity instance
	 * @param tilesetId - Reference to tileset containing the entity sprites
	 * @param entityDefId - Reference to entity definition
	 * @param x - X position in pixel coordinates
	 * @param y - Y position in pixel coordinates
	 * @returns A new EntityInstance object
	 */
	createInstance(
		tilesetId: string,
		entityDefId: string,
		x: number,
		y: number,
	): EntityInstance {
		return {
			id: `instance-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
			x,
			y,
			entityDefId,
			tilesetId,
		};
	}

	/**
	 * Apply transform recursively to an entity instance and its children
	 */
	applyTransformRecursive(
		entity: EntityInstance,
		parentTransform: Transform = {
			x: 0,
			y: 0,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
		},
	): Transform {
		const x = parentTransform.x + entity.x;
		const y = parentTransform.y + entity.y;
		const rotation = (parentTransform.rotation || 0) + (entity.rotation || 0);
		const scale = entity.scale || { x: 1, y: 1 };
		const scaleX = parentTransform.scaleX * scale.x;
		const scaleY = parentTransform.scaleY * scale.y;

		const transform: Transform = { x, y, rotation, scaleX, scaleY };

		// Apply to children
		if (entity.children) {
			for (const child of entity.children) {
				this.applyTransformRecursive(child, transform);
			}
		}

		return transform;
	}
}

// Export a singleton instance
export const entityManager = new EntityManager();
