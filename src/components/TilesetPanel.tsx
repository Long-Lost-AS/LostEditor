import { useRef, useEffect, useState } from 'react'
import { useEditor } from '../context/EditorContext'

export const TilesetPanel = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const {
    tilesets,
    currentTileset,
    setCurrentTileset,
    tilesetImage,
    mapData,
    selectedTileX,
    selectedTileY,
    setSelectedTile,
    setSelectedTileId,
    setSelectedEntityDefId,
    setSelectedTilesetId
  } = useEditor()

  const [viewMode, setViewMode] = useState<'tiles' | 'entities'>('tiles')

  // Use current tileset or fallback to legacy tileset image
  const displayImage = currentTileset?.imageData || tilesetImage

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !displayImage) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = displayImage.width
    canvas.height = displayImage.height

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw tileset image
    ctx.drawImage(displayImage, 0, 0)

    // Draw grid
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1

    const tileWidth = currentTileset?.tileWidth || mapData.tileWidth
    const tileHeight = currentTileset?.tileHeight || mapData.tileHeight

    for (let x = 0; x <= displayImage.width; x += tileWidth) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, displayImage.height)
      ctx.stroke()
    }

    for (let y = 0; y <= displayImage.height; y += tileHeight) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(displayImage.width, y)
      ctx.stroke()
    }

    // Draw tiles or entities based on view mode
    if (currentTileset) {
      if (viewMode === 'tiles') {
        // Highlight tile definitions
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'
        ctx.lineWidth = 2
        currentTileset.tiles.forEach(tile => {
          const w = tile.width || tileWidth
          const h = tile.height || tileHeight
          ctx.strokeRect(tile.x, tile.y, w, h)
        })
      } else {
        // Highlight entity definitions
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)'
        ctx.lineWidth = 2
        currentTileset.entities.forEach(entity => {
          ctx.strokeRect(
            entity.sprite.x,
            entity.sprite.y,
            entity.sprite.width,
            entity.sprite.height
          )
          // Draw entity name if it fits
          ctx.fillStyle = 'rgba(255, 0, 255, 0.8)'
          ctx.font = '10px monospace'
          ctx.fillText(entity.id, entity.sprite.x + 2, entity.sprite.y + 12)
        })
      }
    }

    // Draw selection highlight
    ctx.strokeStyle = '#0ff'
    ctx.lineWidth = 3
    ctx.strokeRect(
      selectedTileX * tileWidth,
      selectedTileY * tileHeight,
      tileWidth,
      tileHeight
    )
  }, [displayImage, currentTileset, mapData, selectedTileX, selectedTileY, viewMode])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !displayImage) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const tileWidth = currentTileset?.tileWidth || mapData.tileWidth
    const tileHeight = currentTileset?.tileHeight || mapData.tileHeight

    const tileX = Math.floor(x / tileWidth)
    const tileY = Math.floor(y / tileHeight)

    // Update legacy tile selection
    setSelectedTile(tileX, tileY)

    // If using new tileset system
    if (currentTileset) {
      setSelectedTilesetId(currentTileset.id)

      if (viewMode === 'tiles') {
        // Find clicked tile definition
        const clickedTile = currentTileset.tiles.find(tile => {
          const w = tile.width || tileWidth
          const h = tile.height || tileHeight
          return (
            x >= tile.x &&
            x < tile.x + w &&
            y >= tile.y &&
            y < tile.y + h
          )
        })

        if (clickedTile) {
          setSelectedTileId(clickedTile.id)
          setSelectedEntityDefId(null)
        }
      } else {
        // Find clicked entity definition
        const clickedEntity = currentTileset.entities.find(entity =>
          x >= entity.sprite.x &&
          x < entity.sprite.x + entity.sprite.width &&
          y >= entity.sprite.y &&
          y < entity.sprite.y + entity.sprite.height
        )

        if (clickedEntity) {
          setSelectedEntityDefId(clickedEntity.id)
          setSelectedTileId(null)
        }
      }
    }
  }

  return (
    <div className="panel">
      <h3>Tileset</h3>

      {/* Tileset selector */}
      {tilesets.length > 0 && (
        <div className="mb-2">
          <select
            className="w-full p-1 bg-gray-700 text-white border border-gray-600 rounded"
            value={currentTileset?.id || ''}
            onChange={(e) => {
              const tileset = tilesets.find(t => t.id === e.target.value)
              setCurrentTileset(tileset || null)
            }}
          >
            <option value="">Select Tileset...</option>
            {tilesets.map(tileset => (
              <option key={tileset.id} value={tileset.id}>
                {tileset.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* View mode toggle (only show if tileset has entities) */}
      {currentTileset && currentTileset.entities.length > 0 && (
        <div className="mb-2 flex gap-1">
          <button
            className={`flex-1 px-2 py-1 text-sm rounded ${
              viewMode === 'tiles'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
            onClick={() => setViewMode('tiles')}
          >
            Tiles ({currentTileset.tiles.length})
          </button>
          <button
            className={`flex-1 px-2 py-1 text-sm rounded ${
              viewMode === 'entities'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
            onClick={() => setViewMode('entities')}
          >
            Entities ({currentTileset.entities.length})
          </button>
        </div>
      )}

      {/* Tileset canvas */}
      {displayImage ? (
        <canvas
          ref={canvasRef}
          className="tileset-canvas border border-gray-600"
          onClick={handleClick}
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      ) : (
        <div className="text-gray-400 text-sm p-4 text-center">
          No tileset loaded
        </div>
      )}

      {/* Info display */}
      {currentTileset && (
        <div className="mt-2 text-xs text-gray-400">
          <div>Tiles: {currentTileset.tiles.length}</div>
          <div>Entities: {currentTileset.entities.length}</div>
          <div>Tile Size: {currentTileset.tileWidth}×{currentTileset.tileHeight}</div>
        </div>
      )}
    </div>
  )
}
