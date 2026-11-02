# Coronary AI Intelligence Lab

**Coronary AI Intelligence Lab** is an advanced research and medical image processing platform for X-ray coronary angiography (CAG). The system integrates multi-scale vessel segmentation, quantitative coronary analysis (QCA), calibrated epistemic & aleatoric uncertainty estimation, topological vessel graph mining, and an interactive human-in-the-loop annotation studio.

---

## 1. Key New Features

### Feature 1: AI Confidence & Uncertainty Map
- **Dual-Uncertainty Quantification**: Distinguishes prediction probability from uncertainty.
  - **Aleatoric / Boundary Ambiguity**: Computed via normalized Shannon entropy:
    $$H(x, y) = -P\log_2(P) - (1-P)\log_2(1-P)$$
    Maximized at $H = 1.0$ at transition boundaries ($P = 0.5$) where lumen margins separate from fluoroscopic noise.
  - **Epistemic / Scale Discordance**: Variance across multi-scale tubular Gaussian derivative filters ($\sigma \in \{1.5, 4.0, 8.0\}$) capturing structural ambiguity at bifurcations, calcifications, and low contrast-to-noise ratio (CNR) regions.
- **Visual Heatmap & HUD Inspector**: 4-channel RGBA thermal overlay (Navy $\to$ Cyan $\to$ Yellow $\to$ Coral Red) with real-time hover pixel probe displaying local $(x, y)$ coordinates and calibrated certainty.
- **Layer & View Controls**: Toggle between Composite Overlay, Heatmap Only, Segmentation Mask, and Original Angiogram with interactive zoom, pan, and continuous opacity sliders ($0\% - 100\%$).
- **5-Bin Histogram & Reliability Category**: Categorized into *High Reliability*, *Moderate (Review Recommended)*, and *Low Confidence / Ambiguous*. Includes graceful handling of empty/corrupted frames with informative unavailable states.

### Feature 2: Coronary Vessel Graph Explorer
- **Topology-Preserving Skeletonization**: Optimized Zhang-Suen morphological thinning applied directly to the lumen segmentation mask.
- **Clustered Junction Mining (Zero Duplicate Branch Points)**: Resolves digital skeleton artifacts by consolidating contiguous junction pixels ($\ge 3$ neighbors) within a proximity radius ($\le 6.0\text{ px}$) into single centroid branch nodes.
- **Graph Nodes & Edges Extraction**:
  - **Nodes**: Consolidated bifurcations/trifurcations (amber markers) and terminal vessel tips (emerald markers).
  - **Edges**: Polyline centerline segments connecting nodes.
  - **Morphometric Metrics**: Segment arc length (px), chord length (px), tortuosity index ($\tau = \text{arc} / \text{chord}$), and average local caliber (lumen thickness in pixels derived via distance transform).
- **Interactive SVG Visualizer**: Real-time click/hover selection highlighting segments in gold and syncing to an anatomical inspector and scrollable segment list.
- **Data Export**: One-click download of vessel graph topology in structured **JSON** and tabular **CSV** formats.
- **Rigorous Anatomical Labeling**: Indexes branches by topological connectivity rather than fabricating uncalibrated anatomical vessel names.

### Feature 3: Human-in-the-Loop Annotation Studio
- **Dual-Layer Interactive Canvas**: Hardware-accelerated HTML5 Canvas displaying base angiogram and editable lumen mask.
- **Clinical Brush & Eraser Tools**:
  - **Brush**: Add vessel lumen / fill false negatives.
  - **Eraser**: Remove noise / erase false positives.
  - **Brush Size Adjustment**: $2\text{ px}$ to $36\text{ px}$ with real-time HUD cursor indicator.
  - **Mask Opacity Slider**: Adjust transparency over the base angiography frame.
- **Full Undo / Redo & Mask Preservation**:
  - State stack with keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`).
  - Immutable preservation of original AI predictions; human edits are stored distinctly and never silently overwrite baseline model masks.
  - Reset to original AI prediction with one click.
- **Live Mask Difference & Morphometry**:
  - Calculates Original Area (px), Corrected Area (px), Pixels Added, Pixels Erased, and Net Area Delta ($\%$).
  - Agreement metrics: Dice Similarity Coefficient and Jaccard IoU.
  - Real-time visual color-coded difference map (Green = Added, Red = Erased, Teal = Consensus).
- **Dynamic Graph Recalculation**: Saving an annotation triggers automatic skeletonization and graph re-extraction on the corrected mask so researchers immediately see updated bifurcation topology.
- **Research Exports**: Export corrected masks as PNG and annotation audit logs as JSON.

---

## 2. Project Architecture

```
Hackverse2/
├── coronary-ai-hackathon-updated/
│   ├── backend/
│   │   ├── main.py                     # FastAPI REST API & route definitions
│   │   ├── coronary_analyzer.py        # QCA, stenosis quantification & vFFR
│   │   ├── coronary_intelligence.py    # Uncertainty, skeletonization & graph engine
│   │   ├── test_intelligence_lab.py    # Comprehensive automated test suite
│   │   ├── test_backend_full.py        # End-to-end integration test
│   │   ├── requirements.txt            # Python dependencies
│   │   └── models/
│   │       ├── coronary_unet.py        # U-Net architecture specification
│   │       └── coronary_unet_weights.json
│   ├── samples/                        # Angiography benchmark PNG samples
│   ├── index.html                      # Overview & platform introduction
│   ├── UploadandAnalysis.html          # Angiography intake & processing
│   ├── IntelligenceLab.html            # Intelligence Lab (Uncertainty, Graph, Studio)
│   ├── Report.html                     # Clinical findings, AHA/ACC segments & metrics
│   ├── Export.html                     # PDF report generator & research data export
│   ├── style.css                       # Unified medical design system
│   ├── main.js                         # Shared controllers, canvas & API client
│   └── start_backend.bat               # Windows startup launcher
├── sync_all.py                         # Synchronizes frontend assets across folders
└── README.md                           # Documentation
```

---

## 3. Dependencies & Installation

### Backend Requirements
- **Python**: 3.10+
- **FastAPI**: $\ge 0.115$
- **Uvicorn**: $\ge 0.30$
- **Pillow (PIL)**: $\ge 10.0$
- **python-multipart**: $\ge 0.0.9$
- **Pydantic**: $\ge 2.0$

*Note: The core engine is built with high-efficiency pure Python and Pillow algorithms, requiring zero external C-compilers or heavy GPU runtime dependencies.*

### Installation Steps
```bash
# Navigate to backend directory
cd coronary-ai-hackathon-updated/backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows)
.\.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

---

## 4. Local Startup Commands

### Start the Backend Server
```powershell
# From project root or backend folder:
.\start_backend.bat

# Or run directly via uvicorn:
.\coronary-ai-hackathon-updated\backend\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Open the Application
Open your browser to:
- **Intelligence Lab**: [http://localhost:8000/IntelligenceLab.html](http://localhost:8000/IntelligenceLab.html)
- **Upload & Analyze**: [http://localhost:8000/UploadandAnalysis.html](http://localhost:8000/UploadandAnalysis.html)
- **Diagnostic Report**: [http://localhost:8000/Report.html](http://localhost:8000/Report.html)
- **Export Center**: [http://localhost:8000/Export.html](http://localhost:8000/Export.html)
- **API Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 5. REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health, pipeline readiness & feature flags |
| `GET` | `/api/evaluation` | Reference validation benchmark metrics (ARCADE dataset) |
| `GET` | `/api/model/info` | Architecture specs and layer summary of Coronary-UNet |
| `GET` | `/api/samples` | List available test angiograms |
| `GET` | `/api/samples/{filename}` | Retrieve sample angiogram image |
| `POST` | `/api/analyze` | Full pipeline: QCA, lumen diameters, vFFR, uncertainty, graph |
| `POST` | `/api/uncertainty` | Compute calibrated uncertainty map & Shannon entropy |
| `POST` | `/api/vessel-graph` | Extract skeleton, consolidated branch nodes, edges & caliber |
| `POST` | `/api/graph/export` | Export graph data as formatted JSON or tabular CSV |
| `POST` | `/api/annotations/save` | Save corrected mask, compute area delta/Dice & recalculate graph |
| `GET` | `/api/annotations/{id}` | Retrieve saved human annotations for a case ID |
| `GET` | `/api/analysis/{id}/results`| Retrieve full case package (AI + Uncertainty + Graph + Human Edits) |

---

## 6. Supported Image Formats & Security

- **Supported Formats**: PNG, JPEG, JPG (up to 50 MB).
- **DICOM Handling**: Fluoroscopic `.dcm` files are safely detected; users are guided to export standard frames as PNG/JPEG.
- **Security & Data Handling**:
  - Strict upload byte verification and PIL image integrity checks.
  - Safe case ID sanitization to prevent path traversal (`../` or illegal characters).
  - In-memory bounded session store (FIFO eviction) preventing disk bloat.
  - No patient Protected Health Information (PHI) is required or stored.

---

## 7. Testing Commands

Run the comprehensive automated test suite:
```powershell
.\coronary-ai-hackathon-updated\backend\.venv\Scripts\python.exe coronary-ai-hackathon-updated\backend\test_intelligence_lab.py
```

### Verified Test Cases
1. `test_health`: Service status and Intelligence Lab readiness.
2. `test_analyze_full_pipeline`: Image upload, lumen morphometry, stenosis, uncertainty, and graph extraction.
3. `test_uncertainty_endpoint`: Calibrated entropy calculation and unavailable state handling on empty frames.
4. `test_vessel_graph_extraction_and_consolidation`: Skeletonization and branch point clustering (0 false duplicates).
5. `test_human_in_the_loop_annotation`: Adding/erasing pixels, Dice agreement, live graph update, and AI baseline preservation.
6. `test_graph_export`: JSON and CSV export schema verification.
7. `test_security_and_error_handling`: 400 empty file, 415 invalid mime type, 404 missing ID, and path traversal defenses.

---

## 8. Export Formats

- **Research Summary**: High-resolution print/PDF report.
- **Original Angiogram**: PNG frame.
- **AI Segmentation Mask**: Single-channel binary PNG.
- **Human-Corrected Mask**: Verified lumen PNG.
- **Uncertainty Heatmap**: 4-channel RGBA thermal PNG.
- **Vessel Graph Data**:
  - `JSON`: Full graph nodes, polyline coordinates, and topological metrics.
  - `CSV`: Tabular segment records (`Segment_ID`, `Source`, `Target`, `Arc_Length`, `Caliber`, `Tortuosity`, coordinates).
- **Audit Metadata**: JSON package containing case references, timestamps, before/after area metrics, and clinical notes.

---

## 9. Known Limitations & Research Disclaimer

1. **Research Prototype**: Designed for academic investigation, quantitative morphometry, and algorithmic evaluation. Not FDA/CE-cleared for standalone clinical diagnosis.
2. **2D Projection Geometry**: Angiographic calibers and arc lengths are measured in image pixel units unless calibrated with catheter reference sizing ($0.12\text{ mm/px}$ nominal).
3. **Anatomical Labeling**: Segment labels represent topological connectivity rather than validated anatomical artery names, adhering to strict medical research ethics.
