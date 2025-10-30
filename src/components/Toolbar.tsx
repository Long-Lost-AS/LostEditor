import { useEditor } from '../context/EditorContext'
import { PencilIcon, EraserIcon, FillIcon, RectangleIcon } from './Icons'

export const Toolbar = () => {
  const { currentTool, setCurrentTool } = useEditor()

  return (
    <div className="toolbar">
      <button
        className={`tool-btn ${currentTool === 'pencil' ? 'active' : ''}`}
        onClick={() => setCurrentTool('pencil')}
        title="Pencil Tool"
      >
        <PencilIcon size={20} />
      </button>
      <button
        className={`tool-btn ${currentTool === 'eraser' ? 'active' : ''}`}
        onClick={() => setCurrentTool('eraser')}
        title="Eraser Tool"
      >
        <EraserIcon size={20} />
      </button>
      <button
        className={`tool-btn ${currentTool === 'fill' ? 'active' : ''}`}
        onClick={() => setCurrentTool('fill')}
        title="Fill Tool"
      >
        <FillIcon size={20} />
      </button>
      <button
        className={`tool-btn ${currentTool === 'rect' ? 'active' : ''}`}
        onClick={() => setCurrentTool('rect')}
        title="Rectangle Tool"
      >
        <RectangleIcon size={20} />
      </button>
    </div>
  )
}
