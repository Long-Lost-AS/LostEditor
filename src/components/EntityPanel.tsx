import { useState } from 'react'
import { useEditor } from '../context/EditorContext'
import { EntityDefinition } from '../types'
import { entityManager } from '../managers/EntityManager'
import { ShieldIcon } from './Icons'

interface EntityTreeNodeProps {
  entity: EntityDefinition
  depth: number
  tilesetId: string
  onSelect: (tilesetId: string, entityId: string) => void
  selectedEntityDefId: string | null
}

const EntityTreeNode = ({ entity, depth, tilesetId, onSelect, selectedEntityDefId }: EntityTreeNodeProps) => {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = entity.children && entity.children.length > 0
  const isSelected = selectedEntityDefId === entity.id

  return (
    <div>
      <div
        className={`flex items-center py-1 px-2 cursor-pointer rounded hover:bg-gray-700 ${
          isSelected ? 'bg-blue-600' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(tilesetId, entity.id)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="mr-1 text-xs w-4 h-4 flex items-center justify-center hover:bg-gray-600 rounded"
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}
        {!hasChildren && <span className="mr-1 w-4" />}
        <span className="text-sm text-white flex-1 truncate">{entity.id}</span>
        {entity.collision && (
          <span className="ml-1 text-green-400" title="Has collision">
            <ShieldIcon size={14} />
          </span>
        )}
      </div>

      {hasChildren && expanded && (
        <div>
          {entity.children!.map((child, idx) => (
            <EntityTreeNode
              key={`${child.id}-${idx}`}
              entity={child}
              depth={depth + 1}
              tilesetId={tilesetId}
              onSelect={onSelect}
              selectedEntityDefId={selectedEntityDefId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const EntityPanel = () => {
  const {
    tilesets,
    currentTileset,
    selectedEntityDefId,
    setSelectedEntityDefId,
    setSelectedTilesetId,
    setSelectedTileId
  } = useEditor()

  const [filterTilesetId, setFilterTilesetId] = useState<string>('all')

  // Get all entities from all tilesets or filtered
  const allEntities = entityManager.getAllEntityDefinitions()
  const filteredEntities = filterTilesetId === 'all'
    ? allEntities
    : allEntities.filter(e => e.tilesetId === filterTilesetId)

  const handleSelect = (tilesetId: string, entityId: string) => {
    setSelectedTilesetId(tilesetId)
    setSelectedEntityDefId(entityId)
    setSelectedTileId(null) // Clear tile selection
  }

  // Get info about selected entity
  const selectedEntity = selectedEntityDefId && currentTileset
    ? entityManager.getEntityDefinition(currentTileset.id, selectedEntityDefId)
    : null

  return (
    <div className="panel">
      <h3>Entities</h3>

      {/* Tileset filter */}
      {tilesets.length > 1 && (
        <div className="mb-2">
          <select
            className="w-full p-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
            value={filterTilesetId}
            onChange={(e) => setFilterTilesetId(e.target.value)}
          >
            <option value="all">All Tilesets</option>
            {tilesets.map(tileset => (
              <option key={tileset.id} value={tileset.id}>
                {tileset.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Entity tree */}
      {filteredEntities.length > 0 ? (
        <div className="max-h-96 overflow-y-auto border border-gray-700 rounded p-1">
          {filteredEntities.map(({ tilesetId, entity }) => (
            <EntityTreeNode
              key={`${tilesetId}-${entity.id}`}
              entity={entity}
              depth={0}
              tilesetId={tilesetId}
              onSelect={handleSelect}
              selectedEntityDefId={selectedEntityDefId}
            />
          ))}
        </div>
      ) : (
        <div className="text-gray-400 text-sm p-4 text-center">
          No entities available.<br/>
          Load a tileset with entity definitions.
        </div>
      )}

      {/* Selected entity info */}
      {selectedEntity && (
        <div className="mt-3 p-2 bg-gray-800 rounded text-xs">
          <div className="font-semibold text-white mb-1">{selectedEntity.id}</div>
          <div className="text-gray-400 space-y-0.5">
            <div>Sprite: {selectedEntity.sprite.width}×{selectedEntity.sprite.height}</div>
            {selectedEntity.offset && (
              <div>Offset: ({selectedEntity.offset.x}, {selectedEntity.offset.y})</div>
            )}
            {selectedEntity.rotation !== undefined && (
              <div>Rotation: {selectedEntity.rotation}°</div>
            )}
            {selectedEntity.collision && (
              <div className="text-green-400">
                Collision: {selectedEntity.collision.points.length} points
              </div>
            )}
            {selectedEntity.children && selectedEntity.children.length > 0 && (
              <div>Children: {selectedEntity.children.length}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
