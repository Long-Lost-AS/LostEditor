# Layer Management - Quick Reference Guide

## File Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Layer List UI | `src/components/MapEditorView.tsx` | 628-762 | Renders layers panel with remove button |
| Remove Logic | `src/components/MapEditorView.tsx` | 196-205 | `handleRemoveLayer()` function |
| Undo/Redo Shortcuts | `src/context/UndoRedoContext.tsx` | 67-93 | Global keyboard listener |
| Redo Shortcuts | `src/context/UndoRedoContext.tsx` | 81-87 | Redo shortcuts detection |
| State Machine | `src/hooks/useUndoableReducer.ts` | 60-162 | Reducer logic (SET/UNDO/REDO) |
| Deep Equality | `src/hooks/useUndoableReducer.ts` | 22-57 | Prevents unnecessary history |
| Integration | `src/components/MapEditorView.tsx` | 62 | `useRegisterUndoRedo()` call |
| History Reset | `src/components/MapEditorView.tsx` | 91-98 | Reset on tab switch |
| Types | `src/types.ts` | 118-126 | Layer interface definition |
| Deprecated | `src/context/EditorContext.tsx` | 413-425 | Old `removeLayer()` (not used) |

## Keyboard Shortcuts

### Undo
- **Mac:** `Cmd+Z`
- **Windows/Linux:** `Ctrl+Z`

### Redo  
- **Mac:** `Cmd+Shift+Z` or `Cmd+Y`
- **Windows/Linux:** `Ctrl+Shift+Z` or `Ctrl+Y`

## Code Snippets

### Remove a Layer
```typescript
const handleRemoveLayer = (layerId: string) => {
  if (!localMapData?.layers) return;
  setLocalMapData({
    ...localMapData,
    layers: localMapData.layers.filter((l) => l.id !== layerId),
  });
  if (currentLayerId === layerId) {
    setCurrentLayerId(localMapData.layers[0]?.id || null);
  }
};
```

### Register Undo/Redo in Component
```typescript
const [
  localMapData,
  setLocalMapData,
  { undo, redo, canUndo, canRedo },
] = useUndoableReducer<MapData>(mapData)

useRegisterUndoRedo({ undo, redo, canUndo, canRedo })
```

### Use Batch Mode (for complex operations)
```typescript
const { startBatch, endBatch } = // from useUndoableReducer

// Start of operation
startBatch()

// Multiple changes (each just updates state, no history entries)
setState(newState1)
setState(newState2)
setState(newState3)

// End of operation
endBatch() // All above changes recorded as ONE history entry
```

## Key Concepts

### History Limits
- **Max history depth:** 50 states
- **Per tab:** Each map tab has independent history
- **Reset on:** Tab switch, component unmount

### State Structure
```typescript
{
  past: Array<MapData>,      // Previous states
  present: MapData,           // Current state
  future: Array<MapData>,     // States available for redo
  isBatching: boolean,        // In batch mode?
  batchStart: MapData | null  // State at batch start
}
```

### Action Types
- `SET` - Normal state update (adds to history)
- `UNDO` - Go back one step
- `REDO` - Go forward one step
- `RESET` - Clear history (for tab switches)
- `START_BATCH` - Begin grouping changes
- `END_BATCH` - Finalize batch as one history entry

## Control Flags

### canUndo
- **Condition:** `state.past.length > 0`
- **Use:** Disable undo button/key when false
- **Updated:** When reducer runs

### canRedo
- **Condition:** `state.future.length > 0`
- **Use:** Disable redo button/key when false
- **Updated:** When reducer runs, cleared on SET action

## Deep Equality

The system uses `deepEqual()` to prevent unnecessary history entries when:
- User clicks the same layer (no change to map)
- Value is set to identical content
- Prevents "invisible" undo steps

Handles:
- Primitives (`===` check)
- Arrays (same length, equal elements)
- Objects (same keys, equal values)
- Map objects (size and entries)
- Nested structures (recursive)

## Common Operations

### Add Layer (Already in UI)
```typescript
const handleAddLayer = () => {
  const newLayer = {
    id: `layer-${Date.now()}`,
    name: `Layer ${localMapData.layers.length + 1}`,
    visible: true,
    type: "tile" as const,
    tiles: new Array(localMapData.width * localMapData.height).fill(0),
    entities: [],
    autotilingEnabled: true,
  };
  
  setLocalMapData({
    ...localMapData,
    layers: [...(localMapData.layers || []), newLayer],
  });
  setCurrentLayerId(newLayer.id);
};
```

### Rename Layer
```typescript
const handleUpdateLayerName = (layerId: string, name: string) => {
  if (!localMapData?.layers) return;
  setLocalMapData({
    ...localMapData,
    layers: localMapData.layers.map((l) =>
      l.id === layerId ? { ...l, name } : l,
    ),
  });
};
```

### Toggle Visibility
```typescript
const handleUpdateLayerVisibility = (layerId: string, visible: boolean) => {
  if (!localMapData?.layers) return;
  setLocalMapData({
    ...localMapData,
    layers: localMapData.layers.map((l) =>
      l.id === layerId ? { ...l, visible } : l,
    ),
  });
};
```

### Toggle Autotiling
```typescript
const handleUpdateLayerAutotiling = (layerId: string, enabled: boolean) => {
  if (!localMapData?.layers) return;
  setLocalMapData({
    ...localMapData,
    layers: localMapData.layers.map((l) =>
      l.id === layerId ? { ...l, autotilingEnabled: enabled } : l
    ),
  });
};
```

## Important Notes

1. **Layer Type Validation:**
   - Layer types: `'tile'` or `'entity'`
   - Each type has different rendering and behavior

2. **Active Layer Switching:**
   - When removing the active layer, switch to first layer
   - Falls back to `null` if no layers remain
   - UI reflects current selection immediately

3. **Sync to Global State:**
   - Local changes flow to EditorContext via `updateMap()`
   - Global state is source of truth for persistence
   - Marks tab as dirty for save prompts

4. **History Boundaries:**
   - Don't persist across sessions (cleared on app restart)
   - Reset when switching map tabs
   - Prevents user confusion about "where am I in history?"

## Debugging Tips

1. **Check if undo works:** `canUndo` should be `true` after any change
2. **Check if redo available:** Change something, undo it, `canRedo` should be `true`
3. **History size:** Monitor `past.length` to ensure not growing unbounded
4. **Batch verification:** During batch, `isBatching` should be `true`
5. **Deep equality:** If unexpected history entry, might be deep equality issue

## Related Files Not Modified Yet

These could be enhanced with layer-specific features:
- `src/components/LayersPanel.tsx` - Older unused component (not in use)
- `src/context/EditorContext.tsx` - Contains deprecated layer functions
- Could add context menus, drag-reorder, more granular operations
