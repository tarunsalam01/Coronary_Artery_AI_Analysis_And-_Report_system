import shutil
from pathlib import Path

ROOT = Path(r"C:\Users\aditya salam\OneDrive\Hackverse2")
SUB = ROOT / "coronary-ai-hackathon-updated"

files_to_sync = [
    "index.html",
    "UploadandAnalysis.html",
    "IntelligenceLab.html",
    "Report.html",
    "Export.html",
    "style.css",
    "main.js",
    "default_lab_case.js",
    "default_lab_case.json",
    "README.md",
    ".gitignore",
    "start_backend.bat"
]

for name in files_to_sync:
    src = SUB / name
    if src.is_file():
        dest = ROOT / name
        shutil.copy2(src, dest)
        print(f"Synced {name} -> {dest}")

# Sync samples folder
if (SUB / "samples").exists():
    shutil.copytree(SUB / "samples", ROOT / "samples", dirs_exist_ok=True)
    print("Synced samples folder.")

# Sync backend folder (clean, excluding .venv and caches)
src_b = SUB / "backend"
dst_b = ROOT / "backend"
if src_b.exists():
    if dst_b.exists():
        shutil.rmtree(dst_b)
    dst_b.mkdir(parents=True, exist_ok=True)
    for item in src_b.iterdir():
        if item.name in [".venv", "__pycache__", "out.log", "err.log"]:
            continue
        if item.is_file():
            shutil.copy2(item, dst_b / item.name)
        elif item.is_dir():
            shutil.copytree(item, dst_b / item.name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    print("Synced clean backend folder.")

print("All files synchronized successfully to root folder!")
