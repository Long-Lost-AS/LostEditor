import { useRef, useEffect, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { entityManager } from "../managers/EntityManager";
import { unpackTileId, packTileId } from "../utils/tileId";
import { MapData } from "../types";

interface MapCanvasProps {
	mapData: MapData;
	onPlaceTile: (x: number, y: number) => void;
	onEraseTile: (x: number, y: number) => void;
	onPlaceEntity: (x: number, y: number) => void;
}

export const MapCanvas = ({
	mapData,
	onPlaceTile,
	onEraseTile,
	onPlaceEntity,
}: MapCanvasProps) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const {
		currentTool,
		tilesetImage,
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
	} = useEditor();

	const [isDragging, setIsDragging] = useState(false);
	const [isDrawing, setIsDrawing] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartY, setDragStartY] = useState(0);
	const [mouseScreenPos, setMouseScreenPos] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// Refs to track current pan values for wheel event
	const panXRef = useRef(panX);
	const panYRef = useRef(panY);
	const zoomRef = useRef(zoom);
	const mouseScreenPosRef = useRef<{ x: number; y: number } | null>(null);
	const selectedTilesetIdRef = useRef(selectedTilesetId);
	const selectedTileIdRef = useRef(selectedTileId);
	const currentToolRef = useRef(currentTool);

	useEffect(() => {
		panXRef.current = panX;
		panYRef.current = panY;
		zoomRef.current = zoom;
		mouseScreenPosRef.current = mouseScreenPos;
		selectedTilesetIdRef.current = selectedTilesetId;
		selectedTileIdRef.current = selectedTileId;
		currentToolRef.current = currentTool;
	}, [
		panX,
		panY,
		zoom,
		mouseScreenPos,
		selectedTilesetId,
		selectedTileId,
		currentTool,
	]);

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
				console.error("MapCanvas: Invalid mapData received", mapData);
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
					let tileCount = 0;
					for (let index = 0; index < layer.tiles.length; index++) {
						const tileId = layer.tiles[index];
						if (tileId === 0) continue; // Skip empty tiles

						tileCount++;
						// Calculate x, y position from array index
						const x = index % mapData.width;
						const y = Math.floor(index / mapData.width);

						// Unpack tile geometry from the packed ID (includes tileset index)
						const geometry = unpackTileId(tileId);

						// Get tileset by index
						const tileset = tilesets[geometry.tilesetIndex];
						if (!tileset?.imageData) {
							console.log(
								"No tileset or imageData at index:",
								geometry.tilesetIndex,
							);
							continue;
						}

						// Create local tile ID (with tileset index 0) to find the tile definition
						const localTileId = packTileId(
							geometry.x,
							geometry.y,
							0,
							geometry.flipX,
							geometry.flipY,
						);

						// Try to find tile definition to get width/height for compound tiles
						const tileDefinition = tileset.tiles.find(
							(t) => t.id === localTileId,
						);

						// Determine source width/height
						let sourceWidth = tileset.tileWidth;
						let sourceHeight = tileset.tileHeight;

						if (tileDefinition?.width && tileDefinition?.height) {
							// Compound tile - use definition's dimensions
							sourceWidth = tileDefinition.width;
							sourceHeight = tileDefinition.height;
						}

						// Draw the tile
						ctx.drawImage(
							tileset.imageData,
							geometry.x,
							geometry.y,
							sourceWidth,
							sourceHeight,
							x * mapData.tileWidth,
							y * mapData.tileHeight,
							sourceWidth,
							sourceHeight,
						);
					}
				} else if (layer.type === "entity") {
					// Render entity layer
					layer.entities.forEach((entityInstance) => {
						const tileset = getTilesetById(entityInstance.tilesetId);
						if (!tileset?.imageData) return;

						const entityDef = entityManager.getEntityDefinition(
							entityInstance.tilesetId,
							entityInstance.entityDefId,
						);

						if (!entityDef) return;

						// Render entity with hierarchy
						renderEntity(ctx, entityDef, entityInstance, tileset.imageData);
					});
				}
			});

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
					const sourceWidth = tileDef?.width || tileset.tileWidth;
					const sourceHeight = tileDef?.height || tileset.tileHeight;

					// Semi-transparent preview
					ctx.globalAlpha = 0.5;

					ctx.drawImage(
						tileset.imageData,
						geometry.x,
						geometry.y,
						sourceWidth,
						sourceHeight,
						tileX * mapData.tileWidth,
						tileY * mapData.tileHeight,
						sourceWidth,
						sourceHeight,
					);

					ctx.globalAlpha = 1.0;
				}
			}

			ctx.restore();
		};
	}, [
		mapData,
		tilesetImage,
		tilesets,
		zoom,
		panX,
		panY,
		gridVisible,
		getTilesetById,
		mouseScreenPos,
		currentTool,
		selectedTilesetId,
		selectedTileId,
	]);

	// Trigger render when dependencies change
	useEffect(() => {
		renderMap.current();
	}, [
		mapData,
		tilesetImage,
		tilesets,
		zoom,
		panX,
		panY,
		gridVisible,
		getTilesetById,
		mouseScreenPos,
		currentTool,
		selectedTilesetId,
		selectedTileId,
	]);

	// Render an entity with its hierarchy
	const renderEntity = (
		ctx: CanvasRenderingContext2D,
		entityDef: any,
		instance: any,
		tilesetImage: HTMLImageElement,
		parentX: number = instance.x,
		parentY: number = instance.y,
		parentRotation: number = 0,
	) => {
		ctx.save();

		// Apply instance transform
		const x = parentX + (entityDef.offset?.x || 0);
		const y = parentY + (entityDef.offset?.y || 0);
		const rotation =
			parentRotation + (entityDef.rotation || 0) + (instance.rotation || 0);

		ctx.translate(x, y);
		if (rotation !== 0) {
			ctx.rotate((rotation * Math.PI) / 180);
		}

		// Draw sprite
		ctx.drawImage(
			tilesetImage,
			entityDef.sprite.x,
			entityDef.sprite.y,
			entityDef.sprite.width,
			entityDef.sprite.height,
			0,
			0,
			entityDef.sprite.width,
			entityDef.sprite.height,
		);

		ctx.restore();

		// Render children
		if (entityDef.children) {
			entityDef.children.forEach((child: any) => {
				renderEntity(ctx, child, instance, tilesetImage, x, y, rotation);
			});
		}
	};

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
			// Left click = Draw
			setIsDrawing(true);
			const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);
			const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);

			if (currentTool === "pencil") {
				onPlaceTile(tileX, tileY);
			} else if (currentTool === "eraser") {
				onEraseTile(tileX, tileY);
			} else if (currentTool === "entity") {
				// Place entity at pixel coordinates
				onPlaceEntity(Math.floor(worldX), Math.floor(worldY));
			}
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		// Store screen coordinates for hover preview (will be converted to world coords on render)
		setMouseScreenPos({ x: e.clientX, y: e.clientY });

		// Trigger a render to show the hover preview
		renderMap.current();

		if (isDragging) {
			setPan(e.clientX - dragStartX, e.clientY - dragStartY);
		} else if (isDrawing) {
			const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);
			if (currentTool === "pencil") {
				onPlaceTile(tileX, tileY);
			} else if (currentTool === "eraser") {
				onEraseTile(tileX, tileY);
			}
			// Entity tool doesn't drag-paint
		}
	};

	const handleMouseLeave = () => {
		setMouseScreenPos(null);
	};

	const handleMouseUp = () => {
		setIsDragging(false);
		setIsDrawing(false);
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
	}, []);

	return (
		<div className="canvas-container">
			<canvas
				ref={canvasRef}
				className="map-canvas"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseLeave}
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
		</div>
	);
};
