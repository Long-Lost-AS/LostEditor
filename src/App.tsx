import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { EditorProvider, useEditor } from "./context/EditorContext";
import { Toolbar } from "./components/Toolbar";
import { TabBar } from "./components/TabBar";
import { TilesetPanel } from "./components/TilesetPanel";
import { MapCanvas } from "./components/MapCanvas";
import { LayersPanel } from "./components/LayersPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { ResourceBrowser } from "./components/ResourceBrowser";
import { EntityPanel } from "./components/EntityPanel";
import { TilesetEditorView } from "./components/TilesetEditorView";
import { EntityEditorView } from "./components/EntityEditorView";
import { EmptyState } from "./components/EmptyState";
import { BrokenReferencesModal } from "./components/BrokenReferencesModal";
import { CommandPalette } from "./components/CommandPalette";
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
	const [rightPanelWidth, setRightPanelWidth] = useState(350);
	const [isResizing, setIsResizing] = useState(false);
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartWidth, setDragStartWidth] = useState(0);

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

						if (result.filePaths && result.filePaths[0]) {
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
						const result = await invoke<{ canceled: boolean; filePath?: string }>(
							"show_save_dialog",
							{
								options: {
									title: "Save Project As",
									defaultPath: "untitled.lostproj",
									filters: [
										{ name: "Lost Editor Project", extensions: ["lostproj"] },
									],
								},
							},
						);

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

	// Handle right panel resize drag
	const handleResizeStart = (e: React.MouseEvent) => {
		setIsResizing(true);
		setDragStartX(e.clientX);
		setDragStartWidth(rightPanelWidth);
	};

	useEffect(() => {
		if (!isResizing) return;

		// Disable text selection during resize
		document.body.style.userSelect = "none";
		document.body.style.cursor = "col-resize";

		const handleMouseMove = (e: MouseEvent) => {
			const deltaX = dragStartX - e.clientX; // Negative because we're pulling from the right
			const newWidth = dragStartWidth + deltaX;

			// Constrain width: min 200px, max 50% of window width
			const minWidth = 200;
			const maxWidth = window.innerWidth * 0.5;
			const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

			setRightPanelWidth(constrainedWidth);
		};

		const handleMouseUp = () => {
			setIsResizing(false);
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
	}, [isResizing, dragStartX, dragStartWidth]);

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

	// Global keyboard handler for Shift+Space (toggle ResourceBrowser) and Cmd/Ctrl+P (toggle CommandPalette)
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
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
		};

		document.addEventListener("keydown", handleGlobalKeyDown);
		return () => document.removeEventListener("keydown", handleGlobalKeyDown);
	}, []);

	return (
		<div className="app-container">
			<Toolbar />
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
						<div className="left-panel">
							<PropertiesPanel />
							<EntityPanel />
							<LayersPanel />
						</div>
						<MapCanvas />
						<div
							className={`resize-handle ${isResizing ? "active" : ""}`}
							onMouseDown={handleResizeStart}
						/>
						<div
							className="right-panel"
							style={{ width: `${rightPanelWidth}px` }}
						>
							<TilesetPanel />
						</div>
					</div>
				)}

				{/* Show tileset editor view for tileset tabs */}
				{activeTilesetTab && (
					<div className="editor-top-section">
						<TilesetEditorView tab={activeTilesetTab} />
					</div>
				)}

				{/* Show entity editor view for entity tabs */}
				{activeEntityTab && (
					<div className="editor-top-section">
						<EntityEditorView tab={activeEntityTab} />
					</div>
				)}

				{/* Global ResourceBrowser (Shift+Space to toggle) */}
				{isAssetBrowserOpen && (
					<>
						{/* Resize handle for bottom panel */}
						<div
							className={`h-1 bg-gray-700 hover:bg-blue-500 cursor-row-resize ${isResizingBottom ? "bg-blue-500" : ""}`}
							onMouseDown={handleBottomResizeStart}
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
