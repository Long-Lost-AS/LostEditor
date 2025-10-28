import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { TileDefinition, EntityDefinition, TilesetData } from '../types'
import { fileManager } from '../managers/FileManager'
import { CollisionEditor } from './CollisionEditor'

interface TilesetCreatorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (tilesetPath: string) => Promise<void>
}

type CreationMode = 'tiles' | 'entities'

interface TempTileDefinition extends TileDefinition {
  tempId: number
}

interface TempEntityDefinition extends EntityDefinition {
  tempId: number
}

export const TilesetCreator = ({ isOpen, onClose, onSave }: TilesetCreatorProps) => {
  const [tilesetName, setTilesetName] = useState('New Tileset')
  const [tilesetId, setTilesetId] = useState('new_tileset')
  const [tileWidth, setTileWidth] = useState(16)
  const [tileHeight, setTileHeight] = useState(16)
  const [mode, setMode] = useState<CreationMode>('tiles')
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null)
  const [sourceImagePath, setSourceImagePath] = useState<string>('')
  const [tiles, setTiles] = useState<TempTileDefinition[]>([])
  const [entities, setEntities] = useState<TempEntityDefinition[]>([])
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [isEditingCollision, setIsEditingCollision] = useState(false)
  const [scale, setScale] = useState(2)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null)

  const nextTileId = useRef(1)
  const nextEntityId = useRef(1)

  // Handle image selection
  const handleSelectImage = async () => {
    const result = await invoke<{ canceled: boolean; filePaths?: string[] }>('show_open_dialog', {
      options: {
        title: 'Select Tileset Image',
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] }
        ],
        properties: ['openFile']
      }
    })

    if (result.filePaths && result.filePaths.length > 0) {
      const imagePath = result.filePaths[0]
      setSourceImagePath(imagePath)

      // Load image using Tauri's convertFileSrc
      const img = new Image()
      img.onload = () => {
        setSourceImage(img)
      }
      img.onerror = (err) => {
        console.error('Failed to load image:', err)
        alert('Failed to load image')
      }
      img.src = convertFileSrc(imagePath)
    }
  }

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !sourceImage) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = sourceImage.width * scale
    canvas.height = sourceImage.height * scale

    // Draw image
    ctx.drawImage(sourceImage, 0, 0, sourceImage.width * scale, sourceImage.height * scale)

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 1

    if (mode === 'tiles') {
      // Draw tile grid
      for (let x = 0; x <= sourceImage.width; x += tileWidth) {
        ctx.beginPath()
        ctx.moveTo(x * scale, 0)
        ctx.lineTo(x * scale, sourceImage.height * scale)
        ctx.stroke()
      }
      for (let y = 0; y <= sourceImage.height; y += tileHeight) {
        ctx.beginPath()
        ctx.moveTo(0, y * scale)
        ctx.lineTo(sourceImage.width * scale, y * scale)
        ctx.stroke()
      }

      // Draw existing tiles
      tiles.forEach(tile => {
        const isSelected = selectedItemId === tile.tempId
        ctx.strokeStyle = isSelected ? '#ffff00' : '#00ff00'
        ctx.lineWidth = 2
        ctx.strokeRect(tile.x * scale, tile.y * scale, (tile.width || tileWidth) * scale, (tile.height || tileHeight) * scale)
      })
    } else {
      // Draw existing entities
      entities.forEach(entity => {
        const isSelected = selectedItemId === entity.tempId
        ctx.strokeStyle = isSelected ? '#ffff00' : '#ff00ff'
        ctx.lineWidth = 2
        ctx.strokeRect(entity.sprite.x * scale, entity.sprite.y * scale, entity.sprite.width * scale, entity.sprite.height * scale)
      })
    }

    // Draw current selection
    if (isSelecting && selectionStart && selectionEnd) {
      const x = Math.min(selectionStart.x, selectionEnd.x)
      const y = Math.min(selectionStart.y, selectionEnd.y)
      const w = Math.abs(selectionEnd.x - selectionStart.x)
      const h = Math.abs(selectionEnd.y - selectionStart.y)

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(x * scale, y * scale, w * scale, h * scale)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.fillRect(x * scale, y * scale, w * scale, h * scale)
    }
  }, [sourceImage, scale, tileWidth, tileHeight, mode, tiles, entities, selectedItemId, isSelecting, selectionStart, selectionEnd])

  // Canvas mouse events
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * (sourceImage?.width || 0))
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * (sourceImage?.height || 0))
    return { x, y }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sourceImage) return

    const coords = getCanvasCoords(e)
    setIsSelecting(true)
    setSelectionStart(coords)
    setSelectionEnd(coords)
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !selectionStart) return

    const coords = getCanvasCoords(e)
    setSelectionEnd(coords)
  }

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || !selectionStart || !selectionEnd) return

    const x = Math.min(selectionStart.x, selectionEnd.x)
    const y = Math.min(selectionStart.y, selectionEnd.y)
    const width = Math.abs(selectionEnd.x - selectionStart.x)
    const height = Math.abs(selectionEnd.y - selectionStart.y)

    if (width < 1 || height < 1) {
      // Click without drag - treat as tile grid click in tiles mode
      if (mode === 'tiles') {
        const tileX = Math.floor(selectionStart.x / tileWidth) * tileWidth
        const tileY = Math.floor(selectionStart.y / tileHeight) * tileHeight

        // Check if tile already exists at this position
        const existingTile = tiles.find(t => t.x === tileX && t.y === tileY)
        if (!existingTile) {
          const newTile: TempTileDefinition = {
            tempId: nextTileId.current++,
            id: `tile_${nextTileId.current}`,
            x: tileX,
            y: tileY,
            width: tileWidth,
            height: tileHeight
          }
          setTiles([...tiles, newTile])
          setSelectedItemId(newTile.tempId)
        } else {
          setSelectedItemId(existingTile.tempId)
        }
      }
    } else {
      // Drag selection
      if (mode === 'tiles') {
        // Auto-create tiles in selected area
        const newTiles: TempTileDefinition[] = []
        for (let ty = y; ty < y + height; ty += tileHeight) {
          for (let tx = x; tx < x + width; tx += tileWidth) {
            const tileX = Math.floor(tx / tileWidth) * tileWidth
            const tileY = Math.floor(ty / tileHeight) * tileHeight
            const existingTile = tiles.find(t => t.x === tileX && t.y === tileY)
            if (!existingTile) {
              newTiles.push({
                tempId: nextTileId.current++,
                id: `tile_${nextTileId.current}`,
                x: tileX,
                y: tileY,
                width: tileWidth,
                height: tileHeight
              })
            }
          }
        }
        if (newTiles.length > 0) {
          setTiles([...tiles, ...newTiles])
        }
      } else {
        // Create entity
        const newEntity: TempEntityDefinition = {
          tempId: nextEntityId.current++,
          id: `entity_${nextEntityId.current}`,
          sprite: { x, y, width, height }
        }
        setEntities([...entities, newEntity])
        setSelectedItemId(newEntity.tempId)
      }
    }

    setIsSelecting(false)
    setSelectionStart(null)
    setSelectionEnd(null)
  }

  // Delete selected item
  const handleDelete = () => {
    if (selectedItemId === null) return

    if (mode === 'tiles') {
      setTiles(tiles.filter(t => t.tempId !== selectedItemId))
    } else {
      setEntities(entities.filter(e => e.tempId !== selectedItemId))
    }
    setSelectedItemId(null)
  }

  // Get selected item
  const getSelectedItem = (): TempTileDefinition | TempEntityDefinition | null => {
    if (selectedItemId === null) return null

    if (mode === 'tiles') {
      return tiles.find(t => t.tempId === selectedItemId) || null
    } else {
      return entities.find(e => e.tempId === selectedItemId) || null
    }
  }

  // Update selected item collision
  const handleCollisionUpdate = (collision: { points: Array<{ x: number; y: number }> }) => {
    if (selectedItemId === null) return

    if (mode === 'tiles') {
      setTiles(tiles.map(t => t.tempId === selectedItemId ? { ...t, collision } : t))
    } else {
      setEntities(entities.map(e => e.tempId === selectedItemId ? { ...e, collision } : e))
    }
  }

  // Save tileset
  const handleSave = async () => {
    if (!sourceImage || !sourceImagePath) {
      alert('Please select an image first')
      return
    }

    if (tiles.length === 0 && entities.length === 0) {
      alert('Please define at least one tile or entity')
      return
    }

    // Show save dialog
    const result = await invoke<{ canceled: boolean; filePath?: string }>('show_save_dialog', {
      options: {
        title: 'Save Tileset',
        defaultPath: `${tilesetId}.lostset`,
        filters: [
          { name: 'Lost Editor Tileset', extensions: ['lostset'] }
        ]
      }
    })

    if (!result.filePath) return

    // Calculate relative image path
    const tilesetDir = fileManager.dirname(result.filePath)
    fileManager.setProjectDir(tilesetDir)
    const relativeImagePath = fileManager.makeRelative(sourceImagePath)

    // Remove tempId from tiles and entities
    const finalTiles: TileDefinition[] = tiles.map(({ tempId, ...tile }) => tile)
    const finalEntities: EntityDefinition[] = entities.map(({ tempId, ...entity }) => entity)

    const tilesetData: TilesetData = {
      version: '2.0',
      name: tilesetName,
      id: tilesetId,
      imagePath: relativeImagePath,
      tileWidth,
      tileHeight,
      tiles: finalTiles,
      entities: finalEntities
    }

    // Write file
    const jsonContent = JSON.stringify(tilesetData, null, 2)

    try {
      await writeTextFile(result.filePath, jsonContent)
      // Pass the file path so it can be auto-loaded
      await onSave(result.filePath)
      onClose()
    } catch (error) {
      alert(`Failed to save tileset: ${error}`)
    }
  }

  if (!isOpen) return null

  const selectedItem = getSelectedItem()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-11/12 h-5/6 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">New Tileset</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Configuration */}
          <div className="w-64 border-r border-gray-700 p-4 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Tileset Name
                </label>
                <input
                  type="text"
                  value={tilesetName}
                  onChange={(e) => setTilesetName(e.target.value)}
                  className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Tileset ID
                </label>
                <input
                  type="text"
                  value={tilesetId}
                  onChange={(e) => setTilesetId(e.target.value)}
                  className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Source Image
                </label>
                <button
                  onClick={handleSelectImage}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                >
                  {sourceImage ? 'Change Image' : 'Select Image'}
                </button>
                {sourceImagePath && (
                  <div className="mt-1 text-xs text-gray-400 truncate">
                    {fileManager.basename(sourceImagePath)}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Tile Width
                  </label>
                  <input
                    type="number"
                    value={tileWidth}
                    onChange={(e) => setTileWidth(parseInt(e.target.value) || 16)}
                    className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Tile Height
                  </label>
                  <input
                    type="number"
                    value={tileHeight}
                    onChange={(e) => setTileHeight(parseInt(e.target.value) || 16)}
                    className="w-full px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode('tiles')}
                    className={`flex-1 px-3 py-2 rounded text-sm ${
                      mode === 'tiles'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Tiles ({tiles.length})
                  </button>
                  <button
                    onClick={() => setMode('entities')}
                    className={`flex-1 px-3 py-2 rounded text-sm ${
                      mode === 'entities'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Entities ({entities.length})
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Zoom
                </label>
                <input
                  type="range"
                  min="1"
                  max="4"
                  value={scale}
                  onChange={(e) => setScale(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-400 text-center">{scale}x</div>
              </div>

              <div className="pt-4 border-t border-gray-700">
                <button
                  onClick={handleSave}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium"
                >
                  Save Tileset
                </button>
                <button
                  onClick={onClose}
                  className="w-full mt-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* Center Panel - Canvas */}
          <div className="flex-1 overflow-auto bg-gray-900 relative">
            {sourceImage ? (
              <canvas
                ref={canvasRef}
                className="cursor-crosshair"
                style={{ imageRendering: 'pixelated' }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                Select an image to get started
              </div>
            )}
          </div>

          {/* Right Panel - Item List */}
          <div className="w-64 border-l border-gray-700 p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-2">
              {mode === 'tiles' ? 'Tiles' : 'Entities'}
            </h3>

            {mode === 'tiles' ? (
              <div className="space-y-1">
                {tiles.map(tile => (
                  <div
                    key={tile.tempId}
                    onClick={() => setSelectedItemId(tile.tempId)}
                    className={`p-2 rounded cursor-pointer text-sm ${
                      selectedItemId === tile.tempId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <div className="font-medium">{tile.id}</div>
                    <div className="text-xs opacity-75">
                      {tile.width || tileWidth}×{tile.height || tileHeight} @ ({tile.x},{tile.y})
                    </div>
                    {tile.collision && (
                      <div className="text-xs text-green-400">Has collision</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {entities.map(entity => (
                  <div
                    key={entity.tempId}
                    onClick={() => setSelectedItemId(entity.tempId)}
                    className={`p-2 rounded cursor-pointer text-sm ${
                      selectedItemId === entity.tempId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <div className="font-medium">{entity.id}</div>
                    <div className="text-xs opacity-75">
                      {entity.sprite.width}×{entity.sprite.height}
                    </div>
                    {entity.collision && (
                      <div className="text-xs text-green-400">Has collision</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedItem && (
              <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                <button
                  onClick={() => setIsEditingCollision(true)}
                  className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                >
                  {selectedItem.collision ? 'Edit Collision' : 'Add Collision'}
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collision Editor Modal */}
      {isEditingCollision && selectedItem && sourceImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-4 rounded-lg">
            <CollisionEditor
              width={'sprite' in selectedItem ? selectedItem.sprite.width : (selectedItem.width || tileWidth)}
              height={'sprite' in selectedItem ? selectedItem.sprite.height : (selectedItem.height || tileHeight)}
              collision={selectedItem.collision}
              onUpdate={handleCollisionUpdate}
              backgroundImage={sourceImage}
              backgroundRect={{
                x: 'sprite' in selectedItem ? selectedItem.sprite.x : selectedItem.x,
                y: 'sprite' in selectedItem ? selectedItem.sprite.y : selectedItem.y,
                width: 'sprite' in selectedItem ? selectedItem.sprite.width : (selectedItem.width || tileWidth),
                height: 'sprite' in selectedItem ? selectedItem.sprite.height : (selectedItem.height || tileHeight)
              }}
            />
            <button
              onClick={() => setIsEditingCollision(false)}
              className="mt-4 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
