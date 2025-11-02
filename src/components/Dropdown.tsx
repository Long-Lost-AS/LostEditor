import React, { useState, useEffect, useRef } from 'react'
import Fuse from 'fuse.js'

export interface DropdownProps<T> {
  items: T[]
  value: T | null
  onChange: (item: T) => void
  getItemLabel: (item: T) => string
  getItemKey: (item: T) => string | number
  placeholder?: string
  searchKeys?: string[]
  renderItem?: (item: T, isSelected: boolean) => React.ReactNode
  disabled?: boolean
  className?: string
}

export function Dropdown<T>({
  items,
  value,
  onChange,
  getItemLabel,
  getItemKey,
  placeholder = 'Select...',
  searchKeys = [],
  renderItem,
  disabled = false,
  className = ''
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Fuzzy search using Fuse.js
  const fuse = new Fuse(items, {
    keys: searchKeys.length > 0 ? searchKeys : ['name'],
    threshold: 0.4,
    ignoreLocation: true
  })

  const filteredItems = searchQuery
    ? fuse.search(searchQuery).map((result) => result.item)
    : items

  // Reset selection when filtered items change
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  // Auto-scroll selected item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex, isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setSearchQuery('')
          break
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            handleSelect(filteredItems[selectedIndex])
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, filteredItems])

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelect = (item: T) => {
    onChange(item)
    setIsOpen(false)
    setSearchQuery('')
    setSelectedIndex(0)
  }

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
      if (!isOpen) {
        setSearchQuery('')
        setSelectedIndex(0)
      }
    }
  }

  const defaultRenderItem = (item: T, isSelected: boolean) => (
    <div className="flex items-center gap-2">
      <span>{getItemLabel(item)}</span>
    </div>
  )

  const renderItemContent = renderItem || defaultRenderItem

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`w-full p-2 text-left border rounded flex items-center justify-between ${
          disabled
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
            : 'bg-gray-700 text-white hover:bg-gray-600'
        }`}
        style={{
          backgroundColor: disabled ? '#1e1e1e' : '#2d2d30',
          borderColor: '#3e3e42',
          color: value ? '#cccccc' : '#858585'
        }}
      >
        <span>{value ? getItemLabel(value) : placeholder}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9L1 4h10L6 9z" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 mt-1 w-full rounded shadow-lg"
          style={{
            backgroundColor: '#252526',
            border: '1px solid #3e3e42',
            maxHeight: '400px'
          }}
        >
          {/* Search Input */}
          <div className="p-2 border-b" style={{ borderColor: '#3e3e42' }}>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full p-2 rounded text-sm"
              style={{
                backgroundColor: '#2d2d30',
                border: '1px solid #3e3e42',
                color: '#cccccc',
                outline: 'none'
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Items List */}
          <div
            ref={listRef}
            className="overflow-y-auto"
            style={{ maxHeight: '320px' }}
          >
            {filteredItems.length === 0 ? (
              <div
                className="p-3 text-center text-sm"
                style={{ color: '#858585' }}
              >
                No items found
              </div>
            ) : (
              filteredItems.map((item, index) => {
                const isSelected = index === selectedIndex
                const isCurrentValue = value && getItemKey(value) === getItemKey(item)

                return (
                  <div
                    key={getItemKey(item)}
                    onClick={() => handleSelect(item)}
                    className="p-2 cursor-pointer transition-colors text-sm"
                    style={{
                      backgroundColor: isSelected ? '#0e639c' : isCurrentValue ? '#37373d' : 'transparent',
                      color: '#cccccc'
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {renderItemContent(item, isSelected)}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
