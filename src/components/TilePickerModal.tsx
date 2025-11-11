import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";
import { useCanvasZoomPan } from "../hooks/useCanvasZoomPan";
import { packTileId, unpackTileId } from "../utils/tileId";

interface TilePickerModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export const TilePickerModal = ({ isOpen, onClose }: TilePickerModalProps) => {
	const {
		currentTileset,
		getActiveMap,
		selectedTileX,
		selectedTileY,
		selectedTileId,
		setSelectedTile,
		setSelectedTerrainLayerId,
	} = useEditor();

	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Zoom and pan using shared hook
	const {
		scale,
		pan,
		setPan,
		containerRef: zoomPanContainerRef,
	} = useCanvasZoomPan({
		initialScale: 1.0,
		initialPan: { x: 0, y: 0 },
		minScale: 0.5,
		maxScale: 8,
		zoomSpeed: 0.01,
	});

	const activeMap = getActiveMap();

	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

	// Draw the tileset with grid overlay and selection highlight
	useEffect(() => {
		if (!isOpen) return;

		const canvas = canvasRef.current;
		const container = zoomPanContainerRef.current;
		if (!canvas || !container || !currentTileset?.imageData) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const draw = () => {
			const displayImage = currentTileset.imageData;
			if (!displayImage) return;

			// Resize canvas to fill container
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;

			// Clear canvas
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// Draw background
			ctx.fillStyle = "#1e1e1e";
			ctx.fillRect(0, 0, canvas.width, canvas.height);

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

			// Calculate visible area in world coordinates
			const visibleLeft = Math.max(0, -pan.x / scale);
			const visibleTop = Math.max(0, -pan.y / scale);
			const visibleRight = Math.min(
				displayImage.width,
				(canvas.width - pan.x) / scale,
			);
			const visibleBottom = Math.min(
				displayImage.height,
				(canvas.height - pan.y) / scale,
			);

			// Only draw vertical lines that are visible
			const startX = Math.floor(visibleLeft / tileWidth) * tileWidth;
			const endX = Math.ceil(visibleRight / tileWidth) * tileWidth;

			// Draw vertical lines
			for (
				let x = startX;
				x <= endX && x <= displayImage.width;
				x += tileWidth
			) {
				// Find all compound tiles that intersect this vertical line
				const intersectingTiles =
					currentTileset?.tiles.filter((tile) => {
						if (tile.width === 0 || tile.height === 0) return false; // Not a compound tile
						const { x: tileX } = unpackTileId(tile.id);
						const tileWidthPx = tile.width !== 0 ? tile.width : tileWidth;
						return x > tileX && x < tileX + tileWidthPx;
					}) || [];

				if (intersectingTiles.length === 0) {
					// No intersections, draw full line (clipped to visible area)
					ctx.beginPath();
					ctx.moveTo(x, visibleTop);
					ctx.lineTo(x, visibleBottom);
					ctx.stroke();
				} else {
					// Draw line segments, skipping parts inside compound tiles
					let currentY = visibleTop;
					for (const tile of intersectingTiles) {
						const { y: tileY } = unpackTileId(tile.id);
						const tileHeightPx = tile.height !== 0 ? tile.height : tileHeight;
						const tileBottom = tileY + tileHeightPx;

						// Skip if tile is completely outside visible area
						if (tileBottom < visibleTop || tileY > visibleBottom) continue;

						// Draw from currentY to top of tile
						if (currentY < tileY && currentY < visibleBottom) {
							ctx.beginPath();
							ctx.moveTo(x, currentY);
							ctx.lineTo(x, Math.min(tileY, visibleBottom));
							ctx.stroke();
						}
						currentY = Math.max(currentY, tileBottom);
					}
					// Draw remaining segment
					if (currentY < visibleBottom) {
						ctx.beginPath();
						ctx.moveTo(x, currentY);
						ctx.lineTo(x, visibleBottom);
						ctx.stroke();
					}
				}
			}

			// Only draw horizontal lines that are visible
			const startY = Math.floor(visibleTop / tileHeight) * tileHeight;
			const endY = Math.ceil(visibleBottom / tileHeight) * tileHeight;

			// Draw horizontal lines
			for (
				let y = startY;
				y <= endY && y <= displayImage.height;
				y += tileHeight
			) {
				// Find all compound tiles that intersect this horizontal line
				const intersectingTiles =
					currentTileset?.tiles.filter((tile) => {
						if (tile.width === 0 || tile.height === 0) return false; // Not a compound tile
						const { y: tileY } = unpackTileId(tile.id);
						const tileHeightPx = tile.height !== 0 ? tile.height : tileHeight;
						return y > tileY && y < tileY + tileHeightPx;
					}) || [];

				if (intersectingTiles.length === 0) {
					// No intersections, draw full line (clipped to visible area)
					ctx.beginPath();
					ctx.moveTo(visibleLeft, y);
					ctx.lineTo(visibleRight, y);
					ctx.stroke();
				} else {
					// Draw line segments, skipping parts inside compound tiles
					let currentX = visibleLeft;
					for (const tile of intersectingTiles) {
						const { x: tileX } = unpackTileId(tile.id);
						const tileWidthPx = tile.width !== 0 ? tile.width : tileWidth;
						const tileRight = tileX + tileWidthPx;

						// Skip if tile is completely outside visible area
						if (tileRight < visibleLeft || tileX > visibleRight) continue;

						// Draw from currentX to left of tile
						if (currentX < tileX && currentX < visibleRight) {
							ctx.beginPath();
							ctx.moveTo(currentX, y);
							ctx.lineTo(Math.min(tileX, visibleRight), y);
							ctx.stroke();
						}
						currentX = Math.max(currentX, tileRight);
					}
					// Draw remaining segment
					if (currentX < visibleRight) {
						ctx.beginPath();
						ctx.moveTo(currentX, y);
						ctx.lineTo(visibleRight, y);
						ctx.stroke();
					}
				}
			}

			// Draw borders around compound tiles (only visible ones)
			if (currentTileset.tiles && currentTileset.tiles.length > 0) {
				ctx.strokeStyle = "rgba(34, 197, 94, 0.8)"; // Green color
				ctx.lineWidth = 2 / scale;

				for (const tile of currentTileset.tiles) {
					if (tile.width && tile.height) {
						const { x: tileX, y: tileY } = unpackTileId(tile.id);
						const tileRight = tileX + tile.width;
						const tileBottom = tileY + tile.height;

						// Only draw if tile is visible
						if (
							tileRight >= visibleLeft &&
							tileX <= visibleRight &&
							tileBottom >= visibleTop &&
							tileY <= visibleBottom
						) {
							ctx.strokeRect(tileX, tileY, tile.width, tile.height);
						}
					}
				}
			}

			// Draw selection highlight
			ctx.strokeStyle = "#0ff";
			ctx.lineWidth = 3 / scale;

			// Check if we have a selected compound tile
			if (currentTileset.tiles && selectedTileId) {
				const selectedCompoundTile = currentTileset.tiles.find(
					(tile) => tile.id === selectedTileId && tile.width && tile.height,
				);

				if (selectedCompoundTile) {
					// Highlight the entire compound tile
					const { x, y } = unpackTileId(selectedCompoundTile.id);
					ctx.strokeRect(
						x,
						y,
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
				// No selected tile ID, just highlight the grid position
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

		// Use ResizeObserver to watch for container size changes and redraw
		const resizeObserver = new ResizeObserver(() => {
			draw();
		});

		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [
		isOpen,
		currentTileset,
		activeMap,
		selectedTileX,
		selectedTileY,
		selectedTileId,
		pan,
		scale,
		zoomPanContainerRef,
	]);

	// Helper to convert screen coordinates to canvas coordinates
	const screenToCanvas = useCallback(
		(screenX: number, screenY: number) => {
			const canvas = canvasRef.current;
			if (!canvas) return { canvasX: 0, canvasY: 0 };

			const rect = canvas.getBoundingClientRect();
			const x = screenX - rect.left;
			const y = screenY - rect.top;

			// Account for pan and zoom transforms
			const canvasX = (x - pan.x) / scale;
			const canvasY = (y - pan.y) / scale;

			return { canvasX, canvasY };
		},
		[pan, scale],
	);

	// Handle tile click
	const handleCanvasClick = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const canvas = canvasRef.current;
			if (!canvas || !currentTileset?.imageData) return;

			const { canvasX: imageX, canvasY: imageY } = screenToCanvas(
				e.clientX,
				e.clientY,
			);

			const tileWidth = currentTileset?.tileWidth || activeMap?.tileWidth || 16;
			const tileHeight =
				currentTileset?.tileHeight || activeMap?.tileHeight || 16;

			// Clear terrain layer selection when selecting a tile
			if (currentTileset) {
				setSelectedTerrainLayerId(currentTileset.id, null);
			}

			// Check if we clicked on a compound tile
			const clickedTile = currentTileset.tiles?.find((tile) => {
				const { x: tileX, y: tileY } = unpackTileId(tile.id);
				const w = tile.width !== 0 ? tile.width : tileWidth;
				const h = tile.height !== 0 ? tile.height : tileHeight;
				return (
					imageX >= tileX &&
					imageX < tileX + w &&
					imageY >= tileY &&
					imageY < tileY + h
				);
			});

			if (clickedTile) {
				// Compound tile clicked
				const { x: clickedTileX, y: clickedTileY } = unpackTileId(
					clickedTile.id,
				);
				const tileX = Math.floor(clickedTileX / tileWidth);
				const tileY = Math.floor(clickedTileY / tileHeight);
				setSelectedTile(tileX, tileY, currentTileset.id, clickedTile.id);
			} else {
				// Regular tile clicked
				const tileX = Math.floor(imageX / tileWidth);
				const tileY = Math.floor(imageY / tileHeight);
				const regularTileId = packTileId(
					tileX * tileWidth,
					tileY * tileHeight,
					0,
					false,
					false,
				);
				setSelectedTile(tileX, tileY, currentTileset.id, regularTileId);
			}

			// Close modal after selection
			onClose();
		},
		[
			currentTileset,
			activeMap,
			setSelectedTile,
			setSelectedTerrainLayerId,
			onClose,
			screenToCanvas,
		],
	);

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

	// Keyboard navigation
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0"
				style={{ background: "rgba(0, 0, 0, 0.6)" }}
				onClick={onClose}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						onClose();
					}
				}}
				role="button"
				tabIndex={0}
			/>

			{/* Tile Picker Modal */}
			<div
				className="relative z-10 rounded shadow-2xl overflow-hidden flex flex-col"
				style={{
					background: "#2d2d30",
					border: "1px solid #3e3e42",
					width: "80vw",
					height: "80vh",
					maxWidth: "1400px",
					maxHeight: "900px",
				}}
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-4 py-3"
					style={{ borderBottom: "1px solid #3e3e42" }}
				>
					<div className="flex items-center gap-3">
						<svg
							aria-hidden="true"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
						>
							<rect x="3" y="3" width="7" height="7" fill="#ce9178" />
							<rect x="11" y="3" width="7" height="7" fill="#ce9178" />
							<rect x="3" y="11" width="7" height="7" fill="#ce9178" />
							<rect x="11" y="11" width="7" height="7" fill="#ce9178" />
						</svg>
						<span className="text-sm" style={{ color: "#cccccc" }}>
							{currentTileset
								? `Select Tile - ${currentTileset.name || currentTileset.id}`
								: "Select Tile"}
						</span>
					</div>
					<span className="text-xs" style={{ color: "#858585" }}>
						ESC to close
					</span>
				</div>

				{/* Canvas or No Tileset Message */}
				{!currentTileset ? (
					<div
						className="p-8 flex items-center justify-center text-center"
						style={{ background: "#1e1e1e", minHeight: "300px" }}
					>
						<div>
							<div className="text-sm mb-2" style={{ color: "#cccccc" }}>
								No tileset selected
							</div>
							<div className="text-xs" style={{ color: "#858585" }}>
								Select a tileset first using Cmd/Ctrl+T
							</div>
						</div>
					</div>
				) : (
					<>
						<div
							ref={zoomPanContainerRef}
							style={{
								width: "100%",
								flex: 1,
								position: "relative",
								overflow: "hidden",
								background: "#1e1e1e",
								border: "1px solid #3e3e42",
								cursor: isDragging ? "grabbing" : "default",
							}}
						>
							<canvas
								ref={canvasRef}
								onClick={handleCanvasClick}
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

						{/* Footer */}
						<div
							className="px-4 py-2 text-xs"
							style={{
								background: "#2d2d30",
								borderTop: "1px solid #3e3e42",
								color: "#858585",
							}}
						>
							Click a tile to select
						</div>
					</>
				)}
			</div>
		</div>,
		document.body,
	);
};
