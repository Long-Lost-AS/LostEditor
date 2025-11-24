import { readDir } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { entityManager } from "../managers/EntityManager";
import { fileManager } from "../managers/FileManager";
import type { EntityDefinition } from "../types";

interface EntityListItemProps {
	entity: EntityDefinition;
	onSelect: (entityDefId: string, tilesetId: string) => void;
	selectedEntityDefId: string | null;
}

const EntityListItem = ({
	entity,
	onSelect,
	selectedEntityDefId,
}: EntityListItemProps) => {
	const isSelected = selectedEntityDefId === entity.id;

	// Get the first sprite's tileset ID if available
	const tilesetId =
		entity.sprites && entity.sprites.length > 0
			? entity.sprites[0].tilesetId
			: "";

	return (
		<div
			className={`flex items-center py-2 px-3 cursor-pointer rounded hover:bg-gray-700 ${
				isSelected ? "bg-blue-600" : ""
			}`}
			onClick={() => onSelect(entity.id, tilesetId)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(entity.id, tilesetId);
				}
			}}
			role="option"
			aria-selected={isSelected}
			tabIndex={0}
		>
			<span className="text-sm text-white flex-1 truncate">
				{entity.name || entity.id}
			</span>
			{entity.sprites && entity.sprites.length > 0 && (
				<span className="ml-2 text-xs text-gray-400">
					{entity.sprites.length} sprite{entity.sprites.length !== 1 ? "s" : ""}
				</span>
			)}
		</div>
	);
};

/**
 * Recursively scan directory for .lostentity files
 */
async function scanForEntityFiles(dirPath: string): Promise<string[]> {
	const entityFiles: string[] = [];

	try {
		const entries = await readDir(dirPath);

		for (const entry of entries) {
			const fullPath = fileManager.join(dirPath, entry.name);

			if (entry.isDirectory) {
				// Skip hidden directories
				if (entry.name.startsWith(".")) {
					continue;
				}

				// Recursively scan subdirectories
				const subFiles = await scanForEntityFiles(fullPath);
				entityFiles.push(...subFiles);
			} else if (entry.name.endsWith(".lostentity")) {
				entityFiles.push(fullPath);
			}
		}
	} catch (error) {
		console.error(`Failed to scan directory ${dirPath}:`, error);
	}

	return entityFiles;
}

export const EntityPanel = () => {
	const {
		projectDirectory,
		selectedEntityDefId,
		setSelectedEntityDefId,
		setSelectedTileId,
	} = useEditor();

	const [entities, setEntities] = useState<EntityDefinition[]>([]);
	const [loading, setLoading] = useState(false);

	// Load all entity files from project
	useEffect(() => {
		if (!projectDirectory) {
			setEntities([]);
			return;
		}

		const loadEntities = async () => {
			setLoading(true);
			try {
				// Scan for .lostentity files
				const entityFiles = await scanForEntityFiles(projectDirectory);

				// Get currently cached paths
				const cachedPaths = entityManager.getCachedPaths();

				// Normalize scanned file paths for comparison
				const normalizedScannedPaths = new Set(
					entityFiles.map((path) => fileManager.normalize(path)),
				);

				// Remove cached entities that no longer exist in the file system
				for (const cachedPath of cachedPaths) {
					if (!normalizedScannedPaths.has(cachedPath)) {
						entityManager.invalidate(cachedPath);
					}
				}

				// Load each entity file
				const loadedEntities: EntityDefinition[] = [];
				for (const filePath of entityFiles) {
					try {
						const entity = await entityManager.load(filePath);
						loadedEntities.push(entity);
					} catch (error) {
						console.error(`Failed to load entity ${filePath}:`, error);
					}
				}

				setEntities(loadedEntities);
			} catch (error) {
				console.error("Failed to scan for entities:", error);
			} finally {
				setLoading(false);
			}
		};

		loadEntities();
	}, [projectDirectory]);

	const handleSelect = (entityDefId: string, tilesetId: string) => {
		setSelectedEntityDefId(tilesetId, entityDefId);
		setSelectedTileId(null); // Clear tile selection
	};

	// Get info about selected entity
	const selectedEntity = selectedEntityDefId
		? entities.find((e) => e.id === selectedEntityDefId)
		: null;

	return (
		<div className="panel">
			<h3>Entities</h3>

			{/* Entity list */}
			{loading ? (
				<div className="text-gray-400 text-sm p-4 text-center">
					Loading entities...
				</div>
			) : entities.length > 0 ? (
				<div className="max-h-96 overflow-y-auto border border-gray-700 rounded p-1">
					{entities.map((entity) => (
						<EntityListItem
							key={entity.id}
							entity={entity}
							onSelect={handleSelect}
							selectedEntityDefId={selectedEntityDefId}
						/>
					))}
				</div>
			) : (
				<div className="text-gray-400 text-sm p-4 text-center">
					No entities available.
					<br />
					Create entity files (.lostentity) in your project.
				</div>
			)}

			{/* Selected entity info */}
			{selectedEntity && (
				<div className="mt-3 p-2 bg-gray-800 rounded text-xs">
					<div className="font-semibold text-white mb-1">
						{selectedEntity.name || selectedEntity.id}
					</div>
					<div className="text-gray-400 space-y-0.5">
						{selectedEntity.sprites && selectedEntity.sprites.length > 0 && (
							<>
								<div>Sprites: {selectedEntity.sprites.length}</div>
								{selectedEntity.sprites[0] && (
									<div>
										Primary: {selectedEntity.sprites[0].rect.width}×
										{selectedEntity.sprites[0].rect.height}px
									</div>
								)}
							</>
						)}
						{selectedEntity.colliders &&
							selectedEntity.colliders.length > 0 && (
								<div className="text-green-400">
									Colliders: {selectedEntity.colliders.length}
								</div>
							)}
						{selectedEntity.properties &&
							Object.keys(selectedEntity.properties).length > 0 && (
								<div>
									Properties: {Object.keys(selectedEntity.properties).length}
								</div>
							)}
					</div>
				</div>
			)}
		</div>
	);
};
