import { useEditor } from '../context/EditorContext'
import { entityManager } from '../managers/EntityManager'
import { DragNumberInput } from './DragNumberInput'
import { EntityInstance } from '../types'

interface EntityPropertiesPanelProps {
  selectedEntityId: string | null
  mapData: any
  onUpdateEntity?: (entityId: string, updates: Partial<EntityInstance>) => void
}

export const EntityPropertiesPanel = ({ selectedEntityId, mapData, onUpdateEntity }: EntityPropertiesPanelProps) => {
  const { tilesets } = useEditor()

  if (!selectedEntityId || !mapData.entities) {
    return (
      <div className="p-4 text-gray-500">
        No entity selected
      </div>
    )
  }

  const entity = mapData.entities.find((e: any) => e.id === selectedEntityId)
  if (!entity) {
    return (
      <div className="p-4 text-gray-500">
        Entity not found
      </div>
    )
  }

  const entityDef = entityManager.getEntityDefinition(entity.tilesetId, entity.entityDefId)
  const tileset = tilesets.find(t => t.id === entity.tilesetId)

  const handleUpdatePosition = (x: number, y: number) => {
    onUpdateEntity?.(entity.id, { x, y })
  }

  const handleUpdateRotation = (rotation: number) => {
    onUpdateEntity?.(entity.id, { rotation })
  }

  const handleUpdateScale = (x: number, y: number) => {
    onUpdateEntity?.(entity.id, { scale: { x, y } })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#252526' }}>
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="p-4" style={{ borderBottom: '1px solid #3e3e42' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#cccccc' }}>ENTITY PROPERTIES</h3>
        </div>

        {/* Properties */}
        <div className="p-4 space-y-4">
          {/* Type */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#858585' }}>
              Type
            </label>
            <div className="text-white text-sm px-2.5 py-1.5 rounded" style={{ background: '#3e3e42', color: '#cccccc' }}>
              {entityDef?.name || entity.entityDefId}
            </div>
          </div>

          {/* Tileset */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#858585' }}>
              Tileset
            </label>
            <div className="text-white text-sm px-2.5 py-1.5 rounded" style={{ background: '#3e3e42', color: '#cccccc' }}>
              {tileset?.name || entity.tilesetId}
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#858585' }}>
              Position
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex">
                <div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
                  X
                </div>
                <div className="flex-1">
                  <DragNumberInput
                    value={entity.x}
                    onChange={(x) => handleUpdatePosition(x, entity.y)}
                    onInput={(x) => handleUpdatePosition(x, entity.y)}
                    dragSpeed={1}
                    precision={0}
                    roundedLeft={false}
                  />
                </div>
              </div>
              <div className="flex">
                <div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
                  Y
                </div>
                <div className="flex-1">
                  <DragNumberInput
                    value={entity.y}
                    onChange={(y) => handleUpdatePosition(entity.x, y)}
                    onInput={(y) => handleUpdatePosition(entity.x, y)}
                    dragSpeed={1}
                    precision={0}
                    roundedLeft={false}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Rotation */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#858585' }}>
              Rotation (degrees)
            </label>
            <DragNumberInput
              value={entity.rotation || 0}
              onChange={handleUpdateRotation}
              onInput={handleUpdateRotation}
              dragSpeed={1}
              precision={1}
            />
          </div>

          {/* Scale */}
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: '#858585' }}>
              Scale
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex">
                <div className="text-xs w-6 font-bold bg-red-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
                  X
                </div>
                <div className="flex-1">
                  <DragNumberInput
                    value={entity.scale?.x || 1}
                    onChange={(x) => handleUpdateScale(x, entity.scale?.y || 1)}
                    onInput={(x) => handleUpdateScale(x, entity.scale?.y || 1)}
                    dragSpeed={0.1}
                    precision={2}
                    roundedLeft={false}
                  />
                </div>
              </div>
              <div className="flex">
                <div className="text-xs w-6 font-bold bg-green-500 px-1 py-1.5 text-center flex items-center justify-center rounded-l">
                  Y
                </div>
                <div className="flex-1">
                  <DragNumberInput
                    value={entity.scale?.y || 1}
                    onChange={(y) => handleUpdateScale(entity.scale?.x || 1, y)}
                    onInput={(y) => handleUpdateScale(entity.scale?.x || 1, y)}
                    dragSpeed={0.1}
                    precision={2}
                    roundedLeft={false}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sprite Layers */}
          {entityDef && entityDef.sprites && (
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#858585' }}>
                Sprite Layers
              </label>
              <div className="px-2.5 py-1.5 text-xs rounded" style={{ background: '#3e3e42', color: '#858585' }}>
                {entityDef.sprites.length} layer(s)
              </div>
            </div>
          )}

          {/* Custom Properties */}
          {entity.properties && Object.keys(entity.properties).length > 0 && (
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: '#858585' }}>
                Custom Properties
              </label>
              <div className="space-y-1">
                {Object.entries(entity.properties).map(([key, value]) => (
                  <div key={key} className="px-2.5 py-1.5 text-xs rounded" style={{ background: '#3e3e42' }}>
                    <span className="text-gray-400 font-mono">{key}:</span>
                    <span className="text-white ml-2">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
