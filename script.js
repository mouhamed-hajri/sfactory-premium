/* =============================
   S-Factory Premium — script.js
   ============================= */

(function () {
  'use strict';

  /* ── Navbar: scroll behaviour ── */
  const navbar = document.getElementById('navbar');

  function onScroll() {
    if (window.scrollY > 60) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Hamburger / mobile menu ── */
  const hamburger  = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  function openMenu() {
    hamburger.classList.add('active');
    mobileMenu.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    hamburger.classList.remove('active');
    mobileMenu.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', function () {
    if (mobileMenu.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  mobileLinks.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  /* Close on outside click */
  document.addEventListener('click', function (e) {
    if (
      mobileMenu.classList.contains('open') &&
      !mobileMenu.contains(e.target) &&
      !hamburger.contains(e.target)
    ) {
      closeMenu();
    }
  });

  /* ── Smooth scroll for all anchor links ── */
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      const navHeight = navbar.offsetHeight;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  /* ── Reveal on scroll (IntersectionObserver) ── */
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealElements.forEach(function (el) {
    revealObserver.observe(el);
  });

  /* ── Staggered reveal for grid children ── */
  function staggerChildren(parentSelector, childSelector, delayStep) {
    document.querySelectorAll(parentSelector).forEach(function (parent) {
      parent.querySelectorAll(childSelector).forEach(function (child, i) {
        child.style.transitionDelay = i * delayStep + 'ms';
      });
    });
  }

  staggerChildren('.services-grid',  '.service-card',  80);
  staggerChildren('.pricing-grid',   '.pricing-card',  100);
  staggerChildren('.trainers-grid',  '.trainer-card',  100);
  staggerChildren('.about-features', '.about-feature', 60);

  /* ── Active nav link on scroll ── */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  function updateActiveLink() {
    let current = '';
    const scrollY = window.scrollY + navbar.offsetHeight + 20;

    sections.forEach(function (section) {
      if (scrollY >= section.offsetTop) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(function (link) {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', updateActiveLink, { passive: true });

  /* ── Contact form ── */
  const contactForm = document.getElementById('contactForm');

  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const nom      = document.getElementById('nom').value.trim();
      const objectif = document.getElementById('objectif').value;

      if (!nom) {
        showFormMessage('Veuillez entrer votre nom.', 'error');
        return;
      }

      if (!objectif) {
        showFormMessage('Veuillez sélectionner votre objectif.', 'error');
        return;
      }

      const submitBtn = contactForm.querySelector('.form-submit');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Envoi en cours…';

      /* Simulate async send */
      setTimeout(function () {
        showFormMessage(
          'Merci ' + nom + ', nous vous contacterons bientôt !',
          'success'
        );
        contactForm.reset();
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }, 900);
    });
  }

  function showFormMessage(text, type) {
    /* Remove any existing message */
    const existing = document.getElementById('formMsg');
    if (existing) existing.remove();

    const msg = document.createElement('div');
    msg.id = 'formMsg';
    msg.textContent = text;
    msg.style.cssText = [
      'margin-top:14px',
      'padding:14px 18px',
      'border-radius:8px',
      'font-size:0.88rem',
      'font-weight:600',
      'letter-spacing:0.02em',
      type === 'success'
        ? 'background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);color:#e8c96b'
        : 'background:rgba(192,57,43,0.12);border:1px solid rgba(192,57,43,0.35);color:#e74c3c',
    ].join(';');

    contactForm.appendChild(msg);

    /* Auto-remove after 5 s */
    setTimeout(function () {
      if (msg.parentNode) msg.remove();
    }, 5000);
  }

  /* ── Hero parallax (subtle) ── */
  const heroBg = document.querySelector('.hero-bg');

  if (heroBg && window.matchMedia('(min-width: 768px)').matches) {
    window.addEventListener('scroll', function () {
      const y = window.scrollY;
      heroBg.style.transform = 'scale(1.05) translateY(' + y * 0.25 + 'px)';
    }, { passive: true });
  }

  /* ── Gallery lightbox (minimal) ── */
  const galleryItems = document.querySelectorAll('.gallery-item');

  galleryItems.forEach(function (item) {
    item.addEventListener('click', function () {
      const placeholder = item.querySelector('.gallery-placeholder');
      const img = item.querySelector('img');
      const src = img ? img.src : (placeholder ? getComputedStyle(placeholder).backgroundImage : null);

      if (!src || src === 'none') return;

      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9999',
        'background:rgba(0,0,0,0.92)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'cursor:zoom-out', 'animation:fadeIn 0.25s ease',
      ].join(';');

      const picture = document.createElement('img');
      picture.src = src.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
      picture.style.cssText = [
        'max-width:90vw', 'max-height:90vh',
        'object-fit:contain', 'border-radius:8px',
        'box-shadow:0 20px 80px rgba(0,0,0,0.8)',
      ].join(';');

      overlay.appendChild(picture);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      overlay.addEventListener('click', function () {
        document.body.removeChild(overlay);
        document.body.style.overflow = '';
      });
    });
  });

  /* ── Inject keyframes for fadeIn ── */
  const styleTag = document.createElement('style');
  styleTag.textContent = '@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }';
  document.head.appendChild(styleTag);

})();
