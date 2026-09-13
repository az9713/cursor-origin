/* sidebar.js — left sidebar page list */
'use strict';

const Sidebar = (() => {

  function render() {
    const listEl    = document.getElementById('page-list');
    const currentId = Store.state.currentPageId;
    const root      = Store.getRoot();
    listEl.innerHTML = buildItem(root.id, 0, currentId);
  }

  function buildItem(pageId, depth, currentId) {
    const page = Store.getBlock(pageId);
    if (!page) return '';

    const paddingLeft = 12 + depth * 16;
    const activeClass = pageId === currentId ? ' active' : '';

    // Collect sub-page children
    const subPages = page.children
      .map(id => Store.getBlock(id))
      .filter(b => b && b.type === 'page');

    const childrenHtml = subPages
      .map(sp => buildItem(sp.id, depth + 1, currentId))
      .join('');

    return `<div class="sidebar-page-item${activeClass}"
          style="padding-left:${paddingLeft}px"
          data-page-id="${pageId}"
          title="${Blocks.esc(page.text)}">
  📄 ${Blocks.esc(page.text)}
</div>${childrenHtml}`;
  }

  function init() {
    document.getElementById('page-list').addEventListener('click', e => {
      const item = e.target.closest('.sidebar-page-item[data-page-id]');
      if (item) Router.navigate(item.dataset.pageId);
    });

    document.getElementById('new-page-btn').addEventListener('click', () => {
      const newId = Store.createPage(Store.state.rootPageId);
      Router.navigate(newId);
    });

    render();
  }

  return { init, render };
})();
