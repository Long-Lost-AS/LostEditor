import type { Tool } from "../types";
import {
	EntityIcon,
	EraserIcon,
	FillIcon,
	PencilIcon,
	PointerIcon,
	RectangleIcon,
} from "./Icons";

interface ToolbarProps {
	currentTool: Tool;
	onToolChange: (tool: Tool) => void;
}

export const Toolbar = ({ currentTool, onToolChange }: ToolbarProps) => {
	return (
		<div className="toolbar">
			<button
				className={`tool-btn ${currentTool === "pointer" ? "active" : ""}`}
				onClick={() => onToolChange("pointer")}
				title="Pointer Tool (Select & Move)"
			>
				<PointerIcon size={20} />
			</button>
			<button
				className={`tool-btn ${currentTool === "pencil" ? "active" : ""}`}
				onClick={() => onToolChange("pencil")}
				title="Pencil Tool"
			>
				<PencilIcon size={20} />
			</button>
			<button
				className={`tool-btn ${currentTool === "eraser" ? "active" : ""}`}
				onClick={() => onToolChange("eraser")}
				title="Eraser Tool"
			>
				<EraserIcon size={20} />
			</button>
			<button
				className={`tool-btn ${currentTool === "fill" ? "active" : ""}`}
				onClick={() => onToolChange("fill")}
				title="Fill Tool"
			>
				<FillIcon size={20} />
			</button>
			<button
				className={`tool-btn ${currentTool === "rect" ? "active" : ""}`}
				onClick={() => onToolChange("rect")}
				title="Rectangle Tool"
			>
				<RectangleIcon size={20} />
			</button>
			<button
				className={`tool-btn ${currentTool === "entity" ? "active" : ""}`}
				onClick={() => onToolChange("entity")}
				title="Entity Tool"
			>
				<EntityIcon size={20} />
			</button>
		</div>
	);
};
