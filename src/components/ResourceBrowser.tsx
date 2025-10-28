import { useEditor } from '../context/EditorContext'
import { TilesetTab } from '../types'

export const ResourceBrowser = () => {
  const { tilesets, unloadTileset, openTab } = useEditor()

  const handleTilesetDoubleClick = (tilesetId: string) => {
    const tileset = tilesets.find(t => t.id === tilesetId)
    if (!tileset) return

    // Create a tileset tab with just the ID reference
    const tilesetTab: TilesetTab = {
      id: `tileset-${tileset.id}`,
      type: 'tileset',
      title: tileset.name,
      isDirty: false,
      tilesetId: tileset.id,
      viewState: {
        scale: 2,
        selectedTileRegion: null
      }
    }

    openTab(tilesetTab)
  }

  return (
    <div className="p-3">
      {tilesets.length > 0 ? (
        <div className="flex gap-3 flex-wrap">
          {tilesets.map(tileset => (
            <div
              key={tileset.id}
              className="flex flex-col w-32 p-3 bg-gray-700 rounded hover:bg-gray-600 cursor-pointer transition-colors"
              onDoubleClick={() => handleTilesetDoubleClick(tileset.id)}
              title="Double-click to edit tileset"
            >
              <div className="flex-1 min-w-0 mb-2">
                <div className="text-sm font-medium text-white truncate mb-1">
                  {tileset.name}
                </div>
                <div className="text-xs text-gray-400">
                  {tileset.tiles.length} tiles
                </div>
                <div className="text-xs text-gray-400">
                  {tileset.entities.length} entities
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  unloadTileset(tileset.id)
                }}
                className="w-full px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded"
                title="Unload tileset"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-400 text-sm p-4 text-center">
          No tilesets in project. Create a new tileset to get started.
        </div>
      )}
    </div>
  )
}
