/**
 * FileManager handles file path operations and resolution
 * Browser-compatible implementation without Node.js path module
 */
export class FileManager {
  private projectDir: string | null = null

  /**
   * Set the project directory for resolving relative paths
   */
  setProjectDir(dirPath: string): void {
    this.projectDir = dirPath
  }

  /**
   * Get the current project directory
   */
  getProjectDir(): string | null {
    return this.projectDir
  }

  /**
   * Resolve a relative path to an absolute path using the project directory
   */
  resolvePath(relativePath: string): string {
    if (!this.projectDir) {
      throw new Error('Project directory not set. Cannot resolve relative paths.')
    }

    // If already absolute, return as-is
    if (this.isAbsolute(relativePath)) {
      return relativePath
    }

    return this.join(this.projectDir, relativePath)
  }

  /**
   * Convert an absolute path to a relative path from the project directory
   */
  makeRelative(absolutePath: string): string {
    if (!this.projectDir) {
      throw new Error('Project directory not set. Cannot make path relative.')
    }
    return this.makeRelativeTo(this.projectDir, absolutePath)
  }

  /**
   * Convert an absolute path to a relative path from a specific directory
   */
  makeRelativeTo(fromDir: string, toPath: string): string {
    // Simple relative path calculation
    const fromParts = fromDir.split(/[/\\]/).filter(Boolean)
    const toParts = toPath.split(/[/\\]/).filter(Boolean)

    // Find common base
    let i = 0
    while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
      i++
    }

    // Build relative path
    const upLevels = fromParts.length - i
    const downPath = toParts.slice(i)

    const parts = Array(upLevels).fill('..').concat(downPath)
    return parts.join('/')
  }

  /**
   * Check if a path is absolute
   */
  isAbsolute(filePath: string): boolean {
    // Check for absolute paths (Unix: starts with /, Windows: starts with drive letter)
    return /^([a-zA-Z]:)?[/\\]/.test(filePath)
  }

  /**
   * Get the directory name from a file path
   */
  dirname(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    if (lastSlash === -1) return '.'
    if (lastSlash === 0) return '/'
    return normalized.substring(0, lastSlash)
  }

  /**
   * Get the base name from a file path
   */
  basename(filePath: string, ext?: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const lastSlash = normalized.lastIndexOf('/')
    let base = lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1)

    if (ext && base.endsWith(ext)) {
      base = base.substring(0, base.length - ext.length)
    }

    return base
  }

  /**
   * Join multiple path segments
   */
  join(...segments: string[]): string {
    const parts: string[] = []

    for (const segment of segments) {
      if (!segment) continue
      const normalized = segment.replace(/\\/g, '/')
      parts.push(normalized)
    }

    let joined = parts.join('/')

    // Normalize multiple slashes
    joined = joined.replace(/\/+/g, '/')

    // Remove trailing slash unless it's the root
    if (joined.length > 1 && joined.endsWith('/')) {
      joined = joined.slice(0, -1)
    }

    return joined
  }

  /**
   * Get the file extension
   */
  extname(filePath: string): string {
    const base = this.basename(filePath)
    const lastDot = base.lastIndexOf('.')
    if (lastDot === -1 || lastDot === 0) return ''
    return base.substring(lastDot)
  }

  /**
   * Normalize a path (resolve . and .. segments)
   */
  normalize(filePath: string): string {
    const isAbs = this.isAbsolute(filePath)
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
    const result: string[] = []

    for (const part of parts) {
      if (part === '..') {
        if (result.length > 0 && result[result.length - 1] !== '..') {
          result.pop()
        } else if (!isAbs) {
          result.push('..')
        }
      } else if (part !== '.') {
        result.push(part)
      }
    }

    let normalized = result.join('/')
    if (isAbs && !normalized.startsWith('/')) {
      normalized = '/' + normalized
    }

    return normalized || '.'
  }
}

// Export a singleton instance
export const fileManager = new FileManager()
