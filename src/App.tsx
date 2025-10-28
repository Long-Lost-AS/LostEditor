import { useEffect, useRef, useState } from 'react'
import { EditorProvider, useEditor } from './context/EditorContext'
import { Toolbar } from './components/Toolbar'
import { TabBar } from './components/TabBar'
import { TilesetPanel } from './components/TilesetPanel'
import { MapCanvas } from './components/MapCanvas'
import { LayersPanel } from './components/LayersPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { ResourceBrowser } from './components/ResourceBrowser'
import { EntityPanel } from './components/EntityPanel'
import { TilesetEditorView } from './components/TilesetEditorView'
import { TilesetData } from './types'
import './style.css'

const AppContent = () => {
  const {
    tabs,
    activeTabId,
    closeTab,
    setActiveTab,
    openTab,
    getActiveMapTab,
    getActiveTilesetTab,
    newProject,
    loadProject,
    saveProject,
    saveProjectAs,
    loadTileset,
    addTileset
  } = useEditor()

  const [isAssetBrowserOpen, setIsAssetBrowserOpen] = useState(true)

  // Use refs to store the latest function references
  const newProjectRef = useRef(newProject)
  const loadProjectRef = useRef(loadProject)
  const saveProjectRef = useRef(saveProject)
  const saveProjectAsRef = useRef(saveProjectAs)
  const loadTilesetRef = useRef(loadTileset)
  const openTabRef = useRef(openTab)

  useEffect(() => {
    newProjectRef.current = newProject
    loadProjectRef.current = loadProject
    saveProjectRef.current = saveProject
    saveProjectAsRef.current = saveProjectAs
    loadTilesetRef.current = loadTileset
    openTabRef.current = openTab
  }, [newProject, loadProject, saveProject, saveProjectAs, loadTileset, openTab])

  // Handle creating a new tileset
  const handleNewTileset = async () => {
    if (typeof window.electron === 'undefined') return

    // Show dialog to select image
    const result = await window.electron.showOpenDialog({
      title: 'Select Tileset Image',
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (!result.filePaths || result.filePaths.length === 0) return

    const imagePath = result.filePaths[0]

    // Load the image to get dimensions
    const img = new Image()
    img.src = `local://${imagePath}`

    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })

    // Extract filename without extension for tileset name
    const fileName = imagePath.split('/').pop() || 'Untitled'
    const tilesetName = fileName.replace(/\.[^/.]+$/, '')
    const tilesetId = `tileset-${Date.now()}`

    // Create new tileset data
    const newTilesetData: TilesetData = {
      version: '1.0',
      name: tilesetName,
      id: tilesetId,
      imagePath: imagePath,
      imageData: img,
      tileWidth: 16,
      tileHeight: 16,
      tiles: [],
      entities: []
    }

    // Add tileset to global tilesets array
    addTileset(newTilesetData)

    // Create tileset tab with just the tileset ID reference
    const tilesetTab = {
      id: `tileset-tab-${tilesetId}`,
      type: 'tileset' as const,
      title: tilesetName,
      isDirty: true, // Mark as dirty since it's not saved yet
      tilesetId: tilesetId,
      viewState: {
        scale: 2,
        selectedTileRegion: null
      }
    }

    openTab(tilesetTab)
  }

  useEffect(() => {
    if (typeof window.electron === 'undefined') return

    // New Project
    window.electron.onMenuNewProject(() => {
      newProjectRef.current()
    })

    // Open Project - show dialog then load
    window.electron.onMenuOpenProject(async () => {
      const result = await window.electron.showOpenDialog({
        title: 'Open Project',
        filters: [{ name: 'Lost Editor Project', extensions: ['lostproj'] }],
        properties: ['openFile']
      })

      if (result.filePaths && result.filePaths[0]) {
        await loadProjectRef.current(result.filePaths[0])
      }
    })

    // Load recent project - no dialog, just load
    window.electron.onAutoLoadProject(async (_event, filePath) => {
      if (filePath) {
        await loadProjectRef.current(filePath)
      }
    })

    // Save Project
    window.electron.onMenuSaveProject(async () => {
      await saveProjectRef.current()
    })

    // Save Project As - show dialog then save
    window.electron.onMenuSaveProjectAs(async () => {
      const result = await window.electron.showSaveDialog({
        title: 'Save Project As',
        defaultPath: 'untitled.lostproj',
        filters: [{ name: 'Lost Editor Project', extensions: ['lostproj'] }]
      })

      if (result.filePath) {
        await saveProjectAsRef.current(result.filePath)
      }
    })

    // New Tileset - create and open in tab
    window.electron.onMenuNewTileset(async () => {
      await handleNewTileset()
    })

    // Note: Load Tileset removed - tilesets auto-load from project file
    window.electron.onMenuLoadTileset(async () => {
      // No-op: Tilesets are automatically loaded from project
    })

    // Rebuild menu after listeners are set up
    window.electron.rebuildMenu()
  }, [])

  const activeMapTab = getActiveMapTab()
  const activeTilesetTab = getActiveTilesetTab()

  return (
    <div className="app-container">
      <Toolbar />
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={setActiveTab}
        onTabClose={closeTab}
      />
      <div className="main-container">
        {/* Show map editor view for map tabs or when no tab is active (backward compatibility) */}
        {(activeMapTab || !activeTabId) && (
          <>
            <div className="editor-top-section">
              <div className="left-panel">
                <TilesetPanel />
                <EntityPanel />
                <LayersPanel />
              </div>
              <MapCanvas />
              <div className="right-panel">
                <PropertiesPanel />
              </div>
            </div>
            {isAssetBrowserOpen && (
              <div className="bottom-panel">
                <div className="bottom-panel-header">
                  <h3>Assets</h3>
                  <button
                    onClick={() => setIsAssetBrowserOpen(false)}
                    className="panel-close-btn"
                    title="Close Assets Panel"
                  >
                    ×
                  </button>
                </div>
                <div className="bottom-panel-content">
                  <ResourceBrowser />
                </div>
              </div>
            )}
            {!isAssetBrowserOpen && (
              <div className="bottom-panel-collapsed">
                <button
                  onClick={() => setIsAssetBrowserOpen(true)}
                  className="panel-expand-btn"
                  title="Open Assets Panel"
                >
                  Assets ▲
                </button>
              </div>
            )}
          </>
        )}

        {/* Show tileset editor view for tileset tabs */}
        {activeTilesetTab && (
          <TilesetEditorView tab={activeTilesetTab} />
        )}
      </div>
    </div>
  )
}

export const App = () => {
  return (
    <EditorProvider>
      <AppContent />
    </EditorProvider>
  )
}
