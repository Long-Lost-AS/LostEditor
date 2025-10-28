import { useEditor } from '../context/EditorContext'

export const Toolbar = () => {
  const { currentTool, setCurrentTool } = useEditor()

  return (
    <div className="toolbar">
      <button
        className={`tool-btn ${currentTool === 'pencil' ? 'active' : ''}`}
        onClick={() => setCurrentTool('pencil')}
        title="Pencil Tool"
      >
        ✏️
      </button>
      <button
        className={`tool-btn ${currentTool === 'eraser' ? 'active' : ''}`}
        onClick={() => setCurrentTool('eraser')}
        title="Eraser Tool"
      >
        🧹
      </button>
      <button
        className={`tool-btn ${currentTool === 'fill' ? 'active' : ''}`}
        onClick={() => setCurrentTool('fill')}
        title="Fill Tool"
      >
        🪣
      </button>
      <button
        className={`tool-btn ${currentTool === 'rect' ? 'active' : ''}`}
        onClick={() => setCurrentTool('rect')}
        title="Rectangle Tool"
      >
        ▭
      </button>
    </div>
  )
}
