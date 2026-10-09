export function bindExportDialog(endpoint) {
  const dialog = document.getElementById("exportDialog");
  const form = document.getElementById("exportForm");
  const error = document.getElementById("exportError");
  const confirm = document.getElementById("exportConfirm");
  document.getElementById("btnExport").addEventListener("click", () => {
    error.classList.add("hidden");
    error.textContent = "";
    dialog.showModal();
  });
  document.getElementById("exportCancel").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const mode = new FormData(form).get("mode");
    confirm.disabled = true;
    confirm.textContent = "Gerando...";
    error.classList.add("hidden");
    try {
      const response = await fetch(`${endpoint}?mode=${encodeURIComponent(mode)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Falha na extração (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      link.href = url;
      link.download = disposition.match(/filename="([^"]+)"/)?.[1] || "preenchimento.xlsx";
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 1_000);
      dialog.close();
    } catch (cause) {
      error.textContent = cause?.message || "Falha ao gerar o XLSX.";
      error.classList.remove("hidden");
    } finally {
      confirm.disabled = false;
      confirm.textContent = "Baixar XLSX";
    }
  });
}
