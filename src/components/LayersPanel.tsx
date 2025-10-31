import { useState } from 'react'
import { useEditor } from '../context/EditorContext'

export const LayersPanel = () => {
  const {
    mapData,
    currentLayer,
    setCurrentLayer,
    addLayer,
    removeLayer,
    updateLayerVisibility,
    updateLayerName,
    updateLayerAutotiling
  } = useEditor()

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleDoubleClick = (layer: any) => {
    setEditingLayerId(layer.id)
    setEditingName(layer.name)
  }

  const handleNameSubmit = (layerId: string) => {
    if (editingName.trim()) {
      updateLayerName(layerId, editingName.trim())
    }
    setEditingLayerId(null)
    setEditingName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent, layerId: string) => {
    if (e.key === 'Enter') {
      handleNameSubmit(layerId)
    } else if (e.key === 'Escape') {
      setEditingLayerId(null)
      setEditingName('')
    }
  }

  return (
    <div className="panel">
      <h3>Layers</h3>
      <div className="layers-list">
        {mapData.layers.map((layer) => (
          <div
            key={layer.id}
            className={`layer-item ${currentLayer?.id === layer.id ? 'active' : ''}`}
            onClick={() => setCurrentLayer(layer)}
            onDoubleClick={() => handleDoubleClick(layer)}
          >
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) => {
                e.stopPropagation()
                updateLayerVisibility(layer.id, e.target.checked)
              }}
              title="Toggle visibility"
            />
            {layer.type === 'tile' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  updateLayerAutotiling(layer.id, !(layer.autotilingEnabled !== false))
                }}
                title={layer.autotilingEnabled !== false ? 'Autotiling ON' : 'Autotiling OFF'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  opacity: layer.autotilingEnabled !== false ? 1 : 0.3,
                  fontSize: '14px'
                }}
              >
                🗠
              </button>
            )}
            {editingLayerId === layer.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleNameSubmit(layer.id)}
                onKeyDown={(e) => handleKeyDown(e, layer.id)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                className="layer-name-input"
              />
            ) : (
              <span>{layer.name}</span>
            )}
          </div>
        ))}
      </div>
      <div className="layer-controls">
        <button onClick={() => addLayer()}>+ Add Layer</button>
        <button
          onClick={() => currentLayer && removeLayer(currentLayer.id)}
          disabled={!currentLayer}
        >
          - Remove
        </button>
      </div>
    </div>
  )
}
