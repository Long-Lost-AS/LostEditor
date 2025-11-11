import type { MapData, PointInstance } from "../types";
import { DragNumberInput } from "./DragNumberInput";

interface PointPropertiesPanelProps {
	selectedPointId: string | null;
	mapData: MapData;
	onUpdatePoint?: (pointId: string, updates: Partial<PointInstance>) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}

export const PointPropertiesPanel = ({
	selectedPointId,
	mapData,
	onUpdatePoint,
	onDragStart,
	onDragEnd,
}: PointPropertiesPanelProps) => {
	if (!selectedPointId || !mapData.points) {
		return <div className="p-4 text-gray-500">No point selected</div>;
	}

	const point = mapData.points.find((p) => p.id === selectedPointId);
	if (!point) {
		return <div className="p-4 text-gray-500">Point not found</div>;
	}

	const handleUpdatePosition = (x: number, y: number) => {
		onUpdatePoint?.(point.id, { x, y });
	};

	const handleUpdateName = (e: React.ChangeEvent<HTMLInputElement>) => {
		onUpdatePoint?.(point.id, { name: e.target.value });
	};

	const handleUpdateType = (e: React.ChangeEvent<HTMLInputElement>) => {
		onUpdatePoint?.(point.id, { type: e.target.value });
	};

	return (
		<div
			className="flex flex-col h-full overflow-hidden"
			style={{ background: "#252526" }}
		>
			<div className="flex-1 overflow-y-auto">
				{/* Header */}
				<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
					<h3 className="text-sm font-semibold" style={{ color: "#cccccc" }}>
						POINT PROPERTIES
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
							value={point.name}
							onChange={handleUpdateName}
							placeholder="Unnamed Point"
							className="w-full text-sm px-2.5 py-1.5 rounded border-none outline-none"
							style={{
								background: "#3e3e42",
								color: "#cccccc",
							}}
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
							value={point.type}
							onChange={handleUpdateType}
							placeholder="spawn, waypoint, poi, etc."
							className="w-full text-sm px-2.5 py-1.5 rounded border-none outline-none"
							style={{
								background: "#3e3e42",
								color: "#cccccc",
							}}
							spellCheck={false}
						/>
					</div>

					{/* Position */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Position
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="flex">
								<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
									X
								</div>
								<div className="flex-1">
									<DragNumberInput
										value={point.x}
										onChange={(x) => handleUpdatePosition(x, point.y)}
										onInput={(x) => handleUpdatePosition(x, point.y)}
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
										value={point.y}
										onChange={(y) => handleUpdatePosition(point.x, y)}
										onInput={(y) => handleUpdatePosition(point.x, y)}
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

					{/* Custom Properties */}
					{point.properties && Object.keys(point.properties).length > 0 && (
						<div>
							<div
								className="text-xs font-medium block mb-1.5"
								style={{ color: "#858585" }}
							>
								Custom Properties
							</div>
							<div className="space-y-1">
								{Object.entries(point.properties).map(([key, value]) => (
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
