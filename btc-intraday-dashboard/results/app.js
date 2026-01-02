/* ============================================================
   Static trading-style dashboard (GitHub Pages)
   Folder layout (YOU HAVE THIS):
   btc-intraday-dashboard/results/
     index.html
     style.css
     app.js
     metrics.json
     confusion_matrix.json
     predictions_valid.csv
     samples.json
     samples/*.png
     assets/favicon.png

   All fetch paths are relative to THIS folder.
============================================================ */

const FILES = {
  metrics: "metrics.json",
  confusion: "confusion_matrix.json",
  preds: "predictions_valid.csv",
  samples: "samples.json",
};

const els = {
  kpiDataset: document.getElementById("kpi-dataset"),
  kpiSetup: document.getElementById("kpi-setup"),
  kpiAcc: document.getElementById("kpi-acc"),
  kpiAuc: document.getElementById("kpi-auc"),
  kpiN: document.getElementById("kpi-n"),

  thr: document.getElementById("thr"),
  thrVal: document.getElementById("thr-val"),
  toggleTruth: document.getElementById("toggle-truth"),
  togglePred: document.getElementById("toggle-pred"),

  mAcc: document.getElementById("m-acc"),
  mPrec: document.getElementById("m-prec"),
  mRec: document.getElementById("m-rec"),
  mF1: document.getElementById("m-f1"),
  mBacc: document.getElementById("m-bacc"),

  cmTN: document.getElementById("cm-tn"),
  cmFP: document.getElementById("cm-fp"),
  cmFN: document.getElementById("cm-fn"),
  cmTP: document.getElementById("cm-tp"),
  cmTPR: document.getElementById("cm-tpr"),
  cmTNR: document.getElementById("cm-tnr"),
  cmSrc: document.getElementById("cm-src"),

  topn: document.getElementById("topn"),
  topTable: document.getElementById("top-table").querySelector("tbody"),

  samplesWrap: document.getElementById("samples"),
  samplesFilter: document.getElementById("samples-filter"),
  samplesSort: document.getElementById("samples-sort"),
};

function fmt(x, d = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return Number(x).toFixed(d);
}

async function fetchJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch ${path} (${r.status})`);
  return await r.json();
}

async function fetchText(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch ${path} (${r.status})`);
  return await r.text();
}

// Minimal CSV parser for your file format (no quoted commas)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map(s => s.trim());
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < header.length) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = parts[j];
    out.push(obj);
  }
  return out;
}

function safeDiv(a, b) {
  return b === 0 ? null : a / b;
}

function computeMetricsAtThreshold(rows, thr) {
  // rows: {y_true, y_prob, datetime, ...}
  let TP = 0, TN = 0, FP = 0, FN = 0;

  for (const r of rows) {
    const y = r.y_true;
    const p = r.y_prob;
    const pred = (p >= thr) ? 1 : 0;

    if (y === 1 && pred === 1) TP++;
    else if (y === 0 && pred === 0) TN++;
    else if (y === 0 && pred === 1) FP++;
    else if (y === 1 && pred === 0) FN++;
  }

  const acc = safeDiv(TP + TN, TP + TN + FP + FN);
  const prec = safeDiv(TP, TP + FP);
  const rec = safeDiv(TP, TP + FN);
  const f1 = (prec === null || rec === null || (prec + rec) === 0) ? null : (2 * prec * rec) / (prec + rec);

  const tpr = rec;
  const tnr = safeDiv(TN, TN + FP);
  const bacc = (tpr === null || tnr === null) ? null : (tpr + tnr) / 2;

  return { TP, TN, FP, FN, acc, prec, rec, f1, tpr, tnr, bacc };
}

function setKpis(metrics, nRows) {
  els.kpiDataset.textContent = metrics.dataset ?? "—";
  els.kpiSetup.textContent = `Horizon: ${metrics.label_horizon_steps} | Window: ${metrics.window_size} | Img: ${metrics.img_size}px`;
  els.kpiAcc.textContent = fmt(metrics.valid_accuracy, 4);
  els.kpiAuc.textContent = fmt(metrics.valid_auc, 4);
  els.kpiN.textContent = String(nRows);
}

function renderConfusion(m, sourceLabel) {
  els.cmTN.textContent = String(m.TN);
  els.cmFP.textContent = String(m.FP);
  els.cmFN.textContent = String(m.FN);
  els.cmTP.textContent = String(m.TP);
  els.cmTPR.textContent = m.tpr === null ? "—" : fmt(m.tpr, 4);
  els.cmTNR.textContent = m.tnr === null ? "—" : fmt(m.tnr, 4);
  els.cmSrc.textContent = sourceLabel;
}

function setMetricChips(m) {
  els.mAcc.textContent  = m.acc  === null ? "—" : fmt(m.acc, 4);
  els.mPrec.textContent = m.prec === null ? "—" : fmt(m.prec, 4);
  els.mRec.textContent  = m.rec  === null ? "—" : fmt(m.rec, 4);
  els.mF1.textContent   = m.f1   === null ? "—" : fmt(m.f1, 4);
  els.mBacc.textContent = m.bacc === null ? "—" : fmt(m.bacc, 4);
}

function buildSeries(rows) {
  const x = [];
  const yProb = [];
  const yTrue = [];
  for (const r of rows) {
    x.push(r.datetimeObj);
    yProb.push(r.y_prob);
    yTrue.push(r.y_true);
  }
  return { x, yProb, yTrue };
}

function renderProbChart(series, rows, thr) {
  const showTruth = els.toggleTruth.checked;
  const showPred = els.togglePred.checked;

  const traces = [];

  // Probability line
  traces.push({
    x: series.x,
    y: series.yProb,
    type: "scatter",
    mode: "lines",
    name: "y_prob (P up)",
    line: { width: 2 },
    hovertemplate: "Time: %{x}<br>P(up): %{y:.6f}<extra></extra>",
  });

  // Threshold line
  traces.push({
    x: series.x,
    y: series.yProb.map(() => thr),
    type: "scatter",
    mode: "lines",
    name: `threshold ${thr.toFixed(3)}`,
    line: { dash: "dot", width: 1 },
    hoverinfo: "skip",
  });

  // Optional markers: y_true + y_pred(thr) on y2
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
    const yPredThr = rows.map(r => (r.y_prob >= thr ? 1 : 0));
    traces.push({
      x: series.x,
      y: yPredThr,
      type: "scatter",
      mode: "markers",
      name: "y_pred(thr)",
      marker: { size: 5, opacity: 0.7 },
      hovertemplate: "Time: %{x}<br>y_pred(thr): %{y}<extra></extra>",
      yaxis: "y2",
    });
  }

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 52, r: 44, t: 8, b: 42 },
    legend: { orientation: "h", y: 1.15, x: 0 },
    xaxis: {
      title: "Time",
      gridcolor: "rgba(255,255,255,0.08)",
      zerolinecolor: "rgba(255,255,255,0.08)",
    },
    yaxis: {
      title: "Probability",
      gridcolor: "rgba(255,255,255,0.08)",
      zerolinecolor: "rgba(255,255,255,0.08)",
      tickformat: ".3f",
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
    },
  };

  Plotly.react("chart-prob", traces, layout, { displayModeBar: false, responsive: true });
}

function renderHist(series) {
  const trace = {
    x: series.yProb,
    type: "histogram",
    nbinsx: 40,
    hovertemplate: "y_prob: %{x:.6f}<br>count: %{y}<extra></extra>",
    showlegend: false,
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 52, r: 18, t: 8, b: 42 },
    xaxis: { title: "y_prob", gridcolor: "rgba(255,255,255,0.08)" },
    yaxis: { title: "count", gridcolor: "rgba(255,255,255,0.08)" },
  };

  Plotly.react("chart-hist", [trace], layout, { displayModeBar: false, responsive: true });
}

function renderCalibration(rows) {
  // 10 bins
  const bins = 10;
  const binCount = Array(bins).fill(0);
  const binProbSum = Array(bins).fill(0);
  const binTrueSum = Array(bins).fill(0);

  for (const r of rows) {
    const p = r.y_prob;
    const b = Math.min(bins - 1, Math.floor(p * bins));
    binCount[b] += 1;
    binProbSum[b] += p;
    binTrueSum[b] += r.y_true;
  }

  const x = [];
  const y = [];
  const text = [];
  for (let b = 0; b < bins; b++) {
    if (binCount[b] === 0) continue;
    const avgP = binProbSum[b] / binCount[b];
    const upRate = binTrueSum[b] / binCount[b];
    x.push(avgP);
    y.push(upRate);
    text.push(`bin ${b}<br>n=${binCount[b]}`);
  }

  const trace = {
    x,
    y,
    type: "scatter",
    mode: "markers+lines",
    hovertemplate: "avg p: %{x:.4f}<br>up rate: %{y:.4f}<br>%{text}<extra></extra>",
    text,
  };

  const perfect = {
    x: [0, 1],
    y: [0, 1],
    type: "scatter",
    mode: "lines",
    name: "perfect",
    line: { dash: "dot", width: 1 },
    hoverinfo: "skip",
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 52, r: 18, t: 8, b: 42 },
    xaxis: { title: "avg predicted probability", range: [0, 1], gridcolor: "rgba(255,255,255,0.08)" },
    yaxis: { title: "actual up-rate", range: [0, 1], gridcolor: "rgba(255,255,255,0.08)" },
    showlegend: false,
  };

  Plotly.react("chart-cal", [trace, perfect], layout, { displayModeBar: false, responsive: true });
}

function renderHeatmap(rows, thr) {
  // Accuracy by hour-of-day (UTC based on datetime string parsing)
  const hours = 24;
  const count = Array(hours).fill(0);
  const correct = Array(hours).fill(0);

  for (const r of rows) {
    const h = r.datetimeObj.getUTCHours();
    const pred = (r.y_prob >= thr) ? 1 : 0;
    count[h] += 1;
    if (pred === r.y_true) correct[h] += 1;
  }

  const z = [correct.map((c, h) => count[h] ? c / count[h] : null)];
  const x = Array.from({ length: hours }, (_, i) => String(i).padStart(2, "0"));
  const y = ["acc"];

  const trace = {
    z,
    x,
    y,
    type: "heatmap",
    hovertemplate: "hour: %{x}<br>acc: %{z:.4f}<extra></extra>",
    showscale: true,
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 52, r: 18, t: 8, b: 42 },
    xaxis: { title: "UTC hour", gridcolor: "rgba(255,255,255,0.08)" },
    yaxis: { gridcolor: "rgba(255,255,255,0.08)" },
  };

  Plotly.react("chart-heat", [trace], layout, { displayModeBar: false, responsive: true });
}

function renderTopSignals(rows, thr, topN) {
  // Top by confidence = |p - 0.5|
  const sorted = rows
    .map(r => ({ ...r, conf: Math.abs(r.y_prob - 0.5), predThr: (r.y_prob >= thr) ? 1 : 0 }))
    .sort((a, b) => b.conf - a.conf)
    .slice(0, topN);

  els.topTable.innerHTML = "";
  for (const r of sorted) {
    const correct = (r.predThr === r.y_true);
    const tr = document.createElement("tr");

    const tdTime = document.createElement("td");
    tdTime.textContent = r.datetime;

    const tdP = document.createElement("td");
    tdP.className = "right mono";
    tdP.textContent = r.y_prob.toFixed(6);

    const tdPred = document.createElement("td");
    tdPred.className = "right mono";
    tdPred.textContent = String(r.predThr);

    const tdTrue = document.createElement("td");
    tdTrue.className = "right mono";
    tdTrue.textContent = String(r.y_true);

    const tdOk = document.createElement("td");
    tdOk.className = `right mono ${correct ? "good" : "bad"}`;
    tdOk.textContent = correct ? "YES" : "NO";

    tr.appendChild(tdTime);
    tr.appendChild(tdP);
    tr.appendChild(tdPred);
    tr.appendChild(tdTrue);
    tr.appendChild(tdOk);

    els.topTable.appendChild(tr);
  }
}

function renderSamples(samples) {
  const filter = els.samplesFilter.value;
  const sort = els.samplesSort.value;

  let items = samples.slice();
  if (filter !== "all") items = items.filter(s => s.tag === filter);

  items.forEach(s => { s._conf = Math.abs(Number(s.y_prob) - 0.5); });

  items.sort((a, b) => {
    if (sort === "conf_desc") return b._conf - a._conf;
    if (sort === "conf_asc") return a._conf - b._conf;
    if (sort === "time_desc") return new Date(b.datetime) - new Date(a.datetime);
    if (sort === "time_asc") return new Date(a.datetime) - new Date(b.datetime);
    return 0;
  });

  els.samplesWrap.innerHTML = "";

  for (const s of items) {
    const card = document.createElement("div");
    card.className = "sample";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = `${s.tag} ${s.datetime}`;
    img.src = s.png; // samples.json already contains "samples/xxx.png" relative to this folder
    img.onerror = () => { img.style.opacity = "0.25"; };

    const body = document.createElement("div");
    body.className = "sample-body";

    const tag = document.createElement("div");
    tag.className = `tag ${s.tag === "wrong" ? "wrong" : ""}`;
    tag.innerHTML = `<span class="dot"></span><span>${s.tag.toUpperCase()}</span>`;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <div class="row"><span>time</span><span>${s.datetime}</span></div>
      <div class="row"><span>y_true</span><span class="mono">${s.y_true}</span></div>
      <div class="row"><span>y_pred</span><span class="mono">${s.y_pred}</span></div>
      <div class="row"><span>y_prob</span><span class="mono">${Number(s.y_prob).toFixed(6)}</span></div>
    `;

    body.appendChild(tag);
    body.appendChild(meta);

    card.appendChild(img);
    card.appendChild(body);

    els.samplesWrap.appendChild(card);
  }
}

function showFatal(err) {
  console.error(err);
  document.body.innerHTML = `
    <div style="max-width:960px;margin:40px auto;padding:0 16px;color:#fff;font-family:system-ui;">
      <h2>Dashboard failed to load</h2>
      <p style="opacity:.75">You are inside <code>btc-intraday-dashboard/results/</code>. Ensure these files exist here:</p>
      <ul style="opacity:.75">
        <li>metrics.json</li>
        <li>confusion_matrix.json</li>
        <li>predictions_valid.csv</li>
        <li>samples.json</li>
        <li>samples/*.png</li>
      </ul>
      <pre style="background:rgba(255,255,255,0.06);padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);white-space:pre-wrap;">${String(err)}</pre>
    </div>
  `;
}

async function main() {
  try {
    const [metrics, baseCM, samplesJson, csvText] = await Promise.all([
      fetchJSON(FILES.metrics),
      fetchJSON(FILES.confusion),
      fetchJSON(FILES.samples),
      fetchText(FILES.preds),
    ]);

    const rawRows = parseCSV(csvText);

    // Normalize rows into typed values
    const rows = rawRows.map(r => ({
      datetime: r.datetime,
      datetimeObj: new Date(r.datetime.replace(" ", "T") + "Z"), // treat as UTC
      y_true: Number(r.y_true),
      y_prob: Number(r.y_prob),
      y_pred_file: Number(r.y_pred),
      fname: r.fname,
    }));

    setKpis(metrics, rows.length);

    // Base confusion file exists, but we display LIVE confusion (thr-based) as primary.
    // We still have baseCM if you want to compare later.
    // baseCM.matrix is [[TN,FP],[FN,TP]]

    // Initial render
    const series = buildSeries(rows);

    const renderAll = () => {
      const thr = Number(els.thr.value);
      els.thrVal.textContent = thr.toFixed(3);

      const m = computeMetricsAtThreshold(rows, thr);
      setMetricChips(m);

      renderProbChart(series, rows, thr);
      renderHist(series);
      renderCalibration(rows);
      renderHeatmap(rows, thr);

      renderConfusion(m, "thr");

      const topN = Number(els.topn.value);
      renderTopSignals(rows, thr, topN);

      renderSamples(samplesJson);
    };

    // Wire events
    els.thr.addEventListener("input", renderAll);
    els.toggleTruth.addEventListener("change", renderAll);
    els.togglePred.addEventListener("change", renderAll);
    els.topn.addEventListener("change", renderAll);
    els.samplesFilter.addEventListener("change", renderAll);
    els.samplesSort.addEventListener("change", renderAll);

    renderAll();

  } catch (err) {
    showFatal(err);
  }
}

main();
