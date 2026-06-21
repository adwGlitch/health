/* =========================================================
   FarmGuard AI – Landing Page JavaScript
   ========================================================= */

'use strict';

// ---- Navbar scroll effect ----
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
}, { passive: true });

// ---- Mobile hamburger ----
const hamburger = document.getElementById('navHamburger');
const navLinks  = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navLinks.classList.toggle('open');
});

// Close mobile nav on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

// ---- Smooth scroll for anchor links ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 72;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ---- Intersection Observer – animate on scroll ----
const observerOptions = {
  threshold: 0.12,
  rootMargin: '0px 0px -40px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Elements to animate
const animateTargets = [
  '.feature-card',
  '.how-step',
  '.arch-node',
  '.arch-layer',
  '.hero-stats'
];

animateTargets.forEach(selector => {
  document.querySelectorAll(selector).forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity 0.55s ease ${i * 0.08}s, transform 0.55s ease ${i * 0.08}s`;
    observer.observe(el);
  });
});

// ---- Counter animation for hero stats ----
function animateCounter(el, target, suffix = '', decimals = 0) {
  const duration = 1600;
  const start = performance.now();
  const startVal = 0;

  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = startVal + (target - startVal) * eased;
    el.textContent = decimals > 0 ? val.toFixed(decimals) : Math.floor(val);
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = target + suffix;
  }
  requestAnimationFrame(update);
}

// Observe hero stats
const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
  const statsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      statsObserver.disconnect();
    }
  }, { threshold: 0.5 });
  statsObserver.observe(heroStats);
}

// ---- Feature card hover glow ----
document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  });
});

// ---- Architecture node pulse on hover ----
document.querySelectorAll('.arch-node').forEach(node => {
  node.addEventListener('mouseenter', () => {
    node.style.transition = 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)';
  });
  node.addEventListener('mouseleave', () => {
    node.style.transition = 'all 0.3s ease';
  });
});

console.log('🌿 FarmGuard AI Landing Page loaded successfully.');
