/**
 * CoordinateInput component
 * Displays X and Y inputs with labels for editing coordinates
 */

import { DragNumberInput } from "./DragNumberInput";

export interface CoordinateInputProps {
	/** X coordinate value */
	x: number;
	/** Y coordinate value */
	y: number;
	/** Callback when X changes */
	onXChange: (newX: number) => void;
	/** Callback when Y changes */
	onYChange: (newY: number) => void;
	/** Optional callback when input starts (for batching) */
	onInputStart?: () => void;
	/** Optional callback when input ends (for batching) */
	onInputEnd?: () => void;
	/** Drag speed multiplier (default: 1) */
	dragSpeed?: number;
	/** Number precision (default: 1 for integers) */
	precision?: number;
	/** Optional labels for X and Y (default: "X" and "Y") */
	labels?: { x?: string; y?: string };
	/** Optional colors for labels */
	colors?: { x?: string; y?: string };
}

/**
 * Component for editing X/Y coordinates with drag support
 */
export const CoordinateInput = ({
	x,
	y,
	onXChange,
	onYChange,
	onInputStart,
	onInputEnd,
	dragSpeed = 1,
	precision = 1,
	labels = {},
	colors = {},
}: CoordinateInputProps) => {
	const xLabel = labels.x ?? "X";
	const yLabel = labels.y ?? "Y";
	const xColor = colors.x ?? "bg-red-500";
	const yColor = colors.y ?? "bg-green-500";

	return (
		<div className="space-y-2">
			{/* X Input */}
			<div className="flex">
				<div
					className={`text-xs w-6 font-bold ${xColor} px-1 py-1.5 text-center flex items-center justify-center rounded-l`}
				>
					{xLabel}
				</div>
				<div className="flex-1">
					<DragNumberInput
						value={x}
						onInput={onXChange}
						onChange={(newValue) => {
							if (onInputStart) onInputStart();
							onXChange(newValue);
							if (onInputEnd) onInputEnd();
						}}
						onDragStart={onInputStart}
						onDragEnd={onInputEnd}
						dragSpeed={dragSpeed}
						precision={precision}
						roundedLeft={false}
					/>
				</div>
			</div>

			{/* Y Input */}
			<div className="flex">
				<div
					className={`text-xs w-6 font-bold ${yColor} px-1 py-1.5 text-center flex items-center justify-center rounded-l`}
				>
					{yLabel}
				</div>
				<div className="flex-1">
					<DragNumberInput
						value={y}
						onInput={onYChange}
						onChange={(newValue) => {
							if (onInputStart) onInputStart();
							onYChange(newValue);
							if (onInputEnd) onInputEnd();
						}}
						onDragStart={onInputStart}
						onDragEnd={onInputEnd}
						dragSpeed={dragSpeed}
						precision={precision}
						roundedLeft={false}
					/>
				</div>
			</div>
		</div>
	);
};
