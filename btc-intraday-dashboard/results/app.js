/* ============================================================
   BTC Intraday Dashboard (static)
   Expects files in /results:
   - metrics.json
   - confusion_matrix.json
   - predictions_valid.csv
   - samples.json
   - samples/*.png
============================================================ */

const RESULTS_BASE = "results";

const els = {
  dataset: document.getElementById("kpi-dataset"),
  setup: document.getElementById("kpi-setup"),
  acc: document.getElementById("kpi-acc"),
  auc: document.getElementById("kpi-auc"),
  n: document.getElementById("kpi-n"),

  cmTN: document.getElementById("cm-tn"),
  cmFP: document.getElementById("cm-fp"),
  cmFN: document.getElementById("cm-fn"),
  cmTP: document.getElementById("cm-tp"),
  cmTPR: document.getElementById("cm-tpr"),
  cmTNR: document.getElementById("cm-tnr"),
  cmBACC: document.getElementById("cm-bacc"),

  thr: document.getElementById("thr"),
  thrVal: document.getElementById("thr-val"),
  toggleTruth: document.getElementById("toggle-truth"),
  togglePred: document.getElementById("toggle-pred"),

  samples: document.getElementById("samples"),
  samplesFilter: document.getElementById("samples-filter"),
  samplesSort: document.getElementById("samples-sort"),
};

function fmt(x, d = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return Number(x).toFixed(d);
}

function safeDiv(a, b) {
  return b === 0 ? null : a / b;
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
  return await res.json();
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
  return await res.text();
}

// Minimal CSV parser (works for your file: no quoted commas)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map(s => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < header.length) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = parts[j];
    rows.push(obj);
  }
  return rows;
}

function setKpis(metrics, predRows) {
  els.dataset.textContent = metrics.dataset ?? "—";
  els.setup.textContent = `Horizon: ${metrics.label_horizon_steps} | Window: ${metrics.window_size} | Img: ${metrics.img_size}px`;

  els.acc.textContent = fmt(metrics.valid_accuracy, 4);
  els.auc.textContent = fmt(metrics.valid_auc, 4);
  els.n.textContent = String(predRows.length);
}

function setConfusion(cmJson) {
  const m = cmJson.matrix;
  const TN = m?.[0]?.[0] ?? 0;
  const FP = m?.[0]?.[1] ?? 0;
  const FN = m?.[1]?.[0] ?? 0;
  const TP = m?.[1]?.[1] ?? 0;

  els.cmTN.textContent = String(TN);
  els.cmFP.textContent = String(FP);
  els.cmFN.textContent = String(FN);
  els.cmTP.textContent = String(TP);

  const tpr = safeDiv(TP, TP + FN);
  const tnr = safeDiv(TN, TN + FP);
  const bacc = (tpr === null || tnr === null) ? null : (tpr + tnr) / 2;

  els.cmTPR.textContent = tpr === null ? "—" : fmt(tpr, 4);
  els.cmTNR.textContent = tnr === null ? "—" : fmt(tnr, 4);
  els.cmBACC.textContent = bacc === null ? "—" : fmt(bacc, 4);
}

function buildSeries(predRows) {
  // Convert to typed arrays
  const x = [];
  const yProb = [];
  const yTrue = [];
  const yPred = [];
  for (const r of predRows) {
    x.push(new Date(r.datetime));
    yProb.push(Number(r.y_prob));
    yTrue.push(Number(r.y_true));
    yPred.push(Number(r.y_pred));
  }
  return { x, yProb, yTrue, yPred };
}

function renderProbChart(series, threshold) {
  const showTruth = els.toggleTruth.checked;
  const showPred = els.togglePred.checked;

  const traces = [];

  traces.push({
    x: series.x,
    y: series.yProb,
    type: "scatter",
    mode: "lines",
    name: "y_prob (P up)",
    line: { width: 2 },
    hovertemplate: "Time: %{x}<br>P(up): %{y:.6f}<extra></extra>",
  });

  traces.push({
    x: series.x,
    y: series.yProb.map(() => threshold),
    type: "scatter",
    mode: "lines",
    name: `threshold (${threshold.toFixed(3)})`,
    line: { dash: "dot", width: 1 },
    hoverinfo: "skip",
  });

  if (showTruth) {
    traces.push({
      x: series.x,
      y: series.yTrue,
      type: "scatter",
      mode: "markers",
      name: "y_true",
      marker: { size: 5, opacity: 0.7 },
      hovertemplate: "Time: %{x}<br>y_true: %{y}<extra></extra>",
      yaxis: "y2",
    });
  }

  if (showPred) {
    const thrPred = series.yProb.map(p => (p >= threshold ? 1 : 0));
    traces.push({
      x: series.x,
      y: thrPred,
      type: "scatter",
      mode: "markers",
      name: "y_pred(thr)",
      marker: { size: 5, opacity: 0.7 },
      hovertemplate: "Time: %{x}<br>y_pred: %{y}<extra></extra>",
      yaxis: "y2",
    });
  }

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 48, r: 16, t: 10, b: 40 },
    legend: { orientation: "h", y: 1.15, x: 0 },
    xaxis: {
      title: "Time",
      gridcolor: "rgba(255,255,255,0.08)",
      zerolinecolor: "rgba(255,255,255,0.08)"
    },
    yaxis: {
      title: "Probability",
      gridcolor: "rgba(255,255,255,0.08)",
      zerolinecolor: "rgba(255,255,255,0.08)",
      tickformat: ".3f"
    },
    yaxis2: {
      title: "Class (0/1)",
      overlaying: "y",
      side: "right",
      range: [-0.1, 1.1],
      showgrid: false,
      tickmode: "array",
      tickvals: [0, 1],
      ticktext: ["0", "1"],
    }
  };

  Plotly.react("chart-prob", traces, layout, { displayModeBar: false, responsive: true });
}

function renderHist(series) {
  const trace = {
    x: series.yProb,
    type: "histogram",
    nbinsx: 40,
    name: "y_prob",
    hovertemplate: "y_prob: %{x:.6f}<br>count: %{y}<extra></extra>",
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 48, r: 16, t: 10, b: 40 },
    xaxis: { title: "y_prob", gridcolor: "rgba(255,255,255,0.08)" },
    yaxis: { title: "count", gridcolor: "rgba(255,255,255,0.08)" },
    showlegend: false,
  };

  Plotly.react("chart-hist", [trace], layout, { displayModeBar: false, responsive: true });
}

function renderSamples(samples) {
  const filter = els.samplesFilter.value;
  const sort = els.samplesSort.value;

  let items = samples.slice();

  if (filter !== "all") items = items.filter(s => s.tag === filter);

  // confidence = |p - 0.5|
  items.forEach(s => { s._conf = Math.abs(Number(s.y_prob) - 0.5); });

  items.sort((a, b) => {
    if (sort === "conf_desc") return b._conf - a._conf;
    if (sort === "conf_asc") return a._conf - b._conf;
    if (sort === "time_desc") return new Date(b.datetime) - new Date(a.datetime);
    if (sort === "time_asc") return new Date(a.datetime) - new Date(b.datetime);
    return 0;
  });

  els.samples.innerHTML = "";

  for (const s of items) {
    const wrap = document.createElement("div");
    wrap.className = "sample";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = `${s.tag} | ${s.datetime}`;
    img.src = `${RESULTS_BASE}/${s.png}`;
    img.onerror = () => { img.style.opacity = "0.25"; };

    const body = document.createElement("div");
    body.className = "sample-body";

    const badge = document.createElement("div");
    badge.className = `badge ${s.tag === "wrong" ? "wrong" : ""}`;
    badge.innerHTML = `<span class="pill"></span><span>${s.tag.toUpperCase()}</span>`;

    const meta = document.createElement("div");
    meta.className = "sample-meta";
    meta.innerHTML = `
      <div class="row"><span>time</span><span>${s.datetime}</span></div>
      <div class="row"><span>y_true</span><span>${s.y_true}</span></div>
      <div class="row"><span>y_pred</span><span>${s.y_pred}</span></div>
      <div class="row"><span>y_prob</span><span>${Number(s.y_prob).toFixed(6)}</span></div>
    `;

    body.appendChild(badge);
    body.appendChild(meta);

    wrap.appendChild(img);
    wrap.appendChild(body);

    els.samples.appendChild(wrap);
  }
}

async function main() {
  try {
    // Load files
    const metrics = await fetchJSON(`${RESULTS_BASE}/metrics.json`);
    const cm = await fetchJSON(`${RESULTS_BASE}/confusion_matrix.json`);
    const samples = await fetchJSON(`${RESULTS_BASE}/samples.json`);
    const csvText = await fetchText(`${RESULTS_BASE}/predictions_valid.csv`);
    const predRows = parseCSV(csvText);

    // KPIs + confusion
    setKpis(metrics, predRows);
    setConfusion(cm);

    // Charts
    const series = buildSeries(predRows);
    const threshold = Number(els.thr.value);
    els.thrVal.textContent = threshold.toFixed(3);
    renderProbChart(series, threshold);
    renderHist(series);

    // Samples gallery
    renderSamples(samples);

    // Wire controls
    els.thr.addEventListener("input", () => {
      const thr = Number(els.thr.value);
      els.thrVal.textContent = thr.toFixed(3);
      renderProbChart(series, thr);
    });

    els.toggleTruth.addEventListener("change", () => {
      renderProbChart(series, Number(els.thr.value));
    });

    els.togglePred.addEventListener("change", () => {
      renderProbChart(series, Number(els.thr.value));
    });

    els.samplesFilter.addEventListener("change", () => renderSamples(samples));
    els.samplesSort.addEventListener("change", () => renderSamples(samples));

  } catch (err) {
    console.error(err);
    document.body.innerHTML = `
      <div style="max-width:980px;margin:40px auto;padding:0 18px;font-family:system-ui;color:#fff;">
        <h2>Dashboard failed to load data</h2>
        <p style="color:rgba(255,255,255,0.75)">
          Make sure you placed files under <code>/results</code> and you're running from GitHub Pages or a local server.
        </p>
        <pre style="background:rgba(255,255,255,0.06);padding:12px;border-radius:12px;white-space:pre-wrap;border:1px solid rgba(255,255,255,0.12)">${String(err)}</pre>
      </div>
    `;
  }
}

main();
