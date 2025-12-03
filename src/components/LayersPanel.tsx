import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	pointerWithin,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	Fragment,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import type { Layer, LayerGroup } from "../types";

export interface LayersPanelHandle {
	startLayerRename: (layerId: string) => void;
	startGroupRename: (groupId: string) => void;
}

interface LayersPanelProps {
	layers: Layer[];
	groups: LayerGroup[];
	currentLayerId: string | null;
	selectedGroupId: string | null;
	onLayersChange: (
		layers: Layer[] | ((prevLayers: Layer[]) => Layer[]),
	) => void;
	onGroupsChange: (
		groups: LayerGroup[] | ((prevGroups: LayerGroup[]) => LayerGroup[]),
	) => void;
	onSelectLayer: (layerId: string | null) => void;
	onSelectGroup: (groupId: string | null) => void;
	onAddLayer: () => void;
	onAddGroup: () => void;
	onLayerContextMenu: (e: React.MouseEvent, layerId: string) => void;
	onGroupContextMenu: (e: React.MouseEvent, groupId: string) => void;
}

// Sortable layer item component
interface SortableLayerItemProps {
	layer: Layer;
	isActive: boolean;
	isEditing: boolean;
	editingName: string;
	inputRef?: React.RefObject<HTMLInputElement | null>;
	onClick: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onVisibilityChange: (visible: boolean) => void;
	onNameChange: (name: string) => void;
	onNameSubmit: () => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
}

const SortableLayerItem = ({
	layer,
	isActive,
	isEditing,
	editingName,
	inputRef,
	onClick,
	onContextMenu,
	onVisibilityChange,
	onNameChange,
	onNameSubmit,
	onKeyDown,
}: SortableLayerItemProps) => {
	const { attributes, listeners, setNodeRef, isDragging } = useSortable({
		id: layer.id,
	});

	// Only apply opacity change when dragged - no transforms to prevent layout shifts
	const style = {
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
			className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-grab transition-colors ${
				isActive ? "bg-[#0e639c]" : "hover:bg-[#2a2d2e]"
			}`}
			onClick={onClick}
			onContextMenu={onContextMenu}
			onKeyDown={() => {}}
		>
			<input
				type="checkbox"
				checked={layer.visible}
				onChange={(e) => onVisibilityChange(e.target.checked)}
				onClick={(e) => e.stopPropagation()}
				title="Toggle visibility"
				style={{ accentColor: "#007acc" }}
			/>
			{isEditing ? (
				<input
					ref={inputRef}
					type="text"
					value={editingName}
					onChange={(e) => onNameChange(e.target.value)}
					onBlur={onNameSubmit}
					onKeyDown={onKeyDown}
					className="flex-1 text-xs px-1 rounded"
					style={{
						background: "#3c3c3c",
						color: "#ffffff",
						border: "1px solid #007acc",
						outline: "none",
					}}
					onClick={(e) => e.stopPropagation()}
					spellCheck={false}
				/>
			) : (
				<span className="flex-1 select-none truncate">{layer.name}</span>
			)}
		</div>
	);
};

// Sortable group container - the whole group is one sortable item
interface SortableGroupContainerProps {
	group: LayerGroup;
	groupLayers: Layer[];
	isSelected: boolean;
	isEditing: boolean;
	editingName: string;
	inputRef: React.RefObject<HTMLInputElement | null>;
	onSelect: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onToggleExpanded: () => void;
	onToggleVisibility: () => void;
	onNameChange: (name: string) => void;
	onNameSubmit: () => void;
	onNameKeyDown: (e: React.KeyboardEvent) => void;
	children: React.ReactNode;
}

const SortableGroupContainer = ({
	group,
	groupLayers,
	isSelected,
	isEditing,
	editingName,
	inputRef,
	onSelect,
	onContextMenu,
	onToggleExpanded,
	onToggleVisibility,
	onNameChange,
	onNameSubmit,
	onNameKeyDown,
	children,
}: SortableGroupContainerProps) => {
	const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable(
		{
			id: `group:${group.id}`,
		},
	);

	// Only apply opacity change when dragged - no transforms to prevent layout shifts
	const style = {
		opacity: isDragging ? 0.5 : 1,
	};

	return (
		<div ref={setNodeRef} style={style}>
			{/* Group header - draggable */}
			<div
				{...attributes}
				{...listeners}
				role="button"
				tabIndex={0}
				className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-grab transition-colors ${
					isSelected
						? "bg-[#0e639c]"
						: isOver
							? "bg-[#0e639c]/30 ring-1 ring-[#0e639c] ring-inset"
							: "hover:bg-[#2a2d2e]"
				}`}
				onClick={onSelect}
				onContextMenu={onContextMenu}
				onKeyDown={() => {}}
			>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onToggleExpanded();
					}}
					className="p-0.5 hover:bg-white/10 rounded"
					title={group.expanded ? "Collapse group" : "Expand group"}
				>
					<span
						className="inline-block text-[10px] transition-transform"
						style={{
							transform: group.expanded ? "rotate(90deg)" : "rotate(0deg)",
						}}
					>
						▶
					</span>
				</button>
				<input
					type="checkbox"
					checked={group.visible}
					onChange={onToggleVisibility}
					onClick={(e) => e.stopPropagation()}
					title="Toggle group visibility"
					style={{ accentColor: "#007acc" }}
				/>
				{isEditing ? (
					<input
						ref={inputRef}
						type="text"
						value={editingName}
						onChange={(e) => onNameChange(e.target.value)}
						onBlur={onNameSubmit}
						onKeyDown={onNameKeyDown}
						className="flex-1 text-xs px-1 rounded"
						style={{
							background: "#3c3c3c",
							color: "#ffffff",
							border: "1px solid #007acc",
							outline: "none",
						}}
						onClick={(e) => e.stopPropagation()}
						spellCheck={false}
					/>
				) : (
					<span className="flex-1 select-none truncate">{group.name}</span>
				)}
				<span className="text-[10px] opacity-50" title="Layers in group">
					({groupLayers.length})
				</span>
			</div>
			{/* Grouped layers */}
			{group.expanded && children}
		</div>
	);
};

// Drop zone indicator between items
const DropZone = ({ id, isActive }: { id: string; isActive: boolean }) => {
	const { setNodeRef, isOver } = useDroppable({ id, disabled: !isActive });

	return (
		<div ref={setNodeRef} className="relative h-1.5">
			{isActive && isOver && (
				<div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-0.5 rounded bg-[#0e639c]" />
			)}
		</div>
	);
};

// Drop zone for reordering layers within a group
const GroupLayerDropZone = ({
	id,
	isActive,
}: {
	id: string;
	isActive: boolean;
}) => {
	const { setNodeRef, isOver } = useDroppable({ id, disabled: !isActive });

	return (
		<div ref={setNodeRef} className="relative h-1.5 ml-3">
			{isActive && isOver && (
				<div className="absolute inset-x-1 top-1/2 -translate-y-1/2 h-0.5 rounded bg-[#0e639c]" />
			)}
		</div>
	);
};

// Droppable entity separator
const DroppableEntitySeparator = () => {
	const { setNodeRef, isOver } = useDroppable({
		id: "entity-separator",
	});

	return (
		<div
			ref={setNodeRef}
			className="relative py-2"
			style={{
				background: isOver ? "rgba(14, 99, 156, 0.3)" : "transparent",
			}}
		>
			<div
				className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
				style={{
					background: isOver ? "#0e639c" : "#585858",
				}}
			/>
			<div
				className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[9px] rounded"
				style={{
					background: isOver ? "#0e639c" : "#2d2d2d",
					color: isOver ? "#ffffff" : "#888888",
					border: isOver ? "1px solid #0e639c" : "1px solid #585858",
				}}
			>
				ENTITIES
			</div>
		</div>
	);
};

// Display item type for unified sorting
type DisplayItem =
	| { type: "layer"; id: string; layer: Layer; order: number }
	| {
			type: "group";
			id: string;
			group: LayerGroup;
			layers: Layer[];
			order: number;
	  }
	| { type: "separator"; id: string; order: number };

export const LayersPanel = forwardRef<LayersPanelHandle, LayersPanelProps>(
	(
		{
			layers,
			groups,
			currentLayerId,
			selectedGroupId,
			onLayersChange,
			onGroupsChange,
			onSelectLayer,
			onSelectGroup,
			onAddLayer,
			onAddGroup,
			onLayerContextMenu,
			onGroupContextMenu,
		},
		ref,
	) => {
		const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
		const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
		const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
		const [editingLayerName, setEditingLayerName] = useState("");
		const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
		const [editingGroupName, setEditingGroupName] = useState("");
		const [isDragging, setIsDragging] = useState(false);

		const layerInputRef = useRef<HTMLInputElement>(null);
		const groupInputRef = useRef<HTMLInputElement>(null);

		// Expose methods via ref for parent to trigger rename
		useImperativeHandle(ref, () => ({
			startLayerRename: (layerId: string) => {
				const layer = layers.find((l) => l.id === layerId);
				if (layer) {
					setEditingLayerId(layerId);
					setEditingLayerName(layer.name);
				}
			},
			startGroupRename: (groupId: string) => {
				const group = groups.find((g) => g.id === groupId);
				if (group) {
					setEditingGroupId(groupId);
					setEditingGroupName(group.name);
				}
			},
		}));

		// Focus input when editing starts
		useEffect(() => {
			if (editingLayerId && layerInputRef.current) {
				layerInputRef.current.focus();
				layerInputRef.current.select();
			}
		}, [editingLayerId]);

		useEffect(() => {
			if (editingGroupId && groupInputRef.current) {
				groupInputRef.current.focus();
				groupInputRef.current.select();
			}
		}, [editingGroupId]);

		const sensors = useSensors(
			useSensor(PointerSensor, {
				activationConstraint: {
					distance: 5,
				},
			}),
		);

		// Build unified display items list
		// Items are ordered by their order property - layers use array index * 2, groups use order * 2 + 1
		// This allows interleaving of layers and groups
		const buildDisplayItems = (): DisplayItem[] => {
			const items: DisplayItem[] = [];

			// Group layers by groupId and sort by order
			const layersByGroup = new Map<string, Layer[]>();
			for (const layer of layers) {
				if (layer.groupId) {
					const groupLayers = layersByGroup.get(layer.groupId) || [];
					groupLayers.push(layer);
					layersByGroup.set(layer.groupId, groupLayers);
				}
			}
			// Sort each group's layers by order descending (higher order = top of list = rendered last = on top)
			for (const [groupId, groupLayers] of layersByGroup) {
				groupLayers.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
				layersByGroup.set(groupId, groupLayers);
			}

			// Separate ungrouped layers by foreground
			const foregroundLayers = layers.filter((l) => l.foreground && !l.groupId);
			const backgroundLayers = layers.filter(
				(l) => !l.foreground && !l.groupId,
			);

			// Use group.foreground property directly to determine section
			const foregroundGroups = groups.filter((g) => g.foreground);
			const backgroundGroups = groups.filter((g) => !g.foreground);

			// Build foreground section - interleave layers and groups by order
			// Both layers and groups use their explicit order property
			const foregroundItems: DisplayItem[] = [];

			// Add layers with their order property
			for (const layer of foregroundLayers) {
				foregroundItems.push({
					type: "layer",
					id: layer.id,
					layer,
					order: layer.order,
				});
			}

			// Add foreground groups with their order property
			for (const group of foregroundGroups) {
				foregroundItems.push({
					type: "group",
					id: `group:${group.id}`,
					group,
					layers: layersByGroup.get(group.id) || [],
					order: group.order,
				});
			}

			// Sort by order descending - higher order = top of list = rendered last = on top
			foregroundItems.sort((a, b) => b.order - a.order);
			items.push(...foregroundItems);

			// Entity separator
			items.push({ type: "separator", id: "entity-separator", order: 1000 });

			// Build background section - same logic
			const backgroundItems: DisplayItem[] = [];

			// Add layers with their order property
			for (const layer of backgroundLayers) {
				backgroundItems.push({
					type: "layer",
					id: layer.id,
					layer,
					order: layer.order,
				});
			}

			// Add background groups with their order property
			for (const group of backgroundGroups) {
				backgroundItems.push({
					type: "group",
					id: `group:${group.id}`,
					group,
					layers: layersByGroup.get(group.id) || [],
					order: group.order,
				});
			}

			// Sort by order descending - higher order = top of list = rendered last = on top
			backgroundItems.sort((a, b) => b.order - a.order);
			items.push(...backgroundItems);

			return items;
		};

		const displayItems = buildDisplayItems();
		const sortableIds = displayItems.map((item) => item.id);

		const handleDragStart = (event: DragStartEvent) => {
			setIsDragging(true);
			const id = event.active.id as string;
			if (id.startsWith("group:")) {
				setActiveGroupId(id.replace("group:", ""));
			} else {
				// Could be ungrouped layer OR grouped layer being dragged out
				setActiveLayerId(id);
			}
		};

		const handleDragEnd = (event: DragEndEvent) => {
			const { active, over } = event;
			setActiveLayerId(null);
			setActiveGroupId(null);
			setIsDragging(false);

			if (!over || active.id === over.id) {
				return;
			}

			const activeId = active.id as string;
			const overId = over.id as string;

			const isDraggingGroup = activeId.startsWith("group:");
			const isOverGroup = overId.startsWith("group:");
			const isOverSeparator = overId === "entity-separator";
			const isOverDropZone = overId.startsWith("dropzone:");
			const isOverGroupDropZone = overId.startsWith("group-dropzone:");

			// Check if we're dragging a grouped layer (not in displayItems)
			const draggedLayer = layers.find((l) => l.id === activeId);
			const isDraggingGroupedLayer =
				draggedLayer && draggedLayer.groupId !== undefined;

			// Find the active and over items in display list
			const activeIndex = displayItems.findIndex(
				(item) => item.id === activeId,
			);
			const overIndex = displayItems.findIndex((item) => item.id === overId);
			const separatorIndex = displayItems.findIndex(
				(item) => item.type === "separator",
			);

			// Determine which section the over item is in
			const targetIsForeground = overIndex < separatorIndex;

			// === CASE 1: Dropping on entity separator - toggle foreground ===
			if (isOverSeparator) {
				if (isDraggingGroup) {
					const groupId = activeId.replace("group:", "");
					const group = groups.find((g) => g.id === groupId);
					if (group) {
						const newForeground = !group.foreground;
						onGroupsChange((currentGroups) =>
							currentGroups.map((g) =>
								g.id === groupId ? { ...g, foreground: newForeground } : g,
							),
						);
						onLayersChange((currentLayers) =>
							currentLayers.map((l) =>
								l.groupId === groupId ? { ...l, foreground: newForeground } : l,
							),
						);
					}
				} else if (draggedLayer) {
					// Toggle foreground and remove from group
					const newForeground = !draggedLayer.foreground;
					onLayersChange((currentLayers) =>
						currentLayers.map((l) =>
							l.id === activeId
								? {
										...l,
										foreground: newForeground,
										groupId: null,
									}
								: l,
						),
					);
				}
				return;
			}

			// === CASE 1.5: Dropping on a group drop zone - reorder within group ===
			if (isOverGroupDropZone && draggedLayer) {
				// Parse: group-dropzone:${groupId}:${position}
				const parts = overId.split(":");
				const targetGroupId = parts[1];
				const targetPosition = Number.parseInt(parts[2], 10);

				// Get layers in this group (excluding the dragged layer), sorted by order
				const groupLayersWithoutDragged = layers
					.filter((l) => l.groupId === targetGroupId && l.id !== activeId)
					.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

				// Calculate new order based on position in group
				// Adjust position if dragging within same group (drop zones shift)
				const isFromSameGroup = draggedLayer.groupId === targetGroupId;
				let adjustedPosition = targetPosition;
				if (isFromSameGroup) {
					// Find original position of dragged layer
					const originalGroupLayers = layers
						.filter((l) => l.groupId === targetGroupId)
						.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
					const originalIndex = originalGroupLayers.findIndex(
						(l) => l.id === activeId,
					);
					// If dropping after original position, adjust for removed item
					if (targetPosition > originalIndex) {
						adjustedPosition = targetPosition - 1;
					}
				}

				// Group layers are sorted descending by order (higher order = top = first in array)
				// layerAbove (position X-1) has HIGHER order, layerBelow (position X) has LOWER order
				const layerAbove = groupLayersWithoutDragged[adjustedPosition - 1];
				const layerBelow = groupLayersWithoutDragged[adjustedPosition];

				let newOrder: number;
				if (!layerAbove && !layerBelow) {
					newOrder = 0;
				} else if (!layerAbove) {
					// Inserting at top of group - need HIGHER order than first item
					newOrder = (layerBelow?.order ?? 0) + 1;
				} else if (!layerBelow) {
					// Inserting at bottom of group - need LOWER order than last item
					newOrder = (layerAbove.order ?? 0) - 1;
				} else {
					// Inserting between two items
					newOrder = (layerAbove.order + layerBelow.order) / 2;
				}

				// Get the target group to determine foreground status
				const targetGroup = groups.find((g) => g.id === targetGroupId);
				const targetForeground = targetGroup?.foreground ?? false;

				onLayersChange((currentLayers) =>
					currentLayers.map((l) =>
						l.id === activeId
							? {
									...l,
									groupId: targetGroupId,
									order: newOrder,
									foreground: targetForeground,
								}
							: l,
					),
				);
				return;
			}

			// === CASE 2: Dropping on a drop zone - insert at position ===
			if (isOverDropZone) {
				const dropIndex = Number.parseInt(overId.replace("dropzone:", ""), 10);
				const dropIsForeground = dropIndex <= separatorIndex;

				// Calculate new order based on position
				const sectionStart = dropIsForeground ? 0 : separatorIndex + 1;
				const sectionEnd = dropIsForeground
					? separatorIndex
					: displayItems.length;
				const sectionItems = displayItems.slice(sectionStart, sectionEnd);

				// dropIndex is relative to displayItems, convert to section-relative
				const posInSection = dropIsForeground
					? dropIndex
					: dropIndex - separatorIndex - 1;

				// Get neighbors to calculate order (descending: higher index = lower order)
				// itemAbove = higher in list = higher order
				// itemBelow = lower in list = lower order
				const itemAbove = sectionItems[posInSection - 1];
				const itemBelow = sectionItems[posInSection];

				let newOrder: number;
				if (!itemAbove && !itemBelow) {
					newOrder = 0;
				} else if (!itemAbove) {
					// Dropping at top - needs higher order than itemBelow
					newOrder = (itemBelow?.order ?? 0) + 1;
				} else if (!itemBelow) {
					// Dropping at bottom - needs lower order than itemAbove
					newOrder = (itemAbove.order ?? 0) - 1;
				} else {
					// Dropping in between
					newOrder = (itemAbove.order + itemBelow.order) / 2;
				}

				if (isDraggingGroup) {
					const groupId = activeId.replace("group:", "");
					onGroupsChange((currentGroups) =>
						currentGroups.map((g) =>
							g.id === groupId
								? { ...g, order: newOrder, foreground: dropIsForeground }
								: g,
						),
					);
					onLayersChange((currentLayers) =>
						currentLayers.map((l) =>
							l.groupId === groupId
								? { ...l, foreground: dropIsForeground }
								: l,
						),
					);
				} else if (draggedLayer) {
					onLayersChange((currentLayers) =>
						currentLayers.map((l) =>
							l.id === activeId
								? {
										...l,
										order: newOrder,
										foreground: dropIsForeground,
										groupId: null,
									}
								: l,
						),
					);
				}
				return;
			}

			// === CASE 3: Dropping layer ON a group (middle 50%) - add to group ===
			// Use pointer position to determine if dropping on middle of group vs edges
			if (!isDraggingGroup && isOverGroup && over.rect) {
				const overRect = over.rect;
				const pointerY =
					event.activatorEvent instanceof PointerEvent
						? event.activatorEvent.clientY + (event.delta?.y ?? 0)
						: overRect.top + overRect.height / 2;

				const relativeY = pointerY - overRect.top;
				const heightPercent = relativeY / overRect.height;

				// Middle 50% = add to group, top/bottom 25% = reorder
				if (heightPercent > 0.25 && heightPercent < 0.75) {
					const targetGroupId = overId.replace("group:", "");
					const targetGroup = groups.find((g) => g.id === targetGroupId);
					if (targetGroup && draggedLayer) {
						onLayersChange((currentLayers) =>
							currentLayers.map((l) =>
								l.id === activeId
									? {
											...l,
											groupId: targetGroupId,
											foreground: targetGroup.foreground,
										}
									: l,
							),
						);
						return;
					}
				}
				// Otherwise fall through to reordering
			}

			// === CASE 3: Dragging a grouped layer out - remove from group and place at target ===
			if (isDraggingGroupedLayer && draggedLayer) {
				// If dropping on a group's middle, add to that group instead
				if (isOverGroup && over.rect) {
					const overRect = over.rect;
					const pointerY =
						event.activatorEvent instanceof PointerEvent
							? event.activatorEvent.clientY + (event.delta?.y ?? 0)
							: overRect.top + overRect.height / 2;

					const relativeY = pointerY - overRect.top;
					const heightPercent = relativeY / overRect.height;

					if (heightPercent > 0.25 && heightPercent < 0.75) {
						const targetGroupId = overId.replace("group:", "");
						const targetGroup = groups.find((g) => g.id === targetGroupId);
						if (targetGroup) {
							onLayersChange((currentLayers) =>
								currentLayers.map((l) =>
									l.id === activeId
										? {
												...l,
												groupId: targetGroupId,
												foreground: targetGroup.foreground,
											}
										: l,
								),
							);
							return;
						}
					}
				}

				// Remove from group and place at target position
				const sectionStart = targetIsForeground ? 0 : separatorIndex + 1;
				const sectionEnd = targetIsForeground
					? separatorIndex
					: displayItems.length;
				const sectionItems = displayItems.slice(sectionStart, sectionEnd);

				const overInSection = sectionItems.findIndex(
					(item) => item.id === overId,
				);
				const targetOrder =
					overInSection !== -1
						? (sectionItems[overInSection]?.order ?? 0)
						: sectionItems.length;

				onLayersChange((currentLayers) =>
					currentLayers.map((l) =>
						l.id === activeId
							? {
									...l,
									groupId: null,
									foreground: targetIsForeground,
									order: targetOrder,
								}
							: l,
					),
				);
				return;
			}

			// === CASE 4: Reordering within the list ===
			if (activeIndex === -1 || overIndex === -1) return;

			// Get items in the target section (where we're dropping)
			const sectionStart = targetIsForeground ? 0 : separatorIndex + 1;
			const sectionEnd = targetIsForeground
				? separatorIndex
				: displayItems.length;
			const sectionItems = displayItems.slice(sectionStart, sectionEnd);

			// Find current position and target position within section
			const activeInSection = sectionItems.findIndex(
				(item) => item.id === activeId,
			);
			const overInSection = sectionItems.findIndex(
				(item) => item.id === overId,
			);

			let newSectionOrder: DisplayItem[];

			if (activeInSection !== -1 && overInSection !== -1) {
				// Same section reorder - use arrayMove
				newSectionOrder = arrayMove(
					sectionItems,
					activeInSection,
					overInSection,
				);
			} else if (overInSection !== -1) {
				// Moving from different section - insert at target position
				newSectionOrder = [...sectionItems];
				newSectionOrder.splice(overInSection, 0, displayItems[activeIndex]);
			} else {
				// Target not found in section - append
				newSectionOrder = [...sectionItems, displayItems[activeIndex]];
			}

			// Collect all order updates
			const layerUpdates = new Map<
				string,
				{ order: number; foreground: boolean; groupId: string | null }
			>();
			const groupUpdates = new Map<
				string,
				{ order: number; foreground: boolean }
			>();

			// Assign sequential orders to all items in section (descending: first item = highest order)
			const maxOrder = newSectionOrder.length - 1;
			newSectionOrder.forEach((item, idx) => {
				if (item.type === "layer") {
					const isActive = item.id === activeId;
					layerUpdates.set(item.layer.id, {
						order: maxOrder - idx,
						foreground: targetIsForeground,
						groupId: isActive ? null : item.layer.groupId,
					});
				} else if (item.type === "group") {
					groupUpdates.set(item.group.id, {
						order: maxOrder - idx,
						foreground: targetIsForeground,
					});
				}
			});

			// If moving a group, update its layers' foreground status
			if (isDraggingGroup) {
				const groupId = activeId.replace("group:", "");
				for (const layer of layers) {
					if (layer.groupId === groupId) {
						const existing = layerUpdates.get(layer.id);
						layerUpdates.set(layer.id, {
							order: existing?.order ?? layer.order,
							foreground: targetIsForeground,
							groupId: layer.groupId,
						});
					}
				}
			}

			// Apply updates
			if (layerUpdates.size > 0) {
				onLayersChange((currentLayers) =>
					currentLayers.map((l) => {
						const update = layerUpdates.get(l.id);
						if (update) {
							return {
								...l,
								order: update.order,
								foreground: update.foreground,
								groupId: update.groupId,
							};
						}
						return l;
					}),
				);
			}

			if (groupUpdates.size > 0) {
				onGroupsChange((currentGroups) =>
					currentGroups.map((g) => {
						const update = groupUpdates.get(g.id);
						if (update) {
							return {
								...g,
								order: update.order,
								foreground: update.foreground,
							};
						}
						return g;
					}),
				);
			}
		};

		const handleLayerNameSubmit = (layerId: string) => {
			if (editingLayerName.trim()) {
				onLayersChange((currentLayers) =>
					currentLayers.map((l) =>
						l.id === layerId ? { ...l, name: editingLayerName.trim() } : l,
					),
				);
			}
			setEditingLayerId(null);
		};

		const handleLayerNameKeyDown = (
			e: React.KeyboardEvent,
			layerId: string,
		) => {
			if (e.key === "Enter") {
				handleLayerNameSubmit(layerId);
			} else if (e.key === "Escape") {
				setEditingLayerId(null);
			}
		};

		const handleGroupNameSubmit = (groupId: string) => {
			if (editingGroupName.trim()) {
				onGroupsChange((currentGroups) =>
					currentGroups.map((g) =>
						g.id === groupId ? { ...g, name: editingGroupName.trim() } : g,
					),
				);
			}
			setEditingGroupId(null);
		};

		const handleGroupNameKeyDown = (
			e: React.KeyboardEvent,
			groupId: string,
		) => {
			if (e.key === "Enter") {
				handleGroupNameSubmit(groupId);
			} else if (e.key === "Escape") {
				setEditingGroupId(null);
			}
		};

		const handleToggleGroupExpanded = (groupId: string) => {
			onGroupsChange((currentGroups) =>
				currentGroups.map((g) =>
					g.id === groupId ? { ...g, expanded: !g.expanded } : g,
				),
			);
		};

		const handleToggleGroupVisibility = (groupId: string) => {
			onGroupsChange((currentGroups) =>
				currentGroups.map((g) =>
					g.id === groupId ? { ...g, visible: !g.visible } : g,
				),
			);
		};

		const handleUpdateLayerVisibility = (layerId: string, visible: boolean) => {
			onLayersChange((currentLayers) =>
				currentLayers.map((l) => (l.id === layerId ? { ...l, visible } : l)),
			);
		};

		// Draggable (but not sortable) layer item for layers inside groups
		const DraggableGroupedLayerItem = ({
			layer,
			isLast,
		}: {
			layer: Layer;
			isLast: boolean;
		}) => {
			const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
				id: layer.id,
			});

			return (
				<div className="flex" style={{ opacity: isDragging ? 0.5 : 1 }}>
					<div
						className="flex flex-col items-center mr-1"
						style={{ width: "12px", color: "#585858" }}
					>
						<div className={`w-px bg-current ${isLast ? "h-3" : "flex-1"}`} />
						<div className="w-2 h-px bg-current" />
						{!isLast && <div className="w-px flex-1 bg-current" />}
					</div>
					<div className="flex-1">
						<div
							ref={setNodeRef}
							{...attributes}
							{...listeners}
							role="button"
							tabIndex={0}
							className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded cursor-grab transition-colors ${
								currentLayerId === layer.id
									? "bg-[#0e639c]"
									: "hover:bg-[#2a2d2e]"
							}`}
							onClick={() => onSelectLayer(layer.id)}
							onContextMenu={(e) => onLayerContextMenu(e, layer.id)}
							onKeyDown={() => {}}
						>
							<input
								type="checkbox"
								checked={layer.visible}
								onChange={(e) =>
									handleUpdateLayerVisibility(layer.id, e.target.checked)
								}
								onClick={(e) => e.stopPropagation()}
								title="Toggle visibility"
								style={{ accentColor: "#007acc" }}
							/>
							{editingLayerId === layer.id ? (
								<input
									ref={layerInputRef}
									type="text"
									value={editingLayerName}
									onChange={(e) => setEditingLayerName(e.target.value)}
									onBlur={() => handleLayerNameSubmit(layer.id)}
									onKeyDown={(e) => handleLayerNameKeyDown(e, layer.id)}
									className="flex-1 text-xs px-1 rounded"
									style={{
										background: "#3c3c3c",
										color: "#ffffff",
										border: "1px solid #007acc",
										outline: "none",
									}}
									onClick={(e) => e.stopPropagation()}
									spellCheck={false}
								/>
							) : (
								<span className="flex-1 select-none truncate">
									{layer.name}
								</span>
							)}
						</div>
					</div>
				</div>
			);
		};

		// Sortable layer item for ungrouped layers
		const renderLayerItem = (layer: Layer) => (
			<SortableLayerItem
				key={layer.id}
				layer={layer}
				isActive={currentLayerId === layer.id}
				isEditing={editingLayerId === layer.id}
				editingName={editingLayerName}
				inputRef={layerInputRef}
				onClick={() => onSelectLayer(layer.id)}
				onContextMenu={(e) => onLayerContextMenu(e, layer.id)}
				onVisibilityChange={(visible) =>
					handleUpdateLayerVisibility(layer.id, visible)
				}
				onNameChange={setEditingLayerName}
				onNameSubmit={() => handleLayerNameSubmit(layer.id)}
				onKeyDown={(e) => handleLayerNameKeyDown(e, layer.id)}
			/>
		);

		return (
			<div className="flex flex-col h-full">
				<DndContext
					sensors={sensors}
					collisionDetection={pointerWithin}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={sortableIds}
						strategy={verticalListSortingStrategy}
					>
						<div className="flex-1 overflow-y-auto">
							{/* Drop zone before first item */}
							<DropZone id="dropzone:0" isActive={isDragging} />

							{displayItems.map((item, index) => {
								if (item.type === "separator") {
									return (
										<Fragment key={item.id}>
											<DroppableEntitySeparator />
											<DropZone
												id={`dropzone:${index + 1}`}
												isActive={isDragging}
											/>
										</Fragment>
									);
								}

								if (item.type === "layer") {
									return (
										<Fragment key={item.id}>
											{renderLayerItem(item.layer)}
											<DropZone
												id={`dropzone:${index + 1}`}
												isActive={isDragging}
											/>
										</Fragment>
									);
								}

								if (item.type === "group") {
									return (
										<Fragment key={item.id}>
											<SortableGroupContainer
												group={item.group}
												groupLayers={item.layers}
												isSelected={selectedGroupId === item.group.id}
												isEditing={editingGroupId === item.group.id}
												editingName={editingGroupName}
												inputRef={groupInputRef}
												onSelect={() =>
													onSelectGroup(
														selectedGroupId === item.group.id
															? null
															: item.group.id,
													)
												}
												onContextMenu={(e) =>
													onGroupContextMenu(e, item.group.id)
												}
												onToggleExpanded={() =>
													handleToggleGroupExpanded(item.group.id)
												}
												onToggleVisibility={() =>
													handleToggleGroupVisibility(item.group.id)
												}
												onNameChange={setEditingGroupName}
												onNameSubmit={() =>
													handleGroupNameSubmit(item.group.id)
												}
												onNameKeyDown={(e) =>
													handleGroupNameKeyDown(e, item.group.id)
												}
											>
												<div className="ml-2">
													<GroupLayerDropZone
														id={`group-dropzone:${item.group.id}:0`}
														isActive={isDragging}
													/>
													{item.layers.map((layer, idx) => (
														<Fragment key={layer.id}>
															<DraggableGroupedLayerItem
																layer={layer}
																isLast={idx === item.layers.length - 1}
															/>
															{/* Only show drop zone between layers, not after the last one */}
															{idx < item.layers.length - 1 && (
																<GroupLayerDropZone
																	id={`group-dropzone:${item.group.id}:${idx + 1}`}
																	isActive={isDragging}
																/>
															)}
														</Fragment>
													))}
												</div>
											</SortableGroupContainer>
											<DropZone
												id={`dropzone:${index + 1}`}
												isActive={isDragging}
											/>
										</Fragment>
									);
								}

								return null;
							})}
						</div>
					</SortableContext>

					<DragOverlay>
						{activeLayerId && (
							<div
								className="px-2 py-1.5 text-xs rounded bg-[#0e639c] text-white flex items-center gap-2 shadow-lg"
								style={{ cursor: "grabbing" }}
							>
								{(() => {
									const layer = layers.find((l) => l.id === activeLayerId);
									if (!layer) return null;
									return (
										<>
											<input
												type="checkbox"
												checked={layer.visible}
												readOnly
												style={{ accentColor: "#007acc" }}
											/>
											<span className="select-none">{layer.name}</span>
										</>
									);
								})()}
							</div>
						)}
						{activeGroupId && (
							<div
								className="px-2 py-1 text-xs rounded bg-[#0e639c] text-white flex items-center gap-1 shadow-lg"
								style={{ cursor: "grabbing" }}
							>
								{(() => {
									const group = groups.find((g) => g.id === activeGroupId);
									if (!group) return null;
									return (
										<>
											<span className="text-[10px]">▶</span>
											<input
												type="checkbox"
												checked={group.visible}
												readOnly
												style={{ accentColor: "#007acc" }}
											/>
											<span className="select-none">{group.name}</span>
										</>
									);
								})()}
							</div>
						)}
					</DragOverlay>
				</DndContext>

				<div className="mt-2 flex gap-2 flex-shrink-0">
					<button
						type="button"
						onClick={onAddLayer}
						className="flex-1 px-2 py-1.5 text-xs rounded transition-colors"
						style={{
							background: "#0e639c",
							color: "#ffffff",
							border: "none",
						}}
					>
						+ Layer
					</button>
					<button
						type="button"
						onClick={onAddGroup}
						className="flex-1 px-2 py-1.5 text-xs rounded transition-colors"
						style={{
							background: "#3c3c3c",
							color: "#ffffff",
							border: "1px solid #585858",
						}}
					>
						+ Group
					</button>
				</div>
			</div>
		);
	},
);

LayersPanel.displayName = "LayersPanel";
