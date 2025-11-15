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
import { useUndoableReducer } from "../hooks/useUndoableReducer";
import { entityManager } from "../managers/EntityManager";
import type {
	EntityInstance,
	Layer,
	MapData,
	MapTab,
	PointInstance,
	PolygonCollider,
	Tool,
} from "../types";
import { generateId } from "../utils/id";
import { calculateMenuPosition } from "../utils/menuPositioning";
import {
	getTerrainLayerForTile,
	placeTerrainTile,
	updateNeighborsAround,
} from "../utils/terrainDrawing";
import { hashTilesetId, packTileId, unpackTileId } from "../utils/tileId";
import { ColliderPropertiesPanel } from "./ColliderPropertiesPanel";
import { DragNumberInput } from "./DragNumberInput";
import { EntityPropertiesPanel } from "./EntityPropertiesPanel";
import { PencilIcon, TrashIcon } from "./Icons";
import { MapCanvas } from "./MapCanvas";
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
			getHistory,
		},
	] = useUndoableReducer<MapData>(
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
		tab.undoHistory,
	);

	// Register undo/redo keyboard shortcuts
	useRegisterUndoRedo({ undo, redo, canUndo, canRedo });

	// Sync localMapData when mapData becomes available (e.g., after newMap creates it)
	useEffect(() => {
		if (mapData && !localMapData.id) {
			setLocalMapData(mapData);
		}
	}, [mapData, localMapData.id, setLocalMapData]);

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

	// Collider selection state
	const [selectedColliderId, setSelectedColliderId] = useState<string | null>(
		null,
	);
	const [selectedColliderPointIndex, setSelectedColliderPointIndex] = useState<
		number | null
	>(null);

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
	useEffect(() => {
		return () => {
			// Save history when component unmounts
			const history = getHistory();
			updateTabData(tab.id, { undoHistory: history });
		};
	}, [tab.id, updateTabData, getHistory]);

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

		const newValue = Math.max(1, Math.min(200, Math.round(value)));
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
			type: "tile" as const,
			tiles: new Array(localMapData.width * localMapData.height).fill(0), // Dense array initialized with zeros
			entities: [],
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

	const handleToolChange = (tool: Tool) => {
		updateTabData(tab.id, {
			viewState: {
				...tab.viewState,
				currentTool: tool,
			},
		});
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
	const handleEraseTile = useCallback(
		(x: number, y: number) => {
			if (!currentLayer) return;

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
								const tilesetHash = hashTilesetId(tileset.id);
								const mutableLayer = { ...layer, tiles: newTiles };
								updateNeighborsAround(
									mutableLayer,
									x,
									y,
									mapWidth,
									mapHeight,
									terrainLayerId,
									tileset,
									tilesetHash,
									tilesets,
								);
								updatedLayer = { ...layer, tiles: mutableLayer.tiles };
							}
						}

						updatedLayer = { ...layer, tiles: newTiles };

						// No need to setCurrentLayer - it's component-local only
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[currentLayer, tilesets, setProjectModified, setLocalMapData],
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

			// Place entity at map level (not per-layer)
			setLocalMapData((prev) => {
				const newEntities = [...(prev.entities || []), entityInstance];
				return {
					...prev,
					entities: newEntities,
				};
			});
			setProjectModified(true);
		},
		[
			selectedTilesetId,
			selectedEntityDefId,
			setProjectModified, // Place entity at map level (not per-layer)
			setLocalMapData,
		],
	);

	// Handle moving an entity
	const handleMoveEntity = useCallback(
		(entityId: string, newX: number, newY: number) => {
			if (!localMapData) return;

			const newEntities = (localMapData.entities || []).map((entity) => {
				return entity.id === entityId
					? { ...entity, x: newX, y: newY }
					: entity;
			});

			setLocalMapData({
				...localMapData,
				entities: newEntities,
			});
			setProjectModified(true);
		},
		[localMapData, setProjectModified, setLocalMapData],
	);

	// Handle entity dragging (live update without marking modified)
	const handleEntityDragging = useCallback(
		(entityId: string, newX: number, newY: number) => {
			if (!localMapData) return;

			const newEntities = (localMapData.entities || []).map((entity) => {
				return entity.id === entityId
					? { ...entity, x: newX, y: newY }
					: entity;
			});

			setLocalMapData({
				...localMapData,
				entities: newEntities,
			});
			// Don't mark as modified during drag - only on release
		},
		[localMapData, setLocalMapData],
	);

	// Handle updating entity properties
	const handleUpdateEntity = useCallback(
		(entityId: string, updates: Partial<EntityInstance>) => {
			if (!localMapData) return;

			const newEntities = (localMapData.entities || []).map((entity) =>
				entity.id === entityId ? { ...entity, ...updates } : entity,
			);

			setLocalMapData({
				...localMapData,
				entities: newEntities,
			});
			setProjectModified(true);
		},
		[localMapData, setProjectModified, setLocalMapData],
	);

	// Handle deleting an entity
	const handleDeleteEntity = useCallback(
		(entityId: string) => {
			if (!localMapData) return;

			const newEntities = (localMapData.entities || []).filter(
				(entity) => entity.id !== entityId,
			);

			setLocalMapData({
				...localMapData,
				entities: newEntities,
			});
			setProjectModified(true);
			setSelectedEntityId(null); // Clear selection after delete
		},
		[localMapData, setProjectModified, setLocalMapData],
	);

	// Handle duplicating an entity
	const handleDuplicateEntity = useCallback(
		(entityId: string) => {
			if (!localMapData) return;

			// Find the entity to duplicate
			const entityToDuplicate = localMapData.entities?.find(
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

			const newEntities = [...(localMapData.entities || []), newEntity];

			setLocalMapData({
				...localMapData,
				entities: newEntities,
			});
			setProjectModified(true);
			// Select the newly duplicated entity
			setSelectedEntityId(newEntity.id);
		},
		[localMapData, setProjectModified, setLocalMapData],
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

			setLocalMapData((prev) => ({
				...prev,
				points: [...(prev.points || []), pointInstance],
			}));
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
		[setLocalMapData, setProjectModified, updateTabData, tab.id, tab.viewState],
	);

	// Handle moving a point
	const handleMovePoint = useCallback(
		(pointId: string, newX: number, newY: number) => {
			if (!localMapData) return;

			const newPoints = (localMapData.points || []).map((point) =>
				point.id === pointId ? { ...point, x: newX, y: newY } : point,
			);

			setLocalMapData({
				...localMapData,
				points: newPoints,
			});
			setProjectModified(true);
		},
		[localMapData, setProjectModified, setLocalMapData],
	);

	// Handle point dragging (live update without marking modified)
	const handlePointDragging = useCallback(
		(pointId: string, newX: number, newY: number) => {
			if (!localMapData) return;

			const newPoints = (localMapData.points || []).map((point) =>
				point.id === pointId ? { ...point, x: newX, y: newY } : point,
			);

			setLocalMapData({
				...localMapData,
				points: newPoints,
			});
			// Don't mark as modified during drag - only on release
		},
		[localMapData, setLocalMapData],
	);

	// Handle updating point properties
	const handleUpdatePoint = useCallback(
		(pointId: string, updates: Partial<PointInstance>) => {
			if (!localMapData) return;

			const newPoints = (localMapData.points || []).map((point) =>
				point.id === pointId ? { ...point, ...updates } : point,
			);

			setLocalMapData({
				...localMapData,
				points: newPoints,
			});
			setProjectModified(true);
		},
		[localMapData, setProjectModified, setLocalMapData],
	);

	// Handle deleting a point
	const handleDeletePoint = useCallback(
		(pointId: string) => {
			if (!localMapData) return;

			const newPoints = (localMapData.points || []).filter(
				(point) => point.id !== pointId,
			);

			setLocalMapData({
				...localMapData,
				points: newPoints,
			});
			setProjectModified(true);
			setSelectedPointId(null); // Clear selection after delete
		},
		[localMapData, setProjectModified, setLocalMapData],
	);

	// Handle adding a new collider
	const handleAddCollider = useCallback(
		(points: Array<{ x: number; y: number }>) => {
			if (!localMapData) return;

			const collider: PolygonCollider = {
				id: generateId(),
				name: "",
				type: "",
				points: points.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })),
				properties: {},
			};

			setLocalMapData({
				...localMapData,
				colliders: [...(localMapData.colliders || []), collider],
			});
			setProjectModified(true);
			// Auto-select the newly created collider
			setSelectedColliderId(collider.id);
		},
		[localMapData, setLocalMapData, setProjectModified],
	);

	// Handle updating a collider point
	const handleUpdateColliderPoint = useCallback(
		(colliderId: string, pointIndex: number, x: number, y: number) => {
			if (!localMapData) return;

			const newColliders = (localMapData.colliders || []).map((collider) => {
				if (collider.id === colliderId) {
					const newPoints = [...collider.points];
					newPoints[pointIndex] = { x: Math.floor(x), y: Math.floor(y) };
					return { ...collider, points: newPoints };
				}
				return collider;
			});

			setLocalMapData({
				...localMapData,
				colliders: newColliders,
			});
			setProjectModified(true);
		},
		[localMapData, setLocalMapData, setProjectModified],
	);

	// Handle updating collider properties
	const handleUpdateCollider = useCallback(
		(colliderId: string, updates: Partial<PolygonCollider>) => {
			if (!localMapData) return;

			const newColliders = (localMapData.colliders || []).map((collider) =>
				collider.id === colliderId ? { ...collider, ...updates } : collider,
			);

			setLocalMapData({
				...localMapData,
				colliders: newColliders,
			});
			setProjectModified(true);
		},
		[localMapData, setLocalMapData, setProjectModified],
	);

	// Handle collider dragging (updates without marking as modified)
	const handleColliderDragging = useCallback(
		(colliderId: string, updates: Partial<PolygonCollider>) => {
			if (!localMapData) return;

			const newColliders = (localMapData.colliders || []).map((collider) =>
				collider.id === colliderId ? { ...collider, ...updates } : collider,
			);

			setLocalMapData({
				...localMapData,
				colliders: newColliders,
			});
			// Don't mark as modified during drag - only on release
		},
		[localMapData, setLocalMapData],
	);

	// Handle deleting a collider
	const handleDeleteCollider = useCallback(
		(colliderId: string) => {
			if (!localMapData) return;

			const newColliders = (localMapData.colliders || []).filter(
				(collider) => collider.id !== colliderId,
			);

			setLocalMapData({
				...localMapData,
				colliders: newColliders,
			});
			setProjectModified(true);
			setSelectedColliderId(null); // Clear selection after delete
			setSelectedColliderPointIndex(null);
		},
		[localMapData, setLocalMapData, setProjectModified],
	);

	// Handle deleting a collider point
	const handleDeleteColliderPoint = useCallback(() => {
		if (!contextMenu?.colliderId || contextMenu.pointIndex === undefined)
			return;
		if (!localMapData) return;

		const collider = (localMapData.colliders || []).find(
			(c) => c.id === contextMenu.colliderId,
		);
		if (!collider || collider.points.length <= 3) return;

		const newPoints = collider.points.filter(
			(_, i) => i !== contextMenu.pointIndex,
		);
		const newColliders = (localMapData.colliders || []).map((c) =>
			c.id === contextMenu.colliderId ? { ...c, points: newPoints } : c,
		);

		setLocalMapData({
			...localMapData,
			colliders: newColliders,
		});
		setProjectModified(true);
		setContextMenu(null);
	}, [contextMenu, localMapData, setLocalMapData, setProjectModified]);

	// Handle inserting a point on a collider edge
	const handleInsertColliderPoint = useCallback(() => {
		if (
			!contextMenu?.colliderId ||
			contextMenu.edgeIndex === undefined ||
			!contextMenu.insertPosition
		)
			return;
		if (!localMapData) return;

		const snappedX = Math.round(contextMenu.insertPosition.x);
		const snappedY = Math.round(contextMenu.insertPosition.y);

		const newColliders = (localMapData.colliders || []).map((c) => {
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
		});

		setLocalMapData({
			...localMapData,
			colliders: newColliders,
		});
		setProjectModified(true);
		setContextMenu(null);
	}, [contextMenu, localMapData, setLocalMapData, setProjectModified]);

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

				const tilesetHash = hashTilesetId(selectedTileset.id);

				setLocalMapData((prev) => ({
					...prev,
					layers: prev.layers.map((layer) => {
						if (layer.id === currentLayer.id) {
							const newTiles = [...layer.tiles];
							const mutableLayer = { ...layer, tiles: newTiles };

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
									tilesetHash,
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
									tilesetHash,
									tilesets,
								);
							});

							return { ...layer, tiles: mutableLayer.tiles };
						}
						return layer;
					}),
				}));
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

			const tilesetHash = hashTilesetId(selectedTileset.id);

			const geometry = unpackTileId(selectedTileId);
			const globalTileId = packTileId(
				geometry.x,
				geometry.y,
				tilesetHash,
				geometry.flipX,
				geometry.flipY,
			);

			setLocalMapData((prev) => {
				return {
					...prev,
					layers: prev.layers.map((layer) => {
						if (layer.id === currentLayer.id) {
							// Ensure tiles array is properly sized
							const totalSize = prev.width * prev.height;
							const newTiles =
								layer.tiles && layer.tiles.length === totalSize
									? [...layer.tiles]
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
			});
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
											max={200}
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
											max={200}
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
						mapData={localMapData}
						currentTool={tab.viewState.currentTool || "pencil"}
						onToolChange={handleToolChange}
						currentLayerId={currentLayerId}
						onPlaceTilesBatch={handlePlaceTilesBatch}
						onEraseTile={handleEraseTile}
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
						onStartBatch={startBatch}
						onEndBatch={endBatch}
					/>
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
							onDragStart={startBatch}
							onDragEnd={endBatch}
						/>
					) : selectedPointId ? (
						<PointPropertiesPanel
							selectedPointId={selectedPointId}
							mapData={localMapData}
							onUpdatePoint={handleUpdatePoint}
							onDragStart={startBatch}
							onDragEnd={endBatch}
						/>
					) : selectedColliderId ? (
						<ColliderPropertiesPanel
							selectedColliderId={selectedColliderId}
							selectedPointIndex={selectedColliderPointIndex}
							mapData={localMapData}
							onUpdateCollider={handleUpdateCollider}
							onUpdateColliderPoint={handleUpdateColliderPoint}
							onDragStart={startBatch}
							onDragEnd={endBatch}
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
