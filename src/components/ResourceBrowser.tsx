import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from '../context/EditorContext'
import { readDir, mkdir, remove, rename, exists } from '@tauri-apps/plugin-fs'
import { openPath } from '@tauri-apps/plugin-opener'
import { fileManager } from '../managers/FileManager'
import { referenceManager } from '../managers/ReferenceManager'
import { TilesetTab } from '../types'
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDraggable,
  useDroppable
} from '@dnd-kit/core'

interface FileItem {
  name: string
  path: string
  isDirectory: boolean
}

// Special ID for the "up directory" drop target
const UP_DIRECTORY_ID = '__up_directory__'

interface ResourceBrowserProps {
  onClose: () => void
  isModal?: boolean
}

export const ResourceBrowser = ({ onClose, isModal = false }: ResourceBrowserProps) => {
  const { projectDirectory, openMapFromFile, openTilesetFromFile, openTab, tilesets, newMap, newTileset } = useEditor()
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
  const [renameModal, setRenameModal] = useState<{
    visible: boolean
    item: FileItem | null
    newName: string
  }>({ visible: false, item: null, newName: '' })

  // Multi-select state
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)

  // Double-click detection
  const lastClickTimeRef = useRef<{ path: string; time: number } | null>(null)

  // Drag and drop state (dnd-kit)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Set up dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // Require 8px movement before drag starts (prevents accidental drags)
      }
    })
  )

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    if (contextMenu) {
      console.log('Context menu opened:', contextMenu)
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  // Clear selection when directory changes
  useEffect(() => {
    setSelectedItems(new Set())
    setLastSelectedIndex(null)
  }, [currentPath])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+A or Cmd+A - Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && files.length > 0) {
        e.preventDefault()
        const allPaths = new Set(files.map(f => f.path))
        setSelectedItems(allPaths)
      }
      // Escape - Clear selection
      if (e.key === 'Escape') {
        setSelectedItems(new Set())
        setLastSelectedIndex(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [files])

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

  const handleOpenContainingFolder = async (item: FileItem) => {
    try {
      const folderPath = fileManager.dirname(item.path)
      await openPath(folderPath)
      setContextMenu(null)
    } catch (err) {
      console.error('Failed to open containing folder:', err)
      setError('Failed to open containing folder')
    }
  }

  const handleRenameItem = (item: FileItem) => {
    setRenameModal({ visible: true, item, newName: item.name })
    setContextMenu(null)
  }

  const confirmRename = async () => {
    const { item, newName } = renameModal
    if (!item || !newName || newName === item.name) {
      setRenameModal({ visible: false, item: null, newName: '' })
      return
    }

    try {
      const parentDir = fileManager.dirname(item.path)
      const newPath = fileManager.join(parentDir, newName)

      // Check if file already exists
      const fileExists = await exists(newPath)
      if (fileExists) {
        setError(`A ${item.isDirectory ? 'folder' : 'file'} with that name already exists`)
        setTimeout(() => setError(null), 3000)
        setRenameModal({ visible: false, item: null, newName: '' })
        return
      }

      // Perform the rename
      await rename(item.path, newPath)

      // Update references if in project directory
      if (projectDirectory && item.path.startsWith(projectDirectory)) {
        try {
          await referenceManager.updateReferences(item.path, newPath, projectDirectory)
          referenceManager.updateManagerCaches(item.path, newPath)
        } catch (err) {
          console.error('Failed to update references:', err)
          // Don't fail the rename if reference update fails
        }
      }

      await loadDirectory(currentPath)
      setRenameModal({ visible: false, item: null, newName: '' })
    } catch (err) {
      console.error('Failed to rename item:', err)
      setError('Failed to rename item')
      setTimeout(() => setError(null), 3000)
      setRenameModal({ visible: false, item: null, newName: '' })
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

  const handleItemClick = (item: FileItem, index: number, e: React.MouseEvent) => {
    // Detect double-click manually (within 300ms)
    const now = Date.now()
    const lastClick = lastClickTimeRef.current

    if (lastClick && lastClick.path === item.path && now - lastClick.time < 300) {
      // Double-click detected!
      lastClickTimeRef.current = null // Reset
      handleItemDoubleClick(e, item)
      return
    }

    // Store this click for double-click detection
    lastClickTimeRef.current = { path: item.path, time: now }

    // Multi-select logic for files or folders with modifiers
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: Toggle selection
      const newSelection = new Set(selectedItems)
      if (newSelection.has(item.path)) {
        newSelection.delete(item.path)
      } else {
        newSelection.add(item.path)
      }
      setSelectedItems(newSelection)
      setLastSelectedIndex(index)
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      // Shift+Click: Range selection
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      const newSelection = new Set<string>()
      for (let i = start; i <= end; i++) {
        if (files[i]) {
          newSelection.add(files[i].path)
        }
      }
      setSelectedItems(newSelection)
    } else {
      // Regular click: Select only this item
      setSelectedItems(new Set([item.path]))
      setLastSelectedIndex(index)
    }
  }

  const handleItemDoubleClick = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault()
    e.stopPropagation()

    // If it's a directory, navigate into it
    if (item.isDirectory) {
      setCurrentPath(item.path)
      loadDirectory(item.path)
      return
    }

    const extension = item.name.includes('.')
      ? item.name.substring(item.name.lastIndexOf('.'))
      : ''

    switch (extension) {
      case '.lostmap':
        openMapFromFile(item.path)
        break

      case '.lostset':
        openTilesetFromFile(item.path)
        break

      default:
        console.log('File type not supported for opening:', extension)
    }
  }

  // Helper: Check if path is a subdirectory of parent
  const isSubdirectory = (parent: string, child: string): boolean => {
    const normalizedParent = parent.endsWith('/') ? parent : parent + '/'
    return child.startsWith(normalizedParent)
  }

  // dnd-kit drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const draggedPath = event.active.id as string
    setActiveId(draggedPath)

    // If dragging an unselected item, select it
    const item = files.find(f => f.path === draggedPath)
    if (item && !selectedItems.has(draggedPath)) {
      const index = files.indexOf(item)
      setSelectedItems(new Set([draggedPath]))
      setLastSelectedIndex(index)
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    setActiveId(null)
    setOverId(null)

    if (!over) return

    const sourcePath = active.id as string
    const targetId = over.id as string

    // Handle drop on "up directory" target
    if (targetId === UP_DIRECTORY_ID) {
      if (!projectDirectory || currentPath === projectDirectory) return

      const parentPath = fileManager.dirname(currentPath)

      // Determine which items to move
      const itemsToMove = selectedItems.has(sourcePath)
        ? Array.from(selectedItems)
        : [sourcePath]

      // Perform move operation
      setLoading(true)
      const errors: string[] = []

      try {
        for (const itemPath of itemsToMove) {
          const fileName = fileManager.basename(itemPath)
          const destPath = fileManager.join(parentPath, fileName)

          // Check if file already exists
          try {
            const fileExists = await exists(destPath)
            if (fileExists) {
              const confirmed = confirm(`File "${fileName}" already exists in destination. Replace it?`)
              if (!confirmed) continue
            }
          } catch (err) {
            // File doesn't exist, continue
          }

          // Perform the move
          try {
            await rename(itemPath, destPath)

            // Update references if in project directory
            if (projectDirectory && itemPath.startsWith(projectDirectory)) {
              try {
                await referenceManager.updateReferences(itemPath, destPath, projectDirectory)
                referenceManager.updateManagerCaches(itemPath, destPath)
              } catch (err) {
                console.error('Failed to update references:', err)
                // Don't fail the move if reference update fails
              }
            }
          } catch (err) {
            console.error('Failed to move item:', err)
            errors.push(`Failed to move ${fileName}: ${err}`)
          }
        }

        // Show errors if any
        if (errors.length > 0) {
          setError(errors.join('\n'))
          setTimeout(() => setError(null), 5000)
        }

        // Refresh directory and clear selection
        await loadDirectory(currentPath)
        setSelectedItems(new Set())
        setLastSelectedIndex(null)
      } catch (err) {
        console.error('Drop operation failed:', err)
        setError(`Failed to move items: ${err}`)
        setTimeout(() => setError(null), 3000)
      } finally {
        setLoading(false)
      }

      return
    }

    // Get the target item (for regular folder drops)
    const targetItem = files.find(f => f.path === targetId)
    if (!targetItem || !targetItem.isDirectory) return

    const targetPath = targetId

    // Determine which items to move
    const itemsToMove = selectedItems.has(sourcePath)
      ? Array.from(selectedItems)
      : [sourcePath]

    // Validate: can't drop on self
    if (itemsToMove.includes(targetPath)) {
      setError('Cannot move a folder into itself')
      setTimeout(() => setError(null), 3000)
      return
    }

    // Validate: can't drop into subdirectory
    for (const itemPath of itemsToMove) {
      if (isSubdirectory(itemPath, targetPath)) {
        setError('Cannot move a folder into itself')
        setTimeout(() => setError(null), 3000)
        return
      }
    }

    // Perform move operation
    setLoading(true)
    const errors: string[] = []

    try {
      for (const sourcePath of itemsToMove) {
        const fileName = fileManager.basename(sourcePath)
        const destPath = fileManager.join(targetPath, fileName)

        // Check if file already exists
        try {
          const fileExists = await exists(destPath)
          if (fileExists) {
            const confirmed = confirm(`File "${fileName}" already exists in destination. Replace it?`)
            if (!confirmed) continue
          }
        } catch (err) {
          // File doesn't exist, continue
        }

        // Perform the move
        try {
          await rename(sourcePath, destPath)

          // Update references if in project directory
          if (projectDirectory && sourcePath.startsWith(projectDirectory)) {
            try {
              await referenceManager.updateReferences(sourcePath, destPath, projectDirectory)
              referenceManager.updateManagerCaches(sourcePath, destPath)
            } catch (err) {
              console.error('Failed to update references:', err)
              // Don't fail the move if reference update fails
            }
          }
        } catch (err) {
          console.error('Failed to move item:', err)
          errors.push(`Failed to move ${fileName}: ${err}`)
        }
      }

      // Show errors if any
      if (errors.length > 0) {
        setError(errors.join('\n'))
        setTimeout(() => setError(null), 5000)
      }

      // Refresh directory and clear selection
      await loadDirectory(currentPath)
      setSelectedItems(new Set())
      setLastSelectedIndex(null)
    } catch (err) {
      console.error('Drop operation failed:', err)
      setError(`Failed to move items: ${err}`)
      setTimeout(() => setError(null), 3000)
    } finally {
      setLoading(false)
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
      return (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <path d="M10 4H4C2.89 4 2.01 4.89 2.01 6L2 18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V8C22 6.89 21.11 6 20 6H12L10 4Z" fill="#dcb67a"/>
        </svg>
      )
    }

    const ext = item.name.substring(item.name.lastIndexOf('.')).toLowerCase()
    switch (ext) {
      case '.lostmap':
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M20.5 3L20.34 3.03L15 5.1L9 3L3.36 4.9C3.15 4.97 3 5.15 3 5.38V20.5C3 20.78 3.22 21 3.5 21L3.66 20.97L9 18.9L15 21L20.64 19.1C20.85 19.03 21 18.85 21 18.62V3.5C21 3.22 20.78 3 20.5 3ZM15 19L9 16.89V5L15 7.11V19Z" fill="#6bb6ff"/>
          </svg>
        )
      case '.lostset':
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M12 3C10.34 3 9 4.34 9 6C9 7.66 10.34 9 12 9C13.66 9 15 7.66 15 6C15 4.34 13.66 3 12 3ZM6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C7.66 15 9 13.66 9 12C9 10.34 7.66 9 6 9ZM18 9C16.34 9 15 10.34 15 12C15 13.66 16.34 15 18 15C19.66 15 21 13.66 21 12C21 10.34 19.66 9 18 9ZM12 15C10.34 15 9 16.34 9 18C9 19.66 10.34 21 12 21C13.66 21 15 19.66 15 18C15 16.34 13.66 15 12 15Z" fill="#c586c0"/>
          </svg>
        )
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M21 19V5C21 3.89 20.11 3 19 3H5C3.89 3 3 3.89 3 5V19C3 20.11 3.89 21 5 21H19C20.11 21 21 20.11 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z" fill="#a0d468"/>
          </svg>
        )
      default:
        return (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z" fill="#858585"/>
          </svg>
        )
    }
  }

  const getBreadcrumbs = () => {
    if (!projectDirectory || !currentPath) return []

    const relativePath = currentPath.substring(projectDirectory.length)
    if (!relativePath) return []

    const parts = relativePath.split('/').filter(p => p)
    return parts
  }

  // Up Directory Drop Target Component
  const UpDirectoryDropTarget = () => {
    const isOver = overId === UP_DIRECTORY_ID

    const { setNodeRef } = useDroppable({
      id: UP_DIRECTORY_ID
    })

    const style = {
      background: isOver ? 'rgba(17, 119, 187, 0.2)' : 'rgba(62, 62, 66, 0.5)',
      border: isOver ? '2px dashed #1177bb' : '2px dashed #555',
      outline: 'none',
      cursor: 'default'
    }

    return (
      <div
        ref={setNodeRef}
        className="flex flex-col items-center justify-center gap-2 p-3 rounded transition-all"
        style={style}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ userSelect: 'none' }}>
          <path d="M12 4L6 10H10V16H14V10H18L12 4Z" fill="#858585" />
          <path d="M4 18H20V20H4V18Z" fill="#858585" />
        </svg>
        <div className="text-xs text-center break-all line-clamp-2 w-full" style={{ color: '#cccccc', userSelect: 'none' }}>
          ..
        </div>
      </div>
    )
  }

  // Draggable and Droppable File Item Component
  const DraggableDroppableItem = ({ item, index }: { item: FileItem; index: number }) => {
    const isSelected = selectedItems.has(item.path)
    const isActive = activeId === item.path
    const isOver = overId === item.path && item.isDirectory

    // Both files and folders can be dragged
    const { attributes, listeners, setNodeRef: setDraggableRef, transform } = useDraggable({
      id: item.path,
      data: { item },
      activationConstraint: {
        distance: 8 // Require 8px of movement before dragging starts
      }
    })

    // Only folders can receive drops
    const { setNodeRef: setDroppableRef } = useDroppable({
      id: item.path,
      disabled: !item.isDirectory
    })

    // Combine refs for folders (both draggable and droppable)
    const combinedRef = (node: HTMLDivElement | null) => {
      setDraggableRef(node)
      if (item.isDirectory) {
        setDroppableRef(node)
      }
    }

    // Apply transform for dragging
    const style = {
      background: isSelected ? 'rgba(14, 99, 156, 0.3)' : 'transparent',
      border: isSelected ? '2px solid #1177bb' : '2px solid transparent',
      outline: isOver ? '2px dashed #1177bb' : 'none',
      outlineOffset: '-2px',
      cursor: isActive ? 'grabbing' : 'pointer',
      transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      transition: isActive ? 'none' : 'transform 200ms ease'
    }

    return (
      <div
        ref={combinedRef}
        {...attributes}
        {...listeners}
        className="flex flex-col items-center gap-2 p-3 rounded cursor-pointer transition-all group relative"
        style={{ ...style, userSelect: 'none', WebkitUserSelect: 'none' }}
        onClick={(e) => handleItemClick(item, index, e)}
        onDoubleClick={(e) => handleItemDoubleClick(e, item)}
        onContextMenu={(e) => handleContextMenu(e, item)}
        onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
          if (!isSelected && !isActive) {
            e.currentTarget.style.background = '#3e3e42'
          }
        }}
        onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <div style={{ userSelect: 'none' }}>{getIcon(item)}</div>
        <div className="text-xs text-center break-all line-clamp-2 w-full" style={{ color: '#cccccc', userSelect: 'none' }}>
          {item.name}
        </div>
        {isSelected && selectedItems.size > 1 && (
          <div
            className="absolute top-1 right-1 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
            style={{
              background: '#1177bb',
              color: '#ffffff',
              userSelect: 'none'
            }}
          >
            {Array.from(selectedItems).indexOf(item.path) === 0 ? selectedItems.size : ''}
          </div>
        )}
      </div>
    )
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
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
            {canGoUp && <UpDirectoryDropTarget />}
            {files.map((item, index) => (
              <DraggableDroppableItem key={item.path} item={item} index={index} />
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

            {/* Open Containing Folder (only for files/folders) */}
            {contextMenu.item && (
              <>
                <div
                  className="h-px mx-2 my-1"
                  style={{ background: '#3e3e42' }}
                />
                <div
                  className="px-4 py-2 text-sm cursor-pointer transition-colors"
                  style={{ color: '#cccccc' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleOpenContainingFolder(contextMenu.item!)}
                >
                  Open Containing Folder
                </div>
              </>
            )}

            {/* Rename (only for files/folders) */}
            {contextMenu.item && (
              <>
                <div
                  className="px-4 py-2 text-sm cursor-pointer transition-colors"
                  style={{ color: '#cccccc' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#3e3e42'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleRenameItem(contextMenu.item!)}
                >
                  Rename
                </div>
              </>
            )}

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

      {/* Rename Modal - rendered via portal */}
      {renameModal.visible && renameModal.item && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setRenameModal({ visible: false, item: null, newName: '' })}
          />
          {/* Modal */}
          <div
            className="relative z-10 p-6 rounded shadow-xl min-w-[400px]"
            style={{ background: '#2d2d30', border: '1px solid #3e3e42' }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: '#cccccc' }}>
              Rename {renameModal.item.isDirectory ? 'Folder' : 'File'}
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
              value={renameModal.newName}
              onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value })}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  confirmRename()
                } else if (e.key === 'Escape') {
                  setRenameModal({ visible: false, item: null, newName: '' })
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
                onClick={() => setRenameModal({ visible: false, item: null, newName: '' })}
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
                onClick={confirmRename}
              >
                Rename
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </DndContext>
  )
}
