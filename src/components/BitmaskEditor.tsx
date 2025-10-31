import { useState } from 'react'
import { isBitmaskCellSet, toggleBitmaskCell } from '../utils/bitmaskAutotiling'

interface BitmaskEditorProps {
  bitmask: number
  terrainType: string
  onBitmaskChange: (newBitmask: number) => void
  cellSize?: number
}

/**
 * Bitmask editor component - shows a 3×3 grid where users can click cells
 * to toggle them on/off for a terrain type (Godot-style).
 */
export const BitmaskEditor = ({
  bitmask,
  terrainType,
  onBitmaskChange,
  cellSize = 24
}: BitmaskEditorProps) => {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)

  const handleCellClick = (row: number, col: number) => {
    const newBitmask = toggleBitmaskCell(bitmask, row, col)
    onBitmaskChange(newBitmask)
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="text-xs mb-1" style={{ color: '#858585' }}>
        Paint {terrainType || 'terrain'} cells:
      </div>

      <div
        className="inline-grid grid-cols-3 gap-0.5 p-1 rounded"
        style={{ background: '#1e1e1e', border: '1px solid #3e3e42' }}
      >
        {[0, 1, 2].map(row => (
          [0, 1, 2].map(col => {
            const isSet = isBitmaskCellSet(bitmask, row, col)
            const isHovered = hoveredCell?.row === row && hoveredCell?.col === col
            const isCenter = row === 1 && col === 1

            return (
              <button
                key={`${row}-${col}`}
                onClick={() => handleCellClick(row, col)}
                onMouseEnter={() => setHoveredCell({ row, col })}
                onMouseLeave={() => setHoveredCell(null)}
                className="transition-all"
                style={{
                  width: `${cellSize}px`,
                  height: `${cellSize}px`,
                  background: isSet
                    ? (isCenter ? '#1177bb' : '#0e639c')
                    : (isHovered ? '#3e3e42' : '#2d2d2d'),
                  border: isSet
                    ? '2px solid #1177bb'
                    : (isHovered ? '2px solid #555' : '2px solid #3e3e42'),
                  cursor: 'pointer',
                  borderRadius: '2px'
                }}
                title={`${isCenter ? 'Center (always set)' : `Row ${row}, Col ${col}`}: ${isSet ? 'Filled' : 'Empty'}`}
              >
                {isSet && (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                  </div>
                )}
              </button>
            )
          })
        ))}
      </div>

      <div className="text-[10px] mt-1" style={{ color: '#858585' }}>
        Click cells to paint terrain pattern
      </div>
    </div>
  )
}
