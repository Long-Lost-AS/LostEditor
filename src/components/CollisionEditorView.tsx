import { useEffect, useMemo } from 'react'
import { useEditor } from '../context/EditorContext'
import { CollisionEditorTab, PolygonCollider, EntityEditorTab } from '../types'
import { CollisionEditor } from './CollisionEditor'

interface CollisionEditorViewProps {
  tab: CollisionEditorTab
}

export const CollisionEditorView = ({ tab }: CollisionEditorViewProps) => {
  const { getTilesetById, updateTileset, updateTabData, tabs } = useEditor()

  // Fetch the source data based on sourceType
  const sourceData = useMemo(() => {
    if (tab.sourceType === 'tile') {
      const tileset = getTilesetById(tab.sourceId)
      if (!tileset) return null

      const tile = tileset.tiles.find(t => t.id === tab.tileId)
      if (!tile) return null

      return {
        type: 'tile' as const,
        tileset,
        tile,
        width: tile.width,
        height: tile.height,
        colliders: tile.colliders || [],
        backgroundImage: tileset.imageData,
        backgroundRect: {
          x: tile.x,
          y: tile.y,
          width: tile.width,
          height: tile.height
        }
      }
    } else {
      // Find the entity tab
      const entityTab = tab.sourceTabId
        ? tabs.find(t => t.id === tab.sourceTabId) as EntityEditorTab | undefined
        : null

      if (!entityTab || entityTab.type !== 'entity-editor') return null

      const entity = entityTab.entityData

      // Calculate bounding box for entity
      const bbox = entity.spriteLayer
        ? {
            x: entity.spriteLayer.x,
            y: entity.spriteLayer.y,
            width: entity.spriteLayer.width,
            height: entity.spriteLayer.height
          }
        : { x: 0, y: 0, width: 32, height: 32 }

      return {
        type: 'entity' as const,
        entityTab,
        entity,
        width: Math.max(bbox.width, 1),
        height: Math.max(bbox.height, 1),
        colliders: entity.colliders || [],
        backgroundImage: entity.spriteLayer?.imageData,
        backgroundRect: bbox
      }
    }
  }, [tab.sourceType, tab.sourceId, tab.sourceTabId, tab.tileId, getTilesetById, tabs])

  // Show error if source not found
  if (!sourceData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-red-400">
          {tab.sourceType === 'tile' ? 'Tile not found' : 'Entity not found'}
        </div>
      </div>
    )
  }

  // Handle collision updates
  const handleCollisionUpdate = (colliders: PolygonCollider[]) => {
    if (sourceData.type === 'tile') {
      const { tileset, tile } = sourceData
      const updatedTiles = tileset.tiles.map(t =>
        t.id === tile.id ? { ...t, colliders } : t
      )
      updateTileset(tileset.id, { tiles: updatedTiles })
    } else {
      const { entityTab, entity } = sourceData
      updateTabData(entityTab.id, {
        entityData: {
          ...entity,
          colliders
        }
      })
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-gray-900">
      <CollisionEditor
        width={sourceData.width}
        height={sourceData.height}
        colliders={sourceData.colliders}
        onUpdate={handleCollisionUpdate}
        backgroundImage={sourceData.backgroundImage}
        backgroundRect={sourceData.backgroundRect}
      />
    </div>
  )
}
