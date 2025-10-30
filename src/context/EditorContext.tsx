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
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
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

	// Map state
	mapData: MapData;
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
	selectedTileId: string | null;
	setSelectedTileId: (id: string | null) => void;
	selectedEntityDefId: string | null;
	setSelectedEntityDefId: (id: string | null) => void;

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

	// Tile Actions
	placeTile: (x: number, y: number) => void;
	eraseTile: (x: number, y: number) => void;

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
	newProject: () => void;
	newMap: (directory?: string, fileName?: string) => void;
	newTileset: (directory?: string) => Promise<void>;
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

export const EditorProvider = ({ children }: EditorProviderProps) => {
	const settingsManagerRef = useRef(new SettingsManager());
	const settingsManager = settingsManagerRef.current;

	// Tab state
	const [tabs, setTabs] = useState<AnyTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);

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
	const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
	const [selectedEntityDefId, setSelectedEntityDefId] = useState<string | null>(
		null,
	);

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

	// Sync active map tab to flat state (for backward compatibility)
	useEffect(() => {
		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (activeTab && activeTab.type === "map") {
			const mapTab = activeTab as MapTab;
			setMapData(mapTab.mapData);
			setZoom(mapTab.viewState.zoom);
			setPanX(mapTab.viewState.panX);
			setPanY(mapTab.viewState.panY);
			setGridVisible(mapTab.viewState.gridVisible);
			setCurrentTool(mapTab.viewState.currentTool);
			setSelectedTilesetId(mapTab.viewState.selectedTilesetId);
			setSelectedTileId(mapTab.viewState.selectedTileId);
			setSelectedEntityDefId(mapTab.viewState.selectedEntityDefId);

			// Set current layer
			const layer = mapTab.mapData.layers.find(
				(l) => l.id === mapTab.viewState.currentLayerId,
			);
			setCurrentLayer(layer || mapTab.mapData.layers[0] || null);
		}
	}, [activeTabId, tabs]);

	// Create a wrapped setMapData that also updates the active tab
	const setMapDataAndSyncTab = useCallback(
		(data: MapData | ((prev: MapData) => MapData)) => {
			setMapData((prev) => {
				const newData = typeof data === "function" ? data(prev) : data;

				// Update active map tab
				if (activeTabId) {
					setTabs((currentTabs) =>
						currentTabs.map((tab) => {
							if (tab.id === activeTabId && tab.type === "map") {
								return {
									...tab,
									mapData: newData,
									isDirty: true,
								} as MapTab;
							}
							return tab;
						}),
					);
				}

				return newData;
			});
		},
		[activeTabId],
	);

	const setSelectedTile = useCallback((x: number, y: number) => {
		setSelectedTileX(x);
		setSelectedTileY(y);
	}, []);

	const setPan = useCallback((x: number, y: number) => {
		setPanX(x);
		setPanY(y);
	}, []);

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

			// Update state immutably
			setMapData((prev) => ({
				...prev,
				layers: prev.layers.map((layer) => {
					if (layer.id === currentLayer.id) {
						const newTiles = new Map(layer.tiles);

						// Handle compound tiles (tiles with width and height defined)
						if (
							selectedTileDef &&
							selectedTileDef.width &&
							selectedTileDef.height
						) {
							// Calculate cells from width/height
							const tileWidth = selectedTileset?.tileWidth || 16;
							const tileHeight = selectedTileset?.tileHeight || 16;
							const widthInTiles = Math.ceil(selectedTileDef.width / tileWidth);
							const heightInTiles = Math.ceil(
								selectedTileDef.height / tileHeight,
							);

							// Place all cells of the compound tile
							for (let dy = 0; dy < heightInTiles; dy++) {
								for (let dx = 0; dx < widthInTiles; dx++) {
									if (!selectedTilesetId || !selectedTileId) continue;

									const cellX = x + dx;
									const cellY = y + dy;

									const tile: Tile = {
										x: cellX,
										y: cellY,
										tilesetId: selectedTilesetId,
										tileId: selectedTileId, // Reference to the compound tile definition
										cellX: dx, // Which cell within the compound tile
										cellY: dy,
									};

									newTiles.set(`${cellX},${cellY}`, tile);
								}
							}
						} else if (selectedTilesetId && selectedTileId) {
							// Regular single tile
							const tile: Tile = {
								x,
								y,
								tilesetId: selectedTilesetId,
								tileId: selectedTileId,
							};

							newTiles.set(`${x},${y}`, tile);
						}

						const updatedLayer = { ...layer, tiles: newTiles };
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
						const newTiles = new Map(layer.tiles);
						newTiles.delete(`${x},${y}`);
						const updatedLayer = { ...layer, tiles: newTiles };
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

	// Multi-tileset management functions
	const loadTileset = useCallback(async (filePath: string) => {
		try {
			const tileset = await tilesetManager.loadTileset(filePath, projectDirectory || undefined);
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
	}, [projectDirectory]);

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

			// Save any unsaved tilesets first
			const tilesetPaths: string[] = [];
			for (const tileset of tilesets) {
				if (!tileset.filePath) {
					// Tileset hasn't been saved yet, save it to a .lostset file
					const tilesetFileName = `${tileset.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.lostset`;
					const tilesetFilePath = fileManager.join(projectDir, tilesetFileName);

					// Make imagePath relative to the tileset file location (which is in projectDir)
					const relativeImagePath = fileManager.makeRelativeTo(
						projectDir,
						tileset.imagePath,
					);

					const tilesetJson = JSON.stringify(
						{
							version: tileset.version,
							name: tileset.name,
							id: tileset.id,
							imagePath: relativeImagePath,
							tileWidth: tileset.tileWidth,
							tileHeight: tileset.tileHeight,
							tiles: tileset.tiles,
							entities: tileset.entities,
						},
						null,
						2,
					);

					try {
						await writeTextFile(tilesetFilePath, tilesetJson);
					} catch (error) {
						alert(`Failed to save tileset ${tileset.name}: ${error}`);
						return;
					}

					// Update the tileset with its file path
					tileset.filePath = tilesetFilePath;
					tilesetPaths.push(tilesetFilePath);
				} else {
					tilesetPaths.push(tileset.filePath);
				}
			}

			// Save all map tabs to separate .lostmap files
			const mapPaths: string[] = [];
			for (const tab of tabs) {
				if (tab.type === "map") {
					const mapTab = tab as MapTab;

					// Determine map file path
					let mapFilePath = mapTab.filePath;
					if (!mapFilePath) {
						// No file path yet, create one
						const mapFileName = `${mapTab.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.lostmap`;
						mapFilePath = fileManager.join(mapsDir, mapFileName);
					}

					// Save the map using mapManager
					try {
						await mapManager.saveMap(mapTab.mapData, mapFilePath, mapTab.title);

						// Update the tab with the file path
						mapTab.filePath = mapFilePath;
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
				version: "3.0",
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
		[projectName, tilesets, settingsManager, tabs, activeTabId],
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
				const projectData: ProjectData = JSON.parse(data);

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
							// Load tileset with projectDir directly (state not set yet)
							const tileset = await tilesetManager.loadTileset(tilesetPath, projectDir);
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

					for (const tab of projectData.openTabs.tabs || []) {
						if (tab.type === "map") {
							const mapTab = tab as any; // Saved tab may not have full mapData

							// Load the map from file
							if (mapTab.filePath) {
								try {
									const mapData = await mapManager.loadMap(mapTab.filePath);

									// Create full MapTab with loaded data
									const fullMapTab: MapTab = {
										id: mapTab.id,
										type: "map",
										title: mapTab.title,
										isDirty: mapTab.isDirty || false,
										filePath: mapTab.filePath,
										mapId: mapTab.mapId || mapTab.id,
										mapData: mapData,
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
								restoredTabs.push(tab);
							} else {
								console.warn(
									`Skipping tileset tab: tileset ${tilesetTab.tilesetId} not found`,
								);
							}
						}
					}

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

	const newProject = useCallback(() => {
		setMapData({
			width: 32,
			height: 32,
			tileWidth: 16,
			tileHeight: 16,
			layers: [],
		});
		setCurrentLayer(null);
		setTilesetImage(null);
		setTilesetPath(null);
		setCurrentProjectPath(null);
		setProjectName("Untitled");
		setProjectModified(false);
		setProjectDirectory(null);
	}, []);

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

			const newMapTab: MapTab = {
				id: mapId,
				type: "map",
				title: title,
				isDirty: true, // Mark as dirty since it's unsaved
				mapId: mapId,
				filePath: filePath,
				mapData: {
					width: 32,
					height: 32,
					tileWidth: 16,
					tileHeight: 16,
					layers: [],
				},
				viewState: {
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
				const newMapTab: MapTab = {
					id: mapId,
					type: "map",
					title: mapName,
					isDirty: false,
					filePath: filePath,
					mapId: mapId,
					mapData: mapData,
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
					tileset = await tilesetManager.loadTileset(filePath, projectDirectory || undefined);
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
			await tilesetManager.saveTileset(tileset, targetPath, projectDirectory || undefined);

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
				await tilesetManager.saveTileset(tileset, tileset.filePath, projectDirectory || undefined);

				// Mark the tab as not dirty
				updateTabData(tab.id, { isDirty: false });

				console.log(`Saved tileset: ${tileset.filePath}`);
			} catch (error) {
				console.error(`Failed to save tileset ${tileset.name}:`, error);
				alert(`Failed to save tileset ${tileset.name}: ${error}`);
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
		mapData,
		setMapData: setMapDataAndSyncTab,
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
		setZoom,
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
		placeTile,
		eraseTile,
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
		saveTileset,
		saveAll,
		projectDirectory,
		openMapFromFile,
		openTilesetFromFile,
		brokenReferencesModalData,
		setBrokenReferencesModalData,
	};

	return (
		<EditorContext.Provider value={value}>{children}</EditorContext.Provider>
	);
};
