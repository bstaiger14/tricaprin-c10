const hotspotContent = {
  specific: {
    kicker: "Specific C10",
    title: "Tricaprin is not a generic MCT blend.",
    body: "Tricaprin is a focused C10 triglyceride. That specificity is the reason it has a different research story than ordinary C8/C10 MCT oils."
  },
  mct: {
    kicker: "Not ordinary MCT",
    title: "MCT oil is a category. C10 is a chain length.",
    body: "Many MCT products combine fatty acids. Tricaprin centers the story on C10, the form consumers are now searching for because of emerging research."
  },
  research: {
    kicker: "Heart-metabolism research",
    title: "The attention comes from published cardiovascular research.",
    body: "Tricaprin has been studied in TGCV, a rare disease involving abnormal triglyceride metabolism in the heart and blood vessels. That is what makes the C10 story different."
  },
  wellness: {
    kicker: "Consumer interest",
    title: "People want the ingredient after they learn the story.",
    body: "When science coverage explains tricaprin, consumers start searching for the exact ingredient—not just another MCT oil. A dedicated C10 supplement becomes the natural next step."
  }
};

const panel = document.querySelector("#hotspotPanel");
const buttons = document.querySelectorAll("[data-hotspot]");

function setHotspot(key) {
  const content = hotspotContent[key];
  if (!content || !panel) return;

  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.hotspot === key);
  });

  panel.innerHTML = `
    <p class="panel-kicker">${content.kicker}</p>
    <h2>${content.title}</h2>
    <p>${content.body}</p>
  `;
}

buttons.forEach((button) => {
  button.addEventListener("click", () => setHotspot(button.dataset.hotspot));
});

const reveals = document.querySelectorAll(".reveal");

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

reveals.forEach((element) => revealObserver.observe(element));

const header = document.querySelector("[data-header]");

function updateHeader() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();
