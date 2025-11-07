import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { TilesetTab, TerrainLayer } from "../types";
import { useRegisterUndoRedo } from "../context/UndoRedoContext";
import { useUndoableReducer } from "../hooks/useUndoableReducer";
import { ShieldIcon, TrashIcon } from "./Icons";
import { packTileId, unpackTileId } from "../utils/tileId";
import { DragNumberInput } from "./DragNumberInput";
import { calculateMenuPosition } from "../utils/menuPositioning";

interface TilesetEditorViewProps {
	tab: TilesetTab;
}

export const TilesetEditorView = ({ tab }: TilesetEditorViewProps) => {
	const {
		updateTabData,
		updateTileset,
		getTilesetById,
		getActiveMapTab,
		setSelectedTilesetId,
		setSelectedTileId,
		openCollisionEditor,
	} = useEditor();
	const { viewState } = tab;

	// Look up the tileset data by ID
	const tilesetData = getTilesetById(tab.tilesetId);

	// If tileset not found, show error
	if (!tilesetData) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-red-400">Tileset not found: {tab.tilesetId}</div>
			</div>
		);
	}

	// If image not loaded, show loading message
	if (!tilesetData.imageData) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-gray-400">Loading tileset image...</div>
			</div>
		);
	}

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [pan, setPan] = useState({ x: 0, y: 0 });
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
		compoundTileId?: string; // Track if we're on a compound tile
	} | null>(null);
	const [mousePos, setMousePos] = useState<{
		tileX: number;
		tileY: number;
	} | null>(null);
	const [isEditingName, setIsEditingName] = useState(false);
	const [editedName, setEditedName] = useState(tilesetData.name);
	const [selectedCompoundTileId, setSelectedCompoundTileId] = useState<
		number | null
	>(null);
	const [isEditingTileName, setIsEditingTileName] = useState(false);
	const [isEditingTileType, setIsEditingTileType] = useState(false);
	const [selectedTerrainLayer, setSelectedTerrainLayer] = useState<
		string | null
	>(null);
	const [isPaintingBitmask, setIsPaintingBitmask] = useState(false);
	const [paintAction, setPaintAction] = useState<"set" | "clear">("set");
	const [editingTerrainLayerId, setEditingTerrainLayerId] = useState<
		string | null
	>(null);
	const [editingTerrainLayerName, setEditingTerrainLayerName] = useState("");
	const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(
		null,
	);
	const [editingPropertyValue, setEditingPropertyValue] = useState<
		string | null
	>(null);

	// Unified undo/redo state for the entire tileset (tiles + terrainLayers)
	// This ensures all operations share a single chronological history
	type TilesetUndoState = {
		tiles: typeof tilesetData.tiles;
		terrainLayers: TerrainLayer[];
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
		},
	] = useUndoableReducer<TilesetUndoState>({
		tiles: tilesetData.tiles || [],
		terrainLayers: tilesetData.terrainLayers || [],
	});

	// Extract individual parts for convenience
	const localTiles = localTilesetState.tiles;
	const localTerrainLayers = localTilesetState.terrainLayers;

	// Register unified undo/redo keyboard shortcuts
	useRegisterUndoRedo({ undo, redo, canUndo, canRedo });

	// Refs to track current pan and zoom values for wheel event
	const panRef = useRef(pan);
	const scaleRef = useRef(viewState.scale);

	useEffect(() => {
		panRef.current = pan;
		scaleRef.current = viewState.scale;
	}, [pan, viewState.scale]);

	// Reset undo history when switching to a different tileset
	const prevTilesetIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (
			prevTilesetIdRef.current !== null &&
			prevTilesetIdRef.current !== tilesetData.id
		) {
			// Switching to a different tileset, reset unified history
			resetTilesetHistory({
				tiles: tilesetData.tiles || [],
				terrainLayers: tilesetData.terrainLayers || [],
			});
		}
		prevTilesetIdRef.current = tilesetData.id;
	}, [
		tilesetData.id,
		tilesetData.terrainLayers,
		tilesetData.tiles,
		resetTilesetHistory,
	]);

	// Track if this is the first run to avoid marking dirty on initial mount
	const isFirstRun = useRef(true);

	// One-way sync: local tileset state → global context
	// This updates the global state whenever local state changes (from any operation or undo/redo)
	useEffect(() => {
		updateTileset(tab.tilesetId, {
			tiles: localTiles,
			terrainLayers: localTerrainLayers,
		});

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
	}, [localTilesetState, tab.tilesetId, tab.id, updateTileset, updateTabData]);

	// Memoized tile position map for O(1) lookups
	const tilePositionMap = useMemo(() => {
		const map = new Map<string, (typeof localTiles)[0]>();
		for (const tile of localTiles) {
			if (tile.width && tile.height) {
				map.set(`${tile.x},${tile.y}`, tile);
			}
		}
		return map;
	}, [localTiles]);

	// Draw tileset image on canvas
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container || !tilesetData.imageData) return;

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
			ctx.scale(viewState.scale, viewState.scale);

			if (tilesetData.imageData === undefined) return;

			// Draw the tileset image
			ctx.drawImage(tilesetData.imageData, 0, 0);

			// Draw grid overlay (skip segments inside compound tiles)
			ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
			ctx.lineWidth = 1 / viewState.scale;

			// Draw vertical lines
			for (
				let x = 0;
				x <= tilesetData.imageData.width;
				x += tilesetData.tileWidth
			) {
				// Find all compound tiles that intersect this vertical line
				const intersectingTiles = localTiles
					.filter((tile) => {
						if (!tile.width || !tile.height) return false; // Not a compound tile
						const tileWidth = tile.width || tilesetData.tileWidth;
						return x > tile.x && x < tile.x + tileWidth;
					})
					.sort((a, b) => a.y - b.y); // Sort by Y position

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
						const tileHeight = tile.height || tilesetData.tileHeight;
						// Draw from currentY to top of tile
						if (currentY < tile.y) {
							ctx.beginPath();
							ctx.moveTo(x, currentY);
							ctx.lineTo(x, tile.y);
							ctx.stroke();
						}
						currentY = Math.max(currentY, tile.y + tileHeight);
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
						if (!tile.width || !tile.height) return false; // Not a compound tile
						const tileHeight = tile.height || tilesetData.tileHeight;
						return y > tile.y && y < tile.y + tileHeight;
					})
					.sort((a, b) => a.x - b.x); // Sort by X position

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
						const tileWidth = tile.width || tilesetData.tileWidth;
						// Draw from currentX to left of tile
						if (currentX < tile.x) {
							ctx.beginPath();
							ctx.moveTo(currentX, y);
							ctx.lineTo(tile.x, y);
							ctx.stroke();
						}
						currentX = Math.max(currentX, tile.x + tileWidth);
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
			ctx.lineWidth = 2 / viewState.scale;
			for (const tile of tilesetData.tiles) {
				// Check the isCompound flag
				if (tile.isCompound) {
					// This is a compound tile
					const tileWidth = tile.width!;
					const tileHeight = tile.height!;

					// Draw border around it
					ctx.strokeRect(tile.x, tile.y, tileWidth, tileHeight);

					// Draw origin marker if this tile is selected
					if (tile.id === selectedCompoundTileId && tile.origin) {
						const originX = tile.x + tile.origin.x * tileWidth;
						const originY = tile.y + tile.origin.y * tileHeight;
						const markerSize = 8 / viewState.scale;

						ctx.save();
						// Draw crosshair
						ctx.strokeStyle = "rgba(255, 165, 0, 1)"; // Orange
						ctx.lineWidth = 2 / viewState.scale;
						ctx.beginPath();
						ctx.moveTo(originX - markerSize, originY);
						ctx.lineTo(originX + markerSize, originY);
						ctx.moveTo(originX, originY - markerSize);
						ctx.lineTo(originX, originY + markerSize);
						ctx.stroke();

						// Draw center dot
						ctx.fillStyle = "rgba(255, 165, 0, 1)";
						ctx.beginPath();
						ctx.arc(originX, originY, 3 / viewState.scale, 0, Math.PI * 2);
						ctx.fill();
						ctx.restore();
					}

					// Optionally draw tile name
					if (tile.name) {
						ctx.save();
						ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
						ctx.font = `${Math.max(10, 12 / viewState.scale)}px sans-serif`;
						const metrics = ctx.measureText(tile.name);
						const padding = 4 / viewState.scale;
						const textX = tile.x + padding;
						const textY = tile.y + 12 / viewState.scale + padding;

						// Draw background for text
						ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
						ctx.fillRect(
							textX - padding,
							textY - 12 / viewState.scale,
							metrics.width + padding * 2,
							14 / viewState.scale,
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
			ctx.lineWidth = 2 / viewState.scale;
			for (const tile of tilesetData.tiles) {
				if (!tile.colliders) continue;

				for (const collider of tile.colliders) {
					if (collider.points.length > 2) {
						ctx.save();
						ctx.translate(tile.x, tile.y);

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
			if (viewState.selectedTileRegion) {
				const { x, y, width, height } = viewState.selectedTileRegion;
				ctx.fillStyle = "rgba(100, 150, 255, 0.3)";
				ctx.fillRect(
					x * tilesetData.tileWidth,
					y * tilesetData.tileHeight,
					width * tilesetData.tileWidth,
					height * tilesetData.tileHeight,
				);
				ctx.strokeStyle = "rgba(100, 150, 255, 0.8)";
				ctx.lineWidth = 2 / viewState.scale;
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
					const viewportLeft = -pan.x / viewState.scale;
					const viewportTop = -pan.y / viewState.scale;
					const viewportRight = viewportLeft + canvas.width / viewState.scale;
					const viewportBottom = viewportTop + canvas.height / viewState.scale;

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
								0  // tileset index
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
					ctx.lineWidth = 1 / viewState.scale;
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
		viewState.selectedTileRegion,
		pan,
		viewState.scale,
		selectedTerrainLayer,
		localTerrainLayers,
		selectedCompoundTileId,
		localTiles,
	]);

	// Setup wheel event listener for zoom and pan
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();

			if (e.ctrlKey) {
				// Zoom towards mouse position
				const rect = container.getBoundingClientRect();
				const mouseX = e.clientX - rect.left;
				const mouseY = e.clientY - rect.top;

				// Calculate world position at mouse before zoom
				const worldX = (mouseX - panRef.current.x) / scaleRef.current;
				const worldY = (mouseY - panRef.current.y) / scaleRef.current;

				// Calculate new scale
				const delta = -e.deltaY * 0.01;
				const newScale = Math.max(0.5, Math.min(8, scaleRef.current + delta));

				// Adjust pan to keep world position under mouse
				const newPanX = mouseX - worldX * newScale;
				const newPanY = mouseY - worldY * newScale;

				setPan({ x: newPanX, y: newPanY });
				updateTabData(tab.id, {
					viewState: { ...viewState, scale: newScale },
				});
			} else {
				// Wheel = Pan
				setPan({
					x: panRef.current.x - e.deltaX,
					y: panRef.current.y - e.deltaY,
				});
			}
		};

		container.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			container.removeEventListener("wheel", handleWheel);
		};
	}, [tab.id, viewState, updateTabData]);

	// Helper to convert screen coordinates to canvas coordinates
	const screenToCanvas = (screenX: number, screenY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return { canvasX: 0, canvasY: 0 };

		const rect = canvas.getBoundingClientRect();
		const x = screenX - rect.left;
		const y = screenY - rect.top;

		// Account for pan and zoom transforms
		const canvasX = (x - pan.x) / viewState.scale;
		const canvasY = (y - pan.y) / viewState.scale;

		return { canvasX, canvasY };
	};

	// Helper to convert canvas coordinates to tile coordinates
	const canvasToTile = (canvasX: number, canvasY: number) => {
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
			0 // tileset index
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
				0 // tileset index
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
			const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY);

			// Check if click is within the tileset image bounds
			if (
				canvasX < 0 ||
				canvasY < 0 ||
				canvasX >= tilesetData.imageData!.width ||
				canvasY >= tilesetData.imageData!.height
			) {
				// Clicked outside the tileset, clear selection
				updateTabData(tab.id, {
					viewState: {
						...viewState,
						selectedTileRegion: null,
					},
				});
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
					const tileRight = tile.x + (tile.width || tilesetData.tileWidth);
					const tileBottom = tile.y + (tile.height || tilesetData.tileHeight);

					if (
						canvasX >= tile.x &&
						canvasX < tileRight &&
						canvasY >= tile.y &&
						canvasY < tileBottom
					) {
						// Clicked on this compound tile, select its entire region
						const regionX = Math.floor(tile.x / tilesetData.tileWidth);
						const regionY = Math.floor(tile.y / tilesetData.tileHeight);
						const regionWidth = Math.ceil(
							(tile.width || tilesetData.tileWidth) / tilesetData.tileWidth,
						);
						const regionHeight = Math.ceil(
							(tile.height || tilesetData.tileHeight) / tilesetData.tileHeight,
						);

						updateTabData(tab.id, {
							viewState: {
								...viewState,
								selectedTileRegion: {
									x: regionX,
									y: regionY,
									width: regionWidth,
									height: regionHeight,
								},
							},
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
				const existingTile = localTiles.find(
					(t) => t.x === tilePosX && t.y === tilePosY && !t.width && !t.height,
				);

				if (existingTile) {
					setSelectedCompoundTileId(existingTile.id);
				} else {
					// No tile entry exists yet, generate an ID for potential property editing
					// Use 0 for tileset index - will be replaced when placed on map
					const tileId = packTileId(
						tilePosX,
						tilePosY,
						0 // tileset index
					);
					setSelectedCompoundTileId(tileId);
				}

				// Set initial single-tile selection
				updateTabData(tab.id, {
					viewState: {
						...viewState,
						selectedTileRegion: { x: tileX, y: tileY, width: 1, height: 1 },
					},
				});
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

			updateTabData(tab.id, {
				viewState: {
					...viewState,
					selectedTileRegion: { x, y, width, height },
				},
			});
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
		let clickedCompoundTile: string | undefined;

		for (const tile of localTiles) {
			if (tile.width && tile.height) {
				const tileRight = tile.x + tile.width;
				const tileBottom = tile.y + tile.height;

				if (
					canvasX >= tile.x &&
					canvasX < tileRight &&
					canvasY >= tile.y &&
					canvasY < tileBottom
				) {
					clickedCompoundTile = tile.id;
					break;
				}
			}
		}

		// If we clicked on a compound tile, show delete option
		// Otherwise, only allow right-click if there's a selection for creating compound tile
		if (clickedCompoundTile || viewState.selectedTileRegion) {
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

		if (!viewState.selectedTileRegion) return;

		const { x, y, width, height } = viewState.selectedTileRegion;

		// Create new tile definition - mark as compound tile
		const tileX = x * tilesetData.tileWidth;
		const tileY = y * tilesetData.tileHeight;
		const tileWidth = width * tilesetData.tileWidth;
		const tileHeight = height * tilesetData.tileHeight;
		const newTile = {
			id: packTileId(tileX, tileY, 0), // tileset index=0 (compound tile)
			x: tileX,
			y: tileY,
			isCompound: true,
			width: tileWidth,
			height: tileHeight,
		};

		// Update unified state with undo/redo support
		setLocalTilesetState({
			tiles: [...localTiles, newTile],
			terrainLayers: localTerrainLayers,
		});
	};

	const handleDeleteCompoundTile = () => {
		setContextMenu(null);

		if (!contextMenu?.compoundTileId) return;

		// Update unified state with undo/redo support
		setLocalTilesetState({
			tiles: localTiles.filter((t) => t.id !== contextMenu.compoundTileId),
			terrainLayers: localTerrainLayers,
		});
	};

	const handleClearSelection = () => {
		setContextMenu(null);
		updateTabData(tab.id, {
			viewState: { ...viewState, selectedTileRegion: null },
		});
	};

	const handleNameClick = () => {
		setIsEditingName(true);
		setEditedName(tilesetData.name);
	};

	const handleNameSave = () => {
		if (editedName.trim() && editedName !== tilesetData.name) {
			updateTileset(tab.tilesetId, { name: editedName.trim() });
			updateTabData(tab.id, { title: editedName.trim(), isDirty: true });
		}
		setIsEditingName(false);
	};

	const handleNameKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleNameSave();
		} else if (e.key === "Escape") {
			setIsEditingName(false);
			setEditedName(tilesetData.name);
		}
	};

	const handleAddCollider = () => {
		setContextMenu(null);

		if (!contextMenu?.compoundTileId) return;

		// Open collision editor tab for this compound tile
		openCollisionEditor("tile", tilesetData.id, contextMenu.compoundTileId);
	};

	const handleUpdateTileName = (name: string) => {
		if (!selectedCompoundTileId) return;

		const existingTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (existingTile) {
			// Update existing tile with undo/redo support
			setLocalTilesetState({
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId ? { ...t, name } : t,
				),
				terrainLayers: localTerrainLayers,
			});
		} else {
			// Create new tile entry from packed ID with undo/redo support
			const geometry = unpackTileId(selectedCompoundTileId);
			const newTile = {
				id: selectedCompoundTileId,
				x: geometry.x,
				y: geometry.y,
				name,
			};
			setLocalTilesetState({
				tiles: [...localTiles, newTile],
				terrainLayers: localTerrainLayers,
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
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId ? { ...t, type } : t,
				),
				terrainLayers: localTerrainLayers,
			});
		} else {
			// Create new tile entry from packed ID with undo/redo support
			const geometry = unpackTileId(selectedCompoundTileId);
			const newTile = {
				id: selectedCompoundTileId,
				x: geometry.x,
				y: geometry.y,
				type,
			};
			setLocalTilesetState({
				tiles: [...localTiles, newTile],
				terrainLayers: localTerrainLayers,
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
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId ? { ...t, origin: { x, y } } : t,
				),
				terrainLayers: localTerrainLayers,
			});
		} else {
			// Create new tile entry from packed ID with undo/redo support
			const geometry = unpackTileId(selectedCompoundTileId);
			const newTile = {
				id: selectedCompoundTileId,
				x: geometry.x,
				y: geometry.y,
				origin: { x, y },
			};
			setLocalTilesetState({
				tiles: [...localTiles, newTile],
				terrainLayers: localTerrainLayers,
			});
		}
	};

	// Add new property
	const handleAddProperty = () => {
		if (!selectedCompoundTileId) return;

		// Generate a unique temporary key for the new property
		const newKey = `__temp_${Date.now()}`;

		const selectedTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (selectedTile) {
			const updatedProperties = {
				...(selectedTile.properties || {}),
				[newKey]: "",
			};

			setLocalTilesetState({
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId
						? { ...t, properties: updatedProperties }
						: t,
				),
				terrainLayers: localTerrainLayers,
			});

			setEditingPropertyKey(newKey);
		}
	};

	// Delete property
	const handleDeleteProperty = (key: string) => {
		if (!selectedCompoundTileId) return;

		const selectedTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (selectedTile && selectedTile.properties) {
			const updatedProperties = { ...selectedTile.properties };
			delete updatedProperties[key];

			setLocalTilesetState({
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId
						? { ...t, properties: updatedProperties }
						: t,
				),
				terrainLayers: localTerrainLayers,
			});
		}
	};

	// Update property key (rename)
	const handleUpdatePropertyKey = (oldKey: string, newKey: string) => {
		if (!selectedCompoundTileId) return;

		// If empty key, delete the property
		if (!newKey.trim()) {
			handleDeleteProperty(oldKey);
			setEditingPropertyKey(null);
			return;
		}

		if (oldKey === newKey) return;

		const selectedTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (selectedTile && selectedTile.properties) {
			// Check if new key already exists
			if (selectedTile.properties[newKey] && newKey !== oldKey) {
				return; // Don't allow duplicate keys
			}

			const updatedProperties = { ...selectedTile.properties };
			const value = updatedProperties[oldKey];
			delete updatedProperties[oldKey];
			updatedProperties[newKey] = value;

			setLocalTilesetState({
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId
						? { ...t, properties: updatedProperties }
						: t,
				),
				terrainLayers: localTerrainLayers,
			});
		}
	};

	// Update property value
	const handleUpdatePropertyValue = (key: string, value: string) => {
		if (!selectedCompoundTileId) return;

		const selectedTile = localTiles.find(
			(t) => t.id === selectedCompoundTileId,
		);

		if (selectedTile) {
			const updatedProperties = {
				...(selectedTile.properties || {}),
				[key]: value,
			};

			setLocalTilesetState({
				tiles: localTiles.map((t) =>
					t.id === selectedCompoundTileId
						? { ...t, properties: updatedProperties }
						: t,
				),
				terrainLayers: localTerrainLayers,
			});
		}
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

	// Helper to get terrainLayers (returns local reducer state)
	const getTerrainLayers = () => {
		return localTerrainLayers || [];
	};

	// Helper to update terrainLayers with undo/redo support
	// This is used for PAINTING operations
	const updateTerrainLayers = (layers: TerrainLayer[]) => {
		setLocalTilesetState({
			tiles: localTiles,
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
		});
		// The useEffect above syncs to global state automatically
	};

	// Terrain layer handlers (structural operations - no undo/redo)
	const handleAddTerrainLayer = () => {
		const terrainLayers = getTerrainLayers();
		const newLayer: TerrainLayer = {
			id: `terrain-${Date.now()}`,
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

	const selectedTile = localTiles.find((t) => t.id === selectedCompoundTileId);

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
							autoFocus
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
										<label
											className="text-xs block mb-1"
											style={{ color: "#858585" }}
										>
											Tile Width
										</label>
										<input
											type="number"
											value={tilesetData.tileWidth}
											onChange={(e) => {
												const value = parseInt(e.target.value) || 1;
												updateTileset(tab.tilesetId, { tileWidth: value });
												updateTabData(tab.id, { isDirty: true });
											}}
											className="w-full px-2 py-1.5 rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #555",
												fontSize: "13px",
											}}
											min="1"
										/>
									</div>
									<div>
										<label
											className="text-xs block mb-1"
											style={{ color: "#858585" }}
										>
											Tile Height
										</label>
										<input
											type="number"
											value={tilesetData.tileHeight}
											onChange={(e) => {
												const value = parseInt(e.target.value) || 1;
												updateTileset(tab.tilesetId, { tileHeight: value });
												updateTabData(tab.id, { isDirty: true });
											}}
											className="w-full px-2 py-1.5 rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #555",
												fontSize: "13px",
											}}
											min="1"
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
									onClick={handleAddTerrainLayer}
									className="px-2 py-1 text-xs rounded transition-colors"
									style={{ background: "#0e639c", color: "#ffffff" }}
									onMouseEnter={(e) =>
										(e.currentTarget.style.background = "#1177bb")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.background = "#0e639c")
									}
								>
									+ Add Layer
								</button>
							</div>

							<div
								className="text-[10px] mb-3 px-1"
								style={{ color: "#858585" }}
							>
								Click to select, double-click to rename
							</div>

							<div className="space-y-1.5">
								{getTerrainLayers().map((layer) => (
									<div
										key={layer.id}
										className="rounded transition-all cursor-pointer relative group select-none"
										style={{
											background:
												selectedTerrainLayer === layer.id
													? "#0e639c"
													: "#2d2d2d",
											border:
												"1px solid " +
												(selectedTerrainLayer === layer.id
													? "#1177bb"
													: "#3e3e42"),
											WebkitUserSelect: "none",
											MozUserSelect: "none",
											msUserSelect: "none",
											userSelect: "none",
										}}
										onMouseDown={(e) => {
											if (e.detail > 1) {
												e.preventDefault();
											}
										}}
										onClick={() => {
											if (editingTerrainLayerId !== layer.id) {
												setSelectedTerrainLayer(
													selectedTerrainLayer === layer.id ? null : layer.id,
												);
											}
										}}
										onDoubleClick={(e) => {
											e.preventDefault();
											setEditingTerrainLayerId(layer.id);
											setEditingTerrainLayerName(layer.name);
										}}
									>
										<div className="flex items-center justify-between px-2.5 py-2">
											{editingTerrainLayerId === layer.id ? (
												<input
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
													className="flex-1 px-2 py-1 text-xs rounded focus:outline-none mr-2"
													style={{
														background: "#3e3e42",
														color: "#cccccc",
														border: "1px solid #1177bb",
													}}
													autoFocus
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
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteTerrainLayer(layer.id);
												}}
												className="p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
												style={{ color: "#ef4444" }}
												title="Delete layer"
											>
												<TrashIcon />
											</button>
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
											<label
												className="text-xs font-medium block mb-1.5"
												style={{ color: "#858585" }}
											>
												Origin (normalized 0-1)
											</label>
											<div className="grid grid-cols-2 gap-2">
												<div>
													<input
														type="number"
														value={selectedTile?.origin?.x ?? 0}
														onChange={(e) => {
															const value = parseFloat(e.target.value) || 0;
															const clamped = Math.max(0, Math.min(1, value));
															handleUpdateTileOrigin(clamped, selectedTile?.origin?.y ?? 0);
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
													/>
													<div className="text-[10px] mt-0.5" style={{ color: "#858585" }}>
														X
													</div>
												</div>
												<div>
													<input
														type="number"
														value={selectedTile?.origin?.y ?? 0}
														onChange={(e) => {
															const value = parseFloat(e.target.value) || 0;
															const clamped = Math.max(0, Math.min(1, value));
															handleUpdateTileOrigin(selectedTile?.origin?.x ?? 0, clamped);
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
													/>
													<div className="text-[10px] mt-0.5" style={{ color: "#858585" }}>
														Y
													</div>
												</div>
											</div>
											<div className="mt-1 text-[10px]" style={{ color: "#858585" }}>
												Quick:
												<button
													onClick={() => handleUpdateTileOrigin(0, 0)}
													className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Top-Left
												</button>
												<button
													onClick={() => handleUpdateTileOrigin(0.5, 0)}
													className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Top-Center
												</button>
												<button
													onClick={() => handleUpdateTileOrigin(0, 1)}
													className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Bottom-Left
												</button>
												<button
													onClick={() => handleUpdateTileOrigin(0.5, 1)}
													className="ml-1 px-1.5 py-0.5 rounded text-[10px]"
													style={{ background: "#3e3e42", color: "#cccccc" }}
												>
													Bottom-Center
												</button>
												<button
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
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Name
										</label>
										{isEditingTileName ? (
											<input
												type="text"
												defaultValue={selectedTile?.name || ""}
												onBlur={(e) => {
													handleUpdateTileName(e.target.value);
													setIsEditingTileName(false);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														handleUpdateTileName(e.currentTarget.value);
														setIsEditingTileName(false);
													} else if (e.key === "Escape") {
														setIsEditingTileName(false);
													}
												}}
												className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
												style={{
													background: "#3e3e42",
													color: "#cccccc",
													border: "1px solid #1177bb",
												}}
												autoFocus
											/>
										) : (
											<div
												onClick={() => setIsEditingTileName(true)}
												className="px-2.5 py-1.5 text-xs rounded cursor-pointer transition-colors"
												style={{
													background: "#3e3e42",
													color: "#cccccc",
													border: "1px solid transparent",
												}}
												onMouseEnter={(e) =>
													(e.currentTarget.style.borderColor = "#555")
												}
												onMouseLeave={(e) =>
													(e.currentTarget.style.borderColor = "transparent")
												}
											>
												{selectedTile?.name || "(none)"}
											</div>
										)}
									</div>
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Type
										</label>
										{isEditingTileType ? (
											<input
												type="text"
												defaultValue={selectedTile?.type || ""}
												onBlur={(e) => {
													handleUpdateTileType(e.target.value);
													setIsEditingTileType(false);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														handleUpdateTileType(e.currentTarget.value);
														setIsEditingTileType(false);
													} else if (e.key === "Escape") {
														setIsEditingTileType(false);
													}
												}}
												className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
												style={{
													background: "#3e3e42",
													color: "#cccccc",
													border: "1px solid #1177bb",
												}}
												autoFocus
											/>
										) : (
											<div
												onClick={() => setIsEditingTileType(true)}
												className="px-2.5 py-1.5 text-xs rounded cursor-pointer transition-colors"
												style={{
													background: "#3e3e42",
													color: "#cccccc",
													border: "1px solid transparent",
												}}
												onMouseEnter={(e) =>
													(e.currentTarget.style.borderColor = "#555")
												}
												onMouseLeave={(e) =>
													(e.currentTarget.style.borderColor = "transparent")
												}
											>
												{selectedTile?.type || "(none)"}
											</div>
										)}
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Center - Canvas Area */}
			<div
				ref={containerRef}
				className="flex-1 overflow-hidden bg-gray-900 relative"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onContextMenu={handleContextMenu}
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
							{viewState.selectedTileRegion && (
								<>
									<div className="w-px h-4 bg-gray-700" />
									<div className="flex items-center gap-2">
										<span className="text-gray-500">Selection:</span>
										<span className="font-mono">
											{viewState.selectedTileRegion.x},{" "}
											{viewState.selectedTileRegion.y}
										</span>
										<span className="text-gray-600">•</span>
										<span className="font-mono">
											{viewState.selectedTileRegion.width}×
											{viewState.selectedTileRegion.height}
										</span>
									</div>
								</>
							)}
							<div className="flex-1" />
							<div className="flex items-center gap-2">
								<span className="text-gray-500">Zoom:</span>
								<span className="font-mono">
									{Math.round(viewState.scale * 100)}%
								</span>
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
			{selectedCompoundTileId && (
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
								<label
									className="text-xs font-medium block mb-1.5"
									style={{ color: "#858585" }}
								>
									Name
								</label>
								{isEditingTileName ? (
									<input
										type="text"
										defaultValue={selectedTile?.name || ""}
										onBlur={(e) => {
											handleUpdateTileName(e.target.value);
											setIsEditingTileName(false);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleUpdateTileName(e.currentTarget.value);
												setIsEditingTileName(false);
											} else if (e.key === "Escape") {
												setIsEditingTileName(false);
											}
										}}
										className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
										style={{
											background: "#3e3e42",
											color: "#cccccc",
											border: "1px solid #1177bb",
										}}
										autoFocus
									/>
								) : (
									<div
										onClick={() => setIsEditingTileName(true)}
										className="px-2.5 py-1.5 text-xs rounded cursor-pointer transition-colors"
										style={{
											background: "#3e3e42",
											color: "#cccccc",
											border: "1px solid transparent",
										}}
										onMouseEnter={(e) =>
											(e.currentTarget.style.borderColor = "#555")
										}
										onMouseLeave={(e) =>
											(e.currentTarget.style.borderColor = "transparent")
										}
									>
										{selectedTile?.name || "(none)"}
									</div>
								)}
							</div>
							<div>
								<label
									className="text-xs font-medium block mb-1.5"
									style={{ color: "#858585" }}
								>
									Type
								</label>
								{isEditingTileType ? (
									<input
										type="text"
										defaultValue={selectedTile?.type || ""}
										onBlur={(e) => {
											handleUpdateTileType(e.target.value);
											setIsEditingTileType(false);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleUpdateTileType(e.currentTarget.value);
												setIsEditingTileType(false);
											} else if (e.key === "Escape") {
												setIsEditingTileType(false);
											}
										}}
										className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
										style={{
											background: "#3e3e42",
											color: "#cccccc",
											border: "1px solid #1177bb",
										}}
										autoFocus
									/>
								) : (
									<div
										onClick={() => setIsEditingTileType(true)}
										className="px-2.5 py-1.5 text-xs rounded cursor-pointer transition-colors"
										style={{
											background: "#3e3e42",
											color: "#cccccc",
											border: "1px solid transparent",
										}}
										onMouseEnter={(e) =>
											(e.currentTarget.style.borderColor = "#555")
										}
										onMouseLeave={(e) =>
											(e.currentTarget.style.borderColor = "transparent")
										}
									>
										{selectedTile?.type || "(none)"}
									</div>
								)}
							</div>
							{/* Only show origin for compound tiles */}
							{selectedTile?.isCompound && (
								<div>
									<label
										className="text-xs font-medium block mb-1.5"
										style={{ color: "#858585" }}
									>
										Origin
									</label>
									<div className="grid grid-cols-2 gap-2">
										<div className="flex">
											<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
												X
											</div>
											<div className="flex-1">
												<DragNumberInput
													value={selectedTile?.origin?.x ?? 0}
													onChange={(value) => handleUpdateTileOrigin(value, selectedTile?.origin?.y ?? 0)}
													min={0}
													max={1}
													step={0.01}
													dragSpeed={0.01}
													precision={2}
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
													value={selectedTile?.origin?.y ?? 0}
													onChange={(value) => handleUpdateTileOrigin(selectedTile?.origin?.x ?? 0, value)}
													min={0}
													max={1}
													step={0.01}
													dragSpeed={0.01}
													precision={2}
													roundedLeft={false}
												/>
											</div>
										</div>
									</div>
								</div>
							)}
							{/* Custom Properties Section */}
							{selectedTile?.isCompound && (
								<div>
									<div className="flex items-center justify-between mb-1.5">
										<label
											className="text-xs font-medium"
											style={{ color: "#858585" }}
										>
											Custom Properties
										</label>
										<button
											onClick={handleAddProperty}
											className="text-xs px-2 py-1 rounded transition-colors"
											style={{ background: "#3e3e42", color: "#cccccc" }}
										>
											+ Add
										</button>
									</div>
									{selectedTile.properties &&
									Object.keys(selectedTile.properties).length > 0 ? (
										<div className="space-y-2">
											{Object.entries(selectedTile.properties).map(
												([key, value]) => {
													const isTemp = key.startsWith("__temp_");
													const displayKey = isTemp ? "" : key;

													return (
														<div key={key} className="flex items-center gap-2">
															<div className="flex-1" style={{ minWidth: 0 }}>
																{editingPropertyKey === key ? (
																	<input
																		type="text"
																		value={displayKey}
																		onChange={(e) => {
																			const newKey = e.target.value;
																			handleUpdatePropertyKey(key, newKey);
																			if (newKey && newKey.trim()) {
																				setEditingPropertyKey(newKey);
																			}
																		}}
																		onBlur={() => {
																			setEditingPropertyKey(null);
																			// If still empty after blur, delete it
																			if (isTemp) {
																				handleDeleteProperty(key);
																			}
																		}}
																		onKeyDown={(e) => {
																			if (e.key === "Enter" || e.key === "Escape") {
																				setEditingPropertyKey(null);
																				// If still empty after Enter/Escape, delete it
																				if (isTemp || !displayKey.trim()) {
																					handleDeleteProperty(key);
																				}
																			} else if (e.key === "Tab" && !e.shiftKey) {
																				e.preventDefault();
																				setEditingPropertyKey(null);
																				setEditingPropertyValue(key);
																			}
																		}}
																		placeholder="Key"
																		className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
																		style={{
																			background: "#3e3e42",
																			color: "#cccccc",
																			border: "1px solid #007acc",
																		}}
																		autoFocus
																	/>
																) : (
																	<div
																		onClick={() => setEditingPropertyKey(key)}
																		className="text-xs cursor-text px-2.5 py-1.5 rounded"
																		style={{
																			background: "#3e3e42",
																			color: "#cccccc",
																			border: "1px solid transparent",
																		}}
																	>
																		{displayKey || "(empty)"}
																	</div>
																)}
															</div>
															<div className="flex-1" style={{ minWidth: 0 }}>
																{editingPropertyValue === key ? (
																	<input
																		type="text"
																		value={value}
																		onChange={(e) =>
																			handleUpdatePropertyValue(
																				key,
																				e.target.value,
																			)
																		}
																		onBlur={() => setEditingPropertyValue(null)}
																		onKeyDown={(e) => {
																			if (e.key === "Enter" || e.key === "Escape") {
																				setEditingPropertyValue(null);
																			} else if (e.key === "Tab" && e.shiftKey) {
																				e.preventDefault();
																				setEditingPropertyValue(null);
																				setEditingPropertyKey(key);
																			}
																		}}
																		placeholder="Value"
																		className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
																		style={{
																			background: "#3e3e42",
																			color: "#cccccc",
																			border: "1px solid #007acc",
																		}}
																		autoFocus
																	/>
																) : (
																	<div
																		onClick={() => setEditingPropertyValue(key)}
																		className="text-xs cursor-text px-2.5 py-1.5 rounded"
																		style={{
																			background: "#3e3e42",
																			color: "#cccccc",
																			border: "1px solid transparent",
																		}}
																	>
																		{value || "(empty)"}
																	</div>
																)}
															</div>
															<button
																onClick={() => handleDeleteProperty(key)}
																className="p-1 hover:bg-red-600/20 rounded transition-colors"
																style={{ color: "#f48771" }}
															>
																<TrashIcon size={14} />
															</button>
														</div>
													);
												},
											)}
										</div>
									) : (
										<div className="text-xs" style={{ color: "#858585" }}>
											No properties
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Context Menu */}
			{contextMenu && (
				<>
					{/* Backdrop to close menu */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setContextMenu(null)}
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
						{contextMenu.compoundTileId ? (
							// Show options when right-clicking on compound tile
							<>
								<div
									onClick={handleAddCollider}
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) =>
										(e.currentTarget.style.background = "#3e3e42")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.background = "transparent")
									}
								>
									<ShieldIcon size={16} />
									<span>Add/Edit Collider</span>
								</div>
								<div
									onClick={handleDeleteCompoundTile}
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#f48771" }}
									onMouseEnter={(e) =>
										(e.currentTarget.style.background = "#3e3e42")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.background = "transparent")
									}
								>
									<TrashIcon size={16} />
									<span>Delete Compound Tile</span>
								</div>
							</>
						) : (
							// Show create option when right-clicking on selection
							<>
								<div
									onClick={handleMarkAsCompoundTile}
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) =>
										(e.currentTarget.style.background = "#3e3e42")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.background = "transparent")
									}
								>
									<span>✓</span>
									<span>Mark as Compound Tile</span>
								</div>
								<div
									onClick={handleClearSelection}
									className="px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2"
									style={{ color: "#cccccc" }}
									onMouseEnter={(e) =>
										(e.currentTarget.style.background = "#3e3e42")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.background = "transparent")
									}
								>
									<span>✕</span>
									<span>Clear Selection</span>
								</div>
							</>
						)}
					</div>
				</>
			)}
		</div>
	);
};
