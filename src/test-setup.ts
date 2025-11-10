import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock HTMLCanvasElement methods
HTMLCanvasElement.prototype.getContext = vi.fn(
	() =>
		({
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 1,
			fillRect: vi.fn(),
			strokeRect: vi.fn(),
			clearRect: vi.fn(),
			beginPath: vi.fn(),
			closePath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			arc: vi.fn(),
			fill: vi.fn(),
			stroke: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			scale: vi.fn(),
			translate: vi.fn(),
			rotate: vi.fn(),
			setTransform: vi.fn(),
			drawImage: vi.fn(),
			createImageData: vi.fn(() => ({ data: new Uint8ClampedArray() })),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray() })),
			putImageData: vi.fn(),
			measureText: vi.fn(() => ({ width: 0 })),
			canvas: {} as HTMLCanvasElement,
		}) as unknown as CanvasRenderingContext2D,
) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock HTMLImageElement
global.Image = class MockImage {
	onload: (() => void) | null = null;
	onerror: ((event: Event | string) => void) | null = null;
	src = "";
	width = 32;
	height = 32;

	constructor() {
		setTimeout(() => {
			if (this.onload) {
				this.onload();
			}
		}, 0);
	}
} as unknown as typeof Image;

// Mock Tauri APIs
const mockTauriFs = {
	readTextFile: vi.fn(),
	writeTextFile: vi.fn(),
	readDir: vi.fn(),
	exists: vi.fn(),
	createDir: vi.fn(),
	removeFile: vi.fn(),
	BaseDirectory: {
		AppConfig: 1,
		AppData: 2,
		AppLocalData: 3,
	},
};

const mockTauriDialog = {
	open: vi.fn(),
	save: vi.fn(),
	message: vi.fn(),
	ask: vi.fn(),
	confirm: vi.fn(),
};

const mockTauriPath = {
	join: vi.fn((...paths: string[]) => paths.join("/")),
	dirname: vi.fn((path: string) => path.split("/").slice(0, -1).join("/")),
	basename: vi.fn((path: string) => path.split("/").pop() || ""),
	resolve: vi.fn((...paths: string[]) => paths.join("/")),
	normalize: vi.fn((path: string) => path),
	appConfigDir: vi.fn(() => Promise.resolve("/mock/config")),
	appDataDir: vi.fn(() => Promise.resolve("/mock/data")),
	appLocalDataDir: vi.fn(() => Promise.resolve("/mock/local-data")),
};

const mockTauriEvent = {
	listen: vi.fn(() => Promise.resolve(() => {})),
	once: vi.fn(() => Promise.resolve(() => {})),
	emit: vi.fn(() => Promise.resolve()),
	TauriEvent: {},
};

const mockTauriCore = {
	invoke: vi.fn(),
	convertFileSrc: vi.fn((path: string) => `file://${path}`),
};

const mockTauriWindow = {
	appWindow: {
		listen: vi.fn(() => Promise.resolve(() => {})),
		emit: vi.fn(() => Promise.resolve()),
		close: vi.fn(() => Promise.resolve()),
	},
	getCurrentWindow: vi.fn(() => ({
		listen: vi.fn(() => Promise.resolve(() => {})),
		emit: vi.fn(() => Promise.resolve()),
		close: vi.fn(() => Promise.resolve()),
	})),
};

const mockTauriOs = {
	platform: vi.fn(() => Promise.resolve("darwin")),
	version: vi.fn(() => Promise.resolve("1.0.0")),
	type: vi.fn(() => Promise.resolve("Darwin")),
};

// Mock Tauri modules
vi.mock("@tauri-apps/api/fs", () => mockTauriFs);
vi.mock("@tauri-apps/api/dialog", () => mockTauriDialog);
vi.mock("@tauri-apps/api/path", () => mockTauriPath);
vi.mock("@tauri-apps/api/event", () => mockTauriEvent);
vi.mock("@tauri-apps/api/core", () => mockTauriCore);
vi.mock("@tauri-apps/api/window", () => mockTauriWindow);
vi.mock("@tauri-apps/api/os", () => mockTauriOs);

// Export mocks for use in tests
export const tauriMocks = {
	fs: mockTauriFs,
	dialog: mockTauriDialog,
	path: mockTauriPath,
	event: mockTauriEvent,
	core: mockTauriCore,
	window: mockTauriWindow,
	os: mockTauriOs,
};

// Global test helpers
export function resetAllMocks() {
	Object.values(tauriMocks).forEach((mock) => {
		Object.values(mock).forEach((fn) => {
			if (typeof fn === "function" && "mockClear" in fn) {
				(fn as { mockClear: () => void }).mockClear();
			}
		});
	});
}

// Note: beforeEach is not defined in this file, it's provided by vitest in test files
