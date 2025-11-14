import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { useRegisterUndoRedo } from "../context/UndoRedoContext";
import { useCanvasZoomPan } from "../hooks/useCanvasZoomPan";
import { useUndoableReducer } from "../hooks/useUndoableReducer";
import type { TerrainLayer, TileDefinition, TilesetTab } from "../types";
import { generateId } from "../utils/id";
import { calculateMenuPosition } from "../utils/menuPositioning";
import { packTileId, unpackTileId } from "../utils/tileId";
import { CustomPropertiesEditor } from "./CustomPropertiesEditor";
import { DragNumberInput } from "./DragNumberInput";
import { PencilIcon, ShieldIcon, TrashIcon } from "./Icons";

interface TilesetEditorViewProps {
	tab: TilesetTab;
}

export const TilesetEditorView = ({ tab }: TilesetEditorViewProps) => {
	const {
		updateTabData,
		getActiveMapTab,
		setSelectedTilesetId,
		setSelectedTileId,
		openCollisionEditor,
	} = useEditor();

	// Use tileset data from tab (single source of truth)
	const tilesetData = tab.tilesetData;

	// Helper to update tileset data in the tab
	const updateTilesetData = useCallback(
		(updates: Partial<typeof tilesetData>) => {
			updateTabData(tab.id, {
				tilesetData: { ...tilesetData, ...updates },
			});
		},
		[updateTabData, tab.id, tilesetData],
	);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const terrainLayerInputRef = useRef<HTMLInputElement>(null);

	// Zoom and pan using shared hook (persisted to viewState)
	const {
		scale,
		pan,
		setPan,
		containerRef: zoomPanContainerRef,
	} = useCanvasZoomPan({
		initialScale: tab.viewState.scale,
		initialPan: { x: tab.viewState.panX, y: tab.viewState.panY },
		minScale: 0.5,
		maxScale: 8,
		zoomSpeed: 0.01,
	});

	// Tile selection state (persisted to viewState)
	const [selectedTileRegion, setSelectedTileRegion] = useState<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null>(tab.viewState.selectedTileRegion);

	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectionStart, setSelectionStart] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		compoundTileId?: number; // Track if we're on a compound tile
		terrainLayerId?: string; // Track if we're on a terrain layer
	} | null>(null);
	const [mousePos, setMousePos] = useState<{
		tileX: number;
		tileY: number;
	} | null>(null);
	const [isEditingName, setIsEditingName] = useState(false);
	const [editedName, setEditedName] = useState(tilesetData?.name || "");
	const [selectedCompoundTileId, setSelectedCompoundTileId] = useState<
		number | null
	>(null);
	const [selectedTerrainLayer, setSelectedTerrainLayer] = useState<
		string | null
	>(null);
	const [isPaintingBitmask, setIsPaintingBitmask] = useState(false);
	const [paintAction, setPaintAction] = useState<"set" | "clear">("set");
	const [editingTerrainLayerId, setEditingTerrainLayerId] = useState<
		string | null
	>(null);
	const [editingTerrainLayerName, setEditingTerrainLayerName] = useState("");

	// Unified undo/redo state for the entire tileset (tiles + terrainLayers + dimensions)
	// This ensures all operations share a single chronological history
	type TilesetUndoState = {
		tiles: TileDefinition[];
		terrainLayers: TerrainLayer[];
		tileWidth: number;
		tileHeight: number;
	};

	const [
		localTilesetState,
		setLocalTilesetState,
		{
			undo,
			redo,
			canUndo,
			canRedo,
			startBatch,
			endBatch,
			reset: resetTilesetHistory,
			getHistory,
		},
	] = useUndoableReducer<TilesetUndoState>(
		{
			tiles: tilesetData?.tiles || [],
			terrainLayers: tilesetData?.terrainLayers || [],
			tileWidth: tilesetData?.tileWidth || 16,
			tileHeight: tilesetData?.tileHeight || 16,
		},
		tab.undoHistory,
	);

	// Extract individual parts for convenience
	const localTiles = localTilesetState.tiles;
	const localTerrainLayers = localTilesetState.terrainLayers;
	const localTileWidth = localTilesetState.tileWidth;
	const localTileHeight = localTilesetState.tileHeight;

	// Register unified undo/redo keyboard shortcuts
	useRegisterUndoRedo({ undo, redo, canUndo, canRedo });

	// Track if this is the first run to avoid marking dirty on initial mount
	const isFirstRun = useRef(true);
	const skipNextDirtyMark = useRef(false);
	const isUpdatingViewStateOnly = useRef(false);

	// Use ref to avoid infinite loop with tilesetData
	const tilesetDataRef = useRef(tilesetData);
	tilesetDataRef.current = tilesetData;

	// Reset undo history when switching to a different tileset
	const prevTilesetIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!tilesetData) return;
		if (
			prevTilesetIdRef.current !== null &&
			prevTilesetIdRef.current !== tilesetData.id
		) {
			// Switching to a different tileset, reset unified history and first run flag
			skipNextDirtyMark.current = true;
			resetTilesetHistory({
				tiles: tilesetData.tiles || [],
				terrainLayers: tilesetData.terrainLayers || [],
				tileWidth: tilesetData.tileWidth,
				tileHeight: tilesetData.tileHeight,
			});
			isFirstRun.current = true;
		}
		prevTilesetIdRef.current = tilesetData.id;
	}, [tilesetData, resetTilesetHistory]);

	// One-way sync: local tileset state → tab data
	// This updates the tab's tilesetData whenever local state changes (from any operation or undo/redo)
	useEffect(() => {
		updateTabData(tab.id, {
			tilesetData: {
				...tilesetDataRef.current,
				tiles: localTiles,
				terrainLayers: localTerrainLayers,
				tileWidth: localTileWidth,
				tileHeight: localTileHeight,
			},
			undoHistory: getHistory(),
		});

		// Skip marking dirty if we're in a reset operation
		if (skipNextDirtyMark.current) {
			skipNextDirtyMark.current = false;
			return;
		}

		// Skip marking dirty if we're only updating viewState (zoom, pan, selection)
		if (isUpdatingViewStateOnly.current) {
			isUpdatingViewStateOnly.current = false;
			return;
		}

		// Only mark dirty after first run (i.e., on actual user changes)
		if (!isFirstRun.current) {
			updateTabData(tab.id, { isDirty: true });
		} else {
			// Clear the flag after skipping, but use setTimeout to ensure
			// this happens AFTER any other effects (like reset) have run
			setTimeout(() => {
				isFirstRun.current = false;
			}, 0);
		}
	}, [
		tab.id,
		updateTabData,
		localTerrainLayers,
		localTiles,
		localTileWidth,
		localTileHeight,
		getHistory,
	]);

	// Persist undo history to tab state on unmount (when switching tabs)
	useEffect(() => {
		return () => {
			// Save history when component unmounts
			const history = getHistory();
			updateTabData(tab.id, { undoHistory: history });
		};
	}, [tab.id, updateTabData, getHistory]);

	// Sync view state (zoom, pan, selection) to tab (persisted across tab switches)
	// Track if this is the first viewState sync to avoid unnecessary updates on mount
	const isFirstViewStateSync = useRef(true);
	useEffect(() => {
		// Skip the first sync on mount to avoid marking tab as dirty
		if (isFirstViewStateSync.current) {
			isFirstViewStateSync.current = false;
			return;
		}

		// Set flag to prevent data sync effect from marking dirty
		isUpdatingViewStateOnly.current = true;

		updateTabData(tab.id, {
			viewState: {
				scale,
				panX: pan.x,
				panY: pan.y,
				selectedTileRegion,
			},
		});
	}, [tab.id, updateTabData, scale, pan.x, pan.y, selectedTileRegion]);

	// Auto-focus terrain layer input when editing starts
	useEffect(() => {
		if (editingTerrainLayerId && terrainLayerInputRef.current) {
			terrainLayerInputRef.current.focus();
			terrainLayerInputRef.current.select();
		}
	}, [editingTerrainLayerId]);

	// Memoized tile position map for O(1) lookups
	// Note: Currently unused but may be useful for future optimizations
	// const _tilePositionMap = useMemo(() => {
	// 	const map = new Map<string, (typeof localTiles)[0]>();
	// 	for (const tile of localTiles) {
	// 		if (tile.width && tile.height) {
	// 			map.set(`${tile.x},${tile.y}`, tile);
	// 		}
	// 	}
	// 	return map;
	// }, [localTiles]);

	// Helper to get terrainLayers (returns local reducer state)
	const getTerrainLayers = useCallback(() => {
		return localTerrainLayers || [];
	}, [localTerrainLayers]);

	// Draw tileset image on canvas
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = zoomPanContainerRef.current;
		if (!canvas || !container || !tilesetData?.imageData) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const draw = () => {
			// Resize canvas to fill container
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;

			// Clear canvas
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// Apply transforms for pan and zoom
			ctx.save();
			ctx.translate(pan.x, pan.y);
			ctx.scale(scale, scale);

			if (tilesetData.imageData === undefined) return;

			// Draw the tileset image
			ctx.drawImage(tilesetData.imageData, 0, 0);

			// Draw grid overlay (skip segments inside compound tiles)
			ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
			ctx.lineWidth = 1 / scale;

			// Draw vertical lines
			for (
				let x = 0;
				x <= tilesetData.imageData.width;
				x += tilesetData.tileWidth
			) {
				// Find all compound tiles that intersect this vertical line
				const intersectingTiles = localTiles
					.filter((tile) => {
						if (tile.width === 0 || tile.height === 0) return false; // Not a compound tile
						const { x: tileX } = unpackTileId(tile.id);
						const tileWidth =
							tile.width !== 0 ? tile.width : tilesetData.tileWidth;
						return x > tileX && x < tileX + tileWidth;
					})
					.sort((a, b) => {
						const { y: aY } = unpackTileId(a.id);
						const { y: bY } = unpackTileId(b.id);
						return aY - bY;
					}); // Sort by Y position

				if (intersectingTiles.length === 0) {
					// No intersections, draw full line
					ctx.beginPath();
					ctx.moveTo(x, 0);
					ctx.lineTo(x, tilesetData.imageData.height);
					ctx.stroke();
				} else {
					// Draw line segments, skipping parts inside compound tiles
					let currentY = 0;
					for (const tile of intersectingTiles) {
						const { y: tileY } = unpackTileId(tile.id);
						const tileHeight =
							tile.height !== 0 ? tile.height : tilesetData.tileHeight;
						// Draw from currentY to top of tile
						if (currentY < tileY) {
							ctx.beginPath();
							ctx.moveTo(x, currentY);
							ctx.lineTo(x, tileY);
							ctx.stroke();
						}
						currentY = Math.max(currentY, tileY + tileHeight);
					}
					// Draw remaining segment
					if (currentY < tilesetData.imageData.height) {
						ctx.beginPath();
						ctx.moveTo(x, currentY);
						ctx.lineTo(x, tilesetData.imageData.height);
						ctx.stroke();
					}
				}
			}

			// Draw horizontal lines
			for (
				let y = 0;
				y <= tilesetData.imageData.height;
				y += tilesetData.tileHeight
			) {
				// Find all compound tiles that intersect this horizontal line
				const intersectingTiles = tilesetData.tiles
					.filter((tile) => {
						if (tile.width === 0 || tile.height === 0) return false; // Not a compound tile
						const { y: tileY } = unpackTileId(tile.id);
						const tileHeight =
							tile.height !== 0 ? tile.height : tilesetData.tileHeight;
						return y > tileY && y < tileY + tileHeight;
					})
					.sort((a, b) => {
						const { x: aX } = unpackTileId(a.id);
						const { x: bX } = unpackTileId(b.id);
						return aX - bX;
					}); // Sort by X position

				if (intersectingTiles.length === 0) {
					// No intersections, draw full line
					ctx.beginPath();
					ctx.moveTo(0, y);
					ctx.lineTo(tilesetData.imageData.width, y);
					ctx.stroke();
				} else {
					// Draw line segments, skipping parts inside compound tiles
					let currentX = 0;
					for (const tile of intersectingTiles) {
						const { x: tileX } = unpackTileId(tile.id);
						const tileWidth =
							tile.width !== 0 ? tile.width : tilesetData.tileWidth;
						// Draw from currentX to left of tile
						if (currentX < tileX) {
							ctx.beginPath();
							ctx.moveTo(currentX, y);
							ctx.lineTo(tileX, y);
							ctx.stroke();
						}
						currentX = Math.max(currentX, tileX + tileWidth);
					}
					// Draw remaining segment
					if (currentX < tilesetData.imageData.width) {
						ctx.beginPath();
						ctx.moveTo(currentX, y);
						ctx.lineTo(tilesetData.imageData.width, y);
						ctx.stroke();
					}
				}
			}

			// Draw borders around compound tiles
			ctx.strokeStyle = "rgba(34, 197, 94, 0.8)"; // Green color
			ctx.lineWidth = 2 / scale;
			for (const tile of tilesetData.tiles) {
				// Check the isCompound flag
				if (tile.isCompound && tile.width && tile.height) {
					// This is a compound tile
					const { x: tileX, y: tileY } = unpackTileId(tile.id);
					const tileWidth = tile.width;
					const tileHeight = tile.height;

					// Draw border around it
					ctx.strokeRect(tileX, tileY, tileWidth, tileHeight);

					// Draw origin marker if this tile is selected
					if (tile.id === selectedCompoundTileId && tile.origin) {
						const originX = tileX + tile.origin.x * tileWidth;
						const originY = tileY + tile.origin.y * tileHeight;
						const markerSize = 8 / scale;

						ctx.save();
						// Draw crosshair
						ctx.strokeStyle = "rgba(255, 165, 0, 1)"; // Orange
						ctx.lineWidth = 2 / scale;
						ctx.beginPath();
						ctx.moveTo(originX - markerSize, originY);
						ctx.lineTo(originX + markerSize, originY);
						ctx.moveTo(originX, originY - markerSize);
						ctx.lineTo(originX, originY + markerSize);
						ctx.stroke();

						// Draw center dot
						ctx.fillStyle = "rgba(255, 165, 0, 1)";
						ctx.beginPath();
						ctx.arc(originX, originY, 3 / scale, 0, Math.PI * 2);
						ctx.fill();
						ctx.restore();
					}

					// Draw tile name if present
					if (tile.name !== "") {
						ctx.save();
						ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
						ctx.font = `${Math.max(10, 12 / scale)}px sans-serif`;
						const metrics = ctx.measureText(tile.name);
						const padding = 4 / scale;
						const textX = tileX + padding;
						const textY = tileY + 12 / scale + padding;

						// Draw background for text
						ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
						ctx.fillRect(
							textX - padding,
							textY - 12 / scale,
							metrics.width + padding * 2,
							14 / scale,
						);

						// Draw text
						ctx.fillStyle = "rgba(34, 197, 94, 1)";
						ctx.fillText(tile.name, textX, textY);
						ctx.restore();
					}
				}
			}

			// Draw collision polygons
			ctx.strokeStyle = "rgba(255, 0, 255, 0.8)"; // Magenta
			ctx.fillStyle = "rgba(255, 0, 255, 0.2)";
			ctx.lineWidth = 2 / scale;
			for (const tile of tilesetData.tiles) {
				if (!tile.colliders || tile.colliders.length === 0) continue;

				const { x: tileX, y: tileY } = unpackTileId(tile.id);
				for (const collider of tile.colliders) {
					if (collider.points.length > 2) {
						ctx.save();
						ctx.translate(tileX, tileY);

						// Draw filled polygon
						ctx.beginPath();
						ctx.moveTo(collider.points[0].x, collider.points[0].y);
						for (let i = 1; i < collider.points.length; i++) {
							ctx.lineTo(collider.points[i].x, collider.points[i].y);
						}
						ctx.closePath();
						ctx.fill();
						ctx.stroke();

						ctx.restore();
					}
				}
			}

			// Draw tile selection
			if (selectedTileRegion) {
				const { x, y, width, height } = selectedTileRegion;
				ctx.fillStyle = "rgba(100, 150, 255, 0.3)";
				ctx.fillRect(
					x * tilesetData.tileWidth,
					y * tilesetData.tileHeight,
					width * tilesetData.tileWidth,
					height * tilesetData.tileHeight,
				);
				ctx.strokeStyle = "rgba(100, 150, 255, 0.8)";
				ctx.lineWidth = 2 / scale;
				ctx.strokeRect(
					x * tilesetData.tileWidth,
					y * tilesetData.tileHeight,
					width * tilesetData.tileWidth,
					height * tilesetData.tileHeight,
				);
			}

			// Draw 3x3 terrain bitmask grids when a terrain layer is selected
			if (selectedTerrainLayer) {
				const terrainLayers = getTerrainLayers();
				const selectedLayer = terrainLayers.find(
					(l) => l.id === selectedTerrainLayer,
				);

				if (selectedLayer) {
					const cols = Math.ceil(
						tilesetData.imageData.width / tilesetData.tileWidth,
					);
					const rows = Math.ceil(
						tilesetData.imageData.height / tilesetData.tileHeight,
					);

					// OPTIMIZATION: Calculate visible tile bounds (viewport culling)
					const viewportLeft = -pan.x / scale;
					const viewportTop = -pan.y / scale;
					const viewportRight = viewportLeft + canvas.width / scale;
					const viewportBottom = viewportTop + canvas.height / scale;

					const startCol = Math.max(
						0,
						Math.floor(viewportLeft / tilesetData.tileWidth),
					);
					const endCol = Math.min(
						cols,
						Math.ceil(viewportRight / tilesetData.tileWidth),
					);
					const startRow = Math.max(
						0,
						Math.floor(viewportTop / tilesetData.tileHeight),
					);
					const endRow = Math.min(
						rows,
						Math.ceil(viewportBottom / tilesetData.tileHeight),
					);

					const cellWidth = tilesetData.tileWidth / 3;
					const cellHeight = tilesetData.tileHeight / 3;

					// OPTIMIZATION: Use Path2D for batched rendering
					const gridPath = new Path2D();
					const fillPathCenter = new Path2D();
					const fillPathOther = new Path2D();

					// Only iterate through visible tiles
					for (let tileY = startRow; tileY < endRow; tileY++) {
						for (let tileX = startCol; tileX < endCol; tileX++) {
							const tilePosX = tileX * tilesetData.tileWidth;
							const tilePosY = tileY * tilesetData.tileHeight;

							// Calculate tile ID for this position (terrain layers use IDs directly)
							// Use 0 for tileset index - will be replaced with actual index when placed on map
							// Width/height are looked up from tileset, not packed in ID
							const tileId = packTileId(
								tilePosX,
								tilePosY,
								0, // tileset index
							);

							// Get bitmask from terrain layer
							const terrainTile = selectedLayer.tiles?.find(
								(t) => t.tileId === tileId,
							);
							const bitmask = terrainTile?.bitmask || 0;

							// Build paths for all cells
							for (let row = 0; row < 3; row++) {
								for (let col = 0; col < 3; col++) {
									const cellX = tilePosX + col * cellWidth;
									const cellY = tilePosY + row * cellHeight;
									const bitIndex = row * 3 + col;
									const isSet = (bitmask & (1 << bitIndex)) !== 0;
									const isCenter = row === 1 && col === 1;

									// Add to appropriate fill path if bit is set
									if (isSet) {
										if (isCenter) {
											fillPathCenter.rect(cellX, cellY, cellWidth, cellHeight);
										} else {
											fillPathOther.rect(cellX, cellY, cellWidth, cellHeight);
										}
									}

									// Add to grid path
									gridPath.rect(cellX, cellY, cellWidth, cellHeight);
								}
							}
						}
					}

					// OPTIMIZATION: Draw all fills and strokes in just 3 calls instead of thousands
					ctx.fillStyle = "rgba(14, 99, 156, 0.4)";
					ctx.fill(fillPathOther);
					ctx.fillStyle = "rgba(17, 119, 187, 0.5)";
					ctx.fill(fillPathCenter);
					ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
					ctx.lineWidth = 1 / scale;
					ctx.stroke(gridPath);
				}
			}

			ctx.restore();
		};

		draw();

		// Use ResizeObserver to watch for container size changes
		const resizeObserver = new ResizeObserver(() => {
			draw();
		});
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [
		tilesetData,
		selectedTileRegion,
		pan,
		scale,
		selectedTerrainLayer,
		selectedCompoundTileId,
		localTiles,
		getTerrainLayers,
		zoomPanContainerRef,
	]);

	// Helper to convert screen coordinates to canvas coordinates
	const screenToCanvas = (screenX: number, screenY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return { canvasX: 0, canvasY: 0 };

		const rect = canvas.getBoundingClientRect();
		const x = screenX - rect.left;
		const y = screenY - rect.top;

		// Account for pan and zoom transforms
		const canvasX = (x - pan.x) / scale;
		const canvasY = (y - pan.y) / scale;

		return { canvasX, canvasY };
	};

	// Helper to convert canvas coordinates to tile coordinates
	const canvasToTile = (canvasX: number, canvasY: number) => {
		if (!tilesetData) return { tileX: 0, tileY: 0 };
		const tileX = Math.floor(canvasX / tilesetData.tileWidth);
		const tileY = Math.floor(canvasY / tilesetData.tileHeight);
		return { tileX, tileY };
	};

	// Helper function to paint a bitmask cell
	const paintBitmaskCell = (
		canvasX: number,
		canvasY: number,
		action: "set" | "clear",
	) => {
		if (!tilesetData) return;
		const { tileX, tileY } = canvasToTile(canvasX, canvasY);

		// Get terrain layer
		const terrainLayers = getTerrainLayers();
		const selectedLayer = terrainLayers.find(
			(l) => l.id === selectedTerrainLayer,
		);
		if (!selectedLayer) return;

		// Calculate which cell within the 3x3 grid was clicked
		const tilePosX = tileX * tilesetData.tileWidth;
		const tilePosY = tileY * tilesetData.tileHeight;
		const cellWidth = tilesetData.tileWidth / 3;
		const cellHeight = tilesetData.tileHeight / 3;
		const cellCol = Math.floor((canvasX - tilePosX) / cellWidth);
		const cellRow = Math.floor((canvasY - tilePosY) / cellHeight);

		// Clamp to 0-2 range
		const clampedCol = Math.max(0, Math.min(2, cellCol));
		const clampedRow = Math.max(0, Math.min(2, cellRow));

		// Calculate the bit index for the bitmask
		const bitIndex = clampedRow * 3 + clampedCol;

		// For terrain layers, we don't need tile entries in tiles[]
		// Just work directly with the packed tile ID
		// Use 0 for tileset index - will be replaced when placed on map
		const tileId = packTileId(
			tilePosX,
			tilePosY,
			0, // tileset index
		);

		// Get current bitmask from terrain layer
		const terrainTile = selectedLayer.tiles?.find((t) => t.tileId === tileId);
		const currentBitmask = terrainTile?.bitmask || 0;

		// Apply the action consistently
		let newBitmask: number;
		if (action === "set") {
			newBitmask = currentBitmask | (1 << bitIndex); // Set the bit
		} else {
			newBitmask = currentBitmask & ~(1 << bitIndex); // Clear the bit
		}

		// Only update if the bitmask actually changed
		if (newBitmask !== currentBitmask) {
			handleUpdateBitmask(tileId, selectedLayer.id, newBitmask);
		}
	};

	// Mouse handlers for panning and tile selection
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			// Middle mouse or Shift+Left = Pan
			setIsDragging(true);
			setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
		} else if (e.button === 0 && selectedTerrainLayer) {
			// Left click with terrain layer selected = Paint bitmask cell
			if (!tilesetData) return;
			const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY);
			const { tileX, tileY } = canvasToTile(canvasX, canvasY);

			// Get terrain layer name
			const terrainLayers = getTerrainLayers();
			const selectedLayer = terrainLayers.find(
				(l) => l.id === selectedTerrainLayer,
			);
			if (!selectedLayer) return;

			// Calculate which cell within the 3x3 grid was clicked
			const tilePosX = tileX * tilesetData.tileWidth;
			const tilePosY = tileY * tilesetData.tileHeight;
			const cellWidth = tilesetData.tileWidth / 3;
			const cellHeight = tilesetData.tileHeight / 3;
			const cellCol = Math.floor((canvasX - tilePosX) / cellWidth);
			const cellRow = Math.floor((canvasY - tilePosY) / cellHeight);

			// Clamp to 0-2 range
			const clampedCol = Math.max(0, Math.min(2, cellCol));
			const clampedRow = Math.max(0, Math.min(2, cellRow));

			// Calculate the bit index for the bitmask
			const bitIndex = clampedRow * 3 + clampedCol;

			// Calculate tile ID for this position (terrain layers use IDs directly)
			// Use 0 for tileset index - will be replaced when placed on map
			const tileId = packTileId(
				tilePosX,
				tilePosY,
				0, // tileset index
			);

			// Determine the action based on whether the bit is currently set
			const terrainTile = selectedLayer.tiles?.find((t) => t.tileId === tileId);
			const currentBitmask = terrainTile?.bitmask || 0;
			const isBitSet = (currentBitmask & (1 << bitIndex)) !== 0;
			const action: "set" | "clear" = isBitSet ? "clear" : "set";

			// Store the action for consistent dragging
			setPaintAction(action);
			setIsPaintingBitmask(true);

			// Start batching changes for smooth brush strokes
			startBatch();

			// Paint the initial cell
			paintBitmaskCell(canvasX, canvasY, action);
		} else if (e.button === 0) {
			// Left click = Select tiles
			if (!tilesetData) return;
			const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY);

			// Check if click is within the tileset image bounds
			if (
				canvasX < 0 ||
				canvasY < 0 ||
				canvasX >= (tilesetData.imageData?.width ?? 0) ||
				canvasY >= (tilesetData.imageData?.height ?? 0)
			) {
				// Clicked outside the tileset, clear selection
				setSelectedTileRegion(null);
				setSelectedCompoundTileId(null);
				setSelectedTileId(null);
				return;
			}

			const { tileX, tileY } = canvasToTile(canvasX, canvasY);

			// Check if we clicked on a compound tile
			let foundCompoundTile = false;
			for (const tile of localTiles) {
				if (tile.width && tile.height) {
					// Check if click is within this compound tile's bounds
					const { x: tileX, y: tileY } = unpackTileId(tile.id);
					const tileRight = tileX + tile.width;
					const tileBottom = tileY + tile.height;

					if (
						canvasX >= tileX &&
						canvasX < tileRight &&
						canvasY >= tileY &&
						canvasY < tileBottom
					) {
						// Clicked on this compound tile, select its entire region
						const regionX = Math.floor(tileX / tilesetData.tileWidth);
						const regionY = Math.floor(tileY / tilesetData.tileHeight);
						const regionWidth = Math.ceil(tile.width / tilesetData.tileWidth);
						const regionHeight = Math.ceil(
							tile.height / tilesetData.tileHeight,
						);

						setSelectedTileRegion({
							x: regionX,
							y: regionY,
							width: regionWidth,
							height: regionHeight,
						});
						// Set the selected tile ID for the sidebar
						setSelectedCompoundTileId(tile.id);

						// Also set the selected tile ID for map drawing
						const activeMapTab = getActiveMapTab();
						if (activeMapTab) {
							setSelectedTilesetId(tab.tilesetId);
							setSelectedTileId(tile.id);
							updateTabData(activeMapTab.id, {
								viewState: {
									...activeMapTab.viewState,
									selectedTilesetId: tab.tilesetId,
									selectedTileId: tile.id,
								},
							});
						}

						foundCompoundTile = true;
						break;
					}
				}
			}

			if (!foundCompoundTile) {
				// No compound tile found, start normal selection
				setIsSelecting(true);
				setSelectionStart({ x: tileX, y: tileY });

				// Clear selected tile ID when clicking on regular tiles
				setSelectedTileId(null);

				// Check if there's a tile entry at this position (for properties)
				const tilePosX = tileX * tilesetData.tileWidth;
				const tilePosY = tileY * tilesetData.tileHeight;
				const existingTile = localTiles.find((t) => {
					if (t.width || t.height) return false; // Skip compound tiles
					const { x, y } = unpackTileId(t.id);
					return x === tilePosX && y === tilePosY;
				});

				if (existingTile) {
					setSelectedCompoundTileId(existingTile.id);
				} else {
					// No tile entry exists yet, create one for property editing
					// Use 0 for tileset index - will be replaced when placed on map
					const tileId = packTileId(
						tilePosX,
						tilePosY,
						0, // tileset index
					);
					const newTile: TileDefinition = {
						id: tileId,
						isCompound: false,
						width: 0,
						height: 0,
						name: "",
						type: "",
						properties: {},
						colliders: [],
						origin: { x: 0, y: 0 },
					};
					setLocalTilesetState({
						...localTilesetState,
						tiles: [...localTiles, newTile],
					});
					setSelectedCompoundTileId(tileId);
				}

				// Set initial single-tile selection
				setSelectedTileRegion({ x: tileX, y: tileY, width: 1, height: 1 });
			}
		}
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		// Update mouse position for status bar
		const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY);
		const { tileX, tileY } = canvasToTile(canvasX, canvasY);
		setMousePos({ tileX, tileY });

		if (isDragging) {
			setPan({
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y,
			});
		} else if (isPaintingBitmask) {
			// Continue painting bitmask cells while dragging
			paintBitmaskCell(canvasX, canvasY, paintAction);
		} else if (isSelecting && selectionStart) {
			// Calculate selection rectangle
			const x = Math.min(selectionStart.x, tileX);
			const y = Math.min(selectionStart.y, tileY);
			const width = Math.abs(tileX - selectionStart.x) + 1;
			const height = Math.abs(tileY - selectionStart.y) + 1;

			setSelectedTileRegion({ x, y, width, height });
		}
	};

	const handleMouseUp = () => {
		// End batch if we were painting terrain
		if (isPaintingBitmask) {
			endBatch();
		}

		setIsDragging(false);
		setIsSelecting(false);
		setSelectionStart(null);
		setIsPaintingBitmask(false);
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();

		// Check if we're right-clicking on a compound tile
		const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY);
		let clickedCompoundTile: number | undefined;

		for (const tile of localTiles) {
			if (tile.width && tile.height) {
				const { x: tileX, y: tileY } = unpackTileId(tile.id);
				const tileRight = tileX + tile.width;
				const tileBottom = tileY + tile.height;

				if (
					canvasX >= tileX &&
					canvasX < tileRight &&
					canvasY >= tileY &&
					canvasY < tileBottom
				) {
					clickedCompoundTile = tile.id;
					break;
				}
			}
		}

		// If we clicked on a compound tile, show delete option
		// Otherwise, only allow right-click if there's a selection for creating compound tile
		if (clickedCompoundTile || selectedTileRegion) {
			const position = calculateMenuPosition(e.clientX, e.clientY, 200, 80);
			setContextMenu({
				x: position.x,
				y: position.y,
				compoundTileId: clickedCompoundTile,
			});
		}
	};

	const handleMarkAsCompoundTile = () => {
		setContextMenu(null);

		if (!selectedTileRegion || !tilesetData) return;

		const { x, y, width, height } = selectedTileRegion;

		// Create new tile definition - mark as compound tile
		const tileX = x * tilesetData.tileWidth;
		const tileY = y * tilesetData.tileHeight;
		const tileWidth = width * tilesetData.tileWidth;
		const tileHeight = height * tilesetData.tileHeight;
		const newTile: TileDefinition = {
			id: packTileId(tileX, tileY, 0), // tileset index=0 (compound tile), x and y packed in id
			isCompound: true,
			width: tileWidth,
			height: tileHeight,
			origin: { x: 0, y: 0 },
			colliders: [],
			name: "",
			type: "",
			properties: {},
		};

		// Update unified state with undo/redo support
		setLocalTilesetState({
			...localTilesetState,
			tiles: [...localTiles, newTile],
		});
	};

	const handleDeleteCompoundTile = () => {
		setContextMenu(null);

		if (contextMenu?.compoundTileId === undefined) return;

		// Update unified state with undo/redo support
		setLocalTilesetState({
			...localTilesetState,
			tiles: localTiles.filter((t) => t.id !== contextMenu.compoundTileId),
		});
	};

	const handleClearSelection = () => {
		setContextMenu(null);
		setSelectedTileRegion(null);
	};

	const handleNameClick = () => {
		if (!tilesetData) return;
		setIsEditingName(true);
		setEditedName(tilesetData.name);
	};

	const handleNameSave = () => {
		if (!tilesetData) return;
		if (editedName.trim() && editedName !== tilesetData.name) {
			updateTilesetData({ name: editedName.trim() });
			updateTabData(tab.id, { title: editedName.trim(), isDirty: true });
		}
		setIsEditingName(false);
	};

	const handleNameKeyDown = (e: React.KeyboardEvent) => {
		if (!tilesetData) return;
		if (e.key === "Enter") {
			handleNameSave();
		} else if (e.key === "Escape") {
			setIsEditingName(false);
			setEditedName(tilesetData.name);
		}
	};

	const handleAddCollider = () => {
		setContextMenu(null);

		if (!tilesetData) return;

		let tileId: number;

		if (contextMenu?.compoundTileId !== undefined) {
			// Right-clicked on a compound tile
			tileId = contextMenu.compoundTileId;
		} else if (
			selectedTileRegion &&
			selectedTileRegion.width === 1 &&
			selectedTileRegion.height === 1
		) {
			// Single tile selection - calculate tile ID from position
			const tileX = selectedTileRegion.x * tilesetData.tileWidth;
			const tileY = selectedTileRegion.y * tilesetData.tileHeight;
			tileId = packTileId(tileX, tileY, 0);
		} else {
			return;
		}

		// Ensure tile definition exists for regular tiles
		const existingTile = localTiles.find((t) => t.id === tileId);
		if (!existingTile) {
			const newTile: TileDefinition = {
				id: tileId,
				isCompound: false,
				width: 0,
				height: 0,
				name: "",
				type: "",
				properties: {},
				colliders: [],
				origin: { x: 0, y: 0 },
			};
			const updatedTiles = [...localTiles, newTile];
			setLocalTilesetState({
				...localTilesetState,
				tiles: updatedTiles,
			});
		}

		// Open collision editor - it will show loading state until tile appears
		openCollisionEditor("tile", tab.tilesetId, tileId, tab.id);
	};

	const handleUpdateTileName = (name: string) => {
		if (!selectedCompoundTileId) return;

		const existingTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (existingTile) {
			// Update existing tile with undo/redo support
			setLocalTilesetState({
				...localTilesetState,
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId ? { ...t, name } : t,
				),
			});
		} else {
			// Create new tile entry from packed ID with undo/redo support (x and y are in the id)
			const newTile: TileDefinition = {
				id: selectedCompoundTileId,
				name,
				isCompound: false,
				width: 0,
				height: 0,
				origin: { x: 0, y: 0 },
				colliders: [],
				type: "",
				properties: {},
			};
			setLocalTilesetState({
				...localTilesetState,
				tiles: [...localTiles, newTile],
			});
		}
	};

	const handleUpdateTileType = (type: string) => {
		if (!selectedCompoundTileId) return;

		const existingTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (existingTile) {
			// Update existing tile with undo/redo support
			setLocalTilesetState({
				...localTilesetState,
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId ? { ...t, type } : t,
				),
			});
		} else {
			// Create new tile entry from packed ID with undo/redo support (x and y are in the id)
			const newTile: TileDefinition = {
				id: selectedCompoundTileId,
				type,
				isCompound: false,
				width: 0,
				height: 0,
				origin: { x: 0, y: 0 },
				colliders: [],
				name: "",
				properties: {},
			};
			setLocalTilesetState({
				...localTilesetState,
				tiles: [...localTiles, newTile],
			});
		}
	};

	const handleUpdateTileOrigin = (x: number, y: number) => {
		if (!selectedCompoundTileId) return;

		const existingTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (existingTile) {
			// Update existing tile with undo/redo support
			setLocalTilesetState({
				...localTilesetState,
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId ? { ...t, origin: { x, y } } : t,
				),
			});
		} else {
			// Create new tile entry from packed ID with undo/redo support (x and y coords are in the id)
			const newTile: TileDefinition = {
				id: selectedCompoundTileId,
				origin: { x, y },
				isCompound: false,
				width: 0,
				height: 0,
				colliders: [],
				name: "",
				type: "",
				properties: {},
			};
			setLocalTilesetState({
				...localTilesetState,
				tiles: [...localTiles, newTile],
			});
		}
	};

	// Handle property changes for compound tiles
	const handlePropertiesChange = (properties: Record<string, string>) => {
		if (!selectedCompoundTileId) return;

		setLocalTilesetState({
			...localTilesetState,
			tiles: localTiles.map((t) =>
				t.id === selectedCompoundTileId ? { ...t, properties } : t,
			),
		});
	};

	const handleUpdateBitmask = (
		tileId: number,
		layerId: string,
		newBitmask: number,
	) => {
		const terrainLayers = getTerrainLayers();
		const updatedLayers = terrainLayers.map((layer) => {
			if (layer.id !== layerId) return layer;

			const tiles = layer.tiles || [];
			const existingTileIndex = tiles.findIndex((t) => t.tileId === tileId);

			if (existingTileIndex >= 0) {
				// Update existing tile's bitmask
				const updatedTiles = [...tiles];
				updatedTiles[existingTileIndex] = {
					...tiles[existingTileIndex],
					bitmask: newBitmask,
				};
				return { ...layer, tiles: updatedTiles };
			} else {
				// Add new tile to layer
				return { ...layer, tiles: [...tiles, { tileId, bitmask: newBitmask }] };
			}
		});

		// This uses undo/redo for painting operations
		updateTerrainLayers(updatedLayers);
	};

	// Helper to update terrainLayers with undo/redo support
	// This is used for PAINTING operations
	const updateTerrainLayers = (layers: TerrainLayer[]) => {
		setLocalTilesetState({
			...localTilesetState,
			terrainLayers: layers,
		});
		// The useEffect above syncs to global state automatically
	};

	// Update terrain layers WITHOUT undo/redo (for structural changes like add/remove/rename)
	const updateTerrainLayersNoHistory = (layers: TerrainLayer[]) => {
		// Reset the undo/redo history to the new state
		resetTilesetHistory({
			tiles: localTiles,
			terrainLayers: layers,
			tileWidth: localTileWidth,
			tileHeight: localTileHeight,
		});
		// The useEffect above syncs to global state automatically
	};

	// Terrain layer handlers (structural operations - no undo/redo)
	const handleAddTerrainLayer = () => {
		const terrainLayers = getTerrainLayers();
		const newLayer: TerrainLayer = {
			id: generateId(),
			name: `Terrain ${terrainLayers.length + 1}`,
			tiles: [],
		};

		updateTerrainLayersNoHistory([...terrainLayers, newLayer]);
	};

	const handleUpdateTerrainLayer = (updatedLayer: TerrainLayer) => {
		const terrainLayers = getTerrainLayers();
		updateTerrainLayersNoHistory(
			terrainLayers.map((layer) =>
				layer.id === updatedLayer.id ? updatedLayer : layer,
			),
		);
	};

	const handleDeleteTerrainLayer = (layerId: string) => {
		const terrainLayers = getTerrainLayers();
		updateTerrainLayersNoHistory(
			terrainLayers.filter((layer) => layer.id !== layerId),
		);

		// Clear selection if deleted layer was selected
		if (selectedTerrainLayer === layerId) {
			setSelectedTerrainLayer(null);
		}
	};

	const handleTerrainLayerContextMenu = (
		e: React.MouseEvent,
		layerId: string,
	) => {
		e.preventDefault();
		e.stopPropagation();

		const menuWidth = 160;
		const menuHeight = 80;

		const position = calculateMenuPosition(
			e.clientX,
			e.clientY,
			menuWidth,
			menuHeight,
		);

		setContextMenu({
			x: position.x,
			y: position.y,
			terrainLayerId: layerId,
		});
	};

	const handleRenameTerrainLayer = () => {
		if (contextMenu?.terrainLayerId) {
			const layer = getTerrainLayers().find(
				(l) => l.id === contextMenu.terrainLayerId,
			);
			if (layer) {
				setEditingTerrainLayerId(layer.id);
				setEditingTerrainLayerName(layer.name);
			}
		}
		setContextMenu(null);
	};

	const handleDeleteTerrainLayerFromMenu = () => {
		if (contextMenu?.terrainLayerId) {
			handleDeleteTerrainLayer(contextMenu.terrainLayerId);
		}
		setContextMenu(null);
	};

	const selectedTile = localTiles.find((t) => t.id === selectedCompoundTileId);

	// If tileset not found, show error (after all hooks)
	if (!tilesetData) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-red-400">Tileset not found: {tab.tilesetId}</div>
			</div>
		);
	}

	// If image not loaded, show loading message (after all hooks)
	if (!tilesetData.imageData) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-gray-400">Loading tileset image...</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full">
			{/* Left Sidebar */}
			<div
				className="w-64 flex flex-col"
				style={{ background: "#252526", borderRight: "1px solid #3e3e42" }}
			>
				{/* Header */}
				<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
					{isEditingName ? (
						<input
							type="text"
							value={editedName}
							onChange={(e) => setEditedName(e.target.value)}
							onBlur={handleNameSave}
							onKeyDown={handleNameKeyDown}
							className="w-full px-2 py-1 text-sm font-medium rounded focus:outline-none"
							style={{
								background: "#3e3e42",
								color: "#cccccc",
								border: "1px solid #1177bb",
							}}
							spellCheck={false}
						/>
					) : (
						<div
							className="text-sm font-medium cursor-pointer px-2 py-1 rounded transition-colors"
							style={{ color: "#cccccc" }}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "#3e3e42";
								e.currentTarget.style.color = "#ffffff";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
								e.currentTarget.style.color = "#cccccc";
							}}
							onClick={handleNameClick}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleNameClick();
								}
							}}
							role="button"
							tabIndex={0}
							title="Click to edit name"
						>
							{tilesetData.name}
						</div>
					)}
				</div>

				{/* Settings */}
				<div className="flex-1 overflow-auto p-4">
					<div className="space-y-4">
						{/* Tileset Properties */}
						<div>
							<div
								className="text-xs font-semibold uppercase tracking-wide mb-2"
								style={{ color: "#858585" }}
							>
								Tileset Properties
							</div>
							<div className="space-y-2">
								<div className="grid grid-cols-2 gap-2">
									<div>
										<div
											className="text-xs block mb-1"
											style={{ color: "#858585" }}
										>
											Tile Width
										</div>
										<DragNumberInput
											value={localTileWidth}
											onChange={(value) => {
												setLocalTilesetState({
													...localTilesetState,
													tileWidth: Math.round(value),
												});
											}}
											onInput={(value) => {
												setLocalTilesetState({
													...localTilesetState,
													tileWidth: Math.round(value),
												});
											}}
											onDragStart={startBatch}
											onDragEnd={endBatch}
											min={1}
											step={1}
											precision={0}
											dragSpeed={1}
										/>
									</div>
									<div>
										<div
											className="text-xs block mb-1"
											style={{ color: "#858585" }}
										>
											Tile Height
										</div>
										<DragNumberInput
											value={localTileHeight}
											onChange={(value) => {
												setLocalTilesetState({
													...localTilesetState,
													tileHeight: Math.round(value),
												});
											}}
											onInput={(value) => {
												setLocalTilesetState({
													...localTilesetState,
													tileHeight: Math.round(value),
												});
											}}
											onDragStart={startBatch}
											onDragEnd={endBatch}
											min={1}
											step={1}
											precision={0}
											dragSpeed={1}
										/>
									</div>
								</div>
							</div>
						</div>

						{/* Terrain Layers */}
						<div className="mt-4">
							<div className="flex items-center justify-between mb-2">
								<div
									className="text-xs font-semibold uppercase tracking-wide"
									style={{ color: "#858585" }}
								>
									Terrain Layers
								</div>
								<button
									type="button"
									onClick={handleAddTerrainLayer}
									className="px-2 py-1 text-xs rounded transition-colors"
									style={{ background: "#0e639c", color: "#ffffff" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#1177bb";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "#0e639c";
									}}
								>
									+ Add Layer
								</button>
							</div>

							<div
								className="text-[10px] mb-3 px-1"
								style={{ color: "#858585" }}
							>
								Click to select, right-click for options
							</div>

							<div
								className="space-y-0 rounded overflow-hidden"
								style={{
									border: "1px solid #454545",
									background: "#3e3e42",
								}}
							>
								{getTerrainLayers().map((layer, index) => (
									<div
										key={layer.id}
										className="transition-all cursor-pointer relative"
										style={{
											background:
												selectedTerrainLayer === layer.id
													? "#0e639c"
													: "transparent",
											borderBottom:
												index < getTerrainLayers().length - 1
													? "1px solid #555555"
													: "none",
										}}
										onClick={() => {
											if (editingTerrainLayerId !== layer.id) {
												setSelectedTerrainLayer(
													selectedTerrainLayer === layer.id ? null : layer.id,
												);
											}
										}}
										onContextMenu={(e) =>
											handleTerrainLayerContextMenu(e, layer.id)
										}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												if (editingTerrainLayerId !== layer.id) {
													setSelectedTerrainLayer(
														selectedTerrainLayer === layer.id ? null : layer.id,
													);
												}
											}
										}}
										role="button"
										tabIndex={0}
										aria-label={`Terrain layer: ${layer.name}`}
									>
										<div
											className="flex items-center justify-between"
											style={{
												padding:
													editingTerrainLayerId === layer.id
														? "0"
														: "0.5rem 0.75rem",
											}}
										>
											{editingTerrainLayerId === layer.id ? (
												<input
													ref={terrainLayerInputRef}
													type="text"
													value={editingTerrainLayerName}
													onChange={(e) =>
														setEditingTerrainLayerName(e.target.value)
													}
													onBlur={() => {
														if (editingTerrainLayerName.trim()) {
															handleUpdateTerrainLayer({
																...layer,
																name: editingTerrainLayerName.trim(),
															});
														}
														setEditingTerrainLayerId(null);
													}}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															if (editingTerrainLayerName.trim()) {
																handleUpdateTerrainLayer({
																	...layer,
																	name: editingTerrainLayerName.trim(),
																});
															}
															setEditingTerrainLayerId(null);
														} else if (e.key === "Escape") {
															setEditingTerrainLayerId(null);
														}
													}}
													onClick={(e) => e.stopPropagation()}
													className="flex-1 text-xs focus:outline-none"
													style={{
														background: "transparent",
														color: "#cccccc",
														border: "none",
														padding: "0.5rem 0.75rem",
													}}
													spellCheck={false}
												/>
											) : (
												<div className="flex items-center gap-2 flex-1 min-w-0">
													{selectedTerrainLayer === layer.id && (
														<div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
													)}
													<span
														className="text-xs truncate"
														style={{
															color:
																selectedTerrainLayer === layer.id
																	? "#ffffff"
																	: "#cccccc",
														}}
													>
														{layer.name}
													</span>
												</div>
											)}
										</div>
									</div>
								))}

								{getTerrainLayers().length === 0 && (
									<div
										className="text-xs text-center py-4 rounded"
										style={{ background: "#2d2d2d", color: "#858585" }}
									>
										No terrain layers. Click "Add Layer" to create one.
									</div>
								)}
							</div>
						</div>

						{/* Tile Properties moved to right sidebar */}
						{false && selectedCompoundTileId && (
							<div
								className="mt-6 pt-4"
								style={{ borderTop: "1px solid #3e3e42" }}
							>
								<div
									className="text-xs font-semibold uppercase tracking-wide mb-2"
									style={{ color: "#858585" }}
								>
									Tile Properties
								</div>
								<div className="space-y-3">
									{/* Only show origin for compound tiles */}
									{selectedTile?.isCompound && (
										<div>
											<div
												className="text-xs font-medium block mb-1.5"
												style={{ color: "#858585" }}
											>
												Origin (normalized 0-1)
											</div>
											<div className="grid grid-cols-2 gap-2">
												<div>
													<input
														type="number"
														value={selectedTile?.origin.x ?? 0}
														onChange={(e) => {
															const value = parseFloat(e.target.value) || 0;
															const clamped = Math.max(0, Math.min(1, value));
															handleUpdateTileOrigin(
																clamped,
																selectedTile?.origin.y ?? 0,
															);
														}}
														step="0.1"
														min="0"
														max="1"
														className="w-full px-2 py-1.5 rounded focus:outline-none text-xs"
														style={{
															background: "#3e3e42",
															color: "#cccccc",
															border: "1px solid #555",
															fontSize: "13px",
														}}
														spellCheck={false}
													/>
													<div
														className="text-[10px] mt-0.5"
														style={{ color: "#858585" }}
													>
														X
													</div>
												</div>
												<div>
													<input
														type="number"
														value={selectedTile?.origin.y ?? 0}
														onChange={(e) => {
															const value = parseFloat(e.target.value) || 0;
															const clamped = Math.max(0, Math.min(1, value));
															handleUpdateTileOrigin(
																selectedTile?.origin.x ?? 0,
																clamped,
															);
														}}
														step="0.1"
														min="0"
														max="1"
														className="w-full px-2 py-1.5 rounded focus:outline-none text-xs"
														style={{
															background: "#3e3e42",
															color: "#cccccc",
															border: "1px solid #555",
															fontSize: "13px",
														}}
														spellCheck={false}
													/>
													<div
														className="text-[10px] mt-0.5"
														style={{ color: "#858585" }}
													>
														Y
													</div>
												</div>
											</div>
											<div
												className="mt-1 text-[10px]"
												style={{ color: "#858585" }}
											>
												Quick:
												<button
													type="button"
													onClick={() => handleUpdateTileOrigin(0, 0)}
													className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Top-Left
												</button>
												<button
													type="button"
													onClick={() => handleUpdateTileOrigin(0.5, 0)}
													className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Top-Center
												</button>
												<button
													type="button"
													onClick={() => handleUpdateTileOrigin(0, 1)}
													className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Bottom-Left
												</button>
												<button
													type="button"
													onClick={() => handleUpdateTileOrigin(0.5, 1)}
													className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Bottom-Center
												</button>
												<button
													type="button"
													onClick={() => handleUpdateTileOrigin(0.5, 0.5)}
													className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Center
												</button>
											</div>
										</div>
									)}
									<div>
										<div
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Name
										</div>
										<input
											type="text"
											value={selectedTile?.name || ""}
											onChange={(e) => {
												handleUpdateTileName(e.target.value);
											}}
											placeholder="Enter tile name..."
											className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #3e3e42",
											}}
											spellCheck={false}
										/>
									</div>
									<div>
										<div
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Type
										</div>
										<input
											type="text"
											value={selectedTile?.type || ""}
											onChange={(e) => {
												handleUpdateTileType(e.target.value);
											}}
											placeholder="Enter tile type..."
											className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #3e3e42",
											}}
											spellCheck={false}
										/>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Center - Canvas Area */}
			<div
				ref={zoomPanContainerRef}
				className="flex-1 overflow-hidden bg-gray-900 relative"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onContextMenu={handleContextMenu}
				role="region"
				aria-label="Tileset canvas"
				style={{
					cursor: isDragging ? "grabbing" : "crosshair",
				}}
			>
				{tilesetData.imageData ? (
					<>
						<canvas
							ref={canvasRef}
							className="tileset-canvas"
							style={{
								width: "100%",
								height: "100%",
								imageRendering: "pixelated",
							}}
						/>
						{/* Status bar overlay */}
						<div
							className="absolute bottom-0 left-0 right-0 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300"
							style={{
								background: "rgba(37, 37, 38, 0.95)",
								borderTop: "1px solid #3e3e42",
							}}
						>
							<div className="flex items-center gap-2">
								<span className="text-gray-500">Image:</span>
								<span className="font-mono">
									{tilesetData.imageData?.width || 0}×
									{tilesetData.imageData?.height || 0}
								</span>
							</div>
							<div className="w-px h-4 bg-gray-700" />
							<div className="flex items-center gap-2">
								<span className="text-gray-500">Compound Tiles:</span>
								<span className="font-mono">
									{localTiles.filter((t) => t.width && t.height).length}
								</span>
							</div>
							{mousePos && (
								<>
									<div className="w-px h-4 bg-gray-700" />
									<div className="flex items-center gap-2">
										<span className="text-gray-500">Tile:</span>
										<span className="font-mono">
											{mousePos.tileX}, {mousePos.tileY}
										</span>
									</div>
								</>
							)}
							{selectedTileRegion && (
								<>
									<div className="w-px h-4 bg-gray-700" />
									<div className="flex items-center gap-2">
										<span className="text-gray-500">Selection:</span>
										<span className="font-mono">
											{selectedTileRegion.x}, {selectedTileRegion.y}
										</span>
										<span className="text-gray-600">•</span>
										<span className="font-mono">
											{selectedTileRegion.width}×{selectedTileRegion.height}
										</span>
									</div>
								</>
							)}
							<div className="flex-1" />
							<div className="flex items-center gap-2">
								<span className="text-gray-500">Zoom:</span>
								<span className="font-mono">{Math.round(scale * 100)}%</span>
							</div>
						</div>
					</>
				) : (
					<div className="absolute inset-0 flex items-center justify-center text-gray-400 text-center">
						No tileset image loaded
					</div>
				)}
			</div>

			{/* Right Sidebar - Tile Properties */}
			{selectedCompoundTileId !== null && (
				<div
					className="w-64 flex flex-col overflow-auto"
					style={{ background: "#252526", borderLeft: "1px solid #3e3e42" }}
				>
					<div className="p-4">
						<div
							className="text-xs font-semibold uppercase tracking-wide mb-3"
							style={{ color: "#858585" }}
						>
							Tile Properties
						</div>
						<div className="space-y-3">
							<div>
								<div
									className="text-xs font-medium block mb-1.5"
									style={{ color: "#858585" }}
								>
									Name
								</div>
								<input
									type="text"
									value={selectedTile?.name || ""}
									onChange={(e) => {
										handleUpdateTileName(e.target.value);
									}}
									placeholder="Enter tile name..."
									className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
									style={{
										background: "#3e3e42",
										color: "#cccccc",
										border: "1px solid #3e3e42",
									}}
									spellCheck={false}
								/>
							</div>
							<div>
								<div
									className="text-xs font-medium block mb-1.5"
									style={{ color: "#858585" }}
								>
									Type
								</div>
								<input
									type="text"
									value={selectedTile?.type || ""}
									onChange={(e) => {
										handleUpdateTileType(e.target.value);
									}}
									placeholder="Enter tile type..."
									className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
									style={{
										background: "#3e3e42",
										color: "#cccccc",
										border: "1px solid #3e3e42",
									}}
									spellCheck={false}
								/>
							</div>
							{/* Only show origin for compound tiles */}
							{selectedTile?.isCompound && (
								<div>
									<div
										className="text-xs font-medium block mb-1.5"
										style={{ color: "#858585" }}
									>
										Origin
									</div>
									<div className="grid grid-cols-2 gap-2">
										<div className="flex">
											<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
												X
											</div>
											<div className="flex-1">
												<DragNumberInput
													value={selectedTile?.origin.x ?? 0}
													onChange={(value) => {
														const clamped = Math.max(0, Math.min(1, value));
														handleUpdateTileOrigin(
															clamped,
															selectedTile?.origin.y ?? 0,
														);
													}}
													onInput={(value) => {
														const clamped = Math.max(0, Math.min(1, value));
														handleUpdateTileOrigin(
															clamped,
															selectedTile?.origin.y ?? 0,
														);
													}}
													onDragStart={startBatch}
													onDragEnd={endBatch}
													step={0.1}
													min={0}
													max={1}
													precision={2}
													dragSpeed={0.01}
													roundedLeft={false}
												/>
											</div>
										</div>
										<div className="flex">
											<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
												Y
											</div>
											<div className="flex-1">
												<DragNumberInput
													value={selectedTile?.origin.y ?? 0}
													onChange={(value) => {
														const clamped = Math.max(0, Math.min(1, value));
														handleUpdateTileOrigin(
															selectedTile?.origin.x ?? 0,
															clamped,
														);
													}}
													onInput={(value) => {
														const clamped = Math.max(0, Math.min(1, value));
														handleUpdateTileOrigin(
															selectedTile?.origin.x ?? 0,
															clamped,
														);
													}}
													onDragStart={startBatch}
													onDragEnd={endBatch}
													step={0.1}
													min={0}
													max={1}
													precision={2}
													dragSpeed={0.01}
													roundedLeft={false}
												/>
											</div>
										</div>
									</div>
								</div>
							)}
							{/* Custom Properties Section */}
							{selectedTile && (
								<CustomPropertiesEditor
									properties={selectedTile.properties}
									onChange={handlePropertiesChange}
								/>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Context Menu */}
			{contextMenu && !contextMenu.terrainLayerId && (
				<>
					{/* Backdrop to close menu */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setContextMenu(null)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.preventDefault();
								setContextMenu(null);
							}
						}}
						role="button"
						tabIndex={0}
						aria-label="Close context menu"
					/>
					{/* Menu */}
					<div
						className="fixed z-50 min-w-[200px] py-1 rounded shadow-lg"
						style={{
							left: `${contextMenu.x}px`,
							top: `${contextMenu.y}px`,
							background: "#252526",
							border: "1px solid #3e3e42",
						}}
					>
						{contextMenu.compoundTileId !== undefined ? (
							// Show options when right-clicking on compound tile
							<>
								<div
									onClick={handleAddCollider}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleAddCollider();
										}
									}}
									role="button"
									tabIndex={0}
									aria-label="Add or edit collider"
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#3e3e42";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									<ShieldIcon size={16} />
									<span>Add/Edit Collider</span>
								</div>
								<div
									onClick={handleDeleteCompoundTile}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleDeleteCompoundTile();
										}
									}}
									role="button"
									tabIndex={0}
									aria-label="Delete compound tile"
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#f48771" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#3e3e42";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									<TrashIcon size={16} />
									<span>Delete Compound Tile</span>
								</div>
							</>
						) : selectedTileRegion &&
							selectedTileRegion.width === 1 &&
							selectedTileRegion.height === 1 ? (
							// Single tile selection - show collider option only
							<>
								<div
									onClick={handleAddCollider}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleAddCollider();
										}
									}}
									role="button"
									tabIndex={0}
									aria-label="Add or edit collider"
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#3e3e42";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									<ShieldIcon size={16} />
									<span>Add/Edit Collider</span>
								</div>
								<div
									onClick={handleClearSelection}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleClearSelection();
										}
									}}
									role="button"
									tabIndex={0}
									aria-label="Clear selection"
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#3e3e42";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									<span>✕</span>
									<span>Clear Selection</span>
								</div>
							</>
						) : (
							// Multi-tile selection - show create compound tile option
							<>
								<div
									onClick={handleMarkAsCompoundTile}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleMarkAsCompoundTile();
										}
									}}
									role="button"
									tabIndex={0}
									aria-label="Mark as compound tile"
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#3e3e42";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									<span>✓</span>
									<span>Mark as Compound Tile</span>
								</div>
								<div
									onClick={handleClearSelection}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleClearSelection();
										}
									}}
									role="button"
									tabIndex={0}
									aria-label="Clear selection"
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "#3e3e42";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent";
									}}
								>
									<span>✕</span>
									<span>Clear Selection</span>
								</div>
							</>
						)}
					</div>
				</>
			)}

			{/* Terrain Layer Context Menu */}
			{contextMenu?.terrainLayerId && (
				<>
					{/* Backdrop to close menu */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setContextMenu(null)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.preventDefault();
								setContextMenu(null);
							}
						}}
						role="button"
						tabIndex={0}
						aria-label="Close context menu"
					/>
					{/* Menu */}
					<div
						className="fixed z-50 min-w-[160px] py-1 rounded shadow-lg"
						style={{
							left: `${contextMenu.x}px`,
							top: `${contextMenu.y}px`,
							background: "#252526",
							border: "1px solid #3e3e42",
						}}
					>
						{/* Rename */}
						<div
							onClick={handleRenameTerrainLayer}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleRenameTerrainLayer();
								}
							}}
							className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
							style={{ color: "#cccccc" }}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "#3e3e42";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
							role="menuitem"
							tabIndex={0}
						>
							<PencilIcon size={16} />
							<span>Rename</span>
						</div>

						{/* Delete */}
						<div
							onClick={handleDeleteTerrainLayerFromMenu}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleDeleteTerrainLayerFromMenu();
								}
							}}
							className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
							style={{ color: "#f48771" }}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "#3e3e42";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
							role="menuitem"
							tabIndex={0}
						>
							<TrashIcon size={16} />
							<span>Delete</span>
						</div>
					</div>
				</>
			)}
		</div>
	);
};
