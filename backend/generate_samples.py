"""Generates realistic coronary angiogram sample images for offline testing and demos."""

import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)

def generate_angiogram(vessel_type="LAD", stenosis_level=0.68, output_path="sample.png"):
    w, h = 512, 512
    img = Image.new("L", (w, h), 160)
    
    # 1. Non-uniform fluoroscopic background illumination with vignetting
    for y in range(h):
        for x in range(w):
            dx = (x - w * 0.48) / (w * 0.5)
            dy = (y - h * 0.52) / (h * 0.5)
            dist_sq = dx*dx + dy*dy
            # Slight gradient from fluoroscopy beam
            base_val = int(195 - dist_sq * 55 + (y / h) * 15 + random.randint(-6, 6))
            img.putpixel((x, y), max(0, min(255, base_val)))

    # 2. Add anatomical shadows (rib / spine gradient bands)
    draw = ImageDraw.Draw(img)
    # Spine vertical shadow on the right/left
    spine_x = int(w * 0.82)
    for sx in range(spine_x - 40, spine_x + 50):
        intensity = int(35 * math.exp(-((sx - spine_x) / 30) ** 2))
        for y in range(h):
            curr = img.getpixel((sx, y))
            img.putpixel((sx, y), max(0, curr - intensity))

    # Rib shadows (broad diagonal translucent bands)
    for rib_y in [90, 220, 350, 480]:
        for x in range(w):
            ry = int(rib_y + x * 0.25)
            for dy in range(-25, 25):
                cy = ry + dy
                if 0 <= cy < h:
                    shadow = int(18 * math.exp(-(dy / 15) ** 2))
                    img.putpixel((x, cy), max(0, img.getpixel((x, cy)) - shadow))

    # 3. Add Diagnostic Catheter (dark curved tube entering coronary ostium)
    cath_points = []
    cath_start_x, cath_start_y = int(w * 0.55), 0
    cath_end_x, cath_end_y = int(w * 0.50), int(h * 0.18)
    for i in range(50):
        t = i / 50.0
        cx = int((1-t)*cath_start_x + t*cath_end_x + 8*math.sin(t * math.pi))
        cy = int((1-t)*cath_start_y + t*cath_end_y)
        cath_points.append((cx, cy))
    
    for pt in cath_points:
        draw.ellipse([pt[0] - 5, pt[1] - 5, pt[0] + 5, pt[1] + 5], fill=35)

    # 4. Draw Coronary Arteries (radio-opaque contrast dye - dark on light fluoroscopy)
    # Vessel mask layer to blend smoothly
    vessel_layer = Image.new("L", (w, h), 0)
    vdraw = ImageDraw.Draw(vessel_layer)

    if vessel_type == "LAD":
        # Main Left Main & LAD
        lad_points = []
        p0 = (int(w * 0.50), int(h * 0.18))
        p1 = (int(w * 0.51), int(h * 0.42))
        p2 = (int(w * 0.40), int(h * 0.88))

        steps = 140
        for i in range(steps):
            t = i / float(steps)
            cx = int((1-t)**2 * p0[0] + 2*(1-t)*t * p1[0] + t**2 * p2[0] + 3*math.sin(t * 12))
            cy = int((1-t)**2 * p0[1] + 2*(1-t)*t * p1[1] + t**2 * p2[1])
            
            # Stenosis at t=0.45 - 0.53
            if 0.44 <= t <= 0.54:
                sten_factor = 1.0 - stenosis_level * (1.0 - abs(t - 0.49) / 0.05)
                r = max(2, int(w * 0.018 * (1 - t * 0.5) * sten_factor))
            else:
                r = max(3, int(w * 0.018 * (1 - t * 0.5)))
            
            lad_points.append((cx, cy, r))

        for cx, cy, r in lad_points:
            vdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=210)

        # Diagonal 1
        d1_origin = lad_points[int(steps * 0.35)]
        for i in range(70):
            t = i / 70.0
            cx = int(d1_origin[0] + t * w * 0.28 + 4*math.sin(t * 10))
            cy = int(d1_origin[1] + t * h * 0.26)
            r = max(2, int(d1_origin[2] * 0.7 * (1 - t * 0.55)))
            vdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=180)

        # Diagonal 2
        d2_origin = lad_points[int(steps * 0.65)]
        for i in range(50):
            t = i / 50.0
            cx = int(d2_origin[0] + t * w * 0.20 + 3*math.sin(t * 8))
            cy = int(d2_origin[1] + t * h * 0.22)
            r = max(1, int(d2_origin[2] * 0.65 * (1 - t * 0.55)))
            vdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=160)

        # Circumflex (LCx) branch
        lcx_origin = lad_points[int(steps * 0.12)]
        for i in range(85):
            t = i / 85.0
            cx = int(lcx_origin[0] - t * w * 0.34 + 5*math.sin(t * 10))
            cy = int(lcx_origin[1] + t * h * 0.38)
            r = max(2, int(w * 0.015 * (1 - t * 0.6)))
            vdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=190)

    elif vessel_type == "RCA":
        # Right Coronary Artery (C-shaped curve)
        rca_points = []
        p0 = (int(w * 0.40), int(h * 0.16))
        p1 = (int(w * 0.72), int(h * 0.48))
        p2 = (int(w * 0.38), int(h * 0.86))

        steps = 140
        for i in range(steps):
            t = i / float(steps)
            cx = int((1-t)**2 * p0[0] + 2*(1-t)*t * p1[0] + t**2 * p2[0])
            cy = int((1-t)**2 * p0[1] + 2*(1-t)*t * p1[1] + t**2 * p2[1])
            
            if 0.45 <= t <= 0.56:
                sten_factor = 1.0 - stenosis_level * (1.0 - abs(t - 0.50) / 0.06)
                r = max(2, int(w * 0.020 * (1 - t * 0.35) * sten_factor))
            else:
                r = max(3, int(w * 0.020 * (1 - t * 0.35)))
            
            rca_points.append((cx, cy, r))

        for cx, cy, r in rca_points:
            vdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=210)

        # Acute marginal branch
        m_origin = rca_points[int(steps * 0.50)]
        for i in range(60):
            t = i / 60.0
            cx = int(m_origin[0] - t * w * 0.22)
            cy = int(m_origin[1] + t * h * 0.15)
            r = max(1, int(m_origin[2] * 0.6 * (1 - t * 0.5)))
            vdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=170)
            
    else: # Normal
        # Normal patent LAD without focal stenosis
        p0 = (int(w * 0.50), int(h * 0.18))
        p1 = (int(w * 0.48), int(h * 0.46))
        p2 = (int(w * 0.42), int(h * 0.88))

        steps = 130
        for i in range(steps):
            t = i / float(steps)
            cx = int((1-t)**2 * p0[0] + 2*(1-t)*t * p1[0] + t**2 * p2[0] + 2*math.sin(t * 10))
            cy = int((1-t)**2 * p0[1] + 2*(1-t)*t * p1[1] + t**2 * p2[1])
            r = max(3, int(w * 0.019 * (1 - t * 0.48)))
            vdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=210)

    # Blur vessel layer to simulate radiographic partial-volume effects
    vessel_layer = vessel_layer.filter(ImageFilter.GaussianBlur(radius=1.8))
    
    # Subtract vessel contrast from fluoroscopy image (iodine appears dark)
    v_bytes = vessel_layer.tobytes()
    i_bytes = img.tobytes()
    final_bytes = bytes(
        max(15, int(ib - (vb / 255.0) * 135 + random.randint(-3, 3)))
        for ib, vb in zip(i_bytes, v_bytes)
    )
    final_img = Image.frombytes("L", (w, h), final_bytes)
    
    # Add subtle high-frequency Poisson noise
    final_img = final_img.filter(ImageFilter.GaussianBlur(radius=0.6))
    
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    final_img.save(output_path, "PNG")
    print(f"Generated {output_path}")

if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent / "samples"
    out_dir.mkdir(parents=True, exist_ok=True)
    generate_angiogram("LAD", stenosis_level=0.68, output_path=str(out_dir / "sample_lad_stenosis.png"))
    generate_angiogram("RCA", stenosis_level=0.76, output_path=str(out_dir / "sample_rca_lesion.png"))
    generate_angiogram("Normal", stenosis_level=0.15, output_path=str(out_dir / "sample_normal_angiogram.png"))
