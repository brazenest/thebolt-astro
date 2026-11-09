/**
 * /chart — "Show more" reveals the next five ranks; the button retires once all are shown.
 * Re-binds after each view transition (the page can be reached by client-side navigation).
 */
const STEP = 5;

function initChart(): void {
  const page = document.querySelector<HTMLElement>('[data-chart-page]');
  const more = page?.querySelector<HTMLButtonElement>('[data-chart-more]');
  if (!page || !more || more.dataset.bound) return;
  more.dataset.bound = '1';
  more.addEventListener('click', () => {
    const hidden = [...page.querySelectorAll<HTMLLIElement>('.chart__row[hidden]')];
    hidden.slice(0, STEP).forEach((li) => (li.hidden = false));
    if (hidden.length <= STEP) more.hidden = true;
  });
}

initChart();
document.addEventListener('astro:page-load', initChart);
