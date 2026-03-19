# Document Image Processing Tool (img2easy)

A pure frontend document image processing tool that supports rotation correction, black border removal, edge cleaning, and stain removal functions.

## ⚠️ Experimental Project Notice

**Important: This is an experimental project that is still under active development.**

It is particularly important to note that the automatic stain removal function is not yet fully developed and may not handle various types of stains well. We are seeking community help to improve this functionality, and welcome contributions of better algorithms and solutions!

## Features

### Core Functions

1. **Rotation Correction** (`angle_correct`)
   - Uses Hough transform to detect lines
   - Automatically calculates average angle for rotation correction
   - Supports RANSAC algorithm for improved robustness

2. **Black Border Removal** (`border_remover`)
   - Intelligent detection of black borders on four sides of the image
   - Supports contour detection methods
   - Automatically crops black border areas

3. **Edge Cleaning** (`clean_edge`)
   - Gray-scale analysis based edge detection
   - Sliding window method for improved precision
   - Automatic cropping of unwanted edges

4. **Stain Removal** (`document_cleaner`)
   - Multi-feature scoring system to identify stains
   - Supports features like solidity, circularity, compactness, etc.
   - Uses inpainting algorithm to repair stained areas
   - **Note: This function is still in experimental stage and results may vary**

### Keyboard Shortcuts

| Shortcut | Function |
|----------|
| B | Rotate 180° |
| R | Rotate left 90° |
| T | Rotate right 90° |
| S | Manual crop |
| W | Tilt left |
| E | Tilt right |
| A | Undo |
| Z | Reset to original image |

## Tech Stack

- **Frontend Framework**: Vanilla JavaScript (ES6+)
- **Image Processing**: OpenCV.js
- **Build Tool**: Vite
- **Concurrent Processing**: Web Workers

## Project Structure

```
img2easy/
├── public/
│   ├── index.html              # Main page
│   ├── css/
│   │   ├── main.css           # Main styles
│   │   ├── layout.css         # Layout styles
│   │   └── components.css     # Component styles
│   └── assets/
│       └── js/
│           ├── core/           # Core image processing modules
│           │   ├── image-processor.js
│           │   ├── angle-corrector.js
│           │   ├── border-remover.js
│           │   ├── edge-cleaner.js
│           │   └── document-cleaner.js
│           ├── workers/        # Web Workers
│           │   ├── image-processing-worker.js
│           │   └── batch-processor-worker.js
│           ├── ui/             # User interface modules
│           │   ├── image-viewer.js
│           │   └── toolbar-controller.js
│           ├── utils/          # Utility functions
│           │   ├── canvas-utils.js
│           │   ├── file-handler.js
│           │   ├── opencv-loader.js
│           │   └── performance-monitor.js
│           └── main-controller.js  # Main controller
├── src/
│   └── js/
├── package.json
├── vite.config.js
└── README.md
```

## Installation and Running

### Prerequisites

- Node.js 16+
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

### Preview Production Version

```bash
npm run preview
```

## Usage Instructions

1. **Import Images**
   - Click "Import Folder" button to select a folder containing images
   - Or enter a task number to load a specific task

2. **Process Images**
   - Select an image from the left panel
   - Use toolbar buttons or keyboard shortcuts for operations
   - Use "Auto Correct", "Auto Remove Black Borders", "Auto Clean Stains" functions for one-click processing

3. **Save Results**
   - After processing, images will be displayed in the right panel
   - Continue adjustments or save results

## Core Algorithm Explanations

### Rotation Correction Algorithm

1. Convert to grayscale and apply Gaussian blur
2. Use Canny edge detection
3. Apply Hough transform to detect lines
4. Filter and calculate average angle
5. Execute affine transformation for rotation correction

### Black Border Removal Algorithm

1. Grayscale conversion and binarization
2. Detect black pixel distribution on four sides
3. Calculate black border boundaries
4. Crop black border areas

### Stain Detection Algorithm

1. Morphological operation preprocessing
2. Find contours
3. Calculate contour features (solidity, circularity, etc.)
4. Score and judge if it's a stain
5. Use inpainting to repair

**Note: The stain detection algorithm is still in the experimental stage and may not work well for complex backgrounds or special types of stains. We welcome community contributions for more advanced stain detection and repair algorithms!**

## Performance Optimization

- Use Web Workers for background image processing
- Support multi-core CPU parallel processing
- Memory management and timely release
- GPU acceleration (if browser supports)

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

## Community Contribution

We especially hope the community can help improve the following aspects:

1. **Automatic Stain Removal Algorithm** - Current stain detection and repair algorithms still have significant room for improvement
2. **Accuracy Enhancement** - Improve accuracy and stability of various image processing functions
3. **New Feature Development** - Add more practical image processing functions
4. **Performance Optimization** - Enhance processing speed and memory usage efficiency

If you have relevant experience and are willing to contribute, please review our code and submit PRs!

## Development Roadmap

- [ ] Batch processing functionality
- [ ] Registration and hardware binding
- [ ] More image processing features
- [ ] Processing history records
- [ ] Export processing reports
- [ ] Improve automatic stain removal algorithm

## License

MIT License