import { useEffect, useRef, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { TilesetTab, PolygonCollider } from "../types";
import { CollisionEditor } from "./CollisionEditor";

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
	const [isEditingCollision, setIsEditingCollision] = useState(false);
	const [editingTileId, setEditingTileId] = useState<string | null>(null);

	// Refs to track current pan and zoom values for wheel event
	const panRef = useRef(pan);
	const scaleRef = useRef(viewState.scale);

	useEffect(() => {
		panRef.current = pan;
		scaleRef.current = viewState.scale;
	}, [pan, viewState.scale]);

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
				const intersectingTiles = tilesetData.tiles.filter((tile) => {
					if (!tile.width || !tile.height) return false; // Not a compound tile
					const tileWidth = tile.width || tilesetData.tileWidth;
					return x > tile.x && x < tile.x + tileWidth;
				});

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
				const intersectingTiles = tilesetData.tiles.filter((tile) => {
					if (!tile.width || !tile.height) return false; // Not a compound tile
					const tileHeight = tile.height || tilesetData.tileHeight;
					return y > tile.y && y < tile.y + tileHeight;
				});

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
				if (tile.width && tile.height) {
					// This is a compound tile
					const tileWidth = tile.width || tilesetData.tileWidth;
					const tileHeight = tile.height || tilesetData.tileHeight;

					// Draw border around it
					ctx.strokeRect(tile.x, tile.y, tileWidth, tileHeight);

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
						ctx.moveTo(
							collider.points[0].x,
							collider.points[0].y,
						);
						for (let i = 1; i < collider.points.length; i++) {
							ctx.lineTo(
								collider.points[i].x,
								collider.points[i].y,
							);
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

			ctx.restore();
		};

		draw();
		window.addEventListener("resize", draw);

		return () => {
			window.removeEventListener("resize", draw);
		};
	}, [
		tilesetData,
		tilesetData.tiles,
		viewState.selectedTileRegion,
		pan,
		viewState.scale,
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

	// Mouse handlers for panning and tile selection
	const handleMouseDown = (e: React.MouseEvent) => {
		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			// Middle mouse or Shift+Left = Pan
			setIsDragging(true);
			setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
		} else if (e.button === 0) {
			// Left click = Select tiles
			const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY);
			const { tileX, tileY } = canvasToTile(canvasX, canvasY);

			// Check if we clicked on a compound tile
			let foundCompoundTile = false;
			for (const tile of tilesetData.tiles) {
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
		setIsDragging(false);
		setIsSelecting(false);
		setSelectionStart(null);
	};

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();

		// Check if we're right-clicking on a compound tile
		const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY);
		let clickedCompoundTile: string | undefined;

		for (const tile of tilesetData.tiles) {
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
			setContextMenu({
				x: e.clientX,
				y: e.clientY,
				compoundTileId: clickedCompoundTile,
			});
		}
	};

	const handleMarkAsCompoundTile = () => {
		setContextMenu(null);

		if (!viewState.selectedTileRegion) return;

		const { x, y, width, height } = viewState.selectedTileRegion;

		// Create new tile definition - just store region bounds
		// Presence of width and height indicates it's a compound tile
		const newTile = {
			id: `tile_${Date.now()}`,
			x: x * tilesetData.tileWidth,
			y: y * tilesetData.tileHeight,
			width: width * tilesetData.tileWidth,
			height: height * tilesetData.tileHeight,
		};

		// Add to tileset
		updateTileset(tab.tilesetId, {
			tiles: [...tilesetData.tiles, newTile],
		});

		// Mark tab as dirty
		updateTabData(tab.id, { isDirty: true });
	};

	const handleDeleteCompoundTile = () => {
		setContextMenu(null);

		if (!contextMenu?.compoundTileId) return;

		// Remove the compound tile from the tileset
		updateTileset(tab.tilesetId, {
			tiles: tilesetData.tiles.filter(
				(t) => t.id !== contextMenu.compoundTileId,
			),
		});

		// Mark tab as dirty
		updateTabData(tab.id, { isDirty: true });
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

		// Open collision editor for this compound tile
		setEditingTileId(contextMenu.compoundTileId);
		setIsEditingCollision(true);
	};

	const handleCollisionUpdate = (colliders: PolygonCollider[]) => {
		if (!editingTileId) return;

		// Update the tile's colliders property
		updateTileset(tab.tilesetId, {
			tiles: tilesetData.tiles.map((t) =>
				t.id === editingTileId ? { ...t, colliders } : t,
			),
		});

		// Mark tab as dirty
		updateTabData(tab.id, { isDirty: true });
	};

	return (
		<div className="flex h-full w-full">
			{/* Left Sidebar */}
			<div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
				{/* Header */}
				<div className="p-4 border-b border-gray-700">
					{isEditingName ? (
						<input
							type="text"
							value={editedName}
							onChange={(e) => setEditedName(e.target.value)}
							onBlur={handleNameSave}
							onKeyDown={handleNameKeyDown}
							className="w-full px-2 py-1 text-sm font-medium bg-gray-700 text-gray-200 border border-blue-500 rounded focus:outline-none"
							autoFocus
						/>
					) : (
						<div
							className="text-sm font-medium text-gray-300 cursor-pointer hover:text-gray-100 hover:bg-gray-700 px-2 py-1 rounded transition-colors"
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
							<div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
								Tileset Properties
							</div>
							<div className="space-y-2">
								<div className="grid grid-cols-2 gap-2">
									<div>
										<label className="text-xs text-gray-400 block mb-1">
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
											className="w-full px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
											min="1"
										/>
									</div>
									<div>
										<label className="text-xs text-gray-400 block mb-1">
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
											className="w-full px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
											min="1"
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Right Side - Canvas Area */}
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
						<div className="absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-90 border-t border-gray-700 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300">
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
									{tilesetData.tiles.filter((t) => t.width && t.height).length}
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
						className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[200px]"
						style={{
							left: `${contextMenu.x}px`,
							top: `${contextMenu.y}px`,
						}}
					>
						{contextMenu.compoundTileId ? (
							// Show options when right-clicking on compound tile
							<>
								<button
									onClick={handleAddCollider}
									className="w-full px-4 py-2 text-sm text-left text-gray-200 hover:bg-gray-700 flex items-center gap-2"
								>
									<span>🛡️</span>
									<span>Add/Edit Collider</span>
								</button>
								<div className="h-px bg-gray-700 my-1" />
								<button
									onClick={handleDeleteCompoundTile}
									className="w-full px-4 py-2 text-sm text-left text-red-400 hover:bg-gray-700 flex items-center gap-2"
								>
									<span>🗑</span>
									<span>Delete Compound Tile</span>
								</button>
							</>
						) : (
							// Show create option when right-clicking on selection
							<>
								<button
									onClick={handleMarkAsCompoundTile}
									className="w-full px-4 py-2 text-sm text-left text-gray-200 hover:bg-gray-700 flex items-center gap-2"
								>
									<span>✓</span>
									<span>Mark as Compound Tile</span>
								</button>
								<div className="h-px bg-gray-700 my-1" />
								<button
									onClick={handleClearSelection}
									className="w-full px-4 py-2 text-sm text-left text-gray-200 hover:bg-gray-700 flex items-center gap-2"
								>
									<span>✕</span>
									<span>Clear Selection</span>
								</button>
							</>
						)}
					</div>
				</>
			)}

			{/* Collision Editor Modal */}
			{isEditingCollision && editingTileId && tilesetData.imageData && (() => {
				const tile = tilesetData.tiles.find((t) => t.id === editingTileId);
				if (!tile) return null;

				const tileWidth = tile.width || tilesetData.tileWidth;
				const tileHeight = tile.height || tilesetData.tileHeight;

				// Get colliders array (default to empty array with one empty collider)
				const colliders = tile.colliders || [{ points: [] }];

				return (
					<div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
						<div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-[90vw] h-[95vh] flex flex-col">
							<div className="mb-4 flex items-center justify-between">
								<h2 className="text-lg font-semibold text-gray-200">
									Edit Collision - {tile.name || "Compound Tile"}
								</h2>
								<button
									onClick={() => {
										setIsEditingCollision(false);
										setEditingTileId(null);
									}}
									className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
								>
									Done
								</button>
							</div>
							<CollisionEditor
								width={tileWidth}
								height={tileHeight}
								colliders={colliders}
								onUpdate={handleCollisionUpdate}
								backgroundImage={tilesetData.imageData}
								backgroundRect={{
									x: tile.x,
									y: tile.y,
									width: tileWidth,
									height: tileHeight,
								}}
							/>
						</div>
					</div>
				);
			})()}
		</div>
	);
};
