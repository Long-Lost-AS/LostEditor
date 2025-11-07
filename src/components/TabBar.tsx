import type { AnyTab } from "../types";
import { EntityIcon, FileIcon, MapIcon, TilesetIcon } from "./Icons";

interface TabBarProps {
	tabs: AnyTab[];
	activeTabId: string | null;
	onTabClick: (tabId: string) => void;
	onTabClose: (tabId: string) => void;
}

export const TabBar = ({
	tabs,
	activeTabId,
	onTabClick,
	onTabClose,
}: TabBarProps) => {
	const getTabIcon = (type: string) => {
		switch (type) {
			case "map":
				return <MapIcon />;
			case "tileset":
				return <TilesetIcon />;
			case "entity-editor":
				return <EntityIcon />;
			default:
				return <FileIcon />;
		}
	};

	return (
		<div className="tab-bar">
			{tabs.map((tab) => (
				<div
					key={tab.id}
					className={`tab ${tab.id === activeTabId ? "active" : ""}`}
					onClick={() => onTabClick(tab.id)}
				>
					<span className="tab-icon">{getTabIcon(tab.type)}</span>
					<span className="tab-title">
						{tab.title}
						{tab.isDirty && <span className="tab-dirty">●</span>}
					</span>
					<button
						type="button"
						className="tab-close"
						onClick={(e) => {
							e.stopPropagation();
							onTabClose(tab.id);
						}}
						title="Close tab"
					>
						×
					</button>
				</div>
			))}
		</div>
	);
};
