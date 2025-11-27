import { DragNumberInput } from "./DragNumberInput";

interface TintColor {
	r: number;
	g: number;
	b: number;
	a: number;
}

interface TintInputProps {
	tint: TintColor | undefined;
	onChange: (tint: TintColor) => void;
	/** Unique key to reset the color input when switching items */
	inputKey?: string;
}

export function TintInput({ tint, onChange, inputKey }: TintInputProps) {
	const r = tint?.r ?? 255;
	const g = tint?.g ?? 255;
	const b = tint?.b ?? 255;
	const a = tint?.a ?? 255;

	const hexColor = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

	const handleColorChange = (hex: string) => {
		const newR = Number.parseInt(hex.slice(1, 3), 16);
		const newG = Number.parseInt(hex.slice(3, 5), 16);
		const newB = Number.parseInt(hex.slice(5, 7), 16);
		onChange({ r: newR, g: newG, b: newB, a });
	};

	const handleOpacityChange = (val: number) => {
		const newA = Math.round((val / 100) * 255);
		onChange({ r, g, b, a: Math.max(0, Math.min(255, newA)) });
	};

	return (
		<div className="flex items-center gap-2">
			<input
				type="color"
				key={inputKey}
				defaultValue={hexColor}
				onInput={(e) => handleColorChange((e.target as HTMLInputElement).value)}
				className="flex-1 h-[36px] rounded cursor-pointer border-0"
				style={{
					backgroundColor: "transparent",
					padding: 0,
				}}
				title="Tint color"
			/>
			<div className="flex w-20">
				<div className="text-xs w-6 font-bold bg-cyan-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
					O
				</div>
				<div className="flex-1">
					<DragNumberInput
						value={Math.round((a / 255) * 100)}
						onChange={handleOpacityChange}
						onInput={handleOpacityChange}
						min={0}
						max={100}
						dragSpeed={1}
						precision={0}
						roundedLeft={false}
					/>
				</div>
			</div>
		</div>
	);
}
