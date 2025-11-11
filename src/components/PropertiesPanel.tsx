import { useEffect, useState } from "react";
import { useEditor } from "../context/EditorContext";

export const PropertiesPanel = () => {
	const { getActiveMap, updateMap, getActiveMapTab } = useEditor();
	const activeMap = getActiveMap();
	const activeMapTab = getActiveMapTab();

	const [width, setWidth] = useState(activeMap?.width ?? 32);
	const [height, setHeight] = useState(activeMap?.height ?? 32);
	const [tileWidth, setTileWidth] = useState(activeMap?.tileWidth ?? 16);
	const [tileHeight, setTileHeight] = useState(activeMap?.tileHeight ?? 16);

	// Update local state when active map changes
	useEffect(() => {
		if (activeMap) {
			setWidth(activeMap.width);
			setHeight(activeMap.height);
			setTileWidth(activeMap.tileWidth);
			setTileHeight(activeMap.tileHeight);
		}
	}, [
		activeMap?.id,
		activeMap?.height,
		activeMap?.tileHeight,
		activeMap?.tileWidth,
		activeMap,
	]);

	const handleApply = () => {
		if (!activeMap || !activeMapTab) return;

		updateMap(activeMapTab.mapId, {
			width,
			height,
			tileWidth,
			tileHeight,
		});
	};

	return (
		<div className="panel">
			<h3>Properties</h3>
			<div className="property-group">
				<div className="text-sm font-medium mb-2">Map Size</div>
				<div className="input-row">
					<input
						type="number"
						value={width}
						onChange={(e) => setWidth(Number(e.target.value))}
						min="1"
						max="200"
						aria-label="Map width"
						spellCheck={false}
					/>
					<span>×</span>
					<input
						type="number"
						value={height}
						onChange={(e) => setHeight(Number(e.target.value))}
						min="1"
						max="200"
						aria-label="Map height"
						spellCheck={false}
					/>
				</div>
			</div>
			<div className="property-group">
				<div className="text-sm font-medium mb-2">Tile Size</div>
				<div className="input-row">
					<input
						type="number"
						value={tileWidth}
						onChange={(e) => setTileWidth(Number(e.target.value))}
						min="1"
						aria-label="Tile width"
						max="256"
						spellCheck={false}
					/>
					<span>×</span>
					<input
						type="number"
						value={tileHeight}
						onChange={(e) => setTileHeight(Number(e.target.value))}
						min="1"
						max="256"
						aria-label="Tile height"
						spellCheck={false}
					/>
				</div>
			</div>
			<button type="button" onClick={handleApply} className="apply-btn">
				Apply
			</button>
		</div>
	);
};
