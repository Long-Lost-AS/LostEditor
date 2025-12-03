import type { PolygonCollider } from "../types";
import { CustomPropertiesEditor } from "./CustomPropertiesEditor";
import { DragNumberInput } from "./DragNumberInput";

type PositionMode = "read-only" | "editable" | "conditional";
type InputBorderStyle = "minimal" | "bordered";

interface ColliderPropertiesPanelProps {
	collider: PolygonCollider | null;
	selectedPointIndex: number | null;
	onUpdateCollider?: (
		colliderId: string,
		updates: Partial<PolygonCollider>,
	) => void;
	onUpdateColliderPoint?: (
		colliderId: string,
		pointIndex: number,
		x: number,
		y: number,
	) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	onClose?: () => void;
	showHeader?: boolean;
	headerTitle?: string;
	showPointCount?: boolean;
	positionMode?: PositionMode;
	inputBorderStyle?: InputBorderStyle;
	emptyMessage?: string;
}

export const ColliderPropertiesPanel = ({
	collider,
	selectedPointIndex,
	onUpdateCollider,
	onUpdateColliderPoint,
	onDragStart,
	onDragEnd,
	onClose,
	showHeader = true,
	headerTitle = "COLLIDER PROPERTIES",
	showPointCount = true,
	positionMode = "read-only",
	inputBorderStyle = "minimal",
	emptyMessage = "No collider selected",
}: ColliderPropertiesPanelProps) => {
	if (!collider) {
		return <div className="p-4 text-gray-500">{emptyMessage}</div>;
	}

	// Get center position (now stored directly in collider.position)
	const posX = collider.position?.x ?? 0;
	const posY = collider.position?.y ?? 0;

	const handleUpdateName = (e: React.ChangeEvent<HTMLInputElement>) => {
		onUpdateCollider?.(collider.id, { name: e.target.value });
	};

	const handleUpdateType = (e: React.ChangeEvent<HTMLInputElement>) => {
		onUpdateCollider?.(collider.id, { type: e.target.value });
	};

	const handlePropertiesChange = (properties: Record<string, string>) => {
		onUpdateCollider?.(collider.id, { properties });
	};

	const handlePositionChange = (newPosX: number, newPosY: number) => {
		// Just update position directly - points are offsets from position
		onUpdateCollider?.(collider.id, {
			position: { x: Math.round(newPosX), y: Math.round(newPosY) },
		});
	};

	// Get selected point in world coordinates for display
	const selectedPointOffset =
		selectedPointIndex !== null && selectedPointIndex < collider.points.length
			? collider.points[selectedPointIndex]
			: null;

	// Convert to world coordinates for user-friendly display
	const selectedPointWorld = selectedPointOffset
		? { x: selectedPointOffset.x + posX, y: selectedPointOffset.y + posY }
		: null;

	// Input style based on border style variant
	const inputStyle =
		inputBorderStyle === "bordered"
			? {
					background: "#3e3e42",
					color: "#cccccc",
					border: "1px solid #555",
				}
			: {
					background: "#3e3e42",
					color: "#cccccc",
				};

	const inputClassName =
		inputBorderStyle === "bordered"
			? "w-full text-sm px-2.5 py-1.5 rounded outline-none focus:outline-none"
			: "w-full text-sm px-2.5 py-1.5 rounded border-none outline-none";

	const handleInputFocus =
		inputBorderStyle === "bordered"
			? (e: React.FocusEvent<HTMLInputElement>) => {
					e.currentTarget.style.borderColor = "#007acc";
				}
			: undefined;

	const handleInputBlur =
		inputBorderStyle === "bordered"
			? (e: React.FocusEvent<HTMLInputElement>) => {
					e.currentTarget.style.borderColor = "#555";
				}
			: undefined;

	// Determine whether to show center position section
	const showCenterPosition =
		positionMode === "read-only" ||
		positionMode === "editable" ||
		(positionMode === "conditional" && selectedPointIndex === null);

	const centerPositionLabel =
		positionMode === "read-only"
			? "Center Position (Read-only)"
			: positionMode === "editable"
				? "Collider Position"
				: "Position";

	return (
		<div
			className="flex flex-col h-full overflow-hidden"
			style={{ background: "#252526" }}
		>
			<div className="flex-1 overflow-y-auto">
				{/* Header */}
				{showHeader && (
					<div
						className="p-4 flex items-center justify-between"
						style={{ borderBottom: "1px solid #3e3e42" }}
					>
						<h3 className="text-sm font-semibold" style={{ color: "#cccccc" }}>
							{headerTitle}
						</h3>
						{onClose && (
							<button
								type="button"
								onClick={onClose}
								className="text-gray-400 hover:text-gray-200 transition-colors"
								title="Close"
							>
								✕
							</button>
						)}
					</div>
				)}

				{/* Properties */}
				<div className="p-4 space-y-4">
					{/* Name */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Name
						</div>
						<input
							type="text"
							value={collider.name}
							onChange={handleUpdateName}
							placeholder="Unnamed Collider"
							className={inputClassName}
							style={inputStyle}
							onFocus={handleInputFocus}
							onBlur={handleInputBlur}
							spellCheck={false}
						/>
					</div>

					{/* Type */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Type
						</div>
						<input
							type="text"
							value={collider.type}
							onChange={handleUpdateType}
							placeholder="wall, trigger, damage, etc."
							className={inputClassName}
							style={inputStyle}
							onFocus={handleInputFocus}
							onBlur={handleInputBlur}
							spellCheck={false}
						/>
					</div>

					{/* Center Position */}
					{showCenterPosition && (
						<div>
							<div
								className="text-xs font-medium block mb-1.5"
								style={{ color: "#858585" }}
							>
								{centerPositionLabel}
							</div>
							<div className="grid grid-cols-2 gap-2">
								<div className="flex">
									<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
										X
									</div>
									{positionMode === "read-only" ? (
										<div
											className="flex-1 px-2.5 py-1.5 text-sm rounded-r"
											style={{ background: "#3e3e42", color: "#858585" }}
										>
											{Math.round(posX)}
										</div>
									) : (
										<div className="flex-1">
											<DragNumberInput
												value={posX}
												onChange={(newX) => handlePositionChange(newX, posY)}
												onInput={(newX) => handlePositionChange(newX, posY)}
												onDragStart={onDragStart}
												onDragEnd={onDragEnd}
												dragSpeed={1}
												precision={1}
												roundedLeft={false}
											/>
										</div>
									)}
								</div>
								<div className="flex">
									<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
										Y
									</div>
									{positionMode === "read-only" ? (
										<div
											className="flex-1 px-2.5 py-1.5 text-sm rounded-r"
											style={{ background: "#3e3e42", color: "#858585" }}
										>
											{Math.round(posY)}
										</div>
									) : (
										<div className="flex-1">
											<DragNumberInput
												value={posY}
												onChange={(newY) => handlePositionChange(posX, newY)}
												onInput={(newY) => handlePositionChange(posX, newY)}
												onDragStart={onDragStart}
												onDragEnd={onDragEnd}
												dragSpeed={1}
												precision={1}
												roundedLeft={false}
											/>
										</div>
									)}
								</div>
							</div>
						</div>
					)}

					{/* Point Count */}
					{showPointCount && (
						<div>
							<div
								className="text-xs font-medium block mb-1.5"
								style={{ color: "#858585" }}
							>
								{positionMode === "editable" ? "Points" : "Point Count"}
							</div>
							<div
								className="px-2.5 py-1.5 text-sm rounded"
								style={
									inputBorderStyle === "bordered"
										? {
												background: "#3e3e42",
												color: "#858585",
												border: "1px solid #555",
											}
										: { background: "#3e3e42", color: "#858585" }
								}
							>
								{collider.points.length} points
							</div>
						</div>
					)}

					{/* Selected Point Position (shown in world coordinates) */}
					{selectedPointWorld && selectedPointIndex !== null && (
						<div>
							<div
								className="text-xs font-medium block mb-1.5"
								style={{ color: "#858585" }}
							>
								{positionMode === "conditional"
									? "Point Position"
									: `Selected Point #${selectedPointIndex}`}
							</div>
							<div className="grid grid-cols-2 gap-2">
								<div className="flex">
									<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
										X
									</div>
									<div className="flex-1">
										<DragNumberInput
											value={selectedPointWorld.x}
											onChange={(worldX) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													worldX - posX, // Convert to offset
													selectedPointWorld.y - posY,
												)
											}
											onInput={(worldX) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													worldX - posX, // Convert to offset
													selectedPointWorld.y - posY,
												)
											}
											onDragStart={onDragStart}
											onDragEnd={onDragEnd}
											dragSpeed={1}
											precision={0}
											roundedLeft={false}
										/>
									</div>
								</div>
								<div className="flex">
									<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
										Y
									</div>
									<div className="flex-1">
										<DragNumberInput
											value={selectedPointWorld.y}
											onChange={(worldY) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													selectedPointWorld.x - posX,
													worldY - posY, // Convert to offset
												)
											}
											onInput={(worldY) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													selectedPointWorld.x - posX,
													worldY - posY, // Convert to offset
												)
											}
											onDragStart={onDragStart}
											onDragEnd={onDragEnd}
											dragSpeed={1}
											precision={0}
											roundedLeft={false}
										/>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Custom Properties */}
					<CustomPropertiesEditor
						properties={collider.properties || {}}
						onChange={handlePropertiesChange}
					/>
				</div>
			</div>
		</div>
	);
};
