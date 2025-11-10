import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { useEditor } from "../context/EditorContext";
import type { Layer } from "../types";

interface SortableLayerItemProps {
	layer: Layer;
	isActive: boolean;
	isEditing: boolean;
	editingName: string;
	onLayerClick: (layer: Layer) => void;
	onDoubleClick: (layer: Layer) => void;
	onVisibilityChange: (layerId: string, visible: boolean) => void;
	onNameChange: (name: string) => void;
	onNameSubmit: (layerId: string) => void;
	onKeyDown: (e: React.KeyboardEvent, layerId: string) => void;
}

const SortableLayerItem = ({
	layer,
	isActive,
	isEditing,
	editingName,
	onLayerClick,
	onDoubleClick,
	onVisibilityChange,
	onNameChange,
	onNameSubmit,
	onKeyDown,
}: SortableLayerItemProps) => {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: layer.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			role="button"
			tabIndex={0}
			className={`layer-item ${isActive ? "active" : ""} ${isDragging ? "dragging" : ""}`}
			onClick={() => onLayerClick(layer)}
			onDoubleClick={() => onDoubleClick(layer)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onLayerClick(layer);
				}
			}}
			aria-pressed={isActive}
			aria-label={`Layer: ${layer.name}`}
		>
			<input
				type="checkbox"
				checked={layer.visible}
				onChange={(e) => {
					e.stopPropagation();
					onVisibilityChange(layer.id, e.target.checked);
				}}
				onClick={(e) => e.stopPropagation()}
				title="Toggle visibility"
			/>
			{isEditing ? (
				<input
					type="text"
					value={editingName}
					onChange={(e) => onNameChange(e.target.value)}
					onBlur={() => onNameSubmit(layer.id)}
					onKeyDown={(e) => onKeyDown(e, layer.id)}
					onClick={(e) => e.stopPropagation()}
					className="layer-name-input"
				/>
			) : (
				<span>{layer.name}</span>
			)}
		</div>
	);
};

export const LayersPanel = () => {
	const {
		getActiveMap,
		currentLayer,
		setCurrentLayer,
		addLayer,
		removeLayer,
		updateLayerVisibility,
		updateLayerName,
		reorderLayers,
	} = useEditor();

	const mapData = getActiveMap();

	const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [activeId, setActiveId] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				delay: 150, // 150ms delay before drag starts
				tolerance: 5, // 5px tolerance during delay
			},
		}),
	);

	const handleDoubleClick = (layer: Layer) => {
		setEditingLayerId(layer.id);
		setEditingName(layer.name);
	};

	const handleNameSubmit = (layerId: string) => {
		if (editingName.trim()) {
			updateLayerName(layerId, editingName.trim());
		}
		setEditingLayerId(null);
		setEditingName("");
	};

	const handleKeyDown = (e: React.KeyboardEvent, layerId: string) => {
		if (e.key === "Enter") {
			handleNameSubmit(layerId);
		} else if (e.key === "Escape") {
			setEditingLayerId(null);
			setEditingName("");
		}
	};

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);

		// Select the layer being dragged
		const draggedLayer = mapData?.layers.find(
			(l: Layer) => l.id === event.active.id,
		);
		if (draggedLayer) {
			setCurrentLayer(draggedLayer);
		}
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveId(null);

		if (!over || active.id === over.id || !mapData) {
			return;
		}

		// Get the reversed array (UI order: top layer at top)
		const reversedLayers = [...mapData.layers].reverse();

		// Find indices in the reversed array
		const oldIndex = reversedLayers.findIndex((l: Layer) => l.id === active.id);
		const newIndex = reversedLayers.findIndex((l: Layer) => l.id === over.id);

		if (oldIndex === -1 || newIndex === -1) {
			return;
		}

		// Reorder in the reversed array
		const reorderedReversed = arrayMove(reversedLayers, oldIndex, newIndex);

		// Reverse back to get the correct internal order (bottom to top)
		const newLayersOrder = reorderedReversed.reverse();

		// Update the layers
		reorderLayers(newLayersOrder);
	};

	// Display layers in reverse order (top layer at top of list)
	const displayedLayers = mapData ? [...mapData.layers].reverse() : [];

	// Find the active layer for drag overlay
	const activeLayer =
		activeId && mapData
			? mapData.layers.find((l: Layer) => l.id === activeId)
			: null;

	return (
		<div className="panel">
			<h3>Layers</h3>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={displayedLayers.map((l) => l.id)}
					strategy={verticalListSortingStrategy}
				>
					<div className="layers-list">
						{displayedLayers.map((layer) => (
							<SortableLayerItem
								key={layer.id}
								layer={layer}
								isActive={currentLayer?.id === layer.id}
								isEditing={editingLayerId === layer.id}
								editingName={editingName}
								onLayerClick={setCurrentLayer}
								onDoubleClick={handleDoubleClick}
								onVisibilityChange={updateLayerVisibility}
								onNameChange={setEditingName}
								onNameSubmit={handleNameSubmit}
								onKeyDown={handleKeyDown}
							/>
						))}
					</div>
				</SortableContext>
				<DragOverlay>
					{activeLayer ? (
						<div className="layer-item active drag-overlay">
							<input
								type="checkbox"
								checked={activeLayer.visible}
								readOnly
								title="Toggle visibility"
							/>
							<span>{activeLayer.name}</span>
						</div>
					) : null}
				</DragOverlay>
			</DndContext>
			<div className="layer-controls">
				<button type="button" onClick={() => addLayer("tile")}>
					+ Add Layer
				</button>
				<button
					type="button"
					onClick={() => currentLayer && removeLayer(currentLayer.id)}
					disabled={!currentLayer}
				>
					- Remove
				</button>
			</div>
		</div>
	);
};
