import { useEffect, useRef, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { packTileId } from "../utils/tileId";
import { Dropdown } from "./Dropdown";

export const TilesetPanel = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const {
		tilesets,
		currentTileset,
		setCurrentTileset,
		getActiveMap,
		selectedTileX,
		selectedTileY,
		selectedTileId,
		setSelectedTile,
		setSelectedTileId,
		setSelectedEntityDefId,
		setSelectedTilesetId,
		selectedTerrainLayerId,
		setSelectedTerrainLayerId,
	} = useEditor();

	const activeMap = getActiveMap();

	const [scale, setScale] = useState(1.0);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

	// Refs to track current pan and zoom values for wheel event
	const panRef = useRef(pan);
	const scaleRef = useRef(scale);

	useEffect(() => {
		panRef.current = pan;
		scaleRef.current = scale;
	}, [pan, scale]);

	// Use current tileset's image
	const displayImage = currentTileset?.imageData;

	// Draw function (called on mount and when dependencies change)
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container || !displayImage) return;

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

			// Draw tileset image
			ctx.drawImage(displayImage, 0, 0);

			// Draw grid (skip segments inside compound tiles)
			ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
			ctx.lineWidth = 1 / scale;

			const tileWidth = currentTileset?.tileWidth || activeMap?.tileWidth || 16;
			const tileHeight =
				currentTileset?.tileHeight || activeMap?.tileHeight || 16;

			// Draw vertical lines
			for (let x = 0; x <= displayImage.width; x += tileWidth) {
				// Find all compound tiles that intersect this vertical line
				const intersectingTiles =
					currentTileset?.tiles.filter((tile) => {
						if (tile.width === 0 || tile.height === 0) return false; // Not a compound tile
						const tileWidthPx = tile.width !== 0 ? tile.width : tileWidth;
						return x > tile.x && x < tile.x + tileWidthPx;
					}) || [];

				if (intersectingTiles.length === 0) {
					// No intersections, draw full line
					ctx.beginPath();
					ctx.moveTo(x, 0);
					ctx.lineTo(x, displayImage.height);
					ctx.stroke();
				} else {
					// Draw line segments, skipping parts inside compound tiles
					let currentY = 0;
					for (const tile of intersectingTiles) {
						const tileHeightPx = tile.height !== 0 ? tile.height : tileHeight;
						// Draw from currentY to top of tile
						if (currentY < tile.y) {
							ctx.beginPath();
							ctx.moveTo(x, currentY);
							ctx.lineTo(x, tile.y);
							ctx.stroke();
						}
						currentY = Math.max(currentY, tile.y + tileHeightPx);
					}
					// Draw remaining segment
					if (currentY < displayImage.height) {
						ctx.beginPath();
						ctx.moveTo(x, currentY);
						ctx.lineTo(x, displayImage.height);
						ctx.stroke();
					}
				}
			}

			// Draw horizontal lines
			for (let y = 0; y <= displayImage.height; y += tileHeight) {
				// Find all compound tiles that intersect this horizontal line
				const intersectingTiles =
					currentTileset?.tiles.filter((tile) => {
						if (tile.width === 0 || tile.height === 0) return false; // Not a compound tile
						const tileHeightPx = tile.height !== 0 ? tile.height : tileHeight;
						return y > tile.y && y < tile.y + tileHeightPx;
					}) || [];

				if (intersectingTiles.length === 0) {
					// No intersections, draw full line
					ctx.beginPath();
					ctx.moveTo(0, y);
					ctx.lineTo(displayImage.width, y);
					ctx.stroke();
				} else {
					// Draw line segments, skipping parts inside compound tiles
					let currentX = 0;
					for (const tile of intersectingTiles) {
						const tileWidthPx = tile.width !== 0 ? tile.width : tileWidth;
						// Draw from currentX to left of tile
						if (currentX < tile.x) {
							ctx.beginPath();
							ctx.moveTo(currentX, y);
							ctx.lineTo(tile.x, y);
							ctx.stroke();
						}
						currentX = Math.max(currentX, tile.x + tileWidthPx);
					}
					// Draw remaining segment
					if (currentX < displayImage.width) {
						ctx.beginPath();
						ctx.moveTo(currentX, y);
						ctx.lineTo(displayImage.width, y);
						ctx.stroke();
					}
				}
			}

			// Draw borders around compound tiles
			if (currentTileset) {
				ctx.strokeStyle = "rgba(34, 197, 94, 0.8)"; // Green color matching TilesetEditorView
				ctx.lineWidth = 2 / scale;
				currentTileset.tiles.forEach((tile) => {
					if (tile.width && tile.height) {
						// Only draw borders for compound tiles
						const w = tile.width !== 0 ? tile.width : tileWidth;
						const h = tile.height !== 0 ? tile.height : tileHeight;
						ctx.strokeRect(tile.x, tile.y, w, h);

						// Draw tile name if present
						if (tile.name !== "") {
							ctx.save();
							ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
							ctx.font = `${Math.max(10, 12 / scale)}px sans-serif`;
							const metrics = ctx.measureText(tile.name);
							const padding = 4 / scale;
							const textX = tile.x + padding;
							const textY = tile.y + 12 / scale + padding;

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
				});
			}

			// Draw selection highlight
			ctx.strokeStyle = "#0ff";
			ctx.lineWidth = 3 / scale;

			// Check if we have a selected compound tile by matching the selectedTileId
			if (currentTileset && currentTileset.tiles.length > 0 && selectedTileId) {
				const selectedCompoundTile = currentTileset.tiles.find((tile) => {
					return tile.id === selectedTileId && tile.width && tile.height;
				});

				if (selectedCompoundTile) {
					// Highlight the entire compound tile
					ctx.strokeRect(
						selectedCompoundTile.x,
						selectedCompoundTile.y,
						selectedCompoundTile.width ?? tileWidth,
						selectedCompoundTile.height ?? tileHeight,
					);
				} else {
					// Regular single tile highlight
					ctx.strokeRect(
						selectedTileX * tileWidth,
						selectedTileY * tileHeight,
						tileWidth,
						tileHeight,
					);
				}
			} else {
				// No tileset or no selected tile ID, just highlight the grid position
				ctx.strokeRect(
					selectedTileX * tileWidth,
					selectedTileY * tileHeight,
					tileWidth,
					tileHeight,
				);
			}

			ctx.restore();
		};

		// Initial draw
		draw();

		// Native wheel event listener (to allow preventDefault)
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();

			if (e.ctrlKey) {
				// Zoom towards mouse position
				const rect = canvas.getBoundingClientRect();
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
				setScale(newScale);
			} else {
				// Pan
				setPan({
					x: panRef.current.x - e.deltaX,
					y: panRef.current.y - e.deltaY,
				});
			}
		};

		// Use ResizeObserver to watch for container size changes and redraw
		const resizeObserver = new ResizeObserver(() => {
			draw();
		});

		resizeObserver.observe(container);
		canvas.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			resizeObserver.disconnect();
			canvas.removeEventListener("wheel", handleWheel);
		};
	}, [
		displayImage,
		currentTileset,
		activeMap,
		selectedTileX,
		selectedTileY,
		selectedTileId,
		pan,
		scale,
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

	const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas || !displayImage) return;

		const { canvasX: x, canvasY: y } = screenToCanvas(e.clientX, e.clientY);

		// Check if click is within the tileset image bounds
		if (x < 0 || y < 0 || x >= displayImage.width || y >= displayImage.height) {
			// Clicked outside the tileset, ignore the click
			return;
		}

		const tileWidth = currentTileset?.tileWidth || activeMap?.tileWidth || 16;
		const tileHeight =
			currentTileset?.tileHeight || activeMap?.tileHeight || 16;

		// If using new tileset system
		if (currentTileset) {
			// Clear terrain layer selection when selecting a tile
			setSelectedTerrainLayerId(currentTileset.id, null);

			// First check if we clicked on a compound tile
			const clickedTile = currentTileset.tiles.find((tile) => {
				const w = tile.width !== 0 ? tile.width : tileWidth;
				const h = tile.height !== 0 ? tile.height : tileHeight;
				return x >= tile.x && x < tile.x + w && y >= tile.y && y < tile.y + h;
			});

			if (clickedTile) {
				// For any tile in the tiles array, convert pixel coordinates to tile grid coordinates
				const tileX = Math.floor(clickedTile.x / tileWidth);
				const tileY = Math.floor(clickedTile.y / tileHeight);
				// Use setSelectedTile to set everything atomically
				setSelectedTile(tileX, tileY, currentTileset.id, clickedTile.id);
			} else {
				// No compound tile found, create a tile ID for the regular tile at this position
				const tileX = Math.floor(x / tileWidth);
				const tileY = Math.floor(y / tileHeight);

				// Create a tile ID for this regular tile (with tileset index 0 for local ID)
				const regularTileId = packTileId(
					tileX * tileWidth,
					tileY * tileHeight,
					0,
					false,
					false,
				);

				setSelectedTile(tileX, tileY, currentTileset.id, regularTileId);
			}
		} else {
			// Legacy: no current tileset, just select grid position
			const tileX = Math.floor(x / tileWidth);
			const tileY = Math.floor(y / tileHeight);
			setSelectedTile(tileX, tileY, "", 0);
		}
	};

	const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			// Middle mouse or Shift+Left = Pan
			e.preventDefault();
			setIsDragging(true);
			setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isDragging) {
			setPan({
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y,
			});
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	return (
		<div className="panel">
			<h3>Tileset</h3>

			{/* Tileset selector */}
			{tilesets.length > 0 && (
				<div className="mb-2">
					<Dropdown
						items={tilesets}
						value={currentTileset}
						onChange={setCurrentTileset}
						getItemLabel={(tileset) => tileset.name}
						getItemKey={(tileset) => tileset.id}
						placeholder="Select Tileset..."
						searchKeys={["name"]}
					/>
				</div>
			)}

			{/* Tileset canvas */}
			{displayImage ? (
				<div
					ref={containerRef}
					style={{
						width: "100%",
						height: "400px",
						position: "relative",
						overflow: "hidden",
						border: "1px solid #555",
						cursor: isDragging ? "grabbing" : "default",
					}}
				>
					<canvas
						ref={canvasRef}
						className="tileset-canvas"
						onClick={handleClick}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onMouseLeave={handleMouseUp}
						style={{
							width: "100%",
							height: "100%",
							imageRendering: "pixelated",
						}}
					/>
					{/* Zoom level indicator */}
					<div
						style={{
							position: "absolute",
							bottom: "8px",
							right: "8px",
							background: "rgba(0, 0, 0, 0.7)",
							color: "#ccc",
							padding: "4px 8px",
							borderRadius: "4px",
							fontSize: "12px",
							fontFamily: "monospace",
							pointerEvents: "none",
						}}
					>
						{Math.round(scale * 100)}%
					</div>
				</div>
			) : (
				<div className="text-gray-400 text-sm p-4 text-center">
					No tileset loaded
				</div>
			)}

			{/* Terrain Layers Section */}
			{currentTileset?.terrainLayers &&
				currentTileset.terrainLayers.length > 0 && (
					<div className="mt-3">
						<div
							className="text-xs font-semibold mb-2"
							style={{ color: "#858585" }}
						>
							TERRAIN LAYERS
						</div>
						<div className="text-[10px] mb-2" style={{ color: "#858585" }}>
							Click to select for drawing
						</div>
						<div className="space-y-1">
							{currentTileset.terrainLayers.map((layer) => (
								<div
									key={layer.id}
									className="rounded transition-all cursor-pointer select-none"
									style={{
										background:
											selectedTerrainLayerId === layer.id
												? "#0e639c"
												: "#2d2d2d",
										border: `1px solid ${selectedTerrainLayerId === layer.id ? "#1177bb" : "#3e3e42"}`,
										padding: "8px 10px",
									}}
									onClick={(e) => {
										e.stopPropagation(); // Prevent click from bubbling to canvas
										// Toggle selection: click again to deselect
										const newTerrainLayerId =
											selectedTerrainLayerId === layer.id ? null : layer.id;
										if (currentTileset) {
											setSelectedTerrainLayerId(
												currentTileset.id,
												newTerrainLayerId,
											);
										}

										// When selecting a terrain layer, set the tileset ID
										if (newTerrainLayerId && currentTileset) {
											setSelectedTilesetId(currentTileset.id);
											// Note: No need to clear tile/entity selection - setSelectedTerrainLayerId already sets selection to terrain type
										} else if (!newTerrainLayerId) {
											// When deselecting terrain, clear the tileset ID too
											setSelectedTilesetId(null);
										}
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											const newTerrainLayerId =
												selectedTerrainLayerId === layer.id ? null : layer.id;
											if (currentTileset) {
												setSelectedTerrainLayerId(
													currentTileset.id,
													newTerrainLayerId,
												);
											}

											if (newTerrainLayerId && currentTileset) {
												setSelectedTilesetId(currentTileset.id);
												setSelectedTileId(null);
												setSelectedEntityDefId("", null);
											} else if (!newTerrainLayerId) {
												setSelectedTilesetId(null);
											}
										}
									}}
									role="button"
									tabIndex={0}
									aria-label={`Select terrain layer ${layer.name}`}
									aria-pressed={selectedTerrainLayerId === layer.id}
								>
									<div className="flex items-center gap-2">
										{selectedTerrainLayerId === layer.id && (
											<div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
										)}
										<span
											className="text-xs truncate"
											style={{
												color:
													selectedTerrainLayerId === layer.id
														? "#ffffff"
														: "#cccccc",
											}}
										>
											{layer.name}
										</span>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
		</div>
	);
};
