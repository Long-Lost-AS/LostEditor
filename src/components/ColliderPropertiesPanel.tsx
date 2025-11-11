import type { MapData, PolygonCollider } from "../types";
import { DragNumberInput } from "./DragNumberInput";

interface ColliderPropertiesPanelProps {
	selectedColliderId: string | null;
	selectedPointIndex: number | null;
	mapData: MapData;
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
}

export const ColliderPropertiesPanel = ({
	selectedColliderId,
	selectedPointIndex,
	mapData,
	onUpdateCollider,
	onUpdateColliderPoint,
	onDragStart,
	onDragEnd,
}: ColliderPropertiesPanelProps) => {
	if (!selectedColliderId || !mapData.colliders) {
		return <div className="p-4 text-gray-500">No collider selected</div>;
	}

	const collider = mapData.colliders.find((c) => c.id === selectedColliderId);
	if (!collider) {
		return <div className="p-4 text-gray-500">Collider not found</div>;
	}

	// Calculate center position from all points
	const centerX =
		collider.points.reduce((sum, p) => sum + p.x, 0) / collider.points.length;
	const centerY =
		collider.points.reduce((sum, p) => sum + p.y, 0) / collider.points.length;

	const handleUpdateName = (e: React.ChangeEvent<HTMLInputElement>) => {
		onUpdateCollider?.(collider.id, { name: e.target.value });
	};

	const handleUpdateType = (e: React.ChangeEvent<HTMLInputElement>) => {
		onUpdateCollider?.(collider.id, { type: e.target.value });
	};

	const selectedPoint =
		selectedPointIndex !== null && selectedPointIndex < collider.points.length
			? collider.points[selectedPointIndex]
			: null;

	return (
		<div
			className="flex flex-col h-full overflow-hidden"
			style={{ background: "#252526" }}
		>
			<div className="flex-1 overflow-y-auto">
				{/* Header */}
				<div
					className="p-4 flex items-center justify-between"
					style={{ borderBottom: "1px solid #3e3e42" }}
				>
					<h3 className="text-sm font-semibold" style={{ color: "#cccccc" }}>
						COLLIDER PROPERTIES
					</h3>
				</div>

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
							className="w-full text-sm px-2.5 py-1.5 rounded border-none outline-none"
							style={{
								background: "#3e3e42",
								color: "#cccccc",
							}}
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
							className="w-full text-sm px-2.5 py-1.5 rounded border-none outline-none"
							style={{
								background: "#3e3e42",
								color: "#cccccc",
							}}
						/>
					</div>

					{/* Center Position */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Center Position (Read-only)
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="flex">
								<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
									X
								</div>
								<div
									className="flex-1 px-2.5 py-1.5 text-sm rounded-r"
									style={{ background: "#3e3e42", color: "#858585" }}
								>
									{Math.round(centerX)}
								</div>
							</div>
							<div className="flex">
								<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
									Y
								</div>
								<div
									className="flex-1 px-2.5 py-1.5 text-sm rounded-r"
									style={{ background: "#3e3e42", color: "#858585" }}
								>
									{Math.round(centerY)}
								</div>
							</div>
						</div>
					</div>

					{/* Point Count */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Point Count
						</div>
						<div
							className="px-2.5 py-1.5 text-sm rounded"
							style={{ background: "#3e3e42", color: "#858585" }}
						>
							{collider.points.length} points
						</div>
					</div>

					{/* Selected Point Position */}
					{selectedPoint && selectedPointIndex !== null && (
						<div>
							<div
								className="text-xs font-medium block mb-1.5"
								style={{ color: "#858585" }}
							>
								Selected Point #{selectedPointIndex}
							</div>
							<div className="grid grid-cols-2 gap-2">
								<div className="flex">
									<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
										X
									</div>
									<div className="flex-1">
										<DragNumberInput
											value={selectedPoint.x}
											onChange={(x) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													x,
													selectedPoint.y,
												)
											}
											onInput={(x) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													x,
													selectedPoint.y,
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
											value={selectedPoint.y}
											onChange={(y) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													selectedPoint.x,
													y,
												)
											}
											onInput={(y) =>
												onUpdateColliderPoint?.(
													collider.id,
													selectedPointIndex,
													selectedPoint.x,
													y,
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
					{collider.properties &&
						Object.keys(collider.properties).length > 0 && (
							<div>
								<div
									className="text-xs font-medium block mb-1.5"
									style={{ color: "#858585" }}
								>
									Custom Properties
								</div>
								<div className="space-y-1">
									{Object.entries(collider.properties).map(([key, value]) => (
										<div
											key={key}
											className="px-2.5 py-1.5 text-xs rounded"
											style={{ background: "#3e3e42" }}
										>
											<span className="text-gray-400 font-mono">{key}:</span>
											<span className="text-white ml-2">{String(value)}</span>
										</div>
									))}
								</div>
							</div>
						)}
				</div>
			</div>
		</div>
	);
};
