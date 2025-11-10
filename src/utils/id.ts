/**
 * Generates a unique identifier using crypto.randomUUID()
 * @returns A RFC4122 version 4 UUID string
 */
export function generateId(): string {
	return crypto.randomUUID();
}
