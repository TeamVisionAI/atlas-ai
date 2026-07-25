/**
 * Smooth-scroll to an element by id, retrying until it exists in the DOM.
 * Used after SPA route changes when the target section may not be mounted yet.
 */
export function scrollToElementById(id, { behavior = "smooth", maxAttempts = 40 } = {}) {
  if (!id) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let attempts = 0;

    function tryScroll() {
      const target = document.getElementById(id);

      if (target) {
        target.scrollIntoView({ behavior, block: "start" });
        resolve(true);
        return;
      }

      attempts += 1;

      if (attempts >= maxAttempts) {
        resolve(false);
        return;
      }

      requestAnimationFrame(tryScroll);
    }

    tryScroll();
  });
}
