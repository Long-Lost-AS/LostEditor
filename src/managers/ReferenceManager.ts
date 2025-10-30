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
   * Validate all file references in the project and return broken references
   */
  async validateReferences(projectDir: string): Promise<BrokenReference[]> {
    const brokenReferences: BrokenReference[] = []
    const { exists } = await import('@tauri-apps/plugin-fs')

    // Find the project file
    const projectFile = await this.findProjectFile(projectDir)
    if (!projectFile) {
      console.warn('No project file found')
      return brokenReferences
    }

    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const content = await readTextFile(projectFile)
      const projectData = JSON.parse(content)

      // Check tilesets referenced in project
      if (projectData.tilesets) {
        for (const tilesetPath of projectData.tilesets) {
          const absolutePath = fileManager.isAbsolute(tilesetPath)
            ? tilesetPath
            : fileManager.join(fileManager.dirname(projectFile), tilesetPath)

          const fileExists = await exists(absolutePath)
          if (!fileExists) {
            brokenReferences.push({
              referencingFile: projectFile,
              referenceType: 'project-tileset',
              expectedPath: absolutePath,
              relativePath: tilesetPath
            })
          }
        }
      }

      // Check maps referenced in project
      if (projectData.maps) {
        for (const mapPath of projectData.maps) {
          const absolutePath = fileManager.isAbsolute(mapPath)
            ? mapPath
            : fileManager.join(fileManager.dirname(projectFile), mapPath)

          const fileExists = await exists(absolutePath)
          if (!fileExists) {
            brokenReferences.push({
              referencingFile: projectFile,
              referenceType: 'project-map',
              expectedPath: absolutePath,
              relativePath: mapPath
            })
          }
        }
      }

      // Check images referenced in tilesets
      const tilesetFiles = await this.searchForFiles(projectDir, '.lostset')
      for (const tilesetFile of tilesetFiles) {
        try {
          const tilesetContent = await readTextFile(tilesetFile)
          const tilesetData = JSON.parse(tilesetContent)

          if (tilesetData.imagePath) {
            // Resolve image paths relative to project directory (all paths are relative to assets root)
            const absolutePath = fileManager.isAbsolute(tilesetData.imagePath)
              ? tilesetData.imagePath
              : fileManager.join(projectDir, tilesetData.imagePath)

            const fileExists = await exists(absolutePath)
            if (!fileExists) {
              brokenReferences.push({
                referencingFile: tilesetFile,
                referenceType: 'tileset-image',
                expectedPath: absolutePath,
                relativePath: tilesetData.imagePath
              })
            }
          }
        } catch (error) {
          console.error(`Error validating tileset ${tilesetFile}:`, error)
        }
      }
    } catch (error) {
      console.error('Error validating references:', error)
    }

    return brokenReferences
  }

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
   * Update all references when a file or directory is moved or renamed
   */
  async updateReferences(
    oldPath: string,
    newPath: string,
    projectDir: string
  ): Promise<void> {
    // Check if the new path is a directory
    const { stat } = await import('@tauri-apps/plugin-fs')
    let isDirectory = false
    try {
      const stats = await stat(newPath)
      isDirectory = stats.isDirectory
    } catch (error) {
      // If stat fails, assume it's a file
      console.warn(`Could not stat ${newPath}, assuming it's a file`)
    }

    if (isDirectory) {
      // Handle directory move: update references for all files within
      console.log(`Detected directory move: ${oldPath} -> ${newPath}`)
      await this.updateDirectoryReferences(oldPath, newPath, projectDir)
    } else {
      // Handle single file move
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
  }

  /**
   * Update references for all files within a moved directory
   */
  private async updateDirectoryReferences(
    oldDirPath: string,
    newDirPath: string,
    projectDir: string
  ): Promise<void> {
    // Find all project-relevant files in the new directory
    const { readDir } = await import('@tauri-apps/plugin-fs')
    const relevantExtensions = ['.lostproj', '.lostset', '.lostmap', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']

    const findFilesRecursively = async (dir: string): Promise<string[]> => {
      const results: string[] = []
      try {
        const entries = await readDir(dir)
        for (const entry of entries) {
          const fullPath = fileManager.join(dir, entry.name)
          if (entry.isDirectory) {
            const subResults = await findFilesRecursively(fullPath)
            results.push(...subResults)
          } else {
            const ext = fileManager.extname(entry.name).toLowerCase()
            if (relevantExtensions.includes(ext)) {
              results.push(fullPath)
            }
          }
        }
      } catch (error) {
        console.error(`Error reading directory ${dir}:`, error)
      }
      return results
    }

    const filesInNewDir = await findFilesRecursively(newDirPath)

    console.log(`Found ${filesInNewDir.length} relevant files in moved directory`)

    // For each file, calculate its old path and update references
    for (const newFilePath of filesInNewDir) {
      // Calculate the relative path within the directory
      const relativePath = newFilePath.substring(newDirPath.length)
      const oldFilePath = oldDirPath + relativePath

      // Update references for this file
      const references = await this.findReferences(oldFilePath, projectDir)

      if (references.size > 0) {
        console.log(`Updating ${references.size} reference(s) to ${oldFilePath}`)
        for (const [refFilePath, refTypes] of references.entries()) {
          try {
            await this.updateReferencingFile(refFilePath, oldFilePath, newFilePath, refTypes, projectDir)
          } catch (error) {
            console.error(`Failed to update references in ${refFilePath}:`, error)
          }
        }
      }
    }
  }

  /**
   * Update cache keys in managers when files or directories are moved
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

    // If it's a directory, update caches for all files that start with oldPath
    // This handles the case where a folder containing tilesets/maps/images was moved
    this.updateManagerCachesForDirectory(normalizedOld, normalizedNew)
  }

  /**
   * Update manager caches for all files within a moved directory
   */
  private updateManagerCachesForDirectory(oldDirPath: string, newDirPath: string): void {
    // Update all tilesets whose paths start with oldDirPath
    const allTilesets = tilesetManager.getAllTilesets()
    for (const tileset of allTilesets) {
      if (tileset.filePath && tileset.filePath.startsWith(oldDirPath)) {
        const relativePath = tileset.filePath.substring(oldDirPath.length)
        const newTilesetPath = newDirPath + relativePath
        tilesetManager.updateTilesetPath(tileset.filePath, newTilesetPath)
        console.log(`Updated tileset cache: ${tileset.filePath} -> ${newTilesetPath}`)
      }
    }

    // Update all maps whose paths start with oldDirPath
    const allMaps = mapManager.getAllMaps()
    for (const map of allMaps) {
      if (map.filePath && map.filePath.startsWith(oldDirPath)) {
        const relativePath = map.filePath.substring(oldDirPath.length)
        const newMapPath = newDirPath + relativePath
        mapManager.updateMapPath(map.filePath, newMapPath)
        console.log(`Updated map cache: ${map.filePath} -> ${newMapPath}`)
      }
    }

    // Update image paths in tilesets if their images were inside the moved directory
    for (const tileset of allTilesets) {
      if (tileset.imagePath && tileset.imagePath.startsWith(oldDirPath)) {
        const relativePath = tileset.imagePath.substring(oldDirPath.length)
        const newImagePath = newDirPath + relativePath
        tilesetManager.updateImagePath(tileset.imagePath, newImagePath)
        console.log(`Updated tileset imagePath: ${tileset.imagePath} -> ${newImagePath}`)
      }
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
          // Resolve image paths relative to project directory (all paths are relative to assets root)
          const absoluteImagePath = fileManager.isAbsolute(tilesetData.imagePath)
            ? tilesetData.imagePath
            : fileManager.join(projectDir, tilesetData.imagePath)

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

export type BrokenReference = {
  referencingFile: string // The file that contains the broken reference
  referenceType: 'project-tileset' | 'project-map' | 'tileset-image'
  expectedPath: string // The absolute path where the file was expected
  relativePath: string // The relative path stored in the referencing file
}

// Export singleton instance
export const referenceManager = new ReferenceManager()
