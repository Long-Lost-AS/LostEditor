import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { entityManager } from "../managers/EntityManager";
import {
	type EntityDefinition,
	type EntityInstance,
	hasImageData,
	type MapData,
	type SpriteLayer,
	type Tool,
} from "../types";
import { packTileId, unpackTileId } from "../utils/tileId";

// Map canvas props interface
interface MapCanvasProps {
	mapData: MapData;
	currentTool: Tool;
	currentLayerId: string | null;
	onPlaceTilesBatch: (tiles: Array<{ x: number; y: number }>) => void;
	onEraseTile: (x: number, y: number) => void;
	onPlaceEntity: (x: number, y: number) => void;
	onMoveEntity: (entityId: string, newX: number, newY: number) => void;
	onEntitySelected?: (entityId: string | null) => void;
	onEntityDragging?: (entityId: string, newX: number, newY: number) => void;
	onDeleteEntity?: (entityId: string) => void;
	onStartBatch?: () => void;
	onEndBatch?: () => void;
}

export const MapCanvas = ({
	mapData,
	currentTool,
	currentLayerId,
	onPlaceTilesBatch,
	onEraseTile,
	onPlaceEntity,
	onMoveEntity,
	onEntitySelected,
	onEntityDragging,
	onDeleteEntity,
	onStartBatch,
	onEndBatch,
}: MapCanvasProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const {
		tilesets,
		getTilesetById,
		zoom,
		setZoom,
		panX,
		panY,
		setPan,
		gridVisible,
		autotilingOverride,
		selectedTilesetId,
		selectedTileId,
		selectedEntityDefId,
		openEntityFromFile,
	} = useEditor();

	const [isDragging, setIsDragging] = useState(false);
	const [isDrawing, setIsDrawing] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartY, setDragStartY] = useState(0);
	const [mouseScreenPos, setMouseScreenPos] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// Pencil stroke batching - collect all tiles drawn in one stroke
	const [pencilStrokeTiles, setPencilStrokeTiles] = useState<
		Array<{ x: number; y: number }>
	>([]);

	// Rectangle tool state
	const [isDrawingRect, setIsDrawingRect] = useState(false);
	const [rectStartTile, setRectStartTile] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// Pointer tool state (for selecting and moving entities)
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
	const selectedEntityIdRef = useRef<string | null>(null); // Ref for immediate access
	const [isDraggingEntity, setIsDraggingEntity] = useState(false);
	const [entityDragStart, setEntityDragStart] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [entityDragOffset, setEntityDragOffset] = useState<{
		x: number;
		y: number;
	}>({ x: 0, y: 0 });
	const [tempEntityPosition, setTempEntityPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const tempEntityPositionRef = useRef<{ x: number; y: number } | null>(null); // Ref for immediate access
	const [isHoveringSelectedEntity, setIsHoveringSelectedEntity] =
		useState(false);
	const DRAG_THRESHOLD = 5; // pixels before starting drag

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		visible: boolean;
		x: number;
		y: number;
		entityId: string | null;
	}>({ visible: false, x: 0, y: 0, entityId: null });

	// Fill tool - flood fill helper function
	const floodFill = (startX: number, startY: number) => {
		// Get the current active layer
		if (!currentLayerId) {
			return;
		}
		const activeLayer = mapData.layers.find(
			(layer) => layer.id === currentLayerId,
		);
		if (!activeLayer || activeLayer.type === "entity") {
			return;
		}

		// Get the target tile ID (what we're replacing)
		const startIndex = startY * mapData.width + startX;
		const targetTileId = activeLayer.tiles[startIndex] || 0; // Treat undefined as 0 (empty)

		// Get the replacement tile ID and convert to global tile ID
		if (!selectedTileId || !selectedTilesetId) {
			return;
		}

		const selectedTileset = tilesets.find((ts) => ts.id === selectedTilesetId);
		const tilesetIndex = selectedTileset?.order ?? -1;
		if (tilesetIndex === -1) {
			return;
		}

		const geometry = unpackTileId(selectedTileId);
		const globalTileId = packTileId(
			geometry.x,
			geometry.y,
			tilesetIndex,
			geometry.flipX,
			geometry.flipY,
		);

		// Don't fill if clicking on the same tile
		if (targetTileId === globalTileId) {
			return;
		}

		// Collect all tiles to fill in a single batch
		const tilesToFill: Array<{ x: number; y: number }> = [];
		const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
		const visited = new Set<number>();

		while (queue.length > 0) {
			const pos = queue.shift();
			if (!pos) continue;
			const { x, y } = pos;
			const index = y * mapData.width + x;

			// Skip if out of bounds
			if (x < 0 || x >= mapData.width || y < 0 || y >= mapData.height) continue;

			// Skip if already visited
			if (visited.has(index)) continue;
			visited.add(index);

			// Skip if not the target tile (treat undefined as 0)
			const currentTileId = activeLayer.tiles[index] || 0;
			if (currentTileId !== targetTileId) continue;

			// Add to batch
			tilesToFill.push({ x, y });

			// Add neighbors to queue
			queue.push({ x: x + 1, y });
			queue.push({ x: x - 1, y });
			queue.push({ x, y: y + 1 });
			queue.push({ x, y: y - 1 });
		}

		// Place all tiles in a single batch operation
		if (tilesToFill.length > 0) {
			onPlaceTilesBatch(tilesToFill);
		}
	};

	// Refs to track current pan values for wheel event
	const panXRef = useRef(panX);
	const panYRef = useRef(panY);
	const zoomRef = useRef(zoom);
	const mouseScreenPosRef = useRef<{ x: number; y: number } | null>(null);
	const selectedTilesetIdRef = useRef(selectedTilesetId);
	const selectedTileIdRef = useRef(selectedTileId);
	const selectedEntityDefIdRef = useRef(selectedEntityDefId);
	const currentToolRef = useRef(currentTool);

	useEffect(() => {
		panXRef.current = panX;
		panYRef.current = panY;
		zoomRef.current = zoom;
		mouseScreenPosRef.current = mouseScreenPos;
		selectedTilesetIdRef.current = selectedTilesetId;
		selectedTileIdRef.current = selectedTileId;
		selectedEntityDefIdRef.current = selectedEntityDefId;
		currentToolRef.current = currentTool;
	}, [
		panX,
		panY,
		zoom,
		mouseScreenPos,
		selectedTilesetId,
		selectedTileId,
		selectedEntityDefId,
		currentTool,
	]);

	// Render an entity with its hierarchy
	const renderEntity = useCallback(
		(
			ctx: CanvasRenderingContext2D,
			entityDef: EntityDefinition,
			instance: EntityInstance,
			tilesetImage: HTMLImageElement,
			parentX: number = instance.x,
			parentY: number = instance.y,
			parentRotation: number = 0,
		) => {
			// Render all sprite layers in the entity
			if (entityDef.sprites && entityDef.sprites.length > 0) {
				entityDef.sprites.forEach((spriteLayer: SpriteLayer) => {
					// Skip if sprite is missing
					if (!spriteLayer.sprite) return;

					ctx.save();

					const sprite = spriteLayer.sprite;
					const offset = spriteLayer.offset || { x: 0, y: 0 };
					const origin = spriteLayer.origin || { x: 0.5, y: 1 };
					const rotation =
						parentRotation + (spriteLayer.rotation || 0) + instance.rotation;
					const scale = instance.scale;

					// Calculate scaled dimensions
					const scaledWidth = sprite.width * scale.x;
					const scaledHeight = sprite.height * scale.y;

					// Calculate position based on origin point (using scaled dimensions)
					const originOffsetX = origin.x * scaledWidth;
					const originOffsetY = origin.y * scaledHeight;

					const x = parentX - originOffsetX + offset.x;
					const y = parentY - originOffsetY + offset.y;

					// Apply rotation if needed
					if (rotation !== 0) {
						ctx.translate(parentX, parentY);
						ctx.rotate((rotation * Math.PI) / 180);
						ctx.translate(-parentX, -parentY);
					}

					// Draw sprite with scale applied
					ctx.drawImage(
						tilesetImage,
						sprite.x,
						sprite.y,
						sprite.width,
						sprite.height,
						x,
						y,
						scaledWidth,
						scaledHeight,
					);

					ctx.restore();
				});
			}

			// Render children (if entity definitions support hierarchical children)
			for (const child of entityDef.children) {
				renderEntity(
					ctx,
					child,
					instance,
					tilesetImage,
					parentX,
					parentY,
					parentRotation,
				);
			}
		},
		[],
	);

	// Extract render logic to a function so we can call it synchronously after resize
	const renderMap = useRef<() => void>(() => {});

	// Update renderMap ref when dependencies change
	useEffect(() => {
		renderMap.current = () => {
			const canvas = canvasRef.current;
			if (!canvas) return;

			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			// Guard against undefined/invalid mapData
			if (!mapData || !mapData.layers || !Array.isArray(mapData.layers)) {
				return;
			}

			// Clear canvas
			ctx.fillStyle = "#2a2a2a";
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			ctx.save();
			ctx.translate(panX, panY);
			ctx.scale(zoom, zoom);

			// Render each layer bottom-to-top
			mapData.layers.forEach((layer) => {
				if (!layer.visible) return;

				if (layer.type === "tile" || !layer.type) {
					// Render tile layer - iterate dense array
					// Collect compound tile positions to draw indicators after all tiles
					const compoundTilePositions: Array<{ x: number; y: number }> = [];
					let _tileCount = 0;

					for (let index = 0; index < layer.tiles.length; index++) {
						const tileId = layer.tiles[index];
						if (tileId === 0) continue; // Skip empty tiles

						_tileCount++;
						// Calculate x, y position from array index
						const x = index % mapData.width;
						const y = Math.floor(index / mapData.width);

						// Unpack tile geometry from the packed ID (includes tileset index)
						const geometry = unpackTileId(tileId);

						// Get tileset by index
						const tileset = tilesets[geometry.tilesetIndex];
						if (!tileset?.imageData) {
							continue;
						}

						// Create local tile ID to find definition
						const localTileId = packTileId(
							geometry.x,
							geometry.y,
							0,
							geometry.flipX,
							geometry.flipY,
						);

						// Find tile definition
						const tileDefinition = tileset.tiles.find(
							(t) => t.id === localTileId,
						);

						// Determine dimensions
						let sourceWidth = tileset.tileWidth;
						let sourceHeight = tileset.tileHeight;
						let originOffsetX = 0;
						let originOffsetY = 0;

						if (
							tileDefinition?.isCompound &&
							tileDefinition.width &&
							tileDefinition.height
						) {
							// Compound tile - use full dimensions
							sourceWidth = tileDefinition.width;
							sourceHeight = tileDefinition.height;

							// Apply origin offset if specified
							if (tileDefinition.origin) {
								originOffsetX = tileDefinition.origin.x * sourceWidth;
								originOffsetY = tileDefinition.origin.y * sourceHeight;
							}

							// Store position for indicator drawing later
							compoundTilePositions.push({ x, y });
						}

						// Draw the tile with origin offset
						ctx.drawImage(
							tileset.imageData,
							geometry.x,
							geometry.y,
							sourceWidth,
							sourceHeight,
							x * mapData.tileWidth - originOffsetX,
							y * mapData.tileHeight - originOffsetY,
							sourceWidth,
							sourceHeight,
						);
					}

					// Draw compound tile indicators on top of all tiles
					compoundTilePositions.forEach(({ x, y }) => {
						// Draw a small dot at the center of the cell that stores this compound tile
						const cellCenterX = x * mapData.tileWidth + mapData.tileWidth / 2;
						const cellCenterY = y * mapData.tileHeight + mapData.tileHeight / 2;

						ctx.fillStyle = "rgba(255, 165, 0, 0.7)";
						ctx.beginPath();
						ctx.arc(cellCenterX, cellCenterY, 3 / zoom, 0, Math.PI * 2);
						ctx.fill();

						// Draw a small outline around the origin cell
						ctx.strokeStyle = "rgba(255, 165, 0, 0.5)";
						ctx.lineWidth = 1 / zoom;
						ctx.strokeRect(
							x * mapData.tileWidth,
							y * mapData.tileHeight,
							mapData.tileWidth,
							mapData.tileHeight,
						);
					});
				}
			});

			// Render map-level entities (on top of all layers)
			if (mapData.entities && mapData.entities.length > 0) {
				// Helper function to calculate Y-sort position for an entity
				const getEntityYSortPosition = (instance: EntityInstance) => {
					const entityDef = entityManager.getEntityDefinition(
						instance.tilesetId,
						instance.entityDefId,
					);

					if (!entityDef?.sprites || entityDef.sprites.length === 0) {
						return instance.y;
					}

					// Find the minimum ysortOffset among all sprite layers
					// (entities with lower ysortOffset should render first)
					let minYSortOffset = 0;
					entityDef.sprites.forEach((sprite: SpriteLayer) => {
						const ysortOffset = sprite.ysortOffset || 0;
						if (ysortOffset < minYSortOffset) {
							minYSortOffset = ysortOffset;
						}
					});

					return instance.y + minYSortOffset;
				};

				// Sort entities by Y position + ySortOffset for proper depth rendering
				const sortedEntities = [...mapData.entities].sort((a, b) => {
					const aY = getEntityYSortPosition(a);
					const bY = getEntityYSortPosition(b);
					return aY - bY;
				});

				sortedEntities.forEach((entityInstance) => {
					const tileset = getTilesetById(entityInstance.tilesetId);
					if (!tileset?.imageData) return;

					const entityDef = entityManager.getEntityDefinition(
						entityInstance.tilesetId,
						entityInstance.entityDefId,
					);

					if (!entityDef) return;

					// Use temp position if this entity is being dragged
					const instanceToRender =
						isDraggingEntity &&
						selectedEntityId === entityInstance.id &&
						tempEntityPosition
							? {
									...entityInstance,
									x: tempEntityPosition.x,
									y: tempEntityPosition.y,
								}
							: entityInstance;

					// Render entity with hierarchy
					renderEntity(ctx, entityDef, instanceToRender, tileset.imageData);
				});
			}

			// Draw grid
			if (gridVisible) {
				ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
				ctx.lineWidth = 1 / zoom;

				for (let x = 0; x <= mapData.width; x++) {
					ctx.beginPath();
					ctx.moveTo(x * mapData.tileWidth, 0);
					ctx.lineTo(
						x * mapData.tileWidth,
						mapData.height * mapData.tileHeight,
					);
					ctx.stroke();
				}

				for (let y = 0; y <= mapData.height; y++) {
					ctx.beginPath();
					ctx.moveTo(0, y * mapData.tileHeight);
					ctx.lineTo(mapData.width * mapData.tileWidth, y * mapData.tileHeight);
					ctx.stroke();
				}
			}

			// Draw hover preview (for tile placement)
			const mousePos = mouseScreenPosRef.current;
			const tool = currentToolRef.current;
			const tilesetId = selectedTilesetIdRef.current;
			const tileId = selectedTileIdRef.current;

			if (mousePos && tool === "pencil" && tilesetId && tileId && canvas) {
				// Calculate tile position from screen coordinates using current pan/zoom
				const rect = canvas.getBoundingClientRect();
				const canvasX = mousePos.x - rect.left;
				const canvasY = mousePos.y - rect.top;
				const worldX = (canvasX - panX) / zoom;
				const worldY = (canvasY - panY) / zoom;
				const tileX = Math.floor(worldX / mapData.tileWidth);
				const tileY = Math.floor(worldY / mapData.tileHeight);

				// Unpack tileId to get tileset index and geometry
				const geometry = unpackTileId(tileId);
				const tileset = tilesets[geometry.tilesetIndex];
				if (tileset?.imageData) {
					// Create local tile ID to find definition
					const localTileId = packTileId(
						geometry.x,
						geometry.y,
						0,
						geometry.flipX,
						geometry.flipY,
					);
					const tileDef = tileset.tiles.find((t) => t.id === localTileId);

					// Determine dimensions (use tile definition if compound, otherwise use tileset defaults)
					const sourceWidth =
						tileDef && tileDef.width !== 0 ? tileDef.width : tileset.tileWidth;
					const sourceHeight =
						tileDef && tileDef.height !== 0
							? tileDef.height
							: tileset.tileHeight;

					// Calculate origin offset
					const originX = tileDef?.origin.x ?? 0;
					const originY = tileDef?.origin.y ?? 0;
					const offsetX = originX * sourceWidth;
					const offsetY = originY * sourceHeight;

					// Semi-transparent preview
					ctx.globalAlpha = 0.5;

					ctx.drawImage(
						tileset.imageData,
						geometry.x,
						geometry.y,
						sourceWidth,
						sourceHeight,
						tileX * mapData.tileWidth - offsetX,
						tileY * mapData.tileHeight - offsetY,
						sourceWidth,
						sourceHeight,
					);

					ctx.globalAlpha = 1.0;

					// Draw origin point indicator for compound tiles
					if (tileDef?.isCompound) {
						// Center of the tile where the mouse is
						const originWorldX =
							tileX * mapData.tileWidth + mapData.tileWidth / 2;
						const originWorldY =
							tileY * mapData.tileHeight + mapData.tileHeight / 2;

						// Draw crosshair
						ctx.strokeStyle = "rgba(255, 165, 0, 0.8)";
						ctx.lineWidth = 2 / zoom;
						const markerSize = 6 / zoom;

						ctx.beginPath();
						ctx.moveTo(originWorldX - markerSize, originWorldY);
						ctx.lineTo(originWorldX + markerSize, originWorldY);
						ctx.moveTo(originWorldX, originWorldY - markerSize);
						ctx.lineTo(originWorldX, originWorldY + markerSize);
						ctx.stroke();

						// Draw center dot
						ctx.fillStyle = "rgba(255, 165, 0, 0.8)";
						ctx.beginPath();
						ctx.arc(originWorldX, originWorldY, 2 / zoom, 0, Math.PI * 2);
						ctx.fill();
					}
				}
			}

			// Draw entity preview (when entity tool is active)
			if (
				mousePos &&
				tool === "entity" &&
				selectedTilesetId &&
				selectedEntityDefId &&
				canvas
			) {
				const entityDefId = selectedEntityDefIdRef.current;
				if (entityDefId) {
					const entityDef = entityManager.getEntityDefinition(
						selectedTilesetId,
						entityDefId,
					);
					const tileset = getTilesetById(selectedTilesetId);

					if (
						entityDef &&
						tileset &&
						hasImageData(tileset) &&
						entityDef.sprites &&
						entityDef.sprites.length > 0
					) {
						// Calculate world position from screen coordinates
						const rect = canvas.getBoundingClientRect();
						const canvasX = mousePos.x - rect.left;
						const canvasY = mousePos.y - rect.top;
						const worldX = (canvasX - panX) / zoom;
						const worldY = (canvasY - panY) / zoom;

						// Draw entity with semi-transparency
						ctx.globalAlpha = 0.5;

						// Render each sprite in the entity
						entityDef.sprites.forEach((spriteLayer) => {
							// Skip if sprite is missing
							if (!spriteLayer.sprite) return;

							const sprite = spriteLayer.sprite;
							const offset = spriteLayer.offset || { x: 0, y: 0 };
							const origin = spriteLayer.origin || { x: 0.5, y: 1 };

							// Calculate position based on origin point
							const originOffsetX = origin.x * sprite.width;
							const originOffsetY = origin.y * sprite.height;

							const drawX = worldX - originOffsetX + offset.x;
							const drawY = worldY - originOffsetY + offset.y;

							ctx.drawImage(
								tileset.imageData,
								sprite.x,
								sprite.y,
								sprite.width,
								sprite.height,
								drawX,
								drawY,
								sprite.width,
								sprite.height,
							);
						});

						ctx.globalAlpha = 1.0;

						// Draw crosshair at cursor position to indicate placement point
						ctx.strokeStyle = "rgba(255, 165, 0, 0.8)";
						ctx.lineWidth = 2 / zoom;
						const markerSize = 6 / zoom;

						ctx.beginPath();
						ctx.moveTo(worldX - markerSize, worldY);
						ctx.lineTo(worldX + markerSize, worldY);
						ctx.moveTo(worldX, worldY - markerSize);
						ctx.lineTo(worldX, worldY + markerSize);
						ctx.stroke();

						// Draw center dot
						ctx.fillStyle = "rgba(255, 165, 0, 0.8)";
						ctx.beginPath();
						ctx.arc(worldX, worldY, 2 / zoom, 0, Math.PI * 2);
						ctx.fill();
					}
				}
			}

			// Draw selection highlight for selected entity (use refs for immediate updates)
			const currentSelectedId = selectedEntityIdRef.current;
			const currentTempPos = tempEntityPositionRef.current;
			if (currentSelectedId && mapData.entities) {
				const selectedEntity = mapData.entities.find(
					(e) => e.id === currentSelectedId,
				);
				if (selectedEntity) {
					const tileset = getTilesetById(selectedEntity.tilesetId);
					const entityDef = entityManager.getEntityDefinition(
						selectedEntity.tilesetId,
						selectedEntity.entityDefId,
					);

					if (
						entityDef &&
						tileset?.imageData &&
						entityDef.sprites &&
						entityDef.sprites.length > 0
					) {
						// Use temp position if dragging, otherwise use actual position
						const entityX =
							isDraggingEntity && currentTempPos
								? currentTempPos.x
								: selectedEntity.x;
						const entityY =
							isDraggingEntity && currentTempPos
								? currentTempPos.y
								: selectedEntity.y;
						const scale = selectedEntity.scale;

						// Calculate bounding box for the entity
						let minX = Infinity,
							minY = Infinity,
							maxX = -Infinity,
							maxY = -Infinity;

						entityDef.sprites.forEach((spriteLayer) => {
							if (!spriteLayer.sprite) return;

							const sprite = spriteLayer.sprite;
							const offset = spriteLayer.offset || { x: 0, y: 0 };
							const origin = spriteLayer.origin || { x: 0.5, y: 1 };

							// Calculate scaled dimensions
							const scaledWidth = sprite.width * scale.x;
							const scaledHeight = sprite.height * scale.y;

							const originOffsetX = origin.x * scaledWidth;
							const originOffsetY = origin.y * scaledHeight;

							const drawX = entityX - originOffsetX + offset.x;
							const drawY = entityY - originOffsetY + offset.y;

							minX = Math.min(minX, drawX);
							minY = Math.min(minY, drawY);
							maxX = Math.max(maxX, drawX + scaledWidth);
							maxY = Math.max(maxY, drawY + scaledHeight);
						});

						// Draw selection box
						ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
						ctx.lineWidth = 2 / zoom;
						ctx.setLineDash([5 / zoom, 5 / zoom]);
						ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
						ctx.setLineDash([]);

						// Draw corner handles
						const handleSize = 6 / zoom;
						ctx.fillStyle = "rgba(0, 150, 255, 1)";
						ctx.fillRect(
							minX - handleSize / 2,
							minY - handleSize / 2,
							handleSize,
							handleSize,
						);
						ctx.fillRect(
							maxX - handleSize / 2,
							minY - handleSize / 2,
							handleSize,
							handleSize,
						);
						ctx.fillRect(
							minX - handleSize / 2,
							maxY - handleSize / 2,
							handleSize,
							handleSize,
						);
						ctx.fillRect(
							maxX - handleSize / 2,
							maxY - handleSize / 2,
							handleSize,
							handleSize,
						);
					}
				}
			}

			// Draw rectangle preview (when dragging with rect tool)
			if (isDrawingRect && rectStartTile && mousePos && canvas) {
				const rect = canvas.getBoundingClientRect();
				const canvasX = mousePos.x - rect.left;
				const canvasY = mousePos.y - rect.top;
				const worldX = (canvasX - panX) / zoom;
				const worldY = (canvasY - panY) / zoom;
				const currentTileX = Math.floor(worldX / mapData.tileWidth);
				const currentTileY = Math.floor(worldY / mapData.tileHeight);

				// Calculate rectangle bounds
				const minX = Math.min(rectStartTile.x, currentTileX);
				const maxX = Math.max(rectStartTile.x, currentTileX);
				const minY = Math.min(rectStartTile.y, currentTileY);
				const maxY = Math.max(rectStartTile.y, currentTileY);

				// Draw semi-transparent fill
				ctx.fillStyle = "rgba(0, 150, 255, 0.2)";
				ctx.fillRect(
					minX * mapData.tileWidth,
					minY * mapData.tileHeight,
					(maxX - minX + 1) * mapData.tileWidth,
					(maxY - minY + 1) * mapData.tileHeight,
				);

				// Draw rectangle outline
				ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
				ctx.lineWidth = 2 / zoom;
				ctx.strokeRect(
					minX * mapData.tileWidth,
					minY * mapData.tileHeight,
					(maxX - minX + 1) * mapData.tileWidth,
					(maxY - minY + 1) * mapData.tileHeight,
				);
			}

			ctx.restore();
		};
	}, [
		mapData,
		tilesets,
		zoom,
		panX,
		panY,
		gridVisible,
		getTilesetById,
		selectedTilesetId,
		isDrawingRect,
		rectStartTile,
		isDraggingEntity, // Render entity with hierarchy
		renderEntity,
		selectedEntityDefId,
		selectedEntityId,
		tempEntityPosition,
	]);

	// Trigger render when dependencies change
	// biome-ignore lint/correctness/useExhaustiveDependencies: We want to redraw when these values change
	useEffect(() => {
		renderMap.current();
	}, [
		mapData,
		tilesets,
		zoom,
		panX,
		panY,
		gridVisible,
		selectedTilesetId,
		isDrawingRect,
		rectStartTile,
		isDraggingEntity,
		selectedEntityDefId,
		selectedEntityId,
		tempEntityPosition,
	]);

	const screenToWorld = (screenX: number, screenY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return { worldX: 0, worldY: 0 };

		const rect = canvas.getBoundingClientRect();
		const x = screenX - rect.left;
		const y = screenY - rect.top;

		const worldX = (x - panX) / zoom;
		const worldY = (y - panY) / zoom;

		return { worldX, worldY };
	};

	const getTileCoords = (screenX: number, screenY: number) => {
		const { worldX, worldY } = screenToWorld(screenX, screenY);
		const tileX = Math.floor(worldX / mapData.tileWidth);
		const tileY = Math.floor(worldY / mapData.tileHeight);
		return { tileX, tileY };
	};

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			// Middle mouse or Shift+Left = Pan
			setIsDragging(true);
			setDragStartX(e.clientX - panX);
			setDragStartY(e.clientY - panY);
		} else if (e.button === 0) {
			// Left click = Draw / Select
			const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);
			const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);

			if (currentTool === "pointer") {
				// Pointer tool: select entity at click position
				if (mapData.entities) {
					// Check entities in reverse order (top to bottom)
					let foundEntity = null;
					for (let i = mapData.entities.length - 1; i >= 0; i--) {
						const entity = mapData.entities[i];
						const entityDef = entityManager.getEntityDefinition(
							entity.tilesetId,
							entity.entityDefId,
						);

						if (entityDef?.sprites && entityDef.sprites.length > 0) {
							const firstSprite = entityDef.sprites[0];
							if (firstSprite.sprite) {
								const sprite = firstSprite.sprite;
								const origin = firstSprite.origin || { x: 0.5, y: 1 };
								const offset = firstSprite.offset || { x: 0, y: 0 };
								const scale = entity.scale;

								// Calculate scaled dimensions
								const scaledWidth = sprite.width * scale.x;
								const scaledHeight = sprite.height * scale.y;

								// Calculate entity bounds (using scaled dimensions)
								const originOffsetX = origin.x * scaledWidth;
								const originOffsetY = origin.y * scaledHeight;
								const entityX = entity.x - originOffsetX + offset.x;
								const entityY = entity.y - originOffsetY + offset.y;

								// Check if click is within entity bounds
								if (
									worldX >= entityX &&
									worldX <= entityX + scaledWidth &&
									worldY >= entityY &&
									worldY <= entityY + scaledHeight
								) {
									foundEntity = entity;
									break;
								}
							}
						}
					}

					if (foundEntity) {
						// Update both state and ref for immediate rendering
						setSelectedEntityId(foundEntity.id);
						selectedEntityIdRef.current = foundEntity.id;
						// Store drag start position but don't start dragging yet
						setEntityDragStart({ x: e.clientX, y: e.clientY });
						setEntityDragOffset({
							x: worldX - foundEntity.x,
							y: worldY - foundEntity.y,
						});
						// Trigger immediate render to show selection
						renderMap.current();
						// Notify parent (this may cause a slower re-render)
						onEntitySelected?.(foundEntity.id);
					} else {
						setSelectedEntityId(null);
						selectedEntityIdRef.current = null;
						onEntitySelected?.(null);
					}
				}
			} else if (currentTool === "rect") {
				// Rectangle tool: start drawing rectangle
				setIsDrawingRect(true);
				setRectStartTile({ x: tileX, y: tileY });
			} else if (currentTool === "fill") {
				// Fill tool: perform flood fill
				floodFill(tileX, tileY);
			} else {
				setIsDrawing(true);
				if (currentTool === "pencil") {
					// Start a new pencil stroke batch
					onStartBatch?.();
					setPencilStrokeTiles([{ x: tileX, y: tileY }]);
					onPlaceTilesBatch([{ x: tileX, y: tileY }]);
				} else if (currentTool === "eraser") {
					onEraseTile(tileX, tileY);
				} else if (currentTool === "entity") {
					// Clear any entity selection when using entity tool
					setSelectedEntityId(null);
					selectedEntityIdRef.current = null;
					setEntityDragStart(null);
					onEntitySelected?.(null); // Clear parent's selection state too
					// Place entity at pixel coordinates
					onPlaceEntity(Math.floor(worldX), Math.floor(worldY));
				}
			}
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		// Store screen coordinates for hover preview (will be converted to world coords on render)
		setMouseScreenPos({ x: e.clientX, y: e.clientY });

		// Check if hovering over selected entity (for cursor change)
		if (
			currentTool === "pointer" &&
			selectedEntityId &&
			!isDraggingEntity &&
			!entityDragStart
		) {
			const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
			const selectedEntity = mapData.entities?.find(
				(e) => e.id === selectedEntityId,
			);

			if (selectedEntity) {
				const entityDef = entityManager.getEntityDefinition(
					selectedEntity.tilesetId,
					selectedEntity.entityDefId,
				);

				if (entityDef?.sprites && entityDef.sprites.length > 0) {
					const firstSprite = entityDef.sprites[0];
					if (firstSprite.sprite) {
						const sprite = firstSprite.sprite;
						const origin = firstSprite.origin || { x: 0.5, y: 1 };
						const offset = firstSprite.offset || { x: 0, y: 0 };
						const scale = selectedEntity.scale;

						// Calculate scaled dimensions
						const scaledWidth = sprite.width * scale.x;
						const scaledHeight = sprite.height * scale.y;

						// Calculate entity bounds (using scaled dimensions)
						const originOffsetX = origin.x * scaledWidth;
						const originOffsetY = origin.y * scaledHeight;
						const entityX = selectedEntity.x - originOffsetX + offset.x;
						const entityY = selectedEntity.y - originOffsetY + offset.y;

						// Check if mouse is within entity bounds
						const isHovering =
							worldX >= entityX &&
							worldX <= entityX + scaledWidth &&
							worldY >= entityY &&
							worldY <= entityY + scaledHeight;

						setIsHoveringSelectedEntity(isHovering);
					} else {
						setIsHoveringSelectedEntity(false);
					}
				} else {
					setIsHoveringSelectedEntity(false);
				}
			} else {
				setIsHoveringSelectedEntity(false);
			}
		} else {
			setIsHoveringSelectedEntity(false);
		}

		// Trigger a render to show the hover preview
		renderMap.current();

		if (isDragging) {
			setPan(e.clientX - dragStartX, e.clientY - dragStartY);
		} else if (
			entityDragStart &&
			selectedEntityId &&
			currentTool === "pointer"
		) {
			// Check if we've moved enough to start dragging - only for pointer tool
			const dx = e.clientX - entityDragStart.x;
			const dy = e.clientY - entityDragStart.y;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (distance > DRAG_THRESHOLD) {
				// Start dragging
				if (!isDraggingEntity) {
					setIsDraggingEntity(true);
					// Start batching to group all position updates into one undo/redo entry
					onStartBatch?.();
				}
				// Update temp position
				const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
				const newX = Math.floor(worldX - entityDragOffset.x);
				const newY = Math.floor(worldY - entityDragOffset.y);
				const newPos = { x: newX, y: newY };
				setTempEntityPosition(newPos);
				tempEntityPositionRef.current = newPos;
				// Call live update callback for sidebar
				onEntityDragging?.(selectedEntityId, newX, newY);
			}
		} else if (isDrawing) {
			const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);
			if (currentTool === "pencil") {
				// Add to pencil stroke batch (avoid duplicates)
				setPencilStrokeTiles((prev) => {
					const isDuplicate = prev.some((t) => t.x === tileX && t.y === tileY);
					if (!isDuplicate) {
						// Place this tile immediately
						onPlaceTilesBatch([{ x: tileX, y: tileY }]);
						return [...prev, { x: tileX, y: tileY }];
					}
					return prev;
				});
			} else if (currentTool === "eraser") {
				onEraseTile(tileX, tileY);
			}
			// Entity tool doesn't drag-paint
		}
	};

	const handleMouseLeave = () => {
		setMouseScreenPos(null);

		// Finish pencil stroke if mouse leaves while drawing
		if (currentTool === "pencil" && isDrawing && pencilStrokeTiles.length > 0) {
			onEndBatch?.();
			setPencilStrokeTiles([]);
			setIsDrawing(false);
		}
	};

	const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (
			isDraggingEntity &&
			tempEntityPosition &&
			selectedEntityId &&
			currentTool === "pointer"
		) {
			// Finish entity drag - commit the position change - only for pointer tool
			onMoveEntity(
				selectedEntityId,
				tempEntityPosition.x,
				tempEntityPosition.y,
			);
			// End batching to commit the entire drag as one undo/redo entry
			onEndBatch?.();
			setIsDraggingEntity(false);
			setTempEntityPosition(null);
			tempEntityPositionRef.current = null;
			setEntityDragStart(null);
		} else if (entityDragStart && currentTool === "pointer") {
			// Click without drag - just clear drag start - only for pointer tool
			setEntityDragStart(null);
		} else if (isDrawingRect && rectStartTile) {
			// Finish drawing rectangle - place tiles in the rectangular area
			const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);

			// Calculate rectangle bounds
			const minX = Math.min(rectStartTile.x, tileX);
			const maxX = Math.max(rectStartTile.x, tileX);
			const minY = Math.min(rectStartTile.y, tileY);
			const maxY = Math.max(rectStartTile.y, tileY);

			// Collect all tiles in the rectangle
			const tilesToPlace: Array<{ x: number; y: number }> = [];
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					tilesToPlace.push({ x, y });
				}
			}

			// Place all tiles in a single batch operation
			onPlaceTilesBatch(tilesToPlace);

			setIsDrawingRect(false);
			setRectStartTile(null);
		}

		// Finish pencil stroke - end batching to commit undo/redo entry
		if (currentTool === "pencil" && pencilStrokeTiles.length > 0) {
			onEndBatch?.();
			setPencilStrokeTiles([]);
		}

		setIsDragging(false);
		setIsDrawing(false);
	};

	const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
		e.preventDefault();

		// Only show context menu for entities
		if (currentTool !== "pointer" || !mapData.entities) {
			return;
		}

		const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);

		// Check if right-clicking on an entity (in reverse order - top to bottom)
		let foundEntity = null;
		for (let i = mapData.entities.length - 1; i >= 0; i--) {
			const entity = mapData.entities[i];
			const entityDef = entityManager.getEntityDefinition(
				entity.tilesetId,
				entity.entityDefId,
			);

			if (entityDef?.sprites && entityDef.sprites.length > 0) {
				const firstSprite = entityDef.sprites[0];
				if (firstSprite.sprite) {
					const sprite = firstSprite.sprite;
					const origin = firstSprite.origin || { x: 0.5, y: 1 };
					const offset = firstSprite.offset || { x: 0, y: 0 };
					const scale = entity.scale;

					// Calculate scaled dimensions
					const scaledWidth = sprite.width * scale.x;
					const scaledHeight = sprite.height * scale.y;

					// Calculate entity bounds (using scaled dimensions)
					const originOffsetX = origin.x * scaledWidth;
					const originOffsetY = origin.y * scaledHeight;
					const entityX = entity.x - originOffsetX + offset.x;
					const entityY = entity.y - originOffsetY + offset.y;

					// Check if click is within entity bounds
					if (
						worldX >= entityX &&
						worldX <= entityX + scaledWidth &&
						worldY >= entityY &&
						worldY <= entityY + scaledHeight
					) {
						foundEntity = entity;
						break;
					}
				}
			}
		}

		if (foundEntity) {
			// Show context menu at cursor position
			setContextMenu({
				visible: true,
				x: e.clientX,
				y: e.clientY,
				entityId: foundEntity.id,
			});

			// Select the entity if not already selected
			if (selectedEntityId !== foundEntity.id) {
				setSelectedEntityId(foundEntity.id);
				selectedEntityIdRef.current = foundEntity.id;
				renderMap.current();
				onEntitySelected?.(foundEntity.id);
			}
		}
	};

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const parent = canvas.parentElement;
		if (!parent) return;

		const resizeCanvas = () => {
			canvas.width = parent.clientWidth;
			canvas.height = parent.clientHeight;
			// Immediately redraw after resizing to prevent blank canvas
			renderMap.current();
		};

		// Native wheel event listener (to allow preventDefault)
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();

			if (e.ctrlKey) {
				// Zoom towards mouse position
				const rect = canvas.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;

				// Calculate world position at mouse before zoom
				const worldX = (mouseX - panXRef.current) / zoomRef.current;
				const worldY = (mouseY - panYRef.current) / zoomRef.current;

				// Calculate new zoom
				const delta = -e.deltaY * 0.01;
				const newZoom = Math.max(0.1, Math.min(10, zoomRef.current + delta));

				// Adjust pan to keep world position under mouse
				const newPanX = mouseX - worldX * newZoom;
				const newPanY = mouseY - worldY * newZoom;

				setZoom(newZoom);
				setPan(newPanX, newPanY);
			} else {
				// Pan
				setPan(panXRef.current - e.deltaX, panYRef.current - e.deltaY);
			}
		};

		resizeCanvas();

		// Resize canvas continuously during panel resize
		const resizeObserver = new ResizeObserver(() => {
			resizeCanvas();
		});
		resizeObserver.observe(parent);

		canvas.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			resizeObserver.disconnect();
			canvas.removeEventListener("wheel", handleWheel);
		};
	}, [
		// Pan
		setPan,
		setZoom,
	]);

	// Handle keyboard arrow keys to move selected entity
	useEffect(() => {
		if (currentTool !== "pointer" || !selectedEntityId) {
			return;
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle arrow keys
			if (
				!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
			) {
				return;
			}

			// Don't move entity if user is typing in an input field
			const target = e.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
				return;
			}

			e.preventDefault();

			// Find the selected entity
			const entity = mapData.entities?.find((e) => e.id === selectedEntityId);
			if (!entity) {
				return;
			}

			// Calculate new position based on arrow key
			let newX = entity.x;
			let newY = entity.y;

			switch (e.key) {
				case "ArrowUp":
					newY -= 1;
					break;
				case "ArrowDown":
					newY += 1;
					break;
				case "ArrowLeft":
					newX -= 1;
					break;
				case "ArrowRight":
					newX += 1;
					break;
			}

			// Move the entity
			onMoveEntity(selectedEntityId, newX, newY);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [currentTool, selectedEntityId, mapData.entities, onMoveEntity]);

	// Handle closing context menu with Escape or clicks outside
	useEffect(() => {
		if (!contextMenu.visible) {
			return;
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setContextMenu({ visible: false, x: 0, y: 0, entityId: null });
			}
		};

		const handleMouseDown = (e: MouseEvent) => {
			// Check if click is outside the context menu
			const target = e.target as HTMLElement;
			if (!target.closest('[role="menu"]')) {
				setContextMenu({ visible: false, x: 0, y: 0, entityId: null });
			}
		};

		// Use setTimeout to avoid closing immediately after opening
		const timeoutId = setTimeout(() => {
			window.addEventListener("mousedown", handleMouseDown);
		}, 100);

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			clearTimeout(timeoutId);
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("mousedown", handleMouseDown);
		};
	}, [contextMenu.visible]);

	return (
		<div className="canvas-container">
			<canvas
				ref={canvasRef}
				className="map-canvas"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseLeave}
				onContextMenu={handleContextMenu}
				style={{
					cursor: isDraggingEntity
						? "grabbing"
						: currentTool === "pointer" && isHoveringSelectedEntity
							? "grab"
							: isDragging
								? "grabbing"
								: "default",
				}}
			/>
			{autotilingOverride && (
				<div
					style={{
						position: "absolute",
						top: "10px",
						left: "50%",
						transform: "translateX(-50%)",
						background: "rgba(255, 165, 0, 0.9)",
						color: "white",
						padding: "6px 12px",
						borderRadius: "4px",
						fontSize: "12px",
						fontWeight: "bold",
						pointerEvents: "none",
						zIndex: 1000,
						boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
					}}
				>
					AUTOTILING DISABLED (Shift)
				</div>
			)}
			{contextMenu.visible && contextMenu.entityId && (
				<div
					role="menu"
					style={{
						position: "fixed",
						left: `${contextMenu.x}px`,
						top: `${contextMenu.y}px`,
						background: "#1e1e1e",
						border: "1px solid #454545",
						borderRadius: "4px",
						boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
						zIndex: 10000,
						minWidth: "150px",
					}}
				>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							if (contextMenu.entityId) {
								// Find the entity instance
								const entity = mapData.entities?.find(
									(ent) => ent.id === contextMenu.entityId,
								);
								if (entity) {
									// Get the entity definition to find the file path
									const entityDef = entityManager.getEntityDefinition(
										entity.tilesetId,
										entity.entityDefId,
									);
									if (entityDef?.filePath) {
										// Open the entity in a new tab
										openEntityFromFile(entityDef.filePath);
									}
								}
							}
							setContextMenu({ visible: false, x: 0, y: 0, entityId: null });
						}}
						style={{
							width: "100%",
							padding: "8px 12px",
							background: "transparent",
							border: "none",
							color: "#cccccc",
							textAlign: "left",
							cursor: "pointer",
							fontSize: "13px",
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "#2a2a2a";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<title>Edit</title>
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</svg>
						Edit Entity
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							if (contextMenu.entityId && onDeleteEntity) {
								onDeleteEntity(contextMenu.entityId);
							}
							setContextMenu({ visible: false, x: 0, y: 0, entityId: null });
						}}
						style={{
							width: "100%",
							padding: "8px 12px",
							background: "transparent",
							border: "none",
							color: "#ff6b6b",
							textAlign: "left",
							cursor: "pointer",
							fontSize: "13px",
							display: "flex",
							alignItems: "center",
							gap: "8px",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "#2a2a2a";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent";
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<title>Delete</title>
							<polyline points="3 6 5 6 21 6" />
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							<line x1="10" y1="11" x2="10" y2="17" />
							<line x1="14" y1="11" x2="14" y2="17" />
						</svg>
						Delete Entity
					</button>
				</div>
			)}
		</div>
	);
};
