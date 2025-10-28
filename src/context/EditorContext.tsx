import { createContext, useContext, useState, useRef, useCallback, ReactNode, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { MapData, Layer, Tool, Tile, ProjectData, TilesetData, EntityInstance, LayerType, AnyTab, MapTab, TilesetTab, TabState } from '../types'
import { SettingsManager } from '../settings'
import { tilesetManager } from '../managers/TilesetManager'
import { entityManager } from '../managers/EntityManager'
import { fileManager } from '../managers/FileManager'

interface EditorContextType {
  // Tab state
  tabs: AnyTab[]
  activeTabId: string | null
  openTab: (tab: AnyTab) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabData: (tabId: string, updates: Partial<AnyTab>) => void
  getActiveMapTab: () => MapTab | null
  getActiveTilesetTab: () => TilesetTab | null

  // Map state
  mapData: MapData
  setMapData: (data: MapData | ((prev: MapData) => MapData)) => void

  // Layer state
  currentLayer: Layer | null
  setCurrentLayer: (layer: Layer | null) => void

  // Tool state
  currentTool: Tool
  setCurrentTool: (tool: Tool) => void

  // Selection state (tile or entity)
  selectedTileX: number
  selectedTileY: number
  setSelectedTile: (x: number, y: number) => void
  selectedTilesetId: string | null
  setSelectedTilesetId: (id: string | null) => void
  selectedTileId: string | null
  setSelectedTileId: (id: string | null) => void
  selectedEntityDefId: string | null
  setSelectedEntityDefId: (id: string | null) => void

  // Multi-Tileset state
  tilesets: TilesetData[]
  currentTileset: TilesetData | null
  setCurrentTileset: (tileset: TilesetData | null) => void
  loadTileset: (filePath: string) => Promise<void>
  addTileset: (tileset: TilesetData) => void
  updateTileset: (tilesetId: string, updates: Partial<TilesetData>) => void
  unloadTileset: (tilesetId: string) => void
  getTilesetById: (id: string) => TilesetData | undefined

  // Legacy tileset state (for backward compatibility)
  tilesetImage: HTMLImageElement | null
  setTilesetImage: (img: HTMLImageElement | null) => void
  tilesetCols: number
  setTilesetCols: (cols: number) => void
  tilesetRows: number
  setTilesetRows: (rows: number) => void

  // View state
  zoom: number
  setZoom: (zoom: number) => void
  panX: number
  panY: number
  setPan: (x: number, y: number) => void

  // Project state
  currentProjectPath: string | null
  setCurrentProjectPath: (path: string | null) => void
  projectModified: boolean
  setProjectModified: (modified: boolean) => void
  projectName: string
  setProjectName: (name: string) => void
  tilesetPath: string | null
  setTilesetPath: (path: string | null) => void

  // Settings
  settingsManager: SettingsManager
  gridVisible: boolean
  setGridVisible: (visible: boolean) => void

  // Layer Actions
  addLayer: (layerType: LayerType) => void
  removeLayer: (layerId: string) => void
  updateLayerVisibility: (layerId: string, visible: boolean) => void
  updateLayerName: (layerId: string, name: string) => void

  // Tile Actions
  placeTile: (x: number, y: number) => void
  eraseTile: (x: number, y: number) => void

  // Entity Actions
  placeEntity: (x: number, y: number) => void
  removeEntity: (entityId: string) => void

  // Legacy tileset loading
  loadTilesetFromFile: (file: File) => Promise<void>
  loadTilesetFromDataURL: (dataURL: string) => Promise<void>

  // Project Actions
  saveProject: () => Promise<void>
  saveProjectAs: (filePath: string) => Promise<void>
  loadProject: (filePath: string) => Promise<void>
  newProject: () => void
}

const EditorContext = createContext<EditorContextType | undefined>(undefined)

export const useEditor = () => {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider')
  }
  return context
}

interface EditorProviderProps {
  children: ReactNode
}

export const EditorProvider = ({ children }: EditorProviderProps) => {
  const settingsManagerRef = useRef(new SettingsManager())
  const settingsManager = settingsManagerRef.current

  // Tab state
  const [tabs, setTabs] = useState<AnyTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // Create initial default map tab
  useEffect(() => {
    if (tabs.length === 0) {
      const defaultMapTab: MapTab = {
        id: 'default-map',
        type: 'map',
        title: 'Untitled Map',
        isDirty: false,
        mapData: {
          width: 32,
          height: 32,
          tileWidth: 16,
          tileHeight: 16,
          layers: []
        },
        viewState: {
          zoom: 2,
          panX: 0,
          panY: 0,
          currentLayerId: null,
          gridVisible: true,
          selectedTilesetId: null,
          selectedTileId: null,
          selectedEntityDefId: null,
          currentTool: 'pencil'
        }
      }
      setTabs([defaultMapTab])
      setActiveTabId(defaultMapTab.id)
    }
  }, [])

  const [mapData, setMapData] = useState<MapData>({
    width: 32,
    height: 32,
    tileWidth: 16,
    tileHeight: 16,
    layers: []
  })

  const [currentLayer, setCurrentLayer] = useState<Layer | null>(null)
  const [currentTool, setCurrentTool] = useState<Tool>('pencil')

  // Selection state
  const [selectedTileX, setSelectedTileX] = useState(0)
  const [selectedTileY, setSelectedTileY] = useState(0)
  const [selectedTilesetId, setSelectedTilesetId] = useState<string | null>(null)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [selectedEntityDefId, setSelectedEntityDefId] = useState<string | null>(null)

  // Multi-tileset state
  const [tilesets, setTilesets] = useState<TilesetData[]>([])
  const [currentTileset, setCurrentTileset] = useState<TilesetData | null>(null)

  // Legacy tileset state (backward compatibility)
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null)
  const [tilesetCols, setTilesetCols] = useState(0)
  const [tilesetRows, setTilesetRows] = useState(0)

  const [zoom, setZoom] = useState(2)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null)
  const [projectModified, setProjectModified] = useState(false)
  const [projectName, setProjectName] = useState('Untitled')
  const [tilesetPath, setTilesetPath] = useState<string | null>(null)
  const [gridVisible, setGridVisible] = useState(true)

  // Sync active map tab to flat state (for backward compatibility)
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab && activeTab.type === 'map') {
      const mapTab = activeTab as MapTab
      setMapData(mapTab.mapData)
      setZoom(mapTab.viewState.zoom)
      setPanX(mapTab.viewState.panX)
      setPanY(mapTab.viewState.panY)
      setGridVisible(mapTab.viewState.gridVisible)
      setCurrentTool(mapTab.viewState.currentTool)
      setSelectedTilesetId(mapTab.viewState.selectedTilesetId)
      setSelectedTileId(mapTab.viewState.selectedTileId)
      setSelectedEntityDefId(mapTab.viewState.selectedEntityDefId)

      // Set current layer
      const layer = mapTab.mapData.layers.find(l => l.id === mapTab.viewState.currentLayerId)
      setCurrentLayer(layer || mapTab.mapData.layers[0] || null)
    }
  }, [activeTabId, tabs])

  // Create a wrapped setMapData that also updates the active tab
  const setMapDataAndSyncTab = useCallback((data: MapData | ((prev: MapData) => MapData)) => {
    setMapData(prev => {
      const newData = typeof data === 'function' ? data(prev) : data

      // Update active map tab
      if (activeTabId) {
        setTabs(currentTabs => currentTabs.map(tab => {
          if (tab.id === activeTabId && tab.type === 'map') {
            return {
              ...tab,
              mapData: newData,
              isDirty: true
            } as MapTab
          }
          return tab
        }))
      }

      return newData
    })
  }, [activeTabId])

  const setSelectedTile = useCallback((x: number, y: number) => {
    setSelectedTileX(x)
    setSelectedTileY(y)
  }, [])

  const setPan = useCallback((x: number, y: number) => {
    setPanX(x)
    setPanY(y)
  }, [])

  const addLayer = useCallback((layerType: LayerType = 'tile') => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `Layer ${mapData.layers.length + 1}`,
      visible: true,
      type: layerType,
      tiles: new Map(),
      entities: []
    }
    setMapData(prev => ({
      ...prev,
      layers: [...prev.layers, newLayer]
    }))
    setCurrentLayer(newLayer)
    setProjectModified(true)
  }, [mapData.layers.length])

  const removeLayer = useCallback((layerId: string) => {
    setMapData(prev => ({
      ...prev,
      layers: prev.layers.filter(l => l.id !== layerId)
    }))
    if (currentLayer?.id === layerId) {
      setCurrentLayer(mapData.layers[0] || null)
    }
    setProjectModified(true)
  }, [currentLayer, mapData.layers])

  const updateLayerVisibility = useCallback((layerId: string, visible: boolean) => {
    setMapData(prev => ({
      ...prev,
      layers: prev.layers.map(l =>
        l.id === layerId ? { ...l, visible } : l
      )
    }))
  }, [])

  const updateLayerName = useCallback((layerId: string, name: string) => {
    setMapData(prev => ({
      ...prev,
      layers: prev.layers.map(l =>
        l.id === layerId ? { ...l, name } : l
      )
    }))
    setProjectModified(true)
  }, [])

  const placeTile = useCallback((x: number, y: number) => {
    if (!currentLayer || currentLayer.type !== 'tile') return

    // Use new tileset/tile ID system if available, otherwise fall back to legacy
    const tile: Tile = selectedTilesetId && selectedTileId
      ? {
          x,
          y,
          tilesetId: selectedTilesetId,
          tileId: selectedTileId
        }
      : {
          x,
          y,
          tilesetId: 'legacy',
          tileId: `${selectedTileX},${selectedTileY}`,
          tilesetX: selectedTileX,
          tilesetY: selectedTileY
        }

    // Update state immutably
    setMapData(prev => ({
      ...prev,
      layers: prev.layers.map(layer => {
        if (layer.id === currentLayer.id) {
          const newTiles = new Map(layer.tiles)
          newTiles.set(`${x},${y}`, tile)
          const updatedLayer = { ...layer, tiles: newTiles }
          setCurrentLayer(updatedLayer)
          return updatedLayer
        }
        return layer
      })
    }))
    setProjectModified(true)
  }, [currentLayer, selectedTileX, selectedTileY, selectedTilesetId, selectedTileId])

  const eraseTile = useCallback((x: number, y: number) => {
    if (!currentLayer || currentLayer.type !== 'tile') return

    // Update state immutably
    setMapData(prev => ({
      ...prev,
      layers: prev.layers.map(layer => {
        if (layer.id === currentLayer.id) {
          const newTiles = new Map(layer.tiles)
          newTiles.delete(`${x},${y}`)
          const updatedLayer = { ...layer, tiles: newTiles }
          setCurrentLayer(updatedLayer)
          return updatedLayer
        }
        return layer
      })
    }))
    setProjectModified(true)
  }, [currentLayer])

  // Entity management functions
  const placeEntity = useCallback((x: number, y: number) => {
    if (!currentLayer || currentLayer.type !== 'entity') return
    if (!selectedTilesetId || !selectedEntityDefId) return

    const entityInstance = entityManager.createInstance(
      selectedTilesetId,
      selectedEntityDefId,
      x,
      y
    )

    if (!entityInstance) return

    setMapData(prev => ({
      ...prev,
      layers: prev.layers.map(layer => {
        if (layer.id === currentLayer.id) {
          const updatedLayer = {
            ...layer,
            entities: [...layer.entities, entityInstance]
          }
          setCurrentLayer(updatedLayer)
          return updatedLayer
        }
        return layer
      })
    }))
    setProjectModified(true)
  }, [currentLayer, selectedTilesetId, selectedEntityDefId])

  const removeEntity = useCallback((entityId: string) => {
    if (!currentLayer || currentLayer.type !== 'entity') return

    setMapData(prev => ({
      ...prev,
      layers: prev.layers.map(layer => {
        if (layer.id === currentLayer.id) {
          const updatedLayer = {
            ...layer,
            entities: layer.entities.filter(e => e.id !== entityId)
          }
          setCurrentLayer(updatedLayer)
          return updatedLayer
        }
        return layer
      })
    }))
    setProjectModified(true)
  }, [currentLayer])

  // Tab management functions
  const openTab = useCallback((tab: AnyTab) => {
    setTabs(prev => {
      // Check if tab already exists
      const existingTabIndex = prev.findIndex(t => t.id === tab.id)
      if (existingTabIndex !== -1) {
        // Tab already exists, just activate it
        setActiveTabId(tab.id)
        return prev
      }
      // Add new tab
      return [...prev, tab]
    })
    setActiveTabId(tab.id)
  }, [])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId)

      // If closing active tab, switch to another tab
      if (tabId === activeTabId) {
        const closingIndex = prev.findIndex(t => t.id === tabId)
        if (newTabs.length > 0) {
          // Try to activate the next tab, or the previous one if this was the last tab
          const newActiveTab = newTabs[closingIndex] || newTabs[closingIndex - 1]
          setActiveTabId(newActiveTab.id)
        } else {
          setActiveTabId(null)
        }
      }

      return newTabs
    })
  }, [activeTabId])

  const updateTabData = useCallback((tabId: string, updates: Partial<AnyTab>) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id === tabId) {
        return { ...tab, ...updates } as AnyTab
      }
      return tab
    }))
  }, [])

  const getActiveMapTab = useCallback((): MapTab | null => {
    if (!activeTabId) return null
    const tab = tabs.find(t => t.id === activeTabId)
    if (tab && tab.type === 'map') {
      return tab as MapTab
    }
    return null
  }, [activeTabId, tabs])

  const getActiveTilesetTab = useCallback((): TilesetTab | null => {
    if (!activeTabId) return null
    const tab = tabs.find(t => t.id === activeTabId)
    if (tab && tab.type === 'tileset') {
      return tab as TilesetTab
    }
    return null
  }, [activeTabId, tabs])

  // Multi-tileset management functions
  const loadTileset = useCallback(async (filePath: string) => {
    try {
      const tileset = await tilesetManager.loadTileset(filePath)
      setTilesets(prev => {
        // Check if already loaded
        if (prev.find(t => t.id === tileset.id)) {
          return prev
        }
        return [...prev, tileset]
      })
      setCurrentTileset(tileset)
      setProjectModified(true)
    } catch (error) {
      console.error('Failed to load tileset:', error)
      alert(`Failed to load tileset: ${error}`)
    }
  }, [])

  const addTileset = useCallback((tileset: TilesetData) => {
    setTilesets(prev => {
      // Check if already exists
      if (prev.find(t => t.id === tileset.id)) {
        return prev
      }
      return [...prev, tileset]
    })
    setCurrentTileset(tileset)
    setProjectModified(true)
  }, [])

  const updateTileset = useCallback((tilesetId: string, updates: Partial<TilesetData>) => {
    setTilesets(prev => prev.map(t =>
      t.id === tilesetId ? { ...t, ...updates } : t
    ))
    setProjectModified(true)
  }, [])

  const unloadTileset = useCallback((tilesetId: string) => {
    tilesetManager.unloadTileset(tilesetId)
    setTilesets(prev => prev.filter(t => t.id !== tilesetId))
    if (currentTileset?.id === tilesetId) {
      setCurrentTileset(null)
    }
    setProjectModified(true)
  }, [currentTileset])

  const getTilesetById = useCallback((id: string) => {
    return tilesets.find(t => t.id === id)
  }, [tilesets])

  const loadTilesetFromFile = useCallback(async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          setTilesetImage(img)
          setTilesetCols(Math.floor(img.width / mapData.tileWidth))
          setTilesetRows(Math.floor(img.height / mapData.tileHeight))
          setTilesetPath(file.name)
          resolve()
        }
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }, [mapData.tileWidth, mapData.tileHeight])

  const loadTilesetFromDataURL = useCallback(async (dataURL: string) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        setTilesetImage(img)
        setTilesetCols(Math.floor(img.width / mapData.tileWidth))
        setTilesetRows(Math.floor(img.height / mapData.tileHeight))
        resolve()
      }
      img.onerror = () => reject(new Error('Failed to load tileset'))
      img.src = dataURL
    })
  }, [mapData.tileWidth, mapData.tileHeight])

  const getTilesetAsDataURL = useCallback((): string | undefined => {
    if (!tilesetImage) return undefined
    const canvas = document.createElement('canvas')
    canvas.width = tilesetImage.width
    canvas.height = tilesetImage.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(tilesetImage, 0, 0)
    return canvas.toDataURL('image/png')
  }, [tilesetImage])

  const saveProjectAs = useCallback(async (filePath: string) => {
    // Set project directory for relative paths
    const projectDir = fileManager.dirname(filePath)
    fileManager.setProjectDir(projectDir)

    // Save any unsaved tilesets first
    const tilesetPaths: string[] = []
    for (const tileset of tilesets) {
      if (!tileset.filePath) {
        // Tileset hasn't been saved yet, save it to a .lostset file
        const tilesetFileName = `${tileset.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.lostset`
        const tilesetFilePath = fileManager.join(projectDir, tilesetFileName)

        // Make imagePath relative to the tileset file location (which is in projectDir)
        const relativeImagePath = fileManager.makeRelativeTo(projectDir, tileset.imagePath)

        const tilesetJson = JSON.stringify({
          version: tileset.version,
          name: tileset.name,
          id: tileset.id,
          imagePath: relativeImagePath,
          tileWidth: tileset.tileWidth,
          tileHeight: tileset.tileHeight,
          tiles: tileset.tiles,
          entities: tileset.entities
        }, null, 2)

        try {
          await writeTextFile(tilesetFilePath, tilesetJson)
        } catch (error) {
          alert(`Failed to save tileset ${tileset.name}: ${error}`)
          return
        }

        // Update the tileset with its file path
        tileset.filePath = tilesetFilePath
        tilesetPaths.push(tilesetFilePath)
      } else {
        tilesetPaths.push(tileset.filePath)
      }
    }

    // Make all tileset paths relative to project directory
    const relativeTilesetPaths = tilesetPaths.map(path => fileManager.makeRelative(path))

    const projectData: ProjectData = {
      version: '2.0',
      name: projectName,
      tilesets: relativeTilesetPaths,
      projectDir,
      mapData: {
        width: mapData.width,
        height: mapData.height,
        tileWidth: mapData.tileWidth,
        tileHeight: mapData.tileHeight,
        layers: mapData.layers.map(layer => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          type: layer.type,
          tiles: Array.from(layer.tiles.values()),
          entities: layer.entities
        }))
      },
      lastModified: new Date().toISOString(),
      openTabs: {
        tabs: tabs.map(tab => {
          if (tab.type === 'map') {
            // Convert Map objects to arrays for JSON serialization
            return {
              ...tab,
              mapData: {
                ...tab.mapData,
                layers: tab.mapData.layers.map(layer => ({
                  ...layer,
                  tiles: Array.from(layer.tiles.values())
                }))
              }
            }
          }
          return tab
        }),
        activeTabId
      },
      // Legacy support
      tilesetPath: tilesetPath || undefined,
      tilesetImageData: getTilesetAsDataURL()
    }

    const json = JSON.stringify(projectData, null, 2)

    try {
      await writeTextFile(filePath, json)
      setCurrentProjectPath(filePath)
      setProjectName(fileManager.basename(filePath, '.lostproj'))
      setProjectModified(false)

      settingsManager.addRecentFile(filePath)
      settingsManager.setLastOpenedProject(filePath)
      await settingsManager.save()
    } catch (error) {
      alert(`Failed to save project: ${error}`)
    }
  }, [projectName, tilesetPath, mapData, tilesets, getTilesetAsDataURL, settingsManager, tabs, activeTabId])

  const saveProject = useCallback(async () => {
    if (!currentProjectPath) {
      const result = await invoke<{ canceled: boolean; filePath?: string }>('show_save_dialog', {
        options: {
          title: 'Save Project',
          defaultPath: 'untitled.lostproj',
          filters: [{ name: 'Lost Editor Project', extensions: ['lostproj'] }]
        }
      })

      if (result.filePath) {
        await saveProjectAs(result.filePath)
      }
    } else {
      await saveProjectAs(currentProjectPath)
    }
  }, [currentProjectPath, saveProjectAs])

  const loadProject = useCallback(async (filePath: string) => {
    let data: string
    try {
      data = await readTextFile(filePath)
    } catch (error) {
      alert(`Failed to load project: ${error}`)
      settingsManager.removeRecentFile(filePath)
      await settingsManager.save()
      return
    }

    try {
      const projectData: ProjectData = JSON.parse(data)

      console.log('Loading project data:', projectData)

      // Set project directory for relative path resolution
      const projectDir = fileManager.dirname(filePath)
      fileManager.setProjectDir(projectDir)

      // Create layers array with proper type support
      const loadedLayers = projectData.mapData.layers.map(layerData => ({
        id: layerData.id,
        name: layerData.name,
        visible: layerData.visible,
        type: (layerData.type || 'tile') as LayerType,
        tiles: new Map(layerData.tiles.map((tile: Tile) => [`${tile.x},${tile.y}`, tile])),
        entities: layerData.entities || []
      }))

      console.log('Loaded layers:', loadedLayers)

      // Load map data first
      setMapData({
        width: projectData.mapData.width,
        height: projectData.mapData.height,
        tileWidth: projectData.mapData.tileWidth,
        tileHeight: projectData.mapData.tileHeight,
        layers: loadedLayers
      })

      // Set current layer to the first layer
      if (loadedLayers.length > 0) {
        setCurrentLayer(loadedLayers[0])
      } else {
        setCurrentLayer(null)
      }

      // Load tilesets (new multi-tileset format)
      if (projectData.tilesets && projectData.tilesets.length > 0) {
        console.log('Loading tilesets:', projectData.tilesets)
        for (const tilesetPath of projectData.tilesets) {
          try {
            await loadTileset(tilesetPath)
          } catch (error) {
            console.error(`Failed to load tileset ${tilesetPath}:`, error)
          }
        }
      }

      // Legacy tileset support
      if (projectData.tilesetImageData) {
        console.log('Loading legacy tileset from data URL')
        await loadTilesetFromDataURL(projectData.tilesetImageData)
      }

      setTilesetPath(projectData.tilesetPath || null)
      setCurrentProjectPath(filePath)
      setProjectName(projectData.name || fileManager.basename(filePath, '.lostproj'))
      setProjectModified(false)

      settingsManager.addRecentFile(filePath)
      settingsManager.setLastOpenedProject(filePath)
      await settingsManager.save()

      // Restore open tabs
      if (projectData.openTabs) {
        // Restore tabs and validate tileset tabs reference valid tilesets
        const restoredTabs = (projectData.openTabs.tabs || [])
          .filter(tab => {
            if (tab.type === 'tileset') {
              const tilesetTab = tab as TilesetTab
              const tilesetExists = tilesetManager.getTilesetById(tilesetTab.tilesetId)
              if (!tilesetExists) {
                console.warn(`Skipping tileset tab: tileset ${tilesetTab.tilesetId} not found`)
                return false
              }
            }
            return true
          })
          .map(tab => {
            if (tab.type === 'map') {
              // Convert tile arrays back to Maps for MapTab
              return {
                ...tab,
                mapData: {
                  ...tab.mapData,
                  layers: tab.mapData.layers.map(layer => ({
                    ...layer,
                    tiles: new Map(layer.tiles.map(tile => [`${tile.x},${tile.y}`, tile]))
                  }))
                }
              }
            }
            return tab
          }) as AnyTab[]

        setTabs(restoredTabs)

        // Make sure the active tab is still in the restored tabs
        const activeTabStillExists = restoredTabs.some(t => t.id === projectData.openTabs!.activeTabId)
        if (activeTabStillExists) {
          setActiveTabId(projectData.openTabs.activeTabId || null)
        } else if (restoredTabs.length > 0) {
          setActiveTabId(restoredTabs[0].id)
        } else {
          setActiveTabId(null)
        }

        console.log('Restored tabs:', restoredTabs)
      } else {
        // No saved tabs, reset to default
        setTabs([])
        setActiveTabId(null)
      }

      console.log('Project loaded successfully')
    } catch (error: any) {
      console.error('Failed to load project:', error)
      alert(`Failed to parse project file: ${error.message}`)
    }
  }, [loadTilesetFromDataURL, loadTileset, settingsManager])

  const newProject = useCallback(() => {
    setMapData({
      width: 32,
      height: 32,
      tileWidth: 16,
      tileHeight: 16,
      layers: []
    })
    setCurrentLayer(null)
    setTilesetImage(null)
    setTilesetPath(null)
    setCurrentProjectPath(null)
    setProjectName('Untitled')
    setProjectModified(false)
  }, [])

  // Initialize with settings
  useEffect(() => {
    const loadSettings = async () => {
      await settingsManager.load()
      const settings = settingsManager.getSettings()
      setMapData(prev => ({
        ...prev,
        width: settings.defaultMapWidth,
        height: settings.defaultMapHeight,
        tileWidth: settings.defaultTileWidth,
        tileHeight: settings.defaultTileHeight
      }))
      setGridVisible(settings.gridVisible)
    }
    loadSettings()
  }, [settingsManager])

  const value: EditorContextType = {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTab: setActiveTabId,
    updateTabData,
    getActiveMapTab,
    getActiveTilesetTab,
    mapData,
    setMapData: setMapDataAndSyncTab,
    currentLayer,
    setCurrentLayer,
    currentTool,
    setCurrentTool,
    selectedTileX,
    selectedTileY,
    setSelectedTile,
    selectedTilesetId,
    setSelectedTilesetId,
    selectedTileId,
    setSelectedTileId,
    selectedEntityDefId,
    setSelectedEntityDefId,
    tilesets,
    currentTileset,
    setCurrentTileset,
    loadTileset,
    addTileset,
    updateTileset,
    unloadTileset,
    getTilesetById,
    tilesetImage,
    setTilesetImage,
    tilesetCols,
    setTilesetCols,
    tilesetRows,
    setTilesetRows,
    zoom,
    setZoom,
    panX,
    panY,
    setPan,
    currentProjectPath,
    setCurrentProjectPath,
    projectModified,
    setProjectModified,
    projectName,
    setProjectName,
    tilesetPath,
    setTilesetPath,
    settingsManager,
    gridVisible,
    setGridVisible,
    addLayer,
    removeLayer,
    updateLayerVisibility,
    updateLayerName,
    placeTile,
    eraseTile,
    placeEntity,
    removeEntity,
    loadTilesetFromFile,
    loadTilesetFromDataURL,
    saveProject,
    saveProjectAs,
    loadProject,
    newProject
  }

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  )
}
