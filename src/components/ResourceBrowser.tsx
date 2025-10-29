import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from '../context/EditorContext'
import { readDir, mkdir, remove } from '@tauri-apps/plugin-fs'
import { fileManager } from '../managers/FileManager'
import { TilesetTab } from '../types'

interface FileItem {
  name: string
  path: string
  isDirectory: boolean
}

interface ResourceBrowserProps {
  onClose: () => void
}

export const ResourceBrowser = ({ onClose }: ResourceBrowserProps) => {
  const { projectDirectory, openMapFromFile, openTab, tilesets, newMap, newTileset } = useEditor()
  const [currentPath, setCurrentPath] = useState<string>('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    item: FileItem | null
  } | null>(null)

  // Modal states
  const [folderNameModal, setFolderNameModal] = useState<{
    visible: boolean
    defaultName: string
  }>({ visible: false, defaultName: '' })
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    visible: boolean
    item: FileItem | null
  }>({ visible: false, item: null })

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      console.log('Context menu opened:', contextMenu)
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  // File operation handlers
  const handleCreateFolder = async (folderName: string) => {
    try {
      const newFolderPath = fileManager.join(currentPath, folderName)
      await mkdir(newFolderPath)
      await loadDirectory(currentPath)
      setFolderNameModal({ visible: false, defaultName: '' })
    } catch (err) {
      console.error('Failed to create folder:', err)
      setError('Failed to create folder')
    }
  }

  const handleDeleteItem = async (item: FileItem) => {
    try {
      await remove(item.path, { recursive: item.isDirectory })
      await loadDirectory(currentPath)
      setDeleteConfirmModal({ visible: false, item: null })
    } catch (err) {
      console.error('Failed to delete item:', err)
      setError('Failed to delete item')
    }
  }

  const handleContextMenu = (e: React.MouseEvent, item: FileItem | null) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Context menu triggered:', { item, x: e.clientX, y: e.clientY })
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    })
  }

  // Load files in current directory
  const loadDirectory = async (dirPath: string) => {
    setLoading(true)
    setError(null)

    try {
      const entries = await readDir(dirPath)
      const items: FileItem[] = []

      for (const entry of entries) {
        // Skip .lostproj files
        if (entry.name.endsWith('.lostproj')) continue

        const fullPath = fileManager.join(dirPath, entry.name)

        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory
        })
      }

      // Sort: directories first, then files alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })

      setFiles(items)
    } catch (err) {
      console.error('Failed to load directory:', err)
      setError('Failed to load directory')
    } finally {
      setLoading(false)
    }
  }

  // Initialize current path when project directory changes
  useEffect(() => {
    if (projectDirectory) {
      setCurrentPath(projectDirectory)
      loadDirectory(projectDirectory)
    } else {
      setCurrentPath('')
      setFiles([])
    }
  }, [projectDirectory])

  const handleItemClick = (item: FileItem) => {
    if (item.isDirectory) {
      setCurrentPath(item.path)
      loadDirectory(item.path)
    }
  }

  const handleItemDoubleClick = (item: FileItem) => {
    if (item.isDirectory) return

    const extension = item.name.includes('.')
      ? item.name.substring(item.name.lastIndexOf('.'))
      : ''

    switch (extension) {
      case '.lostmap':
        openMapFromFile(item.path)
        break

      case '.lostset':
        const tileset = tilesets.find(t => t.filePath === item.path)
        if (tileset) {
          const tilesetTab: TilesetTab = {
            id: `tileset-${tileset.id}`,
            type: 'tileset',
            title: tileset.name,
            isDirty: false,
            tilesetId: tileset.id,
            viewState: {
              scale: 2,
              selectedTileRegion: null
            }
          }
          openTab(tilesetTab)
        }
        break

      default:
        console.log('File type not supported for opening:', extension)
    }
  }

  const navigateUp = () => {
    if (!projectDirectory || currentPath === projectDirectory) return
    const parentPath = fileManager.dirname(currentPath)
    setCurrentPath(parentPath)
    loadDirectory(parentPath)
  }

  const getIcon = (item: FileItem) => {
    if (item.isDirectory) {
      return '📁'
    }

    const ext = item.name.substring(item.name.lastIndexOf('.')).toLowerCase()
    switch (ext) {
      case '.lostmap':
        return '🗺️'
      case '.lostset':
        return '🎨'
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
        return '🖼️'
      default:
        return '📄'
    }
  }

  const getBreadcrumbs = () => {
    if (!projectDirectory || !currentPath) return []

    const relativePath = currentPath.substring(projectDirectory.length)
    if (!relativePath) return []

    const parts = relativePath.split('/').filter(p => p)
    return parts
  }

  if (!projectDirectory) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        No project loaded. Open or create a project to browse files.
      </div>
    )
  }

  const breadcrumbs = getBreadcrumbs()
  const canGoUp = projectDirectory && currentPath !== projectDirectory

  return (
    <div className="h-full flex flex-col" style={{ background: '#252526' }}>
      {/* Header with Assets title and breadcrumbs */}
      <div className="flex items-center gap-3 px-4 py-2" style={{ background: '#2d2d30', borderBottom: '1px solid #3e3e42' }}>
        <h3 className="text-sm font-semibold" style={{ color: '#cccccc' }}>Assets</h3>
        <span style={{ color: '#555' }}>|</span>
        <div className="flex items-center gap-2 text-sm flex-1">
          <button
            onClick={() => {
              setCurrentPath(projectDirectory)
              loadDirectory(projectDirectory)
            }}
            className="transition-colors"
            style={{ color: '#1177bb' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#1a8fd9'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#1177bb'}
          >
            Project
          </button>
          {breadcrumbs.map((part, index) => (
            <div key={index} className="flex items-center gap-2">
              <span style={{ color: '#858585' }}>/</span>
              <span style={{ color: '#cccccc' }}>{part}</span>
            </div>
          ))}
        </div>
        {canGoUp && (
          <button
            onClick={navigateUp}
            className="px-3 py-1 text-xs rounded transition-colors"
            style={{ background: '#3e3e42', border: '1px solid #555', color: '#cccccc' }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#505050'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#3e3e42'}
          >
            ↑ Up
          </button>
        )}
        <button
          onClick={onClose}
          className="text-xl leading-none transition-colors"
          style={{ color: '#858585' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#cccccc'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#858585'}
          title="Close Assets Panel"
        >
          ×
        </button>
      </div>

      {/* File Grid */}
      <div
        className="flex-1 overflow-auto p-4"
        onContextMenu={(e) => handleContextMenu(e, null)}
      >
        {loading ? (
          <div className="text-center text-sm py-8" style={{ color: '#858585' }}>
            Loading...
          </div>
        ) : error ? (
          <div className="text-center text-sm py-8" style={{ color: '#f48771' }}>
            {error}
          </div>
        ) : files.length === 0 ? (
          <div className="text-center text-sm py-8" style={{ color: '#858585' }}>
            Folder is empty
          </div>
        ) : (
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
            {files.map((item, index) => (
              <div
                key={`${item.path}-${index}`}
                className="flex flex-col items-center gap-2 p-3 rounded cursor-pointer transition-colors group"
                onClick={() => handleItemClick(item)}
                onDoubleClick={() => handleItemDoubleClick(item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
                onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div className="text-4xl">{getIcon(item)}</div>
                <div className="text-xs text-center break-all line-clamp-2 w-full" style={{ color: '#cccccc' }}>
                  {item.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu - rendered via portal to avoid overflow issues */}
      {contextMenu && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu(null)
            }}
          />
          {/* Menu */}
          <div
            className="fixed z-50 min-w-[200px] rounded shadow-lg"
            style={{
              top: contextMenu.y,
              left: contextMenu.x,
              background: '#2d2d30',
              border: '1px solid #3e3e42'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Create Folder */}
            <div
              className="px-4 py-2 text-sm cursor-pointer transition-colors"
              style={{ color: '#cccccc' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                setFolderNameModal({ visible: true, defaultName: 'New Folder' })
                setContextMenu(null)
              }}
            >
              Create Folder
            </div>

            {/* Create Map */}
            <div
              className="px-4 py-2 text-sm cursor-pointer transition-colors"
              style={{ color: '#cccccc' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                newMap(currentPath, 'New Map')
                setContextMenu(null)
              }}
            >
              Create Map
            </div>

            {/* Create Tileset */}
            <div
              className="px-4 py-2 text-sm cursor-pointer transition-colors"
              style={{ color: '#cccccc' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={async () => {
                await newTileset(currentPath)
                setContextMenu(null)
              }}
            >
              Create Tileset
            </div>

            {/* Delete (only for files/folders) */}
            {contextMenu.item && (
              <>
                <div
                  className="h-px mx-2 my-1"
                  style={{ background: '#3e3e42' }}
                />
                <div
                  className="px-4 py-2 text-sm cursor-pointer transition-colors"
                  style={{ color: '#f48771' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => {
                    setDeleteConfirmModal({ visible: true, item: contextMenu.item })
                    setContextMenu(null)
                  }}
                >
                  Delete {contextMenu.item.isDirectory ? 'Folder' : 'File'}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Folder Name Modal - rendered via portal */}
      {folderNameModal.visible && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setFolderNameModal({ visible: false, defaultName: '' })}
          />
          {/* Modal */}
          <div
            className="relative z-10 p-6 rounded shadow-xl min-w-[400px]"
            style={{ background: '#2d2d30', border: '1px solid #3e3e42' }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#cccccc' }}>
              Create New Folder
            </h3>
            <input
              type="text"
              className="w-full px-3 py-2 rounded mb-4"
              style={{
                background: '#3e3e42',
                border: '1px solid #555',
                color: '#cccccc',
                outline: 'none'
              }}
              defaultValue={folderNameModal.defaultName}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder(e.currentTarget.value)
                } else if (e.key === 'Escape') {
                  setFolderNameModal({ visible: false, defaultName: '' })
                }
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded transition-colors"
                style={{
                  background: '#3e3e42',
                  border: '1px solid #555',
                  color: '#cccccc'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#505050'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#3e3e42'}
                onClick={() => setFolderNameModal({ visible: false, defaultName: '' })}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded transition-colors"
                style={{
                  background: '#0e639c',
                  border: '1px solid #1177bb',
                  color: '#ffffff'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#1177bb'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#0e639c'}
                onClick={(e) => {
                  const input = e.currentTarget.parentElement?.parentElement?.querySelector('input')
                  if (input) {
                    handleCreateFolder(input.value)
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal - rendered via portal */}
      {deleteConfirmModal.visible && deleteConfirmModal.item && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setDeleteConfirmModal({ visible: false, item: null })}
          />
          {/* Modal */}
          <div
            className="relative z-10 p-6 rounded shadow-xl min-w-[400px]"
            style={{ background: '#2d2d30', border: '1px solid #3e3e42' }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#f48771' }}>
              Confirm Delete
            </h3>
            <p className="mb-4" style={{ color: '#cccccc' }}>
              Are you sure you want to delete <strong>{deleteConfirmModal.item.name}</strong>?
              {deleteConfirmModal.item.isDirectory && (
                <span className="block mt-2 text-sm" style={{ color: '#858585' }}>
                  This will delete the folder and all its contents.
                </span>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded transition-colors"
                style={{
                  background: '#3e3e42',
                  border: '1px solid #555',
                  color: '#cccccc'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#505050'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#3e3e42'}
                onClick={() => setDeleteConfirmModal({ visible: false, item: null })}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded transition-colors"
                style={{
                  background: '#c72e0f',
                  border: '1px solid #f48771',
                  color: '#ffffff'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f48771'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#c72e0f'}
                onClick={() => handleDeleteItem(deleteConfirmModal.item!)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
