import React, { useState, useRef, useEffect } from "react";

interface DragNumberInputProps {
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	dragSpeed?: number; // How fast the value changes while dragging (default: 0.01)
	precision?: number; // Decimal places to show (default: 2)
	className?: string;
}

export const DragNumberInput: React.FC<DragNumberInputProps> = ({
	value,
	onChange,
	min = -Infinity,
	max = Infinity,
	step = 0.01,
	dragSpeed = 0.01,
	precision = 2,
	className = "",
}) => {
	const [isEditing, setIsEditing] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [inputValue, setInputValue] = useState(value.toFixed(precision));
	const [dragStartX, setDragStartX] = useState(0);
	const [dragStartValue, setDragStartValue] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Update input value when prop changes
	useEffect(() => {
		if (!isEditing) {
			setInputValue(value.toFixed(precision));
		}
	}, [value, precision, isEditing]);

	const clampValue = (val: number) => {
		return Math.max(min, Math.min(max, val));
	};

	const handleMouseDown = (e: React.MouseEvent) => {
		if (isEditing) return;

		setIsDragging(true);
		setDragStartX(e.clientX);
		setDragStartValue(value);
		e.preventDefault();
	};

	const handleMouseMove = (e: MouseEvent) => {
		if (!isDragging) return;

		const deltaX = e.clientX - dragStartX;
		const deltaValue = deltaX * dragSpeed;
		const newValue = clampValue(dragStartValue + deltaValue);
		onChange(newValue);
	};

	const handleMouseUp = () => {
		setIsDragging(false);
	};

	useEffect(() => {
		if (isDragging) {
			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "ew-resize";

			return () => {
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
				document.body.style.cursor = "default";
			};
		}
	}, [isDragging, dragStartX, dragStartValue]);

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
			setInputValue(value.toFixed(precision));
		}
		setIsEditing(false);
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			inputRef.current?.blur();
		} else if (e.key === "Escape") {
			setInputValue(value.toFixed(precision));
			setIsEditing(false);
		}
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
					className="w-full px-2 py-1 text-sm bg-[#3c3c3c] text-[#cccccc] border border-[#007acc] outline-none"
					style={{ fontFamily: "monospace" }}
				/>
			) : (
				<div
					className="px-2 py-1 text-sm bg-[#3c3c3c] text-[#cccccc] border border-[#3e3e42] select-none"
					style={{ fontFamily: "monospace" }}
				>
					{value.toFixed(precision)}
				</div>
			)}
		</div>
	);
};
