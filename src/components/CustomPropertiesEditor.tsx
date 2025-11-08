import type React from "react";
import { useState } from "react";
import { TrashIcon } from "./Icons";

interface CustomPropertiesEditorProps {
	properties: Record<string, string>;
	onChange: (properties: Record<string, string>) => void;
	title?: string;
}

export const CustomPropertiesEditor: React.FC<CustomPropertiesEditorProps> = ({
	properties,
	onChange,
	title = "Custom Properties",
}) => {
	// Track which keys are being edited (maps original key -> edited key text)
	const [editingKeys, setEditingKeys] = useState<Record<string, string>>({});
	// Track the last created empty key to auto-focus it
	const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null);

	const handleAddProperty = () => {
		// Just add an empty key property
		onChange({
			...properties,
			"": "",
		});
		setLastCreatedKey("");
	};

	const handleDeleteProperty = (key: string) => {
		const newProperties = { ...properties };
		delete newProperties[key];
		onChange(newProperties);

		// Clean up editing buffer
		const newEditingKeys = { ...editingKeys };
		delete newEditingKeys[key];
		setEditingKeys(newEditingKeys);
	};

	const handleKeyInputChange = (key: string, newKeyText: string) => {
		// Just update the local buffer, don't rename yet
		setEditingKeys({ ...editingKeys, [key]: newKeyText });
	};

	const handleKeyBlur = (key: string) => {
		const newKeyText = editingKeys[key];

		// If we have buffered text, commit the rename
		if (newKeyText !== undefined) {
			const trimmedKey = newKeyText.trim();

			// If empty and the original key is also empty, delete it
			// (user created a new property but didn't name it)
			if (!trimmedKey && key === "") {
				handleDeleteProperty(key);
				const newEditingKeys = { ...editingKeys };
				delete newEditingKeys[key];
				setEditingKeys(newEditingKeys);
				return;
			}

			// If changed and not duplicate, rename it
			if (trimmedKey !== key && trimmedKey) {
				// Check if new key already exists
				if (properties[trimmedKey]) {
					// Duplicate - don't rename, just clear buffer
					const newEditingKeys = { ...editingKeys };
					delete newEditingKeys[key];
					setEditingKeys(newEditingKeys);
					return;
				}

				// Rename the key
				const newProperties = { ...properties };
				const value = newProperties[key];
				delete newProperties[key];
				newProperties[trimmedKey] = value;
				onChange(newProperties);
			}

			// Clear the editing buffer for this key
			const newEditingKeys = { ...editingKeys };
			delete newEditingKeys[key];
			setEditingKeys(newEditingKeys);
		}
		// If no buffered text, user never typed - keep the property as-is
	};

	const handleUpdatePropertyValue = (key: string, value: string) => {
		onChange({
			...properties,
			[key]: value,
		});
	};

	// Callback ref to focus newly created key inputs
	const focusNewKeyInput = (input: HTMLInputElement | null) => {
		if (input && lastCreatedKey !== null) {
			input.focus();
			input.select();
			setLastCreatedKey(null); // Clear after focusing
		}
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-1.5">
				<div className="text-xs font-medium" style={{ color: "#858585" }}>
					{title}
				</div>
				<button
					type="button"
					onClick={handleAddProperty}
					className="text-xs px-2 py-1 rounded transition-colors"
					style={{ background: "#3e3e42", color: "#cccccc" }}
				>
					+ Add
				</button>
			</div>
			{properties && Object.keys(properties).length > 0 ? (
				<div className="space-y-2">
					{Object.entries(properties).map(([key, value]) => {
						// Use buffered value if editing, otherwise use the key name
						const displayKey =
							editingKeys[key] !== undefined ? editingKeys[key] : key;
						const isNewlyCreated = key === lastCreatedKey;

						return (
							<div
								key={key || `empty-${value}`}
								className="flex items-center gap-2"
							>
								<div className="flex-1" style={{ minWidth: 0 }}>
									<input
										ref={isNewlyCreated ? focusNewKeyInput : null}
										type="text"
										spellCheck={false}
										value={displayKey}
										onChange={(e) => {
											handleKeyInputChange(key, e.target.value);
										}}
										onBlur={() => {
											handleKeyBlur(key);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												// Commit the key change first
												handleKeyBlur(key);
												// Move focus to value input
												const valueInput = e.currentTarget
													.closest(".flex")
													?.querySelector(
														"input[placeholder='Value']",
													) as HTMLInputElement | null;
												if (valueInput) {
													valueInput.focus();
													valueInput.select();
												}
											} else if (e.key === "Escape") {
												// Clear buffer and delete if key is empty
												const newEditingKeys = { ...editingKeys };
												delete newEditingKeys[key];
												setEditingKeys(newEditingKeys);
												if (key === "") {
													handleDeleteProperty(key);
												}
											}
										}}
										placeholder="Key"
										className="w-full px-2.5 py-1.5 text-xs rounded outline-none"
										style={{
											background: "#3e3e42",
											color: "#cccccc",
											border: "1px solid #007acc",
										}}
									/>
								</div>
								<div className="flex-1" style={{ minWidth: 0 }}>
									<input
										type="text"
										spellCheck={false}
										value={value}
										onChange={(e) =>
											handleUpdatePropertyValue(key, e.target.value)
										}
										placeholder="Value"
										className="w-full px-2.5 py-1.5 text-xs rounded outline-none"
										style={{
											background: "#3e3e42",
											color: "#cccccc",
											border: "1px solid #007acc",
										}}
									/>
								</div>
								<button
									type="button"
									onClick={() => handleDeleteProperty(key)}
									className="p-1 hover:bg-[#4a4a4e] rounded transition-colors"
									style={{ color: "#cccccc" }}
									aria-label="Delete property"
								>
									<TrashIcon className="w-3.5 h-3.5" />
								</button>
							</div>
						);
					})}
				</div>
			) : (
				<div
					className="text-xs px-2.5 py-1.5 rounded"
					style={{ background: "#3e3e42", color: "#858585" }}
				>
					No custom properties
				</div>
			)}
		</div>
	);
};
