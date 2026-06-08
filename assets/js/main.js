const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const revealEls = document.querySelectorAll(".reveal");
const hotspots = document.querySelectorAll(".hotspot");
const topicPanel = document.querySelector("[data-topic-panel]");

const topics = {
  specific: {
    pill: "Targeted Delivery",
    title: "Bypassing the 'Shuttle'.",
    body: "Most ordinary fats are bulky and require a special transporter (a 'carnitine shuttle') to get inside heart cells. Tricaprin (C10) is unique—it bypasses this shuttle entirely, entering heart cells directly to help break down stubborn fat.",
    link: "#research",
    linkText: "See the clinical research"
  },
  heart: {
    pill: "C10 vs C8",
    title: "Why not C8 for the heart?",
    body: "Chain length changes everything. C8 is processed rapidly by the liver into ketones for brain energy. C10 travels further, hitting the exact metabolic sweet spot required to specifically reach and fuel cardiovascular tissue.",
    link: "#mct",
    linkText: "Compare MCT types"
  },
  mct: {
    pill: "100% Pure",
    title: "Diluted blends won't work.",
    body: "Generic MCT oils dilute C10 with cheaper fats. To ensure this specific molecule actually reaches targeted tissues in meaningful amounts without getting watered down, a 100% pure Tricaprin formulation is required.",
    link: "#supplement",
    linkText: "View the pure supplement"
  }
};

function updateHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 10);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

if (menuButton) {
  menuButton.addEventListener("click", () => {
    document.body.classList.toggle("menu-open");
  });
}

if (mobileNav) {
  mobileNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => document.body.classList.remove("menu-open"));
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealEls.forEach((el, index) => {
    el.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
    observer.observe(el);
  });
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

function setTopic(topicKey) {
  const topic = topics[topicKey];
  if (!topic || !topicPanel) return;

  hotspots.forEach((spot) => {
    spot.classList.toggle("active", spot.dataset.topic === topicKey);
  });

  topicPanel.innerHTML = `
    <span class="panel-pill">${topic.pill}</span>
    <h3>${topic.title}</h3>
    <p>${topic.body}</p>
    <a href="${topic.link}">${topic.linkText}</a>
  `;
}

// Initialize the first topic on page load
setTopic("specific");

hotspots.forEach((spot) => {
  spot.addEventListener("click", () => setTopic(spot.dataset.topic));
  spot.addEventListener("mouseenter", () => setTopic(spot.dataset.topic));
});
