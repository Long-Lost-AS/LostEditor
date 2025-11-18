import { useCallback, useReducer, useRef } from "react";
import type { MapData } from "../types";

/**
 * Represents a change to a specific chunk of tiles
 */
interface ChunkPatch {
	layerId: string;
	chunkX: number;
	chunkY: number;
	chunkSize: number; // 64x64 typically
	oldTiles: number[]; // Only the tiles in this chunk
	newTiles: number[];
}

/**
 * A set of chunk patches representing a single undoable action
 */
interface MapPatch {
	chunks: ChunkPatch[];
	timestamp: number;
}

interface ChunkedMapState {
	present: MapData;
	past: MapPatch[];
	future: MapPatch[];
	isBatching: boolean;
	batchPatches: ChunkPatch[];
	lastAffectedChunks: Array<{
		layerId: string;
		chunkX: number;
		chunkY: number;
	}> | null;
}

type ChunkedMapAction =
	| {
			type: "SET";
			payload: MapData;
			affectedChunks?: Array<{
				layerId: string;
				chunkX: number;
				chunkY: number;
			}>;
			oldChunkData?: Array<{
				layerId: string;
				chunkX: number;
				chunkY: number;
				tiles: number[];
			}>;
	  }
	| { type: "UNDO" }
	| { type: "REDO" }
	| { type: "RESET"; payload: MapData }
	| { type: "START_BATCH" }
	| { type: "END_BATCH" };

const CHUNK_SIZE = 64;

/**
 * Extract tiles for a specific chunk from a layer
 */
function extractChunkTiles(
	layer: MapData["layers"][0],
	chunkX: number,
	chunkY: number,
	mapWidth: number,
	mapHeight: number,
): number[] {
	const tiles: number[] = [];
	const startX = chunkX * CHUNK_SIZE;
	const startY = chunkY * CHUNK_SIZE;
	const endX = Math.min(startX + CHUNK_SIZE, mapWidth);
	const endY = Math.min(startY + CHUNK_SIZE, mapHeight);

	for (let y = startY; y < endY; y++) {
		for (let x = startX; x < endX; x++) {
			const index = y * mapWidth + x;
			tiles.push(layer.tiles[index] || 0);
		}
	}

	return tiles;
}

/**
 * Apply chunk tiles back to a layer
 */
function applyChunkTiles(
	layer: MapData["layers"][0],
	chunkTiles: number[],
	chunkX: number,
	chunkY: number,
	mapWidth: number,
	mapHeight: number,
): void {
	const startX = chunkX * CHUNK_SIZE;
	const startY = chunkY * CHUNK_SIZE;
	const endX = Math.min(startX + CHUNK_SIZE, mapWidth);
	const endY = Math.min(startY + CHUNK_SIZE, mapHeight);

	let tileIdx = 0;
	for (let y = startY; y < endY; y++) {
		for (let x = startX; x < endX; x++) {
			const index = y * mapWidth + x;
			layer.tiles[index] = chunkTiles[tileIdx++];
		}
	}
}

/**
 * Create patches for affected chunks by comparing old and new state
 */
function createPatches(
	newMap: MapData,
	affectedChunks?: Array<{ layerId: string; chunkX: number; chunkY: number }>,
	oldChunkData?: Array<{
		layerId: string;
		chunkX: number;
		chunkY: number;
		tiles: number[];
	}>,
): ChunkPatch[] {
	const patches: ChunkPatch[] = [];

	// If no specific chunks specified, we'd need to scan everything (expensive!)
	// For now, require affectedChunks to be passed
	if (!affectedChunks || affectedChunks.length === 0) {
		console.warn(
			"[useChunkedMapUndo] No affected chunks specified - skipping patch creation",
		);
		return [];
	}

	// If no old chunk data, we can't create patches (shouldn't happen in normal flow)
	if (!oldChunkData || oldChunkData.length === 0) {
		console.warn(
			"[useChunkedMapUndo] No old chunk data - skipping patch creation",
		);
		return [];
	}

	for (const { layerId, chunkX, chunkY } of affectedChunks) {
		const newLayer = newMap.layers.find((l) => l.id === layerId);
		const oldChunk = oldChunkData.find(
			(c) =>
				c.layerId === layerId && c.chunkX === chunkX && c.chunkY === chunkY,
		);

		if (!newLayer || !oldChunk) {
			continue;
		}

		const oldTiles = oldChunk.tiles;
		const newTiles = extractChunkTiles(
			newLayer,
			chunkX,
			chunkY,
			newMap.width,
			newMap.height,
		);

		// Only create patch if tiles actually changed
		if (JSON.stringify(oldTiles) !== JSON.stringify(newTiles)) {
			patches.push({
				layerId,
				chunkX,
				chunkY,
				chunkSize: CHUNK_SIZE,
				oldTiles,
				newTiles,
			});
		}
	}

	return patches;
}

/**
 * Apply a patch to restore a previous state
 */
function applyPatch(map: MapData, patch: MapPatch, reverse: boolean): MapData {
	// Create new map structure (shallow copies for React change detection)
	// but KEEP the same tiles arrays - we'll mutate them in place
	const newMap: MapData = {
		...map,
		layers: map.layers.map((layer) => ({ ...layer })),
	};

	for (const chunkPatch of patch.chunks) {
		const layer = newMap.layers.find((l) => l.id === chunkPatch.layerId);
		if (!layer) continue;

		// Apply old or new tiles depending on direction
		// Mutate the tiles array IN PLACE (no cloning!)
		const tilesToApply = reverse ? chunkPatch.oldTiles : chunkPatch.newTiles;
		applyChunkTiles(
			layer,
			tilesToApply,
			chunkPatch.chunkX,
			chunkPatch.chunkY,
			newMap.width,
			newMap.height,
		);
	}

	return newMap;
}

function chunkedMapReducer(
	state: ChunkedMapState,
	action: ChunkedMapAction,
): ChunkedMapState {
	switch (action.type) {
		case "SET": {
			// Reference equality check
			if (state.present === action.payload) {
				return state;
			}

			// Create patches for changed chunks
			const patches = createPatches(
				action.payload,
				action.affectedChunks,
				action.oldChunkData,
			);

			// If batching, accumulate patches (merge patches for same chunks)
			if (state.isBatching) {
				// Merge new patches with existing batch patches
				// For each chunk, keep the FIRST old state and the LAST new state
				const mergedPatches = [...state.batchPatches];

				for (const newPatch of patches) {
					const existingIdx = mergedPatches.findIndex(
						(p) =>
							p.layerId === newPatch.layerId &&
							p.chunkX === newPatch.chunkX &&
							p.chunkY === newPatch.chunkY,
					);

					if (existingIdx >= 0) {
						// Merge: keep old oldTiles, use new newTiles
						mergedPatches[existingIdx] = {
							...mergedPatches[existingIdx],
							newTiles: newPatch.newTiles,
						};
					} else {
						// Add new patch
						mergedPatches.push(newPatch);
					}
				}

				return {
					...state,
					present: action.payload,
					batchPatches: mergedPatches,
				};
			}

			// If no patches (nothing changed), don't add to history
			if (patches.length === 0) {
				return { ...state, present: action.payload, lastAffectedChunks: null };
			}

			// Add to history
			return {
				...state,
				present: action.payload,
				past: [...state.past, { chunks: patches, timestamp: Date.now() }].slice(
					-50,
				),
				future: [],
				lastAffectedChunks: null,
			};
		}

		case "UNDO": {
			if (state.past.length === 0) {
				return state;
			}

			const patch = state.past[state.past.length - 1];
			const newPast = state.past.slice(0, -1);

			// Apply patch in reverse
			const restoredMap = applyPatch(state.present, patch, true);

			// Extract affected chunks for cache invalidation
			const affectedChunks = patch.chunks.map((c) => ({
				layerId: c.layerId,
				chunkX: c.chunkX,
				chunkY: c.chunkY,
			}));

			return {
				...state,
				past: newPast,
				present: restoredMap,
				future: [patch, ...state.future],
				lastAffectedChunks: affectedChunks,
			};
		}

		case "REDO": {
			if (state.future.length === 0) return state;

			const patch = state.future[0];
			const newFuture = state.future.slice(1);

			// Apply patch forward
			const restoredMap = applyPatch(state.present, patch, false);

			// Extract affected chunks for cache invalidation
			const affectedChunks = patch.chunks.map((c) => ({
				layerId: c.layerId,
				chunkX: c.chunkX,
				chunkY: c.chunkY,
			}));

			return {
				...state,
				past: [...state.past, patch],
				present: restoredMap,
				future: newFuture,
				lastAffectedChunks: affectedChunks,
			};
		}

		case "START_BATCH": {
			return {
				...state,
				isBatching: true,
				batchPatches: [],
			};
		}

		case "END_BATCH": {
			if (!state.isBatching) return state;

			// If no changes during batch, don't add to history
			if (state.batchPatches.length === 0) {
				return {
					...state,
					isBatching: false,
					batchPatches: [],
				};
			}

			// Add batched patches as single undo action
			return {
				...state,
				past: [
					...state.past,
					{ chunks: state.batchPatches, timestamp: Date.now() },
				].slice(-50),
				future: [],
				isBatching: false,
				batchPatches: [],
			};
		}

		case "RESET": {
			return {
				past: [],
				present: action.payload,
				future: [],
				isBatching: state.isBatching,
				batchPatches: state.isBatching ? [] : [],
			};
		}

		default:
			return state;
	}
}

export interface ChunkedMapControls {
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
	startBatch: () => void;
	endBatch: () => void;
	reset: (newState: MapData) => void;
	lastAffectedChunks: Array<{
		layerId: string;
		chunkX: number;
		chunkY: number;
	}> | null;
}

/**
 * Chunk-optimized undo/redo for large maps
 * Only stores changed 64x64 chunks instead of entire map
 */
export function useChunkedMapUndo(
	initialState: MapData,
): [
	MapData,
	(
		newState: MapData | ((prev: MapData) => MapData),
		affectedChunks?: Array<{ layerId: string; chunkX: number; chunkY: number }>,
	) => void,
	ChunkedMapControls,
] {
	const [state, dispatch] = useReducer(chunkedMapReducer, {
		past: [],
		present: initialState,
		future: [],
		isBatching: false,
		batchPatches: [],
		lastAffectedChunks: null,
	});

	const stateRef = useRef(state);
	stateRef.current = state;

	const setState = useCallback(
		(
			newState: MapData | ((prev: MapData) => MapData),
			affectedChunks?: Array<{
				layerId: string;
				chunkX: number;
				chunkY: number;
			}>,
		) => {
			if (typeof newState === "function") {
				const updater = newState as (prev: MapData) => MapData;

				// CRITICAL: Extract old chunk data BEFORE calling updater (which may mutate in place)
				const oldChunkData = affectedChunks
					?.map(({ layerId, chunkX, chunkY }) => {
						const layer = stateRef.current.present.layers.find(
							(l) => l.id === layerId,
						);
						if (!layer) return null;
						const tiles = extractChunkTiles(
							layer,
							chunkX,
							chunkY,
							stateRef.current.present.width,
							stateRef.current.present.height,
						);
						return {
							layerId,
							chunkX,
							chunkY,
							tiles,
						};
					})
					.filter(Boolean) as Array<{
					layerId: string;
					chunkX: number;
					chunkY: number;
					tiles: number[];
				}>;

				const computed = updater(stateRef.current.present);
				dispatch({
					type: "SET",
					payload: computed,
					affectedChunks,
					oldChunkData,
				});
			} else {
				dispatch({ type: "SET", payload: newState, affectedChunks });
			}
		},
		[],
	);

	const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
	const redo = useCallback(() => dispatch({ type: "REDO" }), []);
	const startBatch = useCallback(() => dispatch({ type: "START_BATCH" }), []);
	const endBatch = useCallback(() => dispatch({ type: "END_BATCH" }), []);
	const reset = useCallback(
		(newState: MapData) => dispatch({ type: "RESET", payload: newState }),
		[],
	);

	const controls: ChunkedMapControls = {
		undo,
		redo,
		canUndo: state.past.length > 0,
		canRedo: state.future.length > 0,
		startBatch,
		endBatch,
		reset,
		lastAffectedChunks: state.lastAffectedChunks,
	};

	return [state.present, setState, controls];
}
