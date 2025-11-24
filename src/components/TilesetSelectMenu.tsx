import Fuse from "fuse.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";
import type { TilesetData } from "../types";
import { isCompoundTile } from "../utils/tileHelpers";
import { packTileId } from "../utils/tileId";

interface TilesetSelectMenuProps {
	isOpen: boolean;
	onClose: () => void;
}

export const TilesetSelectMenu = ({
	isOpen,
	onClose,
}: TilesetSelectMenuProps) => {
	const {
		setCurrentTileset,
		setSelectedTilesetId,
		setSelectedTileId,
		setSelectedTile,
		getActiveMapTab,
		updateTabData,
		tilesets: projectTilesets,
	} = useEditor();
	const [tilesets, setTilesets] = useState<TilesetData[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const previewCanvasRef = useRef<HTMLCanvasElement>(null);

	// Load tilesets when menu opens
	useEffect(() => {
		if (isOpen) {
			setLoading(true);
			setSearchQuery("");
			setSelectedIndex(0);

			// Get tilesets from current project only (from EditorContext)
			// IMPORTANT: Use projectTilesets from EditorContext (the "working copy"),
			// NOT tilesetManager.getAllTilesets() (the "disk cache").
			// The manager cache may contain stale data from previous projects.
			const loadedTilesets = [...projectTilesets];

			// Sort alphabetically by name
			loadedTilesets.sort((a, b) => {
				const nameA = a.name || a.id;
				const nameB = b.name || b.id;
				return nameA.localeCompare(nameB);
			});

			setTilesets(loadedTilesets);
			setLoading(false);

			// Focus input when opened
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [isOpen, projectTilesets]);

	// Fuzzy search using Fuse.js
	const fuse = new Fuse(tilesets, {
		keys: ["name", "id", "filePath"],
		threshold: 0.4,
		ignoreLocation: true,
	});

	const filteredTilesets = searchQuery
		? fuse.search(searchQuery).map((result) => result.item)
		: tilesets;

	// Reset selected index when search query changes
	useEffect(() => {
		setSelectedIndex(0);
	}, []);

	// Scroll selected item into view
	useEffect(() => {
		if (resultsRef.current) {
			const selectedElement = resultsRef.current.children[
				selectedIndex
			] as HTMLElement;
			if (selectedElement) {
				selectedElement.scrollIntoView({
					block: "nearest",
					behavior: "smooth",
				});
			}
		}
	}, [selectedIndex]);

	// Draw tileset preview on canvas
	useEffect(() => {
		const canvas = previewCanvasRef.current;
		if (!canvas || filteredTilesets.length === 0) return;

		const tileset = filteredTilesets[selectedIndex];
		if (!tileset) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Clear canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Draw background
		ctx.fillStyle = "#1e1e1e";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// If tileset has no image, show message
		if (!tileset.imageData) {
			ctx.fillStyle = "#858585";
			ctx.font = "12px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("No image loaded", canvas.width / 2, canvas.height / 2);
			return;
		}

		// Calculate scale to fit tileset in canvas with padding
		const padding = 20;
		const scaleX = (canvas.width - padding * 2) / tileset.imageData.width;
		const scaleY = (canvas.height - padding * 2) / tileset.imageData.height;
		const scale = Math.min(scaleX, scaleY, 2); // Max 2x zoom

		// Center the tileset in the canvas
		const scaledWidth = tileset.imageData.width * scale;
		const scaledHeight = tileset.imageData.height * scale;
		const offsetX = (canvas.width - scaledWidth) / 2;
		const offsetY = (canvas.height - scaledHeight) / 2;

		ctx.save();

		// Draw tileset image
		ctx.drawImage(
			tileset.imageData,
			offsetX,
			offsetY,
			scaledWidth,
			scaledHeight,
		);

		// Draw compound tile borders
		if (tileset.tiles && tileset.tiles.length > 0) {
			ctx.strokeStyle = "rgba(34, 197, 94, 0.8)"; // Green color
			ctx.lineWidth = 2;

			for (const tile of tileset.tiles) {
				if (isCompoundTile(tile, tileset) && tile.width && tile.height) {
					// Draw compound tile border
					const tileX = tile.x;
					const tileY = tile.y;
					const screenX = offsetX + tileX * scale;
					const screenY = offsetY + tileY * scale;
					const screenWidth = tile.width * scale;
					const screenHeight = tile.height * scale;

					ctx.strokeRect(screenX, screenY, screenWidth, screenHeight);
				}
			}
		}

		ctx.restore();
	}, [selectedIndex, filteredTilesets]);

	// Handler to select a tileset
	const handleSelectTileset = useCallback(
		(tileset: TilesetData) => {
			// Close the modal immediately for better UX
			onClose();

			// Set the selected tileset globally
			setCurrentTileset(tileset);
			setSelectedTilesetId(tileset.id);

			// Select the first tile (0, 0) by default so user can start drawing immediately
			// Check if there's a compound tile at (0,0), otherwise use regular tile
			const firstCompoundTile = tileset.tiles?.find((tile) => {
				if (!isCompoundTile(tile, tileset)) return false;
				const x = tile.x;
				const y = tile.y;
				return x === 0 && y === 0;
			});

			if (firstCompoundTile) {
				// Select the compound tile
				setSelectedTileId(
					packTileId(firstCompoundTile.x, firstCompoundTile.y, tileset.order),
				);
				setSelectedTile(
					0,
					0,
					tileset.id,
					packTileId(firstCompoundTile.x, firstCompoundTile.y, tileset.order),
				);
			} else {
				// Select regular tile at (0, 0)
				const regularTileId = packTileId(0, 0, tileset.order, false, false);
				setSelectedTileId(regularTileId);
				setSelectedTile(0, 0, tileset.id, regularTileId);
			}

			// Update active map tab to use this tileset (if one exists)
			const activeMapTab = getActiveMapTab();
			if (activeMapTab) {
				const currentTool = activeMapTab.viewState.currentTool || "pencil";

				// Tileset tools are: pencil, eraser, fill, rect
				const tilesetTools = ["pencil", "eraser", "fill", "rect"];
				const isOnTilesetTool = tilesetTools.includes(currentTool);

				// If not on a tileset tool, switch to pencil. Otherwise keep current tool
				const newTool = isOnTilesetTool ? currentTool : "pencil";

				updateTabData(activeMapTab.id, {
					viewState: {
						...activeMapTab.viewState,
						selectedTilesetId: tileset.id,
						currentTool: newTool,
					},
				});
			}
		},
		[
			setCurrentTileset,
			setSelectedTilesetId,
			setSelectedTileId,
			setSelectedTile,
			getActiveMapTab,
			updateTabData,
			onClose,
		],
	);

	// Keyboard navigation
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case "Escape":
					e.preventDefault();
					onClose();
					break;

				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) =>
						Math.min(prev + 1, filteredTilesets.length - 1),
					);
					break;

				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) => Math.max(prev - 1, 0));
					break;

				case "Enter":
					e.preventDefault();
					if (filteredTilesets[selectedIndex]) {
						handleSelectTileset(filteredTilesets[selectedIndex]);
					}
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, selectedIndex, filteredTilesets, onClose, handleSelectTileset]);

	const getTilesetIcon = () => {
		return (
			<svg
				aria-hidden="true"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
			>
				<rect x="3" y="3" width="7" height="7" fill="#ce9178" />
				<rect x="11" y="3" width="7" height="7" fill="#ce9178" />
				<rect x="3" y="11" width="7" height="7" fill="#ce9178" />
				<rect x="11" y="11" width="7" height="7" fill="#ce9178" />
				<rect x="7" y="7" width="7" height="7" fill="#d4a373" opacity="0.5" />
			</svg>
		);
	};

	if (!isOpen) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
			{/* Backdrop */}
			<div
				className="absolute inset-0"
				style={{ background: "rgba(0, 0, 0, 0.6)" }}
				onClick={onClose}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						onClose();
					}
				}}
				role="button"
				tabIndex={0}
			/>

			{/* Tileset Select Menu */}
			<div
				className="relative z-10 w-full max-w-4xl rounded shadow-2xl overflow-hidden flex flex-col"
				style={{
					background: "#2d2d30",
					border: "1px solid #3e3e42",
					height: "500px",
				}}
			>
				{/* Search Input */}
				<div
					className="flex items-center gap-3 px-4 py-3"
					style={{ borderBottom: "1px solid #3e3e42" }}
				>
					<svg
						aria-hidden="true"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
					>
						<path
							d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
							fill="#858585"
						/>
					</svg>
					<input
						ref={inputRef}
						type="text"
						className="flex-1 bg-transparent outline-none text-sm"
						style={{ color: "#cccccc" }}
						placeholder="Search tilesets..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						spellCheck={false}
						autoComplete="off"
					/>
					<span className="text-xs" style={{ color: "#858585" }}>
						ESC to close
					</span>
				</div>

				{/* Main Content - Split View */}
				<div className="flex flex-1 min-h-0">
					{/* Left Side - Tileset List */}
					<div
						ref={resultsRef}
						className="flex-1 overflow-y-auto"
						style={{
							background: "#252526",
							borderRight: "1px solid #3e3e42",
							minWidth: "60%",
							maxWidth: "60%",
						}}
					>
						{loading ? (
							<div
								className="px-4 py-8 text-center text-sm"
								style={{ color: "#858585" }}
							>
								Loading tilesets...
							</div>
						) : filteredTilesets.length === 0 ? (
							<div
								className="px-4 py-8 text-center text-sm"
								style={{ color: "#858585" }}
							>
								{searchQuery ? "No tilesets found" : "No tilesets available"}
							</div>
						) : (
							filteredTilesets.map((tileset, index) => (
								<div
									key={tileset.id}
									className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
									style={{
										background:
											index === selectedIndex ? "#0e639c" : "transparent",
										borderLeft:
											index === selectedIndex
												? "3px solid #1177bb"
												: "3px solid transparent",
									}}
									onClick={() => handleSelectTileset(tileset)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleSelectTileset(tileset);
										}
									}}
									onMouseEnter={() => setSelectedIndex(index)}
									role="button"
									tabIndex={0}
								>
									{getTilesetIcon()}
									<div className="flex-1 min-w-0">
										<div
											className="text-sm truncate"
											style={{ color: "#cccccc" }}
										>
											{tileset.name || tileset.id}
										</div>
										<div
											className="text-xs truncate"
											style={{ color: "#858585" }}
										>
											{tileset.filePath || "Unknown path"}
										</div>
									</div>
									<span className="text-xs" style={{ color: "#858585" }}>
										{tileset.tileWidth}×{tileset.tileHeight}px
									</span>
								</div>
							))
						)}
					</div>

					{/* Right Side - Preview */}
					<div
						className="flex-1 flex flex-col"
						style={{
							background: "#1e1e1e",
							minWidth: "40%",
							maxWidth: "40%",
						}}
					>
						{filteredTilesets.length > 0 && filteredTilesets[selectedIndex] ? (
							<>
								{/* Preview Canvas */}
								<div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
									<canvas
										ref={previewCanvasRef}
										width={400}
										height={350}
										className="border border-gray-700 rounded"
										style={{
											maxWidth: "100%",
											maxHeight: "100%",
											objectFit: "contain",
										}}
									/>
								</div>

								{/* Tileset Info */}
								<div className="p-4 border-t border-gray-700">
									<div
										className="text-sm font-semibold mb-2"
										style={{ color: "#cccccc" }}
									>
										{filteredTilesets[selectedIndex].name ||
											filteredTilesets[selectedIndex].id}
									</div>
									<div
										className="text-xs space-y-1"
										style={{ color: "#858585" }}
									>
										<div>
											Tile Size: {filteredTilesets[selectedIndex].tileWidth}×
											{filteredTilesets[selectedIndex].tileHeight}px
										</div>
										{filteredTilesets[selectedIndex].imageData && (
											<>
												<div>
													Image:{" "}
													{filteredTilesets[selectedIndex].imageData?.width}×
													{filteredTilesets[selectedIndex].imageData?.height}px
												</div>
												<div>
													Grid:{" "}
													{Math.floor(
														filteredTilesets[selectedIndex].imageData?.width /
															filteredTilesets[selectedIndex].tileWidth,
													)}
													×
													{Math.floor(
														filteredTilesets[selectedIndex].imageData?.height /
															filteredTilesets[selectedIndex].tileHeight,
													)}{" "}
													tiles
												</div>
												<div>
													Total Tiles:{" "}
													{Math.floor(
														filteredTilesets[selectedIndex].imageData?.width /
															filteredTilesets[selectedIndex].tileWidth,
													) *
														Math.floor(
															filteredTilesets[selectedIndex].imageData
																?.height /
																filteredTilesets[selectedIndex].tileHeight,
														)}
												</div>
											</>
										)}
										{filteredTilesets[selectedIndex].terrainLayers &&
											filteredTilesets[selectedIndex].terrainLayers?.length >
												0 && (
												<div className="text-green-400">
													Terrain Layers:{" "}
													{
														filteredTilesets[selectedIndex].terrainLayers
															?.length
													}
												</div>
											)}
									</div>
								</div>
							</>
						) : (
							<div
								className="flex items-center justify-center h-full text-sm"
								style={{ color: "#858585" }}
							>
								No tileset selected
							</div>
						)}
					</div>
				</div>

				{/* Footer */}
				<div
					className="flex items-center justify-between px-4 py-2 text-xs"
					style={{
						background: "#2d2d30",
						borderTop: "1px solid #3e3e42",
						color: "#858585",
					}}
				>
					<div>
						{filteredTilesets.length > 0 && (
							<span>
								{filteredTilesets.length} tileset
								{filteredTilesets.length !== 1 ? "s" : ""}
							</span>
						)}
					</div>
					<div className="flex items-center gap-3">
						<span>↑↓ Navigate</span>
						<span>↵ Select</span>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
};
