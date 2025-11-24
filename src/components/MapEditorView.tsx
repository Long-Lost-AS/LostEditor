import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
	MapTab,
	PointInstance,
	PolygonCollider,
	Tool,
} from "../types";
import { generateId } from "../utils/id";
import { calculateMenuPosition } from "../utils/menuPositioning";
import {
	placeTerrainTile,
	updateNeighborsAround,
} from "../utils/terrainDrawing";
import { packTileId, unpackTileId } from "../utils/tileId";
import { ColliderPropertiesPanel } from "./ColliderPropertiesPanel";
import { DragNumberInput } from "./DragNumberInput";
import { EntityPropertiesPanel } from "./EntityPropertiesPanel";
import { PencilIcon, TrashIcon } from "./Icons";
import { MapCanvas, type MapCanvasHandle } from "./MapCanvas";
import { PointPropertiesPanel } from "./PointPropertiesPanel";
import { Toolbar } from "./Toolbar";

interface MapEditorViewProps {
	tab: MapTab;
	onOpenEntitySelect: () => void;
	onOpenTilesetSelect: () => void;
	onOpenTilePicker: () => void;
	onOpenTerrainPicker: () => void;
}

interface SortableLayerItemProps {
	layer: Layer;
	isActive: boolean;
	isEditing: boolean;
	editingName: string;
	inputRef?: React.RefObject<HTMLInputElement | null>;
	onClick: () => void;
	onDoubleClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onVisibilityChange: (visible: boolean) => void;
	onNameChange: (name: string) => void;
	onNameSubmit: () => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
}

const SortableLayerItem = ({
	layer,
	isActive,
	isEditing,
	editingName,
	inputRef,
	onClick,
	onDoubleClick,
	onContextMenu,
	onVisibilityChange,
	onNameChange,
	onNameSubmit,
	onKeyDown,
}: SortableLayerItemProps) => {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: layer.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			role="button"
			tabIndex={0}
			className={`px-2 py-1.5 text-xs rounded transition-colors flex items-center gap-2 ${
				isActive
					? "bg-[#0e639c] text-white"
					: "bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3e3e42]"
			} ${isDragging ? "opacity-50 cursor-grabbing" : "cursor-grab"}`}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			onContextMenu={onContextMenu}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			aria-pressed={isActive}
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
					onVisibilityChange(e.target.checked);
				}}
				onClick={(e) => e.stopPropagation()}
				title="Toggle visibility"
				style={{ accentColor: "#007acc" }}
				spellCheck={false}
			/>
			{isEditing ? (
				<input
					ref={inputRef}
					type="text"
					value={editingName}
					onChange={(e) => onNameChange(e.target.value)}
					onBlur={onNameSubmit}
					onKeyDown={onKeyDown}
					onClick={(e) => e.stopPropagation()}
					className="flex-1 text-xs focus:outline-none"
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
				<span className="flex-1 select-none">{layer.name}</span>
			)}
		</div>
	);
};

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
		reorderLayers,
		zoom,
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
			width: 0,
			height: 0,
			tileWidth: 16,
			tileHeight: 16,
			layers: [],
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

	// Register undo/redo keyboard shortcuts (combined tile + metadata)
	useRegisterUndoRedo({
		undo: () => {
			if (canUndo) {
				undo();
			} else if (canUndoMeta) {
				undoMeta();
			}
		},
		redo: () => {
			if (canRedo) {
				redo();
			} else if (canRedoMeta) {
				redoMeta();
			}
		},
		canUndo: canUndo || canUndoMeta,
		canRedo: canRedo || canRedoMeta,
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
				chunksByLayer.get(layerId)?.push({ x: chunkX * 64, y: chunkY * 64 });
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

	// Initialize currentLayerId when map loads
	useEffect(() => {
		if (currentLayerId === null && localMapData?.layers?.length > 0) {
			setCurrentLayerId(localMapData.layers[0].id);
		}
	}, [currentLayerId, localMapData?.layers]);
	const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
	const [editingLayerName, setEditingLayerName] = useState("");
	const layerInputRef = useRef<HTMLInputElement>(null);

	// Auto-focus layer input when editing starts
	useEffect(() => {
		if (editingLayerId && layerInputRef.current) {
			layerInputRef.current.focus();
			layerInputRef.current.select();
		}
	}, [editingLayerId]);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		layerId?: string;
		colliderId?: string;
		pointIndex?: number;
		edgeIndex?: number;
		insertPosition?: { x: number; y: number };
	} | null>(null);

	// Drag-and-drop state
	const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				delay: 150, // 150ms delay before drag starts
				tolerance: 5, // 5px tolerance during delay
			},
		}),
	);

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

	// Utility function to remap tile arrays when map dimensions change
	const remapTilesForResize = (
		tiles: number[],
		oldWidth: number,
		oldHeight: number,
		newWidth: number,
		newHeight: number,
	): number[] => {
		const newSize = newWidth * newHeight;
		const newTiles = new Array(newSize).fill(0);

		const rowsToCopy = Math.min(oldHeight, newHeight);
		const tilesPerRowToCopy = Math.min(oldWidth, newWidth);

		for (let y = 0; y < rowsToCopy; y++) {
			const oldRowStart = y * oldWidth;
			const newRowStart = y * newWidth;

			for (let x = 0; x < tilesPerRowToCopy; x++) {
				newTiles[newRowStart + x] = tiles[oldRowStart + x];
			}
		}

		return newTiles;
	};

	const handleMapSizeChange = (field: "width" | "height", value: number) => {
		if (!localMapData) return;

		const newValue = Math.round(value);
		const oldWidth = localMapData.width;
		const oldHeight = localMapData.height;
		const newWidth = field === "width" ? newValue : oldWidth;
		const newHeight = field === "height" ? newValue : oldHeight;

		// If dimensions haven't changed, do nothing
		if (newWidth === oldWidth && newHeight === oldHeight) return;

		// Remap all layers' tile arrays to preserve tile positions
		const remappedLayers = localMapData.layers.map((layer) => ({
			...layer,
			tiles: remapTilesForResize(
				layer.tiles,
				oldWidth,
				oldHeight,
				newWidth,
				newHeight,
			),
		}));

		setLocalMapData({
			...localMapData,
			width: newWidth,
			height: newHeight,
			layers: remappedLayers,
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
			id: generateId(),
			name: `Layer ${localMapData.layers.length + 1}`,
			visible: true,
			tiles: new Array(localMapData.width * localMapData.height).fill(0), // Dense array initialized with zeros
		};

		setLocalMapData({
			...localMapData,
			layers: [...(localMapData.layers || []), newLayer],
		});
		setCurrentLayerId(newLayer.id);
	};

	const handleRemoveLayer = (layerId: string) => {
		setLocalMapData({
			...localMapData,
			layers: localMapData.layers.filter((l) => l.id !== layerId),
		});
		if (currentLayerId === layerId) {
			setCurrentLayerId(localMapData.layers[0]?.id || null);
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

	const handleUpdateLayerVisibility = (layerId: string, visible: boolean) => {
		setLocalMapData({
			...localMapData,
			layers: localMapData.layers.map((l) =>
				l.id === layerId ? { ...l, visible } : l,
			),
		});
	};

	const handleUpdateLayerName = (layerId: string, name: string) => {
		setLocalMapData({
			...localMapData,
			layers: localMapData.layers.map((l) =>
				l.id === layerId ? { ...l, name } : l,
			),
		});
	};

	const handleLayerDoubleClick = (layer: Layer) => {
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

	const handleRenameLayer = () => {
		if (contextMenu?.layerId) {
			const layer = localMapData?.layers.find(
				(l) => l.id === contextMenu.layerId,
			);
			if (layer) {
				setEditingLayerId(layer.id);
				setEditingLayerName(layer.name);
			}
		}
		setContextMenu(null);
	};

	const handleDeleteLayerFromMenu = () => {
		if (contextMenu?.layerId) {
			handleRemoveLayer(contextMenu.layerId);
		}
		setContextMenu(null);
	};

	// Drag-and-drop handlers for layer reordering
	const handleDragStart = (event: DragStartEvent) => {
		setActiveLayerId(event.active.id as string);

		// Select the layer being dragged
		const draggedLayer = localMapData?.layers.find(
			(l) => l.id === event.active.id,
		);
		if (draggedLayer) {
			setCurrentLayerId(draggedLayer.id);
		}
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveLayerId(null);

		if (!over || active.id === over.id || !localMapData) {
			return;
		}

		// Get the reversed array (UI order: top layer at top)
		const reversedLayers = [...localMapData.layers].reverse();

		// Find indices in the reversed array
		const oldIndex = reversedLayers.findIndex((l) => l.id === active.id);
		const newIndex = reversedLayers.findIndex((l) => l.id === over.id);

		if (oldIndex === -1 || newIndex === -1) {
			return;
		}

		// Reorder in the reversed array
		const reorderedReversed = arrayMove(reversedLayers, oldIndex, newIndex);

		// Reverse back to get the correct internal order (bottom to top)
		const newLayersOrder = reorderedReversed.reverse();

		// Update local map data
		setLocalMapData({
			...localMapData,
			layers: newLayersOrder,
		});

		// Also update global state through reorderLayers
		reorderLayers(newLayersOrder);
	};

	// Paint functions (tile placement, erasing, entity placement)
	const handleEraseTilesBatch = useCallback(
		(tiles: Array<{ x: number; y: number }>) => {
			if (!currentLayer || tiles.length === 0) return;

			// Calculate affected chunks for undo system
			const CHUNK_SIZE = 64;
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
							const mapWidth = prev.width;
							const mapHeight = prev.height;
							const newTiles = layer.tiles;

							// Erase all tiles (no terrain neighbor updating)
							for (const { x, y } of tiles) {
								const index = y * mapWidth + x;

								// Erase the tile
								if (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) {
									newTiles[index] = 0;
								}

								// Track affected tile for invalidation (just the erased tile)
								affectedTiles.push({ x, y });
							}

							return { ...layer, tiles: newTiles };
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
			if (!localMapData) return;

			const layer = localMapData.layers.find((l) => l.id === selection.layerId);
			if (!layer) return;

			const width = selection.endX - selection.startX + 1;
			const height = selection.endY - selection.startY + 1;
			const tiles = new Map<string, number>();

			// Extract tiles from selection (including empty tiles)
			for (let y = selection.startY; y <= selection.endY; y++) {
				for (let x = selection.startX; x <= selection.endX; x++) {
					const index = y * localMapData.width + x;
					const tileId = layer.tiles[index];
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
		[localMapData],
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

				// Bounds check
				if (
					absX >= 0 &&
					absX < localMapData.width &&
					absY >= 0 &&
					absY < localMapData.height
				) {
					tilesToPlace.push({ x: absX, y: absY, tileId });
				}
			}

			// Use same logic as handlePlaceTilesBatch but with explicit tileIds
			if (tilesToPlace.length === 0) return;

			// Calculate affected chunks for undo system
			const CHUNK_SIZE = 64;
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
							// Mutate tiles array in place for performance (avoid copying entire array)
							const totalSize = prev.width * prev.height;
							const tiles =
								layer.tiles && layer.tiles.length === totalSize
									? layer.tiles
									: new Array(totalSize).fill(0);

							for (const { x, y, tileId } of tilesToPlace) {
								const index = y * prev.width + x;
								tiles[index] = tileId;
							}

							return { ...layer, tiles };
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
		[
			tileClipboard,
			currentLayer,
			localMapData,
			setLocalMapData,
			setProjectModified,
		],
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
			if (!selectedTilesetId || !selectedEntityDefId) return;

			const entityInstance = entityManager.createInstance(
				selectedTilesetId,
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
			selectedTilesetId,
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
				const CHUNK_SIZE = 64;
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

								// Place all tiles
								tiles.forEach(({ x, y }) => {
									placeTerrainTile(
										mutableLayer,
										x,
										y,
										prev.width,
										prev.height,
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
										prev.width,
										prev.height,
										terrainLayer.id,
										selectedTileset,
										tilesetOrder,
										tilesets,
									);
								});

								return { ...layer, tiles: mutableLayer.tiles };
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
			const CHUNK_SIZE = 64;
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
							// Ensure tiles array is properly sized - mutate in place for performance
							const totalSize = prev.width * prev.height;
							const newTiles =
								layer.tiles && layer.tiles.length === totalSize
									? layer.tiles
									: new Array(totalSize).fill(0);

							const mapWidth = prev.width;
							const mapHeight = prev.height;

							// Place all tiles
							tiles.forEach(({ x, y }) => {
								if (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) {
									const index = y * mapWidth + x;
									newTiles[index] = globalTileId;
								}
							});

							return { ...layer, tiles: newTiles };
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
									<div
										className="text-xs block mb-1"
										style={{ color: "#858585" }}
									>
										Map Size
									</div>
									<div className="flex items-center gap-2">
										<DragNumberInput
											value={localMapData?.width ?? 10}
											onChange={(value) => handleMapSizeChange("width", value)}
											onInput={(value) => handleMapSizeChange("width", value)}
											onDragStart={startBatch}
											onDragEnd={endBatch}
											min={1}
											max={Number.MAX_SAFE_INTEGER}
											step={1}
											precision={0}
											dragSpeed={0.1}
											className="flex-1"
										/>
										<span style={{ color: "#858585" }}>×</span>
										<DragNumberInput
											value={localMapData?.height ?? 10}
											onChange={(value) => handleMapSizeChange("height", value)}
											onInput={(value) => handleMapSizeChange("height", value)}
											onDragStart={startBatch}
											onDragEnd={endBatch}
											min={1}
											max={Number.MAX_SAFE_INTEGER}
											step={1}
											precision={0}
											dragSpeed={0.1}
											className="flex-1"
										/>
									</div>
								</div>

								{/* Tile Size */}
								<div>
									<div
										className="text-xs block mb-1"
										style={{ color: "#858585" }}
									>
										Tile Size
									</div>
									<div className="flex items-center gap-2">
										<DragNumberInput
											value={localMapData?.tileWidth ?? 16}
											onChange={(value) =>
												handleTileSizeChange("tileWidth", value)
											}
											onInput={(value) =>
												handleTileSizeChange("tileWidth", value)
											}
											onDragStart={startBatch}
											onDragEnd={endBatch}
											min={1}
											max={256}
											step={1}
											precision={0}
											dragSpeed={0.1}
											className="flex-1"
										/>
										<span style={{ color: "#858585" }}>×</span>
										<DragNumberInput
											value={localMapData?.tileHeight ?? 16}
											onChange={(value) =>
												handleTileSizeChange("tileHeight", value)
											}
											onInput={(value) =>
												handleTileSizeChange("tileHeight", value)
											}
											onDragStart={startBatch}
											onDragEnd={endBatch}
											min={1}
											max={256}
											step={1}
											precision={0}
											dragSpeed={0.1}
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
								<DndContext
									sensors={sensors}
									collisionDetection={closestCenter}
									onDragStart={handleDragStart}
									onDragEnd={handleDragEnd}
								>
									<SortableContext
										items={(localMapData?.layers || [])
											.slice()
											.reverse()
											.map((l) => l.id)}
										strategy={verticalListSortingStrategy}
									>
										<div className="space-y-1">
											{localMapData?.layers
												?.slice()
												.reverse()
												.map((layer) => (
													<SortableLayerItem
														key={layer.id}
														layer={layer}
														isActive={currentLayer?.id === layer.id}
														isEditing={editingLayerId === layer.id}
														editingName={editingLayerName}
														inputRef={layerInputRef}
														onClick={() => setCurrentLayerId(layer.id)}
														onDoubleClick={() => handleLayerDoubleClick(layer)}
														onContextMenu={(e) =>
															handleLayerContextMenu(e, layer.id)
														}
														onVisibilityChange={(visible) =>
															handleUpdateLayerVisibility(layer.id, visible)
														}
														onNameChange={setEditingLayerName}
														onNameSubmit={() => handleLayerNameSubmit(layer.id)}
														onKeyDown={(e) =>
															handleLayerNameKeyDown(e, layer.id)
														}
													/>
												))}
										</div>
									</SortableContext>
									<DragOverlay>
										{activeLayerId && localMapData ? (
											<div
												className="px-2 py-1.5 text-xs rounded bg-[#0e639c] text-white flex items-center gap-2 shadow-lg"
												style={{
													border: "none",
													padding: 0,
													minWidth: 0,
													cursor: "grabbing",
												}}
											>
												{(() => {
													const activeLayer = localMapData.layers.find(
														(l) => l.id === activeLayerId,
													);
													if (!activeLayer) return null;
													return (
														<>
															<input
																type="checkbox"
																checked={activeLayer.visible}
																readOnly
																title="Toggle visibility"
																style={{ accentColor: "#007acc" }}
																spellCheck={false}
															/>
															<span className="flex-1 select-none">
																{activeLayer.name}
															</span>
														</>
													);
												})()}
											</div>
										) : null}
									</DragOverlay>
								</DndContext>
								<div className="mt-2">
									<button
										type="button"
										onClick={handleAddLayer}
										className="w-full px-2 py-1.5 text-xs rounded transition-colors"
										style={{
											background: "#0e639c",
											color: "#ffffff",
											border: "none",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = "#1177bb";
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = "#0e639c";
										}}
									>
										+ Add Layer
									</button>
								</div>
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
						{/* Map dimensions */}
						<div className="flex items-center gap-2">
							<span className="text-gray-500">Map:</span>
							<span className="font-mono">
								{localMapData.width}×{localMapData.height}
							</span>
						</div>

						<div className="w-px h-4 bg-gray-700" />

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
							) : null}
						</div>
					</>,
					document.body,
				)}
		</div>
	);
};
