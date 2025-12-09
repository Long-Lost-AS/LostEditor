import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { BrokenReferencesModal } from "./components/BrokenReferencesModal";
import { CollisionEditorView } from "./components/CollisionEditorView";
import { CommandPalette } from "./components/CommandPalette";
import { EmptyState } from "./components/EmptyState";
import { EntityEditorView } from "./components/EntityEditorView";
import { EntitySelectMenu } from "./components/EntitySelectMenu";
import { MapEditorView } from "./components/MapEditorView";
import { ResourceBrowser } from "./components/ResourceBrowser";
import { TabBar } from "./components/TabBar";
import { TerrainLayerPickerModal } from "./components/TerrainLayerPickerModal";
import { TilePickerModal } from "./components/TilePickerModal";
import { TilesetEditorView } from "./components/TilesetEditorView";
import { TilesetSelectMenu } from "./components/TilesetSelectMenu";
import { EditorProvider, useEditor } from "./context/EditorContext";
import { UndoRedoProvider } from "./context/UndoRedoContext";
import { entityManager } from "./managers/EntityManager";
import type { CollisionEditorTab } from "./types";
import { isEditableElementFocused } from "./utils/keyboardUtils";
import { exportMapToPng } from "./utils/mapExport";
import { testUpdaterConfiguration } from "./utils/testUpdater";
import { checkForUpdates } from "./utils/updater";
import "./style.css";

const AppContent = () => {
	const {
		tabs,
		activeTabId,
		closeTab,
		setActiveTab,
		openTab,
		getActiveMapTab,
		getActiveTilesetTab,
		getActiveEntityTab,
		getMapById,
		tilesets,
		newProject,
		newMap,
		newTileset,
		newEntity,
		loadProject,
		saveProject,
		saveProjectAs,
		loadTileset,
		saveTileset,
		saveAll,
		brokenReferencesModalData,
	} = useEditor();

	const [isAssetBrowserOpen, setIsAssetBrowserOpen] = useState(true);
	const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
	const [isEntitySelectMenuOpen, setIsEntitySelectMenuOpen] = useState(false);
	const [isTilesetSelectMenuOpen, setIsTilesetSelectMenuOpen] = useState(false);
	const [isTilePickerOpen, setIsTilePickerOpen] = useState(false);
	const [isTerrainPickerOpen, setIsTerrainPickerOpen] = useState(false);

	// Bottom panel resize state
	const [bottomPanelHeight, setBottomPanelHeight] = useState(250);
	const [isResizingBottom, setIsResizingBottom] = useState(false);
	const [dragStartY, setDragStartY] = useState(0);
	const [dragStartHeight, setDragStartHeight] = useState(0);

	// Use refs to store the latest function references
	const newProjectRef = useRef(newProject);
	const newMapRef = useRef(newMap);
	const newTilesetRef = useRef(newTileset);
	const newEntityRef = useRef(newEntity);
	const loadProjectRef = useRef(loadProject);
	const saveProjectRef = useRef(saveProject);
	const saveProjectAsRef = useRef(saveProjectAs);
	const loadTilesetRef = useRef(loadTileset);
	const openTabRef = useRef(openTab);
	const saveTilesetRef = useRef(saveTileset);
	const saveAllRef = useRef(saveAll);
	const getActiveTilesetTabRef = useRef(getActiveTilesetTab);
	const getActiveMapTabRef = useRef(getActiveMapTab);
	const getMapByIdRef = useRef(getMapById);
	const tilesetsRef = useRef(tilesets);

	useEffect(() => {
		newProjectRef.current = newProject;
		newMapRef.current = newMap;
		newTilesetRef.current = newTileset;
		newEntityRef.current = newEntity;
		loadProjectRef.current = loadProject;
		saveProjectRef.current = saveProject;
		saveProjectAsRef.current = saveProjectAs;
		loadTilesetRef.current = loadTileset;
		openTabRef.current = openTab;
		saveTilesetRef.current = saveTileset;
		saveAllRef.current = saveAll;
		getActiveTilesetTabRef.current = getActiveTilesetTab;
		getActiveMapTabRef.current = getActiveMapTab;
		getMapByIdRef.current = getMapById;
		tilesetsRef.current = tilesets;
	}, [
		newProject,
		newMap,
		newTileset,
		newEntity,
		loadProject,
		saveProject,
		saveProjectAs,
		loadTileset,
		openTab,
		saveTileset,
		saveAll,
		getActiveTilesetTab,
		getActiveMapTab,
		getMapById,
		tilesets,
	]);

	useEffect(() => {
		// Set up menu event listeners
		let mounted = true;
		const unlisteners: Array<() => void> = [];

		// Guards to prevent duplicate simultaneous executions
		let isOpeningProject = false;
		let isSavingProjectAs = false;

		// Setup all listeners
		const setupListeners = async () => {
			try {
				// New Project
				const unlisten1 = await listen("menu:new-project", () => {
					if (!mounted) return;
					newProjectRef.current();
				});
				if (mounted) unlisteners.push(unlisten1);

				// Open Project - show dialog then load
				const unlisten2 = await listen("menu:open-project", async () => {
					if (!mounted || isOpeningProject) return;
					isOpeningProject = true;

					try {
						const result = await invoke<{
							canceled: boolean;
							filePaths?: string[];
						}>("show_open_dialog", {
							options: {
								title: "Open Project",
								filters: [
									{ name: "Lost Editor Project", extensions: ["lostproj"] },
								],
								properties: ["openFile"],
							},
						});

						if (result.filePaths?.[0]) {
							await loadProjectRef.current(result.filePaths[0]);
						}
					} finally {
						isOpeningProject = false;
					}
				});
				if (mounted) unlisteners.push(unlisten2);

				// Load recent project - no dialog, just load
				const unlisten3 = await listen<string>("auto-load-project", (event) => {
					if (!mounted) return;
					if (event.payload) {
						loadProjectRef.current(event.payload);
					}
				});
				if (mounted) unlisteners.push(unlisten3);

				const unlisten4 = await listen<string>(
					"menu:load-recent-project",
					(event) => {
						if (!mounted) return;
						if (event.payload) {
							loadProjectRef.current(event.payload);
						}
					},
				);
				if (mounted) unlisteners.push(unlisten4);

				// Save All (triggered by Ctrl+S accelerator)
				const unlisten5 = await listen("menu:save-project", async () => {
					if (!mounted) return;
					await saveAllRef.current();
				});
				if (mounted) unlisteners.push(unlisten5);

				// Save Project As - show dialog then save
				const unlisten6 = await listen("menu:save-project-as", async () => {
					if (!mounted || isSavingProjectAs) return;
					isSavingProjectAs = true;

					try {
						const result = await invoke<{
							canceled: boolean;
							filePath?: string;
						}>("show_save_dialog", {
							options: {
								title: "Save Project As",
								defaultPath: "untitled.lostproj",
								filters: [
									{ name: "Lost Editor Project", extensions: ["lostproj"] },
								],
							},
						});

						if (result.filePath) {
							await saveProjectAsRef.current(result.filePath);
						}
					} finally {
						isSavingProjectAs = false;
					}
				});
				if (mounted) unlisteners.push(unlisten6);

				// New Tileset - create and open in tab
				const unlisten7 = await listen("menu:new-tileset", async () => {
					if (!mounted) return;
					await newTilesetRef.current();
				});
				if (mounted) unlisteners.push(unlisten7);

				// New Map - create new map tab
				const unlisten8 = await listen("menu:new-map", () => {
					if (!mounted) return;
					newMapRef.current();
				});
				if (mounted) unlisteners.push(unlisten8);

				// New Entity - create and open in tab
				const unlisten9 = await listen("menu:new-entity", () => {
					if (!mounted) return;
					newEntityRef.current();
				});
				if (mounted) unlisteners.push(unlisten9);

				// Note: Load Tileset removed - tilesets auto-load from project file
				const unlisten10 = await listen("menu:load-tileset", async () => {
					// No-op: Tilesets are automatically loaded from project
				});
				if (mounted) unlisteners.push(unlisten10);

				// Export Map as PNG
				const unlisten12 = await listen("menu:export-map-png", async () => {
					if (!mounted) return;

					// Get active map
					const mapTab = getActiveMapTabRef.current();
					if (!mapTab) {
						alert("No map is currently open");
						return;
					}

					const map = getMapByIdRef.current(mapTab.mapId);
					if (!map) {
						alert("Could not find map data");
						return;
					}

					// Export to PNG
					const result = exportMapToPng({
						map,
						tilesets: tilesetsRef.current,
						entityDefs: entityManager.getAllEntities(),
					});

					if (!result) {
						alert("Map is empty - nothing to export");
						return;
					}

					// Show save dialog
					const saveResult = await invoke<{
						canceled: boolean;
						filePath?: string;
					}>("show_save_dialog", {
						options: {
							title: "Export Map as PNG",
							defaultPath: `${map.name || "map"}.png`,
							filters: [{ name: "PNG Image", extensions: ["png"] }],
						},
					});

					if (saveResult.filePath) {
						try {
							// Get PNG as base64 data URL and extract the base64 part
							const dataUrl = result.toDataURL();
							const base64Data = dataUrl.replace(
								/^data:image\/png;base64,/,
								"",
							);

							// Decode base64 to binary and write file
							const binaryStr = atob(base64Data);
							const bytes = new Uint8Array(binaryStr.length);
							for (let i = 0; i < binaryStr.length; i++) {
								bytes[i] = binaryStr.charCodeAt(i);
							}

							// Use Tauri FS plugin to write binary file
							const { writeFile } = await import("@tauri-apps/plugin-fs");
							await writeFile(saveResult.filePath, bytes);

							alert(
								`Exported ${result.width}x${result.height} PNG to:\n${saveResult.filePath}`,
							);
						} catch (error) {
							console.error("Failed to save PNG:", error);
							alert(`Failed to save PNG: ${error}`);
						}
					}
				});
				if (mounted) unlisteners.push(unlisten12);

				// Check for Updates
				const unlisten11 = await listen("menu:check-for-updates", async () => {
					if (!mounted) return;
					await checkForUpdates();
				});
				if (mounted) unlisteners.push(unlisten11);

				// Check for updates on startup (silently, no dialog if no update)
				setTimeout(() => {
					if (mounted) {
						checkForUpdates(false).catch(console.error);
					}
				}, 5000); // Wait 5 seconds after startup
			} catch (error) {
				console.error("Error setting up listeners:", error);
			}
		};

		setupListeners();

		// Cleanup listeners on unmount
		return () => {
			mounted = false;
			unlisteners.forEach((unlisten) => {
				try {
					unlisten();
				} catch (error) {
					console.error("Error cleaning up listener:", error);
				}
			});
		};
	}, []);

	const activeMapTab = getActiveMapTab();
	const activeTilesetTab = getActiveTilesetTab();
	const activeEntityTab = getActiveEntityTab();
	const activeCollisionTab = tabs.find(
		(tab) => tab.type === "collision-editor" && tab.id === activeTabId,
	) as CollisionEditorTab | undefined;

	// Handle bottom panel resize drag
	const handleBottomResizeStart = (e: React.MouseEvent) => {
		e.preventDefault(); // Prevent text selection
		setIsResizingBottom(true);
		setDragStartY(e.clientY);
		setDragStartHeight(bottomPanelHeight);
	};

	useEffect(() => {
		if (!isResizingBottom) return;

		// Disable text selection during resize
		document.body.style.userSelect = "none";
		document.body.style.cursor = "row-resize";

		const handleMouseMove = (e: MouseEvent) => {
			const deltaY = dragStartY - e.clientY; // Positive means dragging up (making panel taller)
			const newHeight = dragStartHeight + deltaY;

			// Constrain height: min 150px, max 70% of window height
			const minHeight = 150;
			const maxHeight = window.innerHeight * 0.7;
			const constrainedHeight = Math.max(
				minHeight,
				Math.min(maxHeight, newHeight),
			);

			setBottomPanelHeight(constrainedHeight);
		};

		const handleMouseUp = () => {
			setIsResizingBottom(false);
			// Re-enable text selection
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			// Ensure text selection is re-enabled on cleanup
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};
	}, [isResizingBottom, dragStartY, dragStartHeight]);

	// Global keyboard handler for Shift+Space (toggle ResourceBrowser), Cmd/Ctrl+P (toggle CommandPalette), Cmd/Ctrl+E (toggle EntitySelectMenu), and Cmd/Ctrl+T (toggle TilesetSelectMenu)
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			// Don't intercept shortcuts when user is typing in an input field
			if (isEditableElementFocused(e)) {
				return;
			}

			// Shift+Space - Toggle ResourceBrowser
			if (
				e.shiftKey &&
				e.code === "Space" &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey
			) {
				e.preventDefault();
				setIsAssetBrowserOpen((prev) => !prev);
			}

			// Cmd/Ctrl+P - Toggle CommandPalette
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key === "p" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				setIsCommandPaletteOpen((prev) => !prev);
			}

			// Cmd/Ctrl+E - Toggle EntitySelectMenu
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key === "e" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				setIsEntitySelectMenuOpen((prev) => !prev);
			}

			// Cmd/Ctrl+T - Toggle TilesetSelectMenu
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key === "t" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				setIsTilesetSelectMenuOpen((prev) => !prev);
			}

			// Cmd/Ctrl+G - Toggle TilePickerModal
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key === "g" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				setIsTilePickerOpen((prev) => !prev);
			}

			// Cmd/Ctrl+L - Toggle TerrainLayerPickerModal
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key === "l" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				setIsTerrainPickerOpen((prev) => !prev);
			}

			// Cmd/Ctrl+Shift+U - Test Updater Configuration (debug only)
			if (
				(e.ctrlKey || e.metaKey) &&
				e.shiftKey &&
				e.key === "U" &&
				!e.altKey
			) {
				e.preventDefault();
				testUpdaterConfiguration();
			}
		};

		document.addEventListener("keydown", handleGlobalKeyDown);
		return () => document.removeEventListener("keydown", handleGlobalKeyDown);
	}, []);

	return (
		<div className="app-container">
			<TabBar
				tabs={tabs}
				activeTabId={activeTabId}
				onTabClick={setActiveTab}
				onTabClose={closeTab}
			/>
			<div className="main-container">
				{/* Show empty state when no tabs are open */}
				{tabs.length === 0 && <EmptyState />}

				{/* Show map editor view for map tabs */}
				{activeMapTab && (
					<div className="editor-top-section">
						<UndoRedoProvider>
							<MapEditorView
								key={activeMapTab.id}
								tab={activeMapTab}
								onOpenEntitySelect={() => setIsEntitySelectMenuOpen(true)}
								onOpenTilesetSelect={() => setIsTilesetSelectMenuOpen(true)}
								onOpenTilePicker={() => setIsTilePickerOpen(true)}
								onOpenTerrainPicker={() => setIsTerrainPickerOpen(true)}
							/>
						</UndoRedoProvider>
					</div>
				)}

				{/* Show tileset editor view for tileset tabs */}
				{activeTilesetTab && (
					<div className="editor-top-section">
						<UndoRedoProvider>
							<TilesetEditorView
								key={activeTilesetTab.id}
								tab={activeTilesetTab}
							/>
						</UndoRedoProvider>
					</div>
				)}

				{/* Show entity editor view for entity tabs */}
				{activeEntityTab && (
					<div className="editor-top-section">
						<UndoRedoProvider>
							<EntityEditorView
								key={activeEntityTab.id}
								tab={activeEntityTab}
							/>
						</UndoRedoProvider>
					</div>
				)}

				{/* Show collision editor view for collision editor tabs */}
				{activeCollisionTab && (
					<div className="editor-top-section">
						<UndoRedoProvider>
							<CollisionEditorView
								key={activeCollisionTab.id}
								tab={activeCollisionTab}
							/>
						</UndoRedoProvider>
					</div>
				)}

				{/* Global ResourceBrowser (Shift+Space to toggle) */}
				{isAssetBrowserOpen && (
					<>
						{/* Resize handle for bottom panel */}
						<div
							className={`h-1 bg-gray-700 hover:bg-blue-500 cursor-row-resize ${isResizingBottom ? "bg-blue-500" : ""}`}
							onMouseDown={handleBottomResizeStart}
							role="separator"
							aria-orientation="horizontal"
							aria-valuenow={bottomPanelHeight}
							aria-valuemin={100}
							aria-valuemax={window.innerHeight - 100}
							tabIndex={0}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
								}
							}}
						/>
						<div
							className="bottom-panel"
							style={{ height: `${bottomPanelHeight}px` }}
						>
							<ResourceBrowser onClose={() => setIsAssetBrowserOpen(false)} />
						</div>
					</>
				)}
				{!isAssetBrowserOpen && tabs.length > 0 && (
					<div className="bottom-panel-collapsed">
						<button
							type="button"
							onClick={() => setIsAssetBrowserOpen(true)}
							className="panel-expand-btn"
							title="Open Assets Panel (Shift+Space)"
						>
							Assets ▲
						</button>
					</div>
				)}
			</div>

			{/* Broken References Modal */}
			{brokenReferencesModalData && (
				<BrokenReferencesModal
					references={brokenReferencesModalData.references}
					projectDir={brokenReferencesModalData.projectDir}
					onClose={brokenReferencesModalData.onCancel}
					onContinue={brokenReferencesModalData.onContinue}
				/>
			)}

			{/* Command Palette (Cmd/Ctrl+P) */}
			<CommandPalette
				isOpen={isCommandPaletteOpen}
				onClose={() => setIsCommandPaletteOpen(false)}
			/>

			{/* Entity Select Menu (Cmd/Ctrl+E) */}
			<EntitySelectMenu
				isOpen={isEntitySelectMenuOpen}
				onClose={() => setIsEntitySelectMenuOpen(false)}
			/>

			{/* Tileset Select Menu (Cmd/Ctrl+T) */}
			<TilesetSelectMenu
				isOpen={isTilesetSelectMenuOpen}
				onClose={() => setIsTilesetSelectMenuOpen(false)}
			/>

			{/* Tile Picker Modal */}
			<TilePickerModal
				isOpen={isTilePickerOpen}
				onClose={() => setIsTilePickerOpen(false)}
			/>

			{/* Terrain Layer Picker Modal */}
			<TerrainLayerPickerModal
				isOpen={isTerrainPickerOpen}
				onClose={() => setIsTerrainPickerOpen(false)}
			/>
		</div>
	);
};

export const App = () => {
	return (
		<EditorProvider>
			<AppContent />
		</EditorProvider>
	);
};
