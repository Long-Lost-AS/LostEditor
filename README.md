# Lost Editor

A 2D tile map editor built with Electron, TypeScript, and Canvas 2D - similar to Tiled.

## Features

- Multiple layer support
- Tileset loading and management
- Drawing tools: Pencil, Eraser, Fill Bucket, Rectangle
- Zoom and pan controls
- Grid display
- Map save/load in JSON format
- Properties panel for map configuration

## Getting Started

### Development

```bash
npm install
npm run electron:dev
```

### Build

```bash
npm run electron:build
```

## Usage

### Loading a Tileset

1. Click the "Load Tileset" button in the toolbar
2. Select a tileset image (PNG or other image format)
3. The tileset will appear in the left panel

### Selecting Tiles

- Click on any tile in the tileset panel to select it
- The selected tile will be highlighted with a green border

### Drawing Tools

- **Pencil Tool (✏️)**: Click and drag to paint individual tiles
- **Eraser Tool (🧹)**: Click and drag to erase tiles
- **Fill Tool (🪣)**: Click to flood-fill an area with the selected tile
- **Rectangle Tool (▭)**: Click and drag to draw rectangular areas

### Layers

- Click "Add Layer" to create a new layer
- Click "Remove" to delete the selected layer
- Click on a layer in the list to select it for editing
- Layers are drawn from bottom to top

### Navigation

- **Zoom**: Use mouse wheel to zoom in/out
- **Pan**: Hold Shift + Left Click and drag, or use Middle Mouse Button

### Map Properties

- Adjust map size (width × height in tiles)
- Adjust tile size (width × height in pixels)
- Click "Apply" to update the map

### Saving and Loading

- **File → New Map** (Cmd/Ctrl+N): Create a new map
- **File → Open Map** (Cmd/Ctrl+O): Load a map from JSON
- **File → Save Map** (Cmd/Ctrl+S): Save the current map
- **File → Save Map As** (Cmd/Ctrl+Shift+S): Save with a new filename

## Map File Format

Maps are saved as JSON files with the following structure:

```json
{
  "width": 32,
  "height": 32,
  "tileWidth": 16,
  "tileHeight": 16,
  "layers": [
    {
      "id": "layer_id",
      "name": "Layer 1",
      "visible": true,
      "tiles": [
        {
          "x": 0,
          "y": 0,
          "tilesetX": 0,
          "tilesetY": 0
        }
      ]
    }
  ]
}
```

## Keyboard Shortcuts

- **Cmd/Ctrl+N**: New Map
- **Cmd/Ctrl+O**: Open Map
- **Cmd/Ctrl+S**: Save Map
- **Cmd/Ctrl+Shift+S**: Save Map As
- **Shift+Drag**: Pan the canvas

## Tech Stack

- Electron - Desktop app framework
- TypeScript - Type-safe JavaScript
- Vite - Build tool and dev server
- Canvas 2D - Rendering engine
