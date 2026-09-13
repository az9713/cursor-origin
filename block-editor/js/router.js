/* router.js — hash-based routing #/p/<pageId> and #/p/<pageId>/b/<blockId> */
'use strict';

const Router = (() => {
  const RE = /^#\/p\/([^/]+)(?:\/b\/([^/]+))?/;

  function parse(hash) {
    const h = hash || location.hash;
    const m = h.match(RE);
    if (m) return { pageId: m[1], blockId: m[2] || null };
    return null;
  }

  function navigate(pageId, blockId) {
    const hash = blockId
      ? `#/p/${pageId}/b/${blockId}`
      : `#/p/${pageId}`;
    if (location.hash !== hash) {
      location.hash = hash;
    } else {
      // Already there — fire callback manually
      window.dispatchEvent(new Event('hashchange'));
    }
  }

  function onHashChange(cb) {
    window.addEventListener('hashchange', () => cb(parse()));
  }

  return { parse, navigate, onHashChange };
})();
