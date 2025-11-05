import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";
import { MapTab, MapData, Tile } from "../types";
import { DragNumberInput } from "./DragNumberInput";
import { MapCanvas } from "./MapCanvas";
import { TilesetPanel } from "./TilesetPanel";
import { useUndoableReducer } from "../hooks/useUndoableReducer";
import { useRegisterUndoRedo } from "../context/UndoRedoContext";
import { entityManager } from "../managers/EntityManager";
import {
	updateTileAndNeighbors,
	getAllAutotileGroups,
} from "../utils/autotiling";
import { createDefaultMapData } from "../schemas";
import { unpackTileId, packTileId } from "../utils/tileId";
import { calculateMenuPosition } from "../utils/menuPositioning";
import {
	placeTerrainTile,
	updateNeighborsAround,
	getTerrainLayerForTile,
	removeTerrainTile,
} from "../utils/terrainDrawing";

interface MapEditorViewProps {
	tab: MapTab;
}

export const MapEditorView = ({ tab }: MapEditorViewProps) => {
	const {
		getMapById,
		updateMap,
		updateTabData,
		setCurrentLayer,
		selectedTilesetId,
		selectedTileId,
		selectedEntityDefId,
		selectedTerrainLayerId,
		tilesets,
		autotilingOverride,
		setProjectModified,
	} = useEditor();

	// Fetch map data by ID (following TilesetEditorView pattern)
	const mapData = getMapById(tab.mapId);

	// Guard against undefined - map should always exist in global state
	if (!mapData) {
		return (
			<div
				className="flex items-center justify-center h-full"
				style={{ background: "#1e1e1e", color: "#cccccc" }}
			>
				<div className="text-center">
					<div className="text-xl mb-2">Map not found</div>
					<div className="text-sm opacity-70">Map ID: {tab.mapId}</div>
					<div className="text-sm opacity-70">Tab: {tab.title}</div>
				</div>
			</div>
		);
	}

	// Local state with undo/redo support
	const [
		localMapData,
		setLocalMapData,
		{ undo, redo, canUndo, canRedo, reset: resetMapHistory },
	] = useUndoableReducer<MapData>(mapData);

	// Register undo/redo keyboard shortcuts
	useRegisterUndoRedo({ undo, redo, canUndo, canRedo });

	const [isEditingName, setIsEditingName] = useState(false);
	const [editedName, setEditedName] = useState(
		localMapData?.name || "Untitled Map",
	);
	const [rightPanelWidth, setRightPanelWidth] = useState(350);
	const [isResizing, setIsResizing] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartWidth, setDragStartWidth] = useState(0);

	// Layer management state
	const [currentLayerId, setCurrentLayerId] = useState<string | null>(null);

	// Initialize currentLayerId when map loads
	useEffect(() => {
		if (currentLayerId === null && localMapData?.layers?.length > 0) {
			setCurrentLayerId(localMapData.layers[0].id);
		}
	}, [currentLayerId, localMapData?.layers]);
	const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
	const [editingLayerName, setEditingLayerName] = useState("");

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		layerId: string;
	} | null>(null);

	// Track if this is the first run to avoid marking dirty on initial mount
	const isFirstRun = useRef(true);

	// Track previous tab ID to detect tab switches
	const prevTabIdRef = useRef<string | null>(null);

	// Reset undo history when switching to a different map tab
	useEffect(() => {
		if (prevTabIdRef.current !== null && prevTabIdRef.current !== tab.id) {
			// Switching to a different map tab, reset history
			resetMapHistory(mapData);
		}
		prevTabIdRef.current = tab.id;
	}, [tab.id, mapData, resetMapHistory]);

	// One-way sync: local map data → global maps array (source of truth)
	useEffect(() => {
		// Update the global maps array with local changes
		updateMap(tab.mapId, localMapData);

		// Only mark dirty after first run (i.e., on actual user changes)
		if (!isFirstRun.current) {
			updateTabData(tab.id, { isDirty: true });
		} else {
			// Clear the flag after skipping
			setTimeout(() => {
				isFirstRun.current = false;
			}, 0);
		}
	}, [localMapData, tab.mapId, updateMap, tab.id, updateTabData]);

	// Update edited name when local map data changes
	useEffect(() => {
		setEditedName(localMapData.name || "Untitled Map");
	}, [localMapData.name]);

	// Sync current layer to EditorContext for MapCanvas and other components
	useEffect(() => {
		if (!localMapData?.layers) return;
		const layer = localMapData.layers.find((l) => l.id === currentLayerId);
		setCurrentLayer(layer || null);
	}, [currentLayerId, localMapData?.layers, setCurrentLayer]);

	const handleNameClick = () => {
		setIsEditingName(true);
		setEditedName(localMapData?.name || "Untitled Map");
	};

	const handleNameSave = () => {
		if (!localMapData) return;
		if (editedName.trim() && editedName !== localMapData.name) {
			setLocalMapData({
				...localMapData,
				name: editedName.trim(),
			});
			updateTabData(tab.id, { title: editedName.trim() });
		}
		setIsEditingName(false);
	};

	const handleNameKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleNameSave();
		} else if (e.key === "Escape") {
			setIsEditingName(false);
			setEditedName(localMapData?.name || "Untitled Map");
		}
	};

	const handleMapSizeChange = (field: "width" | "height", value: number) => {
		if (!localMapData) return;
		setLocalMapData({
			...localMapData,
			[field]: Math.max(1, Math.min(200, Math.round(value))),
		});
	};

	const handleTileSizeChange = (
		field: "tileWidth" | "tileHeight",
		value: number,
	) => {
		if (!localMapData) return;
		setLocalMapData({
			...localMapData,
			[field]: Math.max(1, Math.min(256, Math.round(value))),
		});
	};

	// Get current layer from local state
	const currentLayer = localMapData?.layers?.find(
		(l) => l.id === currentLayerId,
	);

	const handleAddLayer = () => {
		const newLayer = {
			id: `layer-${Date.now()}`,
			name: `Layer ${localMapData.layers.length + 1}`,
			visible: true,
			type: "tile" as const,
			tiles: new Array(localMapData.width * localMapData.height).fill(0), // Dense array initialized with zeros
			entities: [],
			autotilingEnabled: true,
		};
		if (!localMapData) return;
		setLocalMapData({
			...localMapData,
			layers: [...(localMapData.layers || []), newLayer],
		});
		setCurrentLayerId(newLayer.id);
	};

	const handleRemoveLayer = (layerId: string) => {
		if (!localMapData?.layers) return;
		setLocalMapData({
			...localMapData,
			layers: localMapData.layers.filter((l) => l.id !== layerId),
		});
		if (currentLayerId === layerId) {
			setCurrentLayerId(localMapData.layers[0]?.id || null);
		}
	};

	const handleUpdateLayerVisibility = (layerId: string, visible: boolean) => {
		if (!localMapData?.layers) return;
		setLocalMapData({
			...localMapData,
			layers: localMapData.layers.map((l) =>
				l.id === layerId ? { ...l, visible } : l,
			),
		});
	};

	const handleUpdateLayerName = (layerId: string, name: string) => {
		if (!localMapData?.layers) return;
		setLocalMapData({
			...localMapData,
			layers: localMapData.layers.map((l) =>
				l.id === layerId ? { ...l, name } : l,
			),
		});
	};

	const handleUpdateLayerAutotiling = (layerId: string, enabled: boolean) => {
		if (!localMapData?.layers) return;
		setLocalMapData({
			...localMapData,
			layers: localMapData.layers.map((l) =>
				l.id === layerId ? { ...l, autotilingEnabled: enabled } : l,
			),
		});
	};

	const handleLayerDoubleClick = (layer: any) => {
		setEditingLayerId(layer.id);
		setEditingLayerName(layer.name);
	};

	const handleLayerNameSubmit = (layerId: string) => {
		if (editingLayerName.trim()) {
			handleUpdateLayerName(layerId, editingLayerName.trim());
		}
		setEditingLayerId(null);
		setEditingLayerName("");
	};

	const handleLayerNameKeyDown = (e: React.KeyboardEvent, layerId: string) => {
		if (e.key === "Enter") {
			handleLayerNameSubmit(layerId);
		} else if (e.key === "Escape") {
			setEditingLayerId(null);
			setEditingLayerName("");
		}
	};

	const handleLayerContextMenu = (e: React.MouseEvent, layerId: string) => {
		e.preventDefault();
		e.stopPropagation();

		// Estimate menu dimensions
		const menuWidth = 160;
		const menuHeight = 40; // Single item menu

		const position = calculateMenuPosition(e.clientX, e.clientY, menuWidth, menuHeight);

		setContextMenu({
			x: position.x,
			y: position.y,
			layerId
		});
	};

	// Terrain painting function
	const handlePlaceTerrain = useCallback(
		(x: number, y: number) => {
			console.log('handlePlaceTerrain called:', { x, y, currentLayer, selectedTerrainLayerId, selectedTilesetId });

			if (!currentLayer || currentLayer.type !== "tile") {
				console.log('No current layer or not a tile layer');
				return;
			}
			if (!selectedTerrainLayerId || !selectedTilesetId) {
				console.log('No terrain layer or tileset selected');
				return;
			}

			// Find the selected tileset and terrain layer
			const tileset = tilesets.find((ts) => ts.id === selectedTilesetId);
			console.log('Found tileset:', tileset);
			if (!tileset || !tileset.terrainLayers) {
				console.log('No tileset or terrain layers');
				return;
			}

			const terrainLayer = tileset.terrainLayers.find(
				(l) => l.id === selectedTerrainLayerId,
			);
			console.log('Found terrain layer:', terrainLayer);
			if (!terrainLayer) {
				console.log('No matching terrain layer found');
				return;
			}

			const tilesetIndex = tilesets.findIndex((ts) => ts.id === selectedTilesetId);
			console.log('Tileset index:', tilesetIndex);
			if (tilesetIndex === -1) {
				console.log('Invalid tileset index');
				return;
			}

			// Update the map with terrain tile placement
			setLocalMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const newTiles = [...layer.tiles]; // Copy the dense array
						const mapWidth = prev.width;
						const mapHeight = prev.height;

						// Create a mutable layer object for the terrain utilities
						const mutableLayer = { ...layer, tiles: newTiles };

						// Place the terrain tile with smart bitmask calculation
						placeTerrainTile(
							mutableLayer,
							x,
							y,
							mapWidth,
							mapHeight,
							terrainLayer,
							tileset,
							tilesetIndex,
							tilesets,
						);

						// Update all 8 neighbors to adjust their bitmasks
						updateNeighborsAround(
							mutableLayer,
							x,
							y,
							mapWidth,
							mapHeight,
							terrainLayer.id,
							tileset,
							tilesetIndex,
							tilesets,
						);

						return { ...layer, tiles: mutableLayer.tiles };
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[
			currentLayer,
			selectedTerrainLayerId,
			selectedTilesetId,
			tilesets,
			setProjectModified,
		],
	);

	// Paint functions (tile placement, erasing, entity placement)
	const handlePlaceTile = useCallback(
		(x: number, y: number) => {
			if (!currentLayer || currentLayer.type !== "tile") return;

			// Check if we're in terrain painting mode
			if (selectedTerrainLayerId) {
				handlePlaceTerrain(x, y);
				return;
			}

			// Check if selected tile is a compound tile
			const selectedTileset = selectedTilesetId
				? tilesets.find((ts) => ts.id === selectedTilesetId)
				: null;
			const selectedTileDef =
				selectedTileset && selectedTileId
					? selectedTileset.tiles.find((t) => t.id === selectedTileId)
					: null;

			// Find tileset index for creating global tile IDs
			const tilesetIndex = selectedTilesetId
				? tilesets.findIndex((ts) => ts.id === selectedTilesetId)
				: -1;

			if (tilesetIndex === -1 || !selectedTileId) {
				return;
			}

			// Unpack the selected tile ID
			const geometry = unpackTileId(selectedTileId);

			console.log('handlePlaceTile:', {
				x, y,
				selectedTileId,
				geometry,
				tilesetIndex,
				selectedTileDef,
				isCompound: selectedTileDef?.isCompound
			});

			// Repack with the correct tileset index to create a global tile ID
			const globalTileId = packTileId(
				geometry.x,
				geometry.y,
				tilesetIndex,
				geometry.flipX,
				geometry.flipY,
			);

			// Update localMapData immutably
			setLocalMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const newTiles = [...layer.tiles]; // Copy the dense array
						const mapWidth = prev.width;
						const mapHeight = prev.height;

						// Place tile in a single cell - both regular and compound tiles
						// Compound tiles will render larger, but only occupy one cell in the map
						if (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) {
							const index = y * mapWidth + x;
							newTiles[index] = globalTileId;
						}

						let updatedLayer = { ...layer, tiles: newTiles };

						// Apply autotiling if enabled
						const autotilingEnabled = layer.autotilingEnabled !== false;
						console.log('Autotiling check:', { autotilingEnabled, autotilingOverride });
						if (autotilingEnabled && !autotilingOverride) {
							const autotileGroups = getAllAutotileGroups(tilesets);
							console.log('Autotile groups:', autotileGroups.length);

							if (autotileGroups.length > 0) {
								const positionsToUpdate: Array<{ x: number; y: number }> = [];

								if (selectedTileDef && selectedTileDef.isCompound) {
									const tileWidth = selectedTileset?.tileWidth || 16;
									const tileHeight = selectedTileset?.tileHeight || 16;
									const widthInTiles = Math.ceil(
										selectedTileDef.width! / tileWidth,
									);
									const heightInTiles = Math.ceil(
										selectedTileDef.height! / tileHeight,
									);

									for (let dy = 0; dy < heightInTiles; dy++) {
										for (let dx = 0; dx < widthInTiles; dx++) {
											positionsToUpdate.push({ x: x + dx, y: y + dy });
										}
									}
								} else {
									positionsToUpdate.push({ x, y });
								}

								console.log('Positions to autotile:', positionsToUpdate);
								const autotiledTiles = updateTileAndNeighbors(
									updatedLayer,
									positionsToUpdate,
									mapWidth,
									mapHeight,
									tilesets,
								);
								console.log('Autotiled results:', autotiledTiles);

								for (const update of autotiledTiles) {
									console.log('Applying autotile update:', update);
									newTiles[update.index] = update.tileId;
								}

								updatedLayer = { ...layer, tiles: newTiles };
							}
						}
						console.log('Final tiles array (first 10):', newTiles.slice(0, 10));

						// No need to setCurrentLayer - it's component-local only
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[
			currentLayer,
			selectedTilesetId,
			selectedTileId,
			tilesets,
			autotilingOverride,
			setProjectModified,
		],
	);

	const handleEraseTile = useCallback(
		(x: number, y: number) => {
			if (!currentLayer || currentLayer.type !== "tile") return;

			setLocalMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const newTiles = [...layer.tiles]; // Copy the dense array
						const mapWidth = prev.width;
						const mapHeight = prev.height;

						// Check if the tile being erased is a terrain tile
						const index = y * mapWidth + x;
						const tileId = newTiles[index];
						const terrainLayerId = getTerrainLayerForTile(tileId, tilesets);

						// Erase the tile by setting it to 0
						if (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) {
							newTiles[index] = 0;
						}

						let updatedLayer = { ...layer, tiles: newTiles };

						// If it was a terrain tile, update neighbors
						if (terrainLayerId) {
							const tileset = tilesets.find((ts) =>
								ts.terrainLayers?.some((l) => l.id === terrainLayerId),
							);
							if (tileset) {
								const tilesetIndex = tilesets.indexOf(tileset);
								const mutableLayer = { ...layer, tiles: newTiles };
								updateNeighborsAround(
									mutableLayer,
									x,
									y,
									mapWidth,
									mapHeight,
									terrainLayerId,
									tileset,
									tilesetIndex,
									tilesets,
								);
								updatedLayer = { ...layer, tiles: mutableLayer.tiles };
							}
						}

						updatedLayer = { ...layer, tiles: newTiles };

						// Apply autotiling to neighbors
						const autotilingEnabled = layer.autotilingEnabled !== false;
						if (autotilingEnabled && !autotilingOverride) {
							const autotileGroups = getAllAutotileGroups(tilesets);

							if (autotileGroups.length > 0) {
								const autotiledTiles = updateTileAndNeighbors(
									updatedLayer,
									[{ x, y }],
									mapWidth,
									mapHeight,
									tilesets,
								);

								for (const update of autotiledTiles) {
									newTiles[update.index] = update.tileId;
								}

								updatedLayer = { ...layer, tiles: newTiles };
							}
						}

						// No need to setCurrentLayer - it's component-local only
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[currentLayer, tilesets, autotilingOverride, setProjectModified],
	);

	const handlePlaceEntity = useCallback(
		(x: number, y: number) => {
			if (!currentLayer || currentLayer.type !== "entity") return;
			if (!selectedTilesetId || !selectedEntityDefId) return;

			const entityInstance = entityManager.createInstance(
				selectedTilesetId,
				selectedEntityDefId,
				x,
				y,
			);

			if (!entityInstance) return;

			setLocalMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const updatedLayer = {
							...layer,
							entities: [...layer.entities, entityInstance],
						};
						// No need to setCurrentLayer - it's component-local only
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[currentLayer, selectedTilesetId, selectedEntityDefId, setProjectModified],
	);

	// Resize panel handlers
	const handleResizeStart = (e: React.MouseEvent) => {
		setIsResizing(true);
		setDragStartX(e.clientX);
		setDragStartWidth(rightPanelWidth);
		e.preventDefault();
	};

	useEffect(() => {
		if (!isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			const delta = dragStartX - e.clientX;
			const newWidth = Math.max(200, Math.min(600, dragStartWidth + delta));
			setRightPanelWidth(newWidth);
		};

		const handleMouseUp = () => {
			setIsResizing(false);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing, dragStartX, dragStartWidth]);

	// Close context menu on Escape key
	useEffect(() => {
		if (!contextMenu) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setContextMenu(null);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [contextMenu]);

	return (
		<div className="flex h-full w-full">
			{/* Left Sidebar */}
			<div
				className="w-64 flex flex-col"
				style={{ background: "#252526", borderRight: "1px solid #3e3e42" }}
			>
				{/* Header - Map Name */}
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
							title="Click to edit map name"
						>
							{localMapData?.name || "Untitled Map"}
						</div>
					)}
				</div>

				{/* Settings */}
				<div className="flex-1 overflow-auto p-4">
					<div className="space-y-4">
						{/* Map Properties */}
						<div>
							<div
								className="text-xs font-semibold uppercase tracking-wide mb-2"
								style={{ color: "#858585" }}
							>
								Map Properties
							</div>
							<div className="space-y-2">
								{/* Map Size */}
								<div>
									<label
										className="text-xs block mb-1"
										style={{ color: "#858585" }}
									>
										Map Size
									</label>
									<div className="flex items-center gap-2">
										<DragNumberInput
											value={localMapData?.width ?? 10}
											onChange={(value) => handleMapSizeChange("width", value)}
											min={1}
											max={200}
											step={1}
											precision={0}
											className="flex-1"
										/>
										<span style={{ color: "#858585" }}>×</span>
										<DragNumberInput
											value={localMapData?.height ?? 10}
											onChange={(value) => handleMapSizeChange("height", value)}
											min={1}
											max={200}
											step={1}
											precision={0}
											className="flex-1"
										/>
									</div>
								</div>

								{/* Tile Size */}
								<div>
									<label
										className="text-xs block mb-1"
										style={{ color: "#858585" }}
									>
										Tile Size
									</label>
									<div className="flex items-center gap-2">
										<DragNumberInput
											value={localMapData?.tileWidth ?? 16}
											onChange={(value) =>
												handleTileSizeChange("tileWidth", value)
											}
											min={1}
											max={256}
											step={1}
											precision={0}
											className="flex-1"
										/>
										<span style={{ color: "#858585" }}>×</span>
										<DragNumberInput
											value={localMapData?.tileHeight ?? 16}
											onChange={(value) =>
												handleTileSizeChange("tileHeight", value)
											}
											min={1}
											max={256}
											step={1}
											precision={0}
											className="flex-1"
										/>
									</div>
								</div>
							</div>
						</div>

						{/* Layers Panel */}
						<div className="pt-4" style={{ borderTop: "1px solid #3e3e42" }}>
							<div>
								<div
									className="text-xs font-semibold uppercase tracking-wide mb-2"
									style={{ color: "#858585" }}
								>
									Layers
								</div>
								<div className="space-y-1">
									{localMapData?.layers?.map((layer) => (
										<div
											key={layer.id}
											className={`px-2 py-1.5 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 ${
												currentLayer?.id === layer.id
													? "bg-[#0e639c] text-white"
													: "bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3e3e42]"
											}`}
											style={{ border: "1px solid #3e3e42" }}
											onClick={() => setCurrentLayerId(layer.id)}
											onDoubleClick={() => handleLayerDoubleClick(layer)}
											onContextMenu={(e) => handleLayerContextMenu(e, layer.id)}
											onMouseDown={(e) => {
												if (e.detail > 1) {
													e.preventDefault();
												}
											}}
										>
											<input
												type="checkbox"
												checked={layer.visible}
												onChange={(e) => {
													e.stopPropagation();
													handleUpdateLayerVisibility(
														layer.id,
														e.target.checked,
													);
												}}
												title="Toggle visibility"
												style={{ accentColor: "#007acc" }}
											/>
											{layer.type === "tile" && (
												<button
													onClick={(e) => {
														e.stopPropagation();
														handleUpdateLayerAutotiling(
															layer.id,
															!(layer.autotilingEnabled !== false),
														);
													}}
													title={
														layer.autotilingEnabled !== false
															? "Autotiling ON"
															: "Autotiling OFF"
													}
													style={{
														background: "none",
														border: "none",
														cursor: "pointer",
														padding: "2px 4px",
														opacity:
															layer.autotilingEnabled !== false ? 1 : 0.3,
														fontSize: "14px",
													}}
												>
													🗠
												</button>
											)}
											{editingLayerId === layer.id ? (
												<input
													type="text"
													value={editingLayerName}
													onChange={(e) => setEditingLayerName(e.target.value)}
													onBlur={() => handleLayerNameSubmit(layer.id)}
													onKeyDown={(e) => handleLayerNameKeyDown(e, layer.id)}
													onClick={(e) => e.stopPropagation()}
													autoFocus
													className="flex-1 px-2 py-1 text-xs rounded focus:outline-none"
													style={{
														background: "#3e3e42",
														color: "#cccccc",
														border: "1px solid #1177bb",
														minWidth: 0,
														maxWidth: "100%",
													}}
												/>
											) : (
												<span className="flex-1">{layer.name}</span>
											)}
										</div>
									))}
								</div>
								<div className="mt-2">
									<button
										onClick={handleAddLayer}
										className="w-full px-2 py-1.5 text-xs rounded transition-colors"
										style={{
											background: "#0e639c",
											color: "#ffffff",
											border: "none",
										}}
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
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Center - Map Canvas */}
			<div className="flex-1 flex relative">
				<MapCanvas
					mapData={localMapData}
					onPlaceTile={handlePlaceTile}
					onEraseTile={handleEraseTile}
					onPlaceEntity={handlePlaceEntity}
				/>
			</div>

			{/* Resize Handle */}
			<div
				className={`resize-handle ${isResizing ? "active" : ""}`}
				onMouseDown={handleResizeStart}
				style={{
					width: "4px",
					background: isResizing ? "#007acc" : "#3e3e42",
					cursor: "col-resize",
					flexShrink: 0,
				}}
			/>

			{/* Right Sidebar - Tileset Panel */}
			<div
				className="flex flex-col"
				style={{
					width: `${rightPanelWidth}px`,
					background: "#252526",
					borderLeft: "1px solid #3e3e42",
				}}
			>
				<TilesetPanel />
			</div>

			{/* Context Menu */}
			{contextMenu && createPortal(
				<>
					{/* Backdrop */}
					<div
						style={{
							position: "fixed",
							inset: 0,
							zIndex: 40,
						}}
						onClick={() => setContextMenu(null)}
					/>
					{/* Menu */}
					<div
						style={{
							position: "fixed",
							top: contextMenu.y,
							left: contextMenu.x,
							zIndex: 50,
							background: "#252526",
							border: "1px solid #3e3e42",
							borderRadius: "4px",
							minWidth: "160px",
							boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
						}}
					>
						<div
							onClick={() => {
								handleRemoveLayer(contextMenu.layerId);
								setContextMenu(null);
							}}
							style={{
								padding: "8px 12px",
								fontSize: "13px",
								color: "#cccccc",
								cursor: "pointer",
								transition: "background 0.1s",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "#2a2d2e";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent";
							}}
						>
							Delete Layer
						</div>
					</div>
				</>,
				document.body
			)}
		</div>
	);
};
