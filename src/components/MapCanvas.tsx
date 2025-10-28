import { useRef, useEffect, useState } from "react";
import { useEditor } from "../context/EditorContext";
import { entityManager } from "../managers/EntityManager";

export const MapCanvas = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const {
		mapData,
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
		placeTile,
		eraseTile,
		placeEntity,
	} = useEditor();

	const [isDragging, setIsDragging] = useState(false);
	const [isDrawing, setIsDrawing] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartY, setDragStartY] = useState(0);
	const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

	// Refs to track current pan values for wheel event
	const panXRef = useRef(panX);
	const panYRef = useRef(panY);
	const zoomRef = useRef(zoom);

	useEffect(() => {
		panXRef.current = panX;
		panYRef.current = panY;
		zoomRef.current = zoom;
	}, [panX, panY, zoom]);

	// Render the map
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Clear canvas
		ctx.fillStyle = "#2a2a2a";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.save();
		ctx.translate(panX, panY);
		ctx.scale(zoom, zoom);

		// Render each layer bottom-to-top
		mapData.layers.forEach((layer) => {
			if (!layer.visible) return;

			if (layer.type === 'tile' || !layer.type) {
				// Render tile layer
				layer.tiles.forEach((tile) => {
					// Try new multi-tileset system first
					if (tile.tilesetId && tile.tileId && tile.tilesetId !== 'legacy') {
						const tileset = getTilesetById(tile.tilesetId);
						if (tileset?.imageData) {
							const tileDefinition = tileset.tiles.find(t => t.id === tile.tileId);
							if (tileDefinition) {
								const tileWidth = tileDefinition.width || tileset.tileWidth;
								const tileHeight = tileDefinition.height || tileset.tileHeight;

								ctx.drawImage(
									tileset.imageData,
									tileDefinition.x,
									tileDefinition.y,
									tileWidth,
									tileHeight,
									tile.x * mapData.tileWidth,
									tile.y * mapData.tileHeight,
									tileWidth,
									tileHeight,
								);
							}
						}
					} else if (tilesetImage && tile.tilesetX !== undefined && tile.tilesetY !== undefined) {
						// Legacy single tileset rendering
						ctx.drawImage(
							tilesetImage,
							tile.tilesetX * mapData.tileWidth,
							tile.tilesetY * mapData.tileHeight,
							mapData.tileWidth,
							mapData.tileHeight,
							tile.x * mapData.tileWidth,
							tile.y * mapData.tileHeight,
							mapData.tileWidth,
							mapData.tileHeight,
						);
					}
				});
			} else if (layer.type === 'entity') {
				// Render entity layer
				layer.entities.forEach((entityInstance) => {
					const tileset = getTilesetById(entityInstance.tilesetId);
					if (!tileset?.imageData) return;

					const entityDef = entityManager.getEntityDefinition(
						entityInstance.tilesetId,
						entityInstance.entityDefId
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
				ctx.lineTo(x * mapData.tileWidth, mapData.height * mapData.tileHeight);
				ctx.stroke();
			}

			for (let y = 0; y <= mapData.height; y++) {
				ctx.beginPath();
				ctx.moveTo(0, y * mapData.tileHeight);
				ctx.lineTo(mapData.width * mapData.tileWidth, y * mapData.tileHeight);
				ctx.stroke();
			}
		}

		ctx.restore();
	}, [mapData, tilesetImage, tilesets, zoom, panX, panY, gridVisible, getTilesetById, canvasSize]);

	// Render an entity with its hierarchy
	const renderEntity = (
		ctx: CanvasRenderingContext2D,
		entityDef: any,
		instance: any,
		tilesetImage: HTMLImageElement,
		parentX: number = instance.x,
		parentY: number = instance.y,
		parentRotation: number = 0
	) => {
		ctx.save();

		// Apply instance transform
		const x = parentX + (entityDef.offset?.x || 0);
		const y = parentY + (entityDef.offset?.y || 0);
		const rotation = parentRotation + (entityDef.rotation || 0) + (instance.rotation || 0);

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
			entityDef.sprite.height
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
				placeTile(tileX, tileY);
			} else if (currentTool === "eraser") {
				eraseTile(tileX, tileY);
			} else if (currentTool === "entity") {
				// Place entity at pixel coordinates
				placeEntity(Math.floor(worldX), Math.floor(worldY));
			}
		}
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isDragging) {
			setPan(e.clientX - dragStartX, e.clientY - dragStartY);
		} else if (isDrawing) {
			const { tileX, tileY } = getTileCoords(e.clientX, e.clientY);

			if (currentTool === "pencil") {
				placeTile(tileX, tileY);
			} else if (currentTool === "eraser") {
				eraseTile(tileX, tileY);
			}
			// Entity tool doesn't drag-paint
		}
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
			setCanvasSize({ width: parent.clientWidth, height: parent.clientHeight });
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

		// Watch for parent container size changes
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
				onMouseLeave={handleMouseUp}
			/>
		</div>
	);
};
