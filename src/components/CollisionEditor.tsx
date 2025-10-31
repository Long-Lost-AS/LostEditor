import { useRef, useEffect, useState, useCallback } from 'react'
import { PolygonCollider } from '../types'
import { LightbulbIcon, TrashIcon, PlusIcon } from './Icons'
import { deepEqual } from '../utils/deepEqual'

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

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState<Array<{ x: number; y: number }>>([])

  // Selection state
  const [selectedColliderId, setSelectedColliderId] = useState<string | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Undo/Redo state
  const [history, setHistory] = useState<PolygonCollider[][]>([colliders])
  const [historyIndex, setHistoryIndex] = useState(0)
  const collidersBeforeDrag = useRef<PolygonCollider[] | null>(null)

  // Pan/zoom state
  const [isPanning, setIsPanning] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(4)
  const [pan, setPan] = useState({ x: 50, y: 50 })
  const [snapToGrid, setSnapToGrid] = useState(true)

  // UI state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    colliderId: string
    pointIndex?: number
    edgeIndex?: number
    insertPosition?: { x: number; y: number }
  } | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [editingColliderName, setEditingColliderName] = useState(false)
  const [editingColliderType, setEditingColliderType] = useState(false)

  // Refs for event handlers
  const panRef = useRef(pan)
  const scaleRef = useRef(scale)

  useEffect(() => {
    panRef.current = pan
    scaleRef.current = scale
  }, [pan, scale])

  // Ensure all colliders have IDs and remove invalid colliders
  useEffect(() => {
    let needsUpdate = false
    let updated = [...colliders]

    // Remove colliders with 0 points (invalid)
    const validColliders = updated.filter(c => c.points.length > 0)
    if (validColliders.length !== updated.length) {
      updated = validColliders
      needsUpdate = true
    }

    // Ensure all colliders have IDs
    const needsIds = updated.some(c => !c.id)
    if (needsIds) {
      updated = updated.map((c, index) => ({
        ...c,
        id: c.id || `collider-${Date.now()}-${index}`
      }))
      needsUpdate = true
    }

    if (needsUpdate) {
      onUpdate(updated)
    }
  }, [colliders])

  const getSelectedCollider = () => {
    return colliders.find(c => c.id === selectedColliderId)
  }

  // Push to history when colliders change
  const updateCollidersWithHistory = (newColliders: PolygonCollider[]) => {
    // Check if colliders actually changed (deep comparison)
    const currentColliders = history[historyIndex]
    if (deepEqual(currentColliders, newColliders)) {
      return // No change, don't add to history
    }

    // Remove any history after current index (when making new changes after undo)
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newColliders)

    // Limit history to 50 entries
    if (newHistory.length > 50) {
      newHistory.shift()
    } else {
      setHistoryIndex(historyIndex + 1)
    }

    setHistory(newHistory)
    onUpdate(newColliders)
  }

  // Just push to history without calling onUpdate (for use after dragging)
  const pushToHistory = (newColliders: PolygonCollider[]) => {
    // Check if colliders actually changed
    const currentColliders = history[historyIndex]
    if (deepEqual(currentColliders, newColliders)) {
      return // No change, don't add to history
    }

    // Remove any history after current index
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newColliders)

    // Limit history to 50 entries
    if (newHistory.length > 50) {
      newHistory.shift()
    } else {
      setHistoryIndex(historyIndex + 1)
    }

    setHistory(newHistory)
  }

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      onUpdate(history[newIndex])
    }
  }, [historyIndex, history, onUpdate])

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      onUpdate(history[newIndex])
    }
  }, [historyIndex, history, onUpdate])

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.save()
      ctx.translate(pan.x, pan.y)
      ctx.scale(scale, scale)

      // Draw background
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
        const gridSize = 8
        for (let y = 0; y < height; y += gridSize) {
          for (let x = 0; x < width; x += gridSize) {
            const isEven = (Math.floor(x / gridSize) + Math.floor(y / gridSize)) % 2 === 0
            ctx.fillStyle = isEven ? '#333' : '#444'
            ctx.fillRect(x, y, gridSize, gridSize)
          }
        }
      }

      // Draw completed colliders
      colliders.forEach((collider) => {
        if (collider.points.length === 0) return

        const isSelected = collider.id === selectedColliderId

        // Fill
        ctx.fillStyle = isSelected ? 'rgba(255, 0, 255, 0.25)' : 'rgba(255, 0, 255, 0.1)'
        ctx.beginPath()
        ctx.moveTo(collider.points[0].x, collider.points[0].y)
        for (let i = 1; i < collider.points.length; i++) {
          ctx.lineTo(collider.points[i].x, collider.points[i].y)
        }
        ctx.closePath()
        ctx.fill()

        // Stroke
        ctx.strokeStyle = isSelected ? 'rgba(255, 0, 255, 0.9)' : 'rgba(255, 0, 255, 0.5)'
        ctx.lineWidth = 2 / scale
        ctx.stroke()

        // Draw control points for selected collider
        if (isSelected) {
          collider.points.forEach((point, index) => {
            const isPointSelected = index === selectedPointIndex
            ctx.fillStyle = isPointSelected ? 'rgba(255, 255, 0, 0.9)' : 'rgba(255, 0, 255, 0.9)'
            ctx.beginPath()
            ctx.arc(point.x, point.y, (isPointSelected ? 6 : 4) / scale, 0, Math.PI * 2)
            ctx.fill()

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

      // Draw in-progress polygon
      if (isDrawing && drawingPoints.length > 0) {
        // Draw lines
        ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)'
        ctx.lineWidth = 2 / scale
        ctx.beginPath()
        ctx.moveTo(drawingPoints[0].x, drawingPoints[0].y)
        for (let i = 1; i < drawingPoints.length; i++) {
          ctx.lineTo(drawingPoints[i].x, drawingPoints[i].y)
        }
        ctx.stroke()

        // Draw points
        drawingPoints.forEach((point, index) => {
          ctx.fillStyle = index === 0 ? 'rgba(255, 100, 100, 0.9)' : 'rgba(100, 150, 255, 0.9)'
          ctx.beginPath()
          ctx.arc(point.x, point.y, (index === 0 ? 6 : 4) / scale, 0, Math.PI * 2)
          ctx.fill()
        })

        // Highlight first point if we have at least 3 points
        if (drawingPoints.length >= 3) {
          ctx.strokeStyle = 'rgba(255, 100, 100, 0.9)'
          ctx.lineWidth = 3 / scale
          ctx.beginPath()
          ctx.arc(drawingPoints[0].x, drawingPoints[0].y, 8 / scale, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Draw 1px grid
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
    return () => window.removeEventListener('resize', draw)
  }, [colliders, selectedColliderId, selectedPointIndex, isDrawing, drawingPoints, width, height, scale, pan, backgroundImage, backgroundRect])

  // Setup wheel event listener for zoom and pan
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        const rect = container.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const worldX = (mouseX - panRef.current.x) / scaleRef.current
        const worldY = (mouseY - panRef.current.y) / scaleRef.current

        const delta = -e.deltaY * 0.01
        const newScale = Math.max(0.5, Math.min(16, scaleRef.current + delta))

        const newPanX = mouseX - worldX * newScale
        const newPanY = mouseY - worldY * newScale

        setPan({ x: newPanX, y: newPanY })
        setScale(newScale)
      } else {
        setPan({
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY
        })
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  // Setup keyboard shortcuts at document level - stable handler using callbacks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
        return
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo]) // Use stable callbacks instead of history state

  const snapCoord = (value: number) => {
    return snapToGrid ? Math.round(value) : value
  }

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>, applySnap = true) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    const canvasX = (screenX - pan.x) / scale
    const canvasY = (screenY - pan.y) / scale

    const finalX = applySnap ? snapCoord(canvasX) : canvasX
    const finalY = applySnap ? snapCoord(canvasY) : canvasY

    return {
      x: Math.max(0, Math.min(width, finalX)),
      y: Math.max(0, Math.min(height, finalY))
    }
  }

  const findPointAtPosition = (points: Array<{ x: number; y: number }>, x: number, y: number): number | null => {
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

  const findColliderAtPosition = (x: number, y: number): string | null => {
    // Check in reverse order (top to bottom)
    for (let i = colliders.length - 1; i >= 0; i--) {
      const collider = colliders[i]
      if (collider.points.length < 3) continue

      // Point-in-polygon test
      let inside = false
      for (let j = 0, k = collider.points.length - 1; j < collider.points.length; k = j++) {
        const xi = collider.points[j].x
        const yi = collider.points[j].y
        const xj = collider.points[k].x
        const yj = collider.points[k].y

        const intersect = ((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
      }

      if (inside && collider.id) {
        return collider.id
      }
    }
    return null
  }

  const findEdgeAtPosition = (points: Array<{ x: number; y: number }>, x: number, y: number): { edgeIndex: number; insertPosition: { x: number; y: number } } | null => {
    if (points.length < 2) return null

    const threshold = 8 / scale

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i]
      const p2 = points[(i + 1) % points.length]

      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const lengthSquared = dx * dx + dy * dy

      if (lengthSquared === 0) continue

      const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSquared))
      const projX = p1.x + t * dx
      const projY = p1.y + t * dy

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
      setIsPanning(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    } else if (e.button === 0) {
      const coords = getCanvasCoords(e, false)

      if (isDrawing) {
        // Drawing mode: add points
        const snapped = getCanvasCoords(e, true)

        // Check if clicking near first point to close polygon
        if (drawingPoints.length >= 3) {
          const firstPoint = drawingPoints[0]
          const dx = snapped.x - firstPoint.x
          const dy = snapped.y - firstPoint.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance <= 8 / scale) {
            // Close the polygon
            const newCollider: PolygonCollider = {
              id: `collider-${Date.now()}`,
              points: drawingPoints
            }
            updateCollidersWithHistory([...colliders, newCollider])
            setDrawingPoints([])
            setIsDrawing(false)
            setSelectedColliderId(newCollider.id!)
            return
          }
        }

        // Add new point
        setDrawingPoints([...drawingPoints, snapped])
      } else {
        // Edit mode: select or drag
        const selectedCollider = getSelectedCollider()

        if (selectedCollider) {
          // Check if clicking on a point of selected collider
          const pointIndex = findPointAtPosition(selectedCollider.points, coords.x, coords.y)
          if (pointIndex !== null) {
            setSelectedPointIndex(pointIndex)
            setIsDragging(true)
            collidersBeforeDrag.current = colliders // Store state before dragging
            return
          }
        }

        // Check if clicking on any collider
        const colliderId = findColliderAtPosition(coords.x, coords.y)
        if (colliderId) {
          setSelectedColliderId(colliderId)
          setSelectedPointIndex(null)
        } else {
          setSelectedColliderId(null)
          setSelectedPointIndex(null)
        }
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e, false)
    setMousePos({ x: Math.floor(x), y: Math.floor(y) })

    if (isPanning) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else if (isDragging && selectedPointIndex !== null && selectedColliderId) {
      const snappedCoords = getCanvasCoords(e)
      const newColliders = colliders.map(c => {
        if (c.id === selectedColliderId) {
          const newPoints = [...c.points]
          newPoints[selectedPointIndex] = { x: snappedCoords.x, y: snappedCoords.y }
          return { ...c, points: newPoints }
        }
        return c
      })
      onUpdate(newColliders)
    }
  }

  const handleMouseUp = () => {
    if (isDragging && collidersBeforeDrag.current) {
      // Push to history after dragging is done (don't call onUpdate, it's already been called during dragging)
      pushToHistory(colliders)
      collidersBeforeDrag.current = null
    }
    setIsDragging(false)
    setIsPanning(false)
  }

  const handleLocalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isDrawing) {
        setIsDrawing(false)
        setDrawingPoints([])
      } else {
        setSelectedColliderId(null)
        setSelectedPointIndex(null)
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedPointIndex !== null && selectedColliderId) {
        const collider = getSelectedCollider()
        if (collider && collider.points.length > 3) {
          const newPoints = collider.points.filter((_, i) => i !== selectedPointIndex)
          const newColliders = colliders.map(c =>
            c.id === selectedColliderId ? { ...c, points: newPoints } : c
          )
          updateCollidersWithHistory(newColliders)
          setSelectedPointIndex(null)
        }
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()

    if (isDrawing) return // No context menu while drawing

    const unsnappedCoords = getCanvasCoords(e, false)

    // Check all colliders for points first (highest priority)
    for (const collider of colliders) {
      const pointIndex = findPointAtPosition(collider.points, unsnappedCoords.x, unsnappedCoords.y)
      if (pointIndex !== null && collider.id) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          colliderId: collider.id,
          pointIndex
        })
        return
      }
    }

    // Check all colliders for edges (second priority)
    for (const collider of colliders) {
      const edge = findEdgeAtPosition(collider.points, unsnappedCoords.x, unsnappedCoords.y)
      if (edge && collider.id) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          colliderId: collider.id,
          edgeIndex: edge.edgeIndex,
          insertPosition: edge.insertPosition
        })
        return
      }
    }

    // Find which collider we're on (third priority)
    const colliderId = findColliderAtPosition(unsnappedCoords.x, unsnappedCoords.y)

    if (!colliderId) {
      // Right-click on empty space - offer to create new collider
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        colliderId: '',
        insertPosition: unsnappedCoords
      })
      return
    }

    // Right-click on collider but not on point or edge - offer to delete
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      colliderId
    })
  }

  const handleDeletePoint = () => {
    if (contextMenu && contextMenu.pointIndex !== undefined) {
      const collider = colliders.find(c => c.id === contextMenu.colliderId)
      if (collider && collider.points.length > 3) {
        const newPoints = collider.points.filter((_, i) => i !== contextMenu.pointIndex)
        const newColliders = colliders.map(c =>
          c.id === contextMenu.colliderId ? { ...c, points: newPoints } : c
        )
        updateCollidersWithHistory(newColliders)
      }
    }
    setContextMenu(null)
  }

  const handleInsertPoint = () => {
    if (contextMenu && contextMenu.edgeIndex !== undefined && contextMenu.insertPosition) {
      const snappedX = snapCoord(contextMenu.insertPosition.x)
      const snappedY = snapCoord(contextMenu.insertPosition.y)

      const newColliders = colliders.map(c => {
        if (c.id === contextMenu.colliderId) {
          const newPoints = [...c.points]
          newPoints.splice(contextMenu.edgeIndex! + 1, 0, { x: snappedX, y: snappedY })
          return { ...c, points: newPoints }
        }
        return c
      })
      updateCollidersWithHistory(newColliders)
      setSelectedColliderId(contextMenu.colliderId)
      setSelectedPointIndex(contextMenu.edgeIndex! + 1)
    }
    setContextMenu(null)
  }

  const handleNewCollider = () => {
    setIsDrawing(true)
    setDrawingPoints([])
    setSelectedColliderId(null)
    setSelectedPointIndex(null)
    setContextMenu(null)
  }

  const handleDeleteCollider = () => {
    const colliderIdToDelete = contextMenu?.colliderId || selectedColliderId
    if (colliderIdToDelete) {
      const newColliders = colliders.filter(c => c.id !== colliderIdToDelete)
      updateCollidersWithHistory(newColliders)
      setSelectedColliderId(null)
    }
    setContextMenu(null)
  }

  const handleUpdateColliderName = (name: string) => {
    if (selectedColliderId) {
      const newColliders = colliders.map(c =>
        c.id === selectedColliderId ? { ...c, name } : c
      )
      updateCollidersWithHistory(newColliders)
    }
  }

  const handleUpdateColliderType = (type: string) => {
    if (selectedColliderId) {
      const newColliders = colliders.map(c =>
        c.id === selectedColliderId ? { ...c, type } : c
      )
      updateCollidersWithHistory(newColliders)
    }
  }

  const selectedCollider = getSelectedCollider()

  return (
    <div className="w-full h-full flex">
      {/* Left Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Controls */}
        <div className="p-4 border-b border-gray-700">
          {/* Undo/Redo buttons */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                canUndo
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                canRedo
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Shift+Z)"
            >
              ↷ Redo
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-gray-200 transition-colors">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span>Snap to Grid</span>
          </label>

          {/* Drawing hint */}
          {isDrawing && drawingPoints.length >= 3 && (
            <div className="mt-3 p-2.5 bg-blue-500 bg-opacity-20 border border-blue-500 border-opacity-40 rounded text-xs text-blue-300 leading-relaxed flex items-center gap-2">
              <LightbulbIcon size={14} />
              <span>Click first point to close</span>
            </div>
          )}

          {/* Instructions */}
          {!isDrawing && (
            <div className="mt-3 p-2.5 bg-gray-700 bg-opacity-50 rounded text-xs text-gray-400 leading-relaxed">
              Right-click on canvas to create or delete colliders
            </div>
          )}
        </div>

        {/* Properties panel for selected collider */}
        {selectedCollider && !isDrawing && (
          <div className="p-4 border-b border-gray-700 space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Properties
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Name</label>
              {editingColliderName ? (
                <input
                  type="text"
                  defaultValue={selectedCollider.name || ''}
                  onBlur={(e) => {
                    handleUpdateColliderName(e.target.value)
                    setEditingColliderName(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateColliderName(e.currentTarget.value)
                      setEditingColliderName(false)
                    } else if (e.key === 'Escape') {
                      setEditingColliderName(false)
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-700 text-gray-200 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => setEditingColliderName(true)}
                  className="px-2.5 py-1.5 text-xs bg-gray-700 text-gray-200 rounded cursor-pointer hover:bg-gray-650 transition-colors border border-transparent hover:border-gray-600"
                >
                  {selectedCollider.name || '(none)'}
                </div>
              )}
            </div>
            <div>
              <label className="text-gray-400 text-xs font-medium block mb-1.5">Type</label>
              {editingColliderType ? (
                <input
                  type="text"
                  defaultValue={selectedCollider.type || ''}
                  onBlur={(e) => {
                    handleUpdateColliderType(e.target.value)
                    setEditingColliderType(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateColliderType(e.currentTarget.value)
                      setEditingColliderType(false)
                    } else if (e.key === 'Escape') {
                      setEditingColliderType(false)
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-700 text-gray-200 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => setEditingColliderType(true)}
                  className="px-2.5 py-1.5 text-xs bg-gray-700 text-gray-200 rounded cursor-pointer hover:bg-gray-650 transition-colors border border-transparent hover:border-gray-600"
                >
                  {selectedCollider.type || '(none)'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Collider List */}
        {!isDrawing && colliders.length > 0 && (
          <div className="flex-1 overflow-auto p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Colliders ({colliders.length})
            </div>
            <div className="space-y-1.5">
              {colliders.map((collider, index) => (
                <div
                  key={collider.id}
                  onClick={() => {
                    setSelectedColliderId(collider.id!)
                    setSelectedPointIndex(null)
                  }}
                  className={`px-3 py-2 rounded cursor-pointer transition-all ${
                    collider.id === selectedColliderId
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-650 border border-transparent hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium text-xs truncate">
                    {collider.name || collider.id || `Collider ${index + 1}`}
                  </div>
                  {collider.type && (
                    <div className={`text-xs mt-0.5 ${
                      collider.id === selectedColliderId ? 'text-green-100' : 'text-gray-500'
                    }`}>
                      {collider.type}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Side - Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onKeyDown={handleLocalKeyDown}
        tabIndex={0}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            imageRendering: 'pixelated',
            cursor: isPanning ? 'grabbing' : isDrawing ? 'crosshair' : 'default'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />

        {/* Status bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-90 border-t border-gray-700 px-3 py-1.5 flex items-center gap-4 text-xs text-gray-300">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Canvas:</span>
            <span className="font-mono">{width}×{height}</span>
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Colliders:</span>
            <span className="font-mono">{colliders.length}</span>
          </div>
          {selectedCollider && (
            <>
              <div className="w-px h-4 bg-gray-700" />
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Points:</span>
                <span className="font-mono">{selectedCollider.points.length}</span>
              </div>
            </>
          )}
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
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`
            }}
          >
            {contextMenu.colliderId === '' ? (
              // Empty space - New Collider only
              <button
                onClick={handleNewCollider}
                className="w-full px-4 py-2 text-sm text-left text-blue-400 hover:bg-gray-700 flex items-center gap-2"
              >
                <span>➕</span>
                <span>New Collider</span>
              </button>
            ) : (
              // On a collider - show relevant options
              <>
                {contextMenu.pointIndex !== undefined && (
                  <button
                    onClick={handleDeletePoint}
                    className="w-full px-4 py-2 text-sm text-left text-orange-400 hover:bg-gray-700 flex items-center gap-2"
                  >
                    <TrashIcon size={16} />
                    <span>Delete Point</span>
                  </button>
                )}
                {contextMenu.edgeIndex !== undefined && (
                  <button
                    onClick={handleInsertPoint}
                    className="w-full px-4 py-2 text-sm text-left text-green-400 hover:bg-gray-700 flex items-center gap-2"
                  >
                    <PlusIcon size={16} />
                    <span>Add Point</span>
                  </button>
                )}
                {contextMenu.colliderId && (
                  <button
                    onClick={handleDeleteCollider}
                    className="w-full px-4 py-2 text-sm text-left text-red-400 hover:bg-gray-700 flex items-center gap-2"
                  >
                    <TrashIcon size={16} />
                    <span>Delete Collider</span>
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
