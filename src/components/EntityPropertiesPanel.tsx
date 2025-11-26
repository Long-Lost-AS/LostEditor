import { useEditor } from "../context/EditorContext";
import { entityManager } from "../managers/EntityManager";
import type { EntityInstance, MapData } from "../types";
import { CustomPropertiesEditor } from "./CustomPropertiesEditor";
import { DragNumberInput } from "./DragNumberInput";

interface EntityPropertiesPanelProps {
	selectedEntityId: string | null;
	mapData: MapData;
	onUpdateEntity?: (entityId: string, updates: Partial<EntityInstance>) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}

export const EntityPropertiesPanel = ({
	selectedEntityId,
	mapData,
	onUpdateEntity,
	onDragStart,
	onDragEnd,
}: EntityPropertiesPanelProps) => {
	const { tilesets } = useEditor();

	if (!selectedEntityId || !mapData.entities) {
		return <div className="p-4 text-gray-500">No entity selected</div>;
	}

	const entity = mapData.entities.find((e) => e.id === selectedEntityId);
	if (!entity) {
		return <div className="p-4 text-gray-500">Entity not found</div>;
	}

	const entityDef = entityManager.getEntityDefinition(entity.entityDefId);
	// Get tileset from first sprite (entities can have sprites from multiple tilesets)
	const firstSpriteTilesetId = entityDef?.sprites?.[0]?.tilesetId;
	const tileset = firstSpriteTilesetId
		? tilesets.find((t) => t.id === firstSpriteTilesetId)
		: undefined;

	const handleUpdatePosition = (x: number, y: number) => {
		onUpdateEntity?.(entity.id, { x, y });
	};

	const handleUpdateRotation = (rotation: number) => {
		onUpdateEntity?.(entity.id, { rotation });
	};

	const handleUpdateScale = (x: number, y: number) => {
		onUpdateEntity?.(entity.id, { scale: { x, y } });
	};

	const handlePropertiesChange = (properties: Record<string, string>) => {
		onUpdateEntity?.(entity.id, { properties });
	};

	return (
		<div
			className="flex flex-col h-full overflow-hidden"
			style={{ background: "#252526" }}
		>
			<div className="flex-1 overflow-y-auto">
				{/* Header */}
				<div className="p-4" style={{ borderBottom: "1px solid #3e3e42" }}>
					<h3 className="text-sm font-semibold" style={{ color: "#cccccc" }}>
						ENTITY PROPERTIES
					</h3>
				</div>

				{/* Properties */}
				<div className="p-4 space-y-4">
					{/* Type */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Type
						</div>
						<div
							className="text-white text-sm px-2.5 py-1.5 rounded"
							style={{ background: "#3e3e42", color: "#cccccc" }}
						>
							{entityDef?.name || entity.entityDefId}
						</div>
					</div>

					{/* Tileset */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Tileset
						</div>
						<div
							className="text-white text-sm px-2.5 py-1.5 rounded"
							style={{ background: "#3e3e42", color: "#cccccc" }}
						>
							{tileset?.name || firstSpriteTilesetId || "Unknown"}
						</div>
					</div>

					{/* Position */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Position
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="flex">
								<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
									X
								</div>
								<div className="flex-1">
									<DragNumberInput
										value={entity.x}
										onChange={(x) => handleUpdatePosition(x, entity.y)}
										onInput={(x) => handleUpdatePosition(x, entity.y)}
										onDragStart={onDragStart}
										onDragEnd={onDragEnd}
										dragSpeed={1}
										precision={0}
										roundedLeft={false}
									/>
								</div>
							</div>
							<div className="flex">
								<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
									Y
								</div>
								<div className="flex-1">
									<DragNumberInput
										value={entity.y}
										onChange={(y) => handleUpdatePosition(entity.x, y)}
										onInput={(y) => handleUpdatePosition(entity.x, y)}
										onDragStart={onDragStart}
										onDragEnd={onDragEnd}
										dragSpeed={1}
										precision={0}
										roundedLeft={false}
									/>
								</div>
							</div>
						</div>
					</div>

					{/* Rotation */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Rotation (degrees)
						</div>
						<DragNumberInput
							value={entity.rotation}
							onChange={handleUpdateRotation}
							onInput={handleUpdateRotation}
							onDragStart={onDragStart}
							onDragEnd={onDragEnd}
							dragSpeed={1}
							precision={1}
						/>
					</div>

					{/* Scale */}
					<div>
						<div
							className="text-xs font-medium block mb-1.5"
							style={{ color: "#858585" }}
						>
							Scale
						</div>
						<div className="grid grid-cols-2 gap-2">
							<div className="flex">
								<div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
									X
								</div>
								<div className="flex-1">
									<DragNumberInput
										value={entity.scale.x}
										onChange={(x) => handleUpdateScale(x, entity.scale.y)}
										onInput={(x) => handleUpdateScale(x, entity.scale.y)}
										onDragStart={onDragStart}
										onDragEnd={onDragEnd}
										dragSpeed={0.1}
										precision={2}
										roundedLeft={false}
									/>
								</div>
							</div>
							<div className="flex">
								<div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
									Y
								</div>
								<div className="flex-1">
									<DragNumberInput
										value={entity.scale.y}
										onChange={(y) => handleUpdateScale(entity.scale.x, y)}
										onInput={(y) => handleUpdateScale(entity.scale.x, y)}
										onDragStart={onDragStart}
										onDragEnd={onDragEnd}
										dragSpeed={0.1}
										precision={2}
										roundedLeft={false}
									/>
								</div>
							</div>
						</div>
					</div>

					{/* Sprite Layers */}
					{entityDef?.sprites && (
						<div>
							<div
								className="text-xs font-medium block mb-1.5"
								style={{ color: "#858585" }}
							>
								Sprite Layers
							</div>
							<div
								className="px-2.5 py-1.5 text-xs rounded"
								style={{ background: "#3e3e42", color: "#858585" }}
							>
								{entityDef.sprites.length} layer(s)
							</div>
						</div>
					)}

					{/* Custom Properties */}
					<CustomPropertiesEditor
						properties={entity.properties || {}}
						onChange={handlePropertiesChange}
					/>
				</div>
			</div>
		</div>
	);
};
