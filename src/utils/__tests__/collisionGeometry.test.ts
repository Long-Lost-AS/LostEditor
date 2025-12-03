import { describe, expect, it } from "vitest";
import {
	calculateDistance,
	calculatePolygonCenter,
	canClosePolygon,
	findEdgeAtPosition,
	findPointAtPosition,
	getWorldPoints,
	isPointInPolygon,
	migrateColliderToPositionFormat,
	offsetPolygon,
} from "../collisionGeometry";

describe("collisionGeometry", () => {
	describe("calculateDistance", () => {
		it("should calculate distance between two points", () => {
			expect(calculateDistance(0, 0, 3, 4)).toBe(5);
			expect(calculateDistance(0, 0, 0, 0)).toBe(0);
			expect(calculateDistance(1, 1, 4, 5)).toBe(5);
		});

		it("should handle negative coordinates", () => {
			expect(calculateDistance(-3, -4, 0, 0)).toBe(5);
			expect(calculateDistance(-1, -1, -4, -5)).toBe(5);
		});
	});

	describe("findPointAtPosition", () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];

		it("should find a point within threshold", () => {
			expect(findPointAtPosition(points, 0, 0, 5)).toBe(0);
			expect(findPointAtPosition(points, 10, 0, 5)).toBe(1);
			expect(findPointAtPosition(points, 10, 10, 5)).toBe(2);
			expect(findPointAtPosition(points, 0, 10, 5)).toBe(3);
		});

		it("should find a point near but not exactly on it", () => {
			expect(findPointAtPosition(points, 2, 2, 5)).toBe(0);
			expect(findPointAtPosition(points, 8, 1, 5)).toBe(1);
		});

		it("should return null when no point is within threshold", () => {
			expect(findPointAtPosition(points, 5, 5, 2)).toBeNull();
			expect(findPointAtPosition(points, 100, 100, 5)).toBeNull();
		});

		it("should return first matching point", () => {
			const closePoints = [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
			];
			expect(findPointAtPosition(closePoints, 0.5, 0, 2)).toBe(0);
		});

		it("should handle empty array", () => {
			expect(findPointAtPosition([], 0, 0, 5)).toBeNull();
		});
	});

	describe("isPointInPolygon", () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];

		it("should return true for point inside polygon", () => {
			expect(isPointInPolygon(5, 5, square)).toBe(true);
			expect(isPointInPolygon(1, 1, square)).toBe(true);
			expect(isPointInPolygon(9, 9, square)).toBe(true);
		});

		it("should return false for point outside polygon", () => {
			expect(isPointInPolygon(-5, 5, square)).toBe(false);
			expect(isPointInPolygon(15, 5, square)).toBe(false);
			expect(isPointInPolygon(5, -5, square)).toBe(false);
			expect(isPointInPolygon(5, 15, square)).toBe(false);
		});

		it("should handle triangle", () => {
			const triangle = [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 5, y: 10 },
			];
			expect(isPointInPolygon(5, 3, triangle)).toBe(true);
			expect(isPointInPolygon(0, 10, triangle)).toBe(false);
		});

		it("should return false for polygon with less than 3 points", () => {
			expect(isPointInPolygon(0, 0, [])).toBe(false);
			expect(isPointInPolygon(0, 0, [{ x: 0, y: 0 }])).toBe(false);
			expect(
				isPointInPolygon(0, 0, [
					{ x: 0, y: 0 },
					{ x: 1, y: 1 },
				]),
			).toBe(false);
		});

		it("should handle concave polygon", () => {
			const concave = [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 5, y: 5 },
				{ x: 0, y: 10 },
			];
			expect(isPointInPolygon(2, 5, concave)).toBe(true);
			expect(isPointInPolygon(8, 5, concave)).toBe(true);
			expect(isPointInPolygon(5, 7, concave)).toBe(false);
		});
	});

	describe("findEdgeAtPosition", () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];

		it("should find edge when point is near it", () => {
			// Near bottom edge
			const bottomEdge = findEdgeAtPosition(square, 5, 1, 2);
			expect(bottomEdge).not.toBeNull();
			expect(bottomEdge?.edgeIndex).toBe(0);

			// Near right edge
			const rightEdge = findEdgeAtPosition(square, 9, 5, 2);
			expect(rightEdge).not.toBeNull();
			expect(rightEdge?.edgeIndex).toBe(1);

			// Near top edge
			const topEdge = findEdgeAtPosition(square, 5, 9, 2);
			expect(topEdge).not.toBeNull();
			expect(topEdge?.edgeIndex).toBe(2);

			// Near left edge
			const leftEdge = findEdgeAtPosition(square, 1, 5, 2);
			expect(leftEdge).not.toBeNull();
			expect(leftEdge?.edgeIndex).toBe(3);
		});

		it("should return projection point on edge", () => {
			const result = findEdgeAtPosition(square, 5, 1, 2);
			expect(result).not.toBeNull();
			expect(result?.insertX).toBeCloseTo(5);
			expect(result?.insertY).toBeCloseTo(0);
		});

		it("should return null when no edge is within threshold", () => {
			expect(findEdgeAtPosition(square, 5, 5, 2)).toBeNull();
			expect(findEdgeAtPosition(square, 100, 100, 2)).toBeNull();
		});

		it("should return null for polygon with less than 2 points", () => {
			expect(findEdgeAtPosition([], 0, 0, 5)).toBeNull();
			expect(findEdgeAtPosition([{ x: 0, y: 0 }], 0, 0, 5)).toBeNull();
		});

		it("should handle zero-length edge", () => {
			const degenerate = [
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
			];
			// Should skip zero-length edge and find the next one
			const result = findEdgeAtPosition(degenerate, 5, 1, 2);
			expect(result).not.toBeNull();
		});

		it("should clamp projection to edge bounds", () => {
			// Point beyond edge endpoint
			const result = findEdgeAtPosition(square, -5, 0, 10);
			expect(result).not.toBeNull();
			expect(result?.insertX).toBeCloseTo(0);
			expect(result?.insertY).toBeCloseTo(0);
		});
	});

	describe("calculatePolygonCenter", () => {
		it("should calculate center of a square", () => {
			const square = [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
				{ x: 0, y: 10 },
			];
			const center = calculatePolygonCenter(square);
			expect(center.x).toBe(5);
			expect(center.y).toBe(5);
		});

		it("should calculate center of a triangle", () => {
			const triangle = [
				{ x: 0, y: 0 },
				{ x: 6, y: 0 },
				{ x: 3, y: 6 },
			];
			const center = calculatePolygonCenter(triangle);
			expect(center.x).toBe(3);
			expect(center.y).toBe(2);
		});

		it("should return origin for empty array", () => {
			const center = calculatePolygonCenter([]);
			expect(center.x).toBe(0);
			expect(center.y).toBe(0);
		});

		it("should handle single point", () => {
			const center = calculatePolygonCenter([{ x: 5, y: 10 }]);
			expect(center.x).toBe(5);
			expect(center.y).toBe(10);
		});

		it("should handle negative coordinates", () => {
			const polygon = [
				{ x: -10, y: -10 },
				{ x: 10, y: -10 },
				{ x: 10, y: 10 },
				{ x: -10, y: 10 },
			];
			const center = calculatePolygonCenter(polygon);
			expect(center.x).toBe(0);
			expect(center.y).toBe(0);
		});
	});

	describe("offsetPolygon", () => {
		it("should offset all points by delta", () => {
			const points = [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
			];
			const offset = offsetPolygon(points, 5, 3);
			expect(offset).toEqual([
				{ x: 5, y: 3 },
				{ x: 15, y: 3 },
				{ x: 15, y: 13 },
			]);
		});

		it("should handle negative offsets", () => {
			const points = [
				{ x: 10, y: 10 },
				{ x: 20, y: 20 },
			];
			const offset = offsetPolygon(points, -5, -10);
			expect(offset).toEqual([
				{ x: 5, y: 0 },
				{ x: 15, y: 10 },
			]);
		});

		it("should not modify original array", () => {
			const points = [{ x: 0, y: 0 }];
			offsetPolygon(points, 10, 10);
			expect(points[0]).toEqual({ x: 0, y: 0 });
		});

		it("should handle empty array", () => {
			expect(offsetPolygon([], 5, 5)).toEqual([]);
		});
	});

	describe("canClosePolygon", () => {
		it("should return true when cursor is near first point with 3+ points", () => {
			const points = [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
			];
			expect(canClosePolygon(points, 2, 2, 5)).toBe(true);
			expect(canClosePolygon(points, 0, 0, 5)).toBe(true);
		});

		it("should return false when cursor is far from first point", () => {
			const points = [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 },
			];
			expect(canClosePolygon(points, 10, 10, 5)).toBe(false);
			expect(canClosePolygon(points, 100, 100, 5)).toBe(false);
		});

		it("should return false with less than 3 points", () => {
			expect(canClosePolygon([], 0, 0, 5)).toBe(false);
			expect(canClosePolygon([{ x: 0, y: 0 }], 0, 0, 5)).toBe(false);
			expect(
				canClosePolygon(
					[
						{ x: 0, y: 0 },
						{ x: 10, y: 0 },
					],
					0,
					0,
					5,
				),
			).toBe(false);
		});
	});

	describe("migrateColliderToPositionFormat", () => {
		it("should migrate collider with absolute points to position + offsets", () => {
			const oldCollider = {
				id: "test-id",
				name: "Test",
				type: "polygon",
				points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 10 },
					{ x: 20, y: 20 },
					{ x: 10, y: 20 },
				],
				properties: { solid: "true" },
			};

			const migrated = migrateColliderToPositionFormat(oldCollider);

			expect(migrated.position.x).toBe(15);
			expect(migrated.position.y).toBe(15);
			expect(migrated.points).toEqual([
				{ x: -5, y: -5 },
				{ x: 5, y: -5 },
				{ x: 5, y: 5 },
				{ x: -5, y: 5 },
			]);
			expect(migrated.id).toBe("test-id");
			expect(migrated.name).toBe("Test");
			expect(migrated.type).toBe("polygon");
			expect(migrated.properties).toEqual({ solid: "true" });
		});

		it("should return collider as-is if already has non-zero position", () => {
			const alreadyMigrated = {
				id: "test-id",
				name: "Test",
				type: "polygon",
				position: { x: 15, y: 15 },
				points: [
					{ x: -5, y: -5 },
					{ x: 5, y: -5 },
					{ x: 5, y: 5 },
					{ x: -5, y: 5 },
				],
				properties: {},
			};

			const result = migrateColliderToPositionFormat(alreadyMigrated);
			expect(result).toBe(alreadyMigrated);
		});

		it("should migrate collider with zero position", () => {
			const collider = {
				id: "test",
				name: "Test",
				type: "polygon",
				position: { x: 0, y: 0 },
				points: [
					{ x: 10, y: 10 },
					{ x: 20, y: 20 },
				],
				properties: {},
			};

			const migrated = migrateColliderToPositionFormat(collider);
			expect(migrated.position.x).toBe(15);
			expect(migrated.position.y).toBe(15);
		});

		it("should provide default values for missing fields", () => {
			const minimal = {
				points: [
					{ x: 0, y: 0 },
					{ x: 10, y: 0 },
					{ x: 5, y: 10 },
				],
			};

			const migrated = migrateColliderToPositionFormat(minimal);
			expect(migrated.id).toBe("");
			expect(migrated.name).toBe("");
			expect(migrated.type).toBe("");
			expect(migrated.properties).toEqual({});
		});
	});

	describe("getWorldPoints", () => {
		it("should convert offset points to world coordinates", () => {
			const collider = {
				id: "test",
				name: "Test",
				type: "polygon",
				position: { x: 100, y: 50 },
				points: [
					{ x: -5, y: -5 },
					{ x: 5, y: -5 },
					{ x: 5, y: 5 },
					{ x: -5, y: 5 },
				],
				properties: {},
			};

			const worldPoints = getWorldPoints(collider);
			expect(worldPoints).toEqual([
				{ x: 95, y: 45 },
				{ x: 105, y: 45 },
				{ x: 105, y: 55 },
				{ x: 95, y: 55 },
			]);
		});

		it("should handle zero position", () => {
			const collider = {
				id: "test",
				name: "Test",
				type: "polygon",
				position: { x: 0, y: 0 },
				points: [
					{ x: 10, y: 20 },
					{ x: 30, y: 40 },
				],
				properties: {},
			};

			const worldPoints = getWorldPoints(collider);
			expect(worldPoints).toEqual([
				{ x: 10, y: 20 },
				{ x: 30, y: 40 },
			]);
		});

		it("should handle negative offsets and positions", () => {
			const collider = {
				id: "test",
				name: "Test",
				type: "polygon",
				position: { x: -10, y: -20 },
				points: [
					{ x: -5, y: -5 },
					{ x: 5, y: 5 },
				],
				properties: {},
			};

			const worldPoints = getWorldPoints(collider);
			expect(worldPoints).toEqual([
				{ x: -15, y: -25 },
				{ x: -5, y: -15 },
			]);
		});

		it("should not modify original points", () => {
			const collider = {
				id: "test",
				name: "Test",
				type: "polygon",
				position: { x: 100, y: 100 },
				points: [{ x: 0, y: 0 }],
				properties: {},
			};

			getWorldPoints(collider);
			expect(collider.points[0]).toEqual({ x: 0, y: 0 });
		});
	});
});
