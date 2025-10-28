import { app, BrowserWindow, Menu, dialog, ipcMain, protocol } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set the app name explicitly
app.name = "Lost Editor";

let mainWindow: BrowserWindow | null = null;
let recentFiles: string[] = [];

const SETTINGS_FILE = "settings.json";

function getSettingsPath(): string {
	return path.join(app.getPath("userData"), SETTINGS_FILE);
}

const createWindow = () => {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		title: "Lost Editor",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	mainWindow.on("page-title-updated", function (e) {
		e.preventDefault();
	});

	// Load the app
	if (process.env.VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
		mainWindow.webContents.openDevTools();
	} else {
		mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
	}

	createMenu();
};

const createMenu = () => {
	const recentSubmenu: Electron.MenuItemConstructorOptions[] =
		recentFiles.length > 0
			? recentFiles.map((filePath) => ({
					label: path.basename(filePath),
					click: () => {
						mainWindow?.webContents.send("menu:load-recent-project", filePath);
					},
				}))
			: [{ label: "No recent files", enabled: false }];

	const isMac = process.platform === "darwin";

	const template: Electron.MenuItemConstructorOptions[] = [
		// App menu (macOS only)
		...(isMac
			? [
					{
						label: "Lost Editor",
						submenu: [
							{ role: "about" as const },
							{ type: "separator" as const },
							{ role: "services" as const },
							{ type: "separator" as const },
							{ role: "hide" as const },
							{ role: "hideOthers" as const },
							{ role: "unhide" as const },
							{ type: "separator" as const },
							{ role: "quit" as const },
						],
					},
				]
			: []),
		{
			label: "File",
			submenu: [
				{
					label: "New Project",
					accelerator: "CmdOrCtrl+N",
					click: () => {
						mainWindow?.webContents.send("menu:new-project");
					},
				},
				{
					label: "Open Project",
					accelerator: "CmdOrCtrl+O",
					click: () => {
						mainWindow?.webContents.send("menu:open-project");
					},
				},
				{
					label: "Recent Projects",
					submenu: recentSubmenu,
				},
				{ type: "separator" },
				{
					label: "New Tileset",
					accelerator: "CmdOrCtrl+Shift+T",
					click: () => {
						mainWindow?.webContents.send("menu:new-tileset");
					},
				},
				{
					label: "Load Tileset",
					accelerator: "CmdOrCtrl+T",
					click: () => {
						mainWindow?.webContents.send("menu:load-tileset");
					},
				},
				{ type: "separator" },
				{
					label: "Save Project",
					accelerator: "CmdOrCtrl+S",
					click: () => {
						mainWindow?.webContents.send("menu:save-project");
					},
				},
				{
					label: "Save Project As",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => {
						mainWindow?.webContents.send("menu:save-project-as");
					},
				},
				{ type: "separator" },
				...(isMac ? [] : [{ role: "quit" as const }]),
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
			],
		},
	];

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
};

// IPC Handlers
ipcMain.handle("read-file", async (_event, filePath: string) => {
	try {
		const data = await fs.readFile(filePath, "utf-8");
		return { success: true, data };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
});

ipcMain.handle("write-file", async (_event, filePath: string, data: string) => {
	try {
		await fs.writeFile(filePath, data, "utf-8");
		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
});

ipcMain.handle("load-settings", async () => {
	try {
		const settingsPath = getSettingsPath();
		const data = await fs.readFile(settingsPath, "utf-8");
		const settings = JSON.parse(data);
		recentFiles = settings.recentFiles || [];
		return { success: true, data };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
});

ipcMain.handle("save-settings", async (_event, settingsJson: string) => {
	try {
		const settingsPath = getSettingsPath();
		await fs.writeFile(settingsPath, settingsJson, "utf-8");
		const settings = JSON.parse(settingsJson);
		recentFiles = settings.recentFiles || [];
		return { success: true };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
});

ipcMain.handle("show-open-dialog", async (_event, options: any) => {
	const result = await dialog.showOpenDialog(options);
	return result;
});

ipcMain.handle("show-save-dialog", async (_event, options: any) => {
	const result = await dialog.showSaveDialog(options);
	return result;
});

ipcMain.on("rebuild-menu", () => {
	createMenu();
});

app.whenReady().then(async () => {
	// Register local:// protocol to serve local files
	protocol.registerFileProtocol("local", (request, callback) => {
		const filePath = request.url.replace("local://", "");
		callback({ path: filePath });
	});

	createWindow();

	// Auto-load last project
	try {
		const settingsPath = getSettingsPath();
		const data = await fs.readFile(settingsPath, "utf-8");
		const settings = JSON.parse(data);
		if (settings.lastOpenedProject) {
			// Check if file exists
			try {
				await fs.access(settings.lastOpenedProject);
				// Wait a bit for window to be ready
				setTimeout(() => {
					mainWindow?.webContents.send(
						"auto-load-project",
						settings.lastOpenedProject,
					);
				}, 500);
			} catch {
				// File doesn't exist, ignore
			}
		}
	} catch {
		// Settings file doesn't exist yet, ignore
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});
