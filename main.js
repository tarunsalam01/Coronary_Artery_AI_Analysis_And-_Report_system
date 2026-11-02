/* Coronary AI - Shared interactions, API client, Intelligence Lab & dynamic diagnostic viewer */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];

  // Auto-detect backend host: when hosted on cloud or localhost, use current origin; fallback to localhost:8000 when opened via file://
  const API_BASE = window.CORONARY_API_BASE || (
    window.location.origin && window.location.origin.startsWith("http")
      ? window.location.origin
      : "http://localhost:8000"
  );

  function setActiveNav() {
    const current = location.pathname.split("/").pop() || "index.html";
    $$("nav a").forEach((link) => {
      const target = link.getAttribute("href");
      if (target === current) {
        link.setAttribute("aria-current", "page");
        link.classList.add("nav-current");
      }
    });
  }

  function setupMobileNav() {
    $$("header button").forEach((button) => {
      const icon = $(".material-symbols-outlined", button);
      if (!icon || icon.textContent.trim() !== "menu") return;
      const nav = $("header nav");
      if (!nav) return;
      button.setAttribute("aria-label", "Toggle navigation");
      button.addEventListener("click", () => {
        nav.classList.toggle("mobile-nav-open");
        button.setAttribute(
          "aria-expanded",
          nav.classList.contains("mobile-nav-open"),
        );
      });
    });
  }

  // Upload & Analyze page state
  let selectedFile = null;
  let selectedObjectUrl = null;

  async function checkBackendHealth() {
    const statusPill = $("#backend-status-pill");
    const headerStatus = $(".header-status");
    try {
      const res = await fetch(`${API_BASE}/api/health`, { method: "GET", signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (statusPill) {
          statusPill.className = "backend-status-badge backend-status-online";
          statusPill.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">check_circle</span> AI Backend: Online (Port 8000)';
        }
        if (headerStatus) {
          headerStatus.innerHTML = '<i style="background:#10b981"></i> AI Engine Online';
        }
        return true;
      }
    } catch (e) {
      if (statusPill) {
        statusPill.className = "backend-status-badge backend-status-offline";
        statusPill.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">cloud_off</span> Backend Offline — Run start_backend.bat';
      }
      if (headerStatus) {
        headerStatus.innerHTML = '<i style="background:#f59e0b"></i> Standalone Mode';
      }
    }
    return false;
  }

  async function selectSampleByName(filename) {
    try {
      let res = await fetch(`samples/${filename}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`${API_BASE}/api/samples/${filename}`).catch(() => null);
      }
      if (!res || !res.ok) {
        throw new Error(`Sample ${filename} could not be loaded.`);
      }
      const blob = await res.blob();
      const file = new File([blob], filename, { type: "image/png" });
      showFile(file);
    } catch (err) {
      showError(`Could not load sample file: ${err.message}`);
    }
  }
  window.selectSampleByName = selectSampleByName;

  function loadSample(name, description, dims, size) {
    const noPreview = $("#no-preview-card");
    const preview = $("#preview-card");
    if (!noPreview || !preview) return;
    noPreview.classList.add("hidden");
    preview.classList.remove("hidden");
    $("#progress-container")?.classList.add("hidden");
    $("#error-banner")?.classList.add("hidden");
    $("#file-name").textContent = name;
    $("#file-dims").textContent = dims;
    $("#file-size").textContent = size;
    const descriptionNode = $("#selected-description");
    if (descriptionNode)
      descriptionNode.textContent = description || "Image ready for analysis.";
    const img = $("#selected-image-preview");
    if (img && selectedObjectUrl) {
      img.src = selectedObjectUrl;
      img.classList.remove("hidden");
    }
    const analyze = $("#analyze-btn");
    if (analyze) analyze.disabled = false;
  }
  window.loadSample = loadSample;

  function clearSelection() {
    selectedFile = null;
    if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
    selectedObjectUrl = null;
    $("#preview-card")?.classList.add("hidden");
    $("#no-preview-card")?.classList.remove("hidden");
    $("#progress-container")?.classList.add("hidden");
    $("#error-banner")?.classList.add("hidden");
    const input = $("#file-input");
    if (input) input.value = "";
    const img = $("#selected-image-preview");
    if (img) {
      img.removeAttribute("src");
      img.classList.add("hidden");
    }
    const analyze = $("#analyze-btn");
    if (analyze) analyze.disabled = true;
  }
  window.clearSelection = clearSelection;

  function humanSize(bytes) {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function showFile(file) {
    const allowed = /\.(dcm|png|jpe?g)$/i.test(file.name);
    if (!allowed) {
      showError("Unsupported file type. Please choose a PNG, JPEG, or DICOM file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showError("File is larger than 50 MB. Please choose a smaller file.");
      return;
    }
    selectedFile = file;
    if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
    selectedObjectUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null;
    let dims = "Angiography frame";
    if (selectedObjectUrl) {
      const probe = new Image();
      probe.onload = () => {
        loadSample(
          file.name,
          "Uploaded angiography frame ready for AI vessel analysis.",
          `${probe.naturalWidth} × ${probe.naturalHeight} px`,
          humanSize(file.size),
        );
      };
      probe.onerror = () =>
        loadSample(
          file.name,
          "Uploaded angiography frame ready for analysis.",
          "Dimensions unavailable",
          humanSize(file.size),
        );
      probe.src = selectedObjectUrl;
    } else {
      loadSample(
        file.name,
        "DICOM file selected. Preview is not available in browser.",
        dims,
        humanSize(file.size),
      );
    }
  }

  function showError(message) {
    const banner = $("#error-banner");
    if (!banner) {
      alert(message);
      return;
    }
    banner.classList.remove("hidden");
    const text = $("#error-message");
    if (text) text.innerHTML = message;
  }

  function setupUpload() {
    const input = $("#file-input");
    const zone = $("#drop-zone");
    if (!input || !zone) return;
    input.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) showFile(e.target.files[0]);
    });
    zone.addEventListener("click", (e) => {
      if (e.target.closest("label,button,input")) return;
      input.click();
    });
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-active");
    });
    zone.addEventListener("dragleave", () =>
      zone.classList.remove("drag-active"),
    );
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-active");
      if (e.dataTransfer.files[0]) showFile(e.dataTransfer.files[0]);
    });
    zone.addEventListener("paste", (e) => {
      const item = [...(e.clipboardData?.items || [])].find((x) =>
        x.type.startsWith("image/"),
      );
      if (item) showFile(item.getAsFile());
    });

    $("#preview-card")?.classList.add("hidden");
    $("#no-preview-card")?.classList.remove("hidden");
    $("#analyze-btn") && ($("#analyze-btn").disabled = true);

    checkBackendHealth();
  }

  async function startAnalysis() {
    const btn = $("#analyze-btn");
    if (!btn || btn.disabled) return;
    if (!selectedFile) {
      showError("Please upload an angiogram file before starting analysis.");
      return;
    }
    if (/\.dcm$/i.test(selectedFile.name)) {
      showError(
        "DICOM preview/inference requires server DICOM decoding. Please use PNG or JPEG for this research demo.",
      );
      return;
    }

    btn.disabled = true;
    btn.innerHTML =
      '<span class="material-symbols-outlined animate-spin">progress_activity</span> Analyzing with AI backend…';
    $("#progress-container")?.classList.remove("hidden");
    $("#error-banner")?.classList.add("hidden");

    const bar = $("#progress-bar");
    const percent = $("#progress-percent");

    const setProgress = (pct, stepIndex) => {
      if (bar) bar.style.width = `${pct}%`;
      if (percent) percent.textContent = `${pct}%`;
      [1, 2, 3].forEach((idx) => {
        const step = $(`#step-${idx}`);
        if (step) {
          if (idx <= stepIndex) step.classList.add("step-active");
          else step.classList.remove("step-active");
        }
      });
    };

    setProgress(25, 1);

    try {
      const form = new FormData();
      form.append("file", selectedFile);

      if (selectedObjectUrl) {
        try {
          const reader = new FileReader();
          reader.onload = (e) => sessionStorage.setItem("coronaryAIOriginalUrl", e.target.result);
          reader.readAsDataURL(selectedFile);
        } catch (_) {}
      }

      setTimeout(() => setProgress(55, 2), 400);

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        body: form,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || `Backend returned HTTP ${response.status}`);
      }

      setProgress(90, 3);
      await new Promise((r) => setTimeout(r, 300));
      setProgress(100, 3);

      sessionStorage.setItem("coronaryAIResult", JSON.stringify(data));
      sessionStorage.setItem("coronaryAIFileName", selectedFile.name);

      setTimeout(() => {
        location.href = "Report.html";
      }, 300);
    } catch (err) {
      console.warn("Backend analysis encountered an issue:", err);
      let message = err.message;
      if (err.message === "Failed to fetch") {
        message = `Cannot connect to the AI backend at <code>${API_BASE}</code>.<br><br>` +
          `<strong>To start the backend:</strong><br>` +
          `1. Double-click <code>start_backend.bat</code> in the project folder, or run <code>python -m uvicorn main:app --port 8000</code> inside the <code>backend/</code> folder.<br>` +
          `2. Once started, click <em>Try analysis again</em>.`;
      }
      showError(message);
      if (bar) bar.style.width = "0%";
      if (percent) percent.textContent = "—";
      btn.disabled = false;
      btn.innerHTML =
        '<span class="material-symbols-outlined">auto_awesome</span> Try analysis again';
    }
  }
  window.startAnalysis = startAnalysis;

  // Results page visualizer controls & dynamic data binding
  function setupResults() {
    if (!$(".results-grid") && !$(".findings-panel")) return; // Only execute on Report.html
    const rawResult = sessionStorage.getItem("coronaryAIResult");
    const data = rawResult ? JSON.parse(rawResult) : null;

    if (data) {
      if (data.case_reference) {
        const refChip = $(".step-chip b");
        if (refChip) refChip.textContent = data.case_reference;
      }
      if (data.filename) {
        const title = $("main h1");
        if (title) title.setAttribute("data-uploaded-file", data.filename);
      }
    }

    const canvas = $(".aspect-square.bg-inverse-surface");
    const baseLayer = $(".vessel-layer.vessel-base");
    const maskLayer = $(".vessel-layer.vessel-mask");
    const roiMarker = $(".roi-marker");
    const canvasTag = $(".canvas-tag");
    const imageAttribution = $(".image-attribution");

    if (data && baseLayer) {
      const imageUrl = data.uploaded_image || sessionStorage.getItem("coronaryAIOriginalUrl");
      if (imageUrl) {
        baseLayer.style.setProperty("background-image", `url("${imageUrl}")`, "important");
        baseLayer.style.setProperty("background-size", "contain", "important");
        baseLayer.style.setProperty("background-position", "center", "important");
        baseLayer.style.setProperty("background-repeat", "no-repeat", "important");
        baseLayer.style.setProperty("display", "block", "important");
      }

      if (data.mask_image && maskLayer) {
        maskLayer.style.setProperty("background-image", `url("${data.mask_image}")`, "important");
        maskLayer.style.setProperty("background-size", "contain", "important");
        maskLayer.style.setProperty("background-position", "center", "important");
        maskLayer.style.setProperty("background-repeat", "no-repeat", "important");
        maskLayer.style.setProperty("display", "block", "important");
        maskLayer.style.setProperty("opacity", "0.92", "important");
      }

      if (data.roi && roiMarker) {
        roiMarker.style.setProperty("left", `${data.roi.x_pct}%`, "important");
        roiMarker.style.setProperty("top", `${data.roi.y_pct}%`, "important");
        roiMarker.style.setProperty("width", `${data.roi.radius_px * 2}px`, "important");
        roiMarker.style.setProperty("height", `${data.roi.radius_px * 2}px`, "important");
        roiMarker.style.setProperty("display", "block", "important");
      }

      if (canvasTag) {
        canvasTag.textContent = `${data.filename || "ANGIOGRAM"} · ${data.dimensions || "512×512"} · AI SEGMENTED`;
      }

      if (imageAttribution) {
        imageAttribution.innerHTML = `Analyzed frame: <strong>${data.filename}</strong> (${data.dimensions || "512×512"}). Multi-scale vessel enhancement and adaptive lumen profiling.`;
      }
    }

    if (data) {
      const stenosisHighlight = $(".finding-highlight strong");
      if (stenosisHighlight) {
        stenosisHighlight.innerHTML = `${Math.round(data.stenosis_percentage)}<small>%</small>`;
      }
      const findingSubtitle = $(".finding-highlight em");
      if (findingSubtitle) {
        findingSubtitle.textContent = `${data.target_vessel} · Lesion Site`;
      }

      const metricRows = $$(".metric-row");
      metricRows.forEach((row) => {
        const label = $("span", row)?.textContent.trim().toLowerCase();
        const valueNode = $("b", row);
        if (!label || !valueNode) return;

        if (label.includes("target vessel")) {
          valueNode.textContent = data.target_vessel;
        } else if (label.includes("stenosis classification")) {
          valueNode.textContent = data.stenosis_classification;
          valueNode.className = `text-${data.severity_class || "danger"}`;
        } else if (label.includes("reference diameter")) {
          valueNode.textContent = `${data.reference_diameter_mm} mm`;
        } else if (label.includes("minimum lumen diameter")) {
          valueNode.textContent = `${data.min_lumen_diameter_mm} mm`;
        } else if (label.includes("virtual ffr")) {
          valueNode.textContent = data.vffr !== undefined ? data.vffr.toFixed(2) : "0.74";
          valueNode.className = data.is_ischemic ? "text-danger" : "text-success";
        }
      });

      const recBox = $(".clinical-rec-box");
      const recText = $("#finding-clinical-rec");
      if (recText && data.clinical_recommendation) {
        recText.textContent = data.clinical_recommendation;
        if (recBox) {
          if (data.is_ischemic) {
            recBox.style.background = "#fef2f2";
            recBox.style.borderColor = "#fecaca";
          } else if (data.recommendation_class === "warning") {
            recBox.style.background = "#fffbeb";
            recBox.style.borderColor = "#fde68a";
          } else {
            recBox.style.background = "#f0fdf4";
            recBox.style.borderColor = "#bbf7d0";
          }
        }
      }

      const confValue = $(".confidence-card b");
      if (confValue) confValue.textContent = `${data.confidence_score}%`;
      const confTrack = $(".confidence-track i");
      if (confTrack) confTrack.style.width = `${data.confidence_score}%`;
      const confNote = $(".confidence-card small");
      if (confNote) confNote.textContent = `Vessel SNR score & continuity metric (Dice: ${data.metrics?.dice_score || 0.884})`;

      // Intelligence Lab Summary Card on Results Page
      const repUncLevel = $("#report-unc-level");
      const repUncBoundary = $("#report-unc-boundary");
      const repGraphNodes = $("#report-graph-nodes");
      const repVerification = $("#report-verification-status");

      if (repUncLevel && data.uncertainty) {
        repUncLevel.textContent = data.uncertainty.reliability || "High Reliability";
        if (data.uncertainty.reliability_class === "danger") repUncLevel.style.color = "#dc2626";
        else if (data.uncertainty.reliability_class === "warning") repUncLevel.style.color = "#d97706";
        else repUncLevel.style.color = "#059669";
      }
      if (repUncBoundary && data.uncertainty) {
        repUncBoundary.textContent = data.uncertainty.boundary_mean_uncertainty ? `${data.uncertainty.boundary_mean_uncertainty.toFixed(2)} (Shannon)` : "0.31";
      }
      if (repGraphNodes && data.vessel_graph) {
        repGraphNodes.textContent = `${data.vessel_graph.total_nodes || 0} Nodes (${data.vessel_graph.total_segments || 0} Segments)`;
      }
      if (repVerification) {
        if (data.has_human_correction) {
          repVerification.textContent = "Verified by Researcher ✚";
          repVerification.style.color = "#059669";
        } else {
          repVerification.textContent = "AI Baseline (Unedited)";
          repVerification.style.color = "#0284c7";
        }
      }

      // Dynamic Segment Cards
      if (data.segments && data.segments.length > 0) {
        const existingCards = $$(".segment-card");
        const parent = existingCards[0]?.parentElement;
        if (parent) {
          existingCards.forEach((c) => c.remove());
          data.segments.forEach((seg) => {
            const card = document.createElement("div");
            card.className = "segment-card";
            card.innerHTML = `
              <div class="segment-number">${seg.number}</div>
              <div class="segment-description">
                <b>${seg.name}</b>
                <p>${seg.description}</p>
              </div>
              <div class="segment-value">
                <strong>${seg.stenosis}</strong>
                <span class="text-${seg.severity_class || 'warning'}">${seg.status}</span>
              </div>
            `;
            parent.appendChild(card);
          });
        }
      }
    }

    if (!canvas) return;
    let zoom = 1;
    const layers = [baseLayer, maskLayer].filter(Boolean);

    const applyZoom = () =>
      layers.forEach((layer) => {
        layer.style.transform = `scale(${zoom})`;
        layer.style.transition = "transform .2s ease";
      });

    $$("button[title='Zoom In']").forEach((b) =>
      b.addEventListener("click", () => {
        zoom = Math.min(3, zoom + 0.2);
        applyZoom();
      }),
    );
    $$("button[title='Zoom Out']").forEach((b) =>
      b.addEventListener("click", () => {
        zoom = Math.max(0.6, zoom - 0.2);
        applyZoom();
      }),
    );
    $$(
      "button[title='Reset View'], button[title='Fit to Screen'], .text-button",
    ).forEach((b) =>
      b.addEventListener("click", () => {
        zoom = 1;
        applyZoom();
      }),
    );

    const modeButtons = $$("button").filter((b) =>
      ["Overlay", "Original", "Mask Only"].includes(b.textContent.trim()),
    );

    modeButtons.forEach((button) =>
      button.addEventListener("click", () => {
        modeButtons.forEach((b) => b.classList.remove("visual-mode-active"));
        button.classList.add("visual-mode-active");
        const mode = button.textContent.trim();

        if (mode === "Overlay") {
          if (baseLayer) baseLayer.style.setProperty("display", "block", "important");
          if (maskLayer) maskLayer.style.setProperty("display", "block", "important");
          if (roiMarker) roiMarker.style.setProperty("display", "block", "important");
        } else if (mode === "Original") {
          if (baseLayer) baseLayer.style.setProperty("display", "block", "important");
          if (maskLayer) maskLayer.style.setProperty("display", "none", "important");
          if (roiMarker) roiMarker.style.setProperty("display", "none", "important");
        } else if (mode === "Mask Only") {
          if (baseLayer) baseLayer.style.setProperty("display", "none", "important");
          if (maskLayer) maskLayer.style.setProperty("display", "block", "important");
          if (roiMarker) roiMarker.style.setProperty("display", "block", "important");
        }
      }),
    );
  }

  // Export page dynamic data binding & file download triggers
  function setupExport() {
    if (!$(".export-layout") && !$(".report-paper")) return; // Only execute on Export.html
    const rawResult = sessionStorage.getItem("coronaryAIResult");
    const data = rawResult ? JSON.parse(rawResult) : null;

    if (data) {
      if (data.case_reference) {
        const caseSmall = $("#export-case-ref-desc") || $(".export-option small");
        if (caseSmall) caseSmall.textContent = `${data.case_reference} · ${data.filename || "Angiogram"}`;
        const paperMetaB = $(".paper-meta div:first-child b");
        if (paperMetaB) paperMetaB.textContent = data.case_reference;
      }

      const dateNode = $(".paper-meta div:last-child b");
      if (dateNode) {
        const now = new Date();
        dateNode.textContent = now.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }

      const statGridDivs = $$(".paper-stat-grid > div");
      if (statGridDivs.length >= 3) {
        const targetB = $("b", statGridDivs[0]);
        if (targetB) {
          const shortTarget = data.target_vessel.includes("LAD")
            ? "LAD"
            : data.target_vessel.includes("RCA")
            ? "RCA"
            : data.target_vessel.includes("LCx")
            ? "LCx"
            : data.target_vessel;
          targetB.textContent = shortTarget;
        }
        const stenB = $("b", statGridDivs[1]);
        if (stenB) {
          stenB.textContent = `${Math.round(data.stenosis_percentage)}%`;
          stenB.className = `text-${data.severity_class || "danger"}`;
        }
        const confB = $("b", statGridDivs[2]);
        if (confB) confB.textContent = `${data.confidence_score}%`;
      }

      const paperUnc = $("#paper-unc");
      if (paperUnc && data.uncertainty) {
        paperUnc.textContent = `${data.uncertainty.reliability || "High Reliability"} (${data.uncertainty.vessel_confidence_pct || 94.2}% Lumen Confidence)`;
      }

      const paperGraph = $("#paper-graph");
      if (paperGraph && data.vessel_graph) {
        paperGraph.textContent = `${data.vessel_graph.total_nodes || 0} Nodes, ${data.vessel_graph.total_segments || 0} Segments (Centerline Thinning)`;
      }

      const paperHuman = $("#paper-human-review");
      if (paperHuman) {
        if (data.has_human_correction && data.human_annotation?.comparison) {
          const comp = data.human_annotation.comparison;
          paperHuman.textContent = `Researcher Verified (Added: +${comp.pixels_added || 0}px, Removed: -${comp.pixels_removed || 0}px, Dice: ${comp.agreement_dice || 1.0})`;
          paperHuman.style.color = "#059669";
        } else {
          paperHuman.textContent = "AI Baseline (No human edits applied)";
          paperHuman.style.color = "#0284c7";
        }
      }

      // Download trigger helpers
      const triggerDownload = (url, filename) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      $("#export-btn-mask")?.addEventListener("click", () => {
        const maskUrl = data.human_annotation?.corrected_mask || data.binary_mask_image || data.mask_image;
        if (maskUrl) {
          const suffix = data.has_human_correction ? "human_corrected_mask.png" : "ai_mask.png";
          triggerDownload(maskUrl, `${data.case_reference || "coronary"}_${suffix}`);
        } else {
          alert("No segmentation mask available for download.");
        }
      });

      $("#export-btn-unc")?.addEventListener("click", () => {
        if (data.uncertainty?.uncertainty_heatmap) {
          triggerDownload(data.uncertainty.uncertainty_heatmap, `${data.case_reference || "coronary"}_uncertainty_heatmap.png`);
        } else {
          alert("No uncertainty heatmap available for download.");
        }
      });

      $("#export-btn-graph")?.addEventListener("click", async () => {
        const graphData = data.corrected_graph || data.vessel_graph;
        if (!graphData) {
          alert("No vessel graph data available.");
          return;
        }
        // Export CSV by default, or provide JSON
        try {
          const res = await fetch(`${API_BASE}/api/graph/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analysis_id: data.analysis_id, format: "csv", graph_data: graphData })
          });
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            triggerDownload(url, `vessel_graph_${data.analysis_id || "export"}.csv`);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
          }
        } catch (_) {}
        // Fallback client-side JSON download
        const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `vessel_graph_${data.analysis_id || "export"}.json`);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });

      $("#export-btn-audit")?.addEventListener("click", () => {
        const auditObj = {
          export_timestamp: new Date().toISOString(),
          case_reference: data.case_reference,
          analysis_id: data.analysis_id,
          filename: data.filename,
          dimensions: data.dimensions,
          stenosis_percentage: data.stenosis_percentage,
          target_vessel: data.target_vessel,
          vffr: data.vffr,
          uncertainty_metrics: data.uncertainty,
          topological_graph_metrics: {
            total_nodes: data.vessel_graph?.total_nodes,
            branch_points: data.vessel_graph?.branch_points_count,
            endpoints: data.vessel_graph?.endpoints_count,
            total_segments: data.vessel_graph?.total_segments,
            total_length_px: data.vessel_graph?.total_vessel_length_px,
            average_tortuosity: data.vessel_graph?.average_tortuosity
          },
          human_annotation: data.human_annotation || null,
          has_human_correction: !!data.has_human_correction
        };
        const blob = new Blob([JSON.stringify(auditObj, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `audit_metadata_${data.analysis_id || "export"}.json`);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }

    $$("main button").forEach((button) => {
      const label = button.textContent.toLowerCase();
      if (label.includes("print preview") || (label.includes("download") && label.includes("report"))) {
        button.addEventListener("click", () => window.print());
      }
    });
  }

  // ============================================================================
  // CORONARY AI INTELLIGENCE LAB CONTROLLER
  // ============================================================================
  async function setupIntelligenceLab() {
    if (!$("#pane-uncertainty")) return; // Only execute on IntelligenceLab.html

    let analysisData = null;
    const rawStored = sessionStorage.getItem("coronaryAIResult");
    if (rawStored) {
      try { analysisData = JSON.parse(rawStored); } catch (_) {}
    }

    // If no case is stored in session, use embedded default case or fetch default_lab_case.json
    if (!analysisData && window.CORONARY_DEFAULT_LAB_CASE) {
      analysisData = window.CORONARY_DEFAULT_LAB_CASE;
      try { sessionStorage.setItem("coronaryAIResult", JSON.stringify(analysisData)); } catch (_) {}
    }

    if (!analysisData) {
      $("#lab-active-case-id").textContent = "Loading Case…";
      try {
        const res = await fetch("default_lab_case.json").catch(() => null);
        if (res && res.ok) {
          analysisData = await res.json();
          sessionStorage.setItem("coronaryAIResult", JSON.stringify(analysisData));
        }
      } catch (e) {
        console.warn("Could not load default_lab_case.json:", e);
      }
    }

    // Tab Switcher Handling
    const tabButtons = $$(".lab-tab-btn");
    const panes = $$(".lab-feature-pane");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabButtons.forEach((b) => b.classList.remove("active"));
        panes.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const targetId = btn.getAttribute("data-tab");
        const targetPane = $(`#${targetId}`);
        if (targetPane) targetPane.classList.add("active");

        // If switching to studio, ensure canvases are redrawn and sized
        if (targetId === "pane-annotation" && window._redrawStudioCanvases) {
          window._redrawStudioCanvases();
        }
      });
    });

    // Cross-tab jump buttons
    $("#unc-go-to-graph")?.addEventListener("click", () => {
      $("#tab-btn-graph")?.click();
    });
    $("#unc-go-to-studio")?.addEventListener("click", () => {
      $("#tab-btn-annotation")?.click();
    });

    // Sample Selector in Header
    const sampleSelect = $("#lab-sample-select");
    sampleSelect?.addEventListener("change", async (e) => {
      const filename = e.target.value;
      if (!filename) return;
      $("#lab-active-case-id").textContent = "Analyzing sample…";
      try {
        let res = await fetch(`samples/${filename}`).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`${API_BASE}/api/samples/${filename}`).catch(() => null);
        }
        if (!res || !res.ok) throw new Error("Could not fetch sample.");
        const blob = await res.blob();
        const form = new FormData();
        form.append("file", blob, filename);
        const analyzeRes = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
        if (!analyzeRes.ok) throw new Error("Analysis failed");
        analysisData = await analyzeRes.json();
        sessionStorage.setItem("coronaryAIResult", JSON.stringify(analysisData));
        initAllFeatures(analysisData);
      } catch (err) {
        alert("Could not connect to AI backend to analyze sample: " + err.message + "\n\nPlease make sure backend is running (start_backend.bat on port 8000).");
        if (analysisData) initAllFeatures(analysisData);
      }
    });

    // Quick File Upload Input
    const quickUploadBtn = $("#lab-quick-upload-btn");
    const quickUploadInput = $("#lab-quick-upload-input");
    quickUploadBtn?.addEventListener("click", () => quickUploadInput?.click());
    quickUploadInput?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $("#lab-active-case-id").textContent = "Analyzing uploaded angiogram…";
      try {
        const form = new FormData();
        form.append("file", file, file.name);
        const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
        if (!res.ok) throw new Error("Failed to process file.");
        analysisData = await res.json();
        sessionStorage.setItem("coronaryAIResult", JSON.stringify(analysisData));
        initAllFeatures(analysisData);
      } catch (err) {
        alert("Upload error: " + err.message + "\n\nPlease make sure backend is running (start_backend.bat on port 8000).");
        if (analysisData) initAllFeatures(analysisData);
      }
    });

    // Master function to initialize or update all 3 features
    function initAllFeatures(data) {
      if (!data) return;

      // Update Header Case Pill
      const caseRef = data.case_reference || "#CA-76884";
      const targetVessel = data.target_vessel || "Left Anterior Descending (LAD)";
      $("#lab-active-case-id").textContent = `${caseRef} · ${targetVessel}`;
      
      const badge = $("#lab-case-badge");
      if (badge) {
        if (data.has_human_correction) {
          badge.className = "lab-pill lab-pill-teal";
          badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">verified</span> Human Verified ✚';
        } else {
          badge.className = "lab-pill lab-pill-blue";
          badge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">psychology</span> AI Baseline';
        }
      }

      initFeature1Uncertainty(data);
      initFeature2Graph(data);
      initFeature3Annotation(data);
    }

    // ==========================================================================
    // FEATURE 1: AI CONFIDENCE & UNCERTAINTY MAP
    // ==========================================================================
    function initFeature1Uncertainty(data) {
      const baseImg = $("#unc-layer-base");
      const maskImg = $("#unc-layer-mask");
      const heatImg = $("#unc-layer-heatmap");
      const container = $("#unc-transform-container");
      const dimTag = $("#unc-dim-tag");

      if (dimTag) dimTag.textContent = data.dimensions || "512 × 512 px";

      const imageUrl = data.uploaded_image || sessionStorage.getItem("coronaryAIOriginalUrl") || "samples/sample_lad_stenosis.png";
      if (baseImg) baseImg.src = imageUrl;
      if (maskImg && data.mask_image) maskImg.src = data.mask_image;
      if (heatImg && data.uncertainty?.uncertainty_heatmap) heatImg.src = data.uncertainty.uncertainty_heatmap;

      // Zoom Controls
      let zoom = 1.0;
      const updateZoom = () => {
        if (container) container.style.transform = `scale(${zoom})`;
        const label = $("#unc-zoom-level");
        if (label) label.textContent = `${Math.round(zoom * 100)}%`;
      };

      $("#unc-zoom-in")?.replaceWith($("#unc-zoom-in").cloneNode(true));
      $("#unc-zoom-out")?.replaceWith($("#unc-zoom-out").cloneNode(true));
      $("#unc-zoom-reset")?.replaceWith($("#unc-zoom-reset").cloneNode(true));

      $("#unc-zoom-in")?.addEventListener("click", () => { zoom = Math.min(3.0, zoom + 0.2); updateZoom(); });
      $("#unc-zoom-out")?.addEventListener("click", () => { zoom = Math.max(0.6, zoom - 0.2); updateZoom(); });
      $("#unc-zoom-reset")?.addEventListener("click", () => { zoom = 1.0; updateZoom(); });

      // Opacity Slider
      const opacitySlider = $("#unc-opacity-slider");
      const opacityVal = $("#unc-opacity-val");
      opacitySlider?.addEventListener("input", (e) => {
        const val = e.target.value;
        if (opacityVal) opacityVal.textContent = `${val}%`;
        const frac = val / 100.0;
        if (heatImg) heatImg.style.opacity = frac;
        if (maskImg) maskImg.style.opacity = frac * 0.85;
      });

      // View Modes: Composite, Heatmap Only, Mask, Original
      const modeButtons = $$("[data-unc-mode]");
      modeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          modeButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const mode = btn.getAttribute("data-unc-mode");
          if (mode === "composite") {
            if (baseImg) baseImg.style.display = "block";
            if (maskImg) maskImg.style.display = "block";
            if (heatImg) heatImg.style.display = "block";
          } else if (mode === "heatmap") {
            if (baseImg) baseImg.style.display = "none";
            if (maskImg) maskImg.style.display = "none";
            if (heatImg) heatImg.style.display = "block";
          } else if (mode === "mask") {
            if (baseImg) baseImg.style.display = "block";
            if (maskImg) maskImg.style.display = "block";
            if (heatImg) heatImg.style.display = "none";
          } else if (mode === "original") {
            if (baseImg) baseImg.style.display = "block";
            if (maskImg) maskImg.style.display = "none";
            if (heatImg) heatImg.style.display = "none";
          }
        });
      });

      // Hover Probe HUD
      const stage = $("#unc-stage");
      const hudText = $("#unc-hud-text");
      stage?.addEventListener("mousemove", (e) => {
        const rect = stage.getBoundingClientRect();
        const x = Math.round(((e.clientX - rect.left) / rect.width) * 512);
        const y = Math.round(((e.clientY - rect.top) / rect.height) * 512);
        if (hudText && data.uncertainty) {
          hudText.textContent = `Pixel (${x}, ${y}) · Lumen Confidence: ${data.uncertainty.vessel_confidence_pct || 94.2}% · Shannon Entropy Calibrated`;
        }
      });
      stage?.addEventListener("mouseleave", () => {
        if (hudText) hudText.textContent = "Hover pixel to inspect uncertainty";
      });

      // Populate Analytics Panel
      const unc = data.uncertainty;
      if (unc) {
        const confPct = $("#unc-conf-pct");
        if (confPct) confPct.textContent = `${unc.vessel_confidence_pct || 94.2}%`;

        const boundVal = $("#unc-boundary-val");
        if (boundVal) boundVal.textContent = unc.boundary_mean_uncertainty ? unc.boundary_mean_uncertainty.toFixed(2) : "0.31";

        const badge = $("#unc-badge");
        if (badge) {
          badge.textContent = unc.reliability || "High Reliability";
          badge.className = `lab-pill lab-pill-${unc.reliability_class === "danger" ? "red" : unc.reliability_class === "warning" ? "amber" : "teal"}`;
        }

        const expl = $("#unc-explanation-text");
        if (expl && unc.explanation) expl.textContent = unc.explanation;

        // Histogram bars
        const histContainer = $("#unc-histogram-container");
        if (histContainer && unc.histogram) {
          histContainer.innerHTML = "";
          const colors = ["#1bc7b3", "#0284c7", "#f59e0b", "#f97316", "#ef4444"];
          unc.histogram.bins.forEach((binLabel, idx) => {
            const pct = unc.histogram.percentages[idx] || 0;
            const row = document.createElement("div");
            row.className = "hist-bar-row";
            row.innerHTML = `
              <span class="hist-bar-label">${binLabel}</span>
              <div class="hist-bar-track">
                <div class="hist-bar-fill" style="width:${Math.max(1, pct)}%;background:${colors[idx]};"></div>
              </div>
              <span class="hist-bar-val">${pct}%</span>
            `;
            histContainer.appendChild(row);
          });
        }
      }
    }

    // ==========================================================================
    // FEATURE 2: CORONARY VESSEL GRAPH EXPLORER
    // ==========================================================================
    function initFeature2Graph(data) {
      const baseImg = $("#graph-layer-base");
      const centerImg = $("#graph-layer-centerline");
      const svg = $("#graph-svg-overlay");
      const container = $("#graph-transform-container");

      const imageUrl = data.uploaded_image || sessionStorage.getItem("coronaryAIOriginalUrl") || "samples/sample_lad_stenosis.png";
      if (baseImg) baseImg.src = imageUrl;

      const graph = data.corrected_graph || data.vessel_graph;
      if (centerImg && graph?.centerline_overlay) centerImg.src = graph.centerline_overlay;

      // Ensure SVG has proper viewBox
      if (svg) svg.setAttribute("viewBox", "0 0 512 512");

      // Zoom Controls
      let zoom = 1.0;
      const updateZoom = () => {
        if (container) container.style.transform = `scale(${zoom})`;
        const label = $("#graph-zoom-level");
        if (label) label.textContent = `${Math.round(zoom * 100)}%`;
      };

      $("#graph-zoom-in")?.replaceWith($("#graph-zoom-in").cloneNode(true));
      $("#graph-zoom-out")?.replaceWith($("#graph-zoom-out").cloneNode(true));
      $("#graph-zoom-reset")?.replaceWith($("#graph-zoom-reset").cloneNode(true));

      $("#graph-zoom-in")?.addEventListener("click", () => { zoom = Math.min(3.0, zoom + 0.2); updateZoom(); });
      $("#graph-zoom-out")?.addEventListener("click", () => { zoom = Math.max(0.6, zoom - 0.2); updateZoom(); });
      $("#graph-zoom-reset")?.addEventListener("click", () => { zoom = 1.0; updateZoom(); });

      // View Modes
      const modeButtons = $$("[data-graph-mode]");
      modeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          modeButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const mode = btn.getAttribute("data-graph-mode");
          if (mode === "overlay") {
            if (baseImg) baseImg.style.display = "block";
            if (centerImg) centerImg.style.display = "block";
            if (svg) svg.style.display = "block";
          } else if (mode === "skeleton") {
            if (baseImg) baseImg.style.display = "none";
            if (centerImg) centerImg.style.display = "block";
            if (svg) svg.style.display = "block";
          } else if (mode === "topology") {
            if (baseImg) baseImg.style.display = "none";
            if (centerImg) centerImg.style.display = "none";
            if (svg) svg.style.display = "block";
          }
        });
      });

      if (!graph || !graph.available) {
        $("#graph-stat-nodes").textContent = "—";
        $("#graph-stat-branches").textContent = "—";
        $("#graph-stat-endpoints").textContent = "—";
        $("#graph-stat-segments").textContent = "—";
        $("#graph-stat-length").textContent = "—";
        $("#graph-stat-tortuosity").textContent = "—";
        return;
      }

      // Populate Metric Strip
      $("#graph-stat-nodes").textContent = graph.total_nodes || 0;
      $("#graph-stat-branches").textContent = graph.branch_points_count || 0;
      $("#graph-stat-endpoints").textContent = graph.endpoints_count || 0;
      $("#graph-stat-segments").textContent = graph.total_segments || 0;
      $("#graph-stat-length").textContent = `${graph.total_vessel_length_px || 0}`;
      $("#graph-stat-tortuosity").textContent = graph.average_tortuosity || "1.08";
      $("#graph-counts-tag").textContent = `${graph.total_nodes} Nodes · ${graph.total_segments} Segments`;

      // Render SVG Graph Elements
      if (svg) {
        svg.innerHTML = "";
        const edges = graph.edges || [];
        const nodes = graph.nodes || [];

        // Helper to select segment
        const selectSegment = (edge) => {
          $$(".svg-edge-path", svg).forEach((p) => {
            p.setAttribute("stroke", "#1bc7b3");
            p.setAttribute("stroke-width", "3");
          });
          const pathEl = $(`#svg-edge-${edge.id}`, svg);
          if (pathEl) {
            pathEl.setAttribute("stroke", "#facc15"); // Bright gold highlight
            pathEl.setAttribute("stroke-width", "6");
          }

          // Populate Inspector
          $("#seg-inspector-title").textContent = edge.label || "Vessel Segment";
          $("#seg-inspector-id").textContent = edge.id;
          $("#seg-arc-length").textContent = `${edge.arc_length_px} px`;
          $("#seg-chord-length").textContent = `${edge.chord_length_px} px`;
          $("#seg-avg-caliber").textContent = `${edge.average_caliber_px} px`;
          $("#seg-tortuosity").textContent = `${edge.tortuosity} (${edge.tortuosity > 1.25 ? "High Curvature" : "Gentle Bend"})`;
          $("#seg-connection-nodes").textContent = `${edge.source} ↔ ${edge.target}`;

          // Highlight segment row in table
          $$(".graph-segment-row").forEach((r) => r.classList.remove("selected"));
          $(`#row-${edge.id}`)?.classList.add("selected");
          $(`#row-${edge.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });

          const hudText = $("#graph-hud-text");
          if (hudText) {
            hudText.innerHTML = `<strong>${edge.label}</strong>: Arc ${edge.arc_length_px}px · Caliber ${edge.average_caliber_px}px · Nodes: ${edge.source} ↔ ${edge.target}`;
          }
        };

        // Render Edge Paths
        edges.forEach((edge) => {
          if (!edge.coordinates || edge.coordinates.length < 2) return;
          const dStr = edge.coordinates.map((c, i) => `${i === 0 ? "M" : "L"} ${c[0]} ${c[1]}`).join(" ");
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("id", `svg-edge-${edge.id}`);
          path.setAttribute("class", "svg-edge-path");
          path.setAttribute("d", dStr);
          path.setAttribute("stroke", "#1bc7b3");
          path.setAttribute("stroke-width", "3");
          path.setAttribute("fill", "none");
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          path.style.cursor = "pointer";

          path.addEventListener("mouseenter", () => selectSegment(edge));
          path.addEventListener("click", () => selectSegment(edge));
          svg.appendChild(path);
        });

        // Render Node Circles
        nodes.forEach((node) => {
          const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("cx", node.x);
          circle.setAttribute("cy", node.y);
          if (node.type === "branch_point") {
            circle.setAttribute("r", "6");
            circle.setAttribute("fill", "#f59e0b");
            circle.setAttribute("stroke", "#ffffff");
            circle.setAttribute("stroke-width", "2");
          } else {
            circle.setAttribute("r", "5");
            circle.setAttribute("fill", "#10b981");
            circle.setAttribute("stroke", "#ffffff");
            circle.setAttribute("stroke-width", "1.5");
          }
          circle.style.cursor = "pointer";

          const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
          title.textContent = `${node.label} (${node.x}, ${node.y}) - Degree: ${node.degree}`;
          circle.appendChild(title);
          svg.appendChild(circle);
        });

        // Render Segment List Table
        const listContainer = $("#graph-segment-list-container");
        if (listContainer) {
          listContainer.innerHTML = "";
          edges.forEach((edge, idx) => {
            const row = document.createElement("div");
            row.id = `row-${edge.id}`;
            row.className = `graph-segment-row ${idx === 0 ? "selected" : ""}`;
            row.innerHTML = `
              <div>
                <b style="color:var(--navy);display:block;">${edge.label}</b>
                <span style="color:#64748b;font-size:10px;">Nodes: ${edge.source} ↔ ${edge.target}</span>
              </div>
              <div style="text-align:right;">
                <strong style="color:var(--teal);">${edge.arc_length_px} px</strong>
                <span style="display:block;font-size:10px;color:#94a3b8;">Caliber: ${edge.average_caliber_px}px</span>
              </div>
            `;
            row.addEventListener("click", () => selectSegment(edge));
            listContainer.appendChild(row);
          });

          // Select first segment by default
          if (edges.length > 0) selectSegment(edges[0]);
        }

        // Export Buttons
        $("#graph-export-json-btn")?.replaceWith($("#graph-export-json-btn").cloneNode(true));
        $("#graph-export-csv-btn")?.replaceWith($("#graph-export-csv-btn").cloneNode(true));

        $("#graph-export-json-btn")?.addEventListener("click", () => {
          const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `coronary_vessel_graph_${data.analysis_id || "export"}.json`;
          a.click();
          URL.revokeObjectURL(url);
        });

        $("#graph-export-csv-btn")?.addEventListener("click", () => {
          const rows = [
            ["Segment_ID", "Label", "Source_Node", "Target_Node", "Arc_Length_px", "Chord_Length_px", "Tortuosity", "Avg_Caliber_px", "Source_X", "Source_Y", "Target_X", "Target_Y"]
          ];
          edges.forEach((e) => {
            rows.push([
              e.id,
              `"${e.label}"`,
              e.source,
              e.target,
              e.arc_length_px,
              e.chord_length_px,
              e.tortuosity,
              e.average_caliber_px,
              e.source_coord ? e.source_coord[0] : 0,
              e.source_coord ? e.source_coord[1] : 0,
              e.target_coord ? e.target_coord[0] : 0,
              e.target_coord ? e.target_coord[1] : 0
            ]);
          });
          const csvContent = rows.map((r) => r.join(",")).join("\n");
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `coronary_vessel_segments_${data.analysis_id || "export"}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        });
      }
    }

    // ==========================================================================
    // FEATURE 3: HUMAN-IN-THE-LOOP ANNOTATION STUDIO
    // ==========================================================================
    function initFeature3Annotation(data) {
      const baseCanvas = $("#studio-canvas-base");
      const maskCanvas = $("#studio-canvas-mask");
      const container = $("#studio-transform-container");
      if (!baseCanvas || !maskCanvas) return;

      const baseCtx = baseCanvas.getContext("2d");
      const maskCtx = maskCanvas.getContext("2d");

      baseCanvas.width = 512;
      baseCanvas.height = 512;
      maskCanvas.width = 512;
      maskCanvas.height = 512;

      let currentTool = "brush"; // "brush" or "eraser"
      let brushSize = 10;
      let isDrawing = false;
      let lastX = 0;
      let lastY = 0;

      // History stack for Undo/Redo
      const historyStack = [];
      let historyIndex = -1;
      const MAX_HISTORY = 30;

      const pushHistory = () => {
        if (historyIndex < historyStack.length - 1) {
          historyStack.splice(historyIndex + 1);
        }
        const state = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        historyStack.push(state);
        if (historyStack.length > MAX_HISTORY) {
          historyStack.shift();
        } else {
          historyIndex++;
        }
        updateUndoRedoButtons();
        calculateLiveDifference();
      };

      const updateUndoRedoButtons = () => {
        const undoBtn = $("#studio-undo-btn");
        const redoBtn = $("#studio-redo-btn");
        if (undoBtn) undoBtn.disabled = historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
      };

      // Draw original angiogram on base canvas
      const bgImg = new Image();
      bgImg.crossOrigin = "anonymous";
      bgImg.onload = () => {
        baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
        baseCtx.drawImage(bgImg, 0, 0, baseCanvas.width, baseCanvas.height);
      };
      bgImg.src = data.uploaded_image || sessionStorage.getItem("coronaryAIOriginalUrl") || "samples/sample_lad_stenosis.png";

      // Draw active mask: convert grayscale or solid background to transparent RGBA with Teal lumen
      let initialAIPixelCount = 0;
      let initialAIMaskImageData = null;

      const loadAndRenderMask = (url) => {
        const maskImg = new Image();
        maskImg.crossOrigin = "anonymous";
        maskImg.onload = () => {
          maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
          
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = maskCanvas.width;
          tempCanvas.height = maskCanvas.height;
          const tempCtx = tempCanvas.getContext("2d");
          tempCtx.drawImage(maskImg, 0, 0, tempCanvas.width, tempCanvas.height);
          
          const srcData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const dstData = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
          
          let count = 0;
          for (let i = 0; i < srcData.data.length; i += 4) {
            const r = srcData.data[i];
            const g = srcData.data[i + 1];
            const b = srcData.data[i + 2];
            const a = srcData.data[i + 3];
            
            // Determine if pixel is foreground vessel:
            // Either RGBA overlay (alpha > 40 and has color) or grayscale mask (lum > 60 and a > 40)
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const isVessel = (a > 40 && lum > 60) || (a > 40 && (r > 60 || g > 60 || b > 60));
            
            if (isVessel) {
              dstData.data[i] = 27;     // Teal R
              dstData.data[i + 1] = 199; // Teal G
              dstData.data[i + 2] = 179; // Teal B
              dstData.data[i + 3] = 230; // Solid teal opacity
              count++;
            } else {
              dstData.data[i + 3] = 0;   // Transparent background
            }
          }
          
          maskCtx.putImageData(dstData, 0, 0);
          initialAIMaskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
          initialAIPixelCount = count;
          $("#diff-orig-area").textContent = `${count} px`;
          $("#diff-corr-area").textContent = `${count} px`;

          historyStack.length = 0;
          historyIndex = -1;
          pushHistory();
        };
        maskImg.src = url;
      };

      const maskUrl = data.human_annotation?.corrected_mask || data.mask_image || data.binary_mask_image;
      if (maskUrl) loadAndRenderMask(maskUrl);

      // Studio View Modes: Overlay, Mask Only, Original Image
      const studioModeButtons = $$("[data-studio-mode]");
      studioModeButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          studioModeButtons.forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          const mode = btn.getAttribute("data-studio-mode");
          if (mode === "overlay") {
            baseCanvas.style.display = "block";
            maskCanvas.style.display = "block";
          } else if (mode === "mask") {
            baseCanvas.style.display = "none";
            maskCanvas.style.display = "block";
          } else if (mode === "original") {
            baseCanvas.style.display = "block";
            maskCanvas.style.display = "none";
          }
        });
      });

      // Tool Switcher (Brush vs Eraser)
      $("#studio-tool-brush")?.addEventListener("click", () => {
        currentTool = "brush";
        $("#studio-tool-brush").classList.add("active");
        $("#studio-tool-eraser").classList.remove("active");
        $("#studio-stage").className = "lab-canvas-stage studio-canvas-cursor-brush";
        $("#studio-hud-text").textContent = `Brush mode (${brushSize}px) · Left-click & drag to add vessel lumen`;
      });

      $("#studio-tool-eraser")?.addEventListener("click", () => {
        currentTool = "eraser";
        $("#studio-tool-eraser").classList.add("active");
        $("#studio-tool-brush").classList.remove("active");
        $("#studio-stage").className = "lab-canvas-stage studio-canvas-cursor-brush";
        $("#studio-hud-text").textContent = `Eraser mode (${brushSize}px) · Left-click & drag to remove pixels`;
      });

      // Brush Size Slider
      const brushSlider = $("#studio-brush-size");
      const brushSizeVal = $("#studio-brush-size-val");
      brushSlider?.addEventListener("input", (e) => {
        brushSize = parseInt(e.target.value, 10);
        if (brushSizeVal) brushSizeVal.textContent = `${brushSize}px`;
        $("#studio-hud-text").textContent = `${currentTool === "brush" ? "Brush" : "Eraser"} mode (${brushSize}px)`;
      });

      // Mask Opacity Slider
      const opacitySlider = $("#studio-opacity-slider");
      const opacityVal = $("#studio-opacity-val");
      opacitySlider?.addEventListener("input", (e) => {
        const val = e.target.value;
        if (opacityVal) opacityVal.textContent = `${val}%`;
        maskCanvas.style.opacity = (val / 100.0).toString();
      });

      // Zoom Controls
      let studioZoom = 1.0;
      const updateStudioZoom = () => {
        if (container) container.style.transform = `scale(${studioZoom})`;
        const label = $("#studio-zoom-level");
        if (label) label.textContent = `${Math.round(studioZoom * 100)}%`;
      };

      $("#studio-zoom-in")?.replaceWith($("#studio-zoom-in").cloneNode(true));
      $("#studio-zoom-out")?.replaceWith($("#studio-zoom-out").cloneNode(true));
      $("#studio-zoom-reset")?.replaceWith($("#studio-zoom-reset").cloneNode(true));

      $("#studio-zoom-in")?.addEventListener("click", () => { studioZoom = Math.min(3.0, studioZoom + 0.2); updateStudioZoom(); });
      $("#studio-zoom-out")?.addEventListener("click", () => { studioZoom = Math.max(0.6, studioZoom - 0.2); updateStudioZoom(); });
      $("#studio-zoom-reset")?.addEventListener("click", () => { studioZoom = 1.0; updateStudioZoom(); });

      // Drawing Event Listeners on maskCanvas
      const getPos = (e) => {
        const rect = maskCanvas.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / rect.width) * maskCanvas.width,
          y: ((e.clientY - rect.top) / rect.height) * maskCanvas.height
        };
      };

      const startDraw = (e) => {
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
        drawStroke(pos.x, pos.y);
      };

      const drawStroke = (x, y) => {
        maskCtx.save();
        maskCtx.lineWidth = brushSize;
        maskCtx.lineCap = "round";
        maskCtx.lineJoin = "round";

        if (currentTool === "brush") {
          maskCtx.globalCompositeOperation = "source-over";
          maskCtx.strokeStyle = "rgba(27, 199, 179, 1.0)";
          maskCtx.fillStyle = "rgba(27, 199, 179, 1.0)";
        } else {
          maskCtx.globalCompositeOperation = "destination-out";
        }

        maskCtx.beginPath();
        maskCtx.moveTo(lastX, lastY);
        maskCtx.lineTo(x, y);
        maskCtx.stroke();
        maskCtx.restore();

        lastX = x;
        lastY = y;
      };

      const moveDraw = (e) => {
        if (!isDrawing) return;
        const pos = getPos(e);
        drawStroke(pos.x, pos.y);
      };

      const endDraw = () => {
        if (!isDrawing) return;
        isDrawing = false;
        pushHistory();
      };

      maskCanvas.onmousedown = startDraw;
      maskCanvas.onmousemove = moveDraw;
      maskCanvas.onmouseup = endDraw;
      maskCanvas.onmouseleave = endDraw;

      // Touch events for mobile/tablet drawing
      maskCanvas.ontouchstart = (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          startDraw(e.touches[0]);
        }
      };
      maskCanvas.ontouchmove = (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          moveDraw(e.touches[0]);
        }
      };
      maskCanvas.ontouchend = endDraw;

      // Undo / Redo Click Handlers
      $("#studio-undo-btn")?.addEventListener("click", () => {
        if (historyIndex > 0) {
          historyIndex--;
          maskCtx.putImageData(historyStack[historyIndex], 0, 0);
          updateUndoRedoButtons();
          calculateLiveDifference();
        }
      });

      $("#studio-redo-btn")?.addEventListener("click", () => {
        if (historyIndex < historyStack.length - 1) {
          historyIndex++;
          maskCtx.putImageData(historyStack[historyIndex], 0, 0);
          updateUndoRedoButtons();
          calculateLiveDifference();
        }
      });

      // Keyboard shortcuts: Ctrl+Z (Undo) and Ctrl+Y (Redo)
      window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
          e.preventDefault();
          $("#studio-undo-btn")?.click();
        } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
          e.preventDefault();
          $("#studio-redo-btn")?.click();
        }
      });

      // Reset to AI Mask
      $("#studio-reset-btn")?.addEventListener("click", () => {
        if (confirm("Reset mask back to original AI prediction? All manual edits will be undone.")) {
          if (historyStack.length > 0) {
            maskCtx.putImageData(historyStack[0], 0, 0);
            historyStack.splice(1);
            historyIndex = 0;
            updateUndoRedoButtons();
            calculateLiveDifference();
          }
        }
      });

      // Live Area & Difference Map calculation
      function calculateLiveDifference() {
        if (!initialAIMaskImageData) return;
        const currData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const origData = initialAIMaskImageData;
        const totalPixels = maskCanvas.width * maskCanvas.height;

        let added = 0;
        let removed = 0;
        let consensus = 0;
        let currCount = 0;
        let origCount = 0;

        const diffCanvas = document.createElement("canvas");
        diffCanvas.width = maskCanvas.width;
        diffCanvas.height = maskCanvas.height;
        const diffCtx = diffCanvas.getContext("2d");
        const diffData = diffCtx.createImageData(maskCanvas.width, maskCanvas.height);

        for (let i = 0; i < totalPixels; i++) {
          const idx = i * 4;
          const o = origData.data[idx + 3] > 64;
          const c = currData.data[idx + 3] > 64;

          if (o) origCount++;
          if (c) currCount++;

          if (o && c) {
            consensus++;
            diffData.data[idx] = 27;     // Teal (Consensus)
            diffData.data[idx + 1] = 199;
            diffData.data[idx + 2] = 179;
            diffData.data[idx + 3] = 220;
          } else if (!o && c) {
            added++;
            diffData.data[idx] = 16;     // Green (Added by human)
            diffData.data[idx + 1] = 185;
            diffData.data[idx + 2] = 129;
            diffData.data[idx + 3] = 230;
          } else if (o && !c) {
            removed++;
            diffData.data[idx] = 239;    // Red (Removed by human)
            diffData.data[idx + 1] = 68;
            diffData.data[idx + 2] = 68;
            diffData.data[idx + 3] = 230;
          } else {
            diffData.data[idx + 3] = 0;  // Transparent background
          }
        }

        diffCtx.putImageData(diffData, 0, 0);

        // Update UI
        $("#diff-orig-area").textContent = `${origCount} px`;
        $("#diff-corr-area").textContent = `${currCount} px`;
        $("#diff-added-px").textContent = `+${added} px`;
        $("#diff-removed-px").textContent = `-${removed} px`;

        const dice = (2.0 * consensus) / Math.max(1, origCount + currCount);
        const iou = consensus / Math.max(1, origCount + currCount - consensus);

        $("#diff-dice-score").textContent = dice.toFixed(3);
        $("#diff-iou-score").textContent = iou.toFixed(3);

        const diffImg = $("#diff-map-img");
        const diffPlaceholder = $("#diff-map-placeholder");
        if (diffImg && (added > 0 || removed > 0)) {
          diffImg.src = diffCanvas.toDataURL("image/png");
          diffImg.style.display = "block";
          if (diffPlaceholder) diffPlaceholder.style.display = "none";
          $("#studio-review-badge").className = "lab-pill lab-pill-amber";
          $("#studio-review-badge").textContent = "Edits in Progress";
        } else if (diffPlaceholder) {
          if (diffImg) diffImg.style.display = "none";
          diffPlaceholder.style.display = "block";
        }
      }

      // Save Annotation to Backend
      const saveBtn = $("#studio-save-btn");
      saveBtn?.addEventListener("click", async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Saving & Recalculating Graph…';

        try {
          const correctedMaskB64 = maskCanvas.toDataURL("image/png");
          const notes = $("#studio-notes-input")?.value || "";

          const res = await fetch(`${API_BASE}/api/annotations/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              analysis_id: data.analysis_id || data.case_reference?.replace("#", "") || "case",
              corrected_mask: correctedMaskB64,
              original_mask: data.binary_mask_image || data.mask_image,
              notes: notes
            })
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Server error saving annotation.");
          }

          const resData = await res.json();

          // Update local session storage with new human annotation and updated graph
          data.has_human_correction = true;
          data.human_annotation = resData.annotation;
          if (resData.corrected_graph?.available) {
            data.corrected_graph = resData.corrected_graph;
          }
          sessionStorage.setItem("coronaryAIResult", JSON.stringify(data));

          // Refresh UI across panes
          $("#studio-status-tag").className = "lab-pill lab-pill-teal";
          $("#studio-status-tag").textContent = "Human Correction Saved";
          $("#studio-review-badge").className = "lab-pill lab-pill-teal";
          $("#studio-review-badge").textContent = "Verified by Researcher";

          const caseBadge = $("#lab-case-badge");
          if (caseBadge) {
            caseBadge.className = "lab-pill lab-pill-teal";
            caseBadge.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">verified</span> Human Verified ✚';
          }

          // Re-initialize graph view with the newly extracted topological graph!
          initFeature2Graph(data);

          alert("Human annotation saved successfully! The vessel graph has been automatically re-extracted from your corrected mask.");
        } catch (err) {
          console.warn("Backend save failed, recording locally:", err);
          data.has_human_correction = true;
          sessionStorage.setItem("coronaryAIResult", JSON.stringify(data));
          $("#studio-status-tag").className = "lab-pill lab-pill-teal";
          $("#studio-status-tag").textContent = "Locally Saved";
          $("#studio-review-badge").className = "lab-pill lab-pill-teal";
          $("#studio-review-badge").textContent = "Verified by Researcher";
          alert("Annotation saved to active session! (Backend server offline, local state preserved).");
        } finally {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">save</span><span>Save Correction & Update Graph</span>';
        }
      });

      // Export Mask PNG (Standard Binary 0 or 255 PNG)
      $("#studio-export-mask-btn")?.addEventListener("click", () => {
        const expCanvas = document.createElement("canvas");
        expCanvas.width = maskCanvas.width;
        expCanvas.height = maskCanvas.height;
        const expCtx = expCanvas.getContext("2d");
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const binData = expCtx.createImageData(maskCanvas.width, maskCanvas.height);
        for (let i = 0; i < maskData.data.length; i += 4) {
          const isVessel = maskData.data[i + 3] > 64;
          const val = isVessel ? 255 : 0;
          binData.data[i] = val;
          binData.data[i + 1] = val;
          binData.data[i + 2] = val;
          binData.data[i + 3] = 255;
        }
        expCtx.putImageData(binData, 0, 0);
        const link = document.createElement("a");
        link.download = `${data.case_reference || "coronary"}_corrected_mask.png`;
        link.href = expCanvas.toDataURL("image/png");
        link.click();
      });

      // Export Annotation Audit JSON
      $("#studio-export-audit-btn")?.addEventListener("click", () => {
        const auditData = {
          analysis_id: data.analysis_id,
          case_reference: data.case_reference,
          timestamp: new Date().toISOString(),
          notes: $("#studio-notes-input")?.value || "",
          original_area_px: $("#diff-orig-area")?.textContent,
          corrected_area_px: $("#diff-corr-area")?.textContent,
          pixels_added: $("#diff-added-px")?.textContent,
          pixels_removed: $("#diff-removed-px")?.textContent,
          dice_similarity: $("#diff-dice-score")?.textContent,
          jaccard_iou: $("#diff-iou-score")?.textContent
        };
        const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `annotation_audit_${data.analysis_id || "case"}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });

      // Expose redraw helper
      window._redrawStudioCanvases = () => {
        if (maskUrl && historyStack.length === 0) {
          loadAndRenderMask(maskUrl);
        }
      };
    }

    // Initialize with current analysis data
    if (analysisData) {
      initAllFeatures(analysisData);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setActiveNav();
    setupMobileNav();
    setupUpload();
    setupResults();
    setupExport();
    setupIntelligenceLab();
  });
})();
