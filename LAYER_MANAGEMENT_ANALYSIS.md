# Layer Management Code Analysis - LostEditor

## Executive Summary

The layer management system in LostEditor is primarily handled through:
1. **MapEditorView.tsx** - Component managing local map state with undo/redo
2. **UndoRedoContext.tsx** - Global keyboard shortcut handler for Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
3. **useUndoableReducer.ts** - Core undo/redo state machine with history tracking
4. **EditorContext.tsx** - Global editor state (contains deprecated layer management functions)

---

## 1. Layer List UI Rendering and Remove Button

### Location: MapEditorView.tsx (Lines 628-762)

The layer list is rendered inside MapEditorView's left sidebar with the following structure:

```tsx
{localMapData?.layers?.map((layer) => (
  <div
    key={layer.id}
    className={`px-2 py-1.5 text-xs rounded cursor-pointer transition-colors flex items-center gap-2 ${
      currentLayer?.id === layer.id
        ? "bg-[#0e639c] text-white"
        : "bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3e3e42]"
    }`}
    style={{ border: "1px solid #3e3e42" }}
    onClick={() => setCurrentLayerId(layer.id)}
    onDoubleClick={() => handleLayerDoubleClick(layer)}
    onMouseDown={(e) => {
      if (e.detail > 1) {
        e.preventDefault();
      }
    }}
  >
    {/* Visibility Checkbox */}
    <input
      type="checkbox"
      checked={layer.visible}
      onChange={(e) => {
        e.stopPropagation();
        handleUpdateLayerVisibility(layer.id, e.target.checked);
      }}
      title="Toggle visibility"
      style={{ accentColor: "#007acc" }}
    />
    
    {/* Autotiling Button (for tile layers only) */}
    {layer.type === "tile" && (
      <button>🗠</button>
    )}
    
    {/* Layer Name (editable on double-click) */}
    {editingLayerId === layer.id ? (
      <input type="text" /* ... editing mode ... */ />
    ) : (
      <span className="flex-1">{layer.name}</span>
    )}
  </div>
))}

{/* Remove Button - Below the layer list */}
<button
  onClick={() => currentLayer && handleRemoveLayer(currentLayer.id)}
  disabled={!currentLayer}
  className="px-2 py-1.5 text-xs rounded transition-colors"
  style={{
    background: currentLayer ? "#5a5a5a" : "#3e3e42",
    color: currentLayer ? "#ffffff" : "#858585",
    border: "none",
    cursor: currentLayer ? "pointer" : "not-allowed",
  }}
>
  - Remove
</button>
```

### Remove Button Handler: `handleRemoveLayer` (Lines 196-205)

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

**Key Points:**
- The remove button is disabled when no layer is selected (`disabled={!currentLayer}`)
- It uses a filter to remove the layer from the layers array
- If the removed layer was the current layer, it switches to the first layer in the list
- The operation is **immutable** - creates a new array and state object

---

## 2. How Layers Are Currently Removed

### Current Implementation Flow:

1. **User clicks "Remove" button** → `handleRemoveLayer(layerId)` is called

2. **handleRemoveLayer** does:
   - Filters out the layer with matching ID
   - Updates localMapData with new layers array
   - Switches current layer if needed
   - **Triggers state update through setLocalMapData**

3. **setLocalMapData** from `useUndoableReducer`:
   - Dispatches a SET action to the undo/redo reducer
   - Creates a new history entry (adds previous state to `past` array)
   - Clears the `future` array (since a new change invalidates redo)
   - Keeps up to 50 history states

4. **useEffect syncs to global state**:
   - The local change updates `localMapData`
   - A useEffect at line 101-114 syncs this to EditorContext via `updateMap()`
   - This also marks the tab as dirty (`isDirty: true`)

### State Flow Diagram:
```
User Action (Remove Button)
        ↓
handleRemoveLayer()
        ↓
setLocalMapData() [from useUndoableReducer]
        ↓
undoableReducer() [SET action]
        ↓
Updates state.present + Adds to state.past
        ↓
useEffect detects change
        ↓
updateMap() [EditorContext]
        ↓
Global maps array updated
```

---

## 3. Undo/Redo System Implementation and Integration

### Architecture: Three-Layer System

#### Layer 1: UndoRedoContext.tsx - Keyboard Shortcut Handler
**File:** `/Users/richardegeli1/Programming/LostEditor/src/context/UndoRedoContext.tsx`

- **Purpose:** Global keyboard shortcut listener for Cmd/Ctrl+Z/Y
- **Scope:** Application-wide
- **Implementation:**
  ```typescript
  export function UndoRedoProvider({ children }: UndoRedoProviderProps) {
    const callbacksRef = useRef<UndoRedoCallbacks | null>(null)
    
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const callbacks = callbacksRef.current
        if (!callbacks) return
        
        // Undo: Cmd/Ctrl+Z (without Shift)
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          if (callbacks.canUndo) {
            e.preventDefault()
            callbacks.undo()
          }
          return
        }
        
        // Redo: Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          if (callbacks.canRedo) {
            e.preventDefault()
            callbacks.redo()
          }
          return
        }
      }
      
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [])
    
    return (
      <UndoRedoContext.Provider value={{ registerCallbacks, unregisterCallbacks }}>
        {children}
      </UndoRedoContext.Provider>
    )
  }
  ```

**Keyboard Shortcuts:**
- **Undo:** Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
- **Redo:** Cmd+Shift+Z or Cmd+Y (Mac) / Ctrl+Shift+Z or Ctrl+Y (Windows/Linux)

#### Layer 2: useRegisterUndoRedo Hook
**File:** `/Users/richardegeli1/Programming/LostEditor/src/context/UndoRedoContext.tsx` (Lines 23-45)

```typescript
export function useRegisterUndoRedo(callbacks: UndoRedoCallbacks) {
  const context = useContext(UndoRedoContext)
  const callbacksRef = useRef(callbacks)
  
  // Update ref when callbacks change (doesn't trigger re-registration)
  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])
  
  // Register only once when context is available
  useEffect(() => {
    if (context) {
      context.registerCallbacks({
        undo: () => callbacksRef.current.undo(),
        redo: () => callbacksRef.current.redo(),
        get canUndo() { return callbacksRef.current.canUndo },
        get canRedo() { return callbacksRef.current.canRedo },
      })
      return () => context.unregisterCallbacks()
    }
  }, [context])
}
```

**Purpose:** Components register their undo/redo callbacks with the global provider

**Integration in MapEditorView (Line 62):**
```typescript
const [
  localMapData,
  setLocalMapData,
  { undo, redo, canUndo, canRedo, reset: resetMapHistory },
] = useUndoableReducer<MapData>(mapData)

// Register undo/redo keyboard shortcuts
useRegisterUndoRedo({ undo, redo, canUndo, canRedo })
```

#### Layer 3: useUndoableReducer Hook
**File:** `/Users/richardegeli1/Programming/LostEditor/src/hooks/useUndoableReducer.ts`

This is the core undo/redo state machine.

**State Structure:**
```typescript
interface UndoableState<T> {
  past: T[]           // Array of previous states (max 50)
  present: T          // Current state
  future: T[]         // States that can be redone
  isBatching: boolean // For grouping multiple changes
  batchStart: T | null // State at start of batch
}
```

**Action Types:**
```typescript
type UndoableAction<T> =
  | { type: "SET"; payload: T }      // Normal state update
  | { type: "UNDO" }                  // Go back one step
  | { type: "REDO" }                  // Go forward one step
  | { type: "RESET"; payload: T }     // Reset history (for tab switching)
  | { type: "START_BATCH" }           // Start grouping changes
  | { type: "END_BATCH" }             // Stop grouping changes
```

**Core Reducer Logic:**

1. **SET Action (Lines 65-83):**
   ```typescript
   case "SET": {
     // Don't add to history if value hasn't changed
     if (deepEqual(state.present, action.payload)) {
       return state
     }
     
     // If batching, just update present without recording history
     if (state.isBatching) {
       return { ...state, present: action.payload }
     }
     
     // Normal update: add to history
     return {
       past: [...state.past, state.present].slice(-50), // Keep last 50
       present: action.payload,
       future: [],  // Clear future on new change
       isBatching: false,
       batchStart: null,
     }
   }
   ```

2. **UNDO Action (Lines 86-98):**
   ```typescript
   case "UNDO": {
     if (state.past.length === 0) return state
     
     const previous = state.past[state.past.length - 1]
     const newPast = state.past.slice(0, -1)
     
     return {
       past: newPast,
       present: previous,
       future: [state.present, ...state.future],
       isBatching: false,
       batchStart: null,
     }
   }
   ```

3. **REDO Action (Lines 101-113):**
   ```typescript
   case "REDO": {
     if (state.future.length === 0) return state
     
     const next = state.future[0]
     const newFuture = state.future.slice(1)
     
     return {
       past: [...state.past, state.present],
       present: next,
       future: newFuture,
       isBatching: false,
       batchStart: null,
     }
   }
   ```

4. **BATCH Operations (Lines 116-145):**
   - `START_BATCH`: Groups multiple rapid changes into one undo step
   - `END_BATCH`: Finalizes the batch and adds it to history

**Deep Equality Check (Lines 22-57):**
```typescript
function deepEqual(a: any, b: any): boolean {
  // Handles:
  // - Primitives
  // - Map objects
  // - Arrays
  // - Plain objects
  // - Nested structures
}
```

This prevents unnecessary history entries when no actual change occurs.

**Public Controls Interface (Lines 164-172):**
```typescript
interface UndoableControls {
  undo: () => void
  redo: () => void
  canUndo: boolean      // true if past.length > 0
  canRedo: boolean      // true if future.length > 0
  startBatch: () => void
  endBatch: () => void
  reset: (newState: any) => void
}
```

### History Reset on Tab Switch
**Location:** MapEditorView.tsx (Lines 91-98)

```typescript
// Reset undo history when switching to a different map tab
useEffect(() => {
  if (prevTabIdRef.current !== null && prevTabIdRef.current !== tab.id) {
    // Switching to a different map tab, reset history
    resetMapHistory(mapData)
  }
  prevTabIdRef.current = tab.id
}, [tab.id, mapData, resetMapHistory])
```

**Purpose:** Each map tab has its own independent undo/redo history

### Integration Summary Flow:

```
MapEditorView.tsx
        ↓
useUndoableReducer() [Returns state, setState, controls]
        ↓
useRegisterUndoRedo() [Registers undo/redo callbacks globally]
        ↓
UndoRedoContext [Listens for Cmd/Ctrl+Z/Y]
        ↓
Keyboard Event
        ↓
Calls registered callbacks (undo/redo/canUndo/canRedo)
        ↓
undoableReducer() dispatches UNDO/REDO action
        ↓
State transitions (past ↔ present ↔ future)
        ↓
Component re-renders with new state
```

---

## 4. File Locations Summary

### Core Files:

1. **Layer UI Rendering:**
   - `/Users/richardegeli1/Programming/LostEditor/src/components/MapEditorView.tsx` (Lines 628-762)

2. **Layer Removal Logic:**
   - `/Users/richardegeli1/Programming/LostEditor/src/components/MapEditorView.tsx` (Lines 196-205)

3. **Undo/Redo Context & Shortcuts:**
   - `/Users/richardegeli1/Programming/LostEditor/src/context/UndoRedoContext.tsx`

4. **Undo/Redo State Machine:**
   - `/Users/richardegeli1/Programming/LostEditor/src/hooks/useUndoableReducer.ts`

5. **Global Editor Context (Deprecated):**
   - `/Users/richardegeli1/Programming/LostEditor/src/context/EditorContext.tsx`
   - Contains: `removeLayer()` (Lines 413-425) - OLD, not used by MapEditorView

6. **Type Definitions:**
   - `/Users/richardegeli1/Programming/LostEditor/src/types.ts`
   - Layer interface at Lines 118-126

### Deprecated Code Note:

The `EditorContext.tsx` contains layer management functions (`addLayer`, `removeLayer`, `updateLayerVisibility`, etc.) but MapEditorView doesn't use them. Instead, it manages layers locally through `useUndoableReducer`, which provides proper undo/redo support.

---

## Key Implementation Details

### 1. Why Local State with useUndoableReducer?

**Advantages:**
- Each map tab has independent undo history
- Full control over state transitions
- Supports batching for complex operations (drag operations)
- Can reset history when switching tabs
- Prevents conflicts between simultaneous tab edits

### 2. Deep Copy Pattern

All layer operations use immutable updates:
```typescript
setLocalMapData({
  ...localMapData,
  layers: localMapData.layers.filter((l) => l.id !== layerId),
})
```

This ensures:
- Previous states can be stored in undo history
- React detects changes correctly
- No accidental mutations

### 3. History Limit

The undo/redo system keeps maximum 50 states:
```typescript
past: [...state.past, state.present].slice(-50)
```

This balances memory usage with practical undo depth.

### 4. Batch Mode

For drag operations or multi-step changes, the system supports batching:
```typescript
startBatch() // Start recording
// ... multiple changes ...
endBatch()   // Records as single undo step
```

### 5. Tab State Isolation

Each map tab resets history when switched:
```typescript
resetMapHistory(mapData)
```

This prevents the history from growing unbounded when working with multiple maps.

---

## Potential Issues & Notes

1. **No Context Menu:**
   - Currently no right-click context menu for layer operations
   - All operations are through UI buttons

2. **Deprecated Global Functions:**
   - EditorContext contains `removeLayer()` but it's not integrated with undo/redo
   - MapEditorView has its own local implementation instead

3. **Batch Mode Limitations:**
   - Batching only works within a component that calls `startBatch()/endBatch()`
   - Not automatically applied to all operations

4. **History Sync:**
   - Local undo history doesn't persist between sessions
   - Clearing history happens on tab switch
   - Good for preventing confusion, but means redo is lost when switching tabs

---

## Summary Table

| Aspect | Location | Implementation |
|--------|----------|-----------------|
| **Remove Button UI** | MapEditorView.tsx:735-759 | Disabled button; calls `handleRemoveLayer()` |
| **Remove Logic** | MapEditorView.tsx:196-205 | Filters layer from array; switches current layer |
| **Undo Shortcuts** | UndoRedoContext.tsx:67-93 | Global keydown listener (Cmd/Ctrl+Z/Y) |
| **Redo Shortcuts** | UndoRedoContext.tsx:81-87 | Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y |
| **State Machine** | useUndoableReducer.ts:60-162 | Reducer with past/present/future arrays |
| **Max History** | useUndoableReducer.ts:78 | 50 states |
| **Keyboard Integration** | MapEditorView.tsx:62 | `useRegisterUndoRedo()` hook |
| **History Reset** | MapEditorView.tsx:91-98 | On tab switch via `resetMapHistory()` |

