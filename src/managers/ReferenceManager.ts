import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'
import { fileManager } from './FileManager'
import { tilesetManager } from './TilesetManager'
import { mapManager } from './MapManager'
import { TilesetDataSchema, ProjectDataSchema } from '../schemas'
import type { ProjectData, TilesetData } from '../types'

/**
 * ReferenceManager tracks file references and updates them when files are moved/renamed
 */
export class ReferenceManager {
  /**
   * Find all files that reference the given file path
   * Returns a map of referencing file paths to the type of reference
   */
  async findReferences(filePath: string, projectDir: string): Promise<Map<string, ReferenceType[]>> {
    const references = new Map<string, ReferenceType[]>()
    const normalizedPath = fileManager.normalize(filePath)

    // Find the project file
    const projectFile = await this.findProjectFile(projectDir)
    if (!projectFile) {
      console.warn('No project file found')
      return references
    }

    // Check project file for references to tilesets/maps
    await this.scanProjectFile(projectFile, normalizedPath, references)

    // Check tileset files for image references
    await this.scanTilesetFiles(projectDir, normalizedPath, references)

    return references
  }

  /**
   * Update all references when a file is moved or renamed
   */
  async updateReferences(
    oldPath: string,
    newPath: string,
    projectDir: string
  ): Promise<void> {
    const references = await this.findReferences(oldPath, projectDir)

    if (references.size === 0) {
      console.log('No references found to update')
      return
    }

    console.log(`Updating ${references.size} file(s) with references to ${oldPath}`)

    // Update each referencing file
    for (const [refFilePath, refTypes] of references.entries()) {
      try {
        await this.updateReferencingFile(refFilePath, oldPath, newPath, refTypes, projectDir)
      } catch (error) {
        console.error(`Failed to update references in ${refFilePath}:`, error)
      }
    }
  }

  /**
   * Update cache keys in managers when files are moved
   */
  updateManagerCaches(oldPath: string, newPath: string): void {
    const normalizedOld = fileManager.normalize(oldPath)
    const normalizedNew = fileManager.normalize(newPath)

    // Update tileset cache if a tileset was moved
    const tileset = tilesetManager.getTilesetByPath(normalizedOld)
    if (tileset) {
      tilesetManager.updateTilesetPath(normalizedOld, normalizedNew)
    }

    // Update map cache if a map was moved
    const map = mapManager.getMapByPath(normalizedOld)
    if (map) {
      mapManager.updateMapPath(normalizedOld, normalizedNew)
    }

    // Update imagePath in all loaded tilesets if an image was moved
    // Check if the moved file is an image (by extension)
    const ext = fileManager.extname(oldPath).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) {
      tilesetManager.updateImagePath(normalizedOld, normalizedNew)
    }
  }

  private async findProjectFile(projectDir: string): Promise<string | null> {
    try {
      const projectFiles = await this.searchForFiles(projectDir, '.lostproj')
      return projectFiles.length > 0 ? projectFiles[0] : null
    } catch (error) {
      console.error('Error finding project file:', error)
      return null
    }
  }

  private async searchForFiles(dir: string, extension: string): Promise<string[]> {
    // Use Tauri's readDir to find files
    const { readDir } = await import('@tauri-apps/plugin-fs')
    const results: string[] = []

    try {
      const entries = await readDir(dir)

      for (const entry of entries) {
        const fullPath = fileManager.join(dir, entry.name)

        if (entry.isDirectory) {
          // Recursively search subdirectories
          const subResults = await this.searchForFiles(fullPath, extension)
          results.push(...subResults)
        } else if (entry.name.endsWith(extension)) {
          results.push(fullPath)
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error)
    }

    return results
  }

  private async scanProjectFile(
    projectFile: string,
    targetPath: string,
    references: Map<string, ReferenceType[]>
  ): Promise<void> {
    try {
      const content = await readTextFile(projectFile)
      const projectData = JSON.parse(content) as ProjectData
      const projectDir = fileManager.dirname(projectFile)

      const refTypes: ReferenceType[] = []

      // Check if targetPath is in tilesets array
      if (projectData.tilesets) {
        for (const tilesetPath of projectData.tilesets) {
          const absoluteTilesetPath = fileManager.isAbsolute(tilesetPath)
            ? tilesetPath
            : fileManager.join(projectDir, tilesetPath)

          if (fileManager.normalize(absoluteTilesetPath) === fileManager.normalize(targetPath)) {
            refTypes.push({ type: 'project-tileset', value: tilesetPath })
          }
        }
      }

      // Check if targetPath is in maps array
      if (projectData.maps) {
        for (const mapPath of projectData.maps) {
          const absoluteMapPath = fileManager.isAbsolute(mapPath)
            ? mapPath
            : fileManager.join(projectDir, mapPath)

          if (fileManager.normalize(absoluteMapPath) === fileManager.normalize(targetPath)) {
            refTypes.push({ type: 'project-map', value: mapPath })
          }
        }
      }

      if (refTypes.length > 0) {
        references.set(projectFile, refTypes)
      }
    } catch (error) {
      console.error(`Error scanning project file ${projectFile}:`, error)
    }
  }

  private async scanTilesetFiles(
    projectDir: string,
    targetPath: string,
    references: Map<string, ReferenceType[]>
  ): Promise<void> {
    const tilesetFiles = await this.searchForFiles(projectDir, '.lostset')

    for (const tilesetFile of tilesetFiles) {
      try {
        const content = await readTextFile(tilesetFile)
        const tilesetData = JSON.parse(content)

        if (tilesetData.imagePath) {
          const tilesetDir = fileManager.dirname(tilesetFile)
          const absoluteImagePath = fileManager.isAbsolute(tilesetData.imagePath)
            ? tilesetData.imagePath
            : fileManager.join(tilesetDir, tilesetData.imagePath)

          if (fileManager.normalize(absoluteImagePath) === fileManager.normalize(targetPath)) {
            const refTypes: ReferenceType[] = [{
              type: 'tileset-image',
              value: tilesetData.imagePath
            }]
            references.set(tilesetFile, refTypes)
          }
        }
      } catch (error) {
        console.error(`Error scanning tileset file ${tilesetFile}:`, error)
      }
    }
  }

  private async updateReferencingFile(
    refFilePath: string,
    oldPath: string,
    newPath: string,
    refTypes: ReferenceType[],
    projectDir: string
  ): Promise<void> {
    try {
      const content = await readTextFile(refFilePath)
      const data = JSON.parse(content)
      let modified = false

      for (const refType of refTypes) {
        if (refType.type === 'project-tileset') {
          // Update tileset path in project file
          const newRelativePath = fileManager.makeRelativeTo(
            fileManager.dirname(refFilePath),
            newPath
          )
          const index = data.tilesets.indexOf(refType.value)
          if (index !== -1) {
            data.tilesets[index] = newRelativePath
            modified = true
          }
        } else if (refType.type === 'project-map') {
          // Update map path in project file
          const newRelativePath = fileManager.makeRelativeTo(
            fileManager.dirname(refFilePath),
            newPath
          )
          const index = data.maps.indexOf(refType.value)
          if (index !== -1) {
            data.maps[index] = newRelativePath
            modified = true
          }
        } else if (refType.type === 'tileset-image') {
          // Update image path in tileset file
          const newRelativePath = fileManager.makeRelativeTo(
            fileManager.dirname(refFilePath),
            newPath
          )
          data.imagePath = newRelativePath
          modified = true
        }
      }

      // Also update openTabs in project file if present
      if (data.openTabs && data.openTabs.tabs) {
        for (const tab of data.openTabs.tabs) {
          if (tab.filePath && fileManager.normalize(tab.filePath) === fileManager.normalize(oldPath)) {
            tab.filePath = newPath
            modified = true
            console.log(`Updated tab filePath: ${oldPath} -> ${newPath}`)
          }
        }
      }

      if (modified) {
        await writeTextFile(refFilePath, JSON.stringify(data, null, 2))
        console.log(`Updated references in ${refFilePath}`)
      }
    } catch (error) {
      console.error(`Error updating references in ${refFilePath}:`, error)
      throw error
    }
  }
}

export type ReferenceType = {
  type: 'project-tileset' | 'project-map' | 'tileset-image'
  value: string // The original path value in the file
}

// Export singleton instance
export const referenceManager = new ReferenceManager()
