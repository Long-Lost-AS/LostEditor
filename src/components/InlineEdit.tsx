/**
 * InlineEdit component
 * Reusable component for inline text editing with click-to-edit behavior
 */

import { useEffect, useRef, useState } from "react";

export interface InlineEditProps {
	/** Current value to display/edit */
	value: string;
	/** Callback when value changes */
	onChange: (newValue: string) => void;
	/** Placeholder text when value is empty (default: "(none)") */
	placeholder?: string;
	/** Input type (default: "text") */
	type?: "text" | "number";
	/** Optional aria-label for accessibility */
	ariaLabel?: string;
	/** Additional className for styling */
	className?: string;
	/** Whether the component is currently disabled */
	disabled?: boolean;
	/** Whether to auto-focus the input when editing starts */
	autoFocus?: boolean;
	/** Whether to select all text when editing starts */
	selectAllOnFocus?: boolean;
}

/**
 * Inline editable text component with VS Code-like styling
 */
export const InlineEdit = ({
	value,
	onChange,
	placeholder = "(none)",
	type = "text",
	ariaLabel,
	className = "",
	disabled = false,
	autoFocus = true,
	selectAllOnFocus = true,
}: InlineEditProps) => {
	const [isEditing, setIsEditing] = useState(false);
	const [localValue, setLocalValue] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);

	// Update local value when prop changes
	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	// Auto-focus and select when editing starts
	useEffect(() => {
		if (isEditing && inputRef.current) {
			if (autoFocus) {
				inputRef.current.focus();
			}
			if (selectAllOnFocus) {
				inputRef.current.select();
			}
		}
	}, [isEditing, autoFocus, selectAllOnFocus]);

	const handleSubmit = () => {
		if (localValue !== value) {
			onChange(localValue);
		}
		setIsEditing(false);
	};

	const handleCancel = () => {
		setLocalValue(value); // Reset to original value
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			handleCancel();
		}
	};

	const handleBlur = () => {
		handleSubmit();
	};

	const startEditing = () => {
		if (!disabled) {
			setIsEditing(true);
		}
	};

	if (isEditing) {
		return (
			<input
				ref={inputRef}
				type={type}
				value={localValue}
				onChange={(e) => setLocalValue(e.target.value)}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				className={`w-full px-2 py-1 text-sm rounded text-gray-200 focus:outline-none ${className}`}
				style={{
					background: "#3e3e42",
					border: "1px solid #007acc",
				}}
				aria-label={ariaLabel}
				disabled={disabled}
			/>
		);
	}

	return (
		<div
			onClick={startEditing}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					startEditing();
				}
			}}
			className={`px-2 py-1 text-sm rounded text-gray-200 ${
				disabled ? "cursor-not-allowed opacity-50" : "cursor-text"
			} ${className}`}
			style={{
				background: "#3e3e42",
				border: "1px solid #3e3e42",
			}}
			onMouseEnter={(e) => {
				if (!disabled) {
					e.currentTarget.style.background = "#4a4a4e";
				}
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "#3e3e42";
			}}
			role="button"
			tabIndex={disabled ? -1 : 0}
			aria-label={ariaLabel}
		>
			{value || placeholder}
		</div>
	);
};
