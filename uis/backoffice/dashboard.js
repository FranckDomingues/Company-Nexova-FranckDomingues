(function () {
  "use strict";

  // Codespaces forwards each port on the same hostname. Preserve its HTTPS
  // scheme and replace only the dashboard's forwarded port (5500) with 8000.
  const codespacesHostname = window.location.hostname.match(/^(.+)-5500\.(app\.github\.dev)$/);
  const API_BASE_URL = codespacesHostname
    ? `${window.location.protocol}//${codespacesHostname[1]}-8000.${codespacesHostname[2]}`
    : "http://127.0.0.1:8000";
  const CATEGORIES = ["TECHNICAL", "BILLING", "ACCESS", "HR_QUERY", "COMPLAINT"];
  const STATUSES = ["OPEN", "CLOSED", "DISCARDED"];
  const SCORE_LABELS = ["Muy insatisfecho", "Insatisfecho", "Neutral", "Satisfecho", "Muy satisfecho"];
  const REASON_LABELS = {
    "Missing client_company": "Falta client_company",
    "Invalid or missing category": "Categoría no válida o ausente",
    "Invalid description": "Descripción no válida",
    "Invalid agent ID": "Identificador de agente no válido",
    "Invalid status": "Estado no válido",
    "Invalid or missing email": "Correo no válido o ausente",
    "Closed ticket, no score": "Incidencia cerrada sin puntuación",
    "Invalid satisfaction score": "Puntuación de satisfacción no válida",
    "Invalid ticket ID": "Identificador de incidencia no válido",
    "Duplicate ticket ID": "Identificador de incidencia duplicado",
    "Invalid date": "Fecha no válida",
    "Malformed row": "Fila con estructura no válida",
  };

  const form = document.querySelector("#upload-form");
  const fileInput = document.querySelector("#csv-file");
  const fileName = document.querySelector("#file-name");
  const submitButton = document.querySelector("#analyze-button");
  const exportButton = document.querySelector("#export-button");
  const errorMessage = document.querySelector("#upload-error");
  const statusMessage = document.querySelector("#upload-status");
  const resultsSection = document.querySelector("#results");
  const dropZone = document.querySelector("#drop-zone");
  let analysisId = null;
  let processing = false;

  function setMessage(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function showStatus(message) {
    setMessage(errorMessage, "");
    setMessage(statusMessage, message);
  }

  function showError(message) {
    setMessage(statusMessage, "");
    setMessage(errorMessage, message);
  }

  function metric(metrics, key) {
    return metrics[key] === undefined || metrics[key] === null ? "0" : String(metrics[key]);
  }

  function addRow(tbody, cells) {
    const row = document.createElement("tr");
    cells.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  }

  function setMetricRows(elementId, labels, metrics, prefix, percentPrefix) {
    const tbody = document.querySelector(elementId);
    tbody.replaceChildren();
    labels.forEach((label) => {
      const count = metric(metrics, `${prefix}:${label}`);
      const percent = metrics[`${percentPrefix}:${label}`];
      addRow(tbody, [label, count, percent === undefined || percent === "N/A" ? "—" : `${percent}%`]);
    });
  }

  function renderReasons(metrics) {
    const list = document.querySelector("#invalid-reasons");
    list.replaceChildren();
    const entries = Object.entries(metrics)
      .filter(([key, value]) => key.startsWith("invalid:") && Number(value) > 0)
      .sort(([left], [right]) => left.localeCompare(right));

    if (!entries.length) {
      const item = document.createElement("li");
      item.textContent = "No se encontraron registros no válidos.";
      list.appendChild(item);
      return;
    }
    entries.forEach(([key, value]) => {
      const reason = key.slice("invalid:".length);
      const item = document.createElement("li");
      const label = document.createElement("span");
      const count = document.createElement("span");
      label.textContent = REASON_LABELS[reason] || reason;
      count.className = "reason-count";
      count.textContent = String(value);
      item.append(label, count);
      list.appendChild(item);
    });
  }

  function renderScores(metrics) {
    const body = document.querySelector("#score-rows");
    body.replaceChildren();
    for (let score = 1; score <= 5; score += 1) {
      addRow(body, [`${score} · ${SCORE_LABELS[score - 1]}`, metric(metrics, `satisfaction_score:${score}`)]);
    }
    document.querySelector("#scored-count").textContent = `${metric(metrics, "scored_closed_tickets")} con puntuación registrada`;
  }

  function renderAnalysis(data) {
    const metrics = data.metrics || {};
    document.querySelector("#total-value").textContent = String(data.total ?? metric(metrics, "total_records"));
    document.querySelector("#valid-value").textContent = String(data.valid ?? metric(metrics, "valid_records"));
    document.querySelector("#invalid-value").textContent = String(data.invalid ?? metric(metrics, "invalid_records"));
    const average = metrics.average_satisfaction;
    document.querySelector("#average-value").textContent = average && average !== "N/A" ? average : "N/D";
    setMetricRows("#category-rows", CATEGORIES, metrics, "category", "category_percentage");
    setMetricRows("#status-rows", STATUSES, metrics, "status", "status_percentage");
    renderReasons(metrics);
    renderScores(metrics);
    document.querySelector("#empty-data-note").hidden = Number(data.valid ?? metric(metrics, "valid_records")) !== 0;
    resultsSection.hidden = false;
    analysisId = data.analysis_id;
    exportButton.disabled = !analysisId;
  }

  function updateSelectedFile() {
    const file = fileInput.files && fileInput.files[0];
    fileName.textContent = file ? file.name : "Ningún archivo seleccionado";
    submitButton.disabled = !file || processing;
    setMessage(errorMessage, "");
    setMessage(statusMessage, "");
  }

  function describeUploadError(response) {
    if (response.status === 413) return "El archivo supera el límite permitido por el servicio. Selecciona un CSV más pequeño.";
    if (response.status === 400 || response.status === 422) return "No se pudo analizar el archivo. Comprueba que sea un CSV UTF-8 con las columnas y el formato requeridos.";
    if (response.status >= 500) return "El servicio de análisis no pudo completar la solicitud. Inténtalo de nuevo más tarde.";
    return "No se pudo completar la carga. Comprueba la conexión con el servicio e inténtalo de nuevo.";
  }

  fileInput.addEventListener("change", updateSelectedFile);
  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  }));
  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    updateSelectedFile();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (processing) return;
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      showError("Selecciona un archivo CSV antes de continuar.");
      fileInput.focus();
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      showError("El archivo seleccionado debe tener extensión .csv.");
      fileInput.focus();
      return;
    }

    processing = true;
    submitButton.disabled = true;
    submitButton.textContent = "Analizando…";
    showStatus("Procesando el archivo de forma segura…");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_BASE_URL}/api/incidents/analyze`, { method: "POST", body, credentials: "include" });
      if (!response.ok) throw new Error(describeUploadError(response));
      const data = await response.json();
      if (!data || !data.analysis_id || !data.metrics) throw new Error("El servicio devolvió una respuesta incompleta. Inténtalo de nuevo.");
      renderAnalysis(data);
      showStatus("Análisis completado. Los resultados muestran únicamente datos agregados.");
    } catch (error) {
      showError(error instanceof TypeError ? "No se pudo conectar con el servicio de análisis. Verifica que esté disponible e inténtalo de nuevo." : error.message);
    } finally {
      processing = false;
      if (statusMessage.textContent === "Procesando el archivo de forma segura…") {
        setMessage(statusMessage, "");
      }
      submitButton.textContent = "Analizar archivo";
      submitButton.disabled = !fileInput.files || fileInput.files.length === 0;
    }
  });

  exportButton.addEventListener("click", async () => {
    if (!analysisId) return;
    exportButton.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/results/export?analysis_id=${encodeURIComponent(analysisId)}`, { credentials: "include" });
      if (!response.ok) throw new Error(response.status === 404 ? "El resultado ya no está disponible. Vuelve a analizar el archivo." : "No se pudo descargar el resultado. Inténtalo de nuevo.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "results.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showError(error instanceof TypeError ? "No se pudo conectar con el servicio para descargar el resultado." : error.message);
    } finally {
      exportButton.disabled = !analysisId;
    }
  });
}());
