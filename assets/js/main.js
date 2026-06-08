(() => {
  const header      = document.querySelector('[data-header]');
  const progress    = document.querySelector('.site-progress span');
  const reveals     = document.querySelectorAll('.reveal, .chain-comparison');
  const parallaxItems = document.querySelectorAll('[data-parallax]');
  const tiltCard    = document.querySelector('[data-tilt]');
  const canvas      = document.querySelector('[data-particles]');

  // ─── Mobile nav ───────────────────────────────────────────────
  const hamburger    = document.getElementById('hamburger');
  const mobileNav    = document.getElementById('mobileNav');
  const mobileClose  = document.getElementById('mobileNavClose');
  const mobileLinks  = document.querySelectorAll('.mobile-nav-link, .mobile-nav-cta');

  const openNav = () => {
    mobileNav.classList.add('is-open');
    mobileNav.setAttribute('aria-hidden', 'false');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };

  const closeNav = () => {
    mobileNav.classList.remove('is-open');
    mobileNav.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  if (hamburger) hamburger.addEventListener('click', openNav);
  if (mobileClose) mobileClose.addEventListener('click', closeNav);
  mobileLinks.forEach(link => link.addEventListener('click', closeNav));

  // Close on outside click
  mobileNav.addEventListener('click', (e) => {
    if (e.target === mobileNav) closeNav();
  });

  // ─── Scroll: progress bar + header state ──────────────────────
  const updateScroll = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const pct = height > 0 ? (scrollTop / height) * 100 : 0;
    if (progress) progress.style.width = `${pct}%`;
    if (header) header.classList.toggle('scrolled', scrollTop > 60);
  };

  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  // ─── Intersection observer: reveal + chain bars ───────────────
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

  reveals.forEach((el) => io.observe(el));

  // ─── Parallax + tilt ──────────────────────────────────────────
  window.addEventListener('mousemove', (event) => {
    const x = (event.clientX / window.innerWidth) - 0.5;
    const y = (event.clientY / window.innerHeight) - 0.5;

    parallaxItems.forEach((item) => {
      const factor = Number(item.dataset.parallax || 0.12);
      item.style.transform = `translate3d(${x * factor * 70}px, ${y * factor * 70}px, 0)`;
    });

    if (tiltCard && window.innerWidth > 900) {
      tiltCard.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
    }
  }, { passive: true });

  if (tiltCard) {
    tiltCard.addEventListener('mouseleave', () => {
      tiltCard.style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
  }

  // ─── Particle canvas ──────────────────────────────────────────
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let width = 0, height = 0, particles = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width  = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width  = width  * ratio;
      canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(72, Math.max(32, Math.floor(width / 18)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.7 + 0.6,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        alpha: Math.random() * 0.45 + 0.18
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width)  p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(157, 246, 191, ${p.alpha})`;
        ctx.fill();

        for (let j = index + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 105) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(85, 214, 208, ${(1 - dist / 105) * 0.12})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      });
      if (!reducedMotion) requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();
  }
})();
