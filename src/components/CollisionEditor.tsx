import { useRef, useEffect, useState } from 'react'
import { PolygonCollider } from '../types'

interface CollisionEditorProps {
  width: number
  height: number
  collision: PolygonCollider | undefined
  onUpdate: (collision: PolygonCollider) => void
  backgroundImage?: HTMLImageElement
  backgroundRect?: { x: number; y: number; width: number; height: number }
}

export const CollisionEditor = ({
  width,
  height,
  collision,
  onUpdate,
  backgroundImage,
  backgroundRect
}: CollisionEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>(
    collision?.points || []
  )
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [scale, setScale] = useState(4) // Zoom scale for better editing

  useEffect(() => {
    if (collision) {
      setPoints(collision.points)
    }
  }, [collision])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size with scale
    canvas.width = width * scale
    canvas.height = height * scale

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height)

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
        backgroundRect.width * scale,
        backgroundRect.height * scale
      )
    } else {
      // Draw checkerboard background
      const gridSize = 8
      for (let y = 0; y < height; y += gridSize) {
        for (let x = 0; x < width; x += gridSize) {
          const isEven = (Math.floor(x / gridSize) + Math.floor(y / gridSize)) % 2 === 0
          ctx.fillStyle = isEven ? '#333' : '#444'
          ctx.fillRect(x * scale, y * scale, gridSize * scale, gridSize * scale)
        }
      }
    }

    // Draw polygon
    if (points.length > 0) {
      // Fill
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'
      ctx.beginPath()
      ctx.moveTo(points[0].x * scale, points[0].y * scale)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * scale, points[i].y * scale)
      }
      ctx.closePath()
      ctx.fill()

      // Stroke
      ctx.strokeStyle = '#0f0'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw points
      points.forEach((point, index) => {
        const isSelected = index === selectedPointIndex
        ctx.fillStyle = isSelected ? '#ff0' : '#0f0'
        ctx.beginPath()
        ctx.arc(point.x * scale, point.y * scale, isSelected ? 6 : 4, 0, Math.PI * 2)
        ctx.fill()

        // Draw point index
        ctx.fillStyle = '#fff'
        ctx.font = '10px monospace'
        ctx.fillText(
          index.toString(),
          point.x * scale + 8,
          point.y * scale - 8
        )
      })
    }

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    for (let x = 0; x <= width; x += 4) {
      ctx.beginPath()
      ctx.moveTo(x * scale, 0)
      ctx.lineTo(x * scale, height * scale)
      ctx.stroke()
    }
    for (let y = 0; y <= height; y += 4) {
      ctx.beginPath()
      ctx.moveTo(0, y * scale)
      ctx.lineTo(width * scale, y * scale)
      ctx.stroke()
    }
  }, [points, selectedPointIndex, width, height, scale, backgroundImage, backgroundRect])

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * height)
    return { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) }
  }

  const findPointAtPosition = (x: number, y: number, threshold = 5): number | null => {
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - x
      const dy = points[i].y - y
      if (Math.sqrt(dx * dx + dy * dy) <= threshold / scale) {
        return i
      }
    }
    return null
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e)
    const pointIndex = findPointAtPosition(x, y)

    if (pointIndex !== null) {
      setSelectedPointIndex(pointIndex)
      setIsDragging(true)
    } else if (e.button === 0) {
      // Left click - add point
      const newPoints = [...points, { x, y }]
      setPoints(newPoints)
      onUpdate({ points: newPoints })
      setSelectedPointIndex(newPoints.length - 1)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || selectedPointIndex === null) return

    const { x, y } = getCanvasCoords(e)
    const newPoints = [...points]
    newPoints[selectedPointIndex] = { x, y }
    setPoints(newPoints)
    onUpdate({ points: newPoints })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedPointIndex !== null) {
        const newPoints = points.filter((_, i) => i !== selectedPointIndex)
        setPoints(newPoints)
        onUpdate({ points: newPoints })
        setSelectedPointIndex(null)
      }
    }
  }

  const clearPolygon = () => {
    setPoints([])
    onUpdate({ points: [] })
    setSelectedPointIndex(null)
  }

  const createRectangle = () => {
    const newPoints = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ]
    setPoints(newPoints)
    onUpdate({ points: newPoints })
  }

  return (
    <div className="panel">
      <h3>Collision Editor</h3>

      <div className="mb-2 flex gap-2 text-xs">
        <button
          onClick={createRectangle}
          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Rectangle
        </button>
        <button
          onClick={clearPolygon}
          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          Clear
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <label className="text-gray-400">Zoom:</label>
          <input
            type="range"
            min="1"
            max="8"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="w-20"
          />
          <span className="text-white">{scale}x</span>
        </div>
      </div>

      <div
        className="border border-gray-600 rounded overflow-hidden"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          style={{ maxWidth: '100%', height: 'auto', imageRendering: 'pixelated' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      <div className="mt-2 text-xs text-gray-400">
        <div>• Click to add points</div>
        <div>• Drag points to move</div>
        <div>• Select & press Delete to remove</div>
        <div className="mt-1">Points: {points.length}</div>
      </div>
    </div>
  )
}
