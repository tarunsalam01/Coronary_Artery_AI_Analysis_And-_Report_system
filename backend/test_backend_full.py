import io
import json
from pathlib import Path
from starlette.datastructures import UploadFile
from main import health, evaluation, list_samples, analyze

def run_tests():
    print("Testing GET /api/health...")
    h = health()
    assert h["status"] == "ok"
    assert h["ai_pipeline_ready"] is True
    print("Health check OK:", h)

    print("\nTesting GET /api/evaluation...")
    ev = evaluation()
    assert ev["available"] is True
    assert ev["dice_score"] > 0.8
    print("Evaluation OK:", ev)

    print("\nTesting GET /api/samples...")
    samples = list_samples()
    print("Samples count:", len(samples["samples"]))
    assert len(samples["samples"]) >= 3

    print("\nTesting POST /api/analyze with sample_lad_stenosis.png...")
    sample_path = Path(__file__).resolve().parent.parent / "samples" / "sample_lad_stenosis.png"
    with open(sample_path, "rb") as f:
        file_bytes = f.read()

    upload_file = UploadFile(
        file=io.BytesIO(file_bytes),
        filename="sample_lad_stenosis.png"
    )

    response = analyze(file=upload_file)
    data = json.loads(response.body.decode("utf-8"))
    
    print("\nAnalysis Result:")
    print("Case Ref:", data["case_reference"])
    print("Target Vessel:", data["target_vessel"])
    print("Stenosis %:", data["stenosis_percentage"])
    print("Classification:", data["stenosis_classification"])
    print("Ref Diameter:", data["reference_diameter_mm"], "mm")
    print("Min Lumen Diameter:", data["min_lumen_diameter_mm"], "mm")
    print("Confidence:", data["confidence_score"], "%")
    print("Mask Data URL Length:", len(data["mask_image"]))
    print("Annotated Image URL Length:", len(data["annotated_image"]))
    print("Segments count:", len(data["segments"]))
    for seg in data["segments"]:
        print(f"  [{seg['number']}] {seg['name']}: {seg['stenosis']} ({seg['status']})")
    
    assert data["status"] == "success"
    assert "data:image/png;base64," in data["mask_image"]
    assert "data:image/jpeg;base64," in data["annotated_image"]
    print("\n>>> ALL BACKEND TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    run_tests()
