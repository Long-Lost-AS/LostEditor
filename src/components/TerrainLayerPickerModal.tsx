import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../context/EditorContext";

interface TerrainLayerPickerModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export const TerrainLayerPickerModal = ({
	isOpen,
	onClose,
}: TerrainLayerPickerModalProps) => {
	const {
		currentTileset,
		selectedTerrainLayerId,
		setSelectedTerrainLayerId,
		setSelectedTilesetId,
	} = useEditor();

	const [selectedIndex, setSelectedIndex] = useState(0);
	const resultsRef = useRef<HTMLDivElement>(null);

	const terrainLayers = currentTileset?.terrainLayers || [];

	// Reset selected index when modal opens
	useEffect(() => {
		if (isOpen) {
			// Find index of currently selected terrain layer
			const currentIndex = terrainLayers.findIndex(
				(layer) => layer.id === selectedTerrainLayerId,
			);
			setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
		}
	}, [isOpen, terrainLayers, selectedTerrainLayerId]);

	// Scroll selected item into view
	useEffect(() => {
		if (resultsRef.current && terrainLayers.length > 0) {
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
	}, [selectedIndex, terrainLayers.length]);

	// Handle terrain layer selection
	const handleSelectTerrainLayer = useCallback(
		(layerId: string) => {
			if (!currentTileset) return;

			// Toggle selection: click again to deselect
			const newTerrainLayerId =
				selectedTerrainLayerId === layerId ? null : layerId;

			setSelectedTerrainLayerId(currentTileset.id, newTerrainLayerId);

			// When selecting a terrain layer, set the tileset ID
			// Note: No need to clear tile/entity selection - setSelectedTerrainLayerId already sets selection to terrain type
			if (newTerrainLayerId) {
				setSelectedTilesetId(currentTileset.id);
			} else {
				// When deselecting terrain, clear the tileset ID too
				setSelectedTilesetId(null);
			}

			// Close modal after selection
			onClose();
		},
		[
			currentTileset,
			selectedTerrainLayerId,
			setSelectedTerrainLayerId,
			setSelectedTilesetId,
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
						Math.min(prev + 1, terrainLayers.length - 1),
					);
					break;

				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) => Math.max(prev - 1, 0));
					break;

				case "Enter":
					e.preventDefault();
					if (terrainLayers[selectedIndex]) {
						handleSelectTerrainLayer(terrainLayers[selectedIndex].id);
					}
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, selectedIndex, terrainLayers, onClose, handleSelectTerrainLayer]);

	if (!isOpen) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center">
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

			{/* Terrain Layer Picker Modal */}
			<div
				className="relative z-10 w-full max-w-md rounded shadow-2xl overflow-hidden flex flex-col"
				style={{
					background: "#2d2d30",
					border: "1px solid #3e3e42",
					maxHeight: "500px",
				}}
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-4 py-3"
					style={{ borderBottom: "1px solid #3e3e42" }}
				>
					<div className="flex items-center gap-3">
						<svg
							aria-hidden="true"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
						>
							<path
								d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"
								fill="#22c55e"
								opacity="0.8"
							/>
						</svg>
						<span className="text-sm" style={{ color: "#cccccc" }}>
							Select Terrain Layer
						</span>
					</div>
					<span className="text-xs" style={{ color: "#858585" }}>
						ESC to close
					</span>
				</div>

				{/* Terrain Layer List or No Layers Message */}
				{!currentTileset || terrainLayers.length === 0 ? (
					<div
						className="flex-1 flex items-center justify-center text-center p-8"
						style={{ background: "#252526" }}
					>
						<div>
							<div className="text-sm mb-2" style={{ color: "#cccccc" }}>
								{!currentTileset
									? "No tileset selected"
									: "No terrain layers available"}
							</div>
							<div className="text-xs" style={{ color: "#858585" }}>
								{!currentTileset
									? "Select a tileset first using Cmd/Ctrl+T"
									: "This tileset has no terrain layers"}
							</div>
						</div>
					</div>
				) : (
					<div
						ref={resultsRef}
						className="flex-1 overflow-y-auto"
						style={{ background: "#252526" }}
					>
						{terrainLayers.map((layer, index) => (
							<div
								key={layer.id}
								className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
								style={{
									background:
										index === selectedIndex ? "#0e639c" : "transparent",
									borderLeft:
										index === selectedIndex
											? "3px solid #1177bb"
											: "3px solid transparent",
								}}
								onClick={() => handleSelectTerrainLayer(layer.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleSelectTerrainLayer(layer.id);
									}
								}}
								onMouseEnter={() => setSelectedIndex(index)}
								role="button"
								tabIndex={0}
							>
								{/* Selected indicator */}
								{selectedTerrainLayerId === layer.id && (
									<div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
								)}

								{/* Layer icon */}
								<svg
									aria-hidden="true"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									className="flex-shrink-0"
								>
									<path
										d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"
										fill="#22c55e"
										opacity="0.6"
									/>
								</svg>

								{/* Layer name */}
								<div className="flex-1 min-w-0">
									<div
										className="text-sm truncate"
										style={{
											color:
												selectedTerrainLayerId === layer.id
													? "#ffffff"
													: "#cccccc",
											fontWeight:
												selectedTerrainLayerId === layer.id ? 600 : 400,
										}}
									>
										{layer.name}
									</div>
								</div>
							</div>
						))}
					</div>
				)}

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
						{terrainLayers.length} terrain layer
						{terrainLayers.length !== 1 ? "s" : ""}
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
