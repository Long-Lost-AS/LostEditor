# Undo/Redo System Flow Diagrams

## 1. Layer Removal Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ USER INTERACTION                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MapEditorView Component                                       │
│  ├── User selects a layer (click)                             │
│  ├── User clicks "- Remove" button                            │
│  └── onClick handler triggers handleRemoveLayer()             │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ STATE UPDATE                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  handleRemoveLayer(layerId)                                    │
│  ├── Filter: localMapData.layers.filter(l => l.id !== id)    │
│  ├── Call: setLocalMapData(newState)                          │
│  └── Side effect: Switch to first layer if removed was active │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ UNDO/REDO REDUCER (useUndoableReducer)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  undoableReducer(state, { type: "SET", payload: newState })   │
│  ├── Deep equality check: newState === state.present?         │
│  │   └─ If equal: return state unchanged                      │
│  │                                                             │
│  ├── Batching check: state.isBatching?                        │
│  │   └─ If true: just update present, don't record history   │
│  │                                                             │
│  └─ Normal case:                                              │
│      ├── ADD TO HISTORY:                                       │
│      │   past = [...past, present].slice(-50)                 │
│      ├── UPDATE PRESENT:                                       │
│      │   present = newState                                    │
│      ├── CLEAR FUTURE:                                         │
│      │   future = []                                           │
│      └── CLEAR BATCH FLAGS:                                    │
│          isBatching = false, batchStart = null                │
│                                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ STATE PROPAGATION                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  useEffect hook (line 101-114) detects localMapData change    │
│  ├── Call: updateMap(tab.mapId, localMapData)                 │
│  ├── Sets: EditorContext maps[mapId] = localMapData           │
│  └── Sets: Tab isDirty = true                                 │
│                                                                 │
│  MapEditorView re-renders with new state                      │
│  └── Layer list updated (removed layer disappears)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Undo Keyboard Shortcut Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ USER PRESSES Cmd+Z or Ctrl+Z                                    │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ UndoRedoProvider (Global)                                        │
│ ════════════════════════════════════════════════════════════════│
│                                                                  │
│  document.addEventListener('keydown', handleKeyDown)           │
│  ├── Check: (ctrlKey || metaKey) && key === 'z' && !shiftKey  │
│  │   └─ If TRUE: This is UNDO                                  │
│  │                                                              │
│  └── Get active callbacks:                                      │
│      ├── callbacks = callbacksRef.current                       │
│      │   (From most recent useRegisterUndoRedo call)           │
│      ├── Check: callbacks.canUndo?                             │
│      │   └─ If FALSE: do nothing                               │
│      │                                                          │
│      └─ If TRUE:                                               │
│          ├── e.preventDefault()                                 │
│          └── callbacks.undo()                                   │
│                                                                  │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Active Component's Undo Function                                 │
│ (MapEditorView's undo from useUndoableReducer)                  │
│ ════════════════════════════════════════════════════════════════│
│                                                                  │
│  useCallback(() => {                                            │
│    dispatch({ type: "UNDO" })                                   │
│  }, [])                                                         │
│                                                                  │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Undo Reducer Action                                              │
│ ════════════════════════════════════════════════════════════════│
│                                                                  │
│  case "UNDO": {                                                  │
│    if (state.past.length === 0) return state  // No history    │
│                                                │                 │
│    const previous = state.past[state.past.length - 1]          │
│    const newPast = state.past.slice(0, -1)                     │
│                                                                  │
│    return {                                                      │
│      past: newPast,              // Remove last entry           │
│      present: previous,          // Go back to previous state   │
│      future: [state.present, ...state.future],  // Save current │
│      isBatching: false,                                          │
│      batchStart: null,                                           │
│    }                                                             │
│  }                                                               │
│                                                                  │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Component Re-renders                                             │
│ ════════════════════════════════════════════════════════════════│
│                                                                  │
│  MapEditorView receives new state from reducer                 │
│  └─ Removed layer is back! (or previous state is restored)     │
│                                                                  │
│  UI updates:                                                     │
│  ├─ Layer list shows restored layer                            │
│  ├─ Current layer adjusted if needed                           │
│  └─ canUndo and canRedo flags updated                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 3. Redo Keyboard Shortcut Flow

```
USER PRESSES Cmd+Shift+Z or Cmd+Y (Mac) / Ctrl+Shift+Z or Ctrl+Y (Win)
        │
        ▼
UndoRedoProvider detects:
  (ctrlKey || metaKey) && (key === 'y' || (key === 'z' && shiftKey))
        │
        ▼
Calls: callbacks.redo()
        │
        ▼
Active component's redo function (from useUndoableReducer)
        │
        ▼
Dispatches: { type: "REDO" }
        │
        ▼
Reducer case "REDO": {
  if (state.future.length === 0) return state  // Nothing to redo
  
  const next = state.future[0]
  const newFuture = state.future.slice(1)
  
  return {
    past: [...state.past, state.present],  // Save current to history
    present: next,                          // Jump to next state
    future: newFuture,                     // Remove from future
    isBatching: false,
    batchStart: null,
  }
}
        │
        ▼
Component re-renders with next state
```

## 4. History State Structure Over Time

```
SCENARIO: User creates, removes, and re-adds layers

┌─────────────────────────────────────────────────────────────────┐
│ INITIAL STATE                                                   │
├─────────────────────────────────────────────────────────────────┤
│ past: []                                                        │
│ present: [Layer1, Layer2]                                      │
│ future: []                                                      │
│ canUndo: false, canRedo: false                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ User removes Layer2
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ AFTER REMOVE                                                    │
├─────────────────────────────────────────────────────────────────┤
│ past: [[Layer1, Layer2]]           (saved previous state)      │
│ present: [Layer1]                  (current state)              │
│ future: []                         (cleared when new change)    │
│ canUndo: true, canRedo: false                                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ User presses Undo (Cmd+Z)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ AFTER UNDO                                                      │
├─────────────────────────────────────────────────────────────────┤
│ past: []                           (removed from history)       │
│ present: [Layer1, Layer2]          (restored previous state)   │
│ future: [[Layer1]]                 (saved undone state)         │
│ canUndo: false, canRedo: true                                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ User adds Layer3
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ AFTER NEW CHANGE                                                │
├─────────────────────────────────────────────────────────────────┤
│ past: [[Layer1, Layer2]]           (saved previous state)       │
│ present: [Layer1, Layer2, Layer3]  (current state)              │
│ future: []                         (cleared - new path taken)   │
│ canUndo: true, canRedo: false                                  │
│                                                                 │
│ NOTE: [Layer1] future state is lost when new change made!      │
│       This prevents confusing branching behavior.               │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Registration and Callback Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ APPLICATION START                                                │
├──────────────────────────────────────────────────────────────────┤
│ App
│  └── UndoRedoProvider
│      ├── Creates callbacksRef (initially null)
│      ├── Adds global keydown listener
│      ├── Provides UndoRedoContext
│      └── Renders child components
│                                                                  │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ MAPEDITORVIEW MOUNTS                                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 1. useUndoableReducer(mapData)                                  │
│    ├── Creates: undo, redo, canUndo, canRedo functions        │
│    └── Returns: [state, setState, { undo, redo, ... }]        │
│                                                                  │
│ 2. useRegisterUndoRedo({ undo, redo, canUndo, canRedo })      │
│    ├── useContext(UndoRedoContext) → gets registration API    │
│    ├── useEffect with [context] dependency                    │
│    │   └─ Calls: context.registerCallbacks({...})             │
│    │       └─ Updates: callbacksRef.current = {...}           │
│    │                                                            │
│    └── Return cleanup:                                          │
│        └─ Calls: context.unregisterCallbacks()                 │
│            └─ Sets: callbacksRef.current = null                │
│                                                                  │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ GLOBAL STATE READY                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ UndoRedoProvider.callbacksRef.current = {                       │
│   undo: [MapEditorView's undo function],                        │
│   redo: [MapEditorView's redo function],                        │
│   canUndo: boolean,                                             │
│   canRedo: boolean,                                             │
│ }                                                                │
│                                                                  │
│ Keyboard listener is ACTIVE and will call these callbacks      │
│ when user presses Cmd/Ctrl+Z/Y                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 6. Deep Equality Check (Why No Unnecessary History)

```
┌──────────────────────────────────────────────────────────────────┐
│ SCENARIO: User has Layer1, clicks it (no change)               │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ setLocalMapData called (triggered by onClick)                   │
│ with same data: { ...localMapData, layers: same array }        │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ undoableReducer receives SET action                             │
│                                                                  │
│ case "SET": {                                                    │
│   if (deepEqual(state.present, action.payload)) {              │
│     return state  // <-- Early return! No change!              │
│   }                                                              │
│   ...                                                            │
│ }                                                                │
│                                                                  │
│ deepEqual Function:                                             │
│ ├─ Checks primitives: a === b                                  │
│ ├─ Checks arrays: same length, equal elements                  │
│ ├─ Checks objects: same keys, equal values                     │
│ └─ Handles Map objects (for sparse layer data)                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│ RESULT: History unchanged, no unnecessary entry created         │
│                                                                  │
│ past: (unchanged)                                               │
│ present: (unchanged)                                            │
│ future: (unchanged)                                             │
│ canUndo: (unchanged)                                            │
│ canRedo: (unchanged)                                            │
│                                                                  │
│ Component doesn't re-render (state object same reference)      │
└──────────────────────────────────────────────────────────────────┘
```

## 7. Batch Mode Example

```
SCENARIO: User drags and moves multiple tiles (complex operation)

┌─────────────────────────────────────────────────────────────────┐
│ INITIAL                                                         │
├─────────────────────────────────────────────────────────────────┤
│ past: [[layer1_v1], [layer1_v2]]                               │
│ present: [layer1_v3]                                            │
│ future: []                                                      │
│ isBatching: false                                               │
│ canUndo: true, canRedo: false                                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ User starts drag operation
                           │ startBatch() called
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ BATCHING ACTIVE                                                 │
├─────────────────────────────────────────────────────────────────┤
│ past: [[layer1_v1], [layer1_v2]]                               │
│ present: [layer1_v3]                                            │
│ future: []                                                      │
│ isBatching: true          ◄── Flag set!                         │
│ batchStart: [layer1_v3]   ◄── Snapshot of state at batch start │
│ canUndo: true, canRedo: false                                  │
└─────────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
      Move 1           Move 2            Move 3
         │                 │                 │
         ▼                 ▼                 ▼
    Dispatch SET      Dispatch SET      Dispatch SET
    (move tile 1)     (move tile 2)     (move tile 3)
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
          During batch, SET just updates present,
          doesn't add to history:
          present: [layer1_v4] → [layer1_v5] → [layer1_v6]
                           │
                           │ User releases mouse
                           │ endBatch() called
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ BATCH COMPLETE - Added as ONE history entry                    │
├─────────────────────────────────────────────────────────────────┤
│ past: [[layer1_v1], [layer1_v2], [layer1_v3]]                 │
│       └─ batchStart snapshot added!                            │
│ present: [layer1_v6]        (final state after all moves)      │
│ future: []                                                      │
│ isBatching: false                                               │
│ batchStart: null                                                │
│ canUndo: true, canRedo: false                                  │
│                                                                 │
│ Result: ONE undo reverts all 3 tile moves!                     │
└─────────────────────────────────────────────────────────────────┘
```

