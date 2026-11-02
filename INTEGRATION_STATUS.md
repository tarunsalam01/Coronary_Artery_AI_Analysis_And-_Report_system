# Coronary AI - Backend & Integration Status

## System Overview

The Coronary AI Research platform now features a fully functional FastAPI backend and computer vision pipeline for automated coronary angiogram processing.

### Capabilities
1. **Multi-Scale Vessel Segmentation**:
   - Adaptive background illumination normalization and contrast equalization.
   - Multi-scale difference-of-blurs vessel ridge extraction capturing both main arteries and distal branches.
   - Morphological lumen boundary reconstruction.
2. **Quantitative Stenosis Profiling**:
   - Automated identification of target vessel (LAD, RCA, LCx).
   - Lumen caliber measurement across diagnostic centerline segments.
   - Detection of minimum lumen diameter (MLD) and reference lumen diameter (RLD).
   - Accurate stenosis percentage calculation: `((RLD - MLD) / RLD) * 100`.
   - Classification according to AHA/ACC guidelines (Minimal, Mild, Moderate–severe, Severe, Critical).
   - Region of Interest (ROI) stenosis lesion coordinates and bounding crosshairs.
3. **Dynamic Diagnostic Viewer**:
   - Full live data binding in `Report.html` and `Export.html`.
   - Dynamic layer toggles: **Overlay** (vessel + mask + ROI), **Original** (angiogram only), and **Mask Only**.
   - Interactive zoom controls (zoom in, zoom out, fit to screen).
   - Segment-by-segment clinical review cards.
   - Export to formatted PDF/Print report with patient case reference.
4. **Quick-Load Sample Testing**:
   - Pre-generated sample angiograms for immediate testing:
     - `sample_lad_stenosis.png`: LAD stenosis (68%)
     - `sample_rca_lesion.png`: RCA lesion (76%)
     - `sample_normal_angiogram.png`: Normal patent vessel (14%)

---

## How to Run the Backend

### Windows One-Click (Recommended)
Double-click `start_backend.bat` in the project root or in `backend/`.

### Manual Startup (PowerShell / Command Prompt)
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### API Endpoints
- **Health Check**: `GET http://localhost:8000/api/health`
- **Evaluation Metrics**: `GET http://localhost:8000/api/evaluation`
- **Image Analysis**: `POST http://localhost:8000/api/analyze` (multipart file upload)
- **Sample Angiograms**: `GET http://localhost:8000/api/samples`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
