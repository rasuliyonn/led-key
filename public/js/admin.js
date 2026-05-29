/* Lead-Key Admin Panel JS */
(function() {
  'use strict';

  // Toast notification
  window.showToast = function(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(t._timer);
    t._timer = setTimeout(function() { t.classList.remove('is-visible'); }, 2500);
  };

  // Save section scalar fields
  window.saveSection = function(e, sectionId) {
    e.preventDefault();
    var form = e.target;
    var data = {
      chip: form.querySelector('[name="chip"]') ? form.querySelector('[name="chip"]').value : null,
      title: form.querySelector('[name="title"]') ? form.querySelector('[name="title"]').value : null,
      subtitle: form.querySelector('[name="subtitle"]') ? form.querySelector('[name="subtitle"]').value : null
    };
    // Collect extra_* fields
    var extra = {};
    form.querySelectorAll('[name^="extra_"]').forEach(function(el) {
      var key = el.name.replace('extra_', '');
      extra[key] = el.value;
    });
    data.extra_json = JSON.stringify(extra);

    fetch('/api/sections/' + sectionId, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); })
      .then(function() { showToast('Секция сохранена'); });
  };

  // Save single item
  window.saveItem = function(btn) {
    var item = btn.closest('.admin-item');
    var container = btn.closest('.admin-items');
    var table = container ? container.dataset.table : null;
    var id = item.dataset.id;
    if (!table || !id) return;

    var data = {};
    item.querySelectorAll('input, textarea, select').forEach(function(el) {
      if (el.type === 'checkbox') {
        data[el.name] = el.checked ? 1 : 0;
      } else {
        data[el.name] = el.value;
      }
    });

    fetch('/api/items/' + table + '/' + id, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); })
      .then(function() { showToast('Сохранено'); });
  };

  // Delete item
  window.deleteItem = function(btn) {
    if (!confirm('Удалить этот элемент?')) return;
    var item = btn.closest('.admin-item');
    var container = btn.closest('.admin-items');
    var table = container ? container.dataset.table : null;
    var id = item.dataset.id;
    if (!table || !id) return;

    fetch('/api/items/' + table + '/' + id, { method: 'DELETE' })
      .then(function(r) { return r.json(); })
      .then(function() { item.remove(); showToast('Удалено'); });
  };

  // Add item
  window.addItem = function(table, defaults) {
    fetch('/api/items/' + table, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(defaults)
    }).then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) {
          showToast('Добавлено');
          location.reload();
        }
      });
  };

  // Upload file and set field value
  window.uploadForField = function(btn) {
    var input = btn.previousElementSibling;
    if (!input) return;
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/mp4';
    fileInput.onchange = function() {
      var file = fileInput.files[0];
      if (!file) return;
      var fd = new FormData();
      fd.append('file', file);
      fetch('/api/upload', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.ok) {
            input.value = data.path;
            showToast('Файл загружен');
          }
        });
    };
    fileInput.click();
  };

})();
