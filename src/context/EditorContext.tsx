import { invoke } from "@tauri-apps/api/core";
import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { entityManager } from "../managers/EntityManager";
import { fileManager } from "../managers/FileManager";
import { mapManager } from "../managers/MapManager";
import {
	type BrokenReference,
	referenceManager,
} from "../managers/ReferenceManager";
import { tilesetManager } from "../managers/TilesetManager";
import { createDefaultMapData, ProjectDataSchema } from "../schemas";
import { SettingsManager } from "../settings";
import type {
	AnyTab,
	EntityDefinition,
	EntityEditorTab,
	Layer,
	MapData,
	MapTab,
	ProjectData,
	SelectionState,
	TilesetData,
	TilesetTab,
	Tool,
} from "../types";
import { generateId } from "../utils/id";
import { packTileId, unpackTileId } from "../utils/tileId";
import { tilesetIndexManager } from "../utils/tilesetIndexManager";

// Tauri dialog types
declare global {
	interface Window {
		__TAURI__: {
			dialog: {
				confirm: (
					message: string,
					options?: { title?: string; kind?: string },
				) => Promise<boolean>;
				open: (options: {
					title?: string;
					directory?: boolean;
					multiple?: boolean;
					filters?: Array<{ name: string; extensions: string[] }>;
					defaultPath?: string;
				}) => Promise<string | string[] | null>;
				message: (
					message: string,
					options?: { title?: string; kind?: string },
				) => Promise<void>;
			};
		};
	}
}

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
	maps: MapData[]; // Global array of all loaded maps (source of truth)
	getMapById: (id: string) => MapData | undefined;
	updateMap: (id: string, updates: Partial<MapData>) => void;
	getActiveMap: () => MapData | undefined;

	// Layer state
	currentLayer: Layer | null;
	setCurrentLayer: (layer: Layer | null) => void;

	// Tool state
	currentTool: Tool;
	setCurrentTool: (tool: Tool) => void;

	// Selection state (discriminated union)
	selection: SelectionState;
	setSelection: (selection: SelectionState) => void;
	// Backward compatibility helpers
	selectedTilesetId: string | null;
	selectedTileId: number | null;
	selectedEntityDefId: string | null;
	selectedTerrainLayerId: string | null;
	selectedTileX: number;
	selectedTileY: number;
	setSelectedTile: (
		x: number,
		y: number,
		tilesetId: string,
		tileId: number,
	) => void;
	setSelectedTilesetId: (id: string | null) => void;
	setSelectedTileId: (id: number | null) => void;
	setSelectedEntityDefId: (tilesetId: string, id: string | null) => void;
	setSelectedTerrainLayerId: (tilesetId: string, id: string | null) => void;

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
	addLayer: () => void;
	removeLayer: (layerId: string) => void;
	updateLayerVisibility: (layerId: string, visible: boolean) => void;
	updateLayerName: (layerId: string, name: string) => void;
	reorderLayers: (newLayersOrder: Layer[]) => void;

	// Tile Actions
	placeTile: (x: number, y: number) => void;
	eraseTile: (x: number, y: number) => void;

	// Project Actions
	saveProject: () => Promise<void>;
	saveProjectAs: (filePath: string) => Promise<void>;
	loadProject: (filePath: string) => Promise<void>;
	newProject: () => Promise<void>;
	newMap: (directory?: string, fileName?: string) => void;
	newTileset: (directory?: string) => Promise<void>;
	newEntity: (directory?: string) => void;
	openCollisionEditor: (
		sourceType: "tile" | "entity",
		sourceId: string,
		tileId?: number,
		sourceTabId?: string,
	) => void;
	saveTileset: () => Promise<void>;
	saveTilesetByTabId: (tilesetTabId: string) => Promise<void>;
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

	const [currentLayer, setCurrentLayer] = useState<Layer | null>(null);
	const [currentTool, setCurrentTool] = useState<Tool>("pencil");

	// Selection state as discriminated union
	const [selection, setSelection] = useState<SelectionState>({ type: "none" });

	// Helper getters for backward compatibility (derived from selection)
	const selectedTilesetId =
		selection.type !== "none" ? selection.tilesetId : null;
	const selectedTileId = selection.type === "tile" ? selection.tileId : null;
	const selectedEntityDefId =
		selection.type === "entity" ? selection.entityDefId : null;
	const selectedTerrainLayerId =
		selection.type === "terrain" ? selection.terrainLayerId : null;
	const selectedTileX = selection.type === "tile" ? selection.tileX : 0;
	const selectedTileY = selection.type === "tile" ? selection.tileY : 0;

	// Multi-tileset state - "working copy" for the current project
	// This is the single source of truth for UI components. It can be modified
	// without immediately writing to disk. TilesetManager cache represents "what's on disk"
	// and should not be queried directly by UI components.
	const [tilesets, setTilesets] = useState<TilesetData[]>([]);
	const [currentTileset, setCurrentTileset] = useState<TilesetData | null>(
		null,
	);

	// Project directory for file browser
	const [projectDirectory, setProjectDirectory] = useState<string | null>(null);

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

	const setPan = useCallback(
		(x: number, y: number) => {
			setPanX(x);
			setPanY(y);

			// Also update the active map tab's viewState
			setTabs((prev) => {
				if (!activeTabId) return prev;
				return prev.map((tab) => {
					if (tab.id === activeTabId && tab.type === "map-editor") {
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
		},
		[activeTabId],
	);

	const setZoomAndUpdateTab = useCallback(
		(newZoom: number) => {
			setZoom(newZoom);

			// Also update the active map tab's viewState
			setTabs((prev) => {
				if (!activeTabId) return prev;
				return prev.map((tab) => {
					if (tab.id === activeTabId && tab.type === "map-editor") {
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
		},
		[activeTabId],
	);

	// Map helper functions - must be defined before functions that use them
	const getActiveMapTab = useCallback((): MapTab | null => {
		if (!activeTabId) return null;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (tab && tab.type === "map-editor") {
			return tab as MapTab;
		}
		return null;
	}, [activeTabId, tabs]);

	const getMapById = useCallback(
		(id: string) => {
			return maps.find((m) => m.id === id);
		},
		[maps],
	);

	const updateMap = useCallback((id: string, updates: Partial<MapData>) => {
		setMaps((currentMaps) =>
			currentMaps.map((m) => (m.id === id ? { ...m, ...updates } : m)),
		);
	}, []);

	const getActiveMap = useCallback(() => {
		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (activeTab?.type === "map-editor") {
			return maps.find((m) => m.id === (activeTab as MapTab).mapId);
		}
		return undefined;
	}, [activeTabId, tabs, maps]);

	const addLayer = useCallback(() => {
		const mapTab = getActiveMapTab();
		if (!mapTab) return;

		const currentMap = getMapById(mapTab.mapId);
		if (!currentMap) return;

		const newLayer: Layer = {
			id: generateId(),
			name: `Layer ${currentMap.layers.length + 1}`,
			visible: true,
			tiles: [],
		};

		updateMap(mapTab.mapId, {
			layers: [...currentMap.layers, newLayer],
		});

		setCurrentLayer(newLayer);
		setProjectModified(true);
	}, [getActiveMapTab, getMapById, updateMap]);

	const removeLayer = useCallback(
		(layerId: string) => {
			const mapTab = getActiveMapTab();
			if (!mapTab) return;

			const currentMap = getMapById(mapTab.mapId);
			if (!currentMap) return;

			const newLayers = currentMap.layers.filter((l) => l.id !== layerId);

			updateMap(mapTab.mapId, {
				layers: newLayers,
			});

			if (currentLayer?.id === layerId) {
				setCurrentLayer(newLayers[0] || null);
			}
			setProjectModified(true);
		},
		[currentLayer, getActiveMapTab, getMapById, updateMap],
	);

	const updateLayerVisibility = useCallback(
		(layerId: string, visible: boolean) => {
			const mapTab = getActiveMapTab();
			if (!mapTab) return;

			const currentMap = getMapById(mapTab.mapId);
			if (!currentMap) return;

			updateMap(mapTab.mapId, {
				layers: currentMap.layers.map((l) =>
					l.id === layerId ? { ...l, visible } : l,
				),
			});
			setProjectModified(true);
		},
		[getActiveMapTab, getMapById, updateMap],
	);

	const updateLayerName = useCallback(
		(layerId: string, name: string) => {
			const mapTab = getActiveMapTab();
			if (!mapTab) return;

			const currentMap = getMapById(mapTab.mapId);
			if (!currentMap) return;

			updateMap(mapTab.mapId, {
				layers: currentMap.layers.map((l) =>
					l.id === layerId ? { ...l, name } : l,
				),
			});
			setProjectModified(true);
		},
		[getActiveMapTab, getMapById, updateMap],
	);

	const reorderLayers = useCallback(
		(newLayersOrder: Layer[]) => {
			const mapTab = getActiveMapTab();
			if (!mapTab) return;

			updateMap(mapTab.mapId, {
				layers: newLayersOrder,
			});
			setProjectModified(true);
		},
		[getActiveMapTab, updateMap],
	);

	const placeTile = useCallback(
		(x: number, y: number) => {
			if (!currentLayer) return;

			const mapTab = getActiveMapTab();
			if (!mapTab) return;

			const currentMap = getMapById(mapTab.mapId);
			if (!currentMap) return;

			// Check if selected tile is a compound tile (using tilesets state directly)
			const selectedTileset = selectedTilesetId
				? tilesets.find((ts) => ts.id === selectedTilesetId)
				: null;
			const selectedTileDef =
				selectedTileset && selectedTileId
					? selectedTileset.tiles.find((t) => t.id === selectedTileId)
					: null;

			// Get tileset order from the tileset itself (not from array position)
			const tilesetIndex = selectedTileset?.order ?? -1;

			if (tilesetIndex === -1 || !selectedTileId) return;

			// Unpack the selected tile ID (which may not have tileset index yet from old format)
			const geometry = unpackTileId(selectedTileId);

			// Repack with the correct tileset index to create a global tile ID
			const globalTileId = packTileId(
				geometry.x,
				geometry.y,
				tilesetIndex,
				geometry.flipX,
				geometry.flipY,
			);

			// Update layers immutably
			const mapWidth = currentMap.width;
			const mapHeight = currentMap.height;

			const updatedLayers = currentMap.layers.map((layer) => {
				if (layer.id === currentLayer.id) {
					const newTiles = [...layer.tiles]; // Copy the dense array

					// Handle compound tiles
					if (selectedTileDef?.isCompound) {
						// Calculate cells from width/height
						const tileWidth = selectedTileset?.tileWidth || 16;
						const tileHeight = selectedTileset?.tileHeight || 16;
						const widthInTiles = Math.ceil(
							(selectedTileDef.width ?? 0) / tileWidth,
						);
						const heightInTiles = Math.ceil(
							(selectedTileDef.height ?? 0) / tileHeight,
						);

						// Place all cells of the compound tile
						for (let dy = 0; dy < heightInTiles; dy++) {
							for (let dx = 0; dx < widthInTiles; dx++) {
								const cellX = x + dx;
								const cellY = y + dy;

								// Check bounds
								if (
									cellX >= 0 &&
									cellY >= 0 &&
									cellX < mapWidth &&
									cellY < mapHeight
								) {
									// Each cell of the compound tile should reference a different part of the sprite
									const cellSpriteX = geometry.x + dx * tileWidth;
									const cellSpriteY = geometry.y + dy * tileHeight;
									const cellTileId = packTileId(
										cellSpriteX,
										cellSpriteY,
										tilesetIndex,
										geometry.flipX,
										geometry.flipY,
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

					const updatedLayer = { ...layer, tiles: newTiles };
					setCurrentLayer(updatedLayer);
					return updatedLayer;
				}
				return layer;
			});

			updateMap(mapTab.mapId, {
				layers: updatedLayers,
			});
			setProjectModified(true);
		},
		[
			getActiveMapTab,
			getMapById,
			updateMap,
			currentLayer,
			selectedTilesetId,
			selectedTileId,
			tilesets,
		],
	);

	const eraseTile = useCallback(
		(x: number, y: number) => {
			if (!currentLayer) return;

			const mapTab = getActiveMapTab();
			if (!mapTab) return;

			const currentMap = getMapById(mapTab.mapId);
			if (!currentMap) return;

			// Update layers immutably
			const mapWidth = currentMap.width;
			const mapHeight = currentMap.height;

			const updatedLayers = currentMap.layers.map((layer) => {
				if (layer.id === currentLayer.id) {
					const newTiles = [...layer.tiles]; // Copy the dense array

					// Erase the tile by setting it to 0
					if (x >= 0 && y >= 0 && x < mapWidth && y < mapHeight) {
						const index = y * mapWidth + x;
						newTiles[index] = 0;
					}

					const updatedLayer = { ...layer, tiles: newTiles };

					setCurrentLayer(updatedLayer);
					return updatedLayer;
				}
				return layer;
			});

			updateMap(mapTab.mapId, {
				layers: updatedLayers,
			});
			setProjectModified(true);
		},
		[getActiveMapTab, getMapById, updateMap, currentLayer],
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

	const getActiveTilesetTab = useCallback((): TilesetTab | null => {
		if (!activeTabId) return null;
		const tab = tabs.find((t) => t.id === activeTabId);
		if (tab && tab.type === "tileset-editor") {
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
			const newTilesets = [...prev, tileset];
			// Sort by order for deterministic ordering
			return newTilesets.sort((a, b) => a.order - b.order);
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

	const saveProjectAs = useCallback(
		async (filePath: string) => {
			// Set project directory for relative paths
			const projectDir = fileManager.dirname(filePath);
			fileManager.setProjectDir(projectDir);

			// Save any unsaved tilesets
			const unsavedTilesets = tilesets.filter((t) => !t.filePath);
			if (unsavedTilesets.length > 0) {
				for (const tileset of unsavedTilesets) {
					const result = await invoke<{ canceled: boolean; filePath?: string }>(
						"show_save_dialog",
						{
							options: {
								title: `Save Tileset: ${tileset.name}`,
								defaultPath: `${tileset.name}.lostset`,
								filters: [
									{ name: "Lost Editor Tileset", extensions: ["lostset"] },
								],
							},
						},
					);

					if (result.canceled || !result.filePath) {
						alert(
							`Project save cancelled: Please save tileset "${tileset.name}" first.`,
						);
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
								tab.type === "tileset-editor" &&
								(tab as TilesetTab).tilesetId === tileset.id
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

			// Save all map tabs to separate .lostmap files
			for (const tab of tabs) {
				if (tab.type === "map-editor") {
					const mapTab = tab as MapTab;

					// Get map data from global maps array
					const mapData = maps.find((m) => m.id === mapTab.mapId);
					if (!mapData) {
						console.warn(
							`Skipping map tab ${mapTab.title}: map data not found for ID ${mapTab.mapId}`,
						);
						continue;
					}

					// Determine map file path
					let mapFilePath = mapTab.filePath;
					if (!mapFilePath) {
						// No file path yet, prompt user to save
						const sanitizedTitle = mapTab.title.replace(/[^a-zA-Z0-9_-]/g, "_");
						const result = await invoke<{
							canceled: boolean;
							filePath?: string;
						}>("show_save_dialog", {
							options: {
								title: `Save Map: ${mapTab.title}`,
								defaultPath: `${sanitizedTitle}.lostmap`,
								filters: [{ name: "Lost Editor Map", extensions: ["lostmap"] }],
							},
						});

						if (result.canceled || !result.filePath) {
							alert(
								`Project save cancelled: Please save map "${mapTab.title}" first.`,
							);
							return;
						}

						mapFilePath = result.filePath;
					}

					// Save the map using mapManager
					try {
						await mapManager.saveMap(mapData, mapFilePath, mapTab.title);

						// Update the tab with the file path
						mapTab.filePath = mapFilePath;
						mapTab.mapFilePath = mapFilePath;
					} catch (error) {
						alert(`Failed to save map ${mapTab.title}: ${error}`);
						return;
					}
				}
			}

			const projectData: ProjectData = {
				version: "1.0",
				name: projectName,
				tilesets: [],
				maps: [],
				projectDir,
				lastModified: new Date().toISOString(),
				openTabs: {
					tabs: tabs.map((tab) => {
						if (tab.type === "map-editor") {
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

	/**
	 * Recursively discover files with a specific extension in a directory tree
	 * @param dir - Directory to search (absolute path)
	 * @param extension - File extension to match (e.g., '.lostset')
	 * @param basePath - Base path for calculating relative paths (defaults to dir)
	 * @returns Array of relative file paths matching the extension
	 */
	const discoverFiles = useCallback(
		async (
			dir: string,
			extension: string,
			basePath: string = dir,
		): Promise<string[]> => {
			const files: string[] = [];
			try {
				const entries = await readDir(dir);
				for (const entry of entries) {
					// Skip hidden files and folders (starting with .)
					if (entry.name.startsWith(".")) {
						continue;
					}

					const fullPath = fileManager.join(dir, entry.name);
					if (entry.isDirectory) {
						// Recursively search subdirectory
						const subFiles = await discoverFiles(fullPath, extension, basePath);
						files.push(...subFiles);
					} else if (entry.name.endsWith(extension)) {
						// Calculate relative path from base directory
						const relativePath = fileManager.makeRelativeTo(basePath, fullPath);
						files.push(relativePath);
					}
				}
			} catch (error) {
				// Silently skip directories that can't be read (permissions, etc.)
				console.warn(`Failed to read directory ${dir}:`, error);
			}
			return files;
		},
		[],
	);

	const loadProject = useCallback(
		async (filePath: string) => {
			// Clear manager caches and React state before loading new project
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

				// Set project directory for relative path resolution
				const projectDir = fileManager.dirname(filePath);
				fileManager.setProjectDir(projectDir);

				// Validate file references before loading tilesets
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
									reject(new Error("Project load cancelled"));
								},
							});
						});
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

				// Phase 1: Discover and load ALL tilesets
				console.log("[loadProject] Phase 1: Discovering tilesets...");
				const tilesetFiles = await discoverFiles(projectDir, ".lostset");
				console.log(
					`[loadProject] Found ${tilesetFiles.length} tileset(s):`,
					tilesetFiles,
				);

				for (const tilesetPath of tilesetFiles) {
					try {
						const tileset = await tilesetManager.load(tilesetPath);
						setTilesets((prev) => {
							// Check if already loaded
							if (prev.find((t) => t.id === tileset.id)) {
								return prev;
							}
							const newTilesets = [...prev, tileset];
							// Sort by order for deterministic ordering
							return newTilesets.sort((a, b) => a.order - b.order);
						});
					} catch (error) {
						console.error(`Failed to load tileset ${tilesetPath}:`, error);
					}
				}

				// Phase 2: Discover and load ALL entity definitions
				console.log("[loadProject] Phase 2: Discovering entities...");
				const entityFiles = await discoverFiles(projectDir, ".lostentity");
				console.log(
					`[loadProject] Found ${entityFiles.length} entity definition(s):`,
					entityFiles,
				);

				for (const entityPath of entityFiles) {
					try {
						await entityManager.load(entityPath);
					} catch (error) {
						console.error(`Failed to load entity ${entityPath}:`, error);
					}
				}

				// Phase 3: Discover and load ALL maps
				console.log("[loadProject] Phase 3: Discovering maps...");
				const mapFiles = await discoverFiles(projectDir, ".lostmap");
				console.log(`[loadProject] Found ${mapFiles.length} map(s):`, mapFiles);

				const loadedMaps: MapData[] = [];
				for (const mapPath of mapFiles) {
					try {
						// Convert relative path to absolute path
						const absolutePath = fileManager.join(projectDir, mapPath);
						const mapData = await mapManager.loadMap(absolutePath);
						// Create unique map ID based on absolute file path
						const mapId = `map-${absolutePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
						const mapWithId = { ...mapData, id: mapId };
						loadedMaps.push(mapWithId);
					} catch (error) {
						console.error(`Failed to load map ${mapPath}:`, error);
					}
				}

				// Set all loaded maps in state
				setMaps(loadedMaps);

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

				// Restore tabs (all resources already loaded, just match them up)
				const restoredTabs: AnyTab[] = [];

				for (const tab of projectData.openTabs.tabs) {
					if (tab.type === "map-editor") {
						const mapTab = tab as MapTab;

						// Find the already-loaded map by file path
						if (mapTab.filePath) {
							const mapId = `map-${mapTab.filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
							const existingMap = loadedMaps.find((m) => m.id === mapId);

							if (existingMap) {
								// Create MapTab with reference to loaded map
								const fullMapTab: MapTab = {
									id: mapTab.id,
									type: "map-editor",
									title: mapTab.title,
									isDirty: false,
									filePath: mapTab.filePath,
									mapId: mapId,
									mapFilePath: mapTab.filePath,
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
							} else {
								console.warn(
									`Map ${mapTab.filePath} not found in loaded maps, skipping tab`,
								);
							}
						}
					} else if (tab.type === "tileset-editor") {
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
						const entityTab = tab as EntityEditorTab;

						if (entityTab.filePath) {
							// Entity should already be loaded, just retrieve it
							const entityData = entityManager.getEntity(entityTab.filePath);

							if (entityData) {
								const fullEntityTab: EntityEditorTab = {
									id: entityTab.id,
									type: "entity-editor",
									title: entityTab.title,
									isDirty: false,
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
							} else {
								console.warn(
									`Entity ${entityTab.filePath} not found in loaded entities, skipping tab`,
								);
							}
						}
					}
				}

				setTabs(restoredTabs);

				// Make sure the active tab is still in the restored tabs
				const activeTabStillExists = restoredTabs.some(
					(t) => t.id === projectData.openTabs.activeTabId,
				);
				if (activeTabStillExists) {
					setActiveTabId(projectData.openTabs.activeTabId || null);
				} else if (restoredTabs.length > 0) {
					setActiveTabId(restoredTabs[0].id);
				} else {
					setActiveTabId(null);
				}

				// Validate file references after loading
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
					}
				} catch (error) {
					console.error("Failed to validate references:", error);
				}
			} catch (error: unknown) {
				console.error("Failed to load project:", error);
				const message = error instanceof Error ? error.message : String(error);
				alert(`Failed to parse project file: ${message}`);
			}
		},
		[settingsManager, discoverFiles],
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
			openTabs: { tabs: [], activeTabId: null },
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
	}, [settingsManager]);

	const newMap = useCallback(
		(directory?: string, fileName?: string) => {
			// Generate a unique ID for the new map
			const mapId = generateId();

			// Find the highest existing map number to avoid duplicates
			const existingMapNumbers = tabs
				.filter((t) => t.type === "map-editor")
				.map((t) => {
					const match = t.title.match(/^Map (\d+)$/);
					return match ? parseInt(match[1], 10) : 0;
				});
			const maxMapNumber = Math.max(0, ...existingMapNumbers);
			const mapNumber = maxMapNumber + 1;
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

			// Add to global maps array FIRST
			// This ensures the map exists when the view tries to fetch it
			setMaps((prevMaps) => [...prevMaps, mapWithId]);

			// Then create the tab
			const newMapTab: MapTab = {
				id: mapId,
				type: "map-editor",
				title: title,
				isDirty: true, // Mark as dirty since it's unsaved
				mapId: mapId,
				mapFilePath: filePath || "",
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

			setTabs((prevTabs) => [...prevTabs, newMapTab]);

			// Make the new map tab active
			setActiveTabId(mapId);
		},
		[tabs],
	);

	const openMapFromFile = useCallback(
		async (filePath: string) => {
			try {
				// Check if map is already open in a tab
				const existingTab = tabs.find(
					(tab) => tab.type === "map-editor" && tab.filePath === filePath,
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
				const mapId = generateId();
				const mapWithId = { ...mapData, id: mapId };

				// Add to global maps array
				setMaps((prevMaps) => [...prevMaps, mapWithId]);

				const newMapTab: MapTab = {
					id: mapId,
					type: "map-editor",
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
						tab.type === "tileset-editor" &&
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
						if (prev.find((t) => t.id === tileset?.id)) {
							return prev;
						}
						return tileset ? [...prev, tileset] : prev;
					});
					setProjectModified(true);
				}

				// Create a new TilesetTab
				const tilesetTab: TilesetTab = {
					id: `tileset-${tileset.id}`,
					type: "tileset-editor",
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
					(tab) => tab.type === "entity-editor" && tab.filePath === filePath,
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
						// Search project directory for the tileset
						if (projectDirectory) {
							try {
								const tilesetPath = await findTilesetByIdInProject(
									projectDirectory,
									tilesetId,
								);
								if (tilesetPath) {
									await loadTileset(tilesetPath);
								} else {
									// Tileset not found - prompt user to locate it manually
									console.warn(
										`Could not find tileset file for ID: ${tilesetId}`,
									);

									const result = await window.__TAURI__.dialog.confirm(
										`Could not find tileset with ID: ${tilesetId}\n\nWould you like to locate it manually?`,
										{ title: "Missing Tileset", kind: "warning" },
									);

									if (result) {
										// Show file picker
										const selected = await window.__TAURI__.dialog.open({
											title: `Locate Tileset: ${tilesetId}`,
											directory: false,
											multiple: false,
											filters: [
												{
													name: "Tileset Files",
													extensions: ["lostset"],
												},
											],
											defaultPath: projectDirectory,
										});

										if (selected && typeof selected === "string") {
											try {
												await loadTileset(selected);
											} catch (error) {
												console.error(
													`Failed to load tileset from ${selected}:`,
													error,
												);
												await window.__TAURI__.dialog.message(
													`Failed to load tileset: ${error instanceof Error ? error.message : "Unknown error"}`,
													{ title: "Error", kind: "error" },
												);
											}
										}
									}
								}
							} catch (error) {
								console.error(
									`Failed to find/load tileset ${tilesetId}:`,
									error,
								);
							}
						}
					}
				}

				// Create a new entity editor tab
				const entityTab: EntityEditorTab = {
					id: generateId(),
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
		// Check if project is open
		if (!projectDirectory) {
			alert("Please open or create a project first.");
			return;
		}

		// Show dialog to select image
		const result = await invoke<{ canceled: boolean; filePaths?: string[] }>(
			"show_open_dialog",
			{
				options: {
					title: "Select Tileset Image",
					defaultPath: projectDirectory,
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

		// Validate that the image is within the project directory
		const normalizedImagePath = fileManager.normalize(imagePath);
		const normalizedProjectDir = fileManager.normalize(projectDirectory);

		if (!normalizedImagePath.startsWith(normalizedProjectDir)) {
			alert(
				"The selected image must be located within the project directory or its subdirectories.",
			);
			return;
		}

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
		const tilesetId = generateId();

		// Assign the next available order
		const tilesetOrder = tilesetIndexManager.getNextAvailableIndex();

		// Create new tileset data
		const newTilesetData: TilesetData = {
			version: "1.0",
			name: tilesetName,
			id: tilesetId,
			order: tilesetOrder,
			imagePath: imagePath,
			imageData: img,
			tileWidth: 16,
			tileHeight: 16,
			tiles: [],
			terrainLayers: [],
		};

		// Add tileset to global tilesets array
		addTileset(newTilesetData);

		// Create tileset tab with just the tileset ID reference
		const tilesetTab: TilesetTab = {
			id: generateId(),
			type: "tileset-editor" as const,
			title: tilesetName,
			isDirty: true, // Mark as dirty since it's not saved yet
			tilesetId: tilesetId,
			viewState: {
				scale: 2,
				selectedTileRegion: null,
			},
		};

		openTab(tilesetTab);
	}, [addTileset, openTab, projectDirectory]);

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
			return;
		}

		// Create a new entity definition
		const entity: EntityDefinition = {
			id: generateId(),
			name: "New Entity",
			type: "",
			sprites: [],
			offset: { x: 0, y: 0 },
			rotation: 0,
			colliders: [],
			children: [],
			properties: {},
			filePath: result.filePath,
		};

		// Save the entity immediately
		try {
			await entityManager.saveEntity(entity, result.filePath);
		} catch (error) {
			console.error("Failed to save new entity:", error);
			alert(`Failed to save entity: ${error}`);
			return;
		}

		// Create a new entity editor tab
		const entityTab: EntityEditorTab = {
			id: generateId(),
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

	const openCollisionEditor = useCallback(
		(
			sourceType: "tile" | "entity",
			sourceId: string,
			tileId?: number,
			sourceTabId?: string,
		) => {
			// Generate tab title
			let title = "Edit Collision";
			if (sourceType === "tile") {
				const tileset = tilesets.find((t) => t.id === sourceId);
				const tile = tileset?.tiles.find((t) => t.id === tileId);
				if (tile && tile.name !== "") {
					title = `Collision - ${tile.name}`;
				} else if (tileset) {
					title = `Collision - Tile ${tileId}`;
				}
			} else {
				const entityTab = tabs.find((t) => t.id === sourceTabId);
				if (entityTab && entityTab.type === "entity-editor") {
					title = `Collision - ${entityTab.entityData.name}`;
				}
			}

			// Create collision editor tab
			const collisionTab = {
				id: generateId(),
				type: "collision-editor" as const,
				title,
				isDirty: false,
				sourceType,
				sourceId,
				sourceTabId,
				tileId,
			};

			openTab(collisionTab);
		},
		[tabs, tilesets, openTab],
	);

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
		} catch (error) {
			console.error("Failed to save tileset:", error);
			alert(`Failed to save tileset: ${error}`);
		}
	}, [getActiveTilesetTab, tilesets, updateTabData]);

	const saveTilesetByTabId = useCallback(
		async (tilesetTabId: string) => {
			// Find the tileset tab
			const foundTab = tabs.find((t) => t.id === tilesetTabId);
			if (!foundTab || foundTab.type !== "tileset-editor") {
				console.warn(`Tileset tab ${tilesetTabId} not found`);
				return;
			}

			const tilesetTab = foundTab as TilesetTab;

			// Get the tileset data from the tilesets array
			const tileset = tilesets.find((t) => t.id === tilesetTab.tilesetId);
			if (!tileset) {
				console.error(`Tileset ${tilesetTab.tilesetId} not found`);
				alert(`Cannot save: tileset not found`);
				return;
			}

			// If no file path, show save dialog
			let targetPath = tileset.filePath;
			if (!targetPath) {
				const result = await invoke<{ canceled: boolean; filePath?: string }>(
					"show_save_dialog",
					{
						options: {
							title: "Save Tileset",
							defaultPath: `${tileset.name}.lostset`,
							filters: [
								{ name: "Lost Editor Tileset", extensions: ["lostset"] },
							],
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
				updateTabData(tilesetTab.id, {
					isDirty: false,
					title: fileManager.basename(targetPath, ".lostset"),
				});
			} catch (error) {
				console.error("Failed to save tileset:", error);
				alert(`Failed to save tileset: ${error}`);
			}
		},
		[tabs, tilesets, updateTabData],
	);

	const saveAll = useCallback(async () => {
		// Save all dirty tileset tabs
		const tilesetTabs = tabs.filter(
			(t) => t.type === "tileset-editor" && t.isDirty,
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
				console.warn(`Skipping unsaved entity: ${entity.name} (no file path)`);
				continue;
			}

			try {
				await entityManager.saveEntity(entity, entity.filePath);

				// Mark the tab as not dirty
				updateTabData(tab.id, { isDirty: false });
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
			setGridVisible(settings.gridVisible);
		};
		loadSettings();
	}, [settingsManager]);

	// Helper setters that update the discriminated union
	const setSelectedTile = useCallback(
		(x: number, y: number, tilesetId: string, tileId: number) => {
			setSelection({ type: "tile", tilesetId, tileId, tileX: x, tileY: y });
		},
		[],
	);

	const setSelectedTilesetId = useCallback(
		(id: string | null) => {
			if (id === null) {
				setSelection({ type: "none" });
			} else {
				// Update tileset ID in current selection, or do nothing if already set
				if (selection.type !== "none" && selection.tilesetId !== id) {
					setSelection({ ...selection, tilesetId: id });
				}
				// Note: This doesn't create a new selection - that's done by setSelectedTileId or other setters
			}
		},
		[selection],
	);

	const setSelectedTileId = useCallback(
		(id: number | null) => {
			if (id === null) {
				// Only clear selection if we're currently in tile mode
				if (selection.type === "tile") {
					setSelection({ type: "none" });
				}
			} else {
				// Always update or create tile selection
				if (selection.type === "tile") {
					setSelection({ ...selection, tileId: id });
				} else if (selection.type !== "none") {
					// If we have a tileset selected but not in tile mode, create tile selection
					setSelection({
						type: "tile",
						tilesetId: selection.tilesetId,
						tileId: id,
						tileX: 0,
						tileY: 0,
					});
				} else {
					// No selection yet - this shouldn't happen but handle it gracefully
					console.warn("setSelectedTileId called with no tileset selected");
				}
			}
		},
		[selection],
	);

	const setSelectedEntityDefId = useCallback(
		(tilesetId: string, id: string | null) => {
			if (id === null) {
				setSelection({ type: "none" });
			} else {
				setSelection({ type: "entity", tilesetId, entityDefId: id });
			}
		},
		[],
	);

	const setSelectedTerrainLayerId = useCallback(
		(tilesetId: string, id: string | null) => {
			if (id === null) {
				setSelection({ type: "none" });
			} else {
				setSelection({ type: "terrain", tilesetId, terrainLayerId: id });
			}
		},
		[],
	);

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
		currentLayer,
		setCurrentLayer,
		currentTool,
		setCurrentTool,
		// New selection state
		selection,
		setSelection,
		// Backward compatibility helpers
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
		reorderLayers,
		placeTile,
		eraseTile,
		saveProject,
		saveProjectAs,
		loadProject,
		newProject,
		newMap,
		newTileset,
		newEntity,
		openCollisionEditor,
		saveTileset,
		saveTilesetByTabId,
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
