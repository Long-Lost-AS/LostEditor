import {
	createContext,
	useContext,
	useState,
	useRef,
	useCallback,
	ReactNode,
	useEffect,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, writeTextFile, readDir } from "@tauri-apps/plugin-fs";
import {
	MapData,
	Layer,
	Tool,
	Tile,
	ProjectData,
	TilesetData,
	LayerType,
	AnyTab,
	MapTab,
	TilesetTab,
	EntityEditorTab,
	CollisionEditorTab,
} from "../types";
import { SettingsManager } from "../settings";
import { tilesetManager } from "../managers/TilesetManager";
import { mapManager } from "../managers/MapManager";
import { entityManager } from "../managers/EntityManager";
import { fileManager } from "../managers/FileManager";
import {
	referenceManager,
	type BrokenReference,
} from "../managers/ReferenceManager";
import { ProjectDataSchema, createDefaultMapData } from "../schemas";
import {
	updateTileAndNeighbors,
	getAllAutotileGroups,
} from "../utils/autotiling";
import { unpackTileId, packTileId } from "../utils/tileId";

interface EditorContextType {
	// Tab state
	tabs: AnyTab[];
	activeTabId: string | null;
	openTab: (tab: AnyTab) => void;
	closeTab: (tabId: string) => void;
	setActiveTab: (tabId: string) => void;
	updateTabData: (tabId: string, updates: Partial<AnyTab>) => void;
	getActiveMapTab: () => MapTab | null;
	getActiveTilesetTab: () => TilesetTab | null;
	getActiveEntityTab: () => EntityEditorTab | null;

	// Map state
	maps: MapData[];                 // Global array of all loaded maps (source of truth)
	getMapById: (id: string) => MapData | undefined;
	updateMap: (id: string, updates: Partial<MapData>) => void;
	getActiveMap: () => MapData | undefined;

	mapData: MapData;                // [DEPRECATED] Legacy global mapData - use maps array instead
	setMapData: (data: MapData | ((prev: MapData) => MapData)) => void;

	// Layer state
	currentLayer: Layer | null;
	setCurrentLayer: (layer: Layer | null) => void;

	// Tool state
	currentTool: Tool;
	setCurrentTool: (tool: Tool) => void;

	// Selection state (tile or entity)
	selectedTileX: number;
	selectedTileY: number;
	setSelectedTile: (x: number, y: number) => void;
	selectedTilesetId: string | null;
	setSelectedTilesetId: (id: string | null) => void;
	selectedTileId: number | null;
	setSelectedTileId: (id: number | null) => void;
	selectedEntityDefId: string | null;
	setSelectedEntityDefId: (id: string | null) => void;
	selectedTerrainLayerId: string | null;
	setSelectedTerrainLayerId: (id: string | null) => void;

	// Multi-Tileset state
	tilesets: TilesetData[];
	currentTileset: TilesetData | null;
	setCurrentTileset: (tileset: TilesetData | null) => void;
	loadTileset: (filePath: string) => Promise<void>;
	addTileset: (tileset: TilesetData) => void;
	updateTileset: (tilesetId: string, updates: Partial<TilesetData>) => void;
	unloadTileset: (tilesetId: string) => void;
	getTilesetById: (id: string) => TilesetData | undefined;

	// Project directory
	projectDirectory: string | null;
	openMapFromFile: (filePath: string) => Promise<void>;
	openTilesetFromFile: (filePath: string) => Promise<void>;
	openEntityFromFile: (filePath: string) => Promise<void>;

	// Legacy tileset state (for backward compatibility)
	tilesetImage: HTMLImageElement | null;
	setTilesetImage: (img: HTMLImageElement | null) => void;
	tilesetCols: number;
	setTilesetCols: (cols: number) => void;
	tilesetRows: number;
	setTilesetRows: (rows: number) => void;

	// View state
	zoom: number;
	setZoom: (zoom: number) => void;
	panX: number;
	panY: number;
	setPan: (x: number, y: number) => void;

	// Project state
	currentProjectPath: string | null;
	setCurrentProjectPath: (path: string | null) => void;
	projectModified: boolean;
	setProjectModified: (modified: boolean) => void;
	projectName: string;
	setProjectName: (name: string) => void;
	tilesetPath: string | null;
	setTilesetPath: (path: string | null) => void;

	// Settings
	settingsManager: SettingsManager;
	gridVisible: boolean;
	setGridVisible: (visible: boolean) => void;

	// Layer Actions
	addLayer: (layerType: LayerType) => void;
	removeLayer: (layerId: string) => void;
	updateLayerVisibility: (layerId: string, visible: boolean) => void;
	updateLayerName: (layerId: string, name: string) => void;
	updateLayerAutotiling: (layerId: string, enabled: boolean) => void;
	reorderLayers: (newLayersOrder: Layer[]) => void;

	// Tile Actions
	placeTile: (x: number, y: number) => void;
	eraseTile: (x: number, y: number) => void;
	autotilingOverride: boolean; // True when Shift is held to bypass autotiling

	// Entity Actions
	placeEntity: (x: number, y: number) => void;
	removeEntity: (entityId: string) => void;

	// Legacy tileset loading
	loadTilesetFromFile: (file: File) => Promise<void>;
	loadTilesetFromDataURL: (dataURL: string) => Promise<void>;

	// Project Actions
	saveProject: () => Promise<void>;
	saveProjectAs: (filePath: string) => Promise<void>;
	loadProject: (filePath: string) => Promise<void>;
	newProject: () => Promise<void>;
	newMap: (directory?: string, fileName?: string) => void;
	newTileset: (directory?: string) => Promise<void>;
	newEntity: (directory?: string) => void;
	openCollisionEditor: (sourceType: 'tile' | 'entity', sourceId: string, tileId?: number, sourceTabId?: string) => void;
	saveTileset: () => Promise<void>;
	saveAll: () => Promise<void>;

	// Broken References Modal
	brokenReferencesModalData: {
		references: BrokenReference[];
		projectDir: string;
		onContinue: () => void;
		onCancel: () => void;
	} | null;
	setBrokenReferencesModalData: (
		data: {
			references: BrokenReference[];
			projectDir: string;
			onContinue: () => void;
			onCancel: () => void;
		} | null,
	) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const useEditor = () => {
	const context = useContext(EditorContext);
	if (!context) {
		throw new Error("useEditor must be used within EditorProvider");
	}
	return context;
};

interface EditorProviderProps {
	children: ReactNode;
}

/**
 * Helper function to recursively search for a tileset file by ID in the project directory
 */
async function findTilesetByIdInProject(
	projectDir: string,
	tilesetId: string,
): Promise<string | null> {
	async function searchDirectory(dirPath: string): Promise<string | null> {
		try {
			const entries = await readDir(dirPath);

			for (const entry of entries) {
				const fullPath = fileManager.join(dirPath, entry.name);

				if (entry.isDirectory) {
					// Skip hidden directories
					if (entry.name.startsWith(".")) {
						continue;
					}

					// Recursively search subdirectories
					const result = await searchDirectory(fullPath);
					if (result) {
						return result;
					}
				} else if (entry.name.endsWith(".lostset")) {
					// Read the tileset file and check its ID
					try {
						const content = await readTextFile(fullPath);
						const tilesetData = JSON.parse(content);
						if (tilesetData.id === tilesetId) {
							return fullPath;
						}
					} catch (error) {
						console.error(`Failed to read tileset ${fullPath}:`, error);
					}
				}
			}
		} catch (error) {
			console.error(`Failed to search directory ${dirPath}:`, error);
		}

		return null;
	}

	return searchDirectory(projectDir);
}

export const EditorProvider = ({ children }: EditorProviderProps) => {
	const settingsManagerRef = useRef(new SettingsManager());
	const settingsManager = settingsManagerRef.current;

	// Tab state
	const [tabs, setTabs] = useState<AnyTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);

	// Map state (global source of truth)
	const [maps, setMaps] = useState<MapData[]>([]);

	// Legacy map state (for backward compatibility)
	const [mapData, setMapData] = useState<MapData>({
		width: 32,
		height: 32,
		tileWidth: 16,
		tileHeight: 16,
		layers: [],
	});

	const [currentLayer, setCurrentLayer] = useState<Layer | null>(null);
	const [currentTool, setCurrentTool] = useState<Tool>("pencil");

	// Selection state
	const [selectedTileX, setSelectedTileX] = useState(0);
	const [selectedTileY, setSelectedTileY] = useState(0);
	const [selectedTilesetId, setSelectedTilesetId] = useState<string | null>(
		null,
	);
	const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
	const [selectedEntityDefId, setSelectedEntityDefId] = useState<string | null>(
		null,
	);
	const [selectedTerrainLayerId, setSelectedTerrainLayerId] = useState<
		string | null
	>(null);

	// Autotiling state (always false, no shift override)
	const autotilingOverride = false;

	// Multi-tileset state
	const [tilesets, setTilesets] = useState<TilesetData[]>([]);
	const [currentTileset, setCurrentTileset] = useState<TilesetData | null>(
		null,
	);

	// Project directory for file browser
	const [projectDirectory, setProjectDirectory] = useState<string | null>(null);

	// Legacy tileset state (backward compatibility)
	const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(
		null,
	);
	const [tilesetCols, setTilesetCols] = useState(0);
	const [tilesetRows, setTilesetRows] = useState(0);

	const [zoom, setZoom] = useState(2);
	const [panX, setPanX] = useState(0);
	const [panY, setPanY] = useState(0);
	const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(
		null,
	);
	const [projectModified, setProjectModified] = useState(false);
	const [projectName, setProjectName] = useState("Untitled");
	const [tilesetPath, setTilesetPath] = useState<string | null>(null);
	const [gridVisible, setGridVisible] = useState(true);

	// Broken references modal state
	const [brokenReferencesModalData, setBrokenReferencesModalData] = useState<{
		references: BrokenReference[];
		projectDir: string;
		onContinue: () => void;
		onCancel: () => void;
	} | null>(null);

	// [REMOVED] Circular dependency: tabs → mapData sync
	// Each view now manages its own state and fetches from maps array

	const setSelectedTile = useCallback((x: number, y: number) => {
		setSelectedTileX(x);
		setSelectedTileY(y);
	}, []);

	const setPan = useCallback((x: number, y: number) => {
		setPanX(x);
		setPanY(y);

		// Also update the active map tab's viewState
		setTabs((prev) => {
			if (!activeTabId) return prev;
			return prev.map((tab) => {
				if (tab.id === activeTabId && tab.type === "map") {
					const mapTab = tab as MapTab;
					return {
						...tab,
						viewState: {
							...mapTab.viewState,
							panX: x,
							panY: y,
						},
					};
				}
				return tab;
			});
		});
	}, [activeTabId]);

	const setZoomAndUpdateTab = useCallback((newZoom: number) => {
		setZoom(newZoom);

		// Also update the active map tab's viewState
		setTabs((prev) => {
			if (!activeTabId) return prev;
			return prev.map((tab) => {
				if (tab.id === activeTabId && tab.type === "map") {
					const mapTab = tab as MapTab;
					return {
						...tab,
						viewState: {
							...mapTab.viewState,
							zoom: newZoom,
						},
					};
				}
				return tab;
			});
		});
	}, [activeTabId]);

	const addLayer = useCallback(
		(layerType: LayerType = "tile") => {
			const newLayer: Layer = {
				id: `layer-${Date.now()}`,
				name: `Layer ${mapData.layers.length + 1}`,
				visible: true,
				type: layerType,
				tiles: new Map(),
				entities: [],
			};
			setMapData((prev) => ({
				...prev,
				layers: [...prev.layers, newLayer],
			}));
			setCurrentLayer(newLayer);
			setProjectModified(true);
		},
		[mapData.layers.length],
	);

	const removeLayer = useCallback(
		(layerId: string) => {
			setMapData((prev) => ({
				...prev,
				layers: prev.layers.filter((l) => l.id !== layerId),
			}));
			if (currentLayer?.id === layerId) {
				setCurrentLayer(mapData.layers[0] || null);
			}
			setProjectModified(true);
		},
		[currentLayer, mapData.layers],
	);

	const updateLayerVisibility = useCallback(
		(layerId: string, visible: boolean) => {
			setMapData((prev) => ({
				...prev,
				layers: prev.layers.map((l) =>
					l.id === layerId ? { ...l, visible } : l,
				),
			}));
		},
		[],
	);

	const updateLayerName = useCallback((layerId: string, name: string) => {
		setMapData((prev) => ({
			...prev,
			layers: prev.layers.map((l) => (l.id === layerId ? { ...l, name } : l)),
		}));
		setProjectModified(true);
	}, []);

	const updateLayerAutotiling = useCallback((layerId: string, enabled: boolean) => {
		setMapData((prev) => ({
			...prev,
			layers: prev.layers.map((l) =>
				l.id === layerId ? { ...l, autotilingEnabled: enabled } : l
			),
		}));
		setProjectModified(true);
	}, []);

	const reorderLayers = useCallback((newLayersOrder: Layer[]) => {
		setMapData((prev) => ({
			...prev,
			layers: newLayersOrder,
		}));
		setProjectModified(true);
	}, []);

	const placeTile = useCallback(
		(x: number, y: number) => {
			if (!currentLayer || currentLayer.type !== "tile") return;

			// Check if selected tile is a compound tile (using tilesets state directly)
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

			if (tilesetIndex === -1 || !selectedTileId) return;

			// Unpack the selected tile ID (which may not have tileset index yet from old format)
			const geometry = unpackTileId(selectedTileId);

			// Repack with the correct tileset index to create a global tile ID
			const globalTileId = packTileId(
				geometry.x,
				geometry.y,
				tilesetIndex,
				geometry.flipX,
				geometry.flipY
			);

			// Update state immutably
			setMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const newTiles = [...layer.tiles]; // Copy the dense array
						const mapWidth = prev.width;
						const mapHeight = prev.height;

						// Handle compound tiles
						if (selectedTileDef && selectedTileDef.isCompound) {
							// Calculate cells from width/height
							const tileWidth = selectedTileset?.tileWidth || 16;
							const tileHeight = selectedTileset?.tileHeight || 16;
							const widthInTiles = Math.ceil(selectedTileDef.width! / tileWidth);
							const heightInTiles = Math.ceil(
								selectedTileDef.height! / tileHeight,
							);

							// Place all cells of the compound tile
							for (let dy = 0; dy < heightInTiles; dy++) {
								for (let dx = 0; dx < widthInTiles; dx++) {
									const cellX = x + dx;
									const cellY = y + dy;

									// Check bounds
									if (cellX >= 0 && cellY >= 0 && cellX < mapWidth && cellY < mapHeight) {
										// Each cell of the compound tile should reference a different part of the sprite
										const cellSpriteX = geometry.x + (dx * tileWidth);
										const cellSpriteY = geometry.y + (dy * tileHeight);
										const cellTileId = packTileId(
											cellSpriteX,
											cellSpriteY,
											tilesetIndex,
											geometry.flipX,
											geometry.flipY
										);
										const index = cellY * mapWidth + cellX;
										newTiles[index] = cellTileId;
									}
								}
							}
						} else {
							// Regular single tile
							if (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) {
								const index = y * mapWidth + x;
								newTiles[index] = globalTileId;
							}
						}

						let updatedLayer = { ...layer, tiles: newTiles };

						// Apply autotiling if enabled and not overridden
						const autotilingEnabled = layer.autotilingEnabled !== false; // Default to true
						if (autotilingEnabled && !autotilingOverride) {
							// Get all autotile groups from loaded tilesets
							const autotileGroups = getAllAutotileGroups(tilesets);

							if (autotileGroups.length > 0) {
								// Determine which positions to update (placed tile + neighbors)
								const positionsToUpdate: Array<{ x: number; y: number }> = [];

								// Handle compound tiles (multiple cells)
								if (selectedTileDef && selectedTileDef.isCompound) {
									const tileWidth = selectedTileset?.tileWidth || 16;
									const tileHeight = selectedTileset?.tileHeight || 16;
									const widthInTiles = Math.ceil(selectedTileDef.width! / tileWidth);
									const heightInTiles = Math.ceil(selectedTileDef.height! / tileHeight);

									for (let dy = 0; dy < heightInTiles; dy++) {
										for (let dx = 0; dx < widthInTiles; dx++) {
											positionsToUpdate.push({ x: x + dx, y: y + dy });
										}
									}
								} else {
									// Regular single tile
									positionsToUpdate.push({ x, y });
								}

								// Apply autotiling to placed tiles and their neighbors
								const autotiledTiles = updateTileAndNeighbors(
									updatedLayer,
									positionsToUpdate,
									mapWidth,
									mapHeight,
									tilesets
								);

								// Merge autotiled tiles back into the layer
								for (const update of autotiledTiles) {
									newTiles[update.index] = update.tileId;
								}

								updatedLayer = { ...layer, tiles: newTiles };
							}
						}

						setCurrentLayer(updatedLayer);
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[
			currentLayer,
			selectedTileX,
			selectedTileY,
			selectedTilesetId,
			selectedTileId,
			tilesets,
			autotilingOverride,
		],
	);

	const eraseTile = useCallback(
		(x: number, y: number) => {
			if (!currentLayer || currentLayer.type !== "tile") return;

			// Update state immutably
			setMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const newTiles = [...layer.tiles]; // Copy the dense array
						const mapWidth = prev.width;
						const mapHeight = prev.height;

						// Erase the tile by setting it to 0
						if (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) {
							const index = y * mapWidth + x;
							newTiles[index] = 0;
						}

						let updatedLayer = { ...layer, tiles: newTiles };

						// Apply autotiling to neighbors after erasing
						const autotilingEnabled = layer.autotilingEnabled !== false; // Default to true
						if (autotilingEnabled && !autotilingOverride) {
							// Get all autotile groups from loaded tilesets
							const autotileGroups = getAllAutotileGroups(tilesets);

							if (autotileGroups.length > 0) {
								// Update the 8 neighbors around the erased tile
								const autotiledTiles = updateTileAndNeighbors(
									updatedLayer,
									[{ x, y }],
									mapWidth,
									mapHeight,
									tilesets
								);

								// Merge autotiled tiles back into the layer
								for (const update of autotiledTiles) {
									newTiles[update.index] = update.tileId;
								}

								updatedLayer = { ...layer, tiles: newTiles };
							}
						}

						setCurrentLayer(updatedLayer);
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[currentLayer, tilesets, autotilingOverride],
	);

	// Entity management functions
	const placeEntity = useCallback(
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

			setMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const updatedLayer = {
							...layer,
							entities: [...layer.entities, entityInstance],
						};
						setCurrentLayer(updatedLayer);
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[currentLayer, selectedTilesetId, selectedEntityDefId],
	);

	const removeEntity = useCallback(
		(entityId: string) => {
			if (!currentLayer || currentLayer.type !== "entity") return;

			setMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const updatedLayer = {
							...layer,
							entities: layer.entities.filter((e) => e.id !== entityId),
						};
						setCurrentLayer(updatedLayer);
						return updatedLayer;
					}
					return layer;
				}),
			}));
			setProjectModified(true);
		},
		[currentLayer],
	);

	// Tab management functions
	const openTab = useCallback((tab: AnyTab) => {
		setTabs((prev) => {
			// Check if tab already exists
			const existingTabIndex = prev.findIndex((t) => t.id === tab.id);
			if (existingTabIndex !== -1) {
				// Tab already exists, just activate it
				setActiveTabId(tab.id);
				return prev;
			}
			// Add new tab
			return [...prev, tab];
		});
		setActiveTabId(tab.id);
	}, []);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((prev) => {
				const newTabs = prev.filter((t) => t.id !== tabId);

				// If closing active tab, switch to another tab
				if (tabId === activeTabId) {
					const closingIndex = prev.findIndex((t) => t.id === tabId);
					if (newTabs.length > 0) {
						// Try to activate the next tab, or the previous one if this was the last tab
						const newActiveTab =
							newTabs[closingIndex] || newTabs[closingIndex - 1];
						setActiveTabId(newActiveTab.id);
					} else {
						setActiveTabId(null);
					}
				}

				return newTabs;
			});
		},
		[activeTabId],
	);

	const updateTabData = useCallback(
		(tabId: string, updates: Partial<AnyTab>) => {
			setTabs((prev) =>
				prev.map((tab) => {
					if (tab.id === tabId) {
						return { ...tab, ...updates } as AnyTab;
					}
					return tab;
				}),
			);
		},
		[],
	);

	const getActiveMapTab = useCallback((): MapTab | null => {
		if (!activeTabId) return null;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (tab && tab.type === "map") {
			return tab as MapTab;
		}
		return null;
	}, [activeTabId, tabs]);

	const getActiveTilesetTab = useCallback((): TilesetTab | null => {
		if (!activeTabId) return null;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (tab && tab.type === "tileset") {
			return tab as TilesetTab;
		}
		return null;
	}, [activeTabId, tabs]);

	const getActiveEntityTab = useCallback((): EntityEditorTab | null => {
		if (!activeTabId) return null;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (tab && tab.type === "entity-editor") {
			return tab as EntityEditorTab;
		}
		return null;
	}, [activeTabId, tabs]);

	// Multi-tileset management functions
	const loadTileset = useCallback(async (filePath: string) => {
		try {
			const tileset = await tilesetManager.load(filePath);
			setTilesets((prev) => {
				// Check if already loaded
				if (prev.find((t) => t.id === tileset.id)) {
					return prev;
				}
				return [...prev, tileset];
			});
			setCurrentTileset(tileset);
			setProjectModified(true);
		} catch (error) {
			console.error("Failed to load tileset:", error);
			alert(`Failed to load tileset: ${error}`);
		}
	}, []);

	const addTileset = useCallback((tileset: TilesetData) => {
		setTilesets((prev) => {
			// Check if already exists
			if (prev.find((t) => t.id === tileset.id)) {
				return prev;
			}
			return [...prev, tileset];
		});
		setCurrentTileset(tileset);
		setProjectModified(true);
	}, []);

	const updateTileset = useCallback(
		(tilesetId: string, updates: Partial<TilesetData>) => {
			setTilesets((prev) =>
				prev.map((t) => (t.id === tilesetId ? { ...t, ...updates } : t)),
			);
			setProjectModified(true);
		},
		[],
	);

	const unloadTileset = useCallback(
		(tilesetId: string) => {
			tilesetManager.unloadTileset(tilesetId);
			setTilesets((prev) => prev.filter((t) => t.id !== tilesetId));
			if (currentTileset?.id === tilesetId) {
				setCurrentTileset(null);
			}
			setProjectModified(true);
		},
		[currentTileset],
	);

	const getTilesetById = useCallback(
		(id: string) => {
			return tilesets.find((t) => t.id === id);
		},
		[tilesets],
	);

	// Map helper functions
	const getMapById = useCallback(
		(id: string) => {
			return maps.find((m) => m.id === id);
		},
		[maps],
	);

	const updateMap = useCallback(
		(id: string, updates: Partial<MapData>) => {
			setMaps((currentMaps) =>
				currentMaps.map((m) =>
					m.id === id ? { ...m, ...updates } : m
				)
			);
		},
		[],
	);

	const getActiveMap = useCallback(() => {
		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (activeTab?.type === 'map') {
			return getMapById((activeTab as MapTab).mapId);
		}
		return undefined;
	}, [activeTabId, tabs, getMapById]);

	const loadTilesetFromFile = useCallback(
		async (file: File) => {
			return new Promise<void>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = (e) => {
					const img = new Image();
					img.onload = () => {
						setTilesetImage(img);
						setTilesetCols(Math.floor(img.width / mapData.tileWidth));
						setTilesetRows(Math.floor(img.height / mapData.tileHeight));
						setTilesetPath(file.name);
						resolve();
					};
					img.onerror = () => reject(new Error("Failed to load image"));
					img.src = e.target?.result as string;
				};
				reader.onerror = () => reject(new Error("Failed to read file"));
				reader.readAsDataURL(file);
			});
		},
		[mapData.tileWidth, mapData.tileHeight],
	);

	const loadTilesetFromDataURL = useCallback(
		async (dataURL: string) => {
			return new Promise<void>((resolve, reject) => {
				const img = new Image();
				img.onload = () => {
					setTilesetImage(img);
					setTilesetCols(Math.floor(img.width / mapData.tileWidth));
					setTilesetRows(Math.floor(img.height / mapData.tileHeight));
					resolve();
				};
				img.onerror = () => reject(new Error("Failed to load tileset"));
				img.src = dataURL;
			});
		},
		[mapData.tileWidth, mapData.tileHeight],
	);

	const saveProjectAs = useCallback(
		async (filePath: string) => {
			// Set project directory for relative paths
			const projectDir = fileManager.dirname(filePath);
			fileManager.setProjectDir(projectDir);

			// Create maps directory if it doesn't exist
			const mapsDir = fileManager.join(projectDir, "maps");
			try {
				await invoke("create_dir", { path: mapsDir });
			} catch (error) {
				// Directory might already exist, that's okay
			}

			// Create tilesets directory if it doesn't exist
			const tilesetsDir = fileManager.join(projectDir, "tilesets");
			try {
				await invoke("create_dir", { path: tilesetsDir });
			} catch (error) {
				// Directory might already exist, that's okay
			}

			// Save any unsaved tilesets
			const unsavedTilesets = tilesets.filter(t => !t.filePath);
			if (unsavedTilesets.length > 0) {
				for (const tileset of unsavedTilesets) {
					const result = await invoke<{ canceled: boolean; filePath?: string }>(
						"show_save_dialog",
						{
							options: {
								title: `Save Tileset: ${tileset.name}`,
								defaultPath: `${tileset.name}.lostset`,
								filters: [{ name: "Lost Editor Tileset", extensions: ["lostset"] }],
							},
						},
					);

					if (result.canceled || !result.filePath) {
						alert(`Project save cancelled: Please save tileset "${tileset.name}" first.`);
						return;
					}

					try {
						await tilesetManager.saveTileset(tileset, result.filePath);

						// Update the tileset in the tilesets array with the new file path
						setTilesets((prev) =>
							prev.map((t) =>
								t.id === tileset.id ? { ...t, filePath: result.filePath } : t,
							),
						);

						// Mark tileset tab as clean
						setTabs((prevTabs) =>
							prevTabs.map((tab) =>
								tab.type === "tileset" && (tab as TilesetTab).tilesetId === tileset.id
									? { ...tab, isDirty: false }
									: tab,
							),
						);
					} catch (error) {
						alert(`Failed to save tileset ${tileset.name}: ${error}`);
						return;
					}
				}
			}

			// Collect tileset paths (all tilesets should now be saved)
			const tilesetPaths: string[] = [];
			for (const tileset of tilesets) {
				if (tileset.filePath) {
					tilesetPaths.push(tileset.filePath);
				} else {
					console.warn(`Skipping unsaved tileset: ${tileset.name}`);
				}
			}

			// Save all map tabs to separate .lostmap files
			const mapPaths: string[] = [];
			for (const tab of tabs) {
				if (tab.type === "map") {
					const mapTab = tab as MapTab;

					// Get map data from global maps array
					const mapData = maps.find(m => m.id === mapTab.mapId);
					if (!mapData) {
						console.warn(`Skipping map tab ${mapTab.title}: map data not found for ID ${mapTab.mapId}`);
						continue;
					}

					// Determine map file path
					let mapFilePath = mapTab.filePath;
					if (!mapFilePath) {
						// No file path yet, create one
						const mapFileName = `${mapTab.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.lostmap`;
						mapFilePath = fileManager.join(mapsDir, mapFileName);
					}

					// Save the map using mapManager
					try {
						await mapManager.saveMap(mapData, mapFilePath, mapTab.title);

						// Update the tab with the file path
						mapTab.filePath = mapFilePath;
						mapTab.mapFilePath = mapFilePath;
						mapPaths.push(mapFilePath);
					} catch (error) {
						alert(`Failed to save map ${mapTab.title}: ${error}`);
						return;
					}
				}
			}

			// Make all paths relative to project directory
			const relativeTilesetPaths = tilesetPaths.map((path) =>
				fileManager.makeRelative(path),
			);
			const relativeMapPaths = mapPaths.map((path) =>
				fileManager.makeRelative(path),
			);

			const projectData: ProjectData = {
				name: projectName,
				tilesets: relativeTilesetPaths,
				maps: relativeMapPaths,
				projectDir,
				lastModified: new Date().toISOString(),
				openTabs: {
					tabs: tabs.map((tab) => {
						if (tab.type === "map") {
							// Don't store map data in tabs, just references
							return {
								id: tab.id,
								type: tab.type,
								title: tab.title,
								isDirty: false, // Mark as clean after save
								filePath: tab.filePath,
								mapId: (tab as MapTab).mapId,
								viewState: (tab as MapTab).viewState,
							} as MapTab;
						}
						return tab;
					}),
					activeTabId,
				},
			};

			const json = JSON.stringify(projectData, null, 2);

			try {
				await writeTextFile(filePath, json);
				setCurrentProjectPath(filePath);
				setProjectName(fileManager.basename(filePath, ".lostproj"));
				setProjectModified(false);

				// Mark all map tabs as clean
				setTabs((prevTabs) =>
					prevTabs.map((tab) => ({ ...tab, isDirty: false })),
				);

				settingsManager.addRecentFile(filePath);
				settingsManager.setLastOpenedProject(filePath);
				await settingsManager.save();
			} catch (error) {
				alert(`Failed to save project: ${error}`);
			}
		},
		[projectName, tilesets, settingsManager, tabs, activeTabId, maps],
	);

	const saveProject = useCallback(async () => {
		if (!currentProjectPath) {
			const result = await invoke<{ canceled: boolean; filePath?: string }>(
				"show_save_dialog",
				{
					options: {
						title: "Save Project",
						defaultPath: "untitled.lostproj",
						filters: [
							{ name: "Lost Editor Project", extensions: ["lostproj"] },
						],
					},
				},
			);

			if (result.filePath) {
				await saveProjectAs(result.filePath);
			}
		} else {
			await saveProjectAs(currentProjectPath);
		}
	}, [currentProjectPath, saveProjectAs]);

	const loadProject = useCallback(
		async (filePath: string) => {
			// Clear manager caches and React state before loading new project
			console.log("Clearing manager caches before loading new project");
			tilesetManager.unloadAll();
			mapManager.unloadAll();
			setTilesets([]); // Clear React state to prevent stale tileset references
			setCurrentTileset(null);

			let data: string;
			try {
				data = await readTextFile(filePath);
			} catch (error) {
				alert(`Failed to load project: ${error}`);
				settingsManager.removeRecentFile(filePath);
				await settingsManager.save();
				return;
			}

			try {
				const parsedData = JSON.parse(data);
				const projectData = ProjectDataSchema.parse(parsedData);

				console.log("Loading project data:", projectData);

				// Set project directory for relative path resolution
				const projectDir = fileManager.dirname(filePath);
				fileManager.setProjectDir(projectDir);

				// Validate file references before loading tilesets
				console.log("Validating project references...");
				try {
					const brokenReferences =
						await referenceManager.validateReferences(projectDir);
					if (brokenReferences.length > 0) {
						console.warn(
							`Found ${brokenReferences.length} broken reference(s):`,
						);
						brokenReferences.forEach((ref) => {
							console.warn(
								`  - ${ref.referenceType} in ${ref.referencingFile}: ${ref.relativePath} (expected at ${ref.expectedPath})`,
							);
						});

						// Show modal and wait for user to fix references or cancel
						await new Promise<void>((resolve, reject) => {
							setBrokenReferencesModalData({
								references: brokenReferences,
								projectDir: projectDir,
								onContinue: () => {
									setBrokenReferencesModalData(null);
									resolve(); // Continue with load
								},
								onCancel: () => {
									setBrokenReferencesModalData(null);
									console.log("Project load cancelled by user");
									reject(new Error("Project load cancelled"));
								},
							});
						});
					} else {
						console.log("All file references are valid");
					}
				} catch (error) {
					if (
						error instanceof Error &&
						error.message === "Project load cancelled"
					) {
						// User cancelled via modal - abort load
						return;
					}
					console.error("Failed to validate references:", error);
					// Continue loading even if validation fails
				}

				// Load tilesets first
				if (projectData.tilesets && projectData.tilesets.length > 0) {
					console.log("Loading tilesets:", projectData.tilesets);
					for (const tilesetPath of projectData.tilesets) {
						try {
							// Load tileset using FileManager's global projectDir
							const tileset = await tilesetManager.load(tilesetPath);
							setTilesets((prev) => {
								// Check if already loaded
								if (prev.find((t) => t.id === tileset.id)) {
									return prev;
								}
								return [...prev, tileset];
							});
						} catch (error) {
							console.error(`Failed to load tileset ${tilesetPath}:`, error);
						}
					}
				}

				setCurrentProjectPath(filePath);
				setProjectName(
					projectData.name || fileManager.basename(filePath, ".lostproj"),
				);
				setProjectModified(false);

				// Set project directory for file browser
				setProjectDirectory(projectDir);

				settingsManager.addRecentFile(filePath);
				settingsManager.setLastOpenedProject(filePath);
				await settingsManager.save();

				// Load maps and restore tabs
				if (projectData.openTabs) {
					const restoredTabs: AnyTab[] = [];
					const loadedMaps: MapData[] = [];

					for (const tab of projectData.openTabs.tabs || []) {
						if (tab.type === "map") {
							const mapTab = tab as any; // Saved tab may not have full mapData

							// Load the map from file
							if (mapTab.filePath) {
								try {
									const mapData = await mapManager.loadMap(mapTab.filePath);

									// Add to global maps array
									const mapId = mapTab.mapId || mapTab.id;
									const mapWithId = { ...mapData, id: mapId };
									loadedMaps.push(mapWithId);

									// Create MapTab with reference (not full data)
									const fullMapTab: MapTab = {
										id: mapTab.id,
										type: "map",
										title: mapTab.title,
										isDirty: false, // Mark as clean since we're loading from disk
										filePath: mapTab.filePath,
										mapId: mapId,  // Reference by ID
										mapFilePath: mapTab.filePath,
										// mapData is optional now - view will fetch from maps array
										viewState: mapTab.viewState || {
											zoom: 2,
											panX: 0,
											panY: 0,
											currentLayerId: null,
											gridVisible: true,
											selectedTilesetId: null,
											selectedTileId: null,
											selectedEntityDefId: null,
											currentTool: "pencil",
										},
									};

									restoredTabs.push(fullMapTab);
								} catch (error) {
									console.error(
										`Failed to load map ${mapTab.filePath}:`,
										error,
									);
								}
							}
						} else if (tab.type === "tileset") {
							const tilesetTab = tab as TilesetTab;
							const tilesetExists = tilesetManager.getTilesetById(
								tilesetTab.tilesetId,
							);
							if (tilesetExists) {
								// Mark as clean since we're loading from saved project
							restoredTabs.push({ ...tab, isDirty: false });
							} else {
								console.warn(
									`Skipping tileset tab: tileset ${tilesetTab.tilesetId} not found`,
								);
							}
						} else if (tab.type === "entity-editor") {
							const entityTab = tab as any;

							if (entityTab.filePath) {
								try {
									const entityData = await entityManager.loadEntity(entityTab.filePath);

									const fullEntityTab: EntityEditorTab = {
										id: entityTab.id,
										type: "entity-editor",
										title: entityTab.title,
										isDirty: false, // Mark as clean since we're loading from disk
										filePath: entityTab.filePath,
										entityId: entityTab.entityId || entityTab.id,
										entityData: entityData,
										viewState: entityTab.viewState || {
											scale: 1,
											panX: 0,
											panY: 0,
											selectedSpriteLayerId: null,
											selectedChildId: null,
										},
									};

									restoredTabs.push(fullEntityTab);
								} catch (error) {
									console.error(
										`Failed to load entity ${entityTab.filePath}:`,
										error,
									);
								}
							}
						}
					}

					// Set global maps array (source of truth)
					setMaps(loadedMaps);
					setTabs(restoredTabs);

					// Make sure the active tab is still in the restored tabs
					const activeTabStillExists = restoredTabs.some(
						(t) => t.id === projectData.openTabs!.activeTabId,
					);
					if (activeTabStillExists) {
						setActiveTabId(projectData.openTabs.activeTabId || null);
					} else if (restoredTabs.length > 0) {
						setActiveTabId(restoredTabs[0].id);
					} else {
						setActiveTabId(null);
					}

					console.log("Restored tabs:", restoredTabs);
				} else {
					// No saved tabs, reset to default
					setTabs([]);
					setActiveTabId(null);
				}

				// Validate file references after loading
				console.log("Validating project references...");
				try {
					const brokenReferences =
						await referenceManager.validateReferences(projectDir);
					if (brokenReferences.length > 0) {
						console.warn(
							`Found ${brokenReferences.length} broken reference(s):`,
						);
						brokenReferences.forEach((ref) => {
							console.warn(
								`  - ${ref.referenceType} in ${ref.referencingFile}: ${ref.relativePath} (expected at ${ref.expectedPath})`,
							);
						});
						alert(
							`Warning: Found ${brokenReferences.length} broken file reference(s). Check console for details.`,
						);
					} else {
						console.log("All file references are valid");
					}
				} catch (error) {
					console.error("Failed to validate references:", error);
				}

				console.log("Project loaded successfully");
			} catch (error: any) {
				console.error("Failed to load project:", error);
				alert(`Failed to parse project file: ${error.message}`);
			}
		},
		[loadTileset, settingsManager],
	);

	const newProject = useCallback(async () => {
		// Show save dialog to choose project location
		const result = await invoke<{ canceled: boolean; filePath?: string }>(
			"show_save_dialog",
			{
				options: {
					title: "Create New Project",
					filters: [{ name: "Lost Editor Project", extensions: ["lostproj"] }],
					defaultPath: "Untitled.lostproj",
				},
			},
		);

		if (result.canceled || !result.filePath) {
			return;
		}

		const projectPath = result.filePath;
		const projectDir = fileManager.dirname(projectPath);
		const projectName = fileManager.basename(projectPath, ".lostproj");

		// Create empty project
		const projectData: ProjectData = {
			version: "1.0",
			name: projectName,
			tilesets: [],
			maps: [],
			projectDir: projectDir,
			lastModified: new Date().toISOString(),
		};

		// Save project file
		try {
			const json = JSON.stringify(projectData, null, 2);
			await writeTextFile(projectPath, json);

			// Set project state
			setCurrentProjectPath(projectPath);
			setProjectName(projectName);
			setProjectDirectory(projectDir);
			setProjectModified(false);
			setTabs([]);
			setActiveTabId(null);
			setTilesets([]);

			// Update recent files
			await settingsManager.addRecentFile(projectPath);
			await settingsManager.setLastOpenedProject(projectPath);
			await settingsManager.save();
		} catch (error) {
			alert(`Failed to create project: ${error}`);
		}
	}, [fileManager, settingsManager]);

	const newMap = useCallback((directory?: string, fileName?: string) => {
		// Generate a unique ID for the new map
		const mapId = `map-${Date.now()}`;

		// Use functional setState to get current tabs and avoid stale closures
		setTabs((prevTabs) => {
			const mapNumber = prevTabs.filter((t) => t.type === "map").length + 1;

			// Determine title and file path
			const title = fileName || `Map ${mapNumber}`;
			const filePath =
				directory && fileName
					? fileManager.join(
							directory,
							fileName.endsWith(".lostmap") ? fileName : `${fileName}.lostmap`,
						)
					: undefined;

			// Create validated map data with default layer
			const mapData = createDefaultMapData(title);
			const mapWithId = { ...mapData, id: mapId };

			// Add to global maps array
			setMaps((prevMaps) => [...prevMaps, mapWithId]);

			const newMapTab: MapTab = {
				id: mapId,
				type: "map",
				title: title,
				isDirty: true, // Mark as dirty since it's unsaved
				mapId: mapId,
				mapFilePath: filePath || '',
				filePath: filePath,
				// mapData is optional - view will fetch from maps array
				viewState: {
					zoom: 2,
					panX: 0,
					panY: 0,
					currentLayerId: mapData.layers[0]?.id || null,
					gridVisible: true,
					selectedTilesetId: null,
					selectedTileId: null,
					selectedEntityDefId: null,
					currentTool: "pencil",
				},
			};

			return [...prevTabs, newMapTab];
		});

		// Make the new map tab active
		setActiveTabId(mapId);
	}, []);

	const openMapFromFile = useCallback(
		async (filePath: string) => {
			try {
				// Check if map is already open in a tab
				const existingTab = tabs.find(
					(tab) => tab.type === "map" && tab.filePath === filePath,
				);

				if (existingTab) {
					// Just activate the existing tab
					setActiveTabId(existingTab.id);
					return;
				}

				// Load the map using mapManager
				const mapData = await mapManager.loadMap(filePath);

				// Extract map name from file path
				const mapName = fileManager.basename(filePath, ".lostmap");

				// Create a new MapTab
				const mapId = `map-${Date.now()}`;
				const mapWithId = { ...mapData, id: mapId };

				// Add to global maps array
				setMaps((prevMaps) => [...prevMaps, mapWithId]);

				const newMapTab: MapTab = {
					id: mapId,
					type: "map",
					title: mapName,
					isDirty: false,
					filePath: filePath,
					mapId: mapId,
					mapFilePath: filePath,
					// mapData is optional - view will fetch from maps array
					viewState: {
						zoom: 2,
						panX: 0,
						panY: 0,
						currentLayerId: mapData.layers[0]?.id || null,
						gridVisible: true,
						selectedTilesetId: null,
						selectedTileId: null,
						selectedEntityDefId: null,
						currentTool: "pencil",
					},
				};

				// Open the tab
				openTab(newMapTab);
			} catch (error) {
				console.error(`Failed to open map ${filePath}:`, error);
				alert(`Failed to open map: ${error}`);
			}
		},
		[tabs, openTab],
	);

	const openTilesetFromFile = useCallback(
		async (filePath: string) => {
			try {
				// Check if a tab with this tileset is already open
				const existingTab = tabs.find(
					(tab) =>
						tab.type === "tileset" &&
						tilesets.find((t) => t.id === tab.tilesetId)?.filePath === filePath,
				);

				if (existingTab) {
					// Just activate the existing tab
					setActiveTabId(existingTab.id);
					return;
				}

				// Check if tileset is already loaded in memory
				let tileset = tilesets.find((t) => t.filePath === filePath);

				// If not loaded, load it now using the tilesetManager directly
				if (!tileset) {
					tileset = await tilesetManager.load(filePath);
					// Add it to the tilesets array
					setTilesets((prev) => {
						// Check if already loaded
						if (prev.find((t) => t.id === tileset!.id)) {
							return prev;
						}
						return [...prev, tileset!];
					});
					setProjectModified(true);
				}

				// Create a new TilesetTab
				const tilesetTab: TilesetTab = {
					id: `tileset-${tileset.id}`,
					type: "tileset",
					title: tileset.name,
					isDirty: false,
					tilesetId: tileset.id,
					viewState: {
						scale: 2,
						selectedTileRegion: null,
					},
				};

				// Open the tab
				openTab(tilesetTab);
			} catch (error) {
				console.error(`Failed to open tileset ${filePath}:`, error);
				alert(`Failed to open tileset: ${error}`);
			}
		},
		[tabs, tilesets, openTab],
	);

	const openEntityFromFile = useCallback(
		async (filePath: string) => {
			try {
				// Check if a tab with this entity is already open
				const existingTab = tabs.find(
					(tab) =>
						tab.type === "entity-editor" &&
						tab.filePath === filePath,
				);

				if (existingTab) {
					// Just activate the existing tab
					setActiveTabId(existingTab.id);
					return;
				}

				// Load the entity from file using EntityManager
				const entity = await entityManager.load(filePath);

				// Collect unique tileset IDs from the entity's sprites
				const tilesetIds = new Set<string>();
				if (entity.sprites) {
					for (const sprite of entity.sprites) {
						if (sprite.tilesetId) {
							tilesetIds.add(sprite.tilesetId);
						}
					}
				}

				// Load any missing tilesets
				for (const tilesetId of tilesetIds) {
					const existingTileset = tilesetManager.getTilesetById(tilesetId);
					if (!existingTileset) {
						console.log(`Tileset ${tilesetId} not loaded, searching for it...`);

						// Search project directory for the tileset
						if (projectDirectory) {
							try {
								const tilesetPath = await findTilesetByIdInProject(projectDirectory, tilesetId);
								if (tilesetPath) {
									console.log(`Found tileset at ${tilesetPath}, loading...`);
									await loadTileset(tilesetPath);
								} else {
									// Tileset not found - prompt user to locate it manually
									console.warn(`Could not find tileset file for ID: ${tilesetId}`);

									const result = await window.__TAURI__.dialog.confirm(
										`Could not find tileset with ID: ${tilesetId}\n\nWould you like to locate it manually?`,
										{ title: 'Missing Tileset', kind: 'warning' }
									);

									if (result) {
										// Show file picker
										const selected = await window.__TAURI__.dialog.open({
											title: `Locate Tileset: ${tilesetId}`,
											directory: false,
											multiple: false,
											filters: [{
												name: 'Tileset Files',
												extensions: ['lostset']
											}],
											defaultPath: projectDirectory,
										});

										if (selected && typeof selected === 'string') {
											try {
												await loadTileset(selected);
												console.log(`Successfully loaded tileset from ${selected}`);
											} catch (error) {
												console.error(`Failed to load tileset from ${selected}:`, error);
												await window.__TAURI__.dialog.message(
													`Failed to load tileset: ${error instanceof Error ? error.message : 'Unknown error'}`,
													{ title: 'Error', kind: 'error' }
												);
											}
										}
									}
								}
							} catch (error) {
								console.error(`Failed to find/load tileset ${tilesetId}:`, error);
							}
						}
					}
				}

				// Create a new entity editor tab
				const entityTab: EntityEditorTab = {
					id: `entity-${Date.now()}`,
					type: "entity-editor",
					title: entity.name || "Entity",
					isDirty: false,
					entityId: entity.id,
					entityData: entity,
					filePath: filePath,
					viewState: {
						scale: 2,
						panX: 400,
						panY: 300,
						selectedSpriteLayerId: null,
						selectedChildId: null,
					},
				};

				// Open the tab
				openTab(entityTab);
			} catch (error) {
				console.error(`Failed to open entity ${filePath}:`, error);
				alert(`Failed to open entity: ${error}`);
			}
		},
		[tabs, openTab, projectDirectory, loadTileset],
	);

	const newTileset = useCallback(async () => {
		// Show dialog to select image
		const result = await invoke<{ canceled: boolean; filePaths?: string[] }>(
			"show_open_dialog",
			{
				options: {
					title: "Select Tileset Image",
					filters: [
						{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif"] },
						{ name: "All Files", extensions: ["*"] },
					],
					properties: ["openFile"],
				},
			},
		);

		if (!result.filePaths || result.filePaths.length === 0) return;

		const imagePath = result.filePaths[0];

		// Load the image to get dimensions
		const img = new Image();
		const convertFileSrc = await import("@tauri-apps/api/core").then(
			(m) => m.convertFileSrc,
		);
		img.src = convertFileSrc(imagePath);

		await new Promise((resolve, reject) => {
			img.onload = resolve;
			img.onerror = reject;
		});

		// Extract filename without extension for tileset name
		const fileName = imagePath.split("/").pop() || "Untitled";
		const tilesetName = fileName.replace(/\.[^/.]+$/, "");
		const tilesetId = `tileset-${Date.now()}`;

		// Create new tileset data
		const newTilesetData: TilesetData = {
			version: "1.0",
			name: tilesetName,
			id: tilesetId,
			imagePath: imagePath,
			imageData: img,
			tileWidth: 16,
			tileHeight: 16,
			tiles: [],
			entities: [],
		};

		// Add tileset to global tilesets array
		addTileset(newTilesetData);

		// Create tileset tab with just the tileset ID reference
		const tilesetTab: TilesetTab = {
			id: `tileset-tab-${tilesetId}`,
			type: "tileset" as const,
			title: tilesetName,
			isDirty: true, // Mark as dirty since it's not saved yet
			tilesetId: tilesetId,
			viewState: {
				scale: 2,
				selectedTileRegion: null,
			},
		};

		openTab(tilesetTab);
	}, [addTileset, openTab]);

	const newEntity = useCallback(async () => {
		// Prompt for save location first
		const result = await invoke<{ canceled: boolean; filePath?: string }>(
			"show_save_dialog",
			{
				options: {
					title: "Save New Entity",
					filters: [{ name: "Entity File", extensions: ["lostentity"] }],
					defaultPath: "New Entity.lostentity",
				},
			},
		);

		if (result.canceled || !result.filePath) {
			console.log("Entity creation canceled");
			return;
		}

		// Create a new entity definition
		const entity: EntityDefinition = {
			id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			name: "New Entity",
			sprites: [],
			colliders: [],
			filePath: result.filePath,
		};

		// Save the entity immediately
		try {
			await entityManager.saveEntity(entity, result.filePath);
			console.log("Saved new entity to:", result.filePath);
		} catch (error) {
			console.error("Failed to save new entity:", error);
			alert(`Failed to save entity: ${error}`);
			return;
		}

		// Create a new entity editor tab
		const entityTab: EntityEditorTab = {
			id: `entity-${Date.now()}`,
			type: "entity-editor",
			title: entity.name || "New Entity",
			isDirty: false, // Already saved
			entityId: entity.id,
			entityData: entity,
			filePath: result.filePath,
			viewState: {
				scale: 2,
				panX: 400,
				panY: 300,
				selectedSpriteLayerId: null,
				selectedChildId: null,
			},
		};

		openTab(entityTab);
	}, [openTab]);

	const openCollisionEditor = useCallback((
		sourceType: 'tile' | 'entity',
		sourceId: string,
		tileId?: number,
		sourceTabId?: string
	) => {
		// Generate tab title
		let title = 'Edit Collision';
		if (sourceType === 'tile') {
			const tileset = tilesets.find(t => t.id === sourceId);
			const tile = tileset?.tiles.find(t => t.id === tileId);
			if (tile?.name) {
				title = `Collision - ${tile.name}`;
			} else if (tileset) {
				title = `Collision - Tile ${tileId}`;
			}
		} else {
			const entityTab = tabs.find(t => t.id === sourceTabId);
			if (entityTab && entityTab.type === 'entity-editor') {
				title = `Collision - ${entityTab.entityData.name}`;
			}
		}

		// Create collision editor tab
		const collisionTab = {
			id: `collision-${Date.now()}`,
			type: 'collision-editor' as const,
			title,
			isDirty: false,
			sourceType,
			sourceId,
			sourceTabId,
			tileId
		};

		openTab(collisionTab);
	}, [tabs, tilesets, openTab]);

	const saveTileset = useCallback(async () => {
		const activeTilesetTab = getActiveTilesetTab();
		if (!activeTilesetTab) {
			console.warn("No active tileset tab to save");
			return;
		}

		// Get the tileset data from the tilesets array
		const tileset = tilesets.find((t) => t.id === activeTilesetTab.tilesetId);
		if (!tileset) {
			console.error(`Tileset ${activeTilesetTab.tilesetId} not found`);
			alert(`Cannot save: tileset not found`);
			return;
		}

		console.log(
			"Saving tileset with tiles:",
			tileset.tiles.length,
			tileset.tiles,
		);

		// If no file path, show save dialog
		let targetPath = tileset.filePath;
		if (!targetPath) {
			const result = await invoke<{ canceled: boolean; filePath?: string }>(
				"show_save_dialog",
				{
					options: {
						title: "Save Tileset",
						defaultPath: `${tileset.name}.lostset`,
						filters: [{ name: "Lost Editor Tileset", extensions: ["lostset"] }],
					},
				},
			);

			if (!result.filePath) {
				return; // User cancelled
			}

			targetPath = result.filePath;
		}

		try {
			await tilesetManager.saveTileset(tileset, targetPath);

			// Update the tileset in the tilesets array with the new file path
			setTilesets((prev) =>
				prev.map((t) =>
					t.id === tileset.id ? { ...t, filePath: targetPath } : t,
				),
			);

			// Mark the tab as not dirty and update title
			updateTabData(activeTilesetTab.id, {
				isDirty: false,
				title: fileManager.basename(targetPath, ".lostset"),
			});

			console.log(`Saved tileset: ${targetPath}`);
		} catch (error) {
			console.error("Failed to save tileset:", error);
			alert(`Failed to save tileset: ${error}`);
		}
	}, [getActiveTilesetTab, tilesets, updateTabData]);

	const saveAll = useCallback(async () => {
		// Save all dirty tileset tabs
		const tilesetTabs = tabs.filter(
			(t) => t.type === "tileset" && t.isDirty,
		) as TilesetTab[];

		for (const tab of tilesetTabs) {
			const tileset = tilesets.find((t) => t.id === tab.tilesetId);
			if (!tileset) continue;

			// Skip tilesets without a file path (need manual save with dialog)
			if (!tileset.filePath) {
				console.warn(
					`Skipping unsaved tileset: ${tileset.name} (no file path)`,
				);
				continue;
			}

			try {
				await tilesetManager.saveTileset(tileset, tileset.filePath);

				// Mark the tab as not dirty
				updateTabData(tab.id, { isDirty: false });

				console.log(`Saved tileset: ${tileset.filePath}`);
			} catch (error) {
				console.error(`Failed to save tileset ${tileset.name}:`, error);
				alert(`Failed to save tileset ${tileset.name}: ${error}`);
				return; // Stop on error
			}
		}

		// Save all dirty entity-editor tabs
		const entityTabs = tabs.filter(
			(t) => t.type === "entity-editor" && t.isDirty,
		) as EntityEditorTab[];

		for (const tab of entityTabs) {
			const entity = tab.entityData;

			// Skip entities without a file path (need manual save with dialog)
			if (!entity.filePath) {
				console.warn(
					`Skipping unsaved entity: ${entity.name} (no file path)`,
				);
				continue;
			}

			try {
				await entityManager.saveEntity(entity, entity.filePath);

				// Mark the tab as not dirty
				updateTabData(tab.id, { isDirty: false });

				console.log(`Saved entity: ${entity.filePath}`);
			} catch (error) {
				console.error(`Failed to save entity ${entity.name}:`, error);
				alert(`Failed to save entity ${entity.name}: ${error}`);
				return; // Stop on error
			}
		}

		// Save the project (which now also saves all map tabs to separate files)
		await saveProject();
	}, [tabs, tilesets, updateTabData, saveProject]);

	// Initialize with settings
	useEffect(() => {
		const loadSettings = async () => {
			await settingsManager.load();
			const settings = settingsManager.getSettings();
			setMapData((prev) => ({
				...prev,
				width: settings.defaultMapWidth,
				height: settings.defaultMapHeight,
				tileWidth: settings.defaultTileWidth,
				tileHeight: settings.defaultTileHeight,
			}));
			setGridVisible(settings.gridVisible);
		};
		loadSettings();
	}, [settingsManager]);

	const value: EditorContextType = {
		tabs,
		activeTabId,
		openTab,
		closeTab,
		setActiveTab: setActiveTabId,
		updateTabData,
		getActiveMapTab,
		getActiveTilesetTab,
		getActiveEntityTab,
		maps,
		getMapById,
		updateMap,
		getActiveMap,
		mapData,
		setMapData,  // [DEPRECATED] Use updateMap() instead
		currentLayer,
		setCurrentLayer,
		currentTool,
		setCurrentTool,
		selectedTileX,
		selectedTileY,
		setSelectedTile,
		selectedTilesetId,
		setSelectedTilesetId,
		selectedTileId,
		setSelectedTileId,
		selectedEntityDefId,
		setSelectedEntityDefId,
		selectedTerrainLayerId,
		setSelectedTerrainLayerId,
		tilesets,
		currentTileset,
		setCurrentTileset,
		loadTileset,
		addTileset,
		updateTileset,
		unloadTileset,
		getTilesetById,
		tilesetImage,
		setTilesetImage,
		tilesetCols,
		setTilesetCols,
		tilesetRows,
		setTilesetRows,
		zoom,
		setZoom: setZoomAndUpdateTab,
		panX,
		panY,
		setPan,
		currentProjectPath,
		setCurrentProjectPath,
		projectModified,
		setProjectModified,
		projectName,
		setProjectName,
		tilesetPath,
		setTilesetPath,
		settingsManager,
		gridVisible,
		setGridVisible,
		addLayer,
		removeLayer,
		updateLayerVisibility,
		updateLayerName,
		updateLayerAutotiling,
		reorderLayers,
		placeTile,
		eraseTile,
		autotilingOverride,
		placeEntity,
		removeEntity,
		loadTilesetFromFile,
		loadTilesetFromDataURL,
		saveProject,
		saveProjectAs,
		loadProject,
		newProject,
		newMap,
		newTileset,
		newEntity,
		openCollisionEditor,
		saveTileset,
		saveAll,
		projectDirectory,
		openMapFromFile,
		openTilesetFromFile,
		openEntityFromFile,
		brokenReferencesModalData,
		setBrokenReferencesModalData,
	};

	return (
		<EditorContext.Provider value={value}>{children}</EditorContext.Provider>
	);
};
