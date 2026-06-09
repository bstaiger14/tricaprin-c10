document.addEventListener("DOMContentLoaded", () => {
  // Intersection Observer for scroll fade-in animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll(".fade-in").forEach(el => {
    observer.observe(el);
  });

  // Smooth Scrolling for Navigation
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      }
    });
  });

  // Navbar shadow drops on scroll
  const navbar = document.querySelector(".navbar");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 20) {
      navbar.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.05)";
    } else {
      navbar.style.boxShadow = "none";
    }
  });

  // --- INTERACTIVE HOTSPOTS LOGIC ---
  const hotspots = document.querySelectorAll('.hotspot');
  const cards = document.querySelectorAll('.hotspot-card');
  const closeBtns = document.querySelectorAll('.close-card');

  function closeAllCards() {
    cards.forEach(card => card.classList.remove('active'));
    hotspots.forEach(btn => btn.classList.remove('active'));
  }

  // Open Tooltip when + is clicked
  hotspots.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from triggering the document closer
      
      const targetId = btn.getAttribute('data-target');
      const targetCard = document.getElementById(targetId);
      
      // If clicking the currently active one, close it. Otherwise, open the new one.
      if (btn.classList.contains('active')) {
        closeAllCards();
      } else {
        closeAllCards(); // Close any currently open cards first
        btn.classList.add('active');
        if(targetCard) {
          targetCard.classList.add('active');
        }
      }
    });
  });

  // Close when 'X' is clicked inside the tooltip
  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllCards();
    });
  });

  // Close tooltips if the user clicks anywhere else on the screen
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hotspot-card') && !e.target.closest('.hotspot')) {
      closeAllCards();
    }
  });

  // Prevent clicking inside the card from closing it
  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  // --- RESEARCH ATLAS LOGIC ---
  const filterButtons = document.querySelectorAll('[data-research-filter]');
  const studyCards = document.querySelectorAll('[data-study-card]');

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.getAttribute('data-research-filter');

      filterButtons.forEach(btn => {
        btn.classList.toggle('active', btn === button);
      });

      studyCards.forEach(card => {
        const categories = (card.getAttribute('data-study-card') || '').split(/\s+/);
        const shouldShow = filter === 'all' || categories.includes(filter);
        card.classList.toggle('hide', !shouldShow);
      });
    });
  });

  // Subtle count-up animation for the evidence summary numbers
  const metricNumbers = document.querySelectorAll('[data-count]');

  const animateMetric = (metric) => {
    const target = Number(metric.getAttribute('data-count')) || 0;
    const duration = 850;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      metric.textContent = String(Math.round(target * eased));

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        metric.textContent = String(target);
      }
    };

    metric.textContent = '0';
    requestAnimationFrame(tick);
  };

  if (metricNumbers.length) {
    const metricObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateMetric(entry.target);
          metricObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.35 });

    metricNumbers.forEach(metric => metricObserver.observe(metric));
  }
});
