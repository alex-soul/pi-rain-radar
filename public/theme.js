// Apply the saved preference before the map paints to avoid a bright flash at night.
try {
  document.documentElement.dataset.theme =
    localStorage.getItem("radar-theme") === "dark" ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}
