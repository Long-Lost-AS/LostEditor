import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
} from "react";
import { isEditableElementFocused } from "../utils/keyboardUtils";

interface UndoRedoContextValue {
	registerCallbacks: (callbacks: UndoRedoCallbacks) => void;
	unregisterCallbacks: () => void;
}

export interface UndoRedoCallbacks {
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
}

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

/**
 * Hook to register undo/redo callbacks with the keyboard shortcut system
 * This should be called by any component that wants to handle undo/redo
 *
 * Uses refs to avoid re-registration on every callback change
 */
export function useRegisterUndoRedo(callbacks: UndoRedoCallbacks) {
	const context = useContext(UndoRedoContext);
	const callbacksRef = useRef(callbacks);

	// Update ref when callbacks change (doesn't trigger re-registration)
	useEffect(() => {
		callbacksRef.current = callbacks;
	}, [callbacks]);

	// Register only once when context is available
	useEffect(() => {
		if (context) {
			// Pass a stable wrapper that uses the ref
			context.registerCallbacks({
				undo: () => callbacksRef.current.undo(),
				redo: () => callbacksRef.current.redo(),
				get canUndo() {
					return callbacksRef.current.canUndo;
				},
				get canRedo() {
					return callbacksRef.current.canRedo;
				},
			});
			return () => context.unregisterCallbacks();
		}
	}, [context]); // Only depends on context, not callbacks
}

interface UndoRedoProviderProps {
	children: ReactNode;
}

/**
 * Provider that manages global keyboard shortcuts for undo/redo
 * Only the most recently registered callbacks will be active
 * This ensures that only the focused editor responds to shortcuts
 */
export function UndoRedoProvider({ children }: UndoRedoProviderProps) {
	const callbacksRef = useRef<UndoRedoCallbacks | null>(null);

	const registerCallbacks = (callbacks: UndoRedoCallbacks) => {
		callbacksRef.current = callbacks;
	};

	const unregisterCallbacks = () => {
		callbacksRef.current = null;
	};

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const callbacks = callbacksRef.current;
			if (!callbacks) return;

			// Don't intercept shortcuts when user is typing in an input field
			if (isEditableElementFocused(e)) {
				return;
			}

			// Undo: Cmd/Ctrl+Z (without Shift)
			if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
				if (callbacks.canUndo) {
					e.preventDefault();
					callbacks.undo();
				}
				return;
			}

			// Redo: Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y
			if (
				(e.ctrlKey || e.metaKey) &&
				(e.key === "y" || (e.key === "z" && e.shiftKey))
			) {
				if (callbacks.canRedo) {
					e.preventDefault();
					callbacks.redo();
				}
				return;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<UndoRedoContext.Provider
			value={{ registerCallbacks, unregisterCallbacks }}
		>
			{children}
		</UndoRedoContext.Provider>
	);
}
