import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { referenceManager, type BrokenReference, type ReferenceType } from '../managers/ReferenceManager'
import { fileManager } from '../managers/FileManager'

interface BrokenReferencesModalProps {
  references: BrokenReference[]
  projectDir: string
  onClose: () => void
  onContinue: () => void
}

interface BrokenRefWithStatus extends BrokenReference {
  status: 'pending' | 'fixing' | 'fixed' | 'error'
  newPath?: string
  errorMessage?: string
  affectedFiles?: string[]
}

// Helper function to get file filter based on reference type
function getFilterForReferenceType(type: ReferenceType['type']) {
  switch (type) {
    case 'project-tileset':
      return { name: 'Tileset Files', extensions: ['lostset'] }
    case 'project-map':
      return { name: 'Map Files', extensions: ['lostmap'] }
    case 'tileset-image':
      return { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }
  }
}

// Helper function to get user-friendly label
function getFileTypeLabel(type: ReferenceType['type']): string {
  switch (type) {
    case 'project-tileset':
      return 'Tileset'
    case 'project-map':
      return 'Map'
    case 'tileset-image':
      return 'Image'
  }
}

// Helper function to get badge color
function getBadgeColor(type: ReferenceType['type']): string {
  switch (type) {
    case 'project-tileset':
      return '#1177bb' // Blue
    case 'project-map':
      return '#16a34a' // Green
    case 'tileset-image':
      return '#9333ea' // Purple
  }
}

// Helper function to validate file extension
function validateFileExtension(filePath: string, type: ReferenceType['type']): boolean {
  const ext = fileManager.extname(filePath).toLowerCase()
  const filter = getFilterForReferenceType(type)
  return filter.extensions.some(validExt => ext === `.${validExt}`)
}

export const BrokenReferencesModal = ({ references, projectDir, onClose, onContinue }: BrokenReferencesModalProps) => {
  const [refs, setRefs] = useState<BrokenRefWithStatus[]>(() =>
    references.map(ref => ({ ...ref, status: 'pending' as const }))
  )

  const fixedCount = refs.filter(r => r.status === 'fixed').length
  const totalCount = refs.length
  const allFixed = fixedCount === totalCount

  const handleFix = async (ref: BrokenRefWithStatus, index: number) => {
    // Set status to fixing
    setRefs(prev => prev.map((r, i) => i === index ? { ...r, status: 'fixing' as const } : r))

    try {
      // Get file filter for this reference type
      const filter = getFilterForReferenceType(ref.referenceType)
      const title = `Locate ${getFileTypeLabel(ref.referenceType)}`

      // Show file dialog with smart default path
      const result = await invoke<{ canceled: boolean; filePaths?: string[] }>('show_open_dialog', {
        options: {
          title,
          defaultPath: ref.expectedPath,
          filters: [filter],
          properties: ['openFile']
        }
      })

      if (result.canceled || !result.filePaths?.[0]) {
        // User cancelled, revert to pending
        setRefs(prev => prev.map((r, i) => i === index ? { ...r, status: 'pending' as const } : r))
        return
      }

      const selectedPath = result.filePaths[0]

      // Validate file extension
      if (!validateFileExtension(selectedPath, ref.referenceType)) {
        setRefs(prev => prev.map((r, i) => i === index ? {
          ...r,
          status: 'error' as const,
          errorMessage: `Invalid file type. Expected ${filter.extensions.join(', ')}`
        } : r))
        return
      }

      // Get preview of affected files
      const affectedFilesMap = await referenceManager.findReferences(ref.expectedPath, projectDir)
      const affectedFiles = Array.from(affectedFilesMap.keys())

      // Update state with preview
      setRefs(prev => prev.map((r, i) => i === index ? {
        ...r,
        affectedFiles,
        status: 'fixing' as const
      } : r))

      // Apply the fix immediately
      await referenceManager.updateReferences(ref.expectedPath, selectedPath, projectDir)

      // Update manager caches
      referenceManager.updateManagerCaches(ref.expectedPath, selectedPath)

      // Mark as fixed
      setRefs(prev => prev.map((r, i) => i === index ? {
        ...r,
        status: 'fixed' as const,
        newPath: selectedPath,
        affectedFiles
      } : r))
    } catch (error) {
      console.error('Failed to fix reference:', error)
      setRefs(prev => prev.map((r, i) => i === index ? {
        ...r,
        status: 'error' as const,
        errorMessage: error instanceof Error ? error.message : 'Failed to update references'
      } : r))
    }
  }

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative z-10 p-6 rounded shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        style={{ background: '#2d2d30', border: '1px solid #3e3e42' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white mb-2">
            Broken File References Detected
          </h2>
          <p className="text-gray-400 text-sm">
            {fixedCount} of {totalCount} fixed • Click on any item to locate the missing file
          </p>
        </div>

        {/* Reference List */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {refs.map((ref, index) => (
            <div
              key={`${ref.referencingFile}-${ref.expectedPath}`}
              className="p-3 rounded transition-colors"
              style={{
                background: '#252526',
                border: '1px solid #3e3e42',
                cursor: ref.status === 'pending' || ref.status === 'error' ? 'pointer' : 'default'
              }}
              onClick={() => {
                if (ref.status === 'pending' || ref.status === 'error') {
                  handleFix(ref, index)
                }
              }}
              onMouseEnter={(e) => {
                if (ref.status === 'pending' || ref.status === 'error') {
                  e.currentTarget.style.background = '#2a2a2b'
                  e.currentTarget.style.borderColor = '#1177bb'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#252526'
                e.currentTarget.style.borderColor = '#3e3e42'
              }}
            >
              {/* Type Badge and Status */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-1 rounded text-xs font-medium text-white"
                    style={{ background: getBadgeColor(ref.referenceType) }}
                  >
                    {getFileTypeLabel(ref.referenceType)}
                  </span>
                  <span className="text-gray-400 text-sm">
                    {fileManager.basename(ref.expectedPath)}
                  </span>
                </div>

                {/* Status Indicator */}
                {ref.status === 'pending' && (
                  <div className="text-sm text-gray-400">
                    Click to fix →
                  </div>
                )}
                {ref.status === 'fixing' && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                    <span>Fixing...</span>
                  </div>
                )}
                {ref.status === 'fixed' && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: '#16a34a' }}>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Fixed</span>
                  </div>
                )}
                {ref.status === 'error' && (
                  <div className="text-sm" style={{ color: '#f48771' }}>
                    Click to retry →
                  </div>
                )}
              </div>

              {/* Expected Path (crossed out if fixed) */}
              <div className="text-sm mb-1">
                <span className="text-gray-500">Expected: </span>
                <span
                  className={ref.status === 'fixed' ? 'line-through text-gray-600' : 'text-gray-300'}
                  title={ref.expectedPath}
                >
                  {ref.expectedPath}
                </span>
              </div>

              {/* New Path (if fixed) */}
              {ref.status === 'fixed' && ref.newPath && (
                <div className="text-sm mb-1">
                  <span className="text-gray-500">New location: </span>
                  <span className="text-green-400" title={ref.newPath}>
                    {ref.newPath}
                  </span>
                </div>
              )}

              {/* Referencing File */}
              <div className="text-xs text-gray-500 mb-1">
                Referenced in: {ref.referencingFile}
              </div>

              {/* Affected Files Preview */}
              {ref.affectedFiles && ref.affectedFiles.length > 0 && (
                <div className="text-xs text-gray-500 mt-2">
                  Will update: {ref.affectedFiles.map(f => fileManager.basename(f)).join(', ')}
                </div>
              )}

              {/* Error Message */}
              {ref.status === 'error' && ref.errorMessage && (
                <div className="text-xs mt-2 p-2 rounded" style={{ background: '#5a1e1e', color: '#f48771' }}>
                  {ref.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t" style={{ borderColor: '#3e3e42' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-700"
          >
            Cancel Load
          </button>

          <button
            onClick={onContinue}
            disabled={!allFixed}
            className="px-4 py-2 rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: allFixed ? '#16a34a' : '#3e3e42' }}
            title={allFixed ? 'Continue loading project' : 'Fix all references before continuing'}
          >
            Continue {allFixed && '✓'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
