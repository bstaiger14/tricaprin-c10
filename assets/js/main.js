const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-button]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const revealEls = document.querySelectorAll(".reveal");
const hotspots = document.querySelectorAll(".hotspot");
const topicPanel = document.querySelector("[data-topic-panel]");

const topics = {
  specific: {
    pill: "Specific C10",
    title: "A focused molecule, not a generic category.",
    body: "Tricaprin is a C10 medium-chain triglyceride associated with decanoic acid, a 10-carbon fatty acid. That gives it a more precise identity than ordinary “MCT oil.”",
    link: "#mct",
    linkText: "Compare it to MCT oil"
  },
  heart: {
    pill: "Heart metabolism",
    title: "The research story is about lipid handling inside cells.",
    body: "The most attention-grabbing tricaprin research is in TGCV, a rare cardiovascular condition involving abnormal intracellular triglyceride metabolism in heart and vascular cells.",
    link: "#research",
    linkText: "Read the research cards"
  },
  mct: {
    pill: "Not ordinary MCT oil",
    title: "C8, C10, C12, and blends are not the same thing.",
    body: "Generic MCT oil often emphasizes quick energy. Tricaprin C10 has a different positioning: specificity, C10 identity, and heart-metabolism research interest.",
    link: "#why-c10",
    linkText: "See why C10 is different"
  },
  proof: {
    pill: "Research context",
    title: "Strong enough to be interesting. Specific enough to be careful.",
    body: "Published studies make tricaprin worth paying attention to, but the evidence is concentrated in specific disease contexts. This site explains what the research does and does not prove.",
    link: "#research",
    linkText: "Explore source-linked summaries"
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

hotspots.forEach((spot) => {
  spot.addEventListener("click", () => setTopic(spot.dataset.topic));
  spot.addEventListener("mouseenter", () => setTopic(spot.dataset.topic));
});
