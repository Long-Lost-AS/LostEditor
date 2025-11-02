import React, { useState, useRef, useEffect } from "react";

interface DragNumberInputProps {
	value: number;
	onChange: (value: number) => void; // Called when drag/edit completes (for undo/redo)
	onInput?: (value: number) => void; // Called during drag for live updates
	onDragStart?: () => void; // Called when drag starts
	onDragEnd?: () => void; // Called when drag ends
	min?: number;
	max?: number;
	step?: number;
	dragSpeed?: number; // How fast the value changes while dragging (default: 0.01)
	precision?: number; // Decimal places to show (default: 2)
	className?: string;
	roundedLeft?: boolean; // Whether to round the left corners (default: true)
}

export const DragNumberInput: React.FC<DragNumberInputProps> = ({
	value,
	onChange,
	onInput,
	onDragStart,
	onDragEnd,
	min = -Infinity,
	max = Infinity,
	step = 0.01,
	dragSpeed = 0.01,
	precision = 2,
	className = "",
	roundedLeft = true,
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [inputValue, setInputValue] = useState((value ?? 0).toFixed(precision));
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartValue, setDragStartValue] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Update input value when prop changes
	useEffect(() => {
		if (!isEditing) {
			setInputValue((value ?? 0).toFixed(precision));
		}
	}, [value, precision, isEditing]);

	const clampValue = (val: number) => {
		return Math.max(min, Math.min(max, val));
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		if (isEditing) return;

		setIsDragging(true);
		setDragStartX(e.clientX);
		setDragStartValue(value ?? 0);
		onDragStart?.();
		e.preventDefault();
	};

	useEffect(() => {
		if (isDragging) {
			let lastValue = value ?? 0;

			const handleMouseMove = (e: MouseEvent) => {
				const deltaX = e.clientX - dragStartX;
				const deltaValue = deltaX * dragSpeed;
				const newValue = clampValue(dragStartValue + deltaValue);
				lastValue = newValue;
				onInput?.(newValue); // Call onInput for live updates
			};

			const handleMouseUp = () => {
				setIsDragging(false);
				onDragEnd?.();
				if (lastValue !== value) {
					onChange(lastValue); // Call onChange once with final value for undo/redo
				}
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "ew-resize";

			return () => {
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
				document.body.style.cursor = "default";
			};
		}
	}, [isDragging, dragStartX, dragStartValue, dragSpeed, value, onChange, onInput, onDragStart, onDragEnd]);

	const handleDoubleClick = () => {
		setIsEditing(true);
		setTimeout(() => {
			inputRef.current?.select();
		}, 0);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(e.target.value);
	};

	const handleInputBlur = () => {
		const parsed = parseFloat(inputValue);
		if (!isNaN(parsed)) {
			onChange(clampValue(parsed));
		} else {
			setInputValue((value ?? 0).toFixed(precision));
		}
		setIsEditing(false);
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			inputRef.current?.blur();
		} else if (e.key === "Escape") {
			setInputValue((value ?? 0).toFixed(precision));
			setIsEditing(false);
		}
	};

	const handleDivFocus = () => {
		setIsEditing(true);
		setTimeout(() => {
			inputRef.current?.select();
		}, 0);
	};

	return (
		<div
			ref={containerRef}
			className={`relative ${className}`}
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
			style={{
				cursor: isEditing ? "text" : isDragging ? "ew-resize" : "ew-resize",
			}}
		>
			{isEditing ? (
				<input
					ref={inputRef}
					type="text"
					value={inputValue}
					onChange={handleInputChange}
					onBlur={handleInputBlur}
					onKeyDown={handleInputKeyDown}
					className={`w-full px-2.5 py-1.5 text-xs bg-[#3c3c3c] text-[#cccccc] border border-[#007acc] outline-none ${roundedLeft ? "rounded" : "rounded-r"}`}
					style={{ fontFamily: "monospace" }}
				/>
			) : (
				<div
					tabIndex={0}
					onFocus={handleDivFocus}
					className={`px-2.5 py-1.5 text-xs bg-[#3c3c3c] text-[#cccccc] border border-[#3e3e42] select-none ${roundedLeft ? "rounded" : "rounded-r"}`}
					style={{ fontFamily: "monospace" }}
				>
					{(value ?? 0).toFixed(precision)}
				</div>
			)}
		</div>
	);
};
