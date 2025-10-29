import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { convertFileSrc } from '@tauri-apps/api/core'
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
import { EmptyState } from './components/EmptyState'
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
    newMap,
    newTileset,
    loadProject,
    saveProject,
    saveProjectAs,
    loadTileset,
    addTileset,
    saveTileset,
    saveAll
  } = useEditor()

  const [isAssetBrowserOpen, setIsAssetBrowserOpen] = useState(true)
  const [rightPanelWidth, setRightPanelWidth] = useState(350)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartWidth, setDragStartWidth] = useState(0)

  // Bottom panel resize state
  const [bottomPanelHeight, setBottomPanelHeight] = useState(250)
  const [isResizingBottom, setIsResizingBottom] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)
  const [dragStartHeight, setDragStartHeight] = useState(0)

  // Use refs to store the latest function references
  const newProjectRef = useRef(newProject)
  const newMapRef = useRef(newMap)
  const newTilesetRef = useRef(newTileset)
  const loadProjectRef = useRef(loadProject)
  const saveProjectRef = useRef(saveProject)
  const saveProjectAsRef = useRef(saveProjectAs)
  const loadTilesetRef = useRef(loadTileset)
  const openTabRef = useRef(openTab)
  const saveTilesetRef = useRef(saveTileset)
  const saveAllRef = useRef(saveAll)
  const getActiveTilesetTabRef = useRef(getActiveTilesetTab)
  const listenersRegistered = useRef(false)

  useEffect(() => {
    newProjectRef.current = newProject
    newMapRef.current = newMap
    newTilesetRef.current = newTileset
    loadProjectRef.current = loadProject
    saveProjectRef.current = saveProject
    saveProjectAsRef.current = saveProjectAs
    loadTilesetRef.current = loadTileset
    openTabRef.current = openTab
    saveTilesetRef.current = saveTileset
    saveAllRef.current = saveAll
    getActiveTilesetTabRef.current = getActiveTilesetTab
  }, [newProject, newMap, newTileset, loadProject, saveProject, saveProjectAs, loadTileset, openTab, saveTileset, saveAll, getActiveTilesetTab])

  useEffect(() => {
    // Prevent React Strict Mode from registering duplicate listeners
    if (listenersRegistered.current) {
      return
    }
    listenersRegistered.current = true

    // Set up menu event listeners
    const unlisteners: Array<() => void> = []

    // New Project
    listen('menu:new-project', () => {
      newProjectRef.current()
    }).then(unlisten => unlisteners.push(unlisten))

    // Open Project - show dialog then load
    listen('menu:open-project', async () => {
      const result = await invoke<{ canceled: boolean; filePaths?: string[] }>('show_open_dialog', {
        options: {
          title: 'Open Project',
          filters: [{ name: 'Lost Editor Project', extensions: ['lostproj'] }],
          properties: ['openFile']
        }
      })

      if (result.filePaths && result.filePaths[0]) {
        await loadProjectRef.current(result.filePaths[0])
      }
    }).then(unlisten => unlisteners.push(unlisten))

    // Load recent project - no dialog, just load
    listen<string>('auto-load-project', (event) => {
      if (event.payload) {
        loadProjectRef.current(event.payload)
      }
    }).then(unlisten => unlisteners.push(unlisten))

    listen<string>('menu:load-recent-project', (event) => {
      if (event.payload) {
        loadProjectRef.current(event.payload)
      }
    }).then(unlisten => unlisteners.push(unlisten))

    // Save All (triggered by Ctrl+S accelerator)
    listen('menu:save-project', async () => {
      await saveAllRef.current()
    }).then(unlisten => unlisteners.push(unlisten))

    // Save Project As - show dialog then save
    listen('menu:save-project-as', async () => {
      const result = await invoke<{ canceled: boolean; filePath?: string }>('show_save_dialog', {
        options: {
          title: 'Save Project As',
          defaultPath: 'untitled.lostproj',
          filters: [{ name: 'Lost Editor Project', extensions: ['lostproj'] }]
        }
      })

      if (result.filePath) {
        await saveProjectAsRef.current(result.filePath)
      }
    }).then(unlisten => unlisteners.push(unlisten))

    // New Tileset - create and open in tab
    listen('menu:new-tileset', async () => {
      await newTilesetRef.current()
    }).then(unlisten => unlisteners.push(unlisten))

    // New Map - create new map tab
    listen('menu:new-map', () => {
      newMapRef.current()
    }).then(unlisten => unlisteners.push(unlisten))

    // Note: Load Tileset removed - tilesets auto-load from project file
    listen('menu:load-tileset', async () => {
      // No-op: Tilesets are automatically loaded from project
    }).then(unlisten => unlisteners.push(unlisten))

    // Cleanup listeners on unmount
    return () => {
      // Don't reset listenersRegistered flag - we want to prevent duplicate registration on remount (React Strict Mode)
      unlisteners.forEach(unlisten => unlisten())
    }
  }, [])

  const activeMapTab = getActiveMapTab()
  const activeTilesetTab = getActiveTilesetTab()

  // Handle right panel resize drag
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true)
    setDragStartX(e.clientX)
    setDragStartWidth(rightPanelWidth)
  }

  useEffect(() => {
    if (!isResizing) return

    // Disable text selection during resize
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = dragStartX - e.clientX // Negative because we're pulling from the right
      const newWidth = dragStartWidth + deltaX

      // Constrain width: min 200px, max 50% of window width
      const minWidth = 200
      const maxWidth = window.innerWidth * 0.5
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))

      setRightPanelWidth(constrainedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      // Re-enable text selection
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // Ensure text selection is re-enabled on cleanup
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing, dragStartX, dragStartWidth])

  // Handle bottom panel resize drag
  const handleBottomResizeStart = (e: React.MouseEvent) => {
    e.preventDefault() // Prevent text selection
    setIsResizingBottom(true)
    setDragStartY(e.clientY)
    setDragStartHeight(bottomPanelHeight)
  }

  useEffect(() => {
    if (!isResizingBottom) return

    // Disable text selection during resize
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY - e.clientY // Positive means dragging up (making panel taller)
      const newHeight = dragStartHeight + deltaY

      // Constrain height: min 150px, max 70% of window height
      const minHeight = 150
      const maxHeight = window.innerHeight * 0.7
      const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight))

      setBottomPanelHeight(constrainedHeight)
    }

    const handleMouseUp = () => {
      setIsResizingBottom(false)
      // Re-enable text selection
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      // Ensure text selection is re-enabled on cleanup
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizingBottom, dragStartY, dragStartHeight])

  // Global keyboard handler for Shift+Space (toggle ResourceBrowser)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Shift+Space - Toggle ResourceBrowser
      if (e.shiftKey && e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setIsAssetBrowserOpen(prev => !prev)
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

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
        {/* Show empty state when no tabs are open */}
        {tabs.length === 0 && <EmptyState />}

        {/* Show map editor view for map tabs */}
        {activeMapTab && (
          <div className="editor-top-section">
            <div className="left-panel">
              <PropertiesPanel />
              <EntityPanel />
              <LayersPanel />
            </div>
            <MapCanvas />
            <div
              className={`resize-handle ${isResizing ? 'active' : ''}`}
              onMouseDown={handleResizeStart}
            />
            <div
              className="right-panel"
              style={{ width: `${rightPanelWidth}px` }}
            >
              <TilesetPanel />
            </div>
          </div>
        )}

        {/* Show tileset editor view for tileset tabs */}
        {activeTilesetTab && (
          <div className="editor-top-section">
            <TilesetEditorView tab={activeTilesetTab} />
          </div>
        )}

        {/* Global ResourceBrowser (Shift+Space to toggle) */}
        {isAssetBrowserOpen && (
          <>
            {/* Resize handle for bottom panel */}
            <div
              className={`h-1 bg-gray-700 hover:bg-blue-500 cursor-row-resize ${isResizingBottom ? 'bg-blue-500' : ''}`}
              onMouseDown={handleBottomResizeStart}
            />
            <div
              className="bottom-panel"
              style={{ height: `${bottomPanelHeight}px` }}
            >
              <ResourceBrowser onClose={() => setIsAssetBrowserOpen(false)} />
            </div>
          </>
        )}
        {!isAssetBrowserOpen && tabs.length > 0 && (
          <div className="bottom-panel-collapsed">
            <button
              onClick={() => setIsAssetBrowserOpen(true)}
              className="panel-expand-btn"
              title="Open Assets Panel (Shift+Space)"
            >
              Assets ▲
            </button>
          </div>
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
