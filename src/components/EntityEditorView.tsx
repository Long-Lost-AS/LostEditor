import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";
import { EntityEditorTab, SpriteLayer, PolygonCollider } from "../types";
import { CollisionEditor } from "./CollisionEditor";

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
		null
	);
	const [newPropertyKey, setNewPropertyKey] = useState("");
	const [newPropertyValue, setNewPropertyValue] = useState("");
	const [isAddingProperty, setIsAddingProperty] = useState(false);
	const [selectedSpriteLayerId, setSelectedSpriteLayerId] = useState<
		string | null
	>(null);
	const [isEditingCollision, setIsEditingCollision] = useState(false);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
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
	const [pickerDragStart, setPickerDragStart] = useState<{ x: number; y: number } | null>(null);
	const [isPickerDragging, setIsPickerDragging] = useState(false);
	const pickerCanvasRef = useRef<HTMLCanvasElement>(null);

	// Refs to track current pan and zoom values
	const panRef = useRef(pan);
	const scaleRef = useRef(viewState.scale);

	useEffect(() => {
		panRef.current = pan;
		scaleRef.current = viewState.scale;
	}, [pan, viewState.scale]);

	// Draw sprite picker canvas
	useEffect(() => {
		if (!isSpritePicking) return;

		const canvas = pickerCanvasRef.current;
		const selectedTileset = selectedTilesetId ? getTilesetById(selectedTilesetId) : null;
		if (!canvas || !selectedTileset || !selectedTileset.imageData) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const image = selectedTileset.imageData;
		canvas.width = image.width;
		canvas.height = image.height;

		// Draw tileset image
		ctx.drawImage(image, 0, 0);

		// Draw grid
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
		ctx.lineWidth = 1;

		// Vertical lines
		for (let x = 0; x <= image.width; x += selectedTileset.tileWidth) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, image.height);
			ctx.stroke();
		}

		// Horizontal lines
		for (let y = 0; y <= image.height; y += selectedTileset.tileHeight) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(image.width, y);
			ctx.stroke();
		}

		// Draw selection
		if (selectedRegion) {
			ctx.fillStyle = 'rgba(0, 122, 204, 0.3)';
			ctx.strokeStyle = '#007acc';
			ctx.lineWidth = 2;
			ctx.fillRect(
				selectedRegion.x * selectedTileset.tileWidth,
				selectedRegion.y * selectedTileset.tileHeight,
				selectedRegion.width * selectedTileset.tileWidth,
				selectedRegion.height * selectedTileset.tileHeight
			);
			ctx.strokeRect(
				selectedRegion.x * selectedTileset.tileWidth,
				selectedRegion.y * selectedTileset.tileHeight,
				selectedRegion.width * selectedTileset.tileWidth,
				selectedRegion.height * selectedTileset.tileHeight
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

	// Draw entity preview on canvas
	useEffect(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const draw = () => {
			// Resize canvas to fill container
			canvas.width = container.clientWidth;
			canvas.height = container.clientHeight;

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
				(a, b) => a.zIndex - b.zIndex
			);

			for (const layer of sortedLayers) {
				const tileset = getTilesetById(layer.tilesetId);
				if (!tileset || !tileset.imageData) continue;

				const offset = layer.offset || { x: 0, y: 0 };
				const rotation = layer.rotation || 0;

				ctx.save();
				ctx.translate(offset.x, offset.y);
				if (rotation !== 0) {
					ctx.rotate((rotation * Math.PI) / 180);
				}

				// Draw the sprite
				ctx.drawImage(
					tileset.imageData,
					layer.sprite.x,
					layer.sprite.y,
					layer.sprite.width,
					layer.sprite.height,
					0,
					0,
					layer.sprite.width,
					layer.sprite.height
				);

				ctx.restore();
			}

			ctx.restore();
		};

		draw();
	}, [entityData, viewState, pan, getTilesetById]);

	// Mouse handlers for panning
	const handleMouseDown = (e: React.MouseEvent) => {
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
		}
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	// Context menu handler for canvas
	const handleCanvasContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
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
			rotation: 0,
			zIndex: Math.max(...entityData.sprites.map((s) => s.zIndex), 0) + 1,
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
			entityData: {
				...entityData,
				name: editedName,
			},
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
		});
		setIsEditingType(false);
	};

	// Add new property
	const handleAddProperty = () => {
		if (!newPropertyKey.trim()) return;

		const updatedProperties = {
			...(entityData.properties || {}),
			[newPropertyKey]: newPropertyValue,
		};

		updateTabData(tab.id, {
			entityData: {
				...entityData,
				properties: updatedProperties,
			},
			isDirty: true,
		});

		setNewPropertyKey("");
		setNewPropertyValue("");
		setIsAddingProperty(false);
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

	// Move sprite layer up (increase zIndex)
	const handleMoveSpriteLayerUp = (layerId: string) => {
		const layer = entityData.sprites.find((s) => s.id === layerId);
		if (!layer) return;

		const updatedSprites = entityData.sprites.map((s) => {
			if (s.id === layerId) {
				return { ...s, zIndex: s.zIndex + 1 };
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

	// Move sprite layer down (decrease zIndex)
	const handleMoveSpriteLayerDown = (layerId: string) => {
		const layer = entityData.sprites.find((s) => s.id === layerId);
		if (!layer) return;

		const updatedSprites = entityData.sprites.map((s) => {
			if (s.id === layerId) {
				return { ...s, zIndex: s.zIndex - 1 };
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
		<div className="flex h-full w-full" style={{ background: '#1e1e1e' }}>
			{/* Left Side - Properties Panel */}
			<div className="w-80 flex flex-col overflow-hidden" style={{ background: '#252526', borderRight: '1px solid #3e3e42' }}>
				<div className="flex-1 overflow-y-auto">
					{/* Entity Info Section */}
					<div className="p-4" style={{ borderBottom: '1px solid #3e3e42' }}>
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
									style={{ background: '#3e3e42', border: '1px solid #007acc' }}
									autoFocus
								/>
							) : (
								<div
									onClick={() => setIsEditingName(true)}
									className="px-2 py-1 text-sm rounded text-gray-200 cursor-text"
									style={{ background: '#3e3e42', border: '1px solid #3e3e42' }}
									onMouseEnter={(e) => e.currentTarget.style.borderColor = '#555555'}
									onMouseLeave={(e) => e.currentTarget.style.borderColor = '#3e3e42'}
								>
									{entityData.name || "(unnamed)"}
								</div>
							)}
						</div>

						{/* Entity Type */}
						<div className="mb-3">
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
									style={{ background: '#3e3e42', border: '1px solid #007acc' }}
									autoFocus
								/>
							) : (
								<div
									onClick={() => setIsEditingType(true)}
									className="px-2 py-1 text-sm rounded text-gray-200 cursor-text"
									style={{ background: '#3e3e42', border: '1px solid #3e3e42' }}
									onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.borderColor = '#555555')}
									onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.borderColor = '#3e3e42')}
								>
									{entityData.type || "(none)"}
								</div>
							)}
						</div>

						{/* Entity ID */}
						<div>
							<label className="text-xs text-gray-500 mb-1 block">ID</label>
							<div className="px-2 py-1 text-sm rounded text-gray-400 font-mono"
									style={{ background: '#3e3e42', border: '1px solid #3e3e42' }}>
								{entityData.id}
							</div>
						</div>
					</div>

					{/* Custom Properties Section */}
					<div className="p-4" style={{ borderBottom: '1px solid #3e3e42' }}>
						<div className="text-sm font-semibold text-gray-400 mb-3 flex items-center justify-between">
							<span>CUSTOM PROPERTIES</span>
							<button
								onClick={() => setIsAddingProperty(true)}
								className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
							>
								+ Add
							</button>
						</div>
						<div className="text-xs text-gray-500">
							{/* Add Property Form */}
							{isAddingProperty && (
								<div className="mb-3 p-3 rounded space-y-2"
									style={{ background: '#1e1e1e' }}>
									<input
										type="text"
										placeholder="Property name"
										value={newPropertyKey}
										onChange={(e) => setNewPropertyKey(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleAddProperty();
											if (e.key === "Escape") {
												setIsAddingProperty(false);
												setNewPropertyKey("");
												setNewPropertyValue("");
											}
										}}
										className="w-full px-2 py-1 text-sm rounded text-gray-200 focus:outline-none"
										style={{ background: '#3e3e42', border: '1px solid #3e3e42' }}
										onFocus={(e) => e.currentTarget.style.borderColor = '#007acc'}
										onBlur={(e) => e.currentTarget.style.borderColor = '#3e3e42'}
										autoFocus
									/>
									<input
										type="text"
										placeholder="Property value"
										value={newPropertyValue}
										onChange={(e) => setNewPropertyValue(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleAddProperty();
											if (e.key === "Escape") {
												setIsAddingProperty(false);
												setNewPropertyKey("");
												setNewPropertyValue("");
											}
										}}
										className="w-full px-2 py-1 text-sm rounded text-gray-200 focus:outline-none"
										style={{ background: '#3e3e42', border: '1px solid #3e3e42' }}
										onFocus={(e) => e.currentTarget.style.borderColor = '#007acc'}
										onBlur={(e) => e.currentTarget.style.borderColor = '#3e3e42'}
									/>
									<div className="flex gap-2">
										<button
											onClick={handleAddProperty}
											className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
										>
											Add
										</button>
										<button
											onClick={() => {
												setIsAddingProperty(false);
												setNewPropertyKey("");
												setNewPropertyValue("");
											}}
											className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs transition-colors"
										>
											Cancel
										</button>
									</div>
								</div>
							)}

							{/* Property List */}
							{entityData.properties &&
							Object.keys(entityData.properties).length > 0 ? (
								<div className="space-y-2">
									{Object.entries(entityData.properties).map(([key, value]) => (
										<div
											key={key}
											className="flex items-start gap-2 p-2 rounded"
											style={{ background: '#1e1e1e' }}
										>
											<div className="flex-1 space-y-1">
												<div className="text-gray-400 font-mono text-xs">
													{key}
												</div>
												{editingPropertyKey === key ? (
													<input
														type="text"
														value={value}
														onChange={(e) =>
															handleUpdatePropertyValue(key, e.target.value)
														}
														onBlur={() => setEditingPropertyKey(null)}
														onKeyDown={(e) => {
															if (e.key === "Enter" || e.key === "Escape") {
																setEditingPropertyKey(null);
															}
														}}
														className="w-full px-2 py-1 text-sm rounded text-gray-200 focus:outline-none"
														style={{ background: '#3e3e42', border: '1px solid #007acc' }}
														autoFocus
													/>
												) : (
													<div
														onClick={() => setEditingPropertyKey(key)}
														className="text-gray-300 text-xs cursor-text hover:bg-gray-800 px-2 py-1 rounded"
													>
														{value}
													</div>
												)}
											</div>
											<button
												onClick={() => handleDeleteProperty(key)}
												className="text-red-400 hover:text-red-300 text-xs mt-1"
											>
												✕
											</button>
										</div>
									))}
								</div>
							) : !isAddingProperty ? (
								<div className="text-center py-4">No custom properties</div>
							) : null}
						</div>
					</div>

					{/* Sprite Layers Section */}
					<div className="p-4" style={{ borderBottom: '1px solid #3e3e42' }}>
						<div className="text-sm font-semibold text-gray-400 mb-3 flex items-center justify-between">
							<span>SPRITE LAYERS</span>
							<button
								onClick={handleOpenSpritePicker}
								className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
							>
								+ Add
							</button>
						</div>
						<div className="text-xs text-gray-500">
							{entityData.sprites && entityData.sprites.length > 0 ? (
								<div className="space-y-2">
									{entityData.sprites
										.sort((a, b) => b.zIndex - a.zIndex)
										.map((layer, index) => (
											<div
												key={layer.id}
												className={`bg-gray-900 p-2 rounded transition-colors ${
													selectedSpriteLayerId === layer.id
														? "ring-2 ring-blue-500"
														: "hover:bg-gray-850"
												}`}
												onClick={() => setSelectedSpriteLayerId(layer.id)}
											>
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<div className="flex items-center gap-2 mb-1">
															<div className="text-gray-300 font-mono">
																{layer.name || `Layer ${index + 1}`}
															</div>
															<div className="text-gray-500">z: {layer.zIndex}</div>
														</div>
														<div className="text-gray-500 text-xs">
															{layer.sprite.width}×{layer.sprite.height}
														</div>
														{layer.offset && (
															<div className="text-gray-600 text-xs">
																offset: {layer.offset.x}, {layer.offset.y}
															</div>
														)}
													</div>
													<div className="flex flex-col gap-1">
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleMoveSpriteLayerUp(layer.id);
															}}
															className="text-gray-400 hover:text-gray-200 text-xs"
															title="Move up (increase z)"
														>
															▲
														</button>
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleMoveSpriteLayerDown(layer.id);
															}}
															className="text-gray-400 hover:text-gray-200 text-xs"
															title="Move down (decrease z)"
														>
															▼
														</button>
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleDeleteSpriteLayer(layer.id);
															}}
															className="text-red-400 hover:text-red-300 text-xs"
															title="Delete layer"
														>
															✕
														</button>
													</div>
												</div>
											</div>
										))}
								</div>
							) : (
								<div className="text-center py-4">No sprite layers</div>
							)}
						</div>
					</div>

					{/* Children Hierarchy Section */}
					<div className="p-4" style={{ borderBottom: '1px solid #3e3e42' }}>
						<div className="text-sm font-semibold text-gray-400 mb-3 flex items-center justify-between">
							<span>CHILDREN</span>
							<button
								onClick={() => {
									// TODO: Add new child entity
								}}
								className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
							>
								+ Add
							</button>
						</div>
						<div className="text-xs text-gray-500">
							{entityData.children && entityData.children.length > 0 ? (
								<div className="space-y-2">
									{entityData.children.map((child) => (
										<div
											key={child.id}
											className="bg-gray-900 p-2 rounded hover:bg-gray-850 cursor-pointer transition-colors"
										>
											<div className="text-gray-300 font-mono">
												{child.name || "(unnamed)"}
											</div>
											<div className="text-gray-500 text-xs">{child.type}</div>
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-4">No child entities</div>
							)}
						</div>
					</div>

					{/* Colliders Section */}
					<div className="p-4" style={{ borderBottom: '1px solid #3e3e42' }}>
						<div className="text-sm font-semibold text-gray-400 mb-3 flex items-center justify-between">
							<span>COLLIDERS</span>
							<button
								onClick={() => setIsEditingCollision(true)}
								className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
							>
								Edit
							</button>
						</div>
						<div className="text-xs text-gray-500">
							{entityData.colliders && entityData.colliders.length > 0 ? (
								<div className="text-center py-2">
									{entityData.colliders.length} collider
									{entityData.colliders.length > 1 ? "s" : ""}
								</div>
							) : (
								<div className="text-center py-4">No colliders</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Right Side - Canvas Preview */}
			<div
				ref={containerRef}
				className="flex-1 overflow-hidden relative"
				onMouseDown={handleMouseDown}
				onMouseMove={handleMouseMove}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
				onContextMenu={handleCanvasContextMenu}
				style={{
					cursor: isDragging ? "grabbing" : "default",
					background: '#1e1e1e'
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

				{/* Status bar overlay */}
				<div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300" style={{ background: 'rgba(37, 37, 38, 0.95)', borderTop: '1px solid #3e3e42' }}>
					<div className="flex items-center gap-2">
						<span className="text-gray-500">Sprite Layers:</span>
						<span className="font-mono">{entityData.sprites.length}</span>
					</div>
					<div className="w-px h-4" style={{ background: '#3e3e42' }} />
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

			{/* Context Menu */}
			{contextMenu && createPortal(
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
							background: '#252526',
							border: '1px solid #3e3e42',
						}}
					>
						<div
							className="px-4 py-2 text-sm cursor-pointer transition-colors"
							style={{ color: '#cccccc' }}
							onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
							onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
							onClick={handleOpenSpritePicker}
						>
							Add Sprite Layer
						</div>
					</div>
				</>,
				document.body
			)}

			{/* Collision Editor Modal */}
			{isEditingCollision && (() => {
				const bbox = calculateEntityBoundingBox();
				const colliders = entityData.colliders || [{ points: [] }];

				// Create a composite image from all sprite layers for the background
				// For now, we'll use null and just show the bounding box
				const backgroundImage = null;

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
								backgroundImage={backgroundImage}
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
			{isSpritePicking && (() => {
				const selectedTileset = selectedTilesetId ? getTilesetById(selectedTilesetId) : null;

				// Handle canvas mouse events for sprite selection
				const handlePickerMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
					if (!selectedTileset) return;
					const canvas = pickerCanvasRef.current;
					if (!canvas) return;

					const rect = canvas.getBoundingClientRect();
					const x = Math.floor((e.clientX - rect.left) / selectedTileset.tileWidth);
					const y = Math.floor((e.clientY - rect.top) / selectedTileset.tileHeight);

					setPickerDragStart({ x, y });
					setIsPickerDragging(true);
					setSelectedRegion({ x, y, width: 1, height: 1 });
				};

				const handlePickerMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
					if (!isPickerDragging || !pickerDragStart || !selectedTileset) return;
					const canvas = pickerCanvasRef.current;
					if (!canvas) return;

					const rect = canvas.getBoundingClientRect();
					const x = Math.floor((e.clientX - rect.left) / selectedTileset.tileWidth);
					const y = Math.floor((e.clientY - rect.top) / selectedTileset.tileHeight);

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
					<div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
						<div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-[90vw] h-[95vh] flex flex-col">
							<div className="mb-4 flex items-center justify-between">
								<h2 className="text-lg font-semibold text-gray-200">
									Add Sprite Layer
								</h2>
								<div className="flex gap-2">
									<button
										onClick={() => {
											setIsSpritePicking(false);
											setSelectedRegion(null);
										}}
										className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
									>
										Cancel
									</button>
									<button
										onClick={handleAddSpriteLayer}
										disabled={!selectedRegion}
										className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
									>
										Add
									</button>
								</div>
							</div>

							{/* Tileset Selection */}
							<div className="mb-4">
								<label className="text-sm text-gray-400 mb-2 block">
									Select Tileset
								</label>
								<select
									value={selectedTilesetId}
									onChange={(e) => {
										setSelectedTilesetId(e.target.value);
										setSelectedRegion(null);
									}}
									className="w-full px-3 py-2 bg-gray-700 text-gray-200 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
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
							<div className="flex-1 overflow-auto bg-gray-900 rounded p-4">
								{selectedTileset && selectedTileset.imageData ? (
									<canvas
										ref={pickerCanvasRef}
										onMouseDown={handlePickerMouseDown}
										onMouseMove={handlePickerMouseMove}
										onMouseUp={handlePickerMouseUp}
										onMouseLeave={handlePickerMouseUp}
										className="cursor-crosshair"
										style={{ imageRendering: 'pixelated' }}
									/>
								) : (
									<div className="text-center text-gray-500 py-8">
										{tilesets.length === 0
											? 'No tilesets available. Create a tileset first.'
											: 'Select a tileset to choose a sprite.'}
									</div>
								)}
							</div>

							{/* Selection Info */}
							{selectedRegion && selectedTileset && (
								<div className="mt-4 text-sm text-gray-400">
									Selection: {selectedRegion.width} × {selectedRegion.height} tiles
									({selectedRegion.width * selectedTileset.tileWidth} × {selectedRegion.height * selectedTileset.tileHeight} pixels)
								</div>
							)}
						</div>
					</div>
				);
			})()}
		</div>
	);
};
