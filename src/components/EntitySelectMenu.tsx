import Fuse from "fuse.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";
import { entityManager } from "../managers/EntityManager";
import { fileManager } from "../managers/FileManager";
import { type EntityDefinition, hasImageData } from "../types";

interface EntitySelectMenuProps {
	isOpen: boolean;
	onClose: () => void;
}

export const EntitySelectMenu = ({
	isOpen,
	onClose,
}: EntitySelectMenuProps) => {
	const {
		setSelectedEntityDefId,
		setSelectedTilesetId,
		getTilesetById,
		getActiveMapTab,
		updateTabData,
	} = useEditor();
	const [entities, setEntities] = useState<EntityDefinition[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const resultsRef = useRef<HTMLDivElement>(null);
	const previewCanvasRef = useRef<HTMLCanvasElement>(null);

	// Load entities when menu opens
	useEffect(() => {
		if (isOpen) {
			setLoading(true);
			setSearchQuery("");
			setSelectedIndex(0);

			// Get all loaded entities from EntityManager
			const loadedEntities = entityManager.getAllEntities();

			// Sort alphabetically by name
			loadedEntities.sort((a, b) => {
				const nameA = a.name || a.id;
				const nameB = b.name || b.id;
				return nameA.localeCompare(nameB);
			});

			setEntities(loadedEntities);
			setLoading(false);

			// Focus input when opened
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [isOpen]);

	// Fuzzy search using Fuse.js
	const fuse = new Fuse(entities, {
		keys: ["name", "id", "filePath"],
		threshold: 0.4,
		ignoreLocation: true,
	});

	const filteredEntities = searchQuery
		? fuse.search(searchQuery).map((result) => result.item)
		: entities;

	// Reset selected index when search query changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [searchQuery]);

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

	// Draw entity preview on canvas
	useEffect(() => {
		const canvas = previewCanvasRef.current;
		if (!canvas || filteredEntities.length === 0) return;

		const entity = filteredEntities[selectedIndex];
		if (!entity) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Clear canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Draw background
		ctx.fillStyle = "#1e1e1e";
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// If entity has no sprites, show message
		if (!entity.sprites || entity.sprites.length === 0) {
			ctx.fillStyle = "#858585";
			ctx.font = "12px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("No sprites", canvas.width / 2, canvas.height / 2);
			return;
		}

		// Get the first sprite's tileset
		const firstSprite = entity.sprites[0];
		const tileset = getTilesetById(firstSprite.tilesetId);

		if (!tileset || !hasImageData(tileset)) {
			ctx.fillStyle = "#858585";
			ctx.font = "12px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText("Tileset not loaded", canvas.width / 2, canvas.height / 2);
			return;
		}

		// Calculate bounding box for all sprites
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;

		entity.sprites.forEach((spriteLayer) => {
			if (!spriteLayer.sprite) return;

			const sprite = spriteLayer.sprite;
			const offset = spriteLayer.offset || { x: 0, y: 0 };
			const origin = spriteLayer.origin || { x: 0.5, y: 1 };

			const originOffsetX = origin.x * sprite.width;
			const originOffsetY = origin.y * sprite.height;

			const x1 = -originOffsetX + offset.x;
			const y1 = -originOffsetY + offset.y;
			const x2 = x1 + sprite.width;
			const y2 = y1 + sprite.height;

			minX = Math.min(minX, x1);
			minY = Math.min(minY, y1);
			maxX = Math.max(maxX, x2);
			maxY = Math.max(maxY, y2);
		});

		const entityWidth = maxX - minX;
		const entityHeight = maxY - minY;

		// Calculate scale to fit in canvas with padding
		const padding = 20;
		const scaleX = (canvas.width - padding * 2) / entityWidth;
		const scaleY = (canvas.height - padding * 2) / entityHeight;
		const scale = Math.min(scaleX, scaleY, 3); // Max 3x zoom

		// Center the entity in the canvas
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;

		ctx.save();
		ctx.translate(centerX, centerY);
		ctx.scale(scale, scale);

		// Draw each sprite layer
		entity.sprites.forEach((spriteLayer) => {
			if (!spriteLayer.sprite) return;

			const sprite = spriteLayer.sprite;
			const offset = spriteLayer.offset || { x: 0, y: 0 };
			const origin = spriteLayer.origin || { x: 0.5, y: 1 };

			const originOffsetX = origin.x * sprite.width;
			const originOffsetY = origin.y * sprite.height;

			const drawX = -originOffsetX + offset.x - minX - entityWidth / 2;
			const drawY = -originOffsetY + offset.y - minY - entityHeight / 2;

			ctx.drawImage(
				tileset.imageData,
				sprite.x,
				sprite.y,
				sprite.width,
				sprite.height,
				drawX,
				drawY,
				sprite.width,
				sprite.height,
			);
		});

		ctx.restore();

		// Draw crosshair at origin point (0, 0)
		ctx.strokeStyle = "rgba(255, 165, 0, 0.5)";
		ctx.lineWidth = 1;
		const markerSize = 8;

		const originScreenX = centerX;
		const originScreenY = centerY - (minY + entityHeight / 2) * scale;

		ctx.beginPath();
		ctx.moveTo(originScreenX - markerSize, originScreenY);
		ctx.lineTo(originScreenX + markerSize, originScreenY);
		ctx.moveTo(originScreenX, originScreenY - markerSize);
		ctx.lineTo(originScreenX, originScreenY + markerSize);
		ctx.stroke();
	}, [selectedIndex, filteredEntities, getTilesetById]);

	// Handler to select an entity
	const handleSelectEntity = useCallback(
		(entity: EntityDefinition) => {
			// Close the modal immediately for better UX
			onClose();

			// Set the selected entity globally (after close, so modal dismisses quickly)
			setSelectedEntityDefId(entity.id);

			// Set the tileset from the first sprite (needed for entity preview)
			if (entity.sprites && entity.sprites.length > 0) {
				setSelectedTilesetId(entity.sprites[0].tilesetId);
			}

			// Switch to entity tool in the active map tab (if one exists)
			const activeMapTab = getActiveMapTab();
			if (activeMapTab) {
				updateTabData(activeMapTab.id, {
					viewState: {
						...activeMapTab.viewState,
						currentTool: "entity",
						selectedEntityDefId: entity.id,
					},
				});
			}
		},
		[
			setSelectedEntityDefId,
			setSelectedTilesetId,
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
						Math.min(prev + 1, filteredEntities.length - 1),
					);
					break;

				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) => Math.max(prev - 1, 0));
					break;

				case "Enter":
					e.preventDefault();
					if (filteredEntities[selectedIndex]) {
						handleSelectEntity(filteredEntities[selectedIndex]);
					}
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, selectedIndex, filteredEntities, onClose, handleSelectEntity]);

	const getEntityIcon = () => {
		return (
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
				<path
					d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z"
					fill="#4ec9b0"
				/>
				<circle cx="9" cy="10" r="1.5" fill="#4ec9b0" />
				<circle cx="15" cy="10" r="1.5" fill="#4ec9b0" />
				<path
					d="M12 17.5C14.33 17.5 16.31 16.04 17.11 14H6.89C7.69 16.04 9.67 17.5 12 17.5Z"
					fill="#4ec9b0"
				/>
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
			/>

			{/* Entity Select Menu */}
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
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
						placeholder="Search entities..."
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
					{/* Left Side - Entity List */}
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
								Loading entities...
							</div>
						) : filteredEntities.length === 0 ? (
							<div
								className="px-4 py-8 text-center text-sm"
								style={{ color: "#858585" }}
							>
								{searchQuery ? "No entities found" : "No entities available"}
							</div>
						) : (
							filteredEntities.map((entity, index) => (
								<div
									key={entity.id}
									className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
									style={{
										background:
											index === selectedIndex ? "#0e639c" : "transparent",
										borderLeft:
											index === selectedIndex
												? "3px solid #1177bb"
												: "3px solid transparent",
									}}
									onClick={() => handleSelectEntity(entity)}
									onMouseEnter={() => setSelectedIndex(index)}
								>
									{getEntityIcon()}
									<div className="flex-1 min-w-0">
										<div
											className="text-sm truncate"
											style={{ color: "#cccccc" }}
										>
											{entity.name || entity.id}
										</div>
										<div
											className="text-xs truncate"
											style={{ color: "#858585" }}
										>
											{entity.filePath || "Unknown path"}
										</div>
									</div>
									{entity.sprites && entity.sprites.length > 0 && (
										<span className="text-xs" style={{ color: "#858585" }}>
											{entity.sprites.length} sprite
											{entity.sprites.length !== 1 ? "s" : ""}
										</span>
									)}
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
						{filteredEntities.length > 0 && filteredEntities[selectedIndex] ? (
							<>
								{/* Preview Canvas */}
								<div className="flex-1 flex items-center justify-center p-4">
									<canvas
										ref={previewCanvasRef}
										width={300}
										height={300}
										className="border border-gray-700 rounded"
									/>
								</div>

								{/* Entity Info */}
								<div className="p-4 border-t border-gray-700">
									<div
										className="text-sm font-semibold mb-2"
										style={{ color: "#cccccc" }}
									>
										{filteredEntities[selectedIndex].name ||
											filteredEntities[selectedIndex].id}
									</div>
									<div
										className="text-xs space-y-1"
										style={{ color: "#858585" }}
									>
										{filteredEntities[selectedIndex].sprites &&
											filteredEntities[selectedIndex].sprites!.length > 0 && (
												<div>
													Sprites:{" "}
													{filteredEntities[selectedIndex].sprites!.length}
												</div>
											)}
										{filteredEntities[selectedIndex].colliders &&
											filteredEntities[selectedIndex].colliders!.length > 0 && (
												<div className="text-green-400">
													Colliders:{" "}
													{filteredEntities[selectedIndex].colliders!.length}
												</div>
											)}
										{filteredEntities[selectedIndex].properties &&
											Object.keys(filteredEntities[selectedIndex].properties!)
												.length > 0 && (
												<div>
													Properties:{" "}
													{
														Object.keys(
															filteredEntities[selectedIndex].properties!,
														).length
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
								No entity selected
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
						{filteredEntities.length > 0 && (
							<span>
								{filteredEntities.length} entit
								{filteredEntities.length !== 1 ? "ies" : "y"}
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
