import type { Tool } from "../types";
import {
	EntityIcon,
	EraserIcon,
	FillIcon,
	PencilIcon,
	PointerIcon,
	PointOfInterestIcon,
	PolygonIcon,
	RectangleIcon,
} from "./Icons";

interface ToolbarProps {
	currentTool: Tool;
	onToolChange: (tool: Tool) => void;
	onOpenEntitySelect: () => void;
	onOpenTilesetSelect: () => void;
	onOpenTilePicker: () => void;
	onOpenTerrainPicker: () => void;
	gridVisible: boolean;
	onGridToggle: () => void;
}

export const Toolbar = ({
	currentTool,
	onToolChange,
	onOpenEntitySelect,
	onOpenTilesetSelect,
	onOpenTilePicker,
	onOpenTerrainPicker,
	gridVisible,
	onGridToggle,
}: ToolbarProps) => {
	// Determine which context-sensitive buttons to show
	const isEntityTool = currentTool === "entity";
	const isTilesetTool = ["pencil", "eraser", "fill", "rect"].includes(
		currentTool,
	);

	return (
		<div className="toolbar">
			<button
				type="button"
				className={`tool-btn ${currentTool === "pointer" ? "active" : ""}`}
				onClick={() => onToolChange("pointer")}
				title="Pointer Tool (Select & Move)"
			>
				<PointerIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${currentTool === "pencil" ? "active" : ""}`}
				onClick={() => onToolChange("pencil")}
				title="Pencil Tool"
			>
				<PencilIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${currentTool === "eraser" ? "active" : ""}`}
				onClick={() => onToolChange("eraser")}
				title="Eraser Tool"
			>
				<EraserIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${currentTool === "fill" ? "active" : ""}`}
				onClick={() => onToolChange("fill")}
				title="Fill Tool"
			>
				<FillIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${currentTool === "rect" ? "active" : ""}`}
				onClick={() => onToolChange("rect")}
				title="Rectangle Tool"
			>
				<RectangleIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${currentTool === "entity" ? "active" : ""}`}
				onClick={() => onToolChange("entity")}
				title="Entity Tool"
			>
				<EntityIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${currentTool === "collision" ? "active" : ""}`}
				onClick={() => onToolChange("collision")}
				title="Collision Tool"
			>
				<PolygonIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${currentTool === "point" ? "active" : ""}`}
				onClick={() => onToolChange("point")}
				title="Point Tool"
			>
				<PointOfInterestIcon size={20} />
			</button>
			<button
				type="button"
				className={`tool-btn ${gridVisible ? "active" : ""}`}
				onClick={onGridToggle}
				title={gridVisible ? "Hide Grid" : "Show Grid"}
			>
				<svg
					aria-hidden="true"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<rect x="3" y="3" width="18" height="18" rx="1" />
					<path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
				</svg>
			</button>

			{/* Context-sensitive buttons */}
			{(isEntityTool || isTilesetTool) && <div className="separator" />}

			{/* Entity tool buttons */}
			{isEntityTool && (
				<button
					type="button"
					className="tool-btn"
					onClick={onOpenEntitySelect}
					title="Select Entity (Cmd/Ctrl+E)"
				>
					<svg
						aria-hidden="true"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<circle cx="12" cy="8" r="3" />
						<path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
					</svg>
				</button>
			)}

			{/* Tileset tool buttons */}
			{isTilesetTool && (
				<>
					<button
						type="button"
						className="tool-btn"
						onClick={onOpenTilesetSelect}
						title="Select Tileset (Cmd/Ctrl+T)"
					>
						<svg
							aria-hidden="true"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
						>
							<rect x="3" y="3" width="7" height="7" fill="currentColor" />
							<rect x="11" y="3" width="7" height="7" fill="currentColor" />
							<rect x="3" y="11" width="7" height="7" fill="currentColor" />
							<rect x="11" y="11" width="7" height="7" fill="currentColor" />
						</svg>
					</button>
					<button
						type="button"
						className="tool-btn"
						onClick={onOpenTilePicker}
						title="Pick Tile (Cmd/Ctrl+G)"
					>
						<svg
							aria-hidden="true"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" />
							<path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
						</svg>
					</button>
					<button
						type="button"
						className="tool-btn"
						onClick={onOpenTerrainPicker}
						title="Pick Terrain Layer (Cmd/Ctrl+L)"
					>
						<svg
							aria-hidden="true"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
						>
							<path
								d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"
								fill="currentColor"
								opacity="0.8"
							/>
						</svg>
					</button>
				</>
			)}
		</div>
	);
};
