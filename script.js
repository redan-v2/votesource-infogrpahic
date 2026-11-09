const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Dot map (builds the SVG from USA_DOTS in usa-dots.js) ---------- */

const mapEl = document.querySelector('#usa-map');
let greenDots = [];

const buildDotMap = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const R = 2.90551;                       // dot radius
  const X0 = 2.907, STEP_X = 8.7216;       // first column + spacing between columns
  const Y0 = 2.9055, STEP_Y = 8.7165;      // first row + spacing between rows

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 591 355');
  svg.setAttribute('aria-hidden', 'true');

  USA_DOTS.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell === '0') return;
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', (X0 + c * STEP_X).toFixed(2));
      dot.setAttribute('cy', (Y0 + r * STEP_Y).toFixed(2));
      dot.setAttribute('r', R);
      svg.appendChild(dot);
      if (cell === '2') greenDots.push(dot);
    });
  });
  mapEl.appendChild(svg);

  // Shuffle the green dots (same order every visit) so they light up scattered, not in rows
  let seed = 7;
  const random = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = greenDots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [greenDots[i], greenDots[j]] = [greenDots[j], greenDots[i]];
  }
};

if (mapEl && typeof USA_DOTS !== 'undefined') {
  buildDotMap();
}

/* ---------- Animations ---------- */

if (reduceMotion) {
  // No animation: show the finished map right away
  greenDots.forEach(dot => dot.classList.add('is-green'));
} else {
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll (optional: delete this block to use native scrolling)
  const lenis = new Lenis({ lerp: 0.07 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Pull highlighted spans (like the green "50%") out before splitting,
  // and remember their words so they can be re-highlighted after the split
  document.querySelectorAll('.text-reveal').forEach(text => {
    const highlighted = [];
    text.querySelectorAll('span').forEach(span => {
      highlighted.push(...span.textContent.trim().split(/\s+/));
      span.replaceWith(span.textContent);
    });
    text.normalize();
    if (highlighted.length) text.dataset.highlight = highlighted.join('|');
  });

  // Text reveal
  let splits = [];
  let tweens = [];

  const setTextRevealAnimations = () => {
    // Clean up before re-splitting (on resize)
    tweens.forEach(t => { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); });
    splits.forEach(s => s.revert());
    splits = [];
    tweens = [];

    document.querySelectorAll('.text-reveal').forEach(text => {
      const split = new SplitType(text, { types: 'lines, words' });
      splits.push(split);

      // Re-apply the highlight class to the words that were inside a span
      const highlighted = text.dataset.highlight ? text.dataset.highlight.split('|') : [];
      if (highlighted.length) {
        split.words.forEach(word => {
          if (highlighted.includes(word.textContent)) word.classList.add('highlight');
        });
      }

      // Wrap each line in a masking wrapper
      split.lines.forEach(line => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('line-wrapper');
        line.parentNode.insertBefore(wrapper, line);
        wrapper.appendChild(line);
      });

      tweens.push(gsap.from(split.lines, {
        yPercent: 110,
        duration: 1.2,
        ease: 'power4.out',
        stagger: 0.12,
        scrollTrigger: {
          trigger: text,
          start: 'top 85%',
          toggleActions: 'play none none reverse'
        }
      }));
    });
  };

  // Dot map: the further you scroll through the map, the more dots turn green
  const setMapAnimation = () => {
    if (!greenDots.length) return;
    let shown = 0;

    const update = (progress) => {
      const target = Math.round(progress * greenDots.length);
      if (target > shown) {
        for (let i = shown; i < target; i++) greenDots[i].classList.add('is-green');
      } else if (target < shown) {
        for (let i = target; i < shown; i++) greenDots[i].classList.remove('is-green');
      }
      shown = target;
    };

    ScrollTrigger.create({
      trigger: mapEl,
      start: 'top 80%',     // starts when the top of the map is 80% down the screen
      end: 'bottom 90%',    // all dots are green when the bottom of the map reaches 90%
      onUpdate: (self) => update(self.progress),
      onRefresh: (self) => update(self.progress)
    });
  };

  // Wait for fonts so line breaks are measured correctly
  document.fonts.ready.then(() => {
    setTextRevealAnimations();
    setMapAnimation();
    ScrollTrigger.refresh();

    // Re-split only when the width changes
    let lastWidth = window.innerWidth;
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (window.innerWidth !== lastWidth) {
          lastWidth = window.innerWidth;
          setTextRevealAnimations();
          ScrollTrigger.refresh();
        }
      }, 500);
    });
  });
}


/* ---------- Impact card carousel ---------- */

const impactCards = document.querySelector('.impact-cards');

if (impactCards) {
  const prevBtn = document.querySelector('.impact-btn--prev');
  const nextBtn = document.querySelector('.impact-btn--next');
  const cards = [...impactCards.querySelectorAll('.impact-card')];
  const scrollBehavior = reduceMotion ? 'auto' : 'smooth';

  // The carousel runs edge to edge, but the first card lines up with the page content.
  // That gap (the left padding) is also where cards should stop when they snap.
  const edgeGap = () => parseFloat(getComputedStyle(impactCards).paddingLeft) || 0;
  const syncLayout = () => {
    impactCards.style.scrollPaddingLeft = edgeGap() + 'px';
    impactCards.style.setProperty('--end-pad', edgeGap() + 'px');
  };

  const maxScroll = () => impactCards.scrollWidth - impactCards.clientWidth;

  // Where each card needs to scroll to so it lines up with the left edge of the page content
  const targets = () => cards.map(card => Math.min(card.offsetLeft - edgeGap(), maxScroll()));

  const updateButtons = () => {
    prevBtn.disabled = impactCards.scrollLeft <= 2;
    nextBtn.disabled = impactCards.scrollLeft >= maxScroll() - 2;
  };

  // Previous / next buttons: move one card at a time
  const goTo = (direction) => {
    const x = impactCards.scrollLeft;
    const list = targets();
    const target = direction > 0
      ? list.find(t => t > x + 4)
      : [...list].reverse().find(t => t < x - 4);
    if (target === undefined) return;
    impactCards.scrollTo({ left: target, behavior: scrollBehavior });
  };

  prevBtn.addEventListener('click', () => goTo(-1));
  nextBtn.addEventListener('click', () => goTo(1));
  impactCards.addEventListener('scroll', updateButtons, { passive: true });
  window.addEventListener('resize', () => { syncLayout(); updateButtons(); });
  syncLayout();
  updateButtons();

  // Click-and-drag with a mouse (touch and trackpads already scroll natively)
  let isDown = false;
  let startX = 0;
  let startScroll = 0;

  impactCards.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    isDown = true;
    startX = e.clientX;
    startScroll = impactCards.scrollLeft;
    impactCards.classList.add('is-dragging');
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDown) return;
    impactCards.scrollLeft = startScroll - (e.clientX - startX);
  });

  window.addEventListener('pointerup', () => {
    if (!isDown) return;
    isDown = false;
    impactCards.classList.remove('is-dragging');

    // Glide to the nearest card
    const x = impactCards.scrollLeft;
    const nearest = targets().reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a);
    impactCards.scrollTo({ left: nearest, behavior: scrollBehavior });
  });

  if (!reduceMotion) {
    // Cards rise in when the carousel comes into view
    gsap.from(cards, {
      y: 70,
      opacity: 0,
      rotation: (i) => (i % 2 ? 5 : -5),
      duration: 1.1,
      ease: 'power3.out',
      stagger: 0.12,
      scrollTrigger: {
        trigger: impactCards,
        start: 'top 85%',
        once: true
      }
    });

    // Notes swing from their tape while scrolling, then settle back
    const bodies = impactCards.querySelectorAll('.impact-card-body');
    gsap.set(bodies, { transformOrigin: '50% 6%' });

    let lastX = impactCards.scrollLeft;
    let settleTimer;

    impactCards.addEventListener('scroll', () => {
      const velocity = impactCards.scrollLeft - lastX;
      lastX = impactCards.scrollLeft;

      gsap.to(bodies, {
        rotation: gsap.utils.clamp(-5, 5, -velocity * 0.4),
        duration: 0.25,
        ease: 'power2.out',
        overwrite: 'auto'
      });

      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        gsap.to(bodies, { rotation: 0, duration: 1.2, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
      }, 90);
    }, { passive: true });
  }
}


/* ---------- Diversity bar graph ---------- */

const barGraph = document.querySelector('.diversity-graph .bars');

if (barGraph && !reduceMotion) {
  // Animating the height makes each number and label ride up on top of its bar
  gsap.from(barGraph.querySelectorAll('.bar-fill'), {
    height: 0,
    duration: 1.4,
    ease: 'power3.out',
    stagger: 0.15,
    clearProps: 'height', // hand control back to the CSS so the bars stay responsive
    scrollTrigger: {
      trigger: barGraph,
      start: 'top 80%',
      once: true
    }
  });
}

/* ---------- Learn more form ---------- */

const learnForm = document.querySelector('#learn-form');

if (learnForm) {
  const status = learnForm.querySelector('.form-status');

  learnForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // TODO: send the data to your backend or form service here
    status.textContent = 'Thanks! We’ll send you info on upcoming elections.';
    learnForm.reset();
  });
}