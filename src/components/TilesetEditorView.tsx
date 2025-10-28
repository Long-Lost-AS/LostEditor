import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../context/EditorContext'
import { TilesetTab } from '../types'

interface TilesetEditorViewProps {
  tab: TilesetTab
}

export const TilesetEditorView = ({ tab }: TilesetEditorViewProps) => {
  const { updateTabData, updateTileset, getTilesetById } = useEditor()
  const { viewState } = tab

  // Look up the tileset data by ID
  const tilesetData = getTilesetById(tab.tilesetId)

  // If tileset not found, show error
  if (!tilesetData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-red-400">Tileset not found: {tab.tilesetId}</div>
      </div>
    )
  }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null)

  // Refs to track current pan and zoom values for wheel event
  const panRef = useRef(pan)
  const scaleRef = useRef(viewState.scale)

  useEffect(() => {
    panRef.current = pan
    scaleRef.current = viewState.scale
  }, [pan, viewState.scale])

  // Draw tileset image on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !tilesetData.imageData) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      // Resize canvas to fill container
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Apply transforms for pan and zoom
      ctx.save()
      ctx.translate(pan.x, pan.y)
      ctx.scale(viewState.scale, viewState.scale)

      // Draw the tileset image
      ctx.drawImage(tilesetData.imageData, 0, 0)

      // Draw grid overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1 / viewState.scale

      // Draw vertical lines
      for (let x = 0; x <= tilesetData.imageData.width; x += tilesetData.tileWidth) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, tilesetData.imageData.height)
        ctx.stroke()
      }

      // Draw horizontal lines
      for (let y = 0; y <= tilesetData.imageData.height; y += tilesetData.tileHeight) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(tilesetData.imageData.width, y)
        ctx.stroke()
      }

      // Draw tile selection
      if (viewState.selectedTileRegion) {
        const { x, y, width, height } = viewState.selectedTileRegion
        ctx.fillStyle = 'rgba(100, 150, 255, 0.3)'
        ctx.fillRect(
          x * tilesetData.tileWidth,
          y * tilesetData.tileHeight,
          width * tilesetData.tileWidth,
          height * tilesetData.tileHeight
        )
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)'
        ctx.lineWidth = 2 / viewState.scale
        ctx.strokeRect(
          x * tilesetData.tileWidth,
          y * tilesetData.tileHeight,
          width * tilesetData.tileWidth,
          height * tilesetData.tileHeight
        )
      }

      ctx.restore()
    }

    draw()
    window.addEventListener('resize', draw)

    return () => {
      window.removeEventListener('resize', draw)
    }
  }, [tilesetData, viewState.selectedTileRegion, pan, viewState.scale])

  // Setup wheel event listener for zoom and pan
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey) {
        // Zoom towards mouse position
        const rect = container.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        // Calculate world position at mouse before zoom
        const worldX = (mouseX - panRef.current.x) / scaleRef.current
        const worldY = (mouseY - panRef.current.y) / scaleRef.current

        // Calculate new scale
        const delta = -e.deltaY * 0.01
        const newScale = Math.max(0.5, Math.min(8, scaleRef.current + delta))

        // Adjust pan to keep world position under mouse
        const newPanX = mouseX - worldX * newScale
        const newPanY = mouseY - worldY * newScale

        setPan({ x: newPanX, y: newPanY })
        updateTabData(tab.id, {
          viewState: { ...viewState, scale: newScale }
        })
      } else {
        // Wheel = Pan
        setPan({
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY
        })
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [tab.id, viewState, updateTabData])

  // Helper to convert screen coordinates to canvas coordinates
  const screenToCanvas = (screenX: number, screenY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { canvasX: 0, canvasY: 0 }

    const rect = canvas.getBoundingClientRect()
    const x = screenX - rect.left
    const y = screenY - rect.top

    // Account for pan and zoom transforms
    const canvasX = (x - pan.x) / viewState.scale
    const canvasY = (y - pan.y) / viewState.scale

    return { canvasX, canvasY }
  }

  // Helper to convert canvas coordinates to tile coordinates
  const canvasToTile = (canvasX: number, canvasY: number) => {
    const tileX = Math.floor(canvasX / tilesetData.tileWidth)
    const tileY = Math.floor(canvasY / tilesetData.tileHeight)
    return { tileX, tileY }
  }

  // Mouse handlers for panning and tile selection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Middle mouse or Shift+Left = Pan
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    } else if (e.button === 0) {
      // Left click = Select tiles
      const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY)
      const { tileX, tileY } = canvasToTile(canvasX, canvasY)

      setIsSelecting(true)
      setSelectionStart({ x: tileX, y: tileY })

      // Set initial single-tile selection
      updateTabData(tab.id, {
        viewState: { ...viewState, selectedTileRegion: { x: tileX, y: tileY, width: 1, height: 1 } }
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else if (isSelecting && selectionStart) {
      const { canvasX, canvasY } = screenToCanvas(e.clientX, e.clientY)
      const { tileX, tileY } = canvasToTile(canvasX, canvasY)

      // Calculate selection rectangle
      const x = Math.min(selectionStart.x, tileX)
      const y = Math.min(selectionStart.y, tileY)
      const width = Math.abs(tileX - selectionStart.x) + 1
      const height = Math.abs(tileY - selectionStart.y) + 1

      updateTabData(tab.id, {
        viewState: { ...viewState, selectedTileRegion: { x, y, width, height } }
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsSelecting(false)
    setSelectionStart(null)
  }

  const handleZoomIn = () => {
    updateTabData(tab.id, {
      viewState: { ...viewState, scale: Math.min(viewState.scale + 0.5, 8) }
    })
  }

  const handleZoomOut = () => {
    updateTabData(tab.id, {
      viewState: { ...viewState, scale: Math.max(viewState.scale - 0.5, 0.5) }
    })
  }

  const handleResetZoom = () => {
    updateTabData(tab.id, {
      viewState: { ...viewState, scale: 2 }
    })
    setPan({ x: 0, y: 0 })
  }

  return (
    <div className="flex h-full w-full">
      {/* Left Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="text-sm font-medium text-gray-300">
            {tilesetData.name}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {tilesetData.tiles.length} tiles • {tilesetData.entities.length} entities
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="p-4 border-b border-gray-700">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Zoom
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="px-3 py-2 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
              title="Zoom Out"
            >
              −
            </button>
            <span className="flex-1 text-xs text-gray-400 text-center">
              {Math.round(viewState.scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="px-3 py-2 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
              title="Zoom In"
            >
              +
            </button>
          </div>
          <button
            onClick={handleResetZoom}
            className="w-full mt-2 px-3 py-2 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
            title="Reset Zoom"
          >
            Reset View
          </button>
        </div>

        {/* Settings */}
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-4">
            {/* Tileset Properties */}
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Tileset Properties
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Name</label>
                  <input
                    type="text"
                    value={tilesetData.name}
                    onChange={(e) => {
                      updateTileset(tab.tilesetId, { name: e.target.value })
                      updateTabData(tab.id, { isDirty: true })
                    }}
                    className="w-full px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Tile Width</label>
                    <input
                      type="number"
                      value={tilesetData.tileWidth}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 1
                        updateTileset(tab.tilesetId, { tileWidth: value })
                        updateTabData(tab.id, { isDirty: true })
                      }}
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Tile Height</label>
                    <input
                      type="number"
                      value={tilesetData.tileHeight}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 1
                        updateTileset(tab.tilesetId, { tileHeight: value })
                        updateTabData(tab.id, { isDirty: true })
                      }}
                      className="w-full px-2 py-1 text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                      min="1"
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-500 pt-1">
                  Image: {tilesetData.imageData?.width || 0}×{tilesetData.imageData?.height || 0}px
                </div>
                <div className="text-xs text-gray-500">
                  {tilesetData.tiles.length} tile{tilesetData.tiles.length !== 1 ? 's' : ''} defined
                </div>
              </div>
            </div>

            {viewState.selectedTileRegion && (
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Selection
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">
                    Position: ({viewState.selectedTileRegion.x}, {viewState.selectedTileRegion.y})
                  </div>
                  <div className="text-xs text-gray-500">
                    Size: {viewState.selectedTileRegion.width}×{viewState.selectedTileRegion.height} tiles
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Side - Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-gray-900 relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          cursor: isDragging ? 'grabbing' : 'crosshair'
        }}
      >
        {tilesetData.imageData ? (
          <canvas
            ref={canvasRef}
            className="tileset-canvas"
            style={{
              width: '100%',
              height: '100%',
              imageRendering: 'pixelated'
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-center">
            No tileset image loaded
          </div>
        )}
      </div>
    </div>
  )
}
