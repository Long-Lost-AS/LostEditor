import { useReducer, useRef, useCallback } from "react";

// Action types for undo/redo
export type UndoableAction<T> =
	| { type: "SET"; payload: T }
	| { type: "UNDO" }
	| { type: "REDO" }
	| { type: "RESET"; payload: T }
	| { type: "START_BATCH" }
	| { type: "END_BATCH" };

// State structure
export interface UndoableState<T> {
	past: T[];
	present: T;
	future: T[];
	isBatching: boolean;
	batchStart: T | null;
}

// Deep equality check (simple implementation)
function deepEqual(a: any, b: any): boolean {
	if (a === b) return true;
	if (a == null || b == null) return false;
	if (typeof a !== "object" || typeof b !== "object") return false;

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) return false;

	for (const key of keysA) {
		if (!keysB.includes(key)) return false;
		if (!deepEqual(a[key], b[key])) return false;
	}

	return true;
}

// Reducer with undo/redo logic
function undoableReducer<T>(
	state: UndoableState<T>,
	action: UndoableAction<T>,
): UndoableState<T> {
	switch (action.type) {
		case "SET": {
			// Don't add to history if value hasn't changed
			if (deepEqual(state.present, action.payload)) {
				return state;
			}

			// If batching, just update present without recording history
			if (state.isBatching) {
				return { ...state, present: action.payload };
			}

			// Normal update: add to history
			return {
				past: [...state.past, state.present].slice(-50), // Keep last 50 states
				present: action.payload,
				future: [], // Clear future on new change
				isBatching: false,
				batchStart: null,
			};
		}

		case "UNDO": {
			if (state.past.length === 0) return state;

			const previous = state.past[state.past.length - 1];
			const newPast = state.past.slice(0, -1);

			return {
				past: newPast,
				present: previous,
				future: [state.present, ...state.future],
				isBatching: false,
				batchStart: null,
			};
		}

		case "REDO": {
			if (state.future.length === 0) return state;

			const next = state.future[0];
			const newFuture = state.future.slice(1);

			return {
				past: [...state.past, state.present],
				present: next,
				future: newFuture,
				isBatching: false,
				batchStart: null,
			};
		}

		case "START_BATCH": {
			return {
				...state,
				isBatching: true,
				batchStart: state.present,
			};
		}

		case "END_BATCH": {
			if (!state.isBatching) {
				return state;
			}

			// If nothing changed during batch, don't add to history
			if (deepEqual(state.batchStart, state.present)) {
				return {
					...state,
					isBatching: false,
					batchStart: null,
				};
			}

			// Add the batch start to history and keep current state as present
			return {
				past: [...state.past, state.batchStart!].slice(-50),
				present: state.present,
				future: [], // Clear future on new change
				isBatching: false,
				batchStart: null,
			};
		}

		case "RESET": {
			return {
				past: [],
				present: action.payload,
				future: [],
				// Preserve batching state during reset (important for drag operations)
				isBatching: state.isBatching,
				batchStart: state.isBatching ? action.payload : null,
			};
		}

		default:
			return state;
	}
}

export interface UndoableControls {
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
	startBatch: () => void;
	endBatch: () => void;
	reset: (newState: any) => void;
}

/**
 * Hook that provides undo/redo functionality using a reducer pattern.
 * This is more predictable than effect-based synchronization.
 */
export function useUndoableReducer<T>(
	initialState: T,
): [T, (newState: T) => void, UndoableControls] {
	const [state, dispatch] = useReducer(undoableReducer<T>, {
		past: [],
		present: initialState,
		future: [],
		isBatching: false,
		batchStart: null,
	});

	// Stable callbacks using useCallback
	const setState = useCallback((newState: T) => {
		dispatch({ type: "SET", payload: newState });
	}, []);

	const undo = useCallback(() => {
		dispatch({ type: "UNDO" });
	}, []);

	const redo = useCallback(() => {
		dispatch({ type: "REDO" });
	}, []);

	const startBatch = useCallback(() => {
		dispatch({ type: "START_BATCH" });
	}, []);

	const endBatch = useCallback(() => {
		dispatch({ type: "END_BATCH" });
	}, []);

	const reset = useCallback((newState: T) => {
		dispatch({ type: "RESET", payload: newState });
	}, []);

	const controls: UndoableControls = {
		undo,
		redo,
		canUndo: state.past.length > 0,
		canRedo: state.future.length > 0,
		startBatch,
		endBatch,
		reset,
	};

	return [state.present, setState, controls];
}
