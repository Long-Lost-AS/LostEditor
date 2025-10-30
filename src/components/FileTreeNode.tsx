import { useState } from 'react'
import { FolderIcon, FolderOpenIcon, MapIcon, TilesetIcon, ImageIcon, PackageIcon, FileIcon } from './Icons'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

interface FileTreeNodeProps {
  node: FileNode
  level: number
  onFileDoubleClick: (path: string, extension: string) => void
}

export const FileTreeNode = ({ node, level, onFileDoubleClick }: FileTreeNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleClick = () => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleDoubleClick = () => {
    if (!node.isDirectory) {
      const extension = node.name.includes('.')
        ? node.name.substring(node.name.lastIndexOf('.'))
        : ''
      onFileDoubleClick(node.path, extension)
    }
  }

  const getIcon = () => {
    if (node.isDirectory) {
      return isExpanded ? <FolderOpenIcon /> : <FolderIcon />
    }

    const ext = node.name.substring(node.name.lastIndexOf('.')).toLowerCase()
    switch (ext) {
      case '.lostmap':
        return <MapIcon />
      case '.lostset':
        return <TilesetIcon />
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
        return <ImageIcon />
      case '.lostproj':
        return <PackageIcon />
      default:
        return <FileIcon />
    }
  }

  // Skip .lostproj files
  if (node.name.endsWith('.lostproj')) {
    return null
  }

  return (
    <div>
      <div
        className="flex items-center px-2 py-1 hover:bg-gray-700 cursor-pointer text-sm"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <span className="mr-2 text-base">{getIcon()}</span>
        <span className="text-gray-200 truncate">{node.name}</span>
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child, index) => (
            <FileTreeNode
              key={`${child.path}-${index}`}
              node={child}
              level={level + 1}
              onFileDoubleClick={onFileDoubleClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
