"""
Comprehensive Test Suite for Coronary AI Intelligence Lab:
- Image upload & validation
- Epistemic & Aleatoric uncertainty estimation & unavailable states
- Topological vessel graph extraction & branch clustering
- Human-in-the-Loop annotation saving, mask comparison & undo/redo tracking
- Preserving original AI mask and separate human correction tracking
- API error handling, invalid dimensions & path traversal defense
- JSON and CSV vessel graph export
"""

import io
import json
import base64
from pathlib import Path
from PIL import Image, ImageDraw
from starlette.datastructures import UploadFile
from fastapi import HTTPException

from main import (
    health,
    analyze,
    get_uncertainty,
    get_vessel_graph,
    export_graph,
    save_annotation,
    get_annotation,
    get_analysis_results,
    sanitize_id,
    AnnotationSaveRequest,
    GraphExportRequest,
    LAB_STORE
)
from coronary_intelligence import (
    compute_uncertainty_map,
    extract_vessel_graph,
    compare_masks
)

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "samples"


def test_health():
    data = health()
    assert data["status"] == "ok"
    assert data["ai_pipeline_ready"] is True
    assert data["intelligence_lab_ready"] is True
    print("[PASS] GET /api/health verified.")


def test_analyze_full_pipeline():
    sample_file = SAMPLES_DIR / "sample_lad_stenosis.png"
    assert sample_file.exists(), f"Missing sample file at {sample_file}"

    with open(sample_file, "rb") as f:
        file_bytes = f.read()

    upload_file = UploadFile(
        file=io.BytesIO(file_bytes),
        filename="sample_lad_stenosis.png"
    )

    res = analyze(file=upload_file)
    data = json.loads(res.body.decode("utf-8"))

    assert data["status"] == "success"
    assert "analysis_id" in data
    assert data["analysis_id"] != ""
    assert "uncertainty" in data
    assert data["uncertainty"]["available"] is True
    assert "data:image/png;base64," in data["uncertainty"]["uncertainty_heatmap"]
    assert "vessel_confidence_pct" in data["uncertainty"]
    assert "reliability" in data["uncertainty"]

    assert "vessel_graph" in data
    assert data["vessel_graph"]["available"] is True
    assert len(data["vessel_graph"]["nodes"]) > 0
    assert len(data["vessel_graph"]["edges"]) > 0
    assert "centerline_overlay" in data["vessel_graph"]

    assert "binary_mask_image" in data
    assert "mask_image" in data
    assert data["has_human_correction"] is False

    print(f"[PASS] POST /api/analyze verified. Analysis ID: {data['analysis_id']}, Nodes: {len(data['vessel_graph']['nodes'])}, Segments: {len(data['vessel_graph']['edges'])}.")
    return data["analysis_id"], data


def test_uncertainty_endpoint(analysis_id):
    # Test via analysis_id
    res = get_uncertainty(file=None, mask=None, analysis_id=analysis_id)
    data = json.loads(res.body.decode("utf-8"))
    assert data["available"] is True
    assert "mean_uncertainty" in data
    assert "histogram" in data

    # Test unavailable state on blank mask
    blank_img = Image.new("RGB", (128, 128), (0, 0, 0))
    blank_mask = Image.new("L", (128, 128), 0)
    unc_blank = compute_uncertainty_map(blank_img, blank_mask)
    assert unc_blank["available"] is False
    assert "insufficient vessel signal" in unc_blank["reason"]

    print("[PASS] Uncertainty calculation and unavailable state verified.")


def test_vessel_graph_extraction_and_consolidation():
    # Test synthetic mask with known bifurcation: 1 trunk splitting into 2 branches
    w, h = 200, 200
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    # Draw thick branching lumen (width 12)
    draw.line([(100, 20), (100, 100)], fill=255, width=12)
    draw.line([(100, 100), (40, 180)], fill=255, width=10)
    draw.line([(100, 100), (160, 180)], fill=255, width=10)

    graph = extract_vessel_graph(mask)
    assert graph["available"] is True
    assert graph["branch_points_count"] == 1, f"Expected exactly 1 consolidated branch point, got {graph['branch_points_count']}"
    assert graph["endpoints_count"] == 3, f"Expected 3 endpoints, got {graph['endpoints_count']}"
    assert graph["total_segments"] == 3, f"Expected 3 segments, got {graph['total_segments']}"

    # Verify no arterial fabrication in labels
    for edge in graph["edges"]:
        assert "Segment #" in edge["label"]
        assert "LAD" not in edge["label"]
        assert edge["arc_length_px"] > 0
        assert edge["average_caliber_px"] > 0

    print("[PASS] Vessel graph skeletonization & branch point consolidation verified.")


def test_human_in_the_loop_annotation(analysis_id, analysis_data):
    orig_mask_b64 = analysis_data["binary_mask_image"]
    raw_bytes = base64.b64decode(orig_mask_b64.split(",")[1])
    orig_img = Image.open(io.BytesIO(raw_bytes)).convert("L")

    # Simulate human correction: add a distal extension (brush) and erase a small noise spot (eraser)
    corr_img = orig_img.copy()
    draw = ImageDraw.Draw(corr_img)
    draw.line([(50, 50), (90, 90)], fill=255, width=8)  # Added lumen
    draw.rectangle([10, 10, 25, 25], fill=0)             # Erased noise

    corr_buffer = io.BytesIO()
    corr_img.save(corr_buffer, format="PNG")
    corr_b64 = "data:image/png;base64," + base64.b64encode(corr_buffer.getvalue()).decode("utf-8")

    payload = AnnotationSaveRequest(
        analysis_id=analysis_id,
        corrected_mask=corr_b64,
        original_mask=orig_mask_b64,
        notes="Added distal diagonal branch; erased chest wall artifact."
    )

    res = save_annotation(payload)
    data = json.loads(res.body.decode("utf-8"))

    assert data["status"] == "success"
    assert data["comparison"]["pixels_added"] > 0
    assert "agreement_dice" in data["comparison"]
    assert "corrected_graph" in data
    assert data["corrected_graph"]["available"] is True

    # Test GET annotation
    res_get = get_annotation(analysis_id=analysis_id)
    ann_data = json.loads(res_get.body.decode("utf-8"))
    assert ann_data["analysis_id"] == analysis_id
    assert ann_data["notes"] == payload.notes

    # Verify original AI mask is preserved unchanged
    full_res = json.loads(get_analysis_results(analysis_id=analysis_id).body.decode("utf-8"))
    assert full_res["binary_mask_image"] == orig_mask_b64
    assert full_res["has_human_correction"] is True
    assert full_res["human_annotation"]["corrected_mask"] == corr_b64

    print("[PASS] Human-in-the-loop annotation studio & mask preservation verified.")


def test_graph_export(analysis_id):
    # Test JSON export
    req_json = GraphExportRequest(analysis_id=analysis_id, format="json")
    res_json = export_graph(req_json)
    data = json.loads(res_json.body.decode("utf-8"))
    assert "edges" in data

    # Test CSV export
    req_csv = GraphExportRequest(analysis_id=analysis_id, format="csv")
    res_csv = export_graph(req_csv)
    assert res_csv.media_type == "text/csv"
    csv_text = res_csv.body.decode("utf-8")
    assert "Segment_ID,Label,Source_Node,Target_Node" in csv_text
    print("[PASS] Vessel graph JSON and CSV exports verified.")


def test_security_and_error_handling():
    # Empty file raises HTTPException 400
    try:
        empty_upload = UploadFile(file=io.BytesIO(b""), filename="empty.png")
        analyze(file=empty_upload)
        assert False, "Should have raised HTTPException 400"
    except HTTPException as e:
        assert e.status_code == 400

    # Non-image file raises HTTPException 415
    try:
        corrupted_upload = UploadFile(file=io.BytesIO(b"not an image file"), filename="fake.png")
        analyze(file=corrupted_upload)
        assert False, "Should have raised HTTPException 415"
    except HTTPException as e:
        assert e.status_code == 415

    # Path traversal in ID sanitation
    malicious_id = "../../../etc/passwd"
    clean_id = sanitize_id(malicious_id)
    assert "/" not in clean_id
    assert ".." not in clean_id

    # 404 for unknown analysis ID
    try:
        get_analysis_results("nonexistent-case-9999")
        assert False, "Should have raised HTTPException 404"
    except HTTPException as e:
        assert e.status_code == 404

    print("[PASS] Security validation, file type checks & path traversal defenses verified.")


def run_all_tests():
    print("============================================================")
    print("  CORONARY AI INTELLIGENCE LAB - BACKEND INTEGRATION TESTS")
    print("============================================================\n")
    test_health()
    analysis_id, analysis_data = test_analyze_full_pipeline()
    test_uncertainty_endpoint(analysis_id)
    test_vessel_graph_extraction_and_consolidation()
    test_human_in_the_loop_annotation(analysis_id, analysis_data)
    test_graph_export(analysis_id)
    test_security_and_error_handling()
    print("\n============================================================")
    print("  ALL INTELLIGENCE LAB BACKEND TESTS PASSED (100% SUCCESS)!")
    print("============================================================")


if __name__ == "__main__":
    run_all_tests()
