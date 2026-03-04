// Tabs
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

// Filters
const filters = document.querySelectorAll(".filter");
filters.forEach(filter => {
  filter.addEventListener("click", () => {
    filters.forEach(f => f.classList.remove("active"));
    filter.classList.add("active");
  });
});

// Bottom navigation
const navItems = document.querySelectorAll(".nav-item");
navItems.forEach(item => {
  item.addEventListener("click", () => {
    navItems.forEach(n => n.classList.remove("active"));
    item.classList.add("active");
  });
});

// Score animation on load
window.addEventListener("load", () => {
  const scores = document.querySelectorAll(".score");
  scores.forEach(score => {
    score.style.transform = "scale(1.2)";
    setTimeout(() => {
      score.style.transform = "scale(1)";
    }, 300);
  });
});

/* ===== TEAM STANDINGS DATA ===== */

const teamStandingsData = [
  { pos: 1, name: "NSJL", points: 18, wins: 6, losses: 0 },
  { pos: 2, name: "The Arrows", points: 15, wins: 5, losses: 1 },
  { pos: 3, name: "Triple 20", points: 9, wins: 3, losses: 3 },
  { pos: 4, name: "Bullseye Crew", points: 6, wins: 2, losses: 4 }
];


/* ===== LAST MATCH RESULTS (ALLEEN NSJL) ===== */

const lastMatchResults = [
  { opponent: "The Arrows", result: "W 6-4" },
  { opponent: "Triple 20", result: "W 6-2" },
  { opponent: "Bullseye Crew", result: "L 5-6" },
  { opponent: "The Arrows", result: "W 6-3" }
];


/* ===== MOST IMPROVED PLAYER ===== */
/* Zet name op "" als je hem niet wilt tonen */

const mostImprovedPlayer = {
  name: "Kevin",
  stats: "Average improved from 58.2 → 64.7 | Checkout +12%"
};


/* ===== RENDER TEAM STANDINGS ===== */

const standingsTable = document.getElementById("teamStandings");

teamStandingsData.forEach(team => {
  standingsTable.innerHTML += `
    <tr>
      <td>${team.pos}</td>
      <td>${team.name}</td>
      <td>${team.points}</td>
      <td>${team.wins}</td>
      <td>${team.losses}</td>
    </tr>
  `;
});


/* ===== RENDER LAST RESULTS ===== */

const resultsContainer = document.getElementById("lastResults");

lastMatchResults.forEach(match => {
  resultsContainer.innerHTML += `
    <div class="result-item">
      <div>NSJL vs ${match.opponent}</div>
      <div>${match.result}</div>
    </div>
  `;
});


/* ===== MOST IMPROVED PLAYER CONDITIONAL RENDER ===== */

if (mostImprovedPlayer.name !== "") {
  document.getElementById("mipCard").style.display = "block";
  document.getElementById("mipName").innerText = mostImprovedPlayer.name;
  document.getElementById("mipStats").innerText = mostImprovedPlayer.stats;
}