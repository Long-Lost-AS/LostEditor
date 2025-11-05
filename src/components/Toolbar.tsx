import { PencilIcon, EraserIcon, FillIcon, RectangleIcon } from './Icons'
import { Tool } from '../types'

interface ToolbarProps {
  currentTool: Tool
  onToolChange: (tool: Tool) => void
}

export const Toolbar = ({ currentTool, onToolChange }: ToolbarProps) => {
  return (
    <div className="toolbar">
      <button
        className={`tool-btn ${currentTool === 'pencil' ? 'active' : ''}`}
        onClick={() => onToolChange('pencil')}
        title="Pencil Tool"
      >
        <PencilIcon size={20} />
      </button>
      <button
        className={`tool-btn ${currentTool === 'eraser' ? 'active' : ''}`}
        onClick={() => onToolChange('eraser')}
        title="Eraser Tool"
      >
        <EraserIcon size={20} />
      </button>
      <button
        className={`tool-btn ${currentTool === 'fill' ? 'active' : ''}`}
        onClick={() => onToolChange('fill')}
        title="Fill Tool"
      >
        <FillIcon size={20} />
      </button>
      <button
        className={`tool-btn ${currentTool === 'rect' ? 'active' : ''}`}
        onClick={() => onToolChange('rect')}
        title="Rectangle Tool"
      >
        <RectangleIcon size={20} />
      </button>
    </div>
  )
}
