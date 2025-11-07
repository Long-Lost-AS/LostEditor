import { invoke } from "@tauri-apps/api/core";
import { useEditor } from "../context/EditorContext";

export const EmptyState = () => {
	const {
		currentProjectPath,
		newProject,
		loadProject,
		newMap,
		openMapFromFile,
		newTileset,
		openTilesetFromFile,
	} = useEditor();

	const handleLoadProject = async () => {
		const result = await invoke<{ canceled: boolean; filePaths?: string[] }>(
			"show_open_dialog",
			{
				options: {
					title: "Open Project",
					filters: [{ name: "Lost Editor Project", extensions: ["lostproj"] }],
					properties: ["openFile"],
				},
			},
		);

		if (result.filePaths?.[0]) {
			await loadProject(result.filePaths[0]);
		}
	};

	const handleLoadMap = async () => {
		const result = await invoke<{ canceled: boolean; filePaths?: string[] }>(
			"show_open_dialog",
			{
				options: {
					title: "Open Map",
					filters: [{ name: "Lost Editor Map", extensions: ["lostmap"] }],
					properties: ["openFile"],
				},
			},
		);

		if (result.filePaths?.[0]) {
			await openMapFromFile(result.filePaths[0]);
		}
	};

	const handleLoadTileset = async () => {
		const result = await invoke<{ canceled: boolean; filePaths?: string[] }>(
			"show_open_dialog",
			{
				options: {
					title: "Open Tileset",
					filters: [{ name: "Lost Editor Tileset", extensions: ["lostset"] }],
					properties: ["openFile"],
				},
			},
		);

		if (result.filePaths?.[0]) {
			await openTilesetFromFile(result.filePaths[0]);
		}
	};

	return (
		<div className="empty-state">
			<div className="empty-state-content">
				<h2>Welcome to Lost Editor</h2>

				{!currentProjectPath ? (
					<div className="empty-state-section">
						<p>Get started by creating or loading a project</p>
						<div className="empty-state-buttons">
							<button
								type="button"
								onClick={newProject}
								className="empty-state-btn primary"
							>
								New Project
							</button>
							<button
								type="button"
								onClick={handleLoadProject}
								className="empty-state-btn"
							>
								Load Project
							</button>
						</div>
					</div>
				) : (
					<div className="empty-state-section">
						<p>Create or open resources to get started</p>
						<div className="empty-state-buttons">
							<button
								type="button"
								onClick={() => newMap()}
								className="empty-state-btn"
							>
								New Map
							</button>
							<button
								type="button"
								onClick={handleLoadMap}
								className="empty-state-btn"
							>
								Load Map
							</button>
							<button
								type="button"
								onClick={() => newTileset()}
								className="empty-state-btn"
							>
								New Tileset
							</button>
							<button
								type="button"
								onClick={handleLoadTileset}
								className="empty-state-btn"
							>
								Load Tileset
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
