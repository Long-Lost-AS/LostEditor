import "./style.css";
import { SettingsManager } from "./settings";

// Types
interface ProjectData {
	version: string;
	name: string;
	tilesetPath: string;
	tilesetImageData?: string; // base64 data URL
	mapData: MapData;
	lastModified: string;
}

interface Tile {
	x: number;
	y: number;
	tilesetX: number;
	tilesetY: number;
}

interface Layer {
	id: string;
	name: string;
	visible: boolean;
	tiles: Map<string, Tile>;
}

interface MapData {
	width: number;
	height: number;
	tileWidth: number;
	tileHeight: number;
	layers: Layer[];
}

type Tool = "pencil" | "eraser" | "fill" | "rect";

// State
let mapData: MapData = {
	width: 32,
	height: 32,
	tileWidth: 16,
	tileHeight: 16,
	layers: [],
};

let currentLayer: Layer | null = null;
let currentTool: Tool = "pencil";
let selectedTileX = 0;
let selectedTileY = 0;
let tilesetImage: HTMLImageElement | null = null;
let tilesetCols = 0;
let tilesetRows = 0;

let zoom = 2;
let panX = 0;
let panY = 0;
let isDragging = false;
let isDrawing = false;
let dragStartX = 0;
let dragStartY = 0;
let rectStartX = -1;
let rectStartY = -1;

// Touch state
let touches: Touch[] = [];
let initialPinchDistance = 0;
let initialZoom = 1;
let lastTouchCenterX = 0;
let lastTouchCenterY = 0;

// Project state
let currentProjectPath: string | null = null;
let projectModified = false;
let projectName = "Untitled";
let tilesetPath: string | null = null;
let autoSaveIntervalId: number | null = null;

// Settings
const settingsManager = new SettingsManager();
let gridVisible = true;

// Canvas elements
const mapCanvas = document.getElementById("map-canvas") as HTMLCanvasElement;
const mapCtx = mapCanvas.getContext("2d")!;
const tilesetCanvas = document.getElementById(
	"tileset-canvas",
) as HTMLCanvasElement;
const tilesetCtx = tilesetCanvas.getContext("2d")!;

// Initialize
init();

async function init() {
	// Load settings
	await loadSettings();

	// Apply default settings to map
	const settings = settingsManager.getSettings();
	mapData.width = settings.defaultMapWidth;
	mapData.height = settings.defaultMapHeight;
	mapData.tileWidth = settings.defaultTileWidth;
	mapData.tileHeight = settings.defaultTileHeight;
	gridVisible = settings.gridVisible;

	// Create default layer
	addLayer("Layer 1");

	// Set up canvas
	updateMapCanvas();

	// Tool buttons
	document
		.getElementById("tool-pencil")
		?.addEventListener("click", () => selectTool("pencil"));
	document
		.getElementById("tool-eraser")
		?.addEventListener("click", () => selectTool("eraser"));
	document
		.getElementById("tool-fill")
		?.addEventListener("click", () => selectTool("fill"));
	document
		.getElementById("tool-rect")
		?.addEventListener("click", () => selectTool("rect"));

	// Tileset
	document
		.getElementById("load-tileset")
		?.addEventListener("click", loadTileset);
	document.getElementById("save-project-btn")?.addEventListener("click", () => {
		console.log("Save button clicked!");
		saveProject();
	});
	tilesetCanvas.addEventListener("click", handleTilesetClick);

	// Map canvas events
	mapCanvas.addEventListener("mousedown", handleMapMouseDown);
	mapCanvas.addEventListener("mousemove", handleMapMouseMove);
	mapCanvas.addEventListener("mouseup", handleMapMouseUp);
	mapCanvas.addEventListener("wheel", handleWheel);

	// Touch events
	mapCanvas.addEventListener("touchstart", handleTouchStart, {
		passive: false,
	});
	mapCanvas.addEventListener("touchmove", handleTouchMove, { passive: false });
	mapCanvas.addEventListener("touchend", handleTouchEnd);

	// Layer controls
	document.getElementById("add-layer")?.addEventListener("click", () => {
		const layerNum = mapData.layers.length + 1;
		addLayer(`Layer ${layerNum}`);
	});
	document
		.getElementById("remove-layer")
		?.addEventListener("click", removeCurrentLayer);

	// Properties
	document
		.getElementById("apply-properties")
		?.addEventListener("click", applyProperties);

	// Menu events
	if (typeof window.electron !== "undefined") {
		window.electron.onMenuNewProject(() => {
			console.log("Menu: New Project");
			newProject();
		});
		window.electron.onMenuSaveProject(() => {
			console.log("Menu: Save Project triggered");
			saveProject();
		});
		window.electron.onMenuSaveProjectAs((_event: any, filePath: string) => {
			console.log("Menu: Save Project As", filePath);
			saveProjectAs(filePath);
		});
		window.electron.onMenuOpenProject((_event: any, filePath: string) => {
			console.log("Menu: Open Project", filePath);
			loadProject(filePath);
		});
		window.electron.onAutoLoadProject((_event: any, filePath: string) => {
			console.log("Auto-load Project", filePath);
			loadProject(filePath);
		});
	} else {
		console.warn("Electron API not available");
	}

	// Set up auto-save
	setupAutoSave();

	render();
}

function selectTool(tool: Tool) {
	currentTool = tool;
	document
		.querySelectorAll(".tool-btn")
		.forEach((btn) => btn.classList.remove("active"));
	document.getElementById(`tool-${tool}`)?.classList.add("active");
}

function addLayer(name: string) {
	const layer: Layer = {
		id: Math.random().toString(36).substr(2, 9),
		name,
		visible: true,
		tiles: new Map(),
	};
	mapData.layers.push(layer);
	currentLayer = layer;
	updateLayersList();
}

function removeCurrentLayer() {
	if (!currentLayer || mapData.layers.length <= 1) return;

	const index = mapData.layers.findIndex((l) => l.id === currentLayer!.id);
	if (index !== -1) {
		mapData.layers.splice(index, 1);
		currentLayer = mapData.layers[Math.min(index, mapData.layers.length - 1)];
		updateLayersList();
		render();
	}
}

function updateLayersList() {
	const list = document.getElementById("layers-list")!;
	list.innerHTML = "";

	// Reverse order for display (top layer first)
	for (let i = mapData.layers.length - 1; i >= 0; i--) {
		const layer = mapData.layers[i];
		const item = document.createElement("div");
		item.className = "layer-item";
		if (layer.id === currentLayer?.id) {
			item.classList.add("active");
		}

		const nameSpan = document.createElement("span");
		nameSpan.textContent = layer.name;
		item.appendChild(nameSpan);

		item.addEventListener("click", () => {
			currentLayer = layer;
			updateLayersList();
		});

		list.appendChild(item);
	}
}

function loadTileset() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "image/*";
	input.onchange = (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				tilesetImage = img;
				tilesetCols = Math.floor(img.width / mapData.tileWidth);
				tilesetRows = Math.floor(img.height / mapData.tileHeight);

				tilesetCanvas.width = img.width;
				tilesetCanvas.height = img.height;
				tilesetCtx.drawImage(img, 0, 0);

				// Draw grid
				tilesetCtx.strokeStyle = "rgba(255, 255, 0, 0.3)";
				tilesetCtx.lineWidth = 1;
				for (let x = 0; x <= tilesetCols; x++) {
					tilesetCtx.beginPath();
					tilesetCtx.moveTo(x * mapData.tileWidth, 0);
					tilesetCtx.lineTo(x * mapData.tileWidth, img.height);
					tilesetCtx.stroke();
				}
				for (let y = 0; y <= tilesetRows; y++) {
					tilesetCtx.beginPath();
					tilesetCtx.moveTo(0, y * mapData.tileHeight);
					tilesetCtx.lineTo(img.width, y * mapData.tileHeight);
					tilesetCtx.stroke();
				}
			};
			img.src = event.target?.result as string;
		};
		reader.readAsDataURL(file);
	};
	input.click();
}

function redrawTileset() {
	if (!tilesetImage) return;

	tilesetCtx.clearRect(0, 0, tilesetCanvas.width, tilesetCanvas.height);
	tilesetCtx.drawImage(tilesetImage, 0, 0);

	// Draw grid
	tilesetCtx.strokeStyle = "rgba(255, 255, 0, 0.3)";
	tilesetCtx.lineWidth = 1;
	for (let x = 0; x <= tilesetCols; x++) {
		tilesetCtx.beginPath();
		tilesetCtx.moveTo(x * mapData.tileWidth, 0);
		tilesetCtx.lineTo(x * mapData.tileWidth, tilesetImage.height);
		tilesetCtx.stroke();
	}
	for (let y = 0; y <= tilesetRows; y++) {
		tilesetCtx.beginPath();
		tilesetCtx.moveTo(0, y * mapData.tileHeight);
		tilesetCtx.lineTo(tilesetImage.width, y * mapData.tileHeight);
		tilesetCtx.stroke();
	}

	// Highlight selection
	tilesetCtx.strokeStyle = "rgba(0, 255, 0, 0.8)";
	tilesetCtx.lineWidth = 2;
	tilesetCtx.strokeRect(
		selectedTileX * mapData.tileWidth,
		selectedTileY * mapData.tileHeight,
		mapData.tileWidth,
		mapData.tileHeight,
	);
}

function handleTilesetClick(e: MouseEvent) {
	if (!tilesetImage) return;

	const rect = tilesetCanvas.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const y = e.clientY - rect.top;

	selectedTileX = Math.floor(x / mapData.tileWidth);
	selectedTileY = Math.floor(y / mapData.tileHeight);

	redrawTileset();
}

function handleMapMouseDown(e: MouseEvent) {
	const rect = mapCanvas.getBoundingClientRect();
	const x = Math.floor(
		(e.clientX - rect.left - panX) / (mapData.tileWidth * zoom),
	);
	const y = Math.floor(
		(e.clientY - rect.top - panY) / (mapData.tileHeight * zoom),
	);

	if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
		// Middle mouse or Shift+Left for panning
		isDragging = true;
		dragStartX = e.clientX - panX;
		dragStartY = e.clientY - panY;
		mapCanvas.style.cursor = "grabbing";
	} else if (e.button === 0) {
		// Left mouse for drawing
		isDrawing = true;

		if (currentTool === "rect") {
			rectStartX = x;
			rectStartY = y;
		} else if (currentTool === "fill") {
			floodFill(x, y);
		} else {
			paintTile(x, y);
		}
	}
}

function handleMapMouseMove(e: MouseEvent) {
	if (isDragging) {
		panX = e.clientX - dragStartX;
		panY = e.clientY - dragStartY;
		render();
	} else if (isDrawing && currentTool !== "rect" && currentTool !== "fill") {
		const rect = mapCanvas.getBoundingClientRect();
		const x = Math.floor(
			(e.clientX - rect.left - panX) / (mapData.tileWidth * zoom),
		);
		const y = Math.floor(
			(e.clientY - rect.top - panY) / (mapData.tileHeight * zoom),
		);
		paintTile(x, y);
	}
}

function handleMapMouseUp(e: MouseEvent) {
	if (isDragging) {
		isDragging = false;
		mapCanvas.style.cursor = "crosshair";
	} else if (isDrawing && currentTool === "rect") {
		const rect = mapCanvas.getBoundingClientRect();
		const x = Math.floor(
			(e.clientX - rect.left - panX) / (mapData.tileWidth * zoom),
		);
		const y = Math.floor(
			(e.clientY - rect.top - panY) / (mapData.tileHeight * zoom),
		);

		if (rectStartX !== -1 && rectStartY !== -1) {
			paintRectangle(rectStartX, rectStartY, x, y);
			rectStartX = -1;
			rectStartY = -1;
		}
	}
	isDrawing = false;
}

function handleWheel(e: WheelEvent) {
	e.preventDefault();

	// Check if this is a pinch gesture (ctrlKey is set on macOS trackpad pinch)
	if (e.ctrlKey) {
		// Pinch to zoom - use smaller delta for smoother control
		const delta = -e.deltaY * 0.01;
		const newZoom = Math.max(0.5, Math.min(8, zoom + delta));

		if (newZoom !== zoom) {
			zoom = newZoom;
			render();
		}
	} else {
		// Two-finger scroll to pan
		panX -= e.deltaX;
		panY -= e.deltaY;
		render();
	}
}

function handleTouchStart(e: TouchEvent) {
	e.preventDefault();
	touches = Array.from(e.touches);

	if (touches.length === 2) {
		// Two finger gesture - initialize pinch/pan
		const dx = touches[1].clientX - touches[0].clientX;
		const dy = touches[1].clientY - touches[0].clientY;
		initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
		initialZoom = zoom;
		lastTouchCenterX = (touches[0].clientX + touches[1].clientX) / 2;
		lastTouchCenterY = (touches[0].clientY + touches[1].clientY) / 2;
	} else if (touches.length === 1) {
		// Single finger - drawing
		const rect = mapCanvas.getBoundingClientRect();
		const x = Math.floor(
			(touches[0].clientX - rect.left - panX) / (mapData.tileWidth * zoom),
		);
		const y = Math.floor(
			(touches[0].clientY - rect.top - panY) / (mapData.tileHeight * zoom),
		);

		isDrawing = true;
		if (currentTool === "rect") {
			rectStartX = x;
			rectStartY = y;
		} else if (currentTool === "fill") {
			floodFill(x, y);
		} else {
			paintTile(x, y);
		}
	}
}

function handleTouchMove(e: TouchEvent) {
	e.preventDefault();
	const currentTouches = Array.from(e.touches);

	if (currentTouches.length === 2 && touches.length === 2) {
		// Two finger pan and pinch
		const dx = currentTouches[1].clientX - currentTouches[0].clientX;
		const dy = currentTouches[1].clientY - currentTouches[0].clientY;
		const currentDistance = Math.sqrt(dx * dx + dy * dy);

		// Calculate pan based on center point movement
		const currentCenterX =
			(currentTouches[0].clientX + currentTouches[1].clientX) / 2;
		const currentCenterY =
			(currentTouches[0].clientY + currentTouches[1].clientY) / 2;

		const deltaX = currentCenterX - lastTouchCenterX;
		const deltaY = currentCenterY - lastTouchCenterY;

		panX += deltaX;
		panY += deltaY;

		// Calculate pinch zoom only if distance change is significant (threshold of 10 pixels)
		if (initialPinchDistance > 0) {
			const distanceChange = Math.abs(currentDistance - initialPinchDistance);
			if (distanceChange > 10) {
				const scale = currentDistance / initialPinchDistance;
				const newZoom = Math.max(0.5, Math.min(8, initialZoom * scale));
				zoom = newZoom;
			}
		}

		// Update last center for next move event
		lastTouchCenterX = currentCenterX;
		lastTouchCenterY = currentCenterY;

		touches = currentTouches;
		render();
	} else if (
		currentTouches.length === 1 &&
		isDrawing &&
		currentTool !== "rect" &&
		currentTool !== "fill"
	) {
		// Single finger drawing
		const rect = mapCanvas.getBoundingClientRect();
		const x = Math.floor(
			(currentTouches[0].clientX - rect.left - panX) /
				(mapData.tileWidth * zoom),
		);
		const y = Math.floor(
			(currentTouches[0].clientY - rect.top - panY) /
				(mapData.tileHeight * zoom),
		);
		paintTile(x, y);
	}
}

function handleTouchEnd(e: TouchEvent) {
	e.preventDefault();

	if (isDrawing && currentTool === "rect" && e.changedTouches.length > 0) {
		const rect = mapCanvas.getBoundingClientRect();
		const touch = e.changedTouches[0];
		const x = Math.floor(
			(touch.clientX - rect.left - panX) / (mapData.tileWidth * zoom),
		);
		const y = Math.floor(
			(touch.clientY - rect.top - panY) / (mapData.tileHeight * zoom),
		);

		if (rectStartX !== -1 && rectStartY !== -1) {
			paintRectangle(rectStartX, rectStartY, x, y);
			rectStartX = -1;
			rectStartY = -1;
		}
	}

	isDrawing = false;
	touches = Array.from(e.touches);

	if (touches.length < 2) {
		initialPinchDistance = 0;
	}
}

function paintTile(x: number, y: number) {
	if (
		!currentLayer ||
		x < 0 ||
		y < 0 ||
		x >= mapData.width ||
		y >= mapData.height
	)
		return;

	const key = `${x},${y}`;

	if (currentTool === "eraser") {
		currentLayer.tiles.delete(key);
		markModified();
	} else if (tilesetImage) {
		currentLayer.tiles.set(key, {
			x,
			y,
			tilesetX: selectedTileX,
			tilesetY: selectedTileY,
		});
		markModified();
	}

	render();
}

function paintRectangle(x1: number, y1: number, x2: number, y2: number) {
	const minX = Math.max(0, Math.min(x1, x2));
	const maxX = Math.min(mapData.width - 1, Math.max(x1, x2));
	const minY = Math.max(0, Math.min(y1, y2));
	const maxY = Math.min(mapData.height - 1, Math.max(y1, y2));

	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			paintTile(x, y);
		}
	}
}

function floodFill(startX: number, startY: number) {
	if (!currentLayer || !tilesetImage) return;
	if (
		startX < 0 ||
		startY < 0 ||
		startX >= mapData.width ||
		startY >= mapData.height
	)
		return;

	const startKey = `${startX},${startY}`;
	const startTile = currentLayer.tiles.get(startKey);
	const targetTileX = startTile?.tilesetX ?? -1;
	const targetTileY = startTile?.tilesetY ?? -1;

	// Don't fill if clicking on the same tile type
	if (targetTileX === selectedTileX && targetTileY === selectedTileY) return;

	const stack: [number, number][] = [[startX, startY]];
	const visited = new Set<string>();

	while (stack.length > 0) {
		const [x, y] = stack.pop()!;
		const key = `${x},${y}`;

		if (visited.has(key)) continue;
		if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) continue;

		const tile = currentLayer.tiles.get(key);
		const tileX = tile?.tilesetX ?? -1;
		const tileY = tile?.tilesetY ?? -1;

		if (tileX !== targetTileX || tileY !== targetTileY) continue;

		visited.add(key);
		currentLayer.tiles.set(key, {
			x,
			y,
			tilesetX: selectedTileX,
			tilesetY: selectedTileY,
		});

		stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
	}

	render();
}

function updateMapCanvas() {
	mapCanvas.width = Math.max(800, mapData.width * mapData.tileWidth * zoom);
	mapCanvas.height = Math.max(600, mapData.height * mapData.tileHeight * zoom);
}

function render() {
	mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

	mapCtx.save();
	mapCtx.translate(panX, panY);
	mapCtx.scale(zoom, zoom);

	// Draw grid
	if (gridVisible) {
		mapCtx.strokeStyle = "rgba(100, 100, 100, 0.3)";
		mapCtx.lineWidth = 1 / zoom;
		for (let x = 0; x <= mapData.width; x++) {
			mapCtx.beginPath();
			mapCtx.moveTo(x * mapData.tileWidth, 0);
			mapCtx.lineTo(x * mapData.tileWidth, mapData.height * mapData.tileHeight);
			mapCtx.stroke();
		}
		for (let y = 0; y <= mapData.height; y++) {
			mapCtx.beginPath();
			mapCtx.moveTo(0, y * mapData.tileHeight);
			mapCtx.lineTo(mapData.width * mapData.tileWidth, y * mapData.tileHeight);
			mapCtx.stroke();
		}
	}

	// Draw tiles from all layers
	if (tilesetImage) {
		for (const layer of mapData.layers) {
			if (!layer.visible) continue;

			for (const tile of layer.tiles.values()) {
				mapCtx.drawImage(
					tilesetImage,
					tile.tilesetX * mapData.tileWidth,
					tile.tilesetY * mapData.tileHeight,
					mapData.tileWidth,
					mapData.tileHeight,
					tile.x * mapData.tileWidth,
					tile.y * mapData.tileHeight,
					mapData.tileWidth,
					mapData.tileHeight,
				);
			}
		}
	}

	mapCtx.restore();
}

function applyProperties() {
	const widthInput = document.getElementById("map-width") as HTMLInputElement;
	const heightInput = document.getElementById("map-height") as HTMLInputElement;
	const tileWidthInput = document.getElementById(
		"tile-width",
	) as HTMLInputElement;
	const tileHeightInput = document.getElementById(
		"tile-height",
	) as HTMLInputElement;

	mapData.width = parseInt(widthInput.value);
	mapData.height = parseInt(heightInput.value);
	mapData.tileWidth = parseInt(tileWidthInput.value);
	mapData.tileHeight = parseInt(tileHeightInput.value);

	updateMapCanvas();
	render();
}

// Settings management
async function loadSettings() {
	if (typeof window.electron === "undefined") return;

	const result = await window.electron.loadSettings();
	if (result.success) {
		settingsManager.fromJSON(result.data);
	}
}

async function saveSettings() {
	if (typeof window.electron === "undefined") return;

	const json = settingsManager.toJSON();
	await window.electron.saveSettings(json);
	window.electron.rebuildMenu();
}

// Auto-save
function setupAutoSave() {
	const settings = settingsManager.getSettings();
	if (autoSaveIntervalId !== null) {
		clearInterval(autoSaveIntervalId);
	}

	if (settings.autoSaveInterval > 0 && currentProjectPath) {
		const intervalMs = settings.autoSaveInterval * 60 * 1000;
		autoSaveIntervalId = window.setInterval(() => {
			if (projectModified && currentProjectPath) {
				saveProject();
			}
		}, intervalMs);
	}
}

function markModified() {
	projectModified = true;
	updateWindowTitle();
}

function updateWindowTitle() {
	document.title = `${projectName}${projectModified ? " *" : ""} - Lost Editor`;
}

// Project management
function newProject() {
	if (
		projectModified &&
		!confirm("You have unsaved changes. Create a new project anyway?")
	) {
		return;
	}

	currentProjectPath = null;
	projectName = "Untitled";
	projectModified = false;
	tilesetPath = null;
	tilesetImage = null;
	mapData.layers = [];
	addLayer("Layer 1");

	const settings = settingsManager.getSettings();
	mapData.width = settings.defaultMapWidth;
	mapData.height = settings.defaultMapHeight;
	mapData.tileWidth = settings.defaultTileWidth;
	mapData.tileHeight = settings.defaultTileHeight;

	updateWindowTitle();
	render();
}

async function saveProject() {
	console.log("saveProject() called, currentProjectPath:", currentProjectPath);

	try {
		if (!currentProjectPath) {
			// Need to prompt for save location
			if (typeof window.electron === "undefined") {
				console.error("Electron API not available");
				return;
			}

			console.log("Showing save dialog...");
			const result = await window.electron.showSaveDialog({
				filters: [{ name: "Lost Editor Projects", extensions: ["lostproj"] }],
			});

			console.log("Save dialog result:", JSON.stringify(result, null, 2));

			if (result.canceled || !result.filePath) {
				console.log("Save canceled or no file path");
				return;
			}

			console.log("Saving to:", result.filePath);
			await saveProjectAs(result.filePath);
			return;
		}

		await saveProjectAs(currentProjectPath);
	} catch (error) {
		console.error("Error in saveProject:", error);
		alert(`Error saving project: ${error}`);
	}
}

async function saveProjectAs(filePath: string) {
	if (typeof window.electron === "undefined") return;

	console.log("saveProjectAs called with:", filePath);

	const projectData: ProjectData = {
		version: "1.0",
		name: projectName,
		tilesetPath: tilesetPath || "",
		tilesetImageData: tilesetImage ? getTilesetAsDataURL() : undefined,
		mapData: {
			width: mapData.width,
			height: mapData.height,
			tileWidth: mapData.tileWidth,
			tileHeight: mapData.tileHeight,
			layers: mapData.layers.map((layer) => ({
				id: layer.id,
				name: layer.name,
				visible: layer.visible,
				tiles: Array.from(layer.tiles.values()),
			})),
		},
		lastModified: new Date().toISOString(),
	};

	const json = JSON.stringify(projectData, null, 2);
	console.log("Writing file, data length:", json.length);
	const result = await window.electron.writeFile(filePath, json);
	console.log("Write result:", result);

	if (result.success) {
		currentProjectPath = filePath;
		projectName =
			filePath.split("/").pop()?.replace(".lostproj", "") || "Untitled";
		projectModified = false;
		updateWindowTitle();

		// Update recent files
		settingsManager.addRecentFile(filePath);
		settingsManager.setLastOpenedProject(filePath);
		await saveSettings();
		console.log("Project saved successfully");
	} else {
		alert(`Failed to save project: ${result.error}`);
	}
}

async function loadProject(filePath: string) {
	if (typeof window.electron === "undefined") return;

	const result = await window.electron.readFile(filePath);

	if (!result.success) {
		alert(`Failed to load project: ${result.error}`);
		// Remove from recent files if it doesn't exist
		settingsManager.removeRecentFile(filePath);
		await saveSettings();
		return;
	}

	try {
		const projectData: ProjectData = JSON.parse(result.data);

		console.log("Loading project:", projectData);
		console.log("Layers in file:", projectData.mapData.layers);
		console.log("First layer tiles:", projectData.mapData.layers[0]?.tiles);

		// Load map data FIRST (needed for tileset calculations)
		mapData.width = projectData.mapData.width;
		mapData.height = projectData.mapData.height;
		mapData.tileWidth = projectData.mapData.tileWidth;
		mapData.tileHeight = projectData.mapData.tileHeight;

		console.log(
			"Map data loaded - tile size:",
			mapData.tileWidth,
			"x",
			mapData.tileHeight,
		);

		// Load tileset BEFORE layers (so it's ready for rendering)
		if (projectData.tilesetImageData) {
			console.log("Loading tileset from data URL...");
			await loadTilesetFromDataURL(projectData.tilesetImageData);
			console.log("Tileset loaded:", tilesetCols, "x", tilesetRows);
		}

		// Load layers
		mapData.layers = projectData.mapData.layers.map((layerData) => ({
			id: layerData.id,
			name: layerData.name,
			visible: layerData.visible,
			tiles: new Map(
				layerData.tiles.map((tile: Tile) => [`${tile.x},${tile.y}`, tile]),
			),
		}));

		console.log("Layers loaded:", mapData.layers.length);
		console.log("First layer tiles count:", mapData.layers[0]?.tiles.size);

		currentLayer = mapData.layers[0] || null;
		updateLayersList();

		tilesetPath = projectData.tilesetPath;
		currentProjectPath = filePath;
		projectName =
			projectData.name ||
			filePath.split("/").pop()?.replace(".lostproj", "") ||
			"Untitled";
		projectModified = false;
		updateWindowTitle();

		// Update recent files and last opened
		settingsManager.addRecentFile(filePath);
		settingsManager.setLastOpenedProject(filePath);
		await saveSettings();

		updateMapCanvas();
		render();
	} catch (error: any) {
		alert(`Failed to parse project file: ${error.message}`);
	}
}

function getTilesetAsDataURL(): string | null {
	if (!tilesetImage) return null;

	const canvas = document.createElement("canvas");
	canvas.width = tilesetImage.width;
	canvas.height = tilesetImage.height;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(tilesetImage, 0, 0);
	return canvas.toDataURL("image/png");
}

async function loadTilesetFromDataURL(dataURL: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			tilesetImage = img;
			tilesetCols = Math.floor(img.width / mapData.tileWidth);
			tilesetRows = Math.floor(img.height / mapData.tileHeight);

			tilesetCanvas.width = img.width;
			tilesetCanvas.height = img.height;
			redrawTileset();
			resolve();
		};
		img.onerror = () => reject(new Error("Failed to load tileset"));
		img.src = dataURL;
	});
}

// Declare electron API type
declare global {
	interface Window {
		electron?: {
			// Menu events
			onMenuNewProject: (callback: () => void) => void;
			onMenuOpenProject: (
				callback: (event: any, filePath: string) => void,
			) => void;
			onMenuSaveProject: (callback: () => void) => void;
			onMenuSaveProjectAs: (
				callback: (event: any, filePath: string) => void,
			) => void;
			onAutoLoadProject: (
				callback: (event: any, filePath: string) => void,
			) => void;

			// File operations
			readFile: (
				filePath: string,
			) => Promise<{ success: boolean; data?: string; error?: string }>;
			writeFile: (
				filePath: string,
				data: string,
			) => Promise<{ success: boolean; error?: string }>;

			// Settings
			loadSettings: () => Promise<{
				success: boolean;
				data?: string;
				error?: string;
			}>;
			saveSettings: (
				settingsJson: string,
			) => Promise<{ success: boolean; error?: string }>;

			// Dialogs
			showOpenDialog: (options: any) => Promise<any>;
			showSaveDialog: (options: any) => Promise<any>;

			// Menu
			rebuildMenu: () => void;
		};
	}
}
