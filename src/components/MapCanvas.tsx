import {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { useEditor } from "../context/EditorContext";
import { entityManager } from "../managers/EntityManager";
import {
	type EntityDefinition,
	type EntityInstance,
	hasImageData,
	type MapData,
	type PointInstance,
	type PolygonCollider,
	type SpriteLayer,
	type Tool,
} from "../types";
import {
	calculateBitmaskFromNeighbors,
	findTileByBitmask,
} from "../utils/bitmaskAutotiling";
import {
	calculateDistance as calcDistance,
	findEdgeAtPosition as findEdgeAtPos,
	findPointAtPosition as findPointAtPos,
	isPointInPolygon as pointInPolygon,
} from "../utils/collisionGeometry";
import { getArrowKeyDelta, isArrowKey } from "../utils/keyboardMovement";
import { isEditableElementFocused } from "../utils/keyboardUtils";
import { LayerChunkCache } from "../utils/LayerChunkCache";
import {
	getTerrainLayerForTile,
	placeTerrainTile,
	updateNeighborsAround,
} from "../utils/terrainDrawing";
import { hashTilesetId, packTileId, unpackTileId } from "../utils/tileId";

// Imperative handle exposed by MapCanvas for direct chunk invalidation
export interface MapCanvasHandle {
	invalidateTiles: (
		layerId: string,
		tiles: Array<{ x: number; y: number }>,
	) => void;
	invalidateLayer: (layerId: string) => void;
	invalidateAll: () => void;
}

// Map canvas props interface
interface MapCanvasProps {
	mapData: MapData;
	currentTool: Tool;
	currentLayerId: string | null;
	onToolChange?: (tool: Tool) => void;
	onPlaceTilesBatch: (tiles: Array<{ x: number; y: number }>) => void;
	onEraseTilesBatch: (tiles: Array<{ x: number; y: number }>) => void;
	onPlaceEntity: (x: number, y: number) => void;
	onMoveEntity: (entityId: string, newX: number, newY: number) => void;
	onEntitySelected?: (entityId: string | null) => void;
	onEntityDragging?: (entityId: string, newX: number, newY: number) => void;
	onDeleteEntity?: (entityId: string) => void;
	onDuplicateEntity?: (entityId: string) => void;
	onPlacePoint?: (x: number, y: number) => void;
	onMovePoint?: (pointId: string, newX: number, newY: number) => void;
	onPointSelected?: (pointId: string | null) => void;
	onPointDragging?: (pointId: string, newX: number, newY: number) => void;
	onDeletePoint?: (pointId: string) => void;
	selectedPointId?: string | null;
	onAddCollider?: (points: Array<{ x: number; y: number }>) => void;
	onUpdateColliderPoint?: (
		colliderId: string,
		pointIndex: number,
		x: number,
		y: number,
	) => void;
	onUpdateCollider?: (
		colliderId: string,
		updates: Partial<PolygonCollider>,
	) => void;
	onColliderDragging?: (
		colliderId: string,
		updates: Partial<PolygonCollider>,
	) => void;
	onColliderSelected?: (colliderId: string | null) => void;
	onColliderPointSelected?: (pointIndex: number | null) => void;
	onDeleteCollider?: (colliderId: string) => void;
	onContextMenuRequest?: (menu: {
		x: number;
		y: number;
		colliderId?: string;
		pointIndex?: number;
		edgeIndex?: number;
		insertPosition?: { x: number; y: number };
	}) => void;
	onStartBatch?: () => void;
	onEndBatch?: () => void;
	onCopyTiles?: (selection: {
		startX: number;
		startY: number;
		endX: number;
		endY: number;
		layerId: string;
	}) => void;
	onCutTiles?: (selection: {
		startX: number;
		startY: number;
		endX: number;
		endY: number;
		layerId: string;
	}) => void;
	onPasteTiles?: (targetX: number, targetY: number) => void;
	onDeleteSelectedTiles?: (selection: {
		startX: number;
		startY: number;
		endX: number;
		endY: number;
		layerId: string;
	}) => void;
	onClearTileSelection?: () => void;
}

const MapCanvasComponent = forwardRef<MapCanvasHandle, MapCanvasProps>(
	(
		{
			mapData,
			currentTool,
			currentLayerId,
			onToolChange,
			onPlaceTilesBatch,
			onEraseTilesBatch,
			onPlaceEntity,
			onMoveEntity,
			onEntitySelected,
			onEntityDragging,
			onDeleteEntity,
			onDuplicateEntity,
			onPlacePoint,
			onMovePoint,
			onPointSelected,
			onPointDragging,
			onDeletePoint,
			selectedPointId: selectedPointIdProp,
			onAddCollider,
			onUpdateColliderPoint,
			onUpdateCollider,
			onColliderDragging,
			onColliderSelected,
			onColliderPointSelected,
			onDeleteCollider: _onDeleteCollider,
			onContextMenuRequest,
			onStartBatch,
			onEndBatch,
			onCopyTiles: _onCopyTiles,
			onCutTiles: _onCutTiles,
			onPasteTiles: _onPasteTiles,
			onDeleteSelectedTiles: _onDeleteSelectedTiles,
			onClearTileSelection: _onClearTileSelection,
		}: MapCanvasProps,
		ref,
	) => {
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const {
			tilesets,
			getTilesetById,
			zoom,
			setZoom,
			getZoom,
			panX,
			panY,
			setPan,
			getPan,
			gridVisible,
			// autotilingOverride,
			selectedTilesetId,
			selectedTileId,
			selectedTerrainLayerId,
			selectedEntityDefId,
			openEntityFromFile,
		} = useEditor();

		// RAF handle for throttling renders during pan and zoom
		const rafHandle = useRef<number | null>(null);
		// Track if we're actively zooming to throttle state updates
		const isZooming = useRef(false);
		const zoomTimeoutHandle = useRef<NodeJS.Timeout | null>(null);

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

		// Eraser stroke batching - collect all tiles erased in one stroke
		const [eraserStrokeTiles, setEraserStrokeTiles] = useState<
			Array<{ x: number; y: number }>
		>([]);

		// Rectangle tool state
		const [isDrawingRect, setIsDrawingRect] = useState(false);
		const [rectStartTile, setRectStartTile] = useState<{
			x: number;
			y: number;
		} | null>(null);

		// Tile selection state (for pointer tool)
		const [isSelectingTiles, setIsSelectingTiles] = useState(false);
		const [tileSelectionStart, setTileSelectionStart] = useState<{
			x: number;
			y: number;
		} | null>(null);
		const [selectedTileRegion, setSelectedTileRegion] = useState<{
			startX: number;
			startY: number;
			endX: number;
			endY: number;
			layerId: string;
		} | null>(null);

		// Pointer tool state (for selecting and moving entities)
		const [selectedEntityId, setSelectedEntityId] = useState<string | null>(
			null,
		);
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

		// Point selection state (for selecting and moving points)
		const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
		const selectedPointIdRef = useRef<string | null>(null); // Ref for immediate access

		// Sync selectedPointId from prop (controlled component)
		useEffect(() => {
			if (selectedPointIdProp !== undefined) {
				setSelectedPointId(selectedPointIdProp);
				selectedPointIdRef.current = selectedPointIdProp;
			}
		}, [selectedPointIdProp]);
		const [isDraggingPoint, setIsDraggingPoint] = useState(false);
		const [pointDragStart, setPointDragStart] = useState<{
			x: number;
			y: number;
		} | null>(null);
		const [pointDragOffset, setPointDragOffset] = useState<{
			x: number;
			y: number;
		}>({ x: 0, y: 0 });
		const [tempPointPosition, setTempPointPosition] = useState<{
			x: number;
			y: number;
		} | null>(null);
		const tempEntityPositionRef = useRef<{ x: number; y: number } | null>(null); // Ref for immediate access
		const [isHoveringSelectedEntity, setIsHoveringSelectedEntity] =
			useState(false);
		const DRAG_THRESHOLD = 5; // pixels before starting drag

		// Collision drawing state (similar to EntityEditorView)
		const [isDrawingCollider, setIsDrawingCollider] = useState(false);
		const [drawingColliderPoints, setDrawingColliderPoints] = useState<
			Array<{ x: number; y: number }>
		>([]);
		const [selectedColliderId, setSelectedColliderId] = useState<string | null>(
			null,
		);
		const [selectedColliderPointIndex, setSelectedColliderPointIndex] =
			useState<number | null>(null);
		const [isDraggingColliderPoint, setIsDraggingColliderPoint] =
			useState(false);
		const [_isDraggingCollider, _setIsDraggingCollider] = useState(false);
		const [colliderDragStart, setColliderDragStart] = useState<{
			x: number;
			y: number;
			originalPoints: Array<{ x: number; y: number }>;
			pointIndex: number | null; // null = dragging whole collider, number = dragging specific point
		} | null>(null);
		const [tempColliderPointPosition, setTempColliderPointPosition] = useState<{
			x: number;
			y: number;
		} | null>(null);

		// Click-through state for cycling between overlapping objects
		const lastClickPosRef = useRef<{
			x: number;
			y: number;
			time: number;
		} | null>(null);

		// Context menu state
		const [contextMenu, setContextMenu] = useState<{
			visible: boolean;
			x: number;
			y: number;
			entityId: string | null;
			pointId: string | null;
		}>({ visible: false, x: 0, y: 0, entityId: null, pointId: null });

		// Helper functions for collider manipulation
		// Helper wrappers using the shared collision geometry utilities
		const isPointInPolygon = (
			x: number,
			y: number,
			points: Array<{ x: number; y: number }>,
		): boolean => {
			return pointInPolygon(x, y, points);
		};

		const findColliderPointAtPosition = (
			worldX: number,
			worldY: number,
			colliderId: string,
		): number | null => {
			const collider = mapData.colliders?.find((c) => c.id === colliderId);
			if (!collider) return null;

			const threshold = 8 / zoom; // Click tolerance in world pixels
			return findPointAtPos(collider.points, worldX, worldY, threshold);
		};

		const calculateDistance = (
			x1: number,
			y1: number,
			x2: number,
			y2: number,
		): number => {
			return calcDistance(x1, y1, x2, y2);
		};

		const findEdgeAtPosition = (
			points: Array<{ x: number; y: number }>,
			x: number,
			y: number,
		): {
			edgeIndex: number;
			insertPosition: { x: number; y: number };
		} | null => {
			const threshold = 8 / zoom;
			const result = findEdgeAtPos(points, x, y, threshold);
			if (!result) return null;
			return {
				edgeIndex: result.edgeIndex,
				insertPosition: { x: result.insertX, y: result.insertY },
			};
		};

		// Fill tool - flood fill helper function
		const floodFill = (startX: number, startY: number) => {
			// Get the current active layer
			if (!currentLayerId) {
				return;
			}
			const activeLayer = mapData.layers.find(
				(layer) => layer.id === currentLayerId,
			);
			if (!activeLayer) {
				return;
			}

			// Check if we're in terrain mode
			const isTerrainMode = selectedTerrainLayerId !== null;

			if (isTerrainMode) {
				// TERRAIN MODE: Fill with terrain layer
				if (!selectedTilesetId) {
					return;
				}

				const selectedTileset = tilesets.find(
					(ts) => ts.id === selectedTilesetId,
				);
				if (!selectedTileset || !selectedTileset.terrainLayers) {
					return;
				}

				// Get the target terrain layer ID at the start position
				const startIndex = startY * mapData.width + startX;
				const startTileId = activeLayer.tiles[startIndex] || 0;
				const targetTerrainLayerId = getTerrainLayerForTile(
					startTileId,
					tilesets,
				);

				// Collect all tiles to fill
				const tilesToFill: Array<{ x: number; y: number }> = [];
				const queue: Array<{ x: number; y: number }> = [
					{ x: startX, y: startY },
				];
				const visited = new Set<number>();

				while (queue.length > 0) {
					const pos = queue.shift();
					if (!pos) continue;
					const { x, y } = pos;
					const index = y * mapData.width + x;

					// Skip if out of bounds
					if (x < 0 || x >= mapData.width || y < 0 || y >= mapData.height)
						continue;

					// Skip if already visited
					if (visited.has(index)) continue;
					visited.add(index);

					// Skip if not the target terrain layer
					const currentTileId = activeLayer.tiles[index] || 0;
					const currentTerrainLayerId = getTerrainLayerForTile(
						currentTileId,
						tilesets,
					);

					if (currentTerrainLayerId !== targetTerrainLayerId) continue;

					// Add to batch
					tilesToFill.push({ x, y });

					// Add neighbors to queue
					queue.push({ x: x + 1, y });
					queue.push({ x: x - 1, y });
					queue.push({ x, y: y + 1 });
					queue.push({ x, y: y - 1 });
				}

				// Place all terrain tiles
				if (tilesToFill.length > 0 && selectedTerrainLayerId !== null) {
					// Get the terrain layer object
					const terrainLayer = selectedTileset.terrainLayers?.find(
						(l) => l.id === selectedTerrainLayerId,
					);
					if (!terrainLayer) {
						return;
					}

					// Calculate tileset hash
					const tilesetHash = hashTilesetId(selectedTileset.id);

					// Create a mutable copy of the layer tiles and wrap in a temporary layer object
					const tempLayer = {
						...activeLayer,
						tiles: activeLayer.tiles.slice(), // TODO: Slow on large maps - refactor fill to avoid copy
					};

					// Place each terrain tile with autotiling
					for (const { x, y } of tilesToFill) {
						placeTerrainTile(
							tempLayer,
							x,
							y,
							mapData.width,
							mapData.height,
							terrainLayer,
							selectedTileset,
							tilesetHash,
							tilesets,
						);
					}

					// Optimize: Only update boundary tiles to avoid redundant neighbor updates
					// Each filled tile already recalculates based on neighbors when placed
					// We just need to update tiles on the edge of the filled region
					const filledSet = new Set<string>();
					for (const { x, y } of tilesToFill) {
						filledSet.add(`${x},${y}`);
					}

					// Find boundary tiles (tiles with at least one non-filled neighbor)
					const boundaryTiles: Array<{ x: number; y: number }> = [];
					for (const { x, y } of tilesToFill) {
						let isBoundary = false;
						// Check if any of the 8 neighbors is NOT in the filled set
						for (let dy = -1; dy <= 1; dy++) {
							for (let dx = -1; dx <= 1; dx++) {
								if (dx === 0 && dy === 0) continue;
								const nx = x + dx;
								const ny = y + dy;
								if (
									nx >= 0 &&
									nx < mapData.width &&
									ny >= 0 &&
									ny < mapData.height
								) {
									if (!filledSet.has(`${nx},${ny}`)) {
										isBoundary = true;
										break;
									}
								} else {
									// Out of bounds counts as boundary
									isBoundary = true;
									break;
								}
							}
							if (isBoundary) break;
						}
						if (isBoundary) {
							boundaryTiles.push({ x, y });
						}
					}

					// Update only boundary tiles - dramatically reduces updates on large fills
					for (const { x, y } of boundaryTiles) {
						updateNeighborsAround(
							tempLayer,
							x,
							y,
							mapData.width,
							mapData.height,
							selectedTerrainLayerId,
							selectedTileset,
							tilesetHash,
							tilesets,
						);
					}

					// Place all tiles in one batch
					onPlaceTilesBatch(tilesToFill);
				}
			} else {
				// TILE MODE: Fill with regular tiles
				// Get the target tile ID (what we're replacing)
				const startIndex = startY * mapData.width + startX;
				const targetTileId = activeLayer.tiles[startIndex] || 0; // Treat undefined as 0 (empty)

				// Get the replacement tile ID and convert to global tile ID
				if (!selectedTileId || !selectedTilesetId) {
					return;
				}

				const selectedTileset = tilesets.find(
					(ts) => ts.id === selectedTilesetId,
				);
				if (!selectedTileset) {
					return;
				}

				const tilesetHash = hashTilesetId(selectedTileset.id);

				const geometry = unpackTileId(selectedTileId);
				const globalTileId = packTileId(
					geometry.x,
					geometry.y,
					tilesetHash,
					geometry.flipX,
					geometry.flipY,
				);

				// Don't fill if clicking on the same tile
				if (targetTileId === globalTileId) {
					return;
				}

				// Collect all tiles to fill in a single batch
				const tilesToFill: Array<{ x: number; y: number }> = [];
				const queue: Array<{ x: number; y: number }> = [
					{ x: startX, y: startY },
				];
				const visited = new Set<number>();

				while (queue.length > 0) {
					const pos = queue.shift();
					if (!pos) continue;
					const { x, y } = pos;
					const index = y * mapData.width + x;

					// Skip if out of bounds
					if (x < 0 || x >= mapData.width || y < 0 || y >= mapData.height)
						continue;

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
			}
		};

		// Performance optimization: Cache tileset lookups by hash (Map provides O(1) lookup vs O(n) array.find)
		const tilesetByHash = useMemo(() => {
			const cache = new Map<number, (typeof tilesets)[0]>();
			for (const tileset of tilesets) {
				const hash = hashTilesetId(tileset.id);
				cache.set(hash, tileset);
			}
			return cache;
		}, [tilesets]);

		// Performance optimization: Cache tile definitions by ID for each tileset
		const tileDefinitionCache = useMemo(() => {
			const cache = new Map<
				string,
				Map<number, (typeof tilesets)[0]["tiles"][0]>
			>();
			for (const tileset of tilesets) {
				const tileMap = new Map<number, (typeof tilesets)[0]["tiles"][0]>();
				for (const tile of tileset.tiles) {
					tileMap.set(tile.id, tile);
				}
				cache.set(tileset.id, tileMap);
			}
			return cache;
		}, [tilesets]);

		// Chunk size for spatial grid (64x64 tiles per chunk)
		const CHUNK_SIZE = 64;

		// Offscreen canvas cache for layer rendering optimization
		// Each layer is divided into chunks (64x64 tiles), and each chunk is rendered to its own offscreen canvas
		// This allows for granular dirty tracking - only re-render chunks that changed
		const chunkCacheRef = useRef<LayerChunkCache>(
			new LayerChunkCache(CHUNK_SIZE),
		);

		// Helper function to get chunk coordinates from tile coordinates
		const getChunkCoordinates = useCallback((tileX: number, tileY: number) => {
			return {
				chunkX: Math.floor(tileX / CHUNK_SIZE),
				chunkY: Math.floor(tileY / CHUNK_SIZE),
			};
		}, []);

		// Track map data version to invalidate cache when tiles change
		const mapDataVersionRef = useRef(0);

		// Track previous mapData to detect changes
		const prevMapDataRef = useRef<MapData>(mapData);

		// Refs to track current pan values for wheel event
		const panXRef = useRef(panX);
		const panYRef = useRef(panY);
		const zoomRef = useRef(zoom);
		const mouseScreenPosRef = useRef<{ x: number; y: number } | null>(null);
		const selectedTilesetIdRef = useRef(selectedTilesetId);
		const selectedTileIdRef = useRef(selectedTileId);
		const selectedEntityDefIdRef = useRef(selectedEntityDefId);
		const currentToolRef = useRef(currentTool);

		// Expose imperative handle for chunk invalidation
		useImperativeHandle(
			ref,
			() => ({
				invalidateTiles: (
					layerId: string,
					tiles: Array<{ x: number; y: number }>,
				) => {
					chunkCacheRef.current.invalidateTiles(layerId, tiles);
					mapDataVersionRef.current++;
				},
				invalidateLayer: (layerId: string) => {
					chunkCacheRef.current.invalidateLayer(layerId);
					mapDataVersionRef.current++;
				},
				invalidateAll: () => {
					chunkCacheRef.current.invalidateAll();
					mapDataVersionRef.current++;
				},
			}),
			[],
		);

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

		// Detect structural changes (layer add/remove/reorder) and invalidate cache
		// Tile-level changes are handled via imperative invalidateTiles() calls
		useEffect(() => {
			const prevMapData = prevMapDataRef.current;

			if (prevMapData && mapData) {
				// Check if layer count changed
				if (prevMapData.layers.length !== mapData.layers.length) {
					chunkCacheRef.current.invalidateAll();
					mapDataVersionRef.current++;
					prevMapDataRef.current = mapData;
					return;
				}

				// Check for layer ID changes (reordering or replacement)
				for (let i = 0; i < mapData.layers.length; i++) {
					if (prevMapData.layers[i]?.id !== mapData.layers[i]?.id) {
						chunkCacheRef.current.invalidateAll();
						mapDataVersionRef.current++;
						prevMapDataRef.current = mapData;
						return;
					}
				}

				// Check for map size changes
				if (
					prevMapData.width !== mapData.width ||
					prevMapData.height !== mapData.height
				) {
					chunkCacheRef.current.invalidateAll();
					mapDataVersionRef.current++;
					prevMapDataRef.current = mapData;
					return;
				}
			}

			// Update previous mapData reference
			prevMapDataRef.current = mapData;
		}, [mapData]);

		// Cleanup RAF and zoom timeout on unmount
		useEffect(() => {
			return () => {
				if (rafHandle.current !== null) {
					cancelAnimationFrame(rafHandle.current);
				}
				if (zoomTimeoutHandle.current !== null) {
					clearTimeout(zoomTimeoutHandle.current);
				}
			};
		}, []);

		// Render a specific chunk of a layer to an offscreen canvas for caching
		const renderChunkToCache = useCallback(
			(layer: (typeof mapData.layers)[0], chunkX: number, chunkY: number) => {
				if (!mapData) return null;

				// Calculate canvas dimensions
				const canvasWidth = CHUNK_SIZE * mapData.tileWidth;
				const canvasHeight = CHUNK_SIZE * mapData.tileHeight;

				// Use LayerChunkCache to get or render chunk
				return chunkCacheRef.current.getChunkCanvas(
					layer.id,
					chunkX,
					chunkY,
					canvasWidth,
					canvasHeight,
					(_canvas, ctx) => {
						// Calculate tile bounds for this chunk
						const startX = chunkX * CHUNK_SIZE;
						const startY = chunkY * CHUNK_SIZE;
						const endX = Math.min(startX + CHUNK_SIZE, mapData.width);
						const endY = Math.min(startY + CHUNK_SIZE, mapData.height);

						// Render all tiles in this chunk
						for (let y = startY; y < endY; y++) {
							for (let x = startX; x < endX; x++) {
								const index = y * mapData.width + x;
								const tileId = layer.tiles[index];
								if (tileId === 0) continue; // Skip empty tiles

								// Unpack tile geometry
								const geometry = unpackTileId(tileId);

								// Get tileset by hash
								const tileset = tilesetByHash.get(geometry.tilesetHash);
								if (!tileset?.imageData) continue;

								// Create local tile ID to find definition
								const localTileId = packTileId(
									geometry.x,
									geometry.y,
									0,
									geometry.flipX,
									geometry.flipY,
								);

								// Find tile definition
								const tileDefinition = tileDefinitionCache
									.get(tileset.id)
									?.get(localTileId);

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
								}

								// Draw the tile at position relative to chunk origin
								ctx.drawImage(
									tileset.imageData,
									geometry.x,
									geometry.y,
									sourceWidth,
									sourceHeight,
									(x - startX) * mapData.tileWidth - originOffsetX,
									(y - startY) * mapData.tileHeight - originOffsetY,
									sourceWidth,
									sourceHeight,
								);
							}
						}
					},
				);
			},
			[mapData, tilesetByHash, tileDefinitionCache],
		);

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
		// biome-ignore lint/correctness/useExhaustiveDependencies: zoom/tilesetByHash/tileDefinitionCache are from useMemo
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

				// Get current pan and zoom values from refs (for smooth panning/zooming without re-renders)
				const currentPan = getPan();
				const currentZoom = getZoom();

				ctx.save();
				ctx.translate(currentPan.x, currentPan.y);
				ctx.scale(currentZoom, currentZoom);

				// Calculate visible tile range for viewport culling (performance optimization)
				const visibleMinX =
					Math.floor(-currentPan.x / currentZoom / mapData.tileWidth) - 1;
				const visibleMinY =
					Math.floor(-currentPan.y / currentZoom / mapData.tileHeight) - 1;
				const visibleMaxX =
					Math.ceil(
						(canvas.width - currentPan.x) / currentZoom / mapData.tileWidth,
					) + 1;
				const visibleMaxY =
					Math.ceil(
						(canvas.height - currentPan.y) / currentZoom / mapData.tileHeight,
					) + 1;

				// Clamp to map bounds
				const startX = Math.max(0, visibleMinX);
				const startY = Math.max(0, visibleMinY);
				const endX = Math.min(mapData.width, visibleMaxX);
				const endY = Math.min(mapData.height, visibleMaxY);

				// Calculate which chunks are visible in the viewport
				const { chunkX: minChunkX, chunkY: minChunkY } = getChunkCoordinates(
					startX,
					startY,
				);
				const { chunkX: maxChunkX, chunkY: maxChunkY } = getChunkCoordinates(
					endX - 1,
					endY - 1,
				);

				// Render each layer bottom-to-top using chunked offscreen canvas caching
				// Each chunk is 64x64 tiles, allowing granular dirty tracking when painting tiles

				mapData.layers.forEach((layer) => {
					if (!layer.visible) return;

					// Render all visible chunks for this layer
					for (let cy = minChunkY; cy <= maxChunkY; cy++) {
						for (let cx = minChunkX; cx <= maxChunkX; cx++) {
							// Render chunk to offscreen canvas (or use cached version if not dirty)
							const cachedChunk = renderChunkToCache(layer, cx, cy);
							if (!cachedChunk) continue;

							// Calculate world position for this chunk
							const worldX = cx * CHUNK_SIZE * mapData.tileWidth;
							const worldY = cy * CHUNK_SIZE * mapData.tileHeight;

							// Draw the cached chunk canvas at the correct position
							ctx.drawImage(cachedChunk, worldX, worldY);
						}
					}
				});

				// Render map-level entities (on top of all layers)
				if (mapData.entities && mapData.entities.length > 0) {
					// Calculate visible world bounds for entity viewport culling
					const entityCullingBuffer = 3; // Buffer in tiles to account for large entities
					const visibleWorldMinX = Math.max(
						0,
						(startX - entityCullingBuffer) * mapData.tileWidth,
					);
					const visibleWorldMinY = Math.max(
						0,
						(startY - entityCullingBuffer) * mapData.tileHeight,
					);
					const visibleWorldMaxX =
						(endX + entityCullingBuffer) * mapData.tileWidth;
					const visibleWorldMaxY =
						(endY + entityCullingBuffer) * mapData.tileHeight;

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

					// Filter entities to only those potentially visible (viewport culling)
					const visibleEntities = mapData.entities.filter((entity) => {
						// Simple AABB check with buffer for entity size
						// Most entities are small (1-2 tiles), buffer accounts for larger ones
						const entityMaxSize = 128; // Assume max entity size of 128px
						return (
							entity.x + entityMaxSize >= visibleWorldMinX &&
							entity.x - entityMaxSize <= visibleWorldMaxX &&
							entity.y + entityMaxSize >= visibleWorldMinY &&
							entity.y - entityMaxSize <= visibleWorldMaxY
						);
					});

					// Sort visible entities by Y position + ySortOffset for proper depth rendering
					const sortedEntities = visibleEntities.sort((a, b) => {
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

				// Render map-level points (on top of entities) with viewport culling
				if (mapData.points && mapData.points.length > 0) {
					const pointBuffer = 50; // Buffer in pixels for point visibility
					const visibleWorldMinX = Math.max(
						0,
						(startX - 1) * mapData.tileWidth - pointBuffer,
					);
					const visibleWorldMinY = Math.max(
						0,
						(startY - 1) * mapData.tileHeight - pointBuffer,
					);
					const visibleWorldMaxX = (endX + 1) * mapData.tileWidth + pointBuffer;
					const visibleWorldMaxY =
						(endY + 1) * mapData.tileHeight + pointBuffer;

					mapData.points.forEach((point) => {
						// Skip points outside visible viewport
						if (
							point.x < visibleWorldMinX ||
							point.x > visibleWorldMaxX ||
							point.y < visibleWorldMinY ||
							point.y > visibleWorldMaxY
						) {
							return;
						}
						// Use temp position if this point is being dragged
						const pointToRender =
							isDraggingPoint &&
							selectedPointId === point.id &&
							tempPointPosition
								? {
										...point,
										x: tempPointPosition.x,
										y: tempPointPosition.y,
									}
								: point;

						const isSelected = selectedPointId === point.id;

						// Draw outer circle
						ctx.strokeStyle = isSelected
							? "rgba(0, 150, 255, 0.9)"
							: "rgba(255, 100, 100, 0.8)";
						ctx.lineWidth = isSelected ? 3 / currentZoom : 2 / currentZoom;
						ctx.beginPath();
						ctx.arc(
							pointToRender.x,
							pointToRender.y,
							8 / currentZoom,
							0,
							Math.PI * 2,
						);
						ctx.stroke();

						// Draw inner circle (filled)
						ctx.fillStyle = isSelected
							? "rgba(0, 150, 255, 0.8)"
							: "rgba(255, 100, 100, 0.7)";
						ctx.beginPath();
						ctx.arc(
							pointToRender.x,
							pointToRender.y,
							4 / currentZoom,
							0,
							Math.PI * 2,
						);
						ctx.fill();

						// Draw name if zoomed in enough and name exists
						if (currentZoom > 0.5 && pointToRender.name) {
							ctx.fillStyle = "#ffffff";
							ctx.font = `${12 / currentZoom}px sans-serif`;
							ctx.fillText(
								pointToRender.name,
								pointToRender.x + 10 / currentZoom,
								pointToRender.y + 4 / currentZoom,
							);
						}
					});
				}

				// Render map-level colliders (on top of points) with viewport culling
				if (mapData.colliders && mapData.colliders.length > 0) {
					const colliderBuffer = 100; // Buffer in pixels for collider visibility
					const visibleWorldMinX = Math.max(
						0,
						(startX - 1) * mapData.tileWidth - colliderBuffer,
					);
					const visibleWorldMinY = Math.max(
						0,
						(startY - 1) * mapData.tileHeight - colliderBuffer,
					);
					const visibleWorldMaxX =
						(endX + 1) * mapData.tileWidth + colliderBuffer;
					const visibleWorldMaxY =
						(endY + 1) * mapData.tileHeight + colliderBuffer;

					mapData.colliders.forEach((collider) => {
						if (collider.points.length < 2) return;

						// Simple AABB check for collider visibility
						// Check if any point of the collider is within visible bounds
						const isVisible = collider.points.some(
							(point) =>
								point.x >= visibleWorldMinX &&
								point.x <= visibleWorldMaxX &&
								point.y >= visibleWorldMinY &&
								point.y <= visibleWorldMaxY,
						);

						if (!isVisible) return;

						// Determine if this collider is selected
						const isSelected = selectedColliderId === collider.id;

						// Draw polygon outline
						ctx.strokeStyle = isSelected
							? "rgba(255, 165, 0, 0.9)"
							: "rgba(255, 165, 0, 0.6)";
						ctx.lineWidth = isSelected ? 3 / currentZoom : 2 / currentZoom;
						ctx.beginPath();

						// Handle temp point position if dragging a point (for pointer tool)
						const getPointPosition = (index: number) => {
							if (
								currentTool === "pointer" &&
								isDraggingColliderPoint &&
								isSelected &&
								selectedColliderPointIndex === index &&
								tempColliderPointPosition
							) {
								return tempColliderPointPosition;
							}
							return collider.points[index];
						};

						// Draw the collider polygon
						const firstPoint = getPointPosition(0);
						ctx.moveTo(firstPoint.x, firstPoint.y);

						for (let i = 1; i < collider.points.length; i++) {
							const point = getPointPosition(i);
							ctx.lineTo(point.x, point.y);
						}

						// Close the polygon if we have at least 3 points
						if (collider.points.length >= 3) {
							ctx.closePath();
						}

						ctx.stroke();

						// Draw semi-transparent fill if complete (3+ points)
						if (collider.points.length >= 3) {
							ctx.fillStyle = isSelected
								? "rgba(255, 165, 0, 0.15)"
								: "rgba(255, 165, 0, 0.08)";
							ctx.fill();
						}

						// Draw control points
						for (let i = 0; i < collider.points.length; i++) {
							const point = getPointPosition(i);
							const isSelectedPoint =
								isSelected && selectedColliderPointIndex === i;

							// Outer circle
							ctx.strokeStyle = isSelectedPoint
								? "rgba(0, 150, 255, 0.9)"
								: "rgba(255, 165, 0, 0.9)";
							ctx.lineWidth = isSelectedPoint
								? 3 / currentZoom
								: 2 / currentZoom;
							ctx.beginPath();
							ctx.arc(point.x, point.y, 6 / currentZoom, 0, Math.PI * 2);
							ctx.stroke();

							// Inner circle (filled)
							ctx.fillStyle = isSelectedPoint
								? "rgba(0, 150, 255, 0.8)"
								: "rgba(255, 165, 0, 0.7)";
							ctx.beginPath();
							ctx.arc(point.x, point.y, 3 / currentZoom, 0, Math.PI * 2);
							ctx.fill();
						}

						// Draw collider name if selected and zoomed in enough
						if (isSelected && currentZoom > 0.5 && collider.name) {
							// Calculate center point
							const centerX =
								collider.points.reduce((sum, p) => sum + p.x, 0) /
								collider.points.length;
							const centerY =
								collider.points.reduce((sum, p) => sum + p.y, 0) /
								collider.points.length;

							ctx.fillStyle = "#ffffff";
							ctx.font = `${12 / currentZoom}px sans-serif`;
							ctx.textAlign = "center";
							ctx.fillText(collider.name, centerX, centerY);
							ctx.textAlign = "left"; // Reset
						}
					});
				}

				// Draw currently-being-drawn collider (when in collision tool)
				if (isDrawingCollider && drawingColliderPoints.length > 0) {
					// Draw lines connecting points (like EntityEditorView)
					ctx.strokeStyle = "rgba(100, 150, 255, 0.8)";
					ctx.lineWidth = 2 / currentZoom;
					ctx.beginPath();

					const firstPoint = drawingColliderPoints[0];
					ctx.moveTo(firstPoint.x, firstPoint.y);

					for (let i = 1; i < drawingColliderPoints.length; i++) {
						const point = drawingColliderPoints[i];
						ctx.lineTo(point.x, point.y);
					}

					ctx.stroke();

					// Draw points
					drawingColliderPoints.forEach((point, index) => {
						// First point is red and larger, others are blue (like EntityEditorView)
						if (index === 0) {
							ctx.fillStyle = "rgba(255, 100, 100, 0.9)";
							ctx.beginPath();
							ctx.arc(point.x, point.y, 6 / currentZoom, 0, Math.PI * 2);
							ctx.fill();
						} else {
							ctx.fillStyle = "rgba(100, 150, 255, 0.9)";
							ctx.beginPath();
							ctx.arc(point.x, point.y, 4 / currentZoom, 0, Math.PI * 2);
							ctx.fill();
						}
					});

					// Draw red ring around first point when we have 3+ points (closure hint, like EntityEditorView)
					if (drawingColliderPoints.length >= 3) {
						ctx.strokeStyle = "rgba(255, 100, 100, 0.9)";
						ctx.lineWidth = 3 / currentZoom;
						ctx.beginPath();
						ctx.arc(
							firstPoint.x,
							firstPoint.y,
							8 / currentZoom,
							0,
							Math.PI * 2,
						);
						ctx.stroke();
					}
				}

				// Draw grid with viewport culling (performance optimization)
				if (gridVisible) {
					ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
					ctx.lineWidth = 1 / currentZoom;

					// Only draw grid lines within visible viewport
					// Use single path for all vertical lines for better performance
					ctx.beginPath();
					for (let x = startX; x <= endX; x++) {
						ctx.moveTo(x * mapData.tileWidth, startY * mapData.tileHeight);
						ctx.lineTo(x * mapData.tileWidth, endY * mapData.tileHeight);
					}
					ctx.stroke();

					// Use single path for all horizontal lines for better performance
					ctx.beginPath();
					for (let y = startY; y <= endY; y++) {
						ctx.moveTo(startX * mapData.tileWidth, y * mapData.tileHeight);
						ctx.lineTo(endX * mapData.tileWidth, y * mapData.tileHeight);
					}
					ctx.stroke();
				}

				// Draw hover preview (for tile placement)
				const mousePos = mouseScreenPosRef.current;
				const tool = currentToolRef.current;
				const tilesetId = selectedTilesetIdRef.current;
				const tileId = selectedTileIdRef.current;

				if (
					mousePos &&
					tool === "pencil" &&
					tilesetId &&
					tileId != null &&
					!selectedTerrainLayerId &&
					canvas
				) {
					// Calculate tile position from screen coordinates using current pan/zoom
					const rect = canvas.getBoundingClientRect();
					const canvasX = mousePos.x - rect.left;
					const canvasY = mousePos.y - rect.top;
					const worldX = (canvasX - currentPan.x) / currentZoom;
					const worldY = (canvasY - currentPan.y) / currentZoom;
					const tileX = Math.floor(worldX / mapData.tileWidth);
					const tileY = Math.floor(worldY / mapData.tileHeight);

					// Unpack tileId to get geometry
					const geometry = unpackTileId(tileId);
					const tileset = getTilesetById(tilesetId);
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
							tileDef && tileDef.width !== 0
								? tileDef.width
								: tileset.tileWidth;
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
							ctx.lineWidth = 2 / currentZoom;
							const markerSize = 6 / currentZoom;

							ctx.beginPath();
							ctx.moveTo(originWorldX - markerSize, originWorldY);
							ctx.lineTo(originWorldX + markerSize, originWorldY);
							ctx.moveTo(originWorldX, originWorldY - markerSize);
							ctx.lineTo(originWorldX, originWorldY + markerSize);
							ctx.stroke();

							// Draw center dot
							ctx.fillStyle = "rgba(255, 165, 0, 0.8)";
							ctx.beginPath();
							ctx.arc(
								originWorldX,
								originWorldY,
								2 / currentZoom,
								0,
								Math.PI * 2,
							);
							ctx.fill();
						}
					}
				}

				// Draw terrain tile preview (when terrain mode is active)
				if (
					mousePos &&
					tool === "pencil" &&
					selectedTerrainLayerId &&
					tilesetId &&
					canvas
				) {
					const tileset = getTilesetById(tilesetId);
					if (tileset?.imageData && tileset.terrainLayers) {
						const terrainLayer = tileset.terrainLayers.find(
							(l) => l.id === selectedTerrainLayerId,
						);

						if (terrainLayer && terrainLayer.tiles.length > 0) {
							// Calculate tile position from screen coordinates
							const rect = canvas.getBoundingClientRect();
							const canvasX = mousePos.x - rect.left;
							const canvasY = mousePos.y - rect.top;
							const worldX = (canvasX - currentPan.x) / currentZoom;
							const worldY = (canvasY - currentPan.y) / currentZoom;
							const tileX = Math.floor(worldX / mapData.tileWidth);
							const tileY = Math.floor(worldY / mapData.tileHeight);

							// Calculate the bitmask based on surrounding tiles (same logic as actual placement)
							const currentLayer = mapData.layers.find(
								(l) => l.id === currentLayerId,
							);
							if (!currentLayer) return;

							// Helper to check if a neighbor tile belongs to this terrain layer
							const hasNeighbor = (dx: number, dy: number): boolean => {
								const nx = tileX + dx;
								const ny = tileY + dy;
								if (
									nx < 0 ||
									ny < 0 ||
									nx >= mapData.width ||
									ny >= mapData.height
								) {
									return false;
								}
								const index = ny * mapData.width + nx;
								const neighborTileId = currentLayer.tiles[index];
								if (!neighborTileId) return false;

								// Check if this tile belongs to the selected terrain layer
								const neighborTerrainLayer = getTerrainLayerForTile(
									neighborTileId,
									tilesets,
								);

								return neighborTerrainLayer === selectedTerrainLayerId;
							};

							// Calculate bitmask and find matching tile
							const bitmask = calculateBitmaskFromNeighbors(hasNeighbor);
							const previewTile = findTileByBitmask(
								tileset,
								terrainLayer,
								bitmask,
							);
							if (!previewTile) return;

							const geometry = unpackTileId(previewTile.tileId);

							// Draw semi-transparent preview
							ctx.globalAlpha = 0.5;
							ctx.drawImage(
								tileset.imageData,
								geometry.x,
								geometry.y,
								tileset.tileWidth,
								tileset.tileHeight,
								tileX * mapData.tileWidth,
								tileY * mapData.tileHeight,
								tileset.tileWidth,
								tileset.tileHeight,
							);
							ctx.globalAlpha = 1.0;
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
							const worldX = (canvasX - currentPan.x) / currentZoom;
							const worldY = (canvasY - currentPan.y) / currentZoom;

							// Draw entity with semi-transparency
							ctx.globalAlpha = 0.5;

							// Render each sprite in the entity
							entityDef.sprites.forEach((spriteLayer) => {
								// Skip if sprite is missing
								if (!spriteLayer.sprite) return;

								const sprite = spriteLayer.sprite;
								const offset = spriteLayer.offset || { x: 0, y: 0 };
								const origin = spriteLayer.origin || { x: 0.5, y: 1 };
								const scale = { x: 1, y: 1 }; // Default scale for preview

								// Calculate scaled dimensions (like actual entity rendering)
								const scaledWidth = sprite.width * scale.x;
								const scaledHeight = sprite.height * scale.y;

								// Calculate position based on origin point (using scaled dimensions)
								const originOffsetX = origin.x * scaledWidth;
								const originOffsetY = origin.y * scaledHeight;

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
									scaledWidth,
									scaledHeight,
								);
							});

							ctx.globalAlpha = 1.0;

							// Draw crosshair at cursor position to indicate placement point
							ctx.strokeStyle = "rgba(255, 165, 0, 0.8)";
							ctx.lineWidth = 2 / currentZoom;
							const markerSize = 6 / currentZoom;

							ctx.beginPath();
							ctx.moveTo(worldX - markerSize, worldY);
							ctx.lineTo(worldX + markerSize, worldY);
							ctx.moveTo(worldX, worldY - markerSize);
							ctx.lineTo(worldX, worldY + markerSize);
							ctx.stroke();

							// Draw center dot
							ctx.fillStyle = "rgba(255, 165, 0, 0.8)";
							ctx.beginPath();
							ctx.arc(worldX, worldY, 2 / currentZoom, 0, Math.PI * 2);
							ctx.fill();
						}
					}
				}

				// Draw point preview (when point tool is active)
				if (mousePos && tool === "point" && canvas) {
					// Calculate world position from screen coordinates
					const rect = canvas.getBoundingClientRect();
					const canvasX = mousePos.x - rect.left;
					const canvasY = mousePos.y - rect.top;
					const worldX = (canvasX - panX) / currentZoom;
					const worldY = (canvasY - panY) / currentZoom;

					// Draw preview circle with semi-transparency
					ctx.globalAlpha = 0.5;
					ctx.strokeStyle = "rgba(255, 100, 100, 0.8)";
					ctx.lineWidth = 2 / currentZoom;
					ctx.beginPath();
					ctx.arc(worldX, worldY, 8 / currentZoom, 0, Math.PI * 2);
					ctx.stroke();

					ctx.fillStyle = "rgba(255, 100, 100, 0.7)";
					ctx.beginPath();
					ctx.arc(worldX, worldY, 4 / currentZoom, 0, Math.PI * 2);
					ctx.fill();
					ctx.globalAlpha = 1.0;

					// Draw crosshair at cursor position
					ctx.strokeStyle = "rgba(255, 165, 0, 0.8)";
					ctx.lineWidth = 2 / currentZoom;
					const markerSize = 6 / currentZoom;

					ctx.beginPath();
					ctx.moveTo(worldX - markerSize, worldY);
					ctx.lineTo(worldX + markerSize, worldY);
					ctx.moveTo(worldX, worldY - markerSize);
					ctx.lineTo(worldX, worldY + markerSize);
					ctx.stroke();
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
							ctx.lineWidth = 2 / currentZoom;
							ctx.setLineDash([5 / currentZoom, 5 / currentZoom]);
							ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
							ctx.setLineDash([]);

							// Draw corner handles
							const handleSize = 6 / currentZoom;
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

				// Draw selection highlight for selected point
				if (selectedPointId && mapData.points) {
					const selectedPoint = mapData.points.find(
						(p) => p.id === selectedPointId,
					);
					if (selectedPoint) {
						const pointToRender =
							tempPointPosition &&
							isDraggingPoint &&
							selectedPointId === selectedPoint.id
								? {
										...selectedPoint,
										x: tempPointPosition.x,
										y: tempPointPosition.y,
									}
								: selectedPoint;

						// Draw selection circle
						ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
						ctx.lineWidth = 3 / currentZoom;
						ctx.setLineDash([5 / currentZoom, 5 / currentZoom]);
						ctx.beginPath();
						ctx.arc(
							pointToRender.x,
							pointToRender.y,
							12 / currentZoom,
							0,
							Math.PI * 2,
						);
						ctx.stroke();
						ctx.setLineDash([]);
					}
				}

				// Draw rectangle preview (when dragging with rect tool)
				if (isDrawingRect && rectStartTile && mousePos && canvas) {
					const rect = canvas.getBoundingClientRect();
					const canvasX = mousePos.x - rect.left;
					const canvasY = mousePos.y - rect.top;
					const worldX = (canvasX - currentPan.x) / currentZoom;
					const worldY = (canvasY - currentPan.y) / currentZoom;
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
					ctx.lineWidth = 2 / currentZoom;
					ctx.strokeRect(
						minX * mapData.tileWidth,
						minY * mapData.tileHeight,
						(maxX - minX + 1) * mapData.tileWidth,
						(maxY - minY + 1) * mapData.tileHeight,
					);
				}

				// Draw tile selection preview (when dragging with pointer tool)
				if (isSelectingTiles && tileSelectionStart && mousePos && canvas) {
					const rect = canvas.getBoundingClientRect();
					const canvasX = mousePos.x - rect.left;
					const canvasY = mousePos.y - rect.top;
					const worldX = (canvasX - currentPan.x) / currentZoom;
					const worldY = (canvasY - currentPan.y) / currentZoom;
					const currentTileX = Math.floor(worldX / mapData.tileWidth);
					const currentTileY = Math.floor(worldY / mapData.tileHeight);

					// Calculate selection bounds
					const minX = Math.min(tileSelectionStart.x, currentTileX);
					const maxX = Math.max(tileSelectionStart.x, currentTileX);
					const minY = Math.min(tileSelectionStart.y, currentTileY);
					const maxY = Math.max(tileSelectionStart.y, currentTileY);

					// Draw semi-transparent fill
					ctx.fillStyle = "rgba(0, 150, 255, 0.15)";
					ctx.fillRect(
						minX * mapData.tileWidth,
						minY * mapData.tileHeight,
						(maxX - minX + 1) * mapData.tileWidth,
						(maxY - minY + 1) * mapData.tileHeight,
					);

					// Draw dashed rectangle outline
					ctx.strokeStyle = "rgba(0, 150, 255, 0.9)";
					ctx.lineWidth = 2 / currentZoom;
					ctx.setLineDash([8 / currentZoom, 4 / currentZoom]);
					ctx.strokeRect(
						minX * mapData.tileWidth,
						minY * mapData.tileHeight,
						(maxX - minX + 1) * mapData.tileWidth,
						(maxY - minY + 1) * mapData.tileHeight,
					);
					ctx.setLineDash([]); // Reset dash pattern
				}

				// Draw finalized tile selection (persists until cleared)
				if (
					selectedTileRegion &&
					selectedTileRegion.layerId === currentLayerId
				) {
					const { startX, startY, endX, endY } = selectedTileRegion;

					// Draw semi-transparent fill
					ctx.fillStyle = "rgba(0, 150, 255, 0.1)";
					ctx.fillRect(
						startX * mapData.tileWidth,
						startY * mapData.tileHeight,
						(endX - startX + 1) * mapData.tileWidth,
						(endY - startY + 1) * mapData.tileHeight,
					);

					// Draw dashed outline
					ctx.strokeStyle = "rgba(0, 150, 255, 1)";
					ctx.lineWidth = 2 / currentZoom;
					ctx.setLineDash([6 / currentZoom, 6 / currentZoom]);
					ctx.strokeRect(
						startX * mapData.tileWidth,
						startY * mapData.tileHeight,
						(endX - startX + 1) * mapData.tileWidth,
						(endY - startY + 1) * mapData.tileHeight,
					);
					ctx.setLineDash([]); // Reset dash pattern
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
			isSelectingTiles,
			tileSelectionStart,
			selectedTileRegion,
			isDraggingEntity,
			renderEntity,
			selectedEntityDefId,
			selectedEntityId,
			tempEntityPosition,
			isDraggingPoint,
			selectedPointId,
			tempPointPosition,
			isDrawingCollider,
			drawingColliderPoints,
			selectedColliderId,
			selectedColliderPointIndex,
			isDraggingColliderPoint,
			tempColliderPointPosition,
			currentTool,
			getPan,
			getZoom,
			renderChunkToCache,
			getChunkCoordinates,
			tilesetByHash,
			tileDefinitionCache,
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
			isDraggingPoint,
			selectedPointId,
			tempPointPosition,
			isDrawingCollider,
			drawingColliderPoints,
			selectedColliderId,
			selectedColliderPointIndex,
			isDraggingColliderPoint,
			tempColliderPointPosition,
			currentTool,
		]);

		const screenToWorld = (screenX: number, screenY: number) => {
			const canvas = canvasRef.current;
			if (!canvas) return { worldX: 0, worldY: 0 };

			const rect = canvas.getBoundingClientRect();
			const x = screenX - rect.left;
			const y = screenY - rect.top;

			// Use getPan() to get current values (may be from refs during drag)
			const currentPan = getPan();
			const worldX = (x - currentPan.x) / zoom;
			const worldY = (y - currentPan.y) / zoom;

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
					// Pointer tool: select entity, point, or collider at click position

					// If a collider is selected, check if clicking on one of its points to drag
					if (selectedColliderId) {
						const selectedCollider = mapData.colliders?.find(
							(c) => c.id === selectedColliderId,
						);
						if (selectedCollider) {
							const pointIndex = findColliderPointAtPosition(
								worldX,
								worldY,
								selectedColliderId,
							);
							if (pointIndex !== null) {
								// Clicked on a collider point - start dragging it
								setSelectedColliderPointIndex(pointIndex);
								setColliderDragStart({
									x: e.clientX,
									y: e.clientY,
									originalPoints: selectedCollider.points.map((p) => ({
										...p,
									})),
									pointIndex: pointIndex, // Dragging specific point
								});
								setIsDraggingColliderPoint(true);
								setTempColliderPointPosition({
									x: selectedCollider.points[pointIndex].x,
									y: selectedCollider.points[pointIndex].y,
								});
								onStartBatch?.();
								renderMap.current();
								onColliderPointSelected?.(pointIndex);
								return;
							}

							// Not clicking on a point - check if clicking inside the collider body
							if (
								selectedCollider.points.length >= 3 &&
								isPointInPolygon(worldX, worldY, selectedCollider.points)
							) {
								// Clicked inside collider body - start dragging the whole collider
								// Clear selected point index so we drag all points
								setSelectedColliderPointIndex(null);
								setColliderDragStart({
									x: e.clientX,
									y: e.clientY,
									originalPoints: selectedCollider.points.map((p) => ({
										...p,
									})),
									pointIndex: null, // Dragging whole collider
								});
								_setIsDraggingCollider(true);
								onStartBatch?.();
								return;
							}
						}
					}

					// Collect all clickable objects at this position
					type ClickableObject =
						| { type: "entity"; entity: EntityInstance }
						| { type: "point"; point: PointInstance }
						| { type: "collider"; collider: PolygonCollider };
					const clickableObjects: ClickableObject[] = [];

					// Check for points FIRST (higher priority - they're smaller and harder to click)
					if (mapData.points) {
						const pointRadius = 8; // Click tolerance in world pixels
						for (let i = mapData.points.length - 1; i >= 0; i--) {
							const point = mapData.points[i];
							const dx = worldX - point.x;
							const dy = worldY - point.y;
							const distance = Math.sqrt(dx * dx + dy * dy);

							if (distance <= pointRadius) {
								clickableObjects.push({ type: "point", point });
							}
						}
					}

					// Check for entities AFTER points
					if (mapData.entities) {
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
										clickableObjects.push({ type: "entity", entity });
									}
								}
							}
						}
					}

					// Check for colliders AFTER entities
					if (mapData.colliders) {
						for (let i = mapData.colliders.length - 1; i >= 0; i--) {
							const collider = mapData.colliders[i];
							if (collider.points.length < 3) continue;

							// Check if point is inside polygon
							if (isPointInPolygon(worldX, worldY, collider.points)) {
								clickableObjects.push({ type: "collider", collider });
								continue;
							}

							// Also check if near any control point (for easier selection of small colliders)
							const threshold = 8 / zoom;
							for (const point of collider.points) {
								const dx = worldX - point.x;
								const dy = worldY - point.y;
								const distance = Math.sqrt(dx * dx + dy * dy);
								if (distance <= threshold) {
									clickableObjects.push({ type: "collider", collider });
									break;
								}
							}
						}
					}

					// Click-through: Hold Alt/Option key to cycle through overlapping objects
					const isClickThrough = e.altKey && clickableObjects.length > 1;

					// Don't update last click position here - wait for mouseUp to confirm it's not a drag

					if (clickableObjects.length > 0) {
						let objectToSelect: ClickableObject;

						if (isClickThrough) {
							// Cycle through objects: find currently selected object and select next one
							let currentIndex = -1;

							// Find current selection in the list
							if (selectedEntityId) {
								currentIndex = clickableObjects.findIndex(
									(obj) =>
										obj.type === "entity" && obj.entity.id === selectedEntityId,
								);
							} else if (selectedPointId) {
								currentIndex = clickableObjects.findIndex(
									(obj) =>
										obj.type === "point" && obj.point.id === selectedPointId,
								);
							} else if (selectedColliderId) {
								currentIndex = clickableObjects.findIndex(
									(obj) =>
										obj.type === "collider" &&
										obj.collider.id === selectedColliderId,
								);
							}

							// Select next object (or first if current not found or is last)
							const nextIndex = (currentIndex + 1) % clickableObjects.length;
							objectToSelect = clickableObjects[nextIndex];
						} else {
							// Select first (topmost) object
							objectToSelect = clickableObjects[0];
						}

						// Apply selection
						if (objectToSelect.type === "entity") {
							const foundEntity = objectToSelect.entity;
							// Update both state and ref for immediate rendering
							setSelectedEntityId(foundEntity.id);
							selectedEntityIdRef.current = foundEntity.id;
							// Clear point and collider selection
							setSelectedPointId(null);
							selectedPointIdRef.current = null;
							onPointSelected?.(null);
							setSelectedColliderId(null);
							onColliderSelected?.(null);
							setSelectedTileRegion(null);
							// Always set drag start - allow dragging after selection
							setEntityDragStart({ x: e.clientX, y: e.clientY });
							setEntityDragOffset({
								x: worldX - foundEntity.x,
								y: worldY - foundEntity.y,
							});
							// Trigger immediate render to show selection
							renderMap.current();
							// Notify parent (this may cause a slower re-render)
							onEntitySelected?.(foundEntity.id);
						} else if (objectToSelect.type === "point") {
							const foundPoint = objectToSelect.point;
							// Clear entity and collider selection
							setSelectedEntityId(null);
							selectedEntityIdRef.current = null;
							onEntitySelected?.(null);
							setSelectedColliderId(null);
							onColliderSelected?.(null);
							// Update point selection
							setSelectedTileRegion(null);
							setSelectedPointId(foundPoint.id);
							selectedPointIdRef.current = foundPoint.id;
							// Always set drag start - allow dragging after selection
							setPointDragStart({ x: e.clientX, y: e.clientY });
							setPointDragOffset({
								x: worldX - foundPoint.x,
								y: worldY - foundPoint.y,
							});
							// Trigger immediate render
							renderMap.current();
							// Notify parent
							onPointSelected?.(foundPoint.id);
						} else {
							// Collider selection
							const foundCollider = objectToSelect.collider;
							// Clear entity and point selection
							setSelectedEntityId(null);
							selectedEntityIdRef.current = null;
							onEntitySelected?.(null);
							setSelectedPointId(null);
							selectedPointIdRef.current = null;
							onPointSelected?.(null);
							// Update collider selection
							setSelectedTileRegion(null);
							setSelectedColliderId(foundCollider.id);
							// Trigger immediate render
							renderMap.current();
							// Notify parent
							onColliderSelected?.(foundCollider.id);
						}
					} else {
						// No objects found - start tile selection
						setSelectedEntityId(null);
						selectedEntityIdRef.current = null;
						setSelectedPointId(null);
						selectedPointIdRef.current = null;
						setSelectedColliderId(null);
						onEntitySelected?.(null);
						onPointSelected?.(null);
						onColliderSelected?.(null);

						// Start tile selection drag
						const tileX = Math.floor(worldX / mapData.tileWidth);
						const tileY = Math.floor(worldY / mapData.tileHeight);
						setIsSelectingTiles(true);
						setTileSelectionStart({ x: tileX, y: tileY });
						setSelectedTileRegion(null); // Clear previous selection
					}
				} else if (currentTool === "collision") {
					// Collision tool: Tiled-like click-to-place polygon drawing
					if (isDrawingCollider) {
						// Already drawing - add a point
						const snappedX = Math.floor(worldX);
						const snappedY = Math.floor(worldY);

						// Check if clicking near first point to close polygon (need at least 3 points)
						if (drawingColliderPoints.length >= 3) {
							const firstPoint = drawingColliderPoints[0];
							const distance = calculateDistance(
								snappedX,
								snappedY,
								firstPoint.x,
								firstPoint.y,
							);

							// Threshold of 8 pixels (adjusted for zoom)
							if (distance <= 8 / zoom) {
								// Close the polygon - create the collider
								onAddCollider?.(drawingColliderPoints);
								setIsDrawingCollider(false);
								setDrawingColliderPoints([]);
								// Switch to pointer tool (defer to avoid setState during render)
								setTimeout(() => onToolChange?.("pointer"), 0);
								// Note: The collider selection will be handled by handleAddCollider in MapEditorView
								return;
							}
						}

						// Add point to drawing
						setDrawingColliderPoints((prev) => [
							...prev,
							{ x: snappedX, y: snappedY },
						]);
					} else {
						// Not drawing - start drawing mode immediately
						setIsDrawingCollider(true);
						setDrawingColliderPoints([
							{ x: Math.floor(worldX), y: Math.floor(worldY) },
						]);
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
						// Start a new eraser stroke batch
						onStartBatch?.();
						setEraserStrokeTiles([{ x: tileX, y: tileY }]);
						onEraseTilesBatch([{ x: tileX, y: tileY }]);
					} else if (currentTool === "entity") {
						// Clear any entity selection when using entity tool
						setSelectedEntityId(null);
						selectedEntityIdRef.current = null;
						setEntityDragStart(null);
						onEntitySelected?.(null); // Clear parent's selection state too
						// Place entity at pixel coordinates
						onPlaceEntity(Math.floor(worldX), Math.floor(worldY));
					} else if (currentTool === "point") {
						// Place point at pixel coordinates
						onPlacePoint?.(Math.floor(worldX), Math.floor(worldY));
						// Parent will handle selection via selectedPointId prop
					}
				}
			}
		};

		const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
			// Store screen coordinates for hover preview (will be converted to world coords on render)
			setMouseScreenPos({ x: e.clientX, y: e.clientY });

			// Trigger render for tools that show cursor previews (pencil, entity, point)
			// Use RAF to throttle renders during mouse movement
			if (
				(currentTool === "pencil" ||
					currentTool === "entity" ||
					currentTool === "point") &&
				!isDragging &&
				!isDrawing
			) {
				if (rafHandle.current === null) {
					rafHandle.current = requestAnimationFrame(() => {
						renderMap.current();
						rafHandle.current = null;
					});
				}
			}

			// Trigger render for rectangle tool preview during drag
			if (isDrawingRect) {
				if (rafHandle.current === null) {
					rafHandle.current = requestAnimationFrame(() => {
						renderMap.current();
						rafHandle.current = null;
					});
				}
			}

			// Trigger render for tile selection preview during drag
			if (isSelectingTiles) {
				if (rafHandle.current === null) {
					rafHandle.current = requestAnimationFrame(() => {
						renderMap.current();
						rafHandle.current = null;
					});
				}
			}

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

			if (isDragging) {
				// Update pan using refs during drag (no React re-render)
				setPan(e.clientX - dragStartX, e.clientY - dragStartY, true);

				// Use RAF to throttle renders during pan
				if (rafHandle.current === null) {
					rafHandle.current = requestAnimationFrame(() => {
						renderMap.current();
						rafHandle.current = null;
					});
				}
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
			} else if (
				pointDragStart &&
				selectedPointId &&
				currentTool === "pointer"
			) {
				// Check if we've moved enough to start dragging points
				const dx = e.clientX - pointDragStart.x;
				const dy = e.clientY - pointDragStart.y;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (distance > DRAG_THRESHOLD) {
					// Start dragging
					if (!isDraggingPoint) {
						setIsDraggingPoint(true);
						// Start batching
						onStartBatch?.();
					}
					// Update temp position
					const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
					const newX = Math.floor(worldX - pointDragOffset.x);
					const newY = Math.floor(worldY - pointDragOffset.y);
					const newPos = { x: newX, y: newY };
					setTempPointPosition(newPos);
					// Call live update callback
					onPointDragging?.(selectedPointId, newX, newY);
				}
			} else if (
				colliderDragStart &&
				selectedColliderId &&
				currentTool === "pointer"
			) {
				// Check if we've moved enough to start dragging
				const dx = e.clientX - colliderDragStart.x;
				const dy = e.clientY - colliderDragStart.y;
				const distance = Math.sqrt(dx * dx + dy * dy);

				if (distance > DRAG_THRESHOLD) {
					const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
					const startWorldPos = screenToWorld(
						colliderDragStart.x,
						colliderDragStart.y,
					);

					// Calculate the drag delta in world coordinates
					const deltaX = worldX - startWorldPos.worldX;
					const deltaY = worldY - startWorldPos.worldY;

					if (colliderDragStart.pointIndex !== null) {
						// Dragging a single point
						if (!isDraggingColliderPoint) {
							setIsDraggingColliderPoint(true);
						}
						const originalPoint =
							colliderDragStart.originalPoints[colliderDragStart.pointIndex];
						const newX = Math.floor(originalPoint.x + deltaX);
						const newY = Math.floor(originalPoint.y + deltaY);
						setTempColliderPointPosition({ x: newX, y: newY });
						// Update the actual collider point position
						onUpdateColliderPoint?.(
							selectedColliderId,
							colliderDragStart.pointIndex,
							newX,
							newY,
						);
					} else {
						// Dragging the whole collider - update all points at once
						if (!_isDraggingCollider) {
							_setIsDraggingCollider(true);
						}
						// Calculate new points all at once
						const newPoints = colliderDragStart.originalPoints.map((p) => ({
							x: Math.floor(p.x + deltaX),
							y: Math.floor(p.y + deltaY),
						}));
						// Use dragging callback for smooth updates (doesn't mark as modified)
						onColliderDragging?.(selectedColliderId, { points: newPoints });
					}
				}
			} else if (isDrawing) {
				const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);
				if (currentTool === "pencil") {
					// Add to pencil stroke batch (avoid duplicates)
					setPencilStrokeTiles((prev) => {
						const isDuplicate = prev.some(
							(t) => t.x === tileX && t.y === tileY,
						);
						if (!isDuplicate) {
							// Place this tile immediately
							onPlaceTilesBatch([{ x: tileX, y: tileY }]);
							return [...prev, { x: tileX, y: tileY }];
						}
						return prev;
					});
				} else if (currentTool === "eraser") {
					// Only erase if we haven't erased this tile in the current stroke
					setEraserStrokeTiles((prev) => {
						const isDuplicate = prev.some(
							(t) => t.x === tileX && t.y === tileY,
						);
						if (!isDuplicate) {
							// Erase this tile immediately
							onEraseTilesBatch([{ x: tileX, y: tileY }]);
							return [...prev, { x: tileX, y: tileY }];
						}
						return prev;
					});
				}
				// Entity tool doesn't drag-paint
			}
		};

		const handleMouseLeave = () => {
			setMouseScreenPos(null);

			// Finish pencil stroke if mouse leaves while drawing
			if (
				currentTool === "pencil" &&
				isDrawing &&
				pencilStrokeTiles.length > 0
			) {
				onEndBatch?.();
				setPencilStrokeTiles([]);
				setIsDrawing(false);
			}

			// Finish eraser stroke if mouse leaves while drawing
			if (
				currentTool === "eraser" &&
				isDrawing &&
				eraserStrokeTiles.length > 0
			) {
				onEndBatch?.();
				setEraserStrokeTiles([]);
				setIsDrawing(false);
			}
		};

		const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
			// Track if we actually dragged anything (for click-through logic)
			let didDrag = false;

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
				didDrag = true;
			} else if (entityDragStart && currentTool === "pointer") {
				// Click without drag - just clear drag start - only for pointer tool
				setEntityDragStart(null);
			}

			// Finish dragging point - commit position
			if (isDraggingPoint && selectedPointId && tempPointPosition) {
				onMovePoint?.(
					selectedPointId,
					tempPointPosition.x,
					tempPointPosition.y,
				);
				onEndBatch?.();
				setIsDraggingPoint(false);
				setTempPointPosition(null);
				setPointDragStart(null);
				didDrag = true;
			} else if (pointDragStart && currentTool === "pointer") {
				// Click without drag for point - just clear drag start
				setPointDragStart(null);
			}

			// Finish dragging collider point or whole collider
			if (
				(isDraggingColliderPoint || _isDraggingCollider) &&
				selectedColliderId &&
				currentTool === "pointer" &&
				colliderDragStart
			) {
				// Commit final position and mark as modified
				if (_isDraggingCollider) {
					// Whole collider was dragged - get final positions from colliderDragStart
					const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
					const startWorldPos = screenToWorld(
						colliderDragStart.x,
						colliderDragStart.y,
					);
					const deltaX = worldX - startWorldPos.worldX;
					const deltaY = worldY - startWorldPos.worldY;
					const newPoints = colliderDragStart.originalPoints.map((p) => ({
						x: Math.floor(p.x + deltaX),
						y: Math.floor(p.y + deltaY),
					}));
					onUpdateCollider?.(selectedColliderId, { points: newPoints });
				} else if (
					isDraggingColliderPoint &&
					tempColliderPointPosition &&
					colliderDragStart.pointIndex !== null
				) {
					// Single point was dragged - commit final position
					onUpdateColliderPoint?.(
						selectedColliderId,
						colliderDragStart.pointIndex,
						tempColliderPointPosition.x,
						tempColliderPointPosition.y,
					);
				}
				// End batching to commit as one undo/redo entry
				onEndBatch?.();
				setIsDraggingColliderPoint(false);
				_setIsDraggingCollider(false);
				setTempColliderPointPosition(null);
				setColliderDragStart(null);
				didDrag = true;
			} else if (colliderDragStart && currentTool === "pointer") {
				// Click without drag - just clear drag start
				setColliderDragStart(null);
			}

			// Update click-through tracking only if we didn't drag
			if (currentTool === "pointer" && !didDrag) {
				lastClickPosRef.current = {
					x: e.clientX,
					y: e.clientY,
					time: Date.now(),
				};
			}

			if (isDrawingRect && rectStartTile) {
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

			if (isSelectingTiles && tileSelectionStart) {
				// Finish tile selection - store the selected region
				const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);

				// Calculate selection bounds
				const minX = Math.min(tileSelectionStart.x, tileX);
				const maxX = Math.max(tileSelectionStart.x, tileX);
				const minY = Math.min(tileSelectionStart.y, tileY);
				const maxY = Math.max(tileSelectionStart.y, tileY);

				// Store the selection
				setSelectedTileRegion({
					startX: minX,
					startY: minY,
					endX: maxX,
					endY: maxY,
					layerId: currentLayerId,
				});

				setIsSelectingTiles(false);
				setTileSelectionStart(null);
			}

			// Finish pencil stroke - end batching to commit undo/redo entry
			if (currentTool === "pencil" && pencilStrokeTiles.length > 0) {
				onEndBatch?.();
				setPencilStrokeTiles([]);
			}

			// Finish eraser stroke - end batching to commit undo/redo entry
			if (currentTool === "eraser" && eraserStrokeTiles.length > 0) {
				onEndBatch?.();
				setEraserStrokeTiles([]);
			}

			// Commit pan changes to state if we were dragging
			if (isDragging) {
				const currentPan = getPan();
				setPan(currentPan.x, currentPan.y, false); // Commit to state

				// Cancel any pending RAF
				if (rafHandle.current !== null) {
					cancelAnimationFrame(rafHandle.current);
					rafHandle.current = null;
				}
			}

			setIsDragging(false);
			setIsDrawing(false);
		};

		const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
			e.preventDefault();

			// Only show context menu in pointer tool mode
			if (currentTool !== "pointer") {
				return;
			}

			const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);

			// Check for points FIRST (higher priority - same as click handling)
			let foundPoint = null;
			if (mapData.points) {
				const pointRadius = 8;
				for (let i = mapData.points.length - 1; i >= 0; i--) {
					const point = mapData.points[i];
					const dx = worldX - point.x;
					const dy = worldY - point.y;
					const distance = Math.sqrt(dx * dx + dy * dy);

					if (distance <= pointRadius) {
						foundPoint = point;
						break;
					}
				}
			}

			if (foundPoint) {
				// Show context menu for point
				setContextMenu({
					visible: true,
					x: e.clientX,
					y: e.clientY,
					entityId: null,
					pointId: foundPoint.id,
				});

				// Select the point if not already selected
				if (selectedPointId !== foundPoint.id) {
					setSelectedPointId(foundPoint.id);
					selectedPointIdRef.current = foundPoint.id;
					// Clear entity selection
					setSelectedEntityId(null);
					selectedEntityIdRef.current = null;
					onEntitySelected?.(null);
					renderMap.current();
					setSelectedTileRegion(null);
					onPointSelected?.(foundPoint.id);
				}
				return;
			}

			// Check if right-clicking on an entity (in reverse order - top to bottom)
			let foundEntity = null;
			if (mapData.entities) {
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
			}

			if (foundEntity) {
				// Show context menu for entity
				setContextMenu({
					visible: true,
					x: e.clientX,
					y: e.clientY,
					entityId: foundEntity.id,
					pointId: null,
				});

				// Select the entity if not already selected
				if (selectedEntityId !== foundEntity.id) {
					setSelectedEntityId(foundEntity.id);
					selectedEntityIdRef.current = foundEntity.id;
					// Clear point selection
					setSelectedPointId(null);
					setSelectedTileRegion(null);
					selectedPointIdRef.current = null;
					onPointSelected?.(null);
					renderMap.current();
					onEntitySelected?.(foundEntity.id);
				}
				return;
			}

			// Check for colliders - if a collider is selected, check for point or edge clicks first
			if (selectedColliderId && mapData.colliders) {
				const selectedCollider = mapData.colliders.find(
					(c) => c.id === selectedColliderId,
				);
				if (selectedCollider) {
					// Check if clicking on a point
					const pointIndex = findColliderPointAtPosition(
						worldX,
						worldY,
						selectedCollider.id,
					);
					if (pointIndex !== null) {
						onContextMenuRequest?.({
							x: e.clientX,
							y: e.clientY,
							colliderId: selectedCollider.id,
							pointIndex,
						});
						return;
					}

					// Check if clicking on an edge
					const edge = findEdgeAtPosition(
						selectedCollider.points,
						worldX,
						worldY,
					);
					if (edge) {
						onContextMenuRequest?.({
							x: e.clientX,
							y: e.clientY,
							colliderId: selectedCollider.id,
							edgeIndex: edge.edgeIndex,
							insertPosition: edge.insertPosition,
						});
						return;
					}
				}
			}

			// Check if we right-clicked on a collider
			if (mapData.colliders) {
				for (const collider of mapData.colliders) {
					if (
						collider.points.length >= 3 &&
						isPointInPolygon(worldX, worldY, collider.points)
					) {
						onContextMenuRequest?.({
							x: e.clientX,
							y: e.clientY,
							colliderId: collider.id,
						});
						// Select the collider
						onColliderSelected?.(collider.id);
						return;
					}
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
					// Zoom towards mouse position with RAF throttling (performance optimization)
					const rect = canvas.getBoundingClientRect();
					const mouseX = e.clientX - rect.left;
					const mouseY = e.clientY - rect.top;

					// Get current zoom/pan from context refs for immediate values
					const currentZoom = getZoom();
					const currentPan = getPan();

					// Calculate world position at mouse before zoom
					const worldX = (mouseX - currentPan.x) / currentZoom;
					const worldY = (mouseY - currentPan.y) / currentZoom;

					// Calculate new zoom
					const delta = -e.deltaY * 0.01;
					const newZoom = Math.max(0.1, Math.min(10, currentZoom + delta));

					// Adjust pan to keep world position under mouse
					const newPanX = mouseX - worldX * newZoom;
					const newPanY = mouseY - worldY * newZoom;

					// Update context refs during zoom (no React re-render)
					isZooming.current = true;
					setZoom(newZoom, true);
					setPan(newPanX, newPanY, true);

					// Also update local refs for immediate use in rendering
					zoomRef.current = newZoom;
					panXRef.current = newPanX;
					panYRef.current = newPanY;

					// Use RAF to throttle renders during zoom
					if (rafHandle.current === null) {
						rafHandle.current = requestAnimationFrame(() => {
							renderMap.current();
							rafHandle.current = null;
						});
					}

					// Debounce: commit to state when zooming stops
					if (zoomTimeoutHandle.current !== null) {
						clearTimeout(zoomTimeoutHandle.current);
					}
					zoomTimeoutHandle.current = setTimeout(() => {
						const finalZoom = getZoom();
						const finalPan = getPan();
						isZooming.current = false;
						setZoom(finalZoom, false);
						setPan(finalPan.x, finalPan.y, false);
						zoomTimeoutHandle.current = null;
					}, 100);
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
		}, [setPan, setZoom, getPan, getZoom]);

		// Handle keyboard arrow keys to move selected entity, point, or collider
		useEffect(() => {
			if (
				currentTool !== "pointer" ||
				(!selectedEntityId && !selectedPointId && !selectedColliderId)
			) {
				return;
			}

			const handleKeyDown = (e: KeyboardEvent) => {
				// Only handle arrow keys (not Delete - that's handled in MapEditorView)
				if (!isArrowKey(e.key)) {
					return;
				}

				// Don't handle if user is typing in an input field
				const target = e.target as HTMLElement;
				if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
					return;
				}

				e.preventDefault();

				// Get movement delta from arrow key
				const delta = getArrowKeyDelta(e.key);
				if (!delta) return;

				// Handle arrow keys for entity movement
				if (selectedEntityId) {
					const entity = mapData.entities?.find(
						(e) => e.id === selectedEntityId,
					);
					if (!entity) {
						return;
					}

					// Move the entity
					onMoveEntity(
						selectedEntityId,
						entity.x + delta.deltaX,
						entity.y + delta.deltaY,
					);
				}
				// Handle arrow keys for point movement
				else if (selectedPointId) {
					const point = mapData.points?.find((p) => p.id === selectedPointId);
					if (!point) {
						return;
					}

					// Move the point
					onMovePoint?.(
						selectedPointId,
						point.x + delta.deltaX,
						point.y + delta.deltaY,
					);
				}
				// Handle arrow keys for collider movement
				else if (selectedColliderId) {
					const collider = mapData.colliders?.find(
						(c) => c.id === selectedColliderId,
					);
					if (!collider) {
						return;
					}

					// If a specific point is selected, move only that point
					if (selectedColliderPointIndex !== null) {
						const point = collider.points[selectedColliderPointIndex];
						if (point) {
							onUpdateColliderPoint?.(
								selectedColliderId,
								selectedColliderPointIndex,
								point.x + delta.deltaX,
								point.y + delta.deltaY,
							);
						}
					} else {
						// Move entire collider
						const newPoints = collider.points.map((p) => ({
							x: p.x + delta.deltaX,
							y: p.y + delta.deltaY,
						}));
						onUpdateCollider?.(selectedColliderId, { points: newPoints });
					}
				}
			};

			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [
			currentTool,
			selectedEntityId,
			selectedPointId,
			selectedColliderId,
			selectedColliderPointIndex,
			mapData.entities,
			mapData.points,
			mapData.colliders,
			onMoveEntity,
			onMovePoint,
			onUpdateColliderPoint,
			onUpdateCollider,
		]);

		// Handle keyboard events for collision tool (Escape to cancel drawing)
		useEffect(() => {
			if (currentTool !== "collision") {
				return;
			}

			const handleKeyDown = (e: KeyboardEvent) => {
				// Don't handle if user is typing in an input field
				const target = e.target as HTMLElement;
				if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
					return;
				}

				if (e.key === "Escape" && isDrawingCollider) {
					// Cancel drawing
					e.preventDefault();
					setIsDrawingCollider(false);
					setDrawingColliderPoints([]);
				}
			};

			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [currentTool, isDrawingCollider]);

		// Handle closing context menu with Escape or clicks outside
		useEffect(() => {
			if (!contextMenu.visible) {
				return;
			}

			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					setContextMenu({
						visible: false,
						x: 0,
						y: 0,
						entityId: null,
						pointId: null,
					});
				}
			};

			const handleMouseDown = (e: MouseEvent) => {
				// Check if click is outside the context menu
				const target = e.target as HTMLElement;
				if (!target.closest('[role="menu"]')) {
					setContextMenu({
						visible: false,
						x: 0,
						y: 0,
						entityId: null,
						pointId: null,
					});
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

		// Handle keyboard events for tile selection clipboard operations
		useEffect(() => {
			if (currentTool !== "pointer") {
				return;
			}

			const handleKeyDown = (e: KeyboardEvent) => {
				// Don't handle if user is typing in an input field
				if (isEditableElementFocused(e)) {
					return;
				}

				const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
				const modKey = isMac ? e.metaKey : e.ctrlKey;

				// Copy: Cmd/Ctrl+C
				if (modKey && e.key === "c" && selectedTileRegion && !e.shiftKey) {
					e.preventDefault();
					_onCopyTiles?.(selectedTileRegion);
					return;
				}

				// Cut: Cmd/Ctrl+X
				if (modKey && e.key === "x" && selectedTileRegion && !e.shiftKey) {
					e.preventDefault();
					_onCutTiles?.(selectedTileRegion);
					return;
				}

				// Paste: Cmd/Ctrl+V
				if (modKey && e.key === "v" && !e.shiftKey) {
					e.preventDefault();

					// If there's a selection, paste at the selection's start position
					// Otherwise, paste at mouse cursor position
					let tileX: number;
					let tileY: number;

					if (selectedTileRegion) {
						tileX = selectedTileRegion.startX;
						tileY = selectedTileRegion.startY;
					} else {
						// Paste at current mouse position
						const mousePos = mouseScreenPosRef.current;
						if (!mousePos || !canvasRef.current) return;

						const canvas = canvasRef.current;
						const rect = canvas.getBoundingClientRect();
						const canvasX = mousePos.x - rect.left;
						const canvasY = mousePos.y - rect.top;
						const currentPan = getPan();
						const currentZoom = getZoom();
						const worldX = (canvasX - currentPan.x) / currentZoom;
						const worldY = (canvasY - currentPan.y) / currentZoom;
						tileX = Math.floor(worldX / mapData.tileWidth);
						tileY = Math.floor(worldY / mapData.tileHeight);
					}

					_onPasteTiles?.(tileX, tileY);
					return;
				}

				// Delete: Delete or Backspace key
				if (
					(e.key === "Delete" || e.key === "Backspace") &&
					selectedTileRegion
				) {
					e.preventDefault();
					_onDeleteSelectedTiles?.(selectedTileRegion);
					setSelectedTileRegion(null); // Clear selection after delete
					return;
				}

				// Escape: Clear selection
				if (e.key === "Escape" && selectedTileRegion) {
					e.preventDefault();
					setSelectedTileRegion(null);
					_onClearTileSelection?.();
					return;
				}
			};

			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [
			currentTool,
			selectedTileRegion,
			_onCopyTiles,
			_onCutTiles,
			_onPasteTiles,
			_onDeleteSelectedTiles,
			_onClearTileSelection,
			mapData,
			getPan,
			getZoom,
		]);

		// Clear tile selection when switching tools or layers
		useEffect(() => {
			if (currentTool !== "pointer") {
				// Clear selection when switching away from pointer tool
				setSelectedTileRegion(null);
				setIsSelectingTiles(false);
				setTileSelectionStart(null);
			}
		}, [currentTool]);

		useEffect(() => {
			// Clear selection when switching layers (only if selection exists and is for different layer)
			if (selectedTileRegion && selectedTileRegion.layerId !== currentLayerId) {
				setSelectedTileRegion(null);
			}
		}, [currentLayerId, selectedTileRegion]);

		// Trigger render when tile selection finalized
		useEffect(() => {
			if (selectedTileRegion) {
				renderMap.current();
			}
		}, [selectedTileRegion]);

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
						cursor:
							isDraggingEntity || isDraggingPoint
								? "grabbing"
								: currentTool === "pointer" && isHoveringSelectedEntity
									? "grab"
									: isDragging
										? "grabbing"
										: "default",
					}}
				/>
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
								setContextMenu({
									visible: false,
									x: 0,
									y: 0,
									entityId: null,
									pointId: null,
								});
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
								if (contextMenu.entityId && onDuplicateEntity) {
									onDuplicateEntity(contextMenu.entityId);
								}
								setContextMenu({
									visible: false,
									x: 0,
									y: 0,
									entityId: null,
									pointId: null,
								});
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
								<title>Duplicate</title>
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
							</svg>
							Duplicate Entity
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								if (contextMenu.entityId && onDeleteEntity) {
									onDeleteEntity(contextMenu.entityId);
								}
								setContextMenu({
									visible: false,
									x: 0,
									y: 0,
									entityId: null,
									pointId: null,
								});
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
				{contextMenu.visible && contextMenu.pointId && (
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
								if (contextMenu.pointId && onDeletePoint) {
									onDeletePoint(contextMenu.pointId);
								}
								setContextMenu({
									visible: false,
									x: 0,
									y: 0,
									entityId: null,
									pointId: null,
								});
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
							Delete Point
						</button>
					</div>
				)}
			</div>
		);
	},
);

// Memoize the component to prevent unnecessary re-renders
// Uses default shallow prop comparison
export const MapCanvas = memo(MapCanvasComponent);
