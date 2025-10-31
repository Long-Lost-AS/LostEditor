import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { readDir } from '@tauri-apps/plugin-fs'
import { useEditor } from '../context/EditorContext'
import { fileManager } from '../managers/FileManager'
import Fuse from 'fuse.js'

interface AssetFile {
  name: string
  path: string
  relativePath: string
  type: 'map' | 'tileset' | 'entity'
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const { projectDirectory, openMapFromFile, openTilesetFromFile, openEntityFromFile } = useEditor()
  const [assets, setAssets] = useState<AssetFile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Scan project directory recursively for assets
  const scanDirectory = async (dirPath: string, baseDir: string): Promise<AssetFile[]> => {
    const foundAssets: AssetFile[] = []

    try {
      const entries = await readDir(dirPath)

      for (const entry of entries) {
        const fullPath = fileManager.join(dirPath, entry.name)

        if (entry.isDirectory) {
          // Skip hidden directories and temp directories
          if (entry.name.startsWith('.')) {
            continue
          }

          // Recursively scan subdirectories (with error handling for permission issues)
          try {
            const subAssets = await scanDirectory(fullPath, baseDir)
            foundAssets.push(...subAssets)
          } catch (err) {
            // Skip directories we can't access (e.g., permission denied)
            console.warn(`Skipping directory ${fullPath}:`, err)
          }
        } else {
          // Check if it's an asset file
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase()
          let type: 'map' | 'tileset' | 'entity' | null = null

          switch (ext) {
            case '.lostmap':
              type = 'map'
              break
            case '.lostset':
              type = 'tileset'
              break
            case '.lostentity':
              type = 'entity'
              break
          }

          if (type) {
            const relativePath = fullPath.substring(baseDir.length + 1)
            foundAssets.push({
              name: entry.name,
              path: fullPath,
              relativePath,
              type
            })
          }
        }
      }
    } catch (err) {
      console.error('Failed to scan directory:', err)
    }

    return foundAssets
  }

  // Load assets when palette opens
  useEffect(() => {
    if (isOpen && projectDirectory) {
      setLoading(true)
      setSearchQuery('')
      setSelectedIndex(0)

      scanDirectory(projectDirectory, projectDirectory).then((foundAssets) => {
        // Sort alphabetically
        foundAssets.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
        setAssets(foundAssets)
        setLoading(false)
      })

      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, projectDirectory])

  // Fuzzy search using Fuse.js
  const fuse = new Fuse(assets, {
    keys: ['name', 'relativePath'],
    threshold: 0.4, // 0 = exact match, 1 = match anything
    ignoreLocation: true
  })

  const filteredAssets = searchQuery
    ? fuse.search(searchQuery).map((result) => result.item)
    : assets

  // Reset selected index when search query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  // Handler to open an asset file
  const handleOpenAsset = useCallback((asset: AssetFile) => {
    switch (asset.type) {
      case 'map':
        openMapFromFile(asset.path)
        break
      case 'tileset':
        openTilesetFromFile(asset.path)
        break
      case 'entity':
        openEntityFromFile(asset.path)
        break
    }
    onClose()
  }, [openMapFromFile, openTilesetFromFile, openEntityFromFile, onClose])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          onClose()
          break

        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filteredAssets.length - 1))
          break

        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break

        case 'Enter':
          e.preventDefault()
          if (filteredAssets[selectedIndex]) {
            handleOpenAsset(filteredAssets[selectedIndex])
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, filteredAssets, onClose, handleOpenAsset])

  const getIcon = (type: 'map' | 'tileset' | 'entity') => {
    switch (type) {
      case 'map':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M20.5 3L20.34 3.03L15 5.1L9 3L3.36 4.9C3.15 4.97 3 5.15 3 5.38V20.5C3 20.78 3.22 21 3.5 21L3.66 20.97L9 18.9L15 21L20.64 19.1C20.85 19.03 21 18.85 21 18.62V3.5C21 3.22 20.78 3 20.5 3ZM15 19L9 16.89V5L15 7.11V19Z" fill="#6bb6ff"/>
          </svg>
        )
      case 'tileset':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 3C10.34 3 9 4.34 9 6C9 7.66 10.34 9 12 9C13.66 9 15 7.66 15 6C15 4.34 13.66 3 12 3ZM6 9C4.34 9 3 10.34 3 12C3 13.66 4.34 15 6 15C7.66 15 9 13.66 9 12C9 10.34 7.66 9 6 9ZM18 9C16.34 9 15 10.34 15 12C15 13.66 16.34 15 18 15C19.66 15 21 13.66 21 12C21 10.34 19.66 9 18 9ZM12 15C10.34 15 9 16.34 9 18C9 19.66 10.34 21 12 21C13.66 21 15 19.66 15 18C15 16.34 13.66 15 12 15Z" fill="#c586c0"/>
          </svg>
        )
      case 'entity':
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="#4ec9b0"/>
            <circle cx="9" cy="10" r="1.5" fill="#4ec9b0"/>
            <circle cx="15" cy="10" r="1.5" fill="#4ec9b0"/>
            <path d="M12 17.5C14.33 17.5 16.31 16.04 17.11 14H6.89C7.69 16.04 9.67 17.5 12 17.5Z" fill="#4ec9b0"/>
          </svg>
        )
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0, 0, 0, 0.6)' }}
        onClick={onClose}
      />

      {/* Command Palette */}
      <div
        className="relative z-10 w-full max-w-2xl rounded shadow-2xl overflow-hidden"
        style={{ background: '#2d2d30', border: '1px solid #3e3e42' }}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #3e3e42' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" fill="#858585"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#cccccc' }}
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="text-xs" style={{ color: '#858585' }}>
            ESC to close
          </span>
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          className="overflow-y-auto"
          style={{
            maxHeight: '400px',
            background: '#252526'
          }}
        >
          {loading ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: '#858585' }}>
              Scanning project...
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: '#858585' }}>
              {searchQuery ? 'No assets found' : 'No assets in project'}
            </div>
          ) : (
            filteredAssets.map((asset, index) => (
              <div
                key={asset.path}
                className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors"
                style={{
                  background: index === selectedIndex ? '#0e639c' : 'transparent',
                  borderLeft: index === selectedIndex ? '3px solid #1177bb' : '3px solid transparent'
                }}
                onClick={() => handleOpenAsset(asset)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {getIcon(asset.type)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: '#cccccc' }}>
                    {asset.name}
                  </div>
                  <div className="text-xs truncate" style={{ color: '#858585' }}>
                    {asset.relativePath}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2 text-xs"
          style={{ background: '#2d2d30', borderTop: '1px solid #3e3e42', color: '#858585' }}
        >
          <div>
            {filteredAssets.length > 0 && (
              <span>{filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
