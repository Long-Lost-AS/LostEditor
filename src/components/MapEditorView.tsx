import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";
import { useRegisterUndoRedo } from "../context/UndoRedoContext";
import { useChunkedMapUndo } from "../hooks/useChunkedMapUndo";
import { useUndoableReducer } from "../hooks/useUndoableReducer";
import { entityManager } from "../managers/EntityManager";
import type {
	EntityInstance,
	Layer,
	LayerGroup,
	MapTab,
	PointInstance,
	PolygonCollider,
	Tool,
} from "../types";
import { CHUNK_SIZE, getTile, setTile } from "../utils/chunkStorage";
import { generateId } from "../utils/id";
import { calculateMenuPosition } from "../utils/menuPositioning";
import {
	placeTerrainTile,
	updateNeighborsAround,
} from "../utils/terrainDrawing";
import { packTileId, unpackTileId } from "../utils/tileId";
import { ColliderPropertiesPanel } from "./ColliderPropertiesPanel";
import { CustomPropertiesEditor } from "./CustomPropertiesEditor";
import { DragNumberInput } from "./DragNumberInput";
import { EntityPropertiesPanel } from "./EntityPropertiesPanel";
import { PencilIcon, TrashIcon } from "./Icons";
import { LayersPanel, type LayersPanelHandle } from "./LayersPanel";
import { MapCanvas, type MapCanvasHandle } from "./MapCanvas";
import { PointPropertiesPanel } from "./PointPropertiesPanel";
import { TintInput } from "./TintInput";
import { Toolbar } from "./Toolbar";

interface MapEditorViewProps {
	tab: MapTab;
	onOpenEntitySelect: () => void;
	onOpenTilesetSelect: () => void;
	onOpenTilePicker: () => void;
	onOpenTerrainPicker: () => void;
}

export const MapEditorView = ({
	tab,
	onOpenEntitySelect,
	onOpenTilesetSelect,
	onOpenTilePicker,
	onOpenTerrainPicker,
}: MapEditorViewProps) => {
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
		setProjectModified,
		zoom,
		gridVisible,
		setGridVisible,
	} = useEditor();

	// Fetch map data by ID (following TilesetEditorView pattern)
	const mapData = getMapById(tab.mapId);

	// Local state with undo/redo support (must be called unconditionally)
	const [
		localMapData,
		setLocalMapData,
		{
			undo,
			redo,
			canUndo,
			canRedo,
			startBatch,
			endBatch,
			reset: resetMapHistory,
			lastAffectedChunks,
		},
	] = useChunkedMapUndo(
		mapData || {
			id: "",
			name: "",
			layers: [],
			groups: [],
			entities: [],
			points: [],
			colliders: [],
		},
	);

	// Separate undo/redo for entities, points, and colliders
	const [
		localMapMeta,
		setLocalMapMeta,
		{
			undo: undoMeta,
			redo: redoMeta,
			canUndo: canUndoMeta,
			canRedo: canRedoMeta,
			startBatch: startMetaBatch,
			endBatch: endMetaBatch,
		},
	] = useUndoableReducer({
		entities: mapData?.entities || [],
		points: mapData?.points || [],
		colliders: mapData?.colliders || [],
	});

	// Separate undo/redo for layer operations (add, delete, rename, visibility, reorder, tile size)
	const [
		localLayers,
		setLocalLayers,
		{
			undo: undoLayers,
			redo: redoLayers,
			canUndo: canUndoLayers,
			canRedo: canRedoLayers,
		},
	] = useUndoableReducer(mapData?.layers || []);

	// Separate undo/redo for group operations
	const [
		localGroups,
		setLocalGroups,
		{
			undo: undoGroups,
			redo: redoGroups,
			canUndo: canUndoGroups,
			canRedo: canRedoGroups,
		},
	] = useUndoableReducer<LayerGroup[]>(mapData?.groups || []);

	// Register undo/redo keyboard shortcuts (combined tile + metadata + layers + groups)
	useRegisterUndoRedo({
		undo: () => {
			if (canUndo) {
				undo();
			} else if (canUndoMeta) {
				undoMeta();
			} else if (canUndoLayers) {
				undoLayers();
			} else if (canUndoGroups) {
				undoGroups();
			}
		},
		redo: () => {
			if (canRedo) {
				redo();
			} else if (canRedoMeta) {
				redoMeta();
			} else if (canRedoLayers) {
				redoLayers();
			} else if (canRedoGroups) {
				redoGroups();
			}
		},
		canUndo: canUndo || canUndoMeta || canUndoLayers || canUndoGroups,
		canRedo: canRedo || canRedoMeta || canRedoLayers || canRedoGroups,
	});

	// Invalidate canvas chunks after undo/redo
	useEffect(() => {
		if (lastAffectedChunks && mapCanvasRef.current) {
			// Group chunks by layer and invalidate
			const chunksByLayer = new Map<string, Array<{ x: number; y: number }>>();
			for (const { layerId, chunkX, chunkY } of lastAffectedChunks) {
				if (!chunksByLayer.has(layerId)) {
					chunksByLayer.set(layerId, []);
				}
				// Convert chunk coords to tile coords (any tile in the chunk will do)
				chunksByLayer
					.get(layerId)
					?.push({ x: chunkX * CHUNK_SIZE, y: chunkY * CHUNK_SIZE });
			}
			// Invalidate chunks for each layer
			for (const [layerId, tiles] of chunksByLayer) {
				mapCanvasRef.current.invalidateTiles(layerId, tiles);
			}

			// Force a re-render by creating a new map reference
			setLocalMapData((prev) => ({ ...prev }));
		}
	}, [lastAffectedChunks, setLocalMapData]);

	// Sync localMapData when mapData becomes available (e.g., after newMap creates it)
	useEffect(() => {
		if (mapData && !localMapData.id) {
			setLocalMapData(mapData);
		}
	}, [mapData, localMapData.id, setLocalMapData]);

	// Sync localMapMeta changes back to localMapData
	useEffect(() => {
		setLocalMapData((prev) => ({
			...prev,
			entities: localMapMeta.entities,
			points: localMapMeta.points,
			colliders: localMapMeta.colliders,
		}));
	}, [localMapMeta, setLocalMapData]);

	// Sync localLayers and localGroups changes back to localMapData
	// Combined into a single effect to prevent race conditions when both change simultaneously
	// (e.g., when moving a group between foreground/background sections)
	useEffect(() => {
		setLocalMapData((prev) => {
			// Create a map of existing layer chunks by id
			const existingChunks = new Map(prev.layers.map((l) => [l.id, l.chunks]));

			// Build new layers array preserving order from localLayers
			// and keeping chunks from localMapData (or using localLayers chunks for new layers)
			const newLayers = localLayers.map((layer) => ({
				...layer,
				chunks: existingChunks.get(layer.id) ?? layer.chunks,
			}));

			return {
				...prev,
				layers: newLayers,
				groups: localGroups,
			};
		});
	}, [localLayers, localGroups, setLocalMapData]);

	// Wrapper functions to batch both tile and metadata operations
	const handleStartBatch = useCallback(() => {
		startBatch(); // Tile batching
		startMetaBatch(); // Metadata batching
	}, [startBatch, startMetaBatch]);

	const handleEndBatch = useCallback(() => {
		endBatch(); // Tile batching
		endMetaBatch(); // Metadata batching
	}, [endBatch, endMetaBatch]);

	const [isEditingName, setIsEditingName] = useState(false);
	const [editedName, setEditedName] = useState(
		localMapData?.name || "Untitled Map",
	);
	const [rightPanelWidth, setRightPanelWidth] = useState(350);
	const [isResizing, setIsResizing] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartWidth, setDragStartWidth] = useState(0);
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
	const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

	// Ref to MapCanvas for imperative chunk invalidation
	const mapCanvasRef = useRef<MapCanvasHandle>(null);

	// Ref to LayersPanel for triggering rename mode
	const layersPanelRef = useRef<LayersPanelHandle>(null);

	// Collider selection state
	const [selectedColliderId, setSelectedColliderId] = useState<string | null>(
		null,
	);
	const [selectedColliderPointIndex, setSelectedColliderPointIndex] = useState<
		number | null
	>(null);

	// Tile clipboard state (for copy/paste/cut operations)
	const [tileClipboard, setTileClipboard] = useState<{
		tiles: Map<string, number>; // key: "relativeX,relativeY", value: tileId
		width: number;
		height: number;
		sourceLayerId: string;
	} | null>(null);

	// Mouse position state for status bar
	const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
		null,
	);

	// Layer management state
	const [currentLayerId, setCurrentLayerId] = useState<string | null>(null);

	// Group management state
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

	// Initialize currentLayerId when map loads (only if no group is selected)
	useEffect(() => {
		if (
			currentLayerId === null &&
			selectedGroupId === null &&
			localLayers.length > 0
		) {
			setCurrentLayerId(localLayers[0].id);
		}
	}, [currentLayerId, selectedGroupId, localLayers]);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		layerId?: string;
		groupId?: string;
		colliderId?: string;
		pointIndex?: number;
		edgeIndex?: number;
		insertPosition?: { x: number; y: number };
	} | null>(null);

	// Track if this is the first run to avoid marking dirty on initial mount
	const isFirstRun = useRef(true);

	// Track previous tab ID to detect tab switches
	const prevTabIdRef = useRef<string | null>(null);

	// Reset undo history when switching to a different map tab OR when mapData.id changes (map reloaded)
	const prevMapIdRef = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (!mapData) return;

		const mapId = mapData.id;
		const tabChanged =
			prevTabIdRef.current !== null && prevTabIdRef.current !== tab.id;
		const mapReloaded =
			prevMapIdRef.current !== undefined && prevMapIdRef.current !== mapId;

		if (tabChanged || mapReloaded) {
			// Switching to a different map tab OR map was reloaded, reset history
			resetMapHistory(mapData);
		}

		prevTabIdRef.current = tab.id;
		prevMapIdRef.current = mapId;
	}, [tab.id, mapData, resetMapHistory]);

	// One-way sync: local map data → global maps array (source of truth)
	useEffect(() => {
		// Update the global maps array with local changes
		updateMap(tab.mapId, localMapData);

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
	}, [localMapData, tab.mapId, updateMap, tab.id, updateTabData]);

	// Persist undo history to tab state on unmount (when switching tabs)
	// TODO: Re-enable undo history persistence with chunked format
	// useEffect(() => {
	// 	return () => {
	// 		// Save history when component unmounts
	// 		const history = getHistory();
	// 		updateTabData(tab.id, { undoHistory: history });
	// 	};
	// }, [tab.id, updateTabData]);

	// Update edited name when local map data changes
	useEffect(() => {
		setEditedName(localMapData.name || "Untitled Map");
	}, [localMapData.name]);

	// Sync current layer to EditorContext for MapCanvas and other components
	useEffect(() => {
		const layer = localLayers.find((l) => l.id === currentLayerId);
		setCurrentLayer(layer || null);
	}, [currentLayerId, localLayers, setCurrentLayer]);

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

	// No map resize functionality needed for infinite maps

	const handleLayerTileSizeChange = (
		field: "tileWidth" | "tileHeight",
		value: number,
	) => {
		if (!currentLayerId) return;
		const clampedValue = Math.max(1, Math.min(256, Math.round(value)));
		setLocalLayers(
			localLayers.map((layer) =>
				layer.id === currentLayerId
					? { ...layer, [field]: clampedValue }
					: layer,
			),
		);
	};

	const handleLayerParallaxChange = (
		field: "parallaxX" | "parallaxY",
		value: number,
	) => {
		if (!currentLayerId) return;
		setLocalLayers(
			localLayers.map((layer) =>
				layer.id === currentLayerId ? { ...layer, [field]: value } : layer,
			),
		);
	};

	const handleLayerTintChange = (tint: {
		r: number;
		g: number;
		b: number;
		a: number;
	}) => {
		if (!currentLayerId) return;
		setLocalLayers(
			localLayers.map((layer) =>
				layer.id === currentLayerId ? { ...layer, tint } : layer,
			),
		);
	};

	const handleLayerPropertiesChange = (properties: Record<string, string>) => {
		if (!currentLayerId) return;
		setLocalLayers(
			localLayers.map((layer) =>
				layer.id === currentLayerId ? { ...layer, properties } : layer,
			),
		);
	};

	// Get current layer from local state
	const currentLayer = localMapData?.layers?.find(
		(l) => l.id === currentLayerId,
	);

	const handleAddLayer = () => {
		// Calculate order for new layer (higher than existing background layers)
		const backgroundLayers = localLayers.filter(
			(l) => !l.foreground && !l.groupId,
		);
		const maxOrder =
			backgroundLayers.length > 0
				? Math.max(...backgroundLayers.map((l) => l.order))
				: -1;

		const newLayer: Layer = {
			id: generateId(),
			name: `Layer ${localLayers.length + 1}`,
			visible: true,
			foreground: false, // New layers render below entities by default
			order: maxOrder + 1, // Place at top of background section
			chunks: {}, // Empty chunks - tiles created on demand
			tileWidth: 16,
			tileHeight: 16,
			parallaxX: 1.0,
			parallaxY: 1.0,
			tint: { r: 255, g: 255, b: 255, a: 255 }, // White = no tint
			properties: {}, // Custom properties
		};

		setLocalLayers([...localLayers, newLayer]);
		setCurrentLayerId(newLayer.id);
		setSelectedGroupId(null); // Clear group selection when adding a layer
	};

	const handleRemoveLayer = (layerId: string) => {
		const newLayers = localLayers.filter((l) => l.id !== layerId);
		setLocalLayers(newLayers);

		if (currentLayerId === layerId) {
			setCurrentLayerId(newLayers[0]?.id || null);
		}
	};

	// Mutually exclusive selection handlers - selecting a layer clears group and vice versa
	const handleSelectLayer = (layerId: string | null) => {
		setCurrentLayerId(layerId);
		if (layerId !== null) {
			setSelectedGroupId(null); // Clear group selection when selecting a layer
		}
	};

	const handleSelectGroup = (groupId: string | null) => {
		setSelectedGroupId(groupId);
		if (groupId !== null) {
			setCurrentLayerId(null); // Clear layer selection when selecting a group
		}
	};

	const handleToolChange = (tool: Tool) => {
		updateTabData(tab.id, {
			viewState: {
				...tab.viewState,
				currentTool: tool,
			},
		});
	};

	const handleLayerContextMenu = (e: React.MouseEvent, layerId: string) => {
		e.preventDefault();
		e.stopPropagation();

		// Estimate menu dimensions
		const menuWidth = 160;
		const menuHeight = 80; // Two item menu (Rename + Delete)

		const position = calculateMenuPosition(
			e.clientX,
			e.clientY,
			menuWidth,
			menuHeight,
		);

		setContextMenu({
			x: position.x,
			y: position.y,
			layerId,
		});
	};

	const handleGroupContextMenu = (e: React.MouseEvent, groupId: string) => {
		e.preventDefault();
		e.stopPropagation();

		// Estimate menu dimensions
		const menuWidth = 160;
		const menuHeight = 80; // Two item menu (Rename + Delete)

		const position = calculateMenuPosition(
			e.clientX,
			e.clientY,
			menuWidth,
			menuHeight,
		);

		setContextMenu({
			x: position.x,
			y: position.y,
			groupId,
		});
	};

	const handleRenameLayer = () => {
		if (contextMenu?.layerId && layersPanelRef.current) {
			layersPanelRef.current.startLayerRename(contextMenu.layerId);
		}
		setContextMenu(null);
	};

	const handleRenameGroup = () => {
		if (contextMenu?.groupId && layersPanelRef.current) {
			layersPanelRef.current.startGroupRename(contextMenu.groupId);
		}
		setContextMenu(null);
	};

	const handleDeleteGroupFromMenu = () => {
		if (contextMenu?.groupId) {
			handleRemoveGroup(contextMenu.groupId);
		}
		setContextMenu(null);
	};

	const handleDeleteLayerFromMenu = () => {
		if (contextMenu?.layerId) {
			handleRemoveLayer(contextMenu.layerId);
		}
		setContextMenu(null);
	};

	// Group handler functions
	const handleAddGroup = () => {
		// Calculate order - put at the end
		const maxOrder = localGroups.reduce((max, g) => Math.max(max, g.order), -1);
		const newGroup: LayerGroup = {
			id: generateId(),
			name: `Group ${localGroups.length + 1}`,
			expanded: true,
			visible: true,
			foreground: false,
			parallaxX: 1.0,
			parallaxY: 1.0,
			tint: { r: 255, g: 255, b: 255, a: 255 },
			order: maxOrder + 1,
			properties: {},
		};
		setLocalGroups([...localGroups, newGroup]);
		setSelectedGroupId(newGroup.id);
		setCurrentLayerId(null); // Clear layer selection when adding a group
	};

	const handleRemoveGroup = (groupId: string) => {
		// Unassign all layers from this group
		setLocalLayers(
			localLayers.map((l) =>
				l.groupId === groupId ? { ...l, groupId: undefined } : l,
			),
		);
		// Remove the group
		setLocalGroups(localGroups.filter((g) => g.id !== groupId));
		if (selectedGroupId === groupId) {
			setSelectedGroupId(null);
		}
	};

	// Group property handlers (used by Group Properties panel)
	const handleGroupPropertiesChange = (properties: Record<string, string>) => {
		if (!selectedGroupId) return;
		setLocalGroups(
			localGroups.map((g) =>
				g.id === selectedGroupId ? { ...g, properties } : g,
			),
		);
	};

	// Get selected group from local state
	const selectedGroup = localGroups.find((g) => g.id === selectedGroupId);

	// Paint functions (tile placement, erasing, entity placement)
	const handleEraseTilesBatch = useCallback(
		(tiles: Array<{ x: number; y: number }>) => {
			if (!currentLayer || tiles.length === 0) return;

			// Calculate affected chunks for undo system
			const affectedChunksSet = new Set<string>();
			const affectedTiles: Array<{ x: number; y: number }> = [];

			// Process all tiles to determine affected chunks
			for (const { x, y } of tiles) {
				// Only add erased tile chunk (no neighbor updates)
				const chunkX = Math.floor(x / CHUNK_SIZE);
				const chunkY = Math.floor(y / CHUNK_SIZE);
				affectedChunksSet.add(`${chunkX},${chunkY}`);
			}

			const affectedChunks = Array.from(affectedChunksSet).map((key) => {
				const [chunkX, chunkY] = key.split(",").map(Number);
				return { layerId: currentLayer.id, chunkX, chunkY };
			});

			setLocalMapData(
				(prev) => ({
					...prev,
					layers: prev.layers.map((layer) => {
						if (layer.id === currentLayer.id) {
							// Convert chunks to Map for efficient operations
							const chunksMap = new Map(Object.entries(layer.chunks));

							// Erase all tiles (no terrain neighbor updating)
							for (const { x, y } of tiles) {
								// Erase the tile using chunk storage
								setTile(chunksMap, x, y, 0);

								// Track affected tile for invalidation (just the erased tile)
								affectedTiles.push({ x, y });
							}

							// Convert Map back to plain object
							const newChunks: Record<string, number[]> = {};
							for (const [key, value] of chunksMap) {
								newChunks[key] = value;
							}

							return { ...layer, chunks: newChunks };
						}
						return layer;
					}),
				}),
				affectedChunks,
			);

			// Invalidate all affected tiles
			mapCanvasRef.current?.invalidateTiles(currentLayer.id, affectedTiles);
			setProjectModified(true);
		},
		[currentLayer, setProjectModified, setLocalMapData],
	);

	// Tile clipboard handlers
	const handleCopyTiles = useCallback(
		(selection: {
			startX: number;
			startY: number;
			endX: number;
			endY: number;
			layerId: string;
		}) => {
			const layer = localLayers.find((l) => l.id === selection.layerId);
			if (!layer) return;

			const width = selection.endX - selection.startX + 1;
			const height = selection.endY - selection.startY + 1;
			const tiles = new Map<string, number>();

			// Convert chunks to Map for efficient operations
			const chunksMap = new Map(Object.entries(layer.chunks));

			// Extract tiles from selection (including empty tiles)
			for (let y = selection.startY; y <= selection.endY; y++) {
				for (let x = selection.startX; x <= selection.endX; x++) {
					const tileId = getTile(chunksMap, x, y);
					const relativeX = x - selection.startX;
					const relativeY = y - selection.startY;
					tiles.set(`${relativeX},${relativeY}`, tileId);
				}
			}

			setTileClipboard({
				tiles,
				width,
				height,
				sourceLayerId: selection.layerId,
			});
		},
		[localLayers],
	);

	const handleCutTiles = useCallback(
		(selection: {
			startX: number;
			startY: number;
			endX: number;
			endY: number;
			layerId: string;
		}) => {
			// Copy first
			handleCopyTiles(selection);

			// Then erase
			const tilesToErase: Array<{ x: number; y: number }> = [];
			for (let y = selection.startY; y <= selection.endY; y++) {
				for (let x = selection.startX; x <= selection.endX; x++) {
					tilesToErase.push({ x, y });
				}
			}

			handleEraseTilesBatch(tilesToErase);
		},
		[handleCopyTiles, handleEraseTilesBatch],
	);

	const handlePasteTiles = useCallback(
		(targetX: number, targetY: number) => {
			if (!tileClipboard || !currentLayer) return;

			const tilesToPlace: Array<{ x: number; y: number; tileId: number }> = [];

			// Convert clipboard tiles to absolute positions
			for (const [key, tileId] of tileClipboard.tiles.entries()) {
				const [relX, relY] = key.split(",").map(Number);
				const absX = targetX + relX;
				const absY = targetY + relY;

				// No bounds check - infinite map!
				tilesToPlace.push({ x: absX, y: absY, tileId });
			}

			// Use same logic as handlePlaceTilesBatch but with explicit tileIds
			if (tilesToPlace.length === 0) return;

			// Calculate affected chunks for undo system
			const affectedChunksSet = new Set<string>();

			for (const { x, y } of tilesToPlace) {
				const chunkX = Math.floor(x / CHUNK_SIZE);
				const chunkY = Math.floor(y / CHUNK_SIZE);
				affectedChunksSet.add(`${chunkX},${chunkY}`);
			}

			const affectedChunks = Array.from(affectedChunksSet).map((key) => {
				const [chunkX, chunkY] = key.split(",").map(Number);
				return { layerId: currentLayer.id, chunkX, chunkY };
			});

			setLocalMapData(
				(prev) => ({
					...prev,
					layers: prev.layers.map((layer) => {
						if (layer.id === currentLayer.id) {
							// Convert chunks to Map for efficient operations
							const chunksMap = new Map(Object.entries(layer.chunks));

							for (const { x, y, tileId } of tilesToPlace) {
								setTile(chunksMap, x, y, tileId);
							}

							// Convert Map back to plain object
							const newChunks: Record<string, number[]> = {};
							for (const [key, value] of chunksMap) {
								newChunks[key] = value;
							}

							return { ...layer, chunks: newChunks };
						}
						return layer;
					}),
				}),
				affectedChunks,
			);

			// Invalidate affected tiles
			mapCanvasRef.current?.invalidateTiles(
				currentLayer.id,
				tilesToPlace.map(({ x, y }) => ({ x, y })),
			);
			setProjectModified(true);
		},
		[tileClipboard, currentLayer, setLocalMapData, setProjectModified],
	);

	const handleDeleteSelectedTiles = useCallback(
		(selection: {
			startX: number;
			startY: number;
			endX: number;
			endY: number;
			layerId: string;
		}) => {
			const tilesToErase: Array<{ x: number; y: number }> = [];
			for (let y = selection.startY; y <= selection.endY; y++) {
				for (let x = selection.startX; x <= selection.endX; x++) {
					tilesToErase.push({ x, y });
				}
			}

			handleEraseTilesBatch(tilesToErase);
		},
		[handleEraseTilesBatch],
	);

	const handleMousePositionChange = useCallback(
		(x: number | null, y: number | null) => {
			if (x === null || y === null) {
				setMousePos(null);
			} else {
				setMousePos({ x, y });
			}
		},
		[],
	);

	const handlePlaceEntity = useCallback(
		(x: number, y: number) => {
			if (!selectedEntityDefId) return;

			const entityInstance = entityManager.createInstance(
				selectedEntityDefId,
				x,
				y,
			);

			if (!entityInstance) return;

			// Batch the entity placement as a single undo action
			startMetaBatch();
			setLocalMapMeta((prev) => ({
				...prev,
				entities: [...prev.entities, entityInstance],
			}));
			endMetaBatch();
			setProjectModified(true);
		},
		[
			selectedEntityDefId,
			setProjectModified,
			setLocalMapMeta,
			startMetaBatch,
			endMetaBatch,
		],
	);

	// Handle moving an entity
	const handleMoveEntity = useCallback(
		(entityId: string, newX: number, newY: number) => {
			setLocalMapMeta((prev) => ({
				...prev,
				entities: prev.entities.map((entity) =>
					entity.id === entityId ? { ...entity, x: newX, y: newY } : entity,
				),
			}));
			setProjectModified(true);
		},
		[setProjectModified, setLocalMapMeta],
	);

	// Handle entity dragging (live update without marking modified)
	const handleEntityDragging = useCallback(
		(entityId: string, newX: number, newY: number) => {
			setLocalMapMeta((prev) => ({
				...prev,
				entities: prev.entities.map((entity) =>
					entity.id === entityId ? { ...entity, x: newX, y: newY } : entity,
				),
			}));
			// Don't mark as modified during drag - only on release
		},
		[setLocalMapMeta],
	);

	// Handle updating entity properties
	const handleUpdateEntity = useCallback(
		(entityId: string, updates: Partial<EntityInstance>) => {
			setLocalMapMeta((prev) => ({
				...prev,
				entities: prev.entities.map((entity) =>
					entity.id === entityId ? { ...entity, ...updates } : entity,
				),
			}));
			setProjectModified(true);
		},
		[setProjectModified, setLocalMapMeta],
	);

	// Handle deleting an entity
	const handleDeleteEntity = useCallback(
		(entityId: string) => {
			startMetaBatch();
			setLocalMapMeta((prev) => ({
				...prev,
				entities: prev.entities.filter((entity) => entity.id !== entityId),
			}));
			endMetaBatch();
			setProjectModified(true);
			setSelectedEntityId(null); // Clear selection after delete
		},
		[setProjectModified, setLocalMapMeta, startMetaBatch, endMetaBatch],
	);

	// Handle duplicating an entity
	const handleDuplicateEntity = useCallback(
		(entityId: string) => {
			// Find the entity to duplicate
			const entityToDuplicate = localMapMeta.entities.find(
				(entity) => entity.id === entityId,
			);
			if (!entityToDuplicate) return;

			// Create a new entity with a new ID but same properties
			// Offset it slightly so it's visible
			const newEntity: EntityInstance = {
				...entityToDuplicate,
				id: generateId(),
				x: entityToDuplicate.x + 16, // Offset by 16 pixels
				y: entityToDuplicate.y + 16,
			};

			startMetaBatch();
			setLocalMapMeta((prev) => ({
				...prev,
				entities: [...prev.entities, newEntity],
			}));
			endMetaBatch();
			setProjectModified(true);
			// Select the newly duplicated entity
			setSelectedEntityId(newEntity.id);
		},
		[
			localMapMeta.entities,
			setProjectModified,
			setLocalMapMeta,
			startMetaBatch,
			endMetaBatch,
		],
	);

	// Handle placing a point
	const handlePlacePoint = useCallback(
		(x: number, y: number) => {
			const pointInstance: PointInstance = {
				id: generateId(),
				x: Math.floor(x),
				y: Math.floor(y),
				name: "",
				type: "",
				properties: {},
			};

			startMetaBatch();
			setLocalMapMeta((prev) => ({
				...prev,
				points: [...prev.points, pointInstance],
			}));
			endMetaBatch();
			setProjectModified(true);
			// Auto-select the newly placed point
			setSelectedPointId(pointInstance.id);
			// Switch to pointer tool after a brief delay to ensure state updates
			setTimeout(() => {
				updateTabData(tab.id, {
					viewState: {
						...tab.viewState,
						currentTool: "pointer",
					},
				});
			}, 0);
		},
		[
			setLocalMapMeta,
			setProjectModified,
			updateTabData,
			tab.id,
			tab.viewState,
			startMetaBatch,
			endMetaBatch,
		],
	);

	// Handle moving a point
	const handleMovePoint = useCallback(
		(pointId: string, newX: number, newY: number) => {
			setLocalMapMeta((prev) => ({
				...prev,
				points: prev.points.map((point) =>
					point.id === pointId ? { ...point, x: newX, y: newY } : point,
				),
			}));
			setProjectModified(true);
		},
		[setLocalMapMeta, setProjectModified],
	);

	// Handle point dragging (live update without marking modified)
	const handlePointDragging = useCallback(
		(pointId: string, newX: number, newY: number) => {
			setLocalMapMeta((prev) => ({
				...prev,
				points: prev.points.map((point) =>
					point.id === pointId ? { ...point, x: newX, y: newY } : point,
				),
			}));
			// Don't mark as modified during drag - only on release
		},
		[setLocalMapMeta],
	);

	// Handle updating point properties
	const handleUpdatePoint = useCallback(
		(pointId: string, updates: Partial<PointInstance>) => {
			setLocalMapMeta((prev) => ({
				...prev,
				points: prev.points.map((point) =>
					point.id === pointId ? { ...point, ...updates } : point,
				),
			}));
			setProjectModified(true);
		},
		[setLocalMapMeta, setProjectModified],
	);

	// Handle deleting a point
	const handleDeletePoint = useCallback(
		(pointId: string) => {
			startMetaBatch();
			setLocalMapMeta((prev) => ({
				...prev,
				points: prev.points.filter((point) => point.id !== pointId),
			}));
			endMetaBatch();
			setProjectModified(true);
			setSelectedPointId(null); // Clear selection after delete
		},
		[setLocalMapMeta, setProjectModified, startMetaBatch, endMetaBatch],
	);

	// Handle adding a new collider
	const handleAddCollider = useCallback(
		(points: Array<{ x: number; y: number }>) => {
			const collider: PolygonCollider = {
				id: generateId(),
				name: "",
				type: "",
				points: points.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })),
				properties: {},
			};

			startMetaBatch();
			setLocalMapMeta((prev) => ({
				...prev,
				colliders: [...prev.colliders, collider],
			}));
			endMetaBatch();
			setProjectModified(true);
			// Auto-select the newly created collider
			setSelectedColliderId(collider.id);
		},
		[setLocalMapMeta, setProjectModified, startMetaBatch, endMetaBatch],
	);

	// Handle updating a collider point
	const handleUpdateColliderPoint = useCallback(
		(colliderId: string, pointIndex: number, x: number, y: number) => {
			setLocalMapMeta((prev) => ({
				...prev,
				colliders: prev.colliders.map((collider) => {
					if (collider.id === colliderId) {
						const newPoints = [...collider.points];
						newPoints[pointIndex] = { x: Math.floor(x), y: Math.floor(y) };
						return { ...collider, points: newPoints };
					}
					return collider;
				}),
			}));
			setProjectModified(true);
		},
		[setLocalMapMeta, setProjectModified],
	);

	// Handle updating collider properties
	const handleUpdateCollider = useCallback(
		(colliderId: string, updates: Partial<PolygonCollider>) => {
			setLocalMapMeta((prev) => ({
				...prev,
				colliders: prev.colliders.map((collider) =>
					collider.id === colliderId ? { ...collider, ...updates } : collider,
				),
			}));
			setProjectModified(true);
		},
		[setLocalMapMeta, setProjectModified],
	);

	// Handle collider dragging (updates without marking as modified)
	const handleColliderDragging = useCallback(
		(colliderId: string, updates: Partial<PolygonCollider>) => {
			setLocalMapMeta((prev) => ({
				...prev,
				colliders: prev.colliders.map((collider) =>
					collider.id === colliderId ? { ...collider, ...updates } : collider,
				),
			}));
			// Don't mark as modified during drag - only on release
		},
		[setLocalMapMeta],
	);

	// Handle deleting a collider
	const handleDeleteCollider = useCallback(
		(colliderId: string) => {
			startMetaBatch();
			setLocalMapMeta((prev) => ({
				...prev,
				colliders: prev.colliders.filter(
					(collider) => collider.id !== colliderId,
				),
			}));
			endMetaBatch();
			setProjectModified(true);
			setSelectedColliderId(null); // Clear selection after delete
			setSelectedColliderPointIndex(null);
		},
		[setLocalMapMeta, setProjectModified, startMetaBatch, endMetaBatch],
	);

	// Handle deleting a collider point
	const handleDeleteColliderPoint = useCallback(() => {
		if (!contextMenu?.colliderId || contextMenu.pointIndex === undefined)
			return;

		const collider = localMapMeta.colliders.find(
			(c) => c.id === contextMenu.colliderId,
		);
		if (!collider || collider.points.length <= 3) return;

		const newPoints = collider.points.filter(
			(_, i) => i !== contextMenu.pointIndex,
		);

		startMetaBatch();
		setLocalMapMeta((prev) => ({
			...prev,
			colliders: prev.colliders.map((c) =>
				c.id === contextMenu.colliderId ? { ...c, points: newPoints } : c,
			),
		}));
		endMetaBatch();
		setProjectModified(true);
		setContextMenu(null);
	}, [
		contextMenu,
		localMapMeta.colliders,
		setLocalMapMeta,
		setProjectModified,
		startMetaBatch,
		endMetaBatch,
	]);

	// Handle inserting a point on a collider edge
	const handleInsertColliderPoint = useCallback(() => {
		if (
			!contextMenu?.colliderId ||
			contextMenu.edgeIndex === undefined ||
			!contextMenu.insertPosition
		)
			return;

		const snappedX = Math.round(contextMenu.insertPosition.x);
		const snappedY = Math.round(contextMenu.insertPosition.y);

		startMetaBatch();
		setLocalMapMeta((prev) => ({
			...prev,
			colliders: prev.colliders.map((c) => {
				if (
					c.id === contextMenu.colliderId &&
					contextMenu.edgeIndex !== undefined
				) {
					const newPoints = [...c.points];
					newPoints.splice(contextMenu.edgeIndex + 1, 0, {
						x: snappedX,
						y: snappedY,
					});
					return { ...c, points: newPoints };
				}
				return c;
			}),
		}));
		endMetaBatch();
		setProjectModified(true);
		setContextMenu(null);
	}, [
		contextMenu,
		setLocalMapMeta,
		setProjectModified,
		startMetaBatch,
		endMetaBatch,
	]);

	// Batch tile placement (for rectangle and fill tools) - single undo/redo action
	const handlePlaceTilesBatch = useCallback(
		(tiles: Array<{ x: number; y: number }>) => {
			if (!currentLayer || tiles.length === 0) {
				return;
			}

			// Check if we're in terrain painting mode
			if (selectedTerrainLayerId) {
				// For terrain tiles, we need to place each one and update neighbors
				// But we can batch the entire operation into one state update
				const selectedTileset = selectedTilesetId
					? tilesets.find((ts) => ts.id === selectedTilesetId)
					: null;
				if (!selectedTileset?.terrainLayers) {
					return;
				}

				const terrainLayer = selectedTileset.terrainLayers.find(
					(l) => l.id === selectedTerrainLayerId,
				);
				if (!terrainLayer) {
					return;
				}

				const tilesetOrder = selectedTileset.order;

				// Calculate affected chunks for undo system
				const affectedChunksSet = new Set<string>();
				tiles.forEach(({ x, y }) => {
					// Add chunks for placed tiles + neighbors (terrain updates neighbors)
					for (let dy = -1; dy <= 1; dy++) {
						for (let dx = -1; dx <= 1; dx++) {
							const tileX = x + dx;
							const tileY = y + dy;
							const chunkX = Math.floor(tileX / CHUNK_SIZE);
							const chunkY = Math.floor(tileY / CHUNK_SIZE);
							affectedChunksSet.add(`${chunkX},${chunkY}`);
						}
					}
				});
				const affectedChunks = Array.from(affectedChunksSet).map((key) => {
					const [chunkX, chunkY] = key.split(",").map(Number);
					return { layerId: currentLayer.id, chunkX, chunkY };
				});
				setLocalMapData(
					(prev) => ({
						...prev,
						layers: prev.layers.map((layer) => {
							if (layer.id === currentLayer.id) {
								const mutableLayer = { ...layer };

								// Place all tiles (infinite maps - no bounds checking)
								tiles.forEach(({ x, y }) => {
									placeTerrainTile(
										mutableLayer,
										x,
										y,
										terrainLayer,
										selectedTileset,
										tilesetOrder,
										tilesets,
									);
								});

								// Update neighbors for all placed tiles
								tiles.forEach(({ x, y }) => {
									updateNeighborsAround(
										mutableLayer,
										x,
										y,
										terrainLayer.id,
										selectedTileset,
										tilesetOrder,
										tilesets,
									);
								});

								return { ...layer, chunks: mutableLayer.chunks };
							}
							return layer;
						}),
					}),
					affectedChunks,
				);

				// Invalidate chunks for all affected tiles (placed tiles + neighbors)
				const affectedTiles: Array<{ x: number; y: number }> = [];
				tiles.forEach(({ x, y }) => {
					// Add placed tile
					affectedTiles.push({ x, y });
					// Add 8 neighbors (terrain autotiling updates neighbors)
					for (let dy = -1; dy <= 1; dy++) {
						for (let dx = -1; dx <= 1; dx++) {
							if (dx === 0 && dy === 0) continue;
							affectedTiles.push({ x: x + dx, y: y + dy });
						}
					}
				});
				mapCanvasRef.current?.invalidateTiles(currentLayer.id, affectedTiles);

				setProjectModified(true);
				return;
			}

			// Regular tile placement
			const selectedTileset = selectedTilesetId
				? tilesets.find((ts) => ts.id === selectedTilesetId)
				: null;

			if (!selectedTileset || !selectedTileId) {
				return;
			}

			const tilesetOrder = selectedTileset.order;

			const geometry = unpackTileId(selectedTileId);
			const globalTileId = packTileId(
				geometry.x,
				geometry.y,
				tilesetOrder,
				geometry.flipX,
				geometry.flipY,
			);

			// Calculate affected chunks for undo system
			const affectedChunksSet = new Set<string>();
			tiles.forEach(({ x, y }) => {
				const chunkX = Math.floor(x / CHUNK_SIZE);
				const chunkY = Math.floor(y / CHUNK_SIZE);
				affectedChunksSet.add(`${chunkX},${chunkY}`);
			});
			const affectedChunks = Array.from(affectedChunksSet).map((key) => {
				const [chunkX, chunkY] = key.split(",").map(Number);
				return { layerId: currentLayer.id, chunkX, chunkY };
			});

			setLocalMapData((prev) => {
				return {
					...prev,
					layers: prev.layers.map((layer) => {
						if (layer.id === currentLayer.id) {
							// Convert chunks to Map for efficient operations
							const chunksMap = new Map(Object.entries(layer.chunks));

							// Place all tiles
							tiles.forEach(({ x, y }) => {
								setTile(chunksMap, x, y, globalTileId);
							});

							// Convert Map back to plain object
							const newChunks: Record<string, number[]> = {};
							for (const [key, value] of chunksMap) {
								newChunks[key] = value;
							}

							return { ...layer, chunks: newChunks };
						}
						return layer;
					}),
				};
			}, affectedChunks);

			// Invalidate chunks for placed tiles
			mapCanvasRef.current?.invalidateTiles(currentLayer.id, tiles);

			setProjectModified(true);
		},
		[
			currentLayer,
			selectedTilesetId,
			selectedTileId,
			selectedTerrainLayerId,
			tilesets,
			setProjectModified,
			setLocalMapData,
		],
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

	// Delete entity, point, or collider on Backspace or Delete key
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Only delete if something is selected and we're not typing in an input field
			if (
				(e.key === "Backspace" || e.key === "Delete") &&
				!(e.target instanceof HTMLInputElement) &&
				!(e.target instanceof HTMLTextAreaElement)
			) {
				if (selectedEntityId) {
					e.preventDefault();
					handleDeleteEntity(selectedEntityId);
				} else if (selectedPointId) {
					e.preventDefault();
					handleDeletePoint(selectedPointId);
				} else if (selectedColliderId) {
					e.preventDefault();
					// If a specific point is selected, delete the point
					if (selectedColliderPointIndex !== null) {
						const collider = localMapData.colliders?.find(
							(c) => c.id === selectedColliderId,
						);
						if (collider && collider.points.length > 3) {
							const newPoints = collider.points.filter(
								(_, i) => i !== selectedColliderPointIndex,
							);
							const newColliders = (localMapData.colliders || []).map((c) =>
								c.id === selectedColliderId ? { ...c, points: newPoints } : c,
							);
							setLocalMapData({
								...localMapData,
								colliders: newColliders,
							});
							setSelectedColliderPointIndex(null);
							setProjectModified(true);
						}
					} else {
						// No point selected, delete the entire collider
						handleDeleteCollider(selectedColliderId);
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		selectedEntityId,
		selectedPointId,
		selectedColliderId,
		selectedColliderPointIndex,
		localMapData,
		handleDeleteEntity,
		handleDeletePoint,
		handleDeleteCollider,
		setLocalMapData,
		setProjectModified,
	]);

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
								background: "transparent",
								color: "#cccccc",
								border: "none",
								padding: 0,
								minWidth: 0,
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
							title="Click to edit map name"
						>
							{localMapData?.name || "Untitled Map"}
						</div>
					)}
				</div>

				{/* Settings */}
				<div className="flex-1 overflow-auto p-4">
					<div className="space-y-4">
						{/* Map Properties section removed - infinite maps don't have size */}

						{/* Layers Panel */}
						<div>
							<div>
								<div
									className="text-xs font-semibold uppercase tracking-wide mb-2"
									style={{ color: "#858585" }}
								>
									Layers
								</div>

								<LayersPanel
									ref={layersPanelRef}
									layers={localLayers}
									groups={localGroups}
									currentLayerId={currentLayerId}
									selectedGroupId={selectedGroupId}
									onLayersChange={setLocalLayers}
									onGroupsChange={setLocalGroups}
									onSelectLayer={handleSelectLayer}
									onSelectGroup={handleSelectGroup}
									onAddLayer={handleAddLayer}
									onAddGroup={handleAddGroup}
									onLayerContextMenu={handleLayerContextMenu}
									onGroupContextMenu={handleGroupContextMenu}
								/>

								{/* Layer Properties (shown when a layer is selected) */}
								{currentLayer && (
									<div
										className="mt-3 pt-3"
										style={{ borderTop: "1px solid #3e3e42" }}
									>
										<div
											className="text-xs font-semibold uppercase tracking-wide mb-2"
											style={{ color: "#858585" }}
										>
											Layer Properties
										</div>

										{/* Tile Size */}
										<div className="mb-3">
											<div
												className="text-xs font-medium block mb-1.5"
												style={{ color: "#858585" }}
											>
												Tile Size
											</div>
											<div className="grid grid-cols-2 gap-2">
												<div className="flex">
													<div className="text-xs w-6 font-bold bg-blue-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
														W
													</div>
													<div className="flex-1">
														<DragNumberInput
															value={currentLayer.tileWidth}
															onChange={(value) =>
																handleLayerTileSizeChange("tileWidth", value)
															}
															onInput={(value) =>
																handleLayerTileSizeChange("tileWidth", value)
															}
															onDragStart={startBatch}
															onDragEnd={endBatch}
															min={1}
															max={256}
															step={1}
															precision={0}
															dragSpeed={0.1}
															roundedLeft={false}
														/>
													</div>
												</div>
												<div className="flex">
													<div className="text-xs w-6 font-bold bg-violet-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
														H
													</div>
													<div className="flex-1">
														<DragNumberInput
															value={currentLayer.tileHeight}
															onChange={(value) =>
																handleLayerTileSizeChange("tileHeight", value)
															}
															onInput={(value) =>
																handleLayerTileSizeChange("tileHeight", value)
															}
															onDragStart={startBatch}
															onDragEnd={endBatch}
															min={1}
															max={256}
															step={1}
															precision={0}
															dragSpeed={0.1}
															roundedLeft={false}
														/>
													</div>
												</div>
											</div>
										</div>

										{/* Parallax Speed */}
										<div className="mb-3">
											<div
												className="text-xs font-medium block mb-1.5"
												style={{ color: "#858585" }}
											>
												Parallax Speed
											</div>
											<div className="grid grid-cols-2 gap-2">
												<div className="flex">
													<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
														X
													</div>
													<div className="flex-1">
														<DragNumberInput
															value={currentLayer.parallaxX}
															onChange={(value) =>
																handleLayerParallaxChange("parallaxX", value)
															}
															onInput={(value) =>
																handleLayerParallaxChange("parallaxX", value)
															}
															onDragStart={startBatch}
															onDragEnd={endBatch}
															min={0}
															max={10}
															step={0.1}
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
															value={currentLayer.parallaxY}
															onChange={(value) =>
																handleLayerParallaxChange("parallaxY", value)
															}
															onInput={(value) =>
																handleLayerParallaxChange("parallaxY", value)
															}
															onDragStart={startBatch}
															onDragEnd={endBatch}
															min={0}
															max={10}
															step={0.1}
															precision={2}
															dragSpeed={0.01}
															roundedLeft={false}
														/>
													</div>
												</div>
											</div>
										</div>

										{/* Layer Tint */}
										<div className="mb-3">
											<div
												className="text-xs font-medium block mb-1.5"
												style={{ color: "#858585" }}
											>
												Tint
											</div>
											<TintInput
												tint={currentLayer.tint}
												onChange={handleLayerTintChange}
												inputKey={currentLayer.id}
											/>
										</div>

										{/* Custom Properties */}
										<CustomPropertiesEditor
											properties={currentLayer.properties || {}}
											onChange={handleLayerPropertiesChange}
										/>
									</div>
								)}

								{/* Group Properties (shown when a group is selected) */}
								{selectedGroup && (
									<div
										className="mt-3 pt-3"
										style={{ borderTop: "1px solid #3e3e42" }}
									>
										<div
											className="text-xs font-semibold uppercase tracking-wide mb-2"
											style={{ color: "#858585" }}
										>
											Group Properties
										</div>

										{/* Group Parallax Speed */}
										<div className="mb-3">
											<div
												className="text-xs font-medium block mb-1.5"
												style={{ color: "#858585" }}
											>
												Parallax Speed
											</div>
											<div className="grid grid-cols-2 gap-2">
												<div className="flex">
													<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
														X
													</div>
													<div className="flex-1">
														<DragNumberInput
															value={selectedGroup.parallaxX}
															onChange={(value) =>
																setLocalGroups(
																	localGroups.map((g) =>
																		g.id === selectedGroup.id
																			? { ...g, parallaxX: value }
																			: g,
																	),
																)
															}
															onInput={(value) =>
																setLocalGroups(
																	localGroups.map((g) =>
																		g.id === selectedGroup.id
																			? { ...g, parallaxX: value }
																			: g,
																	),
																)
															}
															min={0}
															max={10}
															step={0.1}
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
															value={selectedGroup.parallaxY}
															onChange={(value) =>
																setLocalGroups(
																	localGroups.map((g) =>
																		g.id === selectedGroup.id
																			? { ...g, parallaxY: value }
																			: g,
																	),
																)
															}
															onInput={(value) =>
																setLocalGroups(
																	localGroups.map((g) =>
																		g.id === selectedGroup.id
																			? { ...g, parallaxY: value }
																			: g,
																	),
																)
															}
															min={0}
															max={10}
															step={0.1}
															precision={2}
															dragSpeed={0.01}
															roundedLeft={false}
														/>
													</div>
												</div>
											</div>
										</div>

										{/* Group Tint */}
										<div className="mb-3">
											<div
												className="text-xs font-medium block mb-1.5"
												style={{ color: "#858585" }}
											>
												Tint
											</div>
											<TintInput
												tint={selectedGroup.tint}
												onChange={(tint) =>
													setLocalGroups(
														localGroups.map((g) =>
															g.id === selectedGroup.id ? { ...g, tint } : g,
														),
													)
												}
												inputKey={selectedGroup.id}
											/>
										</div>

										{/* Custom Properties */}
										<CustomPropertiesEditor
											properties={selectedGroup.properties || {}}
											onChange={handleGroupPropertiesChange}
										/>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Center - Toolbar and Map Canvas */}
			<div className="flex-1 flex flex-col relative">
				{/* Toolbar */}
				<Toolbar
					currentTool={tab.viewState.currentTool || "pencil"}
					onToolChange={handleToolChange}
					onOpenEntitySelect={onOpenEntitySelect}
					onOpenTilesetSelect={onOpenTilesetSelect}
					onOpenTilePicker={onOpenTilePicker}
					onOpenTerrainPicker={onOpenTerrainPicker}
					gridVisible={gridVisible}
					onGridToggle={() => setGridVisible(!gridVisible)}
				/>

				{/* Map Canvas */}
				<div className="flex-1 flex relative">
					<MapCanvas
						ref={mapCanvasRef}
						mapData={localMapData}
						currentTool={tab.viewState.currentTool || "pencil"}
						onToolChange={handleToolChange}
						currentLayerId={currentLayerId}
						onPlaceTilesBatch={handlePlaceTilesBatch}
						onEraseTilesBatch={handleEraseTilesBatch}
						onPlaceEntity={handlePlaceEntity}
						onMoveEntity={handleMoveEntity}
						onEntitySelected={setSelectedEntityId}
						onEntityDragging={handleEntityDragging}
						onDeleteEntity={handleDeleteEntity}
						onDuplicateEntity={handleDuplicateEntity}
						onPlacePoint={handlePlacePoint}
						onMovePoint={handleMovePoint}
						selectedPointId={selectedPointId}
						onPointSelected={setSelectedPointId}
						onPointDragging={handlePointDragging}
						onDeletePoint={handleDeletePoint}
						onAddCollider={handleAddCollider}
						onUpdateColliderPoint={handleUpdateColliderPoint}
						onUpdateCollider={handleUpdateCollider}
						onColliderDragging={handleColliderDragging}
						onColliderSelected={setSelectedColliderId}
						onColliderPointSelected={setSelectedColliderPointIndex}
						onDeleteCollider={handleDeleteCollider}
						onContextMenuRequest={setContextMenu}
						onStartBatch={handleStartBatch}
						onEndBatch={handleEndBatch}
						onCopyTiles={handleCopyTiles}
						onCutTiles={handleCutTiles}
						onPasteTiles={handlePasteTiles}
						onDeleteSelectedTiles={handleDeleteSelectedTiles}
						onClearTileSelection={() => {
							// Clear tile selection (will be called from keyboard shortcuts)
						}}
						onMousePositionChange={handleMousePositionChange}
					/>

					{/* Status bar */}
					<div
						className="absolute bottom-0 left-0 right-0 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300"
						style={{
							background: "rgba(37, 37, 38, 0.95)",
							borderTop: "1px solid #3e3e42",
						}}
					>
						{/* Current layer */}
						<div className="flex items-center gap-2">
							<span className="text-gray-500">Layer:</span>
							<span className="font-mono">{currentLayer?.name || "None"}</span>
						</div>

						<div className="w-px h-4 bg-gray-700" />

						{/* Current tool */}
						<div className="flex items-center gap-2">
							<span className="text-gray-500">Tool:</span>
							<span className="font-mono capitalize">
								{tab.viewState.currentTool || "Pencil"}
							</span>
						</div>

						{/* Cursor position */}
						{mousePos && (
							<>
								<div className="w-px h-4 bg-gray-700" />
								<div className="flex items-center gap-2">
									<span className="text-gray-500">Cursor:</span>
									<span className="font-mono">
										{mousePos.x}, {mousePos.y}
									</span>
								</div>
							</>
						)}

						<div className="flex-1" />

						{/* Zoom level */}
						<div className="flex items-center gap-2">
							<span className="text-gray-500">Zoom:</span>
							<span className="font-mono">{Math.round(zoom * 100)}%</span>
						</div>
					</div>
				</div>
			</div>

			{/* Resize Handle */}
			<div
				className={`resize-handle ${isResizing ? "active" : ""}`}
				onMouseDown={handleResizeStart}
				role="separator"
				aria-label="Resize panel"
				aria-orientation="vertical"
				aria-valuenow={rightPanelWidth}
				tabIndex={0}
				style={{
					width: "4px",
					background: isResizing ? "#007acc" : "#3e3e42",
					cursor: "col-resize",
					flexShrink: 0,
				}}
			/>

			{/* Right Sidebar - Tileset Panel */}
			{/* Right Panel - Show when entity, point, or collider is selected */}
			{((tab.viewState.currentTool || "pencil") === "pointer" &&
				(selectedEntityId || selectedPointId || selectedColliderId)) ||
			((tab.viewState.currentTool || "pencil") === "collision" &&
				selectedColliderId) ? (
				<div
					className="flex flex-col"
					style={{
						width: `${rightPanelWidth}px`,
						background: "#252526",
						borderLeft: "1px solid #3e3e42",
					}}
				>
					{selectedEntityId ? (
						<EntityPropertiesPanel
							selectedEntityId={selectedEntityId}
							mapData={localMapData}
							onUpdateEntity={handleUpdateEntity}
							onDragStart={handleStartBatch}
							onDragEnd={handleEndBatch}
						/>
					) : selectedPointId ? (
						<PointPropertiesPanel
							selectedPointId={selectedPointId}
							mapData={localMapData}
							onUpdatePoint={handleUpdatePoint}
							onDragStart={handleStartBatch}
							onDragEnd={handleEndBatch}
						/>
					) : selectedColliderId ? (
						<ColliderPropertiesPanel
							collider={
								localMapData.colliders?.find(
									(c) => c.id === selectedColliderId,
								) || null
							}
							selectedPointIndex={selectedColliderPointIndex}
							onUpdateCollider={handleUpdateCollider}
							onUpdateColliderPoint={handleUpdateColliderPoint}
							onDragStart={handleStartBatch}
							onDragEnd={handleEndBatch}
						/>
					) : null}
				</div>
			) : null}

			{/* Context Menu */}
			{contextMenu &&
				createPortal(
					<>
						{/* Backdrop */}
						<div
							style={{
								position: "fixed",
								inset: 0,
								zIndex: 40,
							}}
							onClick={() => setContextMenu(null)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setContextMenu(null);
								}
							}}
							role="button"
							tabIndex={-1}
							aria-label="Close context menu"
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
							{contextMenu.colliderId ? (
								// Right-clicked on collider
								<>
									{contextMenu.pointIndex !== undefined && (
										<div
											className="px-4 py-2 text-sm cursor-pointer transition-colors"
											style={{ color: "#f48771" }}
											onMouseEnter={(e) => {
												e.currentTarget.style.background = "#3e3e42";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.background = "transparent";
											}}
											onClick={handleDeleteColliderPoint}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													handleDeleteColliderPoint();
												}
											}}
											role="menuitem"
											tabIndex={0}
										>
											Delete Point
										</div>
									)}
									{contextMenu.edgeIndex !== undefined && (
										<>
											<div
												className="px-4 py-2 text-sm cursor-pointer transition-colors"
												style={{ color: "#4ade80" }}
												onMouseEnter={(e) => {
													e.currentTarget.style.background = "#3e3e42";
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.background = "transparent";
												}}
												onClick={handleInsertColliderPoint}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														handleInsertColliderPoint();
													}
												}}
												role="menuitem"
												tabIndex={0}
											>
												Add Point
											</div>
											<div
												className="px-4 py-2 text-sm cursor-pointer transition-colors"
												style={{ color: "#f48771" }}
												onMouseEnter={(e) => {
													e.currentTarget.style.background = "#3e3e42";
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.background = "transparent";
												}}
												onClick={() => {
													if (contextMenu.colliderId) {
														handleDeleteCollider(contextMenu.colliderId);
													}
													setContextMenu(null);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														if (contextMenu.colliderId) {
															handleDeleteCollider(contextMenu.colliderId);
														}
														setContextMenu(null);
													}
												}}
												role="menuitem"
												tabIndex={0}
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
												onMouseEnter={(e) => {
													e.currentTarget.style.background = "#3e3e42";
												}}
												onMouseLeave={(e) => {
													e.currentTarget.style.background = "transparent";
												}}
												onClick={() => {
													if (contextMenu.colliderId) {
														handleDeleteCollider(contextMenu.colliderId);
													}
													setContextMenu(null);
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														if (contextMenu.colliderId) {
															handleDeleteCollider(contextMenu.colliderId);
														}
														setContextMenu(null);
													}
												}}
												role="menuitem"
												tabIndex={0}
											>
												Delete Collider
											</div>
										)}
								</>
							) : contextMenu.layerId ? (
								// Right-clicked on layer
								<>
									{/* Rename */}
									<div
										onClick={handleRenameLayer}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleRenameLayer();
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
										onClick={handleDeleteLayerFromMenu}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleDeleteLayerFromMenu();
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
								</>
							) : contextMenu.groupId ? (
								// Right-clicked on group
								<>
									{/* Rename */}
									<div
										onClick={handleRenameGroup}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleRenameGroup();
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
										onClick={handleDeleteGroupFromMenu}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleDeleteGroupFromMenu();
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
								</>
							) : null}
						</div>
					</>,
					document.body,
				)}
		</div>
	);
};
