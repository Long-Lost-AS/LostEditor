import { useState } from 'react'
import { useEditor } from '../context/EditorContext'

export const PropertiesPanel = () => {
  const { mapData, setMapData } = useEditor()
  const [width, setWidth] = useState(mapData.width)
  const [height, setHeight] = useState(mapData.height)
  const [tileWidth, setTileWidth] = useState(mapData.tileWidth)
  const [tileHeight, setTileHeight] = useState(mapData.tileHeight)

  const handleApply = () => {
    setMapData({
      ...mapData,
      width,
      height,
      tileWidth,
      tileHeight
    })
  }

  return (
    <div className="panel">
      <h3>Properties</h3>
      <div className="property-group">
        <label>Map Size</label>
        <div className="input-row">
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            min="1"
            max="200"
          />
          <span>×</span>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            min="1"
            max="200"
          />
        </div>
      </div>
      <div className="property-group">
        <label>Tile Size</label>
        <div className="input-row">
          <input
            type="number"
            value={tileWidth}
            onChange={(e) => setTileWidth(Number(e.target.value))}
            min="1"
            max="256"
          />
          <span>×</span>
          <input
            type="number"
            value={tileHeight}
            onChange={(e) => setTileHeight(Number(e.target.value))}
            min="1"
            max="256"
          />
        </div>
      </div>
      <button onClick={handleApply} className="apply-btn">
        Apply
      </button>
    </div>
  )
}
