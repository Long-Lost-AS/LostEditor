import { useRef, useEffect, useState } from 'react'
import { PolygonCollider } from '../types'

interface CollisionEditorProps {
  width: number
  height: number
  colliders: PolygonCollider[]
  onUpdate: (colliders: PolygonCollider[]) => void
  backgroundImage?: HTMLImageElement
  backgroundRect?: { x: number; y: number; width: number; height: number }
}

export const CollisionEditor = ({
  width,
  height,
  colliders,
  onUpdate,
  backgroundImage,
  backgroundRect
}: CollisionEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedColliderIndex, setSelectedColliderIndex] = useState<number>(0)
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>(
    colliders[0]?.points || []
  )
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(4) // Zoom scale for better editing
  const [pan, setPan] = useState({ x: 50, y: 50 }) // Start with some padding
  const [snapToGrid, setSnapToGrid] = useState(true) // Grid snapping enabled by default
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    pointIndex?: number
    edgeIndex?: number
    insertPosition?: { x: number; y: number }
  } | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  // Refs for event handlers
  const panRef = useRef(pan)
  const scaleRef = useRef(scale)

  useEffect(() => {
    panRef.current = pan
    scaleRef.current = scale
  }, [pan, scale])

  // Load points when selected collider changes
  useEffect(() => {
    if (colliders[selectedColliderIndex]) {
      setPoints(colliders[selectedColliderIndex].points)
    }
  }, [colliders, selectedColliderIndex])

  // Reset selected point only when switching between colliders
  useEffect(() => {
    setSelectedPointIndex(null)
  }, [selectedColliderIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      // Resize canvas to fill container
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Apply transforms for pan and zoom
      ctx.save()
      ctx.translate(pan.x, pan.y)
      ctx.scale(scale, scale)

      // Draw background image if provided
      if (backgroundImage && backgroundRect) {
        ctx.drawImage(
          backgroundImage,
          backgroundRect.x,
          backgroundRect.y,
          backgroundRect.width,
          backgroundRect.height,
          0,
          0,
          backgroundRect.width,
          backgroundRect.height
        )
      } else {
        // Draw checkerboard background
        const gridSize = 8
        for (let y = 0; y < height; y += gridSize) {
          for (let x = 0; x < width; x += gridSize) {
            const isEven = (Math.floor(x / gridSize) + Math.floor(y / gridSize)) % 2 === 0
            ctx.fillStyle = isEven ? '#333' : '#444'
            ctx.fillRect(x, y, gridSize, gridSize)
          }
        }
      }

      // Draw all colliders
      colliders.forEach((collider, colliderIndex) => {
        if (collider.points.length === 0) return

        const isActive = colliderIndex === selectedColliderIndex

        // Fill
        ctx.fillStyle = isActive ? 'rgba(0, 255, 0, 0.2)' : 'rgba(128, 128, 128, 0.1)'
        ctx.beginPath()
        ctx.moveTo(collider.points[0].x, collider.points[0].y)
        for (let i = 1; i < collider.points.length; i++) {
          ctx.lineTo(collider.points[i].x, collider.points[i].y)
        }
        ctx.closePath()
        ctx.fill()

        // Stroke
        ctx.strokeStyle = isActive ? '#0f0' : 'rgba(128, 128, 128, 0.5)'
        ctx.lineWidth = 2 / scale
        ctx.stroke()

        // Only draw control points for active collider
        if (isActive) {
          collider.points.forEach((point, index) => {
            const isSelected = index === selectedPointIndex
            ctx.fillStyle = isSelected ? '#ff0' : '#0f0'
            ctx.beginPath()
            ctx.arc(point.x, point.y, (isSelected ? 6 : 4) / scale, 0, Math.PI * 2)
            ctx.fill()

            // Draw point index
            ctx.fillStyle = '#fff'
            ctx.font = `${10 / scale}px monospace`
            ctx.fillText(
              index.toString(),
              point.x + 8 / scale,
              point.y - 8 / scale
            )
          })
        }
      })

      // Draw grid (1px grid)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 1 / scale
      for (let x = 0; x <= width; x += 1) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y <= height; y += 1) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      ctx.restore()
    }

    draw()
    window.addEventListener('resize', draw)

    return () => {
      window.removeEventListener('resize', draw)
    }
  }, [colliders, selectedColliderIndex, selectedPointIndex, width, height, scale, pan, backgroundImage, backgroundRect])

  // Setup wheel event listener for zoom and pan
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        // Zoom towards mouse position
        const rect = container.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        // Calculate world position at mouse before zoom
        const worldX = (mouseX - panRef.current.x) / scaleRef.current
        const worldY = (mouseY - panRef.current.y) / scaleRef.current

        // Calculate new scale
        const delta = -e.deltaY * 0.01
        const newScale = Math.max(0.5, Math.min(16, scaleRef.current + delta))

        // Adjust pan to keep world position under mouse
        const newPanX = mouseX - worldX * newScale
        const newPanY = mouseY - worldY * newScale

        setPan({ x: newPanX, y: newPanY })
        setScale(newScale)
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
  }, [])

  const snapCoord = (value: number) => {
    if (snapToGrid) {
      return Math.round(value)
    }
    return value
  }

  const updateColliderPoints = (newPoints: Array<{ x: number; y: number }>) => {
    setPoints(newPoints)
    const newColliders = [...colliders]
    newColliders[selectedColliderIndex] = { points: newPoints }
    onUpdate(newColliders)
  }

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>, applySnap = true) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Account for pan and zoom transforms
    const canvasX = (screenX - pan.x) / scale
    const canvasY = (screenY - pan.y) / scale

    // Apply snapping if enabled and requested
    const finalX = applySnap ? snapCoord(canvasX) : canvasX
    const finalY = applySnap ? snapCoord(canvasY) : canvasY

    return {
      x: Math.max(0, Math.min(width, finalX)),
      y: Math.max(0, Math.min(height, finalY))
    }
  }

  const findPointAtPosition = (x: number, y: number): number | null => {
    // Adjust threshold based on zoom level (smaller in world coords when zoomed in)
    const threshold = 8 / scale
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x
      const dy = points[i].y - y
      if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
        return i
      }
    }
    return null
  }

  const findEdgeAtPosition = (x: number, y: number): { edgeIndex: number; insertPosition: { x: number; y: number } } | null => {
    if (points.length < 2) return null

    const threshold = 8 / scale

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i]
      const p2 = points[(i + 1) % points.length]

      // Calculate distance from point to line segment
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const lengthSquared = dx * dx + dy * dy

      if (lengthSquared === 0) continue

      // Calculate projection of click point onto line segment
      const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSquared))
      const projX = p1.x + t * dx
      const projY = p1.y + t * dy

      // Check if distance to line is within threshold
      const distX = x - projX
      const distY = y - projY
      const distance = Math.sqrt(distX * distX + distY * distY)

      if (distance <= threshold) {
        return {
          edgeIndex: i,
          insertPosition: { x: projX, y: projY }
        }
      }
    }

    return null
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      // Middle mouse or Shift+Left = Pan
      setIsPanning(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    } else if (e.button === 0) {
      // Left click - use unsnapped coords to find existing points
      const unsnappedCoords = getCanvasCoords(e, false)
      const pointIndex = findPointAtPosition(unsnappedCoords.x, unsnappedCoords.y)

      if (pointIndex !== null) {
        setSelectedPointIndex(pointIndex)
        setIsDragging(true)
      } else {
        // Add point - use snapped coords for new point position
        const { x, y } = getCanvasCoords(e, true)
        const newPoints = [...points, { x, y }]
        updateColliderPoints(newPoints)
        setSelectedPointIndex(newPoints.length - 1)
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Update mouse position for status bar
    const { x, y } = getCanvasCoords(e, false)
    setMousePos({ x: Math.floor(x), y: Math.floor(y) })

    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else if (isDragging && selectedPointIndex !== null) {
      const snappedCoords = getCanvasCoords(e)
      const newPoints = [...points]
      newPoints[selectedPointIndex] = { x: snappedCoords.x, y: snappedCoords.y }
      updateColliderPoints(newPoints)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsPanning(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedPointIndex !== null) {
        const newPoints = points.filter((_, i) => i !== selectedPointIndex)
        updateColliderPoints(newPoints)
        setSelectedPointIndex(null)
      }
    }
  }

  const addNewCollider = () => {
    const newColliders = [...colliders, { points: [] }]
    onUpdate(newColliders)
    setSelectedColliderIndex(newColliders.length - 1)
  }

  const deleteCollider = () => {
    if (colliders.length <= 1) return // Keep at least one collider
    const newColliders = colliders.filter((_, i) => i !== selectedColliderIndex)
    onUpdate(newColliders)
    setSelectedColliderIndex(Math.max(0, selectedColliderIndex - 1))
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()

    // Check if we right-clicked on a point or edge
    const unsnappedCoords = getCanvasCoords(e, false)
    const pointIndex = findPointAtPosition(unsnappedCoords.x, unsnappedCoords.y)

    if (pointIndex !== null) {
      // Clicked on a point
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        pointIndex
      })
    } else {
      // Check if clicked on an edge
      const edge = findEdgeAtPosition(unsnappedCoords.x, unsnappedCoords.y)
      if (edge) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          edgeIndex: edge.edgeIndex,
          insertPosition: edge.insertPosition
        })
      }
    }
  }

  const handleDeletePoint = () => {
    if (contextMenu && contextMenu.pointIndex !== undefined) {
      const newPoints = points.filter((_, i) => i !== contextMenu.pointIndex)
      updateColliderPoints(newPoints)
      setSelectedPointIndex(null)
    }
    setContextMenu(null)
  }

  const handleInsertPoint = () => {
    if (contextMenu && contextMenu.edgeIndex !== undefined && contextMenu.insertPosition) {
      // Apply snapping to the insert position
      const snappedX = snapCoord(contextMenu.insertPosition.x)
      const snappedY = snapCoord(contextMenu.insertPosition.y)

      // Insert the new point after the edge index
      const newPoints = [...points]
      newPoints.splice(contextMenu.edgeIndex + 1, 0, { x: snappedX, y: snappedY })
      updateColliderPoints(newPoints)
      setSelectedPointIndex(contextMenu.edgeIndex + 1)
    }
    setContextMenu(null)
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="mb-2 flex gap-3 items-center">
        {/* Collider selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Collider:</span>
          <select
            value={selectedColliderIndex}
            onChange={(e) => setSelectedColliderIndex(Number(e.target.value))}
            className="px-2 py-1 text-sm bg-gray-700 text-gray-200 border border-gray-600 rounded"
          >
            {colliders.map((_, index) => (
              <option key={index} value={index}>
                {index + 1}
              </option>
            ))}
          </select>
          <button
            onClick={addNewCollider}
            className="px-2 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
            title="Add new collider"
          >
            +
          </button>
          <button
            onClick={deleteCollider}
            className="px-2 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
            title="Delete current collider"
            disabled={colliders.length <= 1}
          >
            −
          </button>
        </div>

        {/* Snap to grid */}
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={snapToGrid}
            onChange={(e) => setSnapToGrid(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Snap to Grid</span>
        </label>
      </div>

      <div
        ref={containerRef}
        className="border border-gray-600 rounded overflow-hidden relative flex-1"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            imageRendering: 'pixelated',
            cursor: isPanning ? 'grabbing' : 'crosshair'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />

        {/* Status bar overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-90 border-t border-gray-700 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Canvas:</span>
            <span className="font-mono">{width}×{height}</span>
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Points:</span>
            <span className="font-mono">{points.length}</span>
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Colliders:</span>
            <span className="font-mono">{colliders.length}</span>
          </div>
          {mousePos && (
            <>
              <div className="w-px h-4 bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Cursor:</span>
                <span className="font-mono">{mousePos.x}, {mousePos.y}</span>
              </div>
            </>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Zoom:</span>
            <span className="font-mono">{Math.round(scale * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          {/* Menu */}
          <div
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`
            }}
          >
            {contextMenu.pointIndex !== undefined ? (
              // Show delete option for point
              <button
                onClick={handleDeletePoint}
                className="w-full px-4 py-2 text-sm text-left text-red-400 hover:bg-gray-700 flex items-center gap-2"
              >
                <span>🗑</span>
                <span>Delete Point</span>
              </button>
            ) : (
              // Show insert option for edge
              <button
                onClick={handleInsertPoint}
                className="w-full px-4 py-2 text-sm text-left text-green-400 hover:bg-gray-700 flex items-center gap-2"
              >
                <span>➕</span>
                <span>Add Point</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
