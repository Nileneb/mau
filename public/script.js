// Year
document.getElementById("year").textContent = new Date().getFullYear();

// QR Flow
const steps = document.querySelectorAll(".flow-step");
function show(step) {
  steps.forEach(s => {
    s.classList.toggle("active", s.dataset.step === step);
  });
}
document.querySelectorAll("[data-next]").forEach(btn => {
  btn.addEventListener("click", () => show(btn.getAttribute("data-next")));
});

// Repo stats (via server proxy with caching)
async function loadRepo() {
  try {
    const r = await fetch("/api/github");
    if (!r.ok) throw new Error("bad");
    const d = await r.json();
    document.getElementById("repo-desc").textContent = d.description || "Open-source dental voice assistant.";
    document.getElementById("chip-stars").textContent = `⭐ ${d.stargazers_count ?? 0}`;
    document.getElementById("chip-forks").textContent = `🍴 ${d.forks_count ?? 0}`;
    document.getElementById("chip-issues").textContent = `❗ ${d.open_issues_count ?? 0}`;
    document.getElementById("chip-license").textContent = `📝 ${d.license ?? "—"}`;
    const updated = new Date(d.pushed_at);
    document.getElementById("repo-updated").textContent = `Updated: ${updated.toLocaleDateString()}`;
  } catch (e) {
    document.getElementById("repo-desc").textContent = "Could not load GitHub stats (rate limit?).";
  }
}
loadRepo();

// Visitor counter
async function countVisit() {
  try {
    const r = await fetch("/api/hit");
    if (!r.ok) return;
    const d = await r.json();
    const el = document.getElementById("visit-counter");
    if (el && typeof d.visits === "number") {
      el.textContent = d.visits.toLocaleString("de-DE");
    }
  } catch (e) {
    console.error("visit counter failed", e);
  }
}
countVisit();
