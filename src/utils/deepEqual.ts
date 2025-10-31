/**
 * Deep equality comparison for arrays and objects
 * @param a First value
 * @param b Second value
 * @returns true if values are deeply equal
 */
export function deepEqual(a: any, b: any): boolean {
  // Same reference or both null/undefined
  if (a === b) return true

  // One is null/undefined and the other isn't
  if (a == null || b == null) return false

  // Different types
  if (typeof a !== typeof b) return false

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    if (keysA.length !== keysB.length) return false

    return keysA.every(key =>
      keysB.includes(key) && deepEqual(a[key], b[key])
    )
  }

  // Primitive values (already checked with === above)
  return false
}
