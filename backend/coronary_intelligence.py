"""
Coronary AI Intelligence Lab Core Processing Engine
Provides:
1. AI Confidence and Epistemic/Aleatoric Uncertainty Estimation
2. Coronary Vessel Skeletonization & Topological Graph Extraction
3. Human-in-the-Loop Mask Comparison and Annotation State Tracking
"""

import io
import math
import uuid
import base64
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Set, Optional
from collections import deque
from PIL import Image, ImageOps, ImageStat, ImageFilter, ImageDraw


# ==============================================================================
# FEATURE 1: AI CONFIDENCE & UNCERTAINTY ESTIMATION
# ==============================================================================

def compute_uncertainty_map(
    proc_img: Image.Image,
    binary_mask: Image.Image,
    vesselness_img: Optional[Image.Image] = None
) -> Dict[str, Any]:
    """
    Computes a mathematically grounded pixel-wise uncertainty map and summary metrics.
    
    Methodology:
    1. Calibrated Pixel Prediction Probability P(vessel|x, y):
       Continuous vesselness response V(x, y) is mapped through a calibrated sigmoid
       around the adaptive segmentation threshold T.
    2. Aleatoric / Boundary Ambiguity (Normalized Shannon Entropy):
       H(x, y) = -P*log2(P) - (1-P)*log2(1-P)
       Maximized at H=1.0 when P=0.5 (exact lumen boundary transition zone).
    3. Epistemic / Scale Inconsistency (Multi-scale scale variance):
       Variance across multi-scale Gaussian derivative filters sigma in {1.5, 4.0, 8.0}
       captures structural ambiguity at bifurcations, calcifications, and low SNR zones.
    4. Combined Uncertainty Metric U(x, y) in [0.0, 1.0]:
       Weighted blend of Shannon entropy and scale variance.
    """
    pw, ph = proc_img.size
    gray = proc_img.convert("L")
    mask_gray = binary_mask.convert("L").resize((pw, ph), Image.Resampling.NEAREST)

    # Check for empty or invalid mask
    mask_stat = ImageStat.Stat(mask_gray)
    vessel_pixel_count = sum(1 for p in mask_gray.tobytes() if p > 128)
    if vessel_pixel_count < 10:
        return {
            "available": False,
            "reason": "Segmentation mask contains insufficient vessel signal for reliable uncertainty calibration."
        }

    # If vesselness image was not provided, compute multi-scale vesselness
    if vesselness_img is None:
        contrast_img = ImageOps.autocontrast(gray)
        bg = contrast_img.filter(ImageFilter.GaussianBlur(radius=max(8, pw // 40)))
        diff_dark = ImageOps.invert(ImageOps.autocontrast(Image.frombytes(
            "L", (pw, ph),
            bytes(max(0, min(255, b - c)) for b, c in zip(bg.tobytes(), contrast_img.tobytes()))
        )))
        diff_bright = ImageOps.autocontrast(Image.frombytes(
            "L", (pw, ph),
            bytes(max(0, min(255, c - b)) for b, c in zip(bg.tobytes(), contrast_img.tobytes()))
        ))
        var_dark = ImageStat.Stat(diff_dark).stddev[0]
        var_bright = ImageStat.Stat(diff_bright).stddev[0]
        base_vessel = diff_bright if var_bright > var_dark else diff_dark

        blur_fine = base_vessel.filter(ImageFilter.GaussianBlur(radius=1.5))
        blur_medium = base_vessel.filter(ImageFilter.GaussianBlur(radius=4.0))
        blur_coarse = base_vessel.filter(ImageFilter.GaussianBlur(radius=8.0))

        vesselness_bytes = bytes(
            max(0, min(255, int(1.4 * f - 0.7 * m - 0.3 * c + 30)))
            for f, m, c in zip(blur_fine.tobytes(), blur_medium.tobytes(), blur_coarse.tobytes())
        )
        vesselness = Image.frombytes("L", (pw, ph), vesselness_bytes)
        f_bytes = blur_fine.tobytes()
        m_bytes = blur_medium.tobytes()
        c_bytes = blur_coarse.tobytes()
    else:
        vesselness = vesselness_img.convert("L").resize((pw, ph), Image.Resampling.BILINEAR)
        f_bytes = vesselness.filter(ImageFilter.GaussianBlur(radius=1.5)).tobytes()
        m_bytes = vesselness.filter(ImageFilter.GaussianBlur(radius=4.0)).tobytes()
        c_bytes = vesselness.filter(ImageFilter.GaussianBlur(radius=8.0)).tobytes()

    v_stat = ImageStat.Stat(vesselness)
    mean_v = v_stat.mean[0]
    std_v = max(1.0, v_stat.stddev[0])
    thresh = max(110.0, mean_v + 0.45 * std_v)

    # Compute pixel-wise prediction probability, Shannon entropy, and scale variance
    v_bytes = vesselness.tobytes()
    m_bytes_arr = mask_gray.tobytes()
    n_pixels = pw * ph

    uncertainty_vals = bytearray(n_pixels)
    rgba_bytes = bytearray(n_pixels * 4)

    total_u = 0.0
    vessel_u_sum = 0.0
    vessel_pixels = 0
    boundary_u_sum = 0.0
    boundary_pixels = 0

    hist_bins = [0, 0, 0, 0, 0]  # [0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0]

    # Pre-dilated and eroded masks to detect border zone
    dilated_mask = mask_gray.filter(ImageFilter.MaxFilter(size=5))
    eroded_mask = mask_gray.filter(ImageFilter.MinFilter(size=5))
    dilated_bytes = dilated_mask.tobytes()
    eroded_bytes = eroded_mask.tobytes()

    for i in range(n_pixels):
        v = v_bytes[i]
        is_in_mask = m_bytes_arr[i] > 128
        is_boundary = dilated_bytes[i] > 128 and eroded_bytes[i] <= 128

        # 1. Calibrated Probability P(vessel) using sigmoid
        z = (v - thresh) / (std_v * 0.45)
        # Avoid overflow
        z = max(-15.0, min(15.0, z))
        prob = 1.0 / (1.0 + math.exp(-z))

        # 2. Shannon Entropy H(prob) normalized to [0, 1]
        p_safe = max(1e-5, min(1.0 - 1e-5, prob))
        entropy = - (p_safe * math.log2(p_safe) + (1.0 - p_safe) * math.log2(1.0 - p_safe))

        # 3. Multi-scale filter variance
        fb = f_bytes[i] / 255.0
        mb = m_bytes[i] / 255.0
        cb = c_bytes[i] / 255.0
        mu = (fb + mb + cb) / 3.0
        scale_var = ((fb - mu)**2 + (mb - mu)**2 + (cb - mu)**2) / 3.0
        norm_scale_var = min(1.0, math.sqrt(scale_var) * 3.5)

        # 4. Combined Uncertainty U in [0, 1]
        u = min(1.0, max(0.0, 0.70 * entropy + 0.30 * norm_scale_var))

        # Suppress noise in deep background far from vessels
        if dilated_bytes[i] == 0:
            u *= 0.35

        u_byte = int(round(u * 255))
        uncertainty_vals[i] = u_byte

        total_u += u
        if is_in_mask:
            vessel_u_sum += u
            vessel_pixels += 1
        if is_boundary:
            boundary_u_sum += u
            boundary_pixels += 1

        # Histogram bin
        bin_idx = min(4, int(u * 5))
        hist_bins[bin_idx] += 1

        # Colormap mapping (Turbo/Thermal aesthetic: Deep Navy -> Cyan -> Yellow -> Intense Red)
        # Only render visible color where uncertainty > 0.12
        if u < 0.12:
            r, g, b_c, a = 0, 0, 0, 0
        elif u < 0.40:
            # Low uncertainty / confident vessel or background: Cyan / Teal
            t = (u - 0.12) / 0.28
            r = int(10 * (1 - t) + 27 * t)
            g = int(120 * (1 - t) + 199 * t)
            b_c = int(220 * (1 - t) + 179 * t)
            a = int(60 + 100 * t)
        elif u < 0.70:
            # Moderate uncertainty: Yellow / Amber
            t = (u - 0.40) / 0.30
            r = int(27 * (1 - t) + 245 * t)
            g = int(199 * (1 - t) + 158 * t)
            b_c = int(179 * (1 - t) + 11 * t)
            a = int(160 + 50 * t)
        else:
            # High uncertainty: Coral / Crimson Red
            t = (u - 0.70) / 0.30
            r = int(245 * (1 - t) + 239 * t)
            g = int(158 * (1 - t) + 68 * t)
            b_c = int(11 * (1 - t) + 68 * t)
            a = int(210 + 45 * t)

        base_idx = i * 4
        rgba_bytes[base_idx] = r
        rgba_bytes[base_idx + 1] = g
        rgba_bytes[base_idx + 2] = b_c
        rgba_bytes[base_idx + 3] = a

    # Heatmap image
    heatmap_img = Image.frombytes("RGBA", (pw, ph), bytes(rgba_bytes))
    heatmap_buffer = io.BytesIO()
    heatmap_img.save(heatmap_buffer, format="PNG")
    heatmap_b64 = "data:image/png;base64," + base64.b64encode(heatmap_buffer.getvalue()).decode("utf-8")

    mean_uncertainty = total_u / max(1, n_pixels)
    vessel_mean_uncertainty = vessel_u_sum / max(1, vessel_pixels)
    boundary_mean_uncertainty = boundary_u_sum / max(1, boundary_pixels)

    # Model Confidence (%) over vessel lumen
    vessel_confidence_pct = round(max(50.0, min(99.0, (1.0 - vessel_mean_uncertainty) * 100)), 1)
    high_uncertainty_vessel_pct = round(
        (sum(1 for i in range(n_pixels) if m_bytes_arr[i] > 128 and uncertainty_vals[i] > 128) / max(1, vessel_pixels)) * 100,
        1
    )

    if vessel_mean_uncertainty < 0.28:
        reliability = "High Reliability"
        reliability_desc = "Vessel contours and lumen contrast exhibit sharp separation from background."
        reliability_class = "success"
    elif vessel_mean_uncertainty < 0.45:
        reliability = "Moderate Reliability"
        reliability_desc = "Mild boundary ambiguity along distal tapers or overlapping anatomical structures. Visual review recommended."
        reliability_class = "warning"
    else:
        reliability = "Low Confidence / High Ambiguity"
        reliability_desc = "Significant uncertainty detected around vessel boundaries or low-contrast regions. Manual annotation recommended."
        reliability_class = "danger"

    return {
        "available": True,
        "method": "Multi-scale Calibrated Shannon Entropy & Scale Discordance",
        "mean_uncertainty": round(mean_uncertainty, 4),
        "vessel_mean_uncertainty": round(vessel_mean_uncertainty, 4),
        "boundary_mean_uncertainty": round(boundary_mean_uncertainty, 4),
        "vessel_confidence_pct": vessel_confidence_pct,
        "high_uncertainty_vessel_pct": high_uncertainty_vessel_pct,
        "reliability": reliability,
        "reliability_desc": reliability_desc,
        "reliability_class": reliability_class,
        "uncertainty_heatmap": heatmap_b64,
        "histogram": {
            "bins": ["[0.0-0.2]", "[0.2-0.4]", "[0.4-0.6]", "[0.6-0.8]", "[0.8-1.0]"],
            "counts": hist_bins,
            "percentages": [round((c / n_pixels) * 100, 2) for c in hist_bins]
        },
        "explanation": (
            "Uncertainty reflects prediction ambiguity derived from Shannon information entropy "
            "and multi-scale tubular filter variance. High uncertainty (red/yellow) localizes at "
            "vessel borders, faint distal bifurcations, and low-contrast regions, distinguishing "
            "border uncertainty from confident lumen core predictions."
        )
    }


# ==============================================================================
# FEATURE 2: CORONARY VESSEL GRAPH EXPLORER
# ==============================================================================

def extract_vessel_graph(
    binary_mask: Image.Image,
    min_component_size: int = 15,
    min_segment_length: float = 4.0
) -> Dict[str, Any]:
    """
    Extracts a topological vessel graph from the segmented binary mask.
    
    Steps:
    1. Morphological cleaning & small artifact removal.
    2. Topological skeletonization (Zhang-Suen centerline thinning).
    3. Detection of endpoints (degree 1) and candidate junctions (degree >= 3).
    4. Crucial consolidation of neighboring junction pixels into single consolidated
       branch centroid nodes to prevent artificial duplicate branches.
    5. Segment tracing between nodes, calculating arc length, chord length,
       average caliber (lumen diameter), and tortuosity index.
    6. Returns clean graph nodes, edges, and topological metrics without
       unvalidated arterial claims.
    """
    w, h = binary_mask.size
    mask = binary_mask.convert("L")

    # Step 1: Filter out tiny pinholes and specks
    mask = mask.filter(ImageFilter.MaxFilter(size=3))
    mask = mask.filter(ImageFilter.MinFilter(size=3))

    pixels = mask.load()
    fg_pts = set()
    for y in range(h):
        for x in range(w):
            if pixels[x, y] > 128:
                fg_pts.add((x, y))

    if len(fg_pts) < min_component_size:
        return {
            "available": False,
            "error": "The segmentation mask contains too few vessel pixels to extract a topological graph.",
            "total_nodes": 0,
            "total_segments": 0,
            "nodes": [],
            "edges": []
        }

    # Step 2: Skeletonization via optimized Zhang-Suen Thinning
    skeleton_pts = _zhang_suen_skeletonize(fg_pts, w, h)
    if len(skeleton_pts) < 4:
        return {
            "available": False,
            "error": "Skeletonization produced insufficient centerline length.",
            "total_nodes": 0,
            "total_segments": 0,
            "nodes": [],
            "edges": []
        }

    # Step 3: Compute pixel neighbor map on skeleton
    offsets_8 = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]
    nbr_map: Dict[Tuple[int, int], List[Tuple[int, int]]] = {}
    for (x, y) in skeleton_pts:
        nbrs = [(x + dx, y + dy) for dx, dy in offsets_8 if (x + dx, y + dy) in skeleton_pts]
        nbr_map[(x, y)] = nbrs

    endpoints_raw = {p for p, nbrs in nbr_map.items() if len(nbrs) == 1}
    junctions_raw = {p for p, nbrs in nbr_map.items() if len(nbrs) >= 3}

    # Step 4: Consolidate neighboring junction pixels into branch nodes
    visited_junctions = set()
    raw_branch_clusters: List[List[Tuple[int, int]]] = []

    for p in junctions_raw:
        if p in visited_junctions:
            continue
        cluster = []
        q = deque([p])
        visited_junctions.add(p)
        while q:
            curr = q.popleft()
            cluster.append(curr)
            for nbr in nbr_map[curr]:
                if nbr in junctions_raw and nbr not in visited_junctions:
                    visited_junctions.add(nbr)
                    q.append(nbr)
        raw_branch_clusters.append(cluster)

    # Secondary proximity merge: merge branch clusters within Euclidean distance <= 6.0 pixels
    # (prevents tiny skeleton bridges or triangular loops from forming multiple branch points)
    merged_clusters: List[List[Tuple[int, int]]] = []
    cluster_merged = [False] * len(raw_branch_clusters)

    for i in range(len(raw_branch_clusters)):
        if cluster_merged[i]:
            continue
        combined_cluster = list(raw_branch_clusters[i])
        cluster_merged[i] = True
        
        # Check all other clusters
        changed_merge = True
        while changed_merge:
            changed_merge = False
            for j in range(len(raw_branch_clusters)):
                if cluster_merged[j]:
                    continue
                # Check distance between any point in combined_cluster and raw_branch_clusters[j]
                min_d = min(
                    math.hypot(p1[0] - p2[0], p1[1] - p2[1])
                    for p1 in combined_cluster
                    for p2 in raw_branch_clusters[j]
                )
                if min_d <= 6.0:
                    combined_cluster.extend(raw_branch_clusters[j])
                    cluster_merged[j] = True
                    changed_merge = True

        merged_clusters.append(combined_cluster)

    consolidated_branch_nodes: List[Dict[str, Any]] = []
    pixel_to_branch_id: Dict[Tuple[int, int], str] = {}

    for idx, cluster in enumerate(merged_clusters, 1):
        cx = int(round(sum(pt[0] for pt in cluster) / len(cluster)))
        cy = int(round(sum(pt[1] for pt in cluster) / len(cluster)))
        b_id = f"node_b_{idx}"

        consolidated_branch_nodes.append({
            "id": b_id,
            "type": "branch_point",
            "label": f"Branch Point #{idx}",
            "x": cx,
            "y": cy,
            "cluster_size": len(cluster),
            "pixels": cluster,
            "connected_segments": []
        })
        for pt in cluster:
            pixel_to_branch_id[pt] = b_id


    # Endpoint nodes
    endpoint_nodes: List[Dict[str, Any]] = []
    pixel_to_end_id: Dict[Tuple[int, int], str] = {}
    end_counter = 1
    for p in endpoints_raw:
        e_id = f"node_e_{end_counter}"
        end_counter += 1
        endpoint_nodes.append({
            "id": e_id,
            "type": "endpoint",
            "label": f"Terminal Node #{len(endpoint_nodes)+1}",
            "x": p[0],
            "y": p[1],
            "cluster_size": 1,
            "pixels": [p],
            "connected_segments": []
        })
        pixel_to_end_id[p] = e_id

    # Distance map to calculate local lumen caliber from binary mask
    dist_map = _approximate_distance_transform(mask, w, h)

    # Step 5: Trace segments (edges) along skeleton paths
    all_nodes_dict: Dict[str, Dict[str, Any]] = {
        n["id"]: n for n in consolidated_branch_nodes + endpoint_nodes
    }

    # Trace paths starting from each node out into adjacent unvisited skeleton pixels
    visited_edges_pixel_pairs = set()
    edges: List[Dict[str, Any]] = []
    edge_counter = 1

    # To trace edges, consider all node pixels and their external path neighbors
    for node in list(all_nodes_dict.values()):
        node_id = node["id"]
        node_pixels = set(node["pixels"])

        # Find external skeleton neighbors connected to this node
        external_starts = []
        for np in node_pixels:
            for nbr in nbr_map[np]:
                if nbr not in node_pixels:
                    external_starts.append((np, nbr))

        for np_start, path_first in external_starts:
            pair_key = tuple(sorted([np_start, path_first]))
            if pair_key in visited_edges_pixel_pairs:
                continue

            # Walk along skeleton path
            path = [node["x"], node["y"]]  # Start at centroid
            raw_path_pts = [np_start, path_first]
            visited_edges_pixel_pairs.add(pair_key)

            curr = path_first
            prev = np_start
            reached_node_id = None

            while True:
                # Check if current point belongs to a node
                if curr in pixel_to_branch_id and pixel_to_branch_id[curr] != node_id:
                    reached_node_id = pixel_to_branch_id[curr]
                    break
                if curr in pixel_to_end_id and pixel_to_end_id[curr] != node_id:
                    reached_node_id = pixel_to_end_id[curr]
                    break

                # Advance to next neighbor
                next_candidates = [n for n in nbr_map[curr] if n != prev and n not in node_pixels]
                if not next_candidates:
                    break

                next_pt = next_candidates[0]
                visited_edges_pixel_pairs.add(tuple(sorted([curr, next_pt])))
                prev = curr
                curr = next_pt
                raw_path_pts.append(curr)

                if curr in pixel_to_branch_id and pixel_to_branch_id[curr] != node_id:
                    reached_node_id = pixel_to_branch_id[curr]
                    break
                if curr in pixel_to_end_id and pixel_to_end_id[curr] != node_id:
                    reached_node_id = pixel_to_end_id[curr]
                    break

            if reached_node_id is None:
                # Path terminated without hitting another registered node
                continue

            # Calculate arc length
            arc_length = 0.0
            for i in range(len(raw_path_pts) - 1):
                p1 = raw_path_pts[i]
                p2 = raw_path_pts[i + 1]
                arc_length += math.hypot(p2[0] - p1[0], p2[1] - p1[1])

            # Filter tiny spurs
            if arc_length < min_segment_length:
                continue

            target_node = all_nodes_dict[reached_node_id]
            chord_length = math.hypot(target_node["x"] - node["x"], target_node["y"] - node["y"])
            tortuosity = round(arc_length / max(1.0, chord_length), 3)

            # Measure average caliber across path using distance transform
            calibers = [2.0 * dist_map.get(pt, 1.5) for pt in raw_path_pts]
            avg_caliber = round(sum(calibers) / max(1, len(calibers)), 2)

            edge_id = f"seg_{edge_counter}"
            edge_counter += 1

            # Subsample path points for smooth web visualization (max 40 points per edge)
            step = max(1, len(raw_path_pts) // 30)
            sampled_coords = [[pt[0], pt[1]] for pt in raw_path_pts[::step]]
            if [target_node["x"], target_node["y"]] not in sampled_coords:
                sampled_coords.append([target_node["x"], target_node["y"]])

            edge_obj = {
                "id": edge_id,
                "label": f"Vessel Segment #{len(edges)+1}",
                "source": node_id,
                "target": reached_node_id,
                "source_coord": [node["x"], node["y"]],
                "target_coord": [target_node["x"], target_node["y"]],
                "arc_length_px": round(arc_length, 1),
                "chord_length_px": round(chord_length, 1),
                "tortuosity": tortuosity,
                "average_caliber_px": avg_caliber,
                "coordinates": sampled_coords
            }
            edges.append(edge_obj)

            node["connected_segments"].append(edge_id)
            target_node["connected_segments"].append(edge_id)

    # Clean up node degrees and prune disconnected single nodes
    final_nodes = []
    for n in all_nodes_dict.values():
        connected = list(set(n["connected_segments"]))
        if len(connected) > 0:
            final_nodes.append({
                "id": n["id"],
                "type": n["type"],
                "label": n["label"],
                "x": n["x"],
                "y": n["y"],
                "degree": len(connected),
                "connected_segments": connected
            })

    # Render Centerline Skeleton Overlay Image (RGBA)
    skel_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    skel_draw = ImageDraw.Draw(skel_img)

    for edge in edges:
        pts = [tuple(c) for c in edge["coordinates"]]
        if len(pts) >= 2:
            skel_draw.line(pts, fill=(27, 199, 179, 230), width=3)  # Bright Teal Centerline

    for node in final_nodes:
        x, y = node["x"], node["y"]
        if node["type"] == "branch_point":
            # Orange / Coral bifurcation marker
            skel_draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(245, 158, 11, 255), outline=(255, 255, 255, 255), width=2)
        else:
            # Green / Emerald terminal endpoint marker
            skel_draw.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(16, 185, 129, 255), outline=(255, 255, 255, 255), width=2)

    skel_buffer = io.BytesIO()
    skel_img.save(skel_buffer, format="PNG")
    skel_b64 = "data:image/png;base64," + base64.b64encode(skel_buffer.getvalue()).decode("utf-8")

    total_length = sum(e["arc_length_px"] for e in edges)
    avg_tortuosity = round(sum(e["tortuosity"] for e in edges) / max(1, len(edges)), 3)

    return {
        "available": True,
        "total_nodes": len(final_nodes),
        "branch_points_count": sum(1 for n in final_nodes if n["type"] == "branch_point"),
        "endpoints_count": sum(1 for n in final_nodes if n["type"] == "endpoint"),
        "total_segments": len(edges),
        "total_vessel_length_px": round(total_length, 1),
        "average_tortuosity": avg_tortuosity,
        "nodes": final_nodes,
        "edges": edges,
        "centerline_overlay": skel_b64,
        "units": "pixels (uncalibrated 2D fluoroscopic projection)"
    }


def _zhang_suen_skeletonize(pts: Set[Tuple[int, int]], w: int, h: int) -> Set[Tuple[int, int]]:
    """Fast, topology-preserving Zhang-Suen morphological skeletonization."""
    skel = set(pts)
    offsets = [
        (0, -1),   # P2
        (1, -1),   # P3
        (1, 0),    # P4
        (1, 1),    # P5
        (0, 1),    # P6
        (-1, 1),   # P7
        (-1, 0),   # P8
        (-1, -1),  # P9
    ]

    changed = True
    iterations = 0
    while changed and iterations < 120:
        changed = False
        iterations += 1

        # Step 1
        to_del_1 = []
        for x, y in skel:
            vals = [1 if (x + dx, y + dy) in skel else 0 for dx, dy in offsets]
            b_p1 = sum(vals)
            if not (2 <= b_p1 <= 6):
                continue
            vals_cycle = vals + [vals[0]]
            a_p1 = sum(1 for i in range(8) if vals_cycle[i] == 0 and vals_cycle[i + 1] == 1)
            if a_p1 != 1:
                continue
            if vals[0] * vals[2] * vals[4] != 0:
                continue
            if vals[2] * vals[4] * vals[6] != 0:
                continue
            to_del_1.append((x, y))

        if to_del_1:
            for p in to_del_1:
                skel.discard(p)
            changed = True

        # Step 2
        to_del_2 = []
        for x, y in skel:
            vals = [1 if (x + dx, y + dy) in skel else 0 for dx, dy in offsets]
            b_p1 = sum(vals)
            if not (2 <= b_p1 <= 6):
                continue
            vals_cycle = vals + [vals[0]]
            a_p1 = sum(1 for i in range(8) if vals_cycle[i] == 0 and vals_cycle[i + 1] == 1)
            if a_p1 != 1:
                continue
            if vals[0] * vals[2] * vals[6] != 0:
                continue
            if vals[0] * vals[4] * vals[6] != 0:
                continue
            to_del_2.append((x, y))

        if to_del_2:
            for p in to_del_2:
                skel.discard(p)
            changed = True

    return skel


def _approximate_distance_transform(mask: Image.Image, w: int, h: int) -> Dict[Tuple[int, int], float]:
    """Calculates approximate Euclidean distance to the vessel lumen border for caliber measurements."""
    pixels = mask.load()
    dist: Dict[Tuple[int, int], float] = {}
    # Use iterative min-filter peeling to measure radius
    curr_mask = mask.copy()
    radius = 1.0

    while radius <= 25.0:
        eroded = curr_mask.filter(ImageFilter.MinFilter(size=3))
        eroded_pixels = eroded.load()
        cleared_count = 0
        for y in range(h):
            for x in range(w):
                if pixels[x, y] > 128 and eroded_pixels[x, y] <= 128 and (x, y) not in dist:
                    dist[(x, y)] = radius
                    cleared_count += 1
        if cleared_count == 0:
            break
        curr_mask = eroded
        radius += 1.5

    return dist


# ==============================================================================
# FEATURE 3: HUMAN-IN-THE-LOOP ANNOTATION & COMPARISON
# ==============================================================================

def compare_masks(
    original_mask: Image.Image,
    corrected_mask: Image.Image
) -> Dict[str, Any]:
    """
    Compares the original AI-generated segmentation mask with a researcher-corrected mask.
    Computes exact pixel modifications (added/erased), net area delta, Dice score, and Jaccard IoU.
    Generates a color-coded visual difference map (Green=Added, Red=Erased, Teal=Consensus).
    """
    w, h = original_mask.size
    orig_l = original_mask.convert("L")
    corr_l = corrected_mask.convert("L").resize((w, h), Image.Resampling.NEAREST)

    orig_bytes = orig_l.tobytes()
    corr_bytes = corr_l.tobytes()
    n_pixels = w * h

    diff_rgba = bytearray(n_pixels * 4)

    orig_count = 0
    corr_count = 0
    intersection = 0
    pixels_added = 0
    pixels_removed = 0
    consensus_pixels = 0

    for i in range(n_pixels):
        o = orig_bytes[i] > 128
        c = corr_bytes[i] > 128

        if o:
            orig_count += 1
        if c:
            corr_count += 1

        base_idx = i * 4
        if o and c:
            # Consensus (Both agreed: AI + Human verified) -> Teal
            intersection += 1
            consensus_pixels += 1
            diff_rgba[base_idx] = 27
            diff_rgba[base_idx + 1] = 199
            diff_rgba[base_idx + 2] = 179
            diff_rgba[base_idx + 3] = 200
        elif not o and c:
            # Added by human (AI false negative corrected) -> Emerald Green
            pixels_added += 1
            diff_rgba[base_idx] = 16
            diff_rgba[base_idx + 1] = 185
            diff_rgba[base_idx + 2] = 129
            diff_rgba[base_idx + 3] = 220
        elif o and not c:
            # Removed by human (AI false positive corrected) -> Crimson Red
            pixels_removed += 1
            diff_rgba[base_idx] = 239
            diff_rgba[base_idx + 1] = 68
            diff_rgba[base_idx + 2] = 68
            diff_rgba[base_idx + 3] = 220
        else:
            # Background
            diff_rgba[base_idx] = 0
            diff_rgba[base_idx + 1] = 0
            diff_rgba[base_idx + 2] = 0
            diff_rgba[base_idx + 3] = 0

    union = orig_count + corr_count - intersection
    iou = round(intersection / max(1, union), 4)
    dice = round((2.0 * intersection) / max(1, orig_count + corr_count), 4)
    net_delta = corr_count - orig_count
    net_delta_pct = round((net_delta / max(1, orig_count)) * 100, 2)

    diff_img = Image.frombytes("RGBA", (w, h), bytes(diff_rgba))
    diff_buffer = io.BytesIO()
    diff_img.save(diff_buffer, format="PNG")
    diff_b64 = "data:image/png;base64," + base64.b64encode(diff_buffer.getvalue()).decode("utf-8")

    return {
        "original_vessel_pixels": orig_count,
        "corrected_vessel_pixels": corr_count,
        "consensus_pixels": consensus_pixels,
        "pixels_added": pixels_added,
        "pixels_removed": pixels_removed,
        "net_pixel_delta": net_delta,
        "net_area_change_pct": net_delta_pct,
        "agreement_dice": dice,
        "agreement_iou": iou,
        "difference_map_image": diff_b64
    }


# ==============================================================================
# AUDIT & SESSION STORE (IN-MEMORY WITH BOUNDED CAPACITY)
# ==============================================================================

class IntelligenceLabStore:
    """Stores active analyses, annotations, and audit histories safely in memory."""
    def __init__(self, max_records: int = 50):
        self.max_records = max_records
        self.records: Dict[str, Dict[str, Any]] = {}
        self.order: List[str] = []

    def save_analysis(self, analysis_id: str, record: Dict[str, Any]):
        if analysis_id in self.records:
            self.records[analysis_id].update(record)
            return
        if len(self.order) >= self.max_records:
            oldest = self.order.pop(0)
            self.records.pop(oldest, None)
        self.order.append(analysis_id)
        self.records[analysis_id] = record

    def get_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        return self.records.get(analysis_id)

    def save_annotation(
        self,
        analysis_id: str,
        corrected_mask_b64: str,
        notes: str = "",
        comparison_metrics: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        record = self.records.get(analysis_id, {})
        timestamp = datetime.now(timezone.utc).isoformat()
        annotation_entry = {
            "annotation_id": f"ann_{uuid.uuid4().hex[:8]}",
            "analysis_id": analysis_id,
            "timestamp": timestamp,
            "corrected_mask": corrected_mask_b64,
            "notes": notes,
            "comparison": comparison_metrics or {}
        }
        record["human_annotation"] = annotation_entry
        record["has_human_correction"] = True
        self.records[analysis_id] = record
        return annotation_entry

    def get_annotation(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        record = self.records.get(analysis_id)
        if record and "human_annotation" in record:
            return record["human_annotation"]
        return None


# Global store instance
LAB_STORE = IntelligenceLabStore()
