import { useCallback, useEffect, useMemo } from "react";
import { useEditor } from "../context/EditorContext";
import type {
	CollisionEditorTab,
	EntityEditorTab,
	PolygonCollider,
} from "../types";
import { isEditableElementFocused } from "../utils/keyboardUtils";
import { CollisionEditor } from "./CollisionEditor";

interface CollisionEditorViewProps {
	tab: CollisionEditorTab;
}

export const CollisionEditorView = ({ tab }: CollisionEditorViewProps) => {
	const {
		getTilesetById,
		updateTileset,
		updateTabData,
		tabs,
		saveTilesetByTabId,
	} = useEditor();

	// Fetch the source data based on sourceType
	const sourceData = useMemo(() => {
		if (tab.sourceType === "tile") {
			const tileset = getTilesetById(tab.sourceId);
			if (!tileset) return null;

			const tile = tileset.tiles.find((t) => t.id === tab.tileId);
			if (!tile) return null;

			return {
				type: "tile" as const,
				tileset,
				tile,
				width: tile.width !== 0 ? tile.width : tileset.tileWidth,
				height: tile.height !== 0 ? tile.height : tileset.tileHeight,
				colliders: tile.colliders,
				backgroundImage: tileset.imageData,
				backgroundRect: {
					x: tile.x,
					y: tile.y,
					width: tile.width !== 0 ? tile.width : tileset.tileWidth,
					height: tile.height !== 0 ? tile.height : tileset.tileHeight,
				},
			};
		} else {
			// Find the entity tab
			const entityTab = tab.sourceTabId
				? (tabs.find((t) => t.id === tab.sourceTabId) as
						| EntityEditorTab
						| undefined)
				: null;

			if (!entityTab || entityTab.type !== "entity-editor") return null;

			const entity = entityTab.entityData;

			// Calculate bounding box for entity (use first sprite layer)
			const firstSprite = entity.sprites?.[0];
			const bbox = firstSprite
				? {
						x: firstSprite.sprite.x,
						y: firstSprite.sprite.y,
						width: firstSprite.sprite.width,
						height: firstSprite.sprite.height,
					}
				: { x: 0, y: 0, width: 32, height: 32 };

			return {
				type: "entity" as const,
				entityTab,
				entity,
				width: Math.max(bbox.width, 1),
				height: Math.max(bbox.height, 1),
				colliders: entity.colliders,
				backgroundImage: undefined, // SpriteLayer doesn't have imageData
				backgroundRect: bbox,
			};
		}
	}, [
		tab.sourceType,
		tab.sourceId,
		tab.sourceTabId,
		tab.tileId,
		getTilesetById,
		tabs,
	]);

	// Handle collision updates
	const handleCollisionUpdate = useCallback(
		(colliders: PolygonCollider[]) => {
			if (sourceData?.type === "tile") {
				const { tileset, tile } = sourceData;
				const updatedTiles = tileset.tiles.map((t) =>
					t.id === tile.id ? { ...t, colliders } : t,
				);
				updateTileset(tileset.id, { tiles: updatedTiles });

				// Mark the source tileset tab as dirty if it exists
				if (tab.sourceTabId) {
					updateTabData(tab.sourceTabId, { isDirty: true });
				}
			} else if (sourceData?.type === "entity") {
				const { entityTab, entity } = sourceData;
				updateTabData(entityTab.id, {
					entityData: {
						...entity,
						colliders,
					},
				});
			}
		},
		[sourceData, tab.sourceTabId, updateTileset, updateTabData],
	);

	// Handle Cmd+S to save the source tileset
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't intercept shortcuts when user is typing in an input field
			if (isEditableElementFocused(e)) {
				return;
			}

			// Cmd/Ctrl+S - Save tileset
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key === "s" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				// For tile colliders, save the tileset
				if (sourceData?.type === "tile" && tab.sourceTabId) {
					// Save the tileset directly by tab ID without switching tabs
					const sourceTab = tabs.find((t) => t.id === tab.sourceTabId);
					if (sourceTab?.type === "tileset-editor") {
						saveTilesetByTabId(tab.sourceTabId);
					}
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [sourceData, tab.sourceTabId, tabs, saveTilesetByTabId]);

	// Show error if source not found
	if (!sourceData) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-red-400">
					{tab.sourceType === "tile" ? "Tile not found" : "Entity not found"}
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col bg-gray-900">
			<CollisionEditor
				width={sourceData.width}
				height={sourceData.height}
				colliders={sourceData.colliders}
				onUpdate={handleCollisionUpdate}
				backgroundImage={sourceData.backgroundImage}
				backgroundRect={sourceData.backgroundRect}
			/>
		</div>
	);
};
