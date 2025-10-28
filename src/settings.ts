import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { appDataDir } from '@tauri-apps/api/path'

export interface EditorSettings {
  gridVisible: boolean
  defaultMapWidth: number
  defaultMapHeight: number
  defaultTileWidth: number
  defaultTileHeight: number
  autoSaveInterval: number // in minutes, 0 = disabled
  recentFilesLimit: number
  recentFiles: string[]
  lastOpenedProject: string | null
}

export const defaultSettings: EditorSettings = {
  gridVisible: true,
  defaultMapWidth: 32,
  defaultMapHeight: 32,
  defaultTileWidth: 16,
  defaultTileHeight: 16,
  autoSaveInterval: 5,
  recentFilesLimit: 10,
  recentFiles: [],
  lastOpenedProject: null
}

export class SettingsManager {
  private settings: EditorSettings

  constructor() {
    this.settings = { ...defaultSettings }
  }

  getSettings(): EditorSettings {
    return { ...this.settings }
  }

  updateSettings(updates: Partial<EditorSettings>): void {
    this.settings = { ...this.settings, ...updates }
  }

  addRecentFile(filePath: string): void {
    // Remove if already exists
    this.settings.recentFiles = this.settings.recentFiles.filter(f => f !== filePath)

    // Add to front
    this.settings.recentFiles.unshift(filePath)

    // Limit to max
    this.settings.recentFiles = this.settings.recentFiles.slice(0, this.settings.recentFilesLimit)
  }

  removeRecentFile(filePath: string): void {
    this.settings.recentFiles = this.settings.recentFiles.filter(f => f !== filePath)
  }

  setLastOpenedProject(filePath: string | null): void {
    this.settings.lastOpenedProject = filePath
  }

  toJSON(): string {
    return JSON.stringify(this.settings, null, 2)
  }

  fromJSON(json: string): void {
    try {
      const parsed = JSON.parse(json)
      this.settings = { ...defaultSettings, ...parsed }
    } catch (e) {
      console.error('Failed to parse settings:', e)
      this.settings = { ...defaultSettings }
    }
  }

  async load(): Promise<void> {
    try {
      const appDir = await appDataDir()
      const settingsPath = `${appDir}/settings.json`
      const data = await readTextFile(settingsPath)
      this.fromJSON(data)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  async save(): Promise<void> {
    try {
      const appDir = await appDataDir()
      const settingsPath = `${appDir}/settings.json`
      const json = this.toJSON()
      await writeTextFile(settingsPath, json)
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }
}
