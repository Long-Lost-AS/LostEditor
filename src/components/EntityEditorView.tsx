import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";
import { EntityEditorTab, SpriteLayer, PolygonCollider } from "../types";
import { CollisionEditor } from "./CollisionEditor";
import { DragNumberInput } from "./DragNumberInput";

interface EntityEditorViewProps {
	tab: EntityEditorTab;
}

export const EntityEditorView = ({ tab }: EntityEditorViewProps) => {
	const { updateTabData, getTilesetById, tilesets } = useEditor();
	const { entityData, viewState } = tab;

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [pan, setPan] = useState({ x: viewState.panX, y: viewState.panY });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [isEditingName, setIsEditingName] = useState(false);
	const [isEditingType, setIsEditingType] = useState(false);
	const [editedName, setEditedName] = useState(entityData.name || "");
	const [editedType, setEditedType] = useState(entityData.type || "");
	const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(
		null,
	);
	const [editingPropertyValue, setEditingPropertyValue] = useState<
		string | null
	>(null);
	const [selectedSpriteLayerId, setSelectedSpriteLayerId] = useState<
		string | null
	>(null);
	const [isEditingCollision, setIsEditingCollision] = useState(false);

	// Sprite dragging state
	const [isDraggingSprite, setIsDraggingSprite] = useState(false);
	const [spriteDragStart, setSpriteDragStart] = useState<{
		x: number;
		y: number;
		offsetX: number;
		offsetY: number;
	} | null>(null);

	// Collider drawing state (Tiled-like click-to-place)
	const [isDrawing, setIsDrawing] = useState(false);
	const [drawingPoints, setDrawingPoints] = useState<
		Array<{ x: number; y: number }>
	>([]);
	const [selectedColliderId, setSelectedColliderId] = useState<string | null>(
		null,
	);
	const [selectedColliderPointIndex, setSelectedColliderPointIndex] = useState<
		number | null
	>(null);
	const [isDraggingColliderPoint, setIsDraggingColliderPoint] = useState(false);
	const [isDraggingCollider, setIsDraggingCollider] = useState(false);
	const [colliderDragStart, setColliderDragStart] = useState<{
		x: number;
		y: number;
		originalPoints: Array<{ x: number; y: number }>;
	} | null>(null);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		spriteLayerId?: string | null;
		colliderId?: string | null;
		pointIndex?: number;
		edgeIndex?: number;
		insertPosition?: { x: number; y: number };
	} | null>(null);

	// Sprite picker state
	const [isSpritePicking, setIsSpritePicking] = useState(false);
	const [selectedTilesetId, setSelectedTilesetId] = useState<string>("");
	const [selectedRegion, setSelectedRegion] = useState<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null>(null);
	const [pickerDragStart, setPickerDragStart] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [isPickerDragging, setIsPickerDragging] = useState(false);
	const pickerCanvasRef = useRef<HTMLCanvasElement>(null);

	// Refs to track current pan and zoom values
	const panRef = useRef(pan);
	const scaleRef = useRef(viewState.scale);
	const drawRef = useRef<() => void>(() => {});

	useEffect(() => {
		panRef.current = pan;
		scaleRef.current = viewState.scale;
	}, [pan, viewState.scale]);

	// Reset editing state when switching tabs to prevent showing stale data
	useEffect(() => {
		setEditedName(entityData.name || "");
		setEditedType(entityData.type || "");
		setIsEditingName(false);
		setIsEditingType(false);
	}, [tab.id, entityData.name, entityData.type]);

	// Draw sprite picker canvas
	useEffect(() => {
		if (!isSpritePicking) return;

		const canvas = pickerCanvasRef.current;
		const selectedTileset = selectedTilesetId
			? getTilesetById(selectedTilesetId)
			: null;
		if (!canvas || !selectedTileset || !selectedTileset.imageData) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const image = selectedTileset.imageData;
		canvas.width = image.width;
		canvas.height = image.height;

		// Draw tileset image
		ctx.drawImage(image, 0, 0);

		// Draw grid overlay (skip segments inside compound tiles)
		ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
		ctx.lineWidth = 1;

		// Draw vertical lines
		for (let x = 0; x <= image.width; x += selectedTileset.tileWidth) {
			// Find all compound tiles that intersect this vertical line
			const intersectingTiles = (selectedTileset.tiles || []).filter((tile) => {
				if (!tile.width || !tile.height) return false; // Not a compound tile
				const tileWidth = tile.width || selectedTileset.tileWidth;
				return x > tile.x && x < tile.x + tileWidth;
			});

			if (intersectingTiles.length === 0) {
				// No intersections, draw full line
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, image.height);
				ctx.stroke();
			} else {
				// Draw line segments, skipping parts inside compound tiles
				let currentY = 0;
				for (const tile of intersectingTiles) {
					const tileHeight = tile.height || selectedTileset.tileHeight;
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
				if (currentY < image.height) {
					ctx.beginPath();
					ctx.moveTo(x, currentY);
					ctx.lineTo(x, image.height);
					ctx.stroke();
				}
			}
		}

		// Draw horizontal lines
		for (let y = 0; y <= image.height; y += selectedTileset.tileHeight) {
			// Find all compound tiles that intersect this horizontal line
			const intersectingTiles = (selectedTileset.tiles || []).filter((tile) => {
				if (!tile.width || !tile.height) return false; // Not a compound tile
				const tileHeight = tile.height || selectedTileset.tileHeight;
				return y > tile.y && y < tile.y + tileHeight;
			});

			if (intersectingTiles.length === 0) {
				// No intersections, draw full line
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(image.width, y);
				ctx.stroke();
			} else {
				// Draw line segments, skipping parts inside compound tiles
				let currentX = 0;
				for (const tile of intersectingTiles) {
					const tileWidth = tile.width || selectedTileset.tileWidth;
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
				if (currentX < image.width) {
					ctx.beginPath();
					ctx.moveTo(currentX, y);
					ctx.lineTo(image.width, y);
					ctx.stroke();
				}
			}
		}

		// Draw borders around compound tiles
		ctx.strokeStyle = "rgba(34, 197, 94, 0.8)"; // Green color
		ctx.lineWidth = 2;
		for (const tile of selectedTileset.tiles || []) {
			if (tile.width && tile.height) {
				// This is a compound tile
				const tileWidth = tile.width || selectedTileset.tileWidth;
				const tileHeight = tile.height || selectedTileset.tileHeight;

				// Draw border around it
				ctx.strokeRect(tile.x, tile.y, tileWidth, tileHeight);

				// Optionally draw tile name
				if (tile.name) {
					ctx.save();
					ctx.fillStyle = "rgba(34, 197, 94, 0.9)";
					ctx.font = "12px sans-serif";
					const metrics = ctx.measureText(tile.name);
					const padding = 4;
					const textX = tile.x + padding;
					const textY = tile.y + 12 + padding;

					// Draw background for text
					ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
					ctx.fillRect(
						textX - padding,
						textY - 12,
						metrics.width + padding * 2,
						14,
					);

					// Draw text
					ctx.fillStyle = "rgba(34, 197, 94, 1)";
					ctx.fillText(tile.name, textX, textY);
					ctx.restore();
				}
			}
		}

		// Draw selection
		if (selectedRegion) {
			ctx.fillStyle = "rgba(0, 122, 204, 0.3)";
			ctx.strokeStyle = "#007acc";
			ctx.lineWidth = 2;
			ctx.fillRect(
				selectedRegion.x * selectedTileset.tileWidth,
				selectedRegion.y * selectedTileset.tileHeight,
				selectedRegion.width * selectedTileset.tileWidth,
				selectedRegion.height * selectedTileset.tileHeight,
			);
			ctx.strokeRect(
				selectedRegion.x * selectedTileset.tileWidth,
				selectedRegion.y * selectedTileset.tileHeight,
				selectedRegion.width * selectedTileset.tileWidth,
				selectedRegion.height * selectedTileset.tileHeight,
			);
		}
	}, [isSpritePicking, selectedTilesetId, selectedRegion, getTilesetById]);

	// Update view state when pan changes
	useEffect(() => {
		updateTabData(tab.id, {
			viewState: {
				...viewState,
				panX: pan.x,
				panY: pan.y,
			},
		});
	}, [pan]);

	// Handle keyboard shortcuts for drawing mode
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isDrawing) return;

			if (e.key === "Escape") {
				// Cancel drawing
				handleCancelDrawing();
			} else if (e.key === "Enter") {
				// Finish drawing (if we have at least 3 points)
				handleFinishDrawing();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isDrawing, drawingPoints]);

	// Handle wheel zoom and pan
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

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

				// Calculate new zoom
				const delta = -e.deltaY * 0.01;
				const newScale = Math.max(0.1, Math.min(10, scaleRef.current + delta));

				// Adjust pan to keep world position under mouse
				const newPanX = mouseX - worldX * newScale;
				const newPanY = mouseY - worldY * newScale;

				setPan({ x: newPanX, y: newPanY });
				updateTabData(tab.id, {
					viewState: {
						...viewState,
						scale: newScale,
						panX: newPanX,
						panY: newPanY,
					},
				});
			} else {
				// Pan
				const newPanX = panRef.current.x - e.deltaX;
				const newPanY = panRef.current.y - e.deltaY;
				setPan({ x: newPanX, y: newPanY });
			}
		};

		canvas.addEventListener("wheel", handleWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", handleWheel);
	}, [tab.id, viewState, updateTabData]);

	// Update draw function when dependencies change
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		drawRef.current = () => {
			// Clear canvas
			ctx.fillStyle = "#2a2a2a";
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			// Apply transforms for pan and zoom
			ctx.save();
			ctx.translate(pan.x, pan.y);
			ctx.scale(viewState.scale, viewState.scale);

			// Draw grid
			const gridSize = 16; // 16px grid
			const gridExtent = 500; // Draw grid from -500 to +500
			ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
			ctx.lineWidth = 1 / viewState.scale;

			// Vertical lines
			for (let x = -gridExtent; x <= gridExtent; x += gridSize) {
				ctx.beginPath();
				ctx.moveTo(x, -gridExtent);
				ctx.lineTo(x, gridExtent);
				ctx.stroke();
			}

			// Horizontal lines
			for (let y = -gridExtent; y <= gridExtent; y += gridSize) {
				ctx.beginPath();
				ctx.moveTo(-gridExtent, y);
				ctx.lineTo(gridExtent, y);
				ctx.stroke();
			}

			// Draw sprite layers (sorted by zIndex)
			const sortedLayers = [...entityData.sprites].sort(
				(a, b) => a.zIndex - b.zIndex,
			);

			for (const layer of sortedLayers) {
				const tileset = getTilesetById(layer.tilesetId);

				const offset = layer.offset || { x: 0, y: 0 };
				const origin = layer.origin || { x: 0, y: 0 };
				const rotation = layer.rotation || 0;

				// Convert normalized origin (0-1) to pixel coordinates
				const originX = origin.x * layer.sprite.width;
				const originY = origin.y * layer.sprite.height;

				ctx.save();
				// Translate to where the origin point should be in world space
				ctx.translate(offset.x, offset.y);
				// Rotate around the origin point
				if (rotation !== 0) {
					ctx.rotate((rotation * Math.PI) / 180);
				}
				// Offset by the origin so it becomes the anchor point
				ctx.translate(-originX, -originY);

				// Draw the sprite or placeholder
				if (tileset && tileset.imageData) {
					// Draw actual sprite
					ctx.drawImage(
						tileset.imageData,
						layer.sprite.x,
						layer.sprite.y,
						layer.sprite.width,
						layer.sprite.height,
						0,
						0,
						layer.sprite.width,
						layer.sprite.height,
					);
				} else {
					// Draw placeholder for missing sprite
					const gradient = ctx.createLinearGradient(
						0,
						0,
						layer.sprite.width,
						layer.sprite.height,
					);
					gradient.addColorStop(0, "#663399");
					gradient.addColorStop(1, "#8844AA");

					// Draw background rectangle
					ctx.fillStyle = gradient;
					ctx.fillRect(0, 0, layer.sprite.width, layer.sprite.height);

					// Draw border
					ctx.strokeStyle = "#AA66CC";
					ctx.lineWidth = 2 / viewState.scale;
					ctx.strokeRect(0, 0, layer.sprite.width, layer.sprite.height);

					// Draw X pattern
					ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
					ctx.lineWidth = 3 / viewState.scale;
					ctx.beginPath();
					ctx.moveTo(layer.sprite.width * 0.2, layer.sprite.height * 0.2);
					ctx.lineTo(layer.sprite.width * 0.8, layer.sprite.height * 0.8);
					ctx.moveTo(layer.sprite.width * 0.8, layer.sprite.height * 0.2);
					ctx.lineTo(layer.sprite.width * 0.2, layer.sprite.height * 0.8);
					ctx.stroke();

					// Draw "?" text in center
					ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
					ctx.font = `${Math.max(16, layer.sprite.height * 0.4) / viewState.scale}px Arial`;
					ctx.textAlign = "center";
					ctx.textBaseline = "middle";
					ctx.fillText("?", layer.sprite.width / 2, layer.sprite.height / 2);
				}

				// Draw colliders from the tile (only if tileset exists)
				if (tileset) {
					const tile = tileset.tiles.find((t) => {
						const tileX = t.x;
						const tileY = t.y;
						const tileWidth = t.width || tileset.tileWidth;
						const tileHeight = t.height || tileset.tileHeight;

						return (
							layer.sprite.x >= tileX &&
							layer.sprite.y >= tileY &&
							layer.sprite.x + layer.sprite.width <= tileX + tileWidth &&
							layer.sprite.y + layer.sprite.height <= tileY + tileHeight
						);
					});

					if (tile && tile.colliders) {
						for (const collider of tile.colliders) {
							if (collider.points.length < 2) continue;

							// Calculate the offset of the sprite within the tile
							const spriteOffsetX = layer.sprite.x - tile.x;
							const spriteOffsetY = layer.sprite.y - tile.y;

							ctx.strokeStyle = "rgba(0, 255, 0, 0.7)";
							ctx.lineWidth = 2 / viewState.scale;
							ctx.beginPath();

							const firstPoint = collider.points[0];
							ctx.moveTo(
								firstPoint.x - spriteOffsetX,
								firstPoint.y - spriteOffsetY,
							);

							for (let i = 1; i < collider.points.length; i++) {
								const point = collider.points[i];
								ctx.lineTo(point.x - spriteOffsetX, point.y - spriteOffsetY);
							}

							ctx.closePath();
							ctx.stroke();
						}
					}
				}

				ctx.restore();
			}

			// Draw entity-level colliders
			if (entityData.colliders) {
				for (const collider of entityData.colliders) {
					if (collider.points.length < 2) continue;

					const isSelected = collider.id === selectedColliderId;

					// Draw collider polygon with selection highlighting
					ctx.strokeStyle = isSelected
						? "rgba(255, 200, 0, 1)"
						: "rgba(255, 165, 0, 0.8)";
					ctx.fillStyle = isSelected
						? "rgba(255, 200, 0, 0.2)"
						: "rgba(255, 165, 0, 0.1)";
					ctx.lineWidth = isSelected
						? 3 / viewState.scale
						: 2 / viewState.scale;
					ctx.beginPath();

					const firstPoint = collider.points[0];
					ctx.moveTo(firstPoint.x, firstPoint.y);

					for (let i = 1; i < collider.points.length; i++) {
						const point = collider.points[i];
						ctx.lineTo(point.x, point.y);
					}

					ctx.closePath();
					ctx.fill();
					ctx.stroke();

					// Draw control points for selected collider
					if (isSelected) {
						collider.points.forEach((point, index) => {
							const isPointSelected = index === selectedColliderPointIndex;
							ctx.fillStyle = isPointSelected
								? "rgba(255, 255, 0, 0.9)"
								: "rgba(255, 200, 0, 0.9)";
							ctx.beginPath();
							ctx.arc(
								point.x,
								point.y,
								(isPointSelected ? 6 : 4) / viewState.scale,
								0,
								Math.PI * 2,
							);
							ctx.fill();

							// Draw point index numbers
							ctx.fillStyle = "#fff";
							ctx.font = `${10 / viewState.scale}px monospace`;
							ctx.fillText(
								index.toString(),
								point.x + 8 / viewState.scale,
								point.y - 8 / viewState.scale,
							);
						});

						// Draw center marker
						const sumX = collider.points.reduce((sum, p) => sum + p.x, 0);
						const sumY = collider.points.reduce((sum, p) => sum + p.y, 0);
						const centerX = sumX / collider.points.length;
						const centerY = sumY / collider.points.length;

						const crossSize = 10 / viewState.scale;

						ctx.strokeStyle = "rgba(100, 200, 255, 1)";
						ctx.fillStyle = "rgba(100, 200, 255, 1)";
						ctx.lineWidth = 2 / viewState.scale;

						// Draw crosshair
						ctx.beginPath();
						ctx.moveTo(centerX - crossSize, centerY);
						ctx.lineTo(centerX + crossSize, centerY);
						ctx.moveTo(centerX, centerY - crossSize);
						ctx.lineTo(centerX, centerY + crossSize);
						ctx.stroke();

						// Draw center circle
						ctx.beginPath();
						ctx.arc(centerX, centerY, 3 / viewState.scale, 0, Math.PI * 2);
						ctx.fill();
					}
				}
			}

			// Draw collider being drawn (Tiled-like visualization)
			if (isDrawing && drawingPoints.length > 0) {
				// Draw lines connecting points
				ctx.strokeStyle = "rgba(100, 150, 255, 0.8)";
				ctx.lineWidth = 2 / viewState.scale;
				ctx.beginPath();

				const firstPoint = drawingPoints[0];
				ctx.moveTo(firstPoint.x, firstPoint.y);

				for (let i = 1; i < drawingPoints.length; i++) {
					const point = drawingPoints[i];
					ctx.lineTo(point.x, point.y);
				}

				ctx.stroke();

				// Draw points
				drawingPoints.forEach((point, index) => {
					// First point is red and larger, others are blue
					if (index === 0) {
						ctx.fillStyle = "rgba(255, 100, 100, 0.9)";
						ctx.beginPath();
						ctx.arc(point.x, point.y, 6 / viewState.scale, 0, Math.PI * 2);
						ctx.fill();
					} else {
						ctx.fillStyle = "rgba(100, 150, 255, 0.9)";
						ctx.beginPath();
						ctx.arc(point.x, point.y, 4 / viewState.scale, 0, Math.PI * 2);
						ctx.fill();
					}
				});

				// Draw red ring around first point when we have 3+ points (closure hint)
				if (drawingPoints.length >= 3) {
					ctx.strokeStyle = "rgba(255, 100, 100, 0.9)";
					ctx.lineWidth = 3 / viewState.scale;
					ctx.beginPath();
					ctx.arc(
						firstPoint.x,
						firstPoint.y,
						8 / viewState.scale,
						0,
						Math.PI * 2,
					);
					ctx.stroke();
				}
			}

			// Draw selection outline and origin marker for selected sprite
			if (selectedSpriteLayerId) {
				const selectedLayer = entityData.sprites.find(
					(l) => l.id === selectedSpriteLayerId,
				);
				if (selectedLayer) {
					const offset = selectedLayer.offset || { x: 0, y: 0 };
					const origin = selectedLayer.origin || { x: 0, y: 0 };
					const rotation = selectedLayer.rotation || 0;

					// Convert normalized origin (0-1) to pixel coordinates
					const originX = origin.x * selectedLayer.sprite.width;
					const originY = origin.y * selectedLayer.sprite.height;

					ctx.save();
					// Match the same transform as sprite rendering
					ctx.translate(offset.x, offset.y);
					if (rotation !== 0) {
						ctx.rotate((rotation * Math.PI) / 180);
					}
					ctx.translate(-originX, -originY);

					// Draw selection outline
					ctx.strokeStyle = "rgba(0, 122, 204, 0.9)";
					ctx.lineWidth = 2 / viewState.scale;
					ctx.strokeRect(
						0,
						0,
						selectedLayer.sprite.width,
						selectedLayer.sprite.height,
					);

					// Draw origin marker (crosshair) - always at the origin point
					const crossSize = 8 / viewState.scale;

					ctx.strokeStyle = "rgba(255, 100, 100, 1)";
					ctx.fillStyle = "rgba(255, 100, 100, 1)";
					ctx.lineWidth = 2 / viewState.scale;

					// Draw crosshair
					ctx.beginPath();
					ctx.moveTo(originX - crossSize, originY);
					ctx.lineTo(originX + crossSize, originY);
					ctx.moveTo(originX, originY - crossSize);
					ctx.lineTo(originX, originY + crossSize);
					ctx.stroke();

					// Draw center circle
					ctx.beginPath();
					ctx.arc(originX, originY, 3 / viewState.scale, 0, Math.PI * 2);
					ctx.fill();

					// Draw YSort offset marker if it exists
					const ysortOffset = selectedLayer.ysortOffset || 0;
					if (ysortOffset !== 0) {
						const ysortY = originY + ysortOffset;
						const lineLength = 15 / viewState.scale;

						ctx.strokeStyle = "rgba(100, 255, 100, 1)";
						ctx.fillStyle = "rgba(100, 255, 100, 1)";
						ctx.lineWidth = 2 / viewState.scale;

						// Draw horizontal line
						ctx.beginPath();
						ctx.moveTo(originX - lineLength, ysortY);
						ctx.lineTo(originX + lineLength, ysortY);
						ctx.stroke();

						// Draw small circles at the ends
						ctx.beginPath();
						ctx.arc(
							originX - lineLength,
							ysortY,
							2 / viewState.scale,
							0,
							Math.PI * 2,
						);
						ctx.arc(
							originX + lineLength,
							ysortY,
							2 / viewState.scale,
							0,
							Math.PI * 2,
						);
						ctx.fill();

						// Draw vertical line connecting origin to ysort position
						ctx.setLineDash([4 / viewState.scale, 4 / viewState.scale]);
						ctx.strokeStyle = "rgba(100, 255, 100, 0.5)";
						ctx.lineWidth = 1 / viewState.scale;
						ctx.beginPath();
						ctx.moveTo(originX, originY);
						ctx.lineTo(originX, ysortY);
						ctx.stroke();
						ctx.setLineDash([]);
					}

					ctx.restore();
				}
			}

			ctx.restore();
		};
	}, [
		entityData,
		viewState,
		pan,
		getTilesetById,
		selectedSpriteLayerId,
		selectedColliderId,
		selectedColliderPointIndex,
		isDrawing,
		drawingPoints,
	]);

	// Trigger render when dependencies change
	useEffect(() => {
		drawRef.current();
	}, [
		entityData,
		viewState,
		pan,
		getTilesetById,
		selectedSpriteLayerId,
		selectedColliderId,
		selectedColliderPointIndex,
		isDrawing,
		drawingPoints,
	]);

	// Setup canvas resizing with ResizeObserver
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;

		const resizeCanvas = () => {
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;
			// Immediately redraw after resizing to prevent blank canvas
			drawRef.current();
		};

		resizeCanvas();

		// Resize canvas continuously during panel resize
		const resizeObserver = new ResizeObserver(() => {
			resizeCanvas();
		});
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	// Mouse handlers for panning and sprite dragging
	const handleMouseDown = (e: React.MouseEvent) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		// Get click position in world coordinates
		const rect = canvas.getBoundingClientRect();
		const canvasX = e.clientX - rect.left;
		const canvasY = e.clientY - rect.top;
		const worldX = (canvasX - pan.x) / viewState.scale;
		const worldY = (canvasY - pan.y) / viewState.scale;

		// Handle drawing mode (Tiled-like click-to-place)
		if (isDrawing && e.button === 0) {
			// Snap to integer coordinates
			const snappedX = Math.round(worldX);
			const snappedY = Math.round(worldY);

			// Check if clicking near first point to close polygon (need at least 3 points)
			if (drawingPoints.length >= 3) {
				const firstPoint = drawingPoints[0];
				const distance = calculateDistance(
					{ x: snappedX, y: snappedY },
					firstPoint,
				);

				// Threshold of 8 pixels (adjusted for zoom)
				if (distance <= 8 / viewState.scale) {
					// Close the polygon
					handleFinishDrawing();
					return;
				}
			}

			// Add point to drawing
			setDrawingPoints([...drawingPoints, { x: snappedX, y: snappedY }]);
			return;
		}

		// Check for collider click (left click only, not panning, not drawing)
		if (e.button === 0 && !e.shiftKey && !isDrawing) {
			// If a collider is already selected, check if clicking on one of its points to drag
			if (selectedColliderId) {
				const selectedCollider = (entityData.colliders || []).find(
					(c) => c.id === selectedColliderId,
				);
				if (selectedCollider) {
					const pointIndex = findPointAtPosition(
						selectedCollider.points,
						worldX,
						worldY,
					);
					if (pointIndex !== null) {
						// Start dragging this point
						setSelectedColliderPointIndex(pointIndex);
						setIsDraggingColliderPoint(true);
						return;
					}

					// Check if clicking on the collider body (not on a point) to drag the whole collider
					if (isPointInPolygon(worldX, worldY, selectedCollider.points)) {
						setIsDraggingCollider(true);
						setColliderDragStart({
							x: worldX,
							y: worldY,
							originalPoints: [...selectedCollider.points],
						});
						return;
					}
				}
			}

			// Check if we clicked on a collider
			for (const collider of entityData.colliders || []) {
				if (
					collider.points.length >= 3 &&
					isPointInPolygon(worldX, worldY, collider.points)
				) {
					setSelectedColliderId(collider.id || null);
					setSelectedSpriteLayerId(null); // Deselect sprite when selecting collider
					setSelectedColliderPointIndex(null); // Reset point selection
					return; // Don't check sprites
				}
			}
		}

		// Check for sprite layer click (left click only, not panning)
		if (e.button === 0 && !e.shiftKey && !isDrawing) {
			// Check if we clicked on the already selected sprite to start dragging
			if (selectedSpriteLayerId) {
				const selectedLayer = entityData.sprites.find(
					(l) => l.id === selectedSpriteLayerId,
				);
				if (selectedLayer) {
					const offset = selectedLayer.offset || { x: 0, y: 0 };
					const origin = selectedLayer.origin || { x: 0, y: 0 };

					// Convert normalized origin to pixel coordinates
					const originX = origin.x * selectedLayer.sprite.width;
					const originY = origin.y * selectedLayer.sprite.height;

					// Calculate actual sprite bounds in world space (accounting for origin)
					const minX = offset.x - originX;
					const minY = offset.y - originY;
					const maxX = offset.x - originX + selectedLayer.sprite.width;
					const maxY = offset.y - originY + selectedLayer.sprite.height;

					if (
						worldX >= minX &&
						worldX <= maxX &&
						worldY >= minY &&
						worldY <= maxY
					) {
						// Start dragging the selected sprite
						setIsDraggingSprite(true);
						setSpriteDragStart({
							x: worldX,
							y: worldY,
							offsetX: offset.x,
							offsetY: offset.y,
						});
						return;
					}
				}
			}

			// Iterate through sprite layers back to front (highest zIndex first) to select
			const sortedLayers = [...entityData.sprites].sort(
				(a, b) => b.zIndex - a.zIndex,
			);

			for (const layer of sortedLayers) {
				const offset = layer.offset || { x: 0, y: 0 };
				const origin = layer.origin || { x: 0, y: 0 };

				// Convert normalized origin to pixel coordinates
				const originX = origin.x * layer.sprite.width;
				const originY = origin.y * layer.sprite.height;

				// Calculate actual sprite bounds in world space (accounting for origin)
				const minX = offset.x - originX;
				const minY = offset.y - originY;
				const maxX = offset.x - originX + layer.sprite.width;
				const maxY = offset.y - originY + layer.sprite.height;

				if (
					worldX >= minX &&
					worldX <= maxX &&
					worldY >= minY &&
					worldY <= maxY
				) {
					// Clicked on this sprite layer
					setSelectedSpriteLayerId(layer.id);
					setSelectedColliderId(null); // Deselect collider when selecting sprite
					return; // Don't start panning
				}
			}

			// No sprite clicked, deselect both sprite and collider
			setSelectedSpriteLayerId(null);
			setSelectedColliderId(null);
		}

		if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
			// Middle mouse or Shift+Left mouse for panning
			setIsDragging(true);
			setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
		}
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (isDragging) {
			setPan({
				x: e.clientX - dragStart.x,
				y: e.clientY - dragStart.y,
			});
		} else if (isDraggingSprite && spriteDragStart && selectedSpriteLayerId) {
			// Update sprite position during drag
			const canvas = canvasRef.current;
			if (!canvas) return;

			const rect = canvas.getBoundingClientRect();
			const canvasX = e.clientX - rect.left;
			const canvasY = e.clientY - rect.top;
			const worldX = (canvasX - pan.x) / viewState.scale;
			const worldY = (canvasY - pan.y) / viewState.scale;

			// Calculate the new offset
			const deltaX = worldX - spriteDragStart.x;
			const deltaY = worldY - spriteDragStart.y;
			const newOffsetX = spriteDragStart.offsetX + deltaX;
			const newOffsetY = spriteDragStart.offsetY + deltaY;

			// Update the sprite layer offset
			handleUpdateSpriteLayer(selectedSpriteLayerId, {
				offset: { x: newOffsetX, y: newOffsetY },
			});
		} else if (
			isDraggingColliderPoint &&
			selectedColliderPointIndex !== null &&
			selectedColliderId
		) {
			// Update collider point position during drag
			const canvas = canvasRef.current;
			if (!canvas) return;

			const rect = canvas.getBoundingClientRect();
			const canvasX = e.clientX - rect.left;
			const canvasY = e.clientY - rect.top;
			const worldX = (canvasX - pan.x) / viewState.scale;
			const worldY = (canvasY - pan.y) / viewState.scale;

			// Snap to integer coordinates
			const snappedX = Math.round(worldX);
			const snappedY = Math.round(worldY);

			// Update the point position
			const updatedColliders = (entityData.colliders || []).map((c) => {
				if (c.id === selectedColliderId) {
					const newPoints = [...c.points];
					newPoints[selectedColliderPointIndex] = { x: snappedX, y: snappedY };
					return { ...c, points: newPoints };
				}
				return c;
			});

			updateTabData(tab.id, {
				entityData: {
					...entityData,
					colliders: updatedColliders,
				},
				isDirty: true,
			});
		} else if (isDraggingCollider && colliderDragStart && selectedColliderId) {
			// Update entire collider position during drag
			const canvas = canvasRef.current;
			if (!canvas) return;

			const rect = canvas.getBoundingClientRect();
			const canvasX = e.clientX - rect.left;
			const canvasY = e.clientY - rect.top;
			const worldX = (canvasX - pan.x) / viewState.scale;
			const worldY = (canvasY - pan.y) / viewState.scale;

			// Calculate delta from initial drag start position
			const deltaX = worldX - colliderDragStart.x;
			const deltaY = worldY - colliderDragStart.y;

			// Apply delta to original points (not the current points)
			const updatedColliders = (entityData.colliders || []).map((c) => {
				if (c.id === selectedColliderId) {
					const newPoints = colliderDragStart.originalPoints.map((p) => ({
						x: Math.round(p.x + deltaX),
						y: Math.round(p.y + deltaY),
					}));
					return { ...c, points: newPoints };
				}
				return c;
			});

			updateTabData(tab.id, {
				entityData: {
					...entityData,
					colliders: updatedColliders,
				},
				isDirty: true,
			});
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
		setIsDraggingSprite(false);
		setSpriteDragStart(null);
		setIsDraggingColliderPoint(false);
		setIsDraggingCollider(false);
		setColliderDragStart(null);
	};

	// Context menu handler for canvas
	const handleCanvasContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();

		// If in drawing mode, cancel drawing
		if (isDrawing) {
			handleCancelDrawing();
			return;
		}

		// Get canvas position
		const rect = canvasRef.current?.getBoundingClientRect();
		if (!rect) return;

		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		// Convert to world coordinates
		const worldX = (mouseX - pan.x) / viewState.scale;
		const worldY = (mouseY - pan.y) / viewState.scale;

		// If a collider is selected, check for point or edge clicks first
		if (selectedColliderId) {
			const selectedCollider = (entityData.colliders || []).find(
				(c) => c.id === selectedColliderId,
			);
			if (selectedCollider) {
				// Check if clicking on a point
				const pointIndex = findPointAtPosition(
					selectedCollider.points,
					worldX,
					worldY,
				);
				if (pointIndex !== null) {
					setContextMenu({
						x: e.clientX,
						y: e.clientY,
						spriteLayerId: null,
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
					setContextMenu({
						x: e.clientX,
						y: e.clientY,
						spriteLayerId: null,
						colliderId: selectedCollider.id,
						edgeIndex: edge.edgeIndex,
						insertPosition: edge.insertPosition,
					});
					return;
				}
			}
		}

		// Check if we right-clicked on a collider
		for (const collider of entityData.colliders || []) {
			if (
				collider.points.length >= 3 &&
				isPointInPolygon(worldX, worldY, collider.points)
			) {
				setContextMenu({
					x: e.clientX,
					y: e.clientY,
					spriteLayerId: null,
					colliderId: collider.id,
				});
				return;
			}
		}

		// Check if we right-clicked on a sprite (front to back)
		const sortedLayers = [...entityData.sprites].sort(
			(a, b) => (b.zIndex || 0) - (a.zIndex || 0),
		);

		let clickedSpriteId: string | null = null;
		for (const layer of sortedLayers) {
			const offset = layer.offset || { x: 0, y: 0 };
			const origin = layer.origin || { x: 0, y: 0 };

			// Convert normalized origin to pixel coordinates
			const originX = origin.x * layer.sprite.width;
			const originY = origin.y * layer.sprite.height;

			// Calculate actual sprite bounds in world space (accounting for origin)
			const minX = offset.x - originX;
			const minY = offset.y - originY;
			const maxX = offset.x - originX + layer.sprite.width;
			const maxY = offset.y - originY + layer.sprite.height;

			if (
				worldX >= minX &&
				worldX <= maxX &&
				worldY >= minY &&
				worldY <= maxY
			) {
				clickedSpriteId = layer.id;
				break;
			}
		}

		setContextMenu({
			x: e.clientX,
			y: e.clientY,
			spriteLayerId: clickedSpriteId,
			colliderId: undefined,
		});
	};

	// Open sprite picker
	const handleOpenSpritePicker = () => {
		setContextMenu(null);
		// Initialize with first available tileset if any
		if (tilesets.length > 0 && !selectedTilesetId) {
			setSelectedTilesetId(tilesets[0].id);
		}
		setIsSpritePicking(true);
		setSelectedRegion(null);
	};

	// Add sprite layer
	const handleAddSpriteLayer = () => {
		if (!selectedRegion || !selectedTilesetId) return;

		const tileset = getTilesetById(selectedTilesetId);
		if (!tileset) return;

		const newLayer: SpriteLayer = {
			id: `sprite_${Date.now()}`,
			name: `Layer ${entityData.sprites.length + 1}`,
			tilesetId: selectedTilesetId,
			sprite: {
				x: selectedRegion.x * tileset.tileWidth,
				y: selectedRegion.y * tileset.tileHeight,
				width: selectedRegion.width * tileset.tileWidth,
				height: selectedRegion.height * tileset.tileHeight,
			},
			offset: { x: 0, y: 0 },
			origin: { x: 0, y: 0 },
			rotation: 0,
			zIndex: 0,
			ysortOffset: 0,
		};

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				sprites: [...entityData.sprites, newLayer],
			},
			isDirty: true,
		});

		setIsSpritePicking(false);
		setSelectedRegion(null);
	};

	// Save name changes
	const handleNameSave = () => {
		updateTabData(tab.id, {
			title: editedName,
			entityData: {
				...entityData,
				name: editedName,
			},
			isDirty: true,
		});
		setIsEditingName(false);
	};

	// Save type changes
	const handleTypeSave = () => {
		updateTabData(tab.id, {
			entityData: {
				...entityData,
				type: editedType,
			},
			isDirty: true,
		});
		setIsEditingType(false);
	};

	// Add new property
	const handleAddProperty = () => {
		// Generate a unique temporary key for the new property
		let newKey = `__temp_${Date.now()}`;

		const updatedProperties = {
			...(entityData.properties || {}),
			[newKey]: "",
		};

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				properties: updatedProperties,
			},
			isDirty: true,
		});

		// Auto-focus the new property key for editing
		setEditingPropertyKey(newKey);
	};

	// Delete property
	const handleDeleteProperty = (key: string) => {
		const updatedProperties = { ...(entityData.properties || {}) };
		delete updatedProperties[key];

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				properties: updatedProperties,
			},
			isDirty: true,
		});
	};

	// Update property key (rename)
	const handleUpdatePropertyKey = (oldKey: string, newKey: string) => {
		// If empty key, delete the property
		if (!newKey.trim()) {
			handleDeleteProperty(oldKey);
			setEditingPropertyKey(null);
			return;
		}

		if (oldKey === newKey) return;

		// Check if new key already exists
		if (
			entityData.properties &&
			entityData.properties[newKey] &&
			newKey !== oldKey
		) {
			return; // Don't allow duplicate keys
		}

		const updatedProperties = { ...(entityData.properties || {}) };
		const value = updatedProperties[oldKey];
		delete updatedProperties[oldKey];
		updatedProperties[newKey] = value;

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				properties: updatedProperties,
			},
			isDirty: true,
		});
	};

	// Update property value
	const handleUpdatePropertyValue = (key: string, value: string) => {
		const updatedProperties = {
			...(entityData.properties || {}),
			[key]: value,
		};

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				properties: updatedProperties,
			},
			isDirty: true,
		});
	};

	// Delete sprite layer
	const handleDeleteSpriteLayer = (layerId: string) => {
		const updatedSprites = entityData.sprites.filter((s) => s.id !== layerId);

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				sprites: updatedSprites,
			},
			isDirty: true,
		});

		if (selectedSpriteLayerId === layerId) {
			setSelectedSpriteLayerId(null);
		}
	};

	// Update sprite layer properties
	const handleUpdateSpriteLayer = (
		layerId: string,
		updates: Partial<SpriteLayer>,
	) => {
		const updatedSprites = entityData.sprites.map((s) => {
			if (s.id === layerId) {
				return { ...s, ...updates };
			}
			return s;
		});

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				sprites: updatedSprites,
			},
			isDirty: true,
		});
	};

	// Update colliders
	const handleCollisionUpdate = (updatedColliders: PolygonCollider[]) => {
		updateTabData(tab.id, {
			entityData: {
				...entityData,
				colliders: updatedColliders,
			},
			isDirty: true,
		});
	};

	// Update collider properties
	const handleUpdateCollider = (
		colliderId: string,
		updates: Partial<PolygonCollider>,
	) => {
		const updatedColliders = (entityData.colliders || []).map((c) => {
			if (c.id === colliderId) {
				return { ...c, ...updates };
			}
			return c;
		});

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				colliders: updatedColliders,
			},
			isDirty: true,
		});
	};

	// Helper: Calculate distance between two points
	const calculateDistance = (
		p1: { x: number; y: number },
		p2: { x: number; y: number },
	) => {
		const dx = p1.x - p2.x;
		const dy = p1.y - p2.y;
		return Math.sqrt(dx * dx + dy * dy);
	};

	// Helper: Find point at position
	const findPointAtPosition = (
		points: Array<{ x: number; y: number }>,
		x: number,
		y: number,
	): number | null => {
		const threshold = 8 / viewState.scale;
		for (let i = 0; i < points.length; i++) {
			const dx = points[i].x - x;
			const dy = points[i].y - y;
			if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
				return i;
			}
		}
		return null;
	};

	// Helper: Find edge at position
	const findEdgeAtPosition = (
		points: Array<{ x: number; y: number }>,
		x: number,
		y: number,
	): { edgeIndex: number; insertPosition: { x: number; y: number } } | null => {
		if (points.length < 2) return null;

		const threshold = 8 / viewState.scale;

		for (let i = 0; i < points.length; i++) {
			const p1 = points[i];
			const p2 = points[(i + 1) % points.length];

			const dx = p2.x - p1.x;
			const dy = p2.y - p1.y;
			const lengthSquared = dx * dx + dy * dy;

			if (lengthSquared === 0) continue;

			const t = Math.max(
				0,
				Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSquared),
			);
			const projX = p1.x + t * dx;
			const projY = p1.y + t * dy;

			const distX = x - projX;
			const distY = y - projY;
			const distance = Math.sqrt(distX * distX + distY * distY);

			if (distance <= threshold) {
				return {
					edgeIndex: i,
					insertPosition: { x: projX, y: projY },
				};
			}
		}

		return null;
	};

	// Start drawing a new collider
	const handleStartDrawing = () => {
		setIsDrawing(true);
		setDrawingPoints([]);
		setContextMenu(null);
	};

	// Cancel drawing
	const handleCancelDrawing = () => {
		setIsDrawing(false);
		setDrawingPoints([]);
	};

	// Finish drawing and create collider
	const handleFinishDrawing = () => {
		if (drawingPoints.length < 3) {
			// Need at least 3 points for a polygon
			return;
		}

		const newCollider: PolygonCollider = {
			id: `collider-${Date.now()}`,
			points: drawingPoints,
		};

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				colliders: [...(entityData.colliders || []), newCollider],
			},
			isDirty: true,
		});

		setIsDrawing(false);
		setDrawingPoints([]);
	};

	// Helper: Check if point is inside a polygon
	const isPointInPolygon = (
		x: number,
		y: number,
		points: Array<{ x: number; y: number }>,
	) => {
		let inside = false;
		for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
			const xi = points[i].x;
			const yi = points[i].y;
			const xj = points[j].x;
			const yj = points[j].y;

			const intersect =
				yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
			if (intersect) inside = !inside;
		}
		return inside;
	};

	// Delete a collider
	const handleDeleteCollider = (colliderId: string) => {
		const updatedColliders = (entityData.colliders || []).filter(
			(c) => c.id !== colliderId,
		);

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				colliders: updatedColliders,
			},
			isDirty: true,
		});

		setContextMenu(null);
		if (selectedColliderId === colliderId) {
			setSelectedColliderId(null);
			setSelectedColliderPointIndex(null);
		}
	};

	// Delete a point from a collider
	const handleDeleteColliderPoint = () => {
		if (
			contextMenu &&
			contextMenu.pointIndex !== undefined &&
			contextMenu.colliderId
		) {
			const collider = (entityData.colliders || []).find(
				(c) => c.id === contextMenu.colliderId,
			);
			if (collider && collider.points.length > 3) {
				const newPoints = collider.points.filter(
					(_, i) => i !== contextMenu.pointIndex,
				);
				const updatedColliders = (entityData.colliders || []).map((c) =>
					c.id === contextMenu.colliderId ? { ...c, points: newPoints } : c,
				);
				updateTabData(tab.id, {
					entityData: {
						...entityData,
						colliders: updatedColliders,
					},
					isDirty: true,
				});
			}
		}
		setContextMenu(null);
		setSelectedColliderPointIndex(null);
	};

	// Insert a point into a collider edge
	const handleInsertColliderPoint = () => {
		if (
			contextMenu &&
			contextMenu.edgeIndex !== undefined &&
			contextMenu.insertPosition &&
			contextMenu.colliderId
		) {
			const snappedX = Math.round(contextMenu.insertPosition.x);
			const snappedY = Math.round(contextMenu.insertPosition.y);

			const updatedColliders = (entityData.colliders || []).map((c) => {
				if (c.id === contextMenu.colliderId) {
					const newPoints = [...c.points];
					newPoints.splice(contextMenu.edgeIndex! + 1, 0, {
						x: snappedX,
						y: snappedY,
					});
					return { ...c, points: newPoints };
				}
				return c;
			});

			updateTabData(tab.id, {
				entityData: {
					...entityData,
					colliders: updatedColliders,
				},
				isDirty: true,
			});
			setSelectedColliderPointIndex(contextMenu.edgeIndex! + 1);
		}
		setContextMenu(null);
	};

	// Calculate bounding box for collision editor
	const calculateEntityBoundingBox = () => {
		if (entityData.sprites.length === 0) {
			return { x: 0, y: 0, width: 100, height: 100 }; // Default size
		}

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const layer of entityData.sprites) {
			const offset = layer.offset || { x: 0, y: 0 };
			const layerMinX = offset.x;
			const layerMinY = offset.y;
			const layerMaxX = offset.x + layer.sprite.width;
			const layerMaxY = offset.y + layer.sprite.height;

			minX = Math.min(minX, layerMinX);
			minY = Math.min(minY, layerMinY);
			maxX = Math.max(maxX, layerMaxX);
			maxY = Math.max(maxY, layerMaxY);
		}

		return {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY,
		};
	};

	return (
		<div className="flex h-full w-full" style={{ background: "#1e1e1e" }}>
			{/* Left Side - Properties Panel */}
			<div
				className="w-80 flex flex-col overflow-hidden"
				style={{ background: "#252526", borderRight: "1px solid #3e3e42" }}
			>
				<div className="flex-1 overflow-y-auto">
					{/* Entity Info Section */}
					<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
						<div className="text-sm font-semibold text-gray-400 mb-3">
							ENTITY INFO
						</div>

						{/* Entity Name */}
						<div className="mb-3">
							<label className="text-xs text-gray-500 mb-1 block">Name</label>
							{isEditingName ? (
								<input
									type="text"
									value={editedName}
									onChange={(e) => setEditedName(e.target.value)}
									onBlur={handleNameSave}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleNameSave();
										if (e.key === "Escape") {
											setEditedName(entityData.name || "");
											setIsEditingName(false);
										}
									}}
									className="w-full px-2 py-1 text-sm rounded text-gray-200 focus:outline-none"
									style={{ background: "#3e3e42", border: "1px solid #007acc" }}
									autoFocus
								/>
							) : (
								<div
									onClick={() => setIsEditingName(true)}
									className="px-2 py-1 text-sm rounded text-gray-200 cursor-text"
									style={{ background: "#3e3e42", border: "1px solid #3e3e42" }}
									onMouseEnter={(e) =>
										(e.currentTarget.style.borderColor = "#555555")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.borderColor = "#3e3e42")
									}
								>
									{entityData.name || "(unnamed)"}
								</div>
							)}
						</div>

						{/* Entity Type */}
						<div>
							<label className="text-xs text-gray-500 mb-1 block">Type</label>
							{isEditingType ? (
								<input
									type="text"
									value={editedType}
									onChange={(e) => setEditedType(e.target.value)}
									onBlur={handleTypeSave}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleTypeSave();
										if (e.key === "Escape") {
											setEditedType(entityData.type || "");
											setIsEditingType(false);
										}
									}}
									className="w-full px-2 py-1 text-sm rounded text-gray-200 focus:outline-none"
									style={{ background: "#3e3e42", border: "1px solid #007acc" }}
									autoFocus
								/>
							) : (
								<div
									onClick={() => setIsEditingType(true)}
									className="px-2 py-1 text-sm rounded text-gray-200 cursor-text"
									style={{ background: "#3e3e42", border: "1px solid #3e3e42" }}
									onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) =>
										(e.currentTarget.style.borderColor = "#555555")
									}
									onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) =>
										(e.currentTarget.style.borderColor = "#3e3e42")
									}
								>
									{entityData.type || "(none)"}
								</div>
							)}
						</div>
					</div>

					{/* Custom Properties Section */}
					<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
						<div className="text-sm font-semibold text-gray-400 mb-3 flex items-center justify-between">
							<span>CUSTOM PROPERTIES</span>
							<button
								onClick={handleAddProperty}
								className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
							>
								+ Add
							</button>
						</div>
						<div className="text-xs text-gray-500">
							{/* Property List */}
							{entityData.properties &&
							Object.keys(entityData.properties).length > 0 ? (
								<div className="space-y-2">
									{Object.entries(entityData.properties).map(([key, value]) => {
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
																}
															}}
															placeholder="Key"
															className="w-full px-2 py-1 text-xs rounded text-gray-200 focus:outline-none font-mono"
															style={{
																background: "#3e3e42",
																border: "1px solid #007acc",
																boxSizing: "border-box",
															}}
															autoFocus
														/>
													) : (
														<div
															onClick={() => setEditingPropertyKey(key)}
															className="text-gray-400 font-mono text-xs cursor-text px-2 py-1 rounded"
															style={{
																background: "#3e3e42",
																border: "1px solid transparent",
																boxSizing: "border-box",
															}}
															onMouseEnter={(e) =>
																(e.currentTarget.style.background = "#4a4a4e")
															}
															onMouseLeave={(e) =>
																(e.currentTarget.style.background = "#3e3e42")
															}
														>
															{displayKey || (
																<span style={{ opacity: 0.5 }}>
																	Key
																</span>
															)}
														</div>
													)}
												</div>
												<div className="flex-1" style={{ minWidth: 0 }}>
													{editingPropertyValue === key ? (
														<input
															type="text"
															value={value}
															onChange={(e) =>
																handleUpdatePropertyValue(key, e.target.value)
															}
															onBlur={() => setEditingPropertyValue(null)}
															onKeyDown={(e) => {
																if (e.key === "Enter" || e.key === "Escape") {
																	setEditingPropertyValue(null);
																}
															}}
															placeholder="Value"
															className="w-full px-2 py-1 text-xs rounded text-gray-200 focus:outline-none"
															style={{
																background: "#3e3e42",
																border: "1px solid #007acc",
																boxSizing: "border-box",
															}}
															autoFocus
														/>
													) : (
														<div
															onClick={() => setEditingPropertyValue(key)}
															className="text-gray-300 text-xs cursor-text px-2 py-1 rounded"
															style={{
																background: "#3e3e42",
																border: "1px solid transparent",
																boxSizing: "border-box",
															}}
															onMouseEnter={(e) =>
																(e.currentTarget.style.background = "#4a4a4e")
															}
															onMouseLeave={(e) =>
																(e.currentTarget.style.background = "#3e3e42")
															}
														>
															{value || (
																<span style={{ opacity: 0.5 }}>Value</span>
															)}
														</div>
													)}
												</div>
												<button
													onClick={() => handleDeleteProperty(key)}
													className="text-red-400 hover:text-red-300 text-sm flex-shrink-0"
													style={{ width: "20px" }}
												>
													✕
												</button>
											</div>
										);
									})}
								</div>
							) : (
								<div className="text-center py-4">No custom properties</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Middle - Canvas Preview */}
			<div
				ref={containerRef}
				className="flex-1 overflow-hidden relative"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onContextMenu={handleCanvasContextMenu}
				style={{
					cursor: isDragging
						? "grabbing"
						: isDraggingSprite
							? "move"
							: isDraggingColliderPoint
								? "move"
								: isDraggingCollider
									? "move"
									: isDrawing
										? "crosshair"
										: "default",
					background: "#1e1e1e",
				}}
			>
				<canvas
					ref={canvasRef}
					className="entity-canvas"
					style={{
						width: "100%",
						height: "100%",
						imageRendering: "pixelated",
					}}
				/>

				{/* Drawing mode hint banner */}
				{isDrawing && (
					<div
						className="absolute top-0 left-0 right-0 px-3 py-2 flex items-center justify-center text-sm"
						style={{
							background: "rgba(100, 150, 255, 0.95)",
							borderBottom: "1px solid rgba(100, 180, 255, 1)",
							color: "#ffffff",
							fontWeight: "500",
						}}
					>
						{drawingPoints.length < 3
							? `Drawing Collider - Click to place points (${drawingPoints.length})`
							: `Drawing Collider - Click to place points (${drawingPoints.length}) or click first point to close`}
						<span className="ml-3" style={{ opacity: 0.8 }}>
							• Right-click or Esc to cancel
						</span>
						{drawingPoints.length >= 3 && (
							<span className="ml-2" style={{ opacity: 0.8 }}>
								• Enter to finish
							</span>
						)}
					</div>
				)}

				{/* Status bar overlay */}
				<div
					className="absolute bottom-0 left-0 right-0 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300"
					style={{
						background: "rgba(37, 37, 38, 0.95)",
						borderTop: "1px solid #3e3e42",
					}}
				>
					<div className="flex items-center gap-2">
						<span className="text-gray-500">Sprite Layers:</span>
						<span className="font-mono">{entityData.sprites.length}</span>
					</div>
					<div className="w-px h-4" style={{ background: "#3e3e42" }} />
					<div className="flex items-center gap-2">
						<span className="text-gray-500">Children:</span>
						<span className="font-mono">
							{entityData.children?.length || 0}
						</span>
					</div>
					<div className="flex-1" />
					<div className="flex items-center gap-2">
						<span className="text-gray-500">Zoom:</span>
						<span className="font-mono">
							{Math.round(viewState.scale * 100)}%
						</span>
					</div>
				</div>
			</div>

			{/* Right Side - Collider Properties Panel (only visible when collider selected) */}
			{selectedColliderId &&
				!selectedSpriteLayerId &&
				(() => {
					const selectedCollider = (entityData.colliders || []).find(
						(c) => c.id === selectedColliderId,
					);
					if (!selectedCollider) return null;

					return (
						<div
							className="w-80 flex flex-col overflow-hidden"
							style={{ background: "#252526", borderLeft: "1px solid #3e3e42" }}
						>
							<div className="flex-1 overflow-y-auto">
								{/* Header */}
								<div
									className="p-4 flex items-center justify-between"
									style={{ borderBottom: "1px solid #3e3e42" }}
								>
									<div
										className="text-sm font-semibold"
										style={{ color: "#cccccc" }}
									>
										COLLIDER
									</div>
									<button
										onClick={() => setSelectedColliderId(null)}
										className="text-gray-400 hover:text-gray-200 transition-colors"
										title="Close"
									>
										✕
									</button>
								</div>

								{/* Collider Properties */}
								<div className="p-4 space-y-4">
									{/* Name */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Name
										</label>
										<input
											type="text"
											value={selectedCollider.name || ""}
											onChange={(e) => {
												handleUpdateCollider(selectedCollider.id!, {
													name: e.target.value,
												});
											}}
											className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #555",
											}}
											onFocus={(e) =>
												(e.currentTarget.style.borderColor = "#007acc")
											}
											onBlur={(e) =>
												(e.currentTarget.style.borderColor = "#555")
											}
											placeholder="Collider name"
										/>
									</div>

									{/* Type */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Type
										</label>
										<input
											type="text"
											value={selectedCollider.type || ""}
											onChange={(e) => {
												handleUpdateCollider(selectedCollider.id!, {
													type: e.target.value,
												});
											}}
											className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #555",
											}}
											onFocus={(e) =>
												(e.currentTarget.style.borderColor = "#007acc")
											}
											onBlur={(e) =>
												(e.currentTarget.style.borderColor = "#555")
											}
											placeholder="Collider type"
										/>
									</div>

									{/* Position (center of all points) */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Position
										</label>
										<div className="grid grid-cols-2 gap-2">
											<div className="flex">
												<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
													X
												</div>
												<div className="flex-1">
													<DragNumberInput
														value={(() => {
															// Calculate center X
															const sumX = selectedCollider.points.reduce(
																(sum, p) => sum + p.x,
																0,
															);
															return sumX / selectedCollider.points.length;
														})()}
														onChange={(newCenterX) => {
															// Calculate current center
															const sumX = selectedCollider.points.reduce(
																(sum, p) => sum + p.x,
																0,
															);
															const currentCenterX =
																sumX / selectedCollider.points.length;

															// Calculate delta
															const deltaX = newCenterX - currentCenterX;

															// Move all points by delta
															const newPoints = selectedCollider.points.map(
																(p) => ({
																	x: Math.round(p.x + deltaX),
																	y: p.y,
																}),
															);

															handleUpdateCollider(selectedCollider.id!, {
																points: newPoints,
															});
														}}
														dragSpeed={1}
														precision={1}
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
														value={(() => {
															// Calculate center Y
															const sumY = selectedCollider.points.reduce(
																(sum, p) => sum + p.y,
																0,
															);
															return sumY / selectedCollider.points.length;
														})()}
														onChange={(newCenterY) => {
															// Calculate current center
															const sumY = selectedCollider.points.reduce(
																(sum, p) => sum + p.y,
																0,
															);
															const currentCenterY =
																sumY / selectedCollider.points.length;

															// Calculate delta
															const deltaY = newCenterY - currentCenterY;

															// Move all points by delta
															const newPoints = selectedCollider.points.map(
																(p) => ({
																	x: p.x,
																	y: Math.round(p.y + deltaY),
																}),
															);

															handleUpdateCollider(selectedCollider.id!, {
																points: newPoints,
															});
														}}
														dragSpeed={1}
														precision={1}
														roundedLeft={false}
													/>
												</div>
											</div>
										</div>
									</div>

									{/* Point Count (read-only) */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Points
										</label>
										<div
											className="px-2.5 py-1.5 text-xs rounded"
											style={{
												background: "#3e3e42",
												color: "#858585",
												border: "1px solid #555",
											}}
										>
											{selectedCollider.points.length} points
										</div>
									</div>

									{/* Selected Point Position */}
									{selectedColliderPointIndex !== null &&
										selectedCollider.points[selectedColliderPointIndex] && (
											<div>
												<label
													className="text-xs font-medium block mb-1.5"
													style={{ color: "#858585" }}
												>
													Point {selectedColliderPointIndex} Position
												</label>
												<div className="grid grid-cols-2 gap-2">
													<div>
														<label
															className="text-xs block mb-1 flex items-center gap-1"
															style={{ color: "#686868" }}
														>
															<span
																className="font-bold"
																style={{ color: "#ff4444" }}
															>
																X
															</span>
															X
														</label>
														<DragNumberInput
															value={
																selectedCollider.points[
																	selectedColliderPointIndex
																].x
															}
															onChange={(x) => {
																const newPoints = [...selectedCollider.points];
																newPoints[selectedColliderPointIndex] = {
																	...newPoints[selectedColliderPointIndex],
																	x: Math.round(x),
																};
																handleUpdateCollider(selectedCollider.id!, {
																	points: newPoints,
																});
															}}
															dragSpeed={1}
															precision={0}
														/>
													</div>
													<div>
														<label
															className="text-xs block mb-1 flex items-center gap-1"
															style={{ color: "#686868" }}
														>
															<span
																className="font-bold"
																style={{ color: "#44ff44" }}
															>
																Y
															</span>
															Y
														</label>
														<DragNumberInput
															value={
																selectedCollider.points[
																	selectedColliderPointIndex
																].y
															}
															onChange={(y) => {
																const newPoints = [...selectedCollider.points];
																newPoints[selectedColliderPointIndex] = {
																	...newPoints[selectedColliderPointIndex],
																	y: Math.round(y),
																};
																handleUpdateCollider(selectedCollider.id!, {
																	points: newPoints,
																});
															}}
															dragSpeed={1}
															precision={0}
														/>
													</div>
												</div>
											</div>
										)}
								</div>
							</div>
						</div>
					);
				})()}

			{/* Right Side - Sprite Properties Panel (only visible when sprite selected) */}
			{selectedSpriteLayerId &&
				(() => {
					const selectedLayer = entityData.sprites.find(
						(l) => l.id === selectedSpriteLayerId,
					);
					if (!selectedLayer) return null;

					return (
						<div
							className="w-80 flex flex-col overflow-hidden"
							style={{ background: "#252526", borderLeft: "1px solid #3e3e42" }}
						>
							<div className="flex-1 overflow-y-auto">
								{/* Header */}
								<div
									className="p-4 flex items-center justify-between"
									style={{ borderBottom: "1px solid #3e3e42" }}
								>
									<div
										className="text-sm font-semibold"
										style={{ color: "#cccccc" }}
									>
										SPRITE
									</div>
									<button
										onClick={() => setSelectedSpriteLayerId(null)}
										className="text-gray-400 hover:text-gray-200 transition-colors"
										title="Close"
									>
										✕
									</button>
								</div>

								{/* Sprite Properties */}
								<div className="p-4 space-y-4">
									{/* Name */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Name
										</label>
										<input
											type="text"
											value={selectedLayer.name || ""}
											onChange={(e) => {
												handleUpdateSpriteLayer(selectedLayer.id, {
													name: e.target.value,
												});
											}}
											className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #555",
											}}
											onFocus={(e) =>
												(e.currentTarget.style.borderColor = "#007acc")
											}
											onBlur={(e) =>
												(e.currentTarget.style.borderColor = "#555")
											}
											placeholder="Layer name"
										/>
									</div>

									{/* Type */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Type
										</label>
										<input
											type="text"
											value={selectedLayer.type || ""}
											onChange={(e) => {
												handleUpdateSpriteLayer(selectedLayer.id, {
													type: e.target.value,
												});
											}}
											className="w-full px-2.5 py-1.5 text-xs rounded focus:outline-none"
											style={{
												background: "#3e3e42",
												color: "#cccccc",
												border: "1px solid #555",
											}}
											onFocus={(e) =>
												(e.currentTarget.style.borderColor = "#007acc")
											}
											onBlur={(e) =>
												(e.currentTarget.style.borderColor = "#555")
											}
											placeholder="Layer type"
										/>
									</div>

									{/* Position (Offset) */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Position
										</label>
										<div className="grid grid-cols-2 gap-2">
											<div className="flex">
												<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
													X
												</div>
												<div className="flex-1">
													<DragNumberInput
														value={selectedLayer.offset?.x || 0}
														onChange={(x) => {
															handleUpdateSpriteLayer(selectedLayer.id, {
																offset: {
																	y: selectedLayer.offset?.y || 0,
																	x,
																},
															});
														}}
														dragSpeed={1}
														precision={0}
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
														value={selectedLayer.offset?.y || 0}
														onChange={(y) => {
															handleUpdateSpriteLayer(selectedLayer.id, {
																offset: {
																	x: selectedLayer.offset?.x || 0,
																	y,
																},
															});
														}}
														dragSpeed={1}
														precision={0}
														roundedLeft={false}
													/>
												</div>
											</div>
										</div>
									</div>

									{/* Origin */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Origin (Pivot/Anchor)
										</label>
										<div className="grid grid-cols-2 gap-2">
											<div className="flex">
												<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
													X
												</div>
												<div className="flex-1">
													<DragNumberInput
														value={selectedLayer.origin?.x || 0}
														onChange={(x) => {
															const newOrigin = {
																y: 0,
																...selectedLayer.origin,
																x,
															};
															handleUpdateSpriteLayer(selectedLayer.id, {
																origin: newOrigin,
															});
														}}
														min={0}
														max={1}
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
														value={selectedLayer.origin?.y || 0}
														onChange={(y) => {
															const newOrigin = {
																x: 0,
																...selectedLayer.origin,
																y,
															};
															handleUpdateSpriteLayer(selectedLayer.id, {
																origin: newOrigin,
															});
														}}
														min={0}
														max={1}
														dragSpeed={0.01}
														precision={2}
														roundedLeft={false}
													/>
												</div>
											</div>
										</div>
									</div>

									{/* YSort Offset */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											YSort Offset
										</label>
										<DragNumberInput
											value={selectedLayer.ysortOffset || 0}
											onChange={(value) => {
												handleUpdateSpriteLayer(selectedLayer.id, {
													ysortOffset: value,
												});
											}}
											dragSpeed={1}
											precision={0}
										/>
									</div>

									{/* Rotation */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Rotation (degrees)
										</label>
										<DragNumberInput
											value={selectedLayer.rotation || 0}
											onChange={(value) => {
												handleUpdateSpriteLayer(selectedLayer.id, {
													rotation: value,
												});
											}}
											dragSpeed={1}
											precision={1}
										/>
									</div>

									{/* Z-Index */}
									<div>
										<label
											className="text-xs font-medium block mb-1.5"
											style={{ color: "#858585" }}
										>
											Z-Index (Layer Order)
										</label>
										<DragNumberInput
											value={selectedLayer.zIndex}
											onChange={(value) => {
												handleUpdateSpriteLayer(selectedLayer.id, {
													zIndex: Math.round(value),
												});
											}}
											dragSpeed={0.1}
											precision={0}
										/>
									</div>
								</div>
							</div>
						</div>
					);
				})()}

			{/* Context Menu */}
			{contextMenu &&
				createPortal(
					<>
						{/* Backdrop */}
						<div
							className="fixed inset-0 z-40"
							onClick={() => setContextMenu(null)}
						/>
						{/* Menu */}
						<div
							className="fixed z-50 min-w-[200px] py-1 rounded shadow-lg"
							style={{
								top: contextMenu.y,
								left: contextMenu.x,
								background: "#252526",
								border: "1px solid #3e3e42",
							}}
						>
							{contextMenu.colliderId ? (
								// Right-clicked on collider
								<>
									{contextMenu.pointIndex !== undefined && (
										<div
											className="px-4 py-2 text-sm cursor-pointer transition-colors"
											style={{ color: "#f48771" }}
											onMouseEnter={(e) =>
												(e.currentTarget.style.background = "#3e3e42")
											}
											onMouseLeave={(e) =>
												(e.currentTarget.style.background = "transparent")
											}
											onClick={handleDeleteColliderPoint}
										>
											Delete Point
										</div>
									)}
									{contextMenu.edgeIndex !== undefined && (
										<>
											<div
												className="px-4 py-2 text-sm cursor-pointer transition-colors"
												style={{ color: "#4ade80" }}
												onMouseEnter={(e) =>
													(e.currentTarget.style.background = "#3e3e42")
												}
												onMouseLeave={(e) =>
													(e.currentTarget.style.background = "transparent")
												}
												onClick={handleInsertColliderPoint}
											>
												Add Point
											</div>
											<div
												className="px-4 py-2 text-sm cursor-pointer transition-colors"
												style={{ color: "#f48771" }}
												onMouseEnter={(e) =>
													(e.currentTarget.style.background = "#3e3e42")
												}
												onMouseLeave={(e) =>
													(e.currentTarget.style.background = "transparent")
												}
												onClick={() => {
													if (contextMenu.colliderId) {
														handleDeleteCollider(contextMenu.colliderId);
													}
												}}
											>
												Delete Collider
											</div>
										</>
									)}
									{contextMenu.pointIndex === undefined &&
										contextMenu.edgeIndex === undefined && (
											<div
												className="px-4 py-2 text-sm cursor-pointer transition-colors"
												style={{ color: "#f48771" }}
												onMouseEnter={(e) =>
													(e.currentTarget.style.background = "#3e3e42")
												}
												onMouseLeave={(e) =>
													(e.currentTarget.style.background = "transparent")
												}
												onClick={() => {
													if (contextMenu.colliderId) {
														handleDeleteCollider(contextMenu.colliderId);
													}
												}}
											>
												Delete Collider
											</div>
										)}
								</>
							) : contextMenu.spriteLayerId ? (
								// Right-clicked on sprite
								<div
									className="px-4 py-2 text-sm cursor-pointer transition-colors"
									style={{ color: "#f48771" }}
									onMouseEnter={(e) =>
										(e.currentTarget.style.background = "#3e3e42")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.background = "transparent")
									}
									onClick={() => {
										if (contextMenu.spriteLayerId) {
											handleDeleteSpriteLayer(contextMenu.spriteLayerId);
											setContextMenu(null);
										}
									}}
								>
									Delete Sprite
								</div>
							) : (
								// Right-clicked on empty space
								<>
									<div
										className="px-4 py-2 text-sm cursor-pointer transition-colors"
										style={{ color: "#cccccc" }}
										onMouseEnter={(e) =>
											(e.currentTarget.style.background = "#3e3e42")
										}
										onMouseLeave={(e) =>
											(e.currentTarget.style.background = "transparent")
										}
										onClick={handleOpenSpritePicker}
									>
										Add Sprite Layer
									</div>
									<div
										className="px-4 py-2 text-sm cursor-pointer transition-colors"
										style={{ color: "#cccccc" }}
										onMouseEnter={(e) =>
											(e.currentTarget.style.background = "#3e3e42")
										}
										onMouseLeave={(e) =>
											(e.currentTarget.style.background = "transparent")
										}
										onClick={handleStartDrawing}
									>
										Add Collider
									</div>
								</>
							)}
						</div>
					</>,
					document.body,
				)}

			{/* Collision Editor Modal */}
			{isEditingCollision &&
				(() => {
					const bbox = calculateEntityBoundingBox();
					const colliders = entityData.colliders || [{ points: [] }];

					// Create a composite image from all sprite layers for the background
					// For now, we'll use null and just show the bounding box
					const backgroundImage: HTMLImageElement | null = null;

					return (
						<div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
							<div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-[90vw] h-[95vh] flex flex-col">
								<div className="mb-4 flex items-center justify-between">
									<h2 className="text-lg font-semibold text-gray-200">
										Edit Collision - {entityData.name || "Entity"}
									</h2>
									<button
										onClick={() => setIsEditingCollision(false)}
										className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
									>
										Done
									</button>
								</div>
								<CollisionEditor
									width={Math.max(bbox.width, 1)}
									height={Math.max(bbox.height, 1)}
									colliders={colliders}
									onUpdate={handleCollisionUpdate}
									backgroundImage={backgroundImage!}
									backgroundRect={{
										x: bbox.x,
										y: bbox.y,
										width: bbox.width,
										height: bbox.height,
									}}
								/>
							</div>
						</div>
					);
				})()}

			{/* Sprite Picker Modal */}
			{isSpritePicking &&
				(() => {
					const selectedTileset = selectedTilesetId
						? getTilesetById(selectedTilesetId)
						: null;

					// Handle canvas mouse events for sprite selection
					const handlePickerMouseDown = (
						e: React.MouseEvent<HTMLCanvasElement>,
					) => {
						if (!selectedTileset) return;
						const canvas = pickerCanvasRef.current;
						if (!canvas) return;

						const rect = canvas.getBoundingClientRect();
						// Account for canvas scaling
						const scaleX = canvas.width / rect.width;
						const scaleY = canvas.height / rect.height;
						const canvasX = (e.clientX - rect.left) * scaleX;
						const canvasY = (e.clientY - rect.top) * scaleY;

						// Check if we clicked on a compound tile
						let foundCompoundTile = false;
						for (const tile of selectedTileset.tiles || []) {
							if (tile.width && tile.height) {
								// Check if click is within this compound tile's bounds
								const tileRight =
									tile.x + (tile.width || selectedTileset.tileWidth);
								const tileBottom =
									tile.y + (tile.height || selectedTileset.tileHeight);

								if (
									canvasX >= tile.x &&
									canvasX < tileRight &&
									canvasY >= tile.y &&
									canvasY < tileBottom
								) {
									// Clicked on this compound tile, select its entire region
									const regionX = Math.floor(
										tile.x / selectedTileset.tileWidth,
									);
									const regionY = Math.floor(
										tile.y / selectedTileset.tileHeight,
									);
									const regionWidth = Math.ceil(
										(tile.width || selectedTileset.tileWidth) /
											selectedTileset.tileWidth,
									);
									const regionHeight = Math.ceil(
										(tile.height || selectedTileset.tileHeight) /
											selectedTileset.tileHeight,
									);

									setSelectedRegion({
										x: regionX,
										y: regionY,
										width: regionWidth,
										height: regionHeight,
									});

									foundCompoundTile = true;
									break;
								}
							}
						}

						if (!foundCompoundTile) {
							// No compound tile found, start normal selection
							const x = Math.floor(canvasX / selectedTileset.tileWidth);
							const y = Math.floor(canvasY / selectedTileset.tileHeight);

							setPickerDragStart({ x, y });
							setIsPickerDragging(true);
							setSelectedRegion({ x, y, width: 1, height: 1 });
						}
					};

					const handlePickerMouseMove = (
						e: React.MouseEvent<HTMLCanvasElement>,
					) => {
						if (!isPickerDragging || !pickerDragStart || !selectedTileset)
							return;
						const canvas = pickerCanvasRef.current;
						if (!canvas) return;

						const rect = canvas.getBoundingClientRect();
						// Account for canvas scaling
						const scaleX = canvas.width / rect.width;
						const scaleY = canvas.height / rect.height;
						const canvasX = (e.clientX - rect.left) * scaleX;
						const canvasY = (e.clientY - rect.top) * scaleY;

						const x = Math.floor(canvasX / selectedTileset.tileWidth);
						const y = Math.floor(canvasY / selectedTileset.tileHeight);

						const minX = Math.min(pickerDragStart.x, x);
						const minY = Math.min(pickerDragStart.y, y);
						const maxX = Math.max(pickerDragStart.x, x);
						const maxY = Math.max(pickerDragStart.y, y);

						setSelectedRegion({
							x: minX,
							y: minY,
							width: maxX - minX + 1,
							height: maxY - minY + 1,
						});
					};

					const handlePickerMouseUp = () => {
						setIsPickerDragging(false);
					};

					return (
						<div
							className="fixed inset-0 z-50 flex items-center justify-center p-4"
							style={{ background: "rgba(0, 0, 0, 0.75)" }}
						>
							<div
								className="rounded-lg shadow-xl p-6 w-full max-w-[90vw] h-[95vh] flex flex-col"
								style={{ background: "#2d2d30" }}
							>
								<div className="mb-4 flex items-center justify-between">
									<h2
										className="text-lg font-semibold"
										style={{ color: "#cccccc" }}
									>
										Add Sprite Layer
									</h2>
									<div className="flex gap-2">
										<button
											onClick={() => {
												setIsSpritePicking(false);
												setSelectedRegion(null);
											}}
											className="px-4 py-2 rounded transition-colors"
											style={{
												background: "#3e3e42",
												border: "1px solid #555",
												color: "#cccccc",
											}}
											onMouseEnter={(e) =>
												(e.currentTarget.style.background = "#505050")
											}
											onMouseLeave={(e) =>
												(e.currentTarget.style.background = "#3e3e42")
											}
										>
											Cancel
										</button>
										<button
											onClick={handleAddSpriteLayer}
											disabled={!selectedRegion}
											className="px-4 py-2 rounded transition-colors"
											style={{
												background: selectedRegion ? "#0e639c" : "#3e3e42",
												border: selectedRegion
													? "1px solid #1177bb"
													: "1px solid #555",
												color: "#ffffff",
												cursor: selectedRegion ? "pointer" : "not-allowed",
											}}
											onMouseEnter={(e) => {
												if (selectedRegion)
													e.currentTarget.style.background = "#1177bb";
											}}
											onMouseLeave={(e) => {
												if (selectedRegion)
													e.currentTarget.style.background = "#0e639c";
											}}
										>
											Add
										</button>
									</div>
								</div>

								{/* Tileset Selection */}
								<div className="mb-4">
									<label
										className="text-sm mb-2 block"
										style={{ color: "#858585" }}
									>
										Select Tileset
									</label>
									<select
										value={selectedTilesetId}
										onChange={(e) => {
											setSelectedTilesetId(e.target.value);
											setSelectedRegion(null);
										}}
										className="w-full px-3 py-2 rounded focus:outline-none"
										style={{
											background: "#3e3e42",
											color: "#cccccc",
											border: "1px solid #555",
										}}
										onFocus={(e) =>
											(e.currentTarget.style.borderColor = "#007acc")
										}
										onBlur={(e) => (e.currentTarget.style.borderColor = "#555")}
									>
										{tilesets.length === 0 ? (
											<option value="">No tilesets available</option>
										) : (
											tilesets.map((tileset) => (
												<option key={tileset.id} value={tileset.id}>
													{tileset.name}
												</option>
											))
										)}
									</select>
								</div>

								{/* Canvas Container */}
								<div
									className="flex-1 overflow-auto rounded p-4"
									style={{ background: "#1e1e1e" }}
								>
									{selectedTileset && selectedTileset.imageData ? (
										<canvas
											ref={pickerCanvasRef}
											onMouseDown={handlePickerMouseDown}
											onMouseMove={handlePickerMouseMove}
											onMouseUp={handlePickerMouseUp}
											onMouseLeave={handlePickerMouseUp}
											className="cursor-crosshair"
											style={{ imageRendering: "pixelated" }}
										/>
									) : (
										<div
											className="text-center py-8"
											style={{ color: "#858585" }}
										>
											{tilesets.length === 0
												? "No tilesets available. Create a tileset first."
												: "Select a tileset to choose a sprite."}
										</div>
									)}
								</div>

								{/* Selection Info */}
								{selectedRegion && selectedTileset && (
									<div className="mt-4 text-sm" style={{ color: "#858585" }}>
										Selection: {selectedRegion.width} × {selectedRegion.height}{" "}
										tiles ({selectedRegion.width * selectedTileset.tileWidth} ×{" "}
										{selectedRegion.height * selectedTileset.tileHeight} pixels)
									</div>
								)}
							</div>
						</div>
					);
				})()}
		</div>
	);
};
