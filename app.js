(function () {
  "use strict";

  var STORAGE_KEY = "prompt-manager-store";
  var STORE_VERSION = 1;
  var TAG_COLORS = [
    "#6b7a45",
    "#a0543f",
    "#5b6c80",
    "#8a6f3f",
    "#7e5c6c",
    "#4f6a62",
    "#92714c",
    "#51603c",
  ];
  var hadStorageReadError = false;

  var refs = {
    searchInput: document.getElementById("search-input"),
    newPromptBtn: document.getElementById("new-prompt-btn"),
    emptyCreateBtn: document.getElementById("empty-create-btn"),
    emptyImportBtn: document.getElementById("empty-import-btn"),
    manageTagsBtn: document.getElementById("manage-tags-btn"),
    importBtn: document.getElementById("import-btn"),
    exportBtn: document.getElementById("export-btn"),
    dataBtn: document.getElementById("data-btn"),
    importInput: document.getElementById("import-input"),
    systemFilters: document.getElementById("system-filters"),
    sidebarTags: document.getElementById("sidebar-tags"),
    sidebarCreateTagBtn: document.getElementById("sidebar-create-tag-btn"),
    sortSelect: document.getElementById("sort-select"),
    resultCount: document.getElementById("result-count"),
    activeFilterSummary: document.getElementById("active-filter-summary"),
    promptList: document.getElementById("prompt-list"),
    editorEmpty: document.getElementById("editor-empty"),
    promptForm: document.getElementById("prompt-form"),
    editorMeta: document.getElementById("editor-meta"),
    titleInput: document.getElementById("title-input"),
    contentInput: document.getElementById("content-input"),
    noteInput: document.getElementById("note-input"),
    editorTagList: document.getElementById("editor-tag-list"),
    previewTitle: document.getElementById("preview-title"),
    previewTags: document.getElementById("preview-tags"),
    previewContent: document.getElementById("preview-content"),
    previewNoteBlock: document.getElementById("preview-note-block"),
    previewNote: document.getElementById("preview-note"),
    quickTagInput: document.getElementById("quick-tag-input"),
    quickTagBtn: document.getElementById("quick-tag-btn"),
    favoriteBtn: document.getElementById("favorite-btn"),
    copyBtn: document.getElementById("copy-btn"),
    archiveBtn: document.getElementById("archive-btn"),
    duplicateBtn: document.getElementById("duplicate-btn"),
    deleteBtn: document.getElementById("delete-btn"),
    saveHint: document.getElementById("save-hint"),
    tagDialog: document.getElementById("tag-dialog"),
    dialogTagInput: document.getElementById("dialog-tag-input"),
    dialogTagCreateBtn: document.getElementById("dialog-tag-create-btn"),
    dialogTagList: document.getElementById("dialog-tag-list"),
    dataDialog: document.getElementById("data-dialog"),
    dialogExportBtn: document.getElementById("dialog-export-btn"),
    dialogImportBtn: document.getElementById("dialog-import-btn"),
    resetBtn: document.getElementById("reset-btn"),
    toast: document.getElementById("toast"),
  };

  var state = {
    store: loadStore(),
    ui: {
      searchTerm: "",
      activeSystem: "all",
      activeTagIds: [],
      selectedPromptId: null,
      autosaveTimer: null,
      toastTimer: null,
    },
  };

  if (state.store.prompts.length > 0) {
    state.ui.selectedPromptId = state.store.prompts[0].id;
  }

  bindEvents();
  render();
  if (hadStorageReadError) {
    showToast("本地数据读取失败，已回退为空数据。");
  }

  function bindEvents() {
    refs.searchInput.addEventListener("input", function (event) {
      state.ui.searchTerm = event.target.value.trim().toLowerCase();
      renderList();
      renderSidebar();
    });

    refs.newPromptBtn.addEventListener("click", createPrompt);
    refs.emptyCreateBtn.addEventListener("click", createPrompt);
    refs.importBtn.addEventListener("click", triggerImport);
    refs.emptyImportBtn.addEventListener("click", triggerImport);
    refs.exportBtn.addEventListener("click", exportStore);
    refs.manageTagsBtn.addEventListener("click", openTagDialog);
    refs.sidebarCreateTagBtn.addEventListener("click", openTagDialog);
    refs.dataBtn.addEventListener("click", function () {
      refs.dataDialog.showModal();
    });

    refs.dialogExportBtn.addEventListener("click", exportStore);
    refs.dialogImportBtn.addEventListener("click", triggerImport);
    refs.resetBtn.addEventListener("click", resetAllData);

    refs.importInput.addEventListener("change", importStoreFromFile);
    refs.sortSelect.addEventListener("change", function (event) {
      state.store.preferences.sortBy = event.target.value;
      persistStore();
      renderList();
    });

    refs.titleInput.addEventListener("input", onEditorInput);
    refs.contentInput.addEventListener("input", onEditorInput);
    refs.noteInput.addEventListener("input", onEditorInput);

    refs.quickTagBtn.addEventListener("click", function () {
      addTagFromInput(refs.quickTagInput, true);
    });
    refs.quickTagInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        addTagFromInput(refs.quickTagInput, true);
      }
    });

    refs.favoriteBtn.addEventListener("click", toggleFavorite);
    refs.archiveBtn.addEventListener("click", toggleArchive);
    refs.copyBtn.addEventListener("click", copyCurrentPrompt);
    refs.duplicateBtn.addEventListener("click", duplicateCurrentPrompt);
    refs.deleteBtn.addEventListener("click", deleteCurrentPrompt);

    refs.dialogTagCreateBtn.addEventListener("click", function () {
      addTagFromInput(refs.dialogTagInput, false);
    });
    refs.dialogTagInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        addTagFromInput(refs.dialogTagInput, false);
      }
    });

    window.addEventListener("beforeunload", flushAutosave);
  }

  function loadStore() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createEmptyStore();
      }

      return normalizeStore(JSON.parse(raw));
    } catch (error) {
      hadStorageReadError = true;
      return createEmptyStore();
    }
  }

  function createEmptyStore() {
    return {
      version: STORE_VERSION,
      prompts: [],
      tags: [],
      preferences: {
        sortBy: "updatedAt",
        sidebarCollapsed: false,
      },
    };
  }

  function normalizeStore(input) {
    var empty = createEmptyStore();
    var store = input && typeof input === "object" ? input : empty;
    var prompts = Array.isArray(store.prompts) ? store.prompts : [];
    var tags = Array.isArray(store.tags) ? store.tags : [];
    var preferences =
      store.preferences && typeof store.preferences === "object" ? store.preferences : empty.preferences;

    return {
      version: STORE_VERSION,
      prompts: prompts.map(normalizePrompt).filter(Boolean),
      tags: tags.map(normalizeTag).filter(Boolean),
      preferences: {
        sortBy: isAllowedSort(preferences.sortBy) ? preferences.sortBy : "updatedAt",
        sidebarCollapsed: Boolean(preferences.sidebarCollapsed),
      },
    };
  }

  function normalizePrompt(prompt) {
    if (!prompt || typeof prompt !== "object") return null;
    var now = new Date().toISOString();

    return {
      id: String(prompt.id || createId("prompt")),
      title: String(prompt.title || "").trim(),
      content: String(prompt.content || ""),
      note: String(prompt.note || ""),
      isFavorite: Boolean(prompt.isFavorite),
      tagIds: Array.isArray(prompt.tagIds) ? prompt.tagIds.map(String) : [],
      createdAt: String(prompt.createdAt || now),
      updatedAt: String(prompt.updatedAt || now),
      lastOpenedAt: prompt.lastOpenedAt ? String(prompt.lastOpenedAt) : "",
      usageCount: Number.isFinite(Number(prompt.usageCount)) ? Number(prompt.usageCount) : 0,
      archived: Boolean(prompt.archived),
    };
  }

  function normalizeTag(tag) {
    if (!tag || typeof tag !== "object") return null;
    var now = new Date().toISOString();
    return {
      id: String(tag.id || createId("tag")),
      name: String(tag.name || "").trim(),
      color: String(tag.color || pickTagColor(tag.name || "")),
      createdAt: String(tag.createdAt || now),
      updatedAt: String(tag.updatedAt || now),
    };
  }

  function isAllowedSort(value) {
    return ["updatedAt", "createdAt", "lastOpenedAt", "usageCount", "title"].indexOf(value) >= 0;
  }

  function persistStore() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
    } catch (error) {
      showToast("本地存储失败，请尽快导出备份。");
    }
  }

  function scheduleAutosave() {
    if (state.ui.autosaveTimer) {
      window.clearTimeout(state.ui.autosaveTimer);
    }

    refs.saveHint.textContent = "正在自动保存...";
    state.ui.autosaveTimer = window.setTimeout(function () {
      persistStore();
      refs.saveHint.textContent = "已自动保存到当前浏览器";
    }, 700);
  }

  function flushAutosave() {
    if (state.ui.autosaveTimer) {
      window.clearTimeout(state.ui.autosaveTimer);
      state.ui.autosaveTimer = null;
    }
    persistStore();
  }

  function createPrompt() {
    var now = new Date().toISOString();
    var prompt = {
      id: createId("prompt"),
      title: "",
      content: "",
      note: "",
      isFavorite: false,
      tagIds: [],
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      usageCount: 0,
      archived: false,
    };

    state.store.prompts.unshift(prompt);
    state.ui.selectedPromptId = prompt.id;
    persistStore();
    render();
    refs.titleInput.focus();
    showToast("已创建新的 Prompt。");
  }

  function getSelectedPrompt() {
    return (
      state.store.prompts.find(function (item) {
        return item.id === state.ui.selectedPromptId;
      }) || null
    );
  }

  function onEditorInput() {
    var prompt = getSelectedPrompt();
    if (!prompt) return;

    prompt.title = refs.titleInput.value.trim();
    prompt.content = refs.contentInput.value;
    prompt.note = refs.noteInput.value;
    prompt.updatedAt = new Date().toISOString();

    scheduleAutosave();
    renderList();
    renderEditorMeta();
    renderPreview();
  }

  function render() {
    ensureSelectedPrompt();
    refs.searchInput.value = state.ui.searchTerm;
    refs.sortSelect.value = state.store.preferences.sortBy;
    renderSidebar();
    renderList();
    renderEditor();
    renderTagDialog();
  }

  function renderSidebar() {
    renderSystemFilters();
    renderSidebarTags();
  }

  function ensureSelectedPrompt() {
    var selected = getSelectedPrompt();
    if (selected) return;

    var visible = getVisiblePrompts();
    if (visible.length > 0) {
      state.ui.selectedPromptId = visible[0].id;
      return;
    }

    state.ui.selectedPromptId = state.store.prompts.length > 0 ? state.store.prompts[0].id : null;
  }

  function renderSystemFilters() {
    var filters = [
      { key: "all", label: "全部", count: state.store.prompts.filter(notArchived).length },
      {
        key: "favorites",
        label: "已收藏",
        count: state.store.prompts.filter(function (item) {
          return item.isFavorite && !item.archived;
        }).length,
      },
      {
        key: "recent",
        label: "最近打开",
        count: state.store.prompts.filter(function (item) {
          return item.lastOpenedAt && !item.archived;
        }).length,
      },
      {
        key: "untagged",
        label: "未打标签",
        count: state.store.prompts.filter(function (item) {
          return !item.archived && item.tagIds.length === 0;
        }).length,
      },
      { key: "archived", label: "已归档", count: state.store.prompts.filter(function (item) { return item.archived; }).length },
    ];

    refs.systemFilters.innerHTML = filters
      .map(function (filter) {
        return (
          '<button class="filter-chip' +
          (state.ui.activeSystem === filter.key ? " is-active" : "") +
          '" type="button" data-filter="' +
          escapeHtml(filter.key) +
          '">' +
          '<span class="filter-chip__label">' +
          escapeHtml(filter.label) +
          "</span>" +
          '<span class="filter-chip__count">' +
          filter.count +
          "</span>" +
          "</button>"
        );
      })
      .join("");

    refs.systemFilters.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.ui.activeSystem = button.getAttribute("data-filter");
        renderList();
        renderSidebar();
      });
    });
  }

  function renderSidebarTags() {
    if (state.store.tags.length === 0) {
      refs.sidebarTags.innerHTML = '<p class="meta-text">还没有标签。可先在编辑区或标签管理里创建。</p>';
      return;
    }

    var counts = countPromptsByTag();

    refs.sidebarTags.innerHTML = state.store.tags
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "zh-CN");
      })
      .map(function (tag) {
        var active = state.ui.activeTagIds.indexOf(tag.id) >= 0;
        return (
          '<button class="tag-item' +
          (active ? " is-active" : "") +
          '" type="button" data-tag-id="' +
          escapeHtml(tag.id) +
          '">' +
          '<span class="tag-item__label">' +
          '<span class="tag-swatch" style="background:' +
          escapeHtml(tag.color) +
          '"></span>' +
          escapeHtml(tag.name) +
          "</span>" +
          '<span class="tag-item__count">' +
          (counts[tag.id] || 0) +
          "</span>" +
          "</button>"
        );
      })
      .join("");

    refs.sidebarTags.querySelectorAll("[data-tag-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        var tagId = button.getAttribute("data-tag-id");
        toggleActiveTagFilter(tagId);
      });
    });
  }

  function toggleActiveTagFilter(tagId) {
    var index = state.ui.activeTagIds.indexOf(tagId);
    if (index >= 0) {
      state.ui.activeTagIds.splice(index, 1);
    } else {
      state.ui.activeTagIds.push(tagId);
    }
    renderList();
    renderSidebar();
  }

  function renderList() {
    var prompts = getVisiblePrompts();
    refs.resultCount.textContent = "共 " + prompts.length + " 条";
    renderActiveSummary();

    if (prompts.length === 0) {
      refs.promptList.innerHTML =
        '<div class="prompt-card"><p class="prompt-card__title">没有符合条件的 Prompt</p><p class="prompt-card__excerpt">可以调整搜索词、筛选标签，或者直接新建一条 Prompt。</p></div>';
      return;
    }

    refs.promptList.innerHTML = prompts
      .map(function (prompt) {
        var selected = prompt.id === state.ui.selectedPromptId;
        var tags = prompt.tagIds
          .map(findTagById)
          .filter(Boolean)
          .map(function (tag) {
            return '<span class="prompt-card__tag">' + escapeHtml(tag.name) + "</span>";
          })
          .join("");

        return (
          '<article class="prompt-card' +
          (selected ? " is-selected" : "") +
          '" data-prompt-id="' +
          escapeHtml(prompt.id) +
          '">' +
          '<div class="prompt-card__header">' +
          '<div>' +
          '<h3 class="prompt-card__title">' +
          escapeHtml(prompt.title || "未命名 Prompt") +
          "</h3>" +
          '<p class="prompt-card__meta">' +
          renderPromptMeta(prompt) +
          "</p>" +
          "</div>" +
          '<button class="button button--ghost" type="button" data-copy-id="' +
          escapeHtml(prompt.id) +
          '">复制</button>' +
          "</div>" +
          '<p class="prompt-card__excerpt">' +
          escapeHtml(buildExcerpt(prompt)) +
          "</p>" +
          '<div class="prompt-card__footer">' +
          '<div class="prompt-card__tags">' +
          (tags || '<span class="prompt-card__tag">未打标签</span>') +
          "</div>" +
          '<span class="prompt-card__meta">' +
          (prompt.isFavorite ? "已收藏" : prompt.archived ? "已归档" : "常规") +
          "</span>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    refs.promptList.querySelectorAll("[data-prompt-id]").forEach(function (card) {
      card.addEventListener("click", function (event) {
        if (event.target && event.target.hasAttribute("data-copy-id")) {
          return;
        }
        selectPrompt(card.getAttribute("data-prompt-id"));
      });
    });

    refs.promptList.querySelectorAll("[data-copy-id]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        copyPromptById(button.getAttribute("data-copy-id"));
      });
    });
  }

  function renderEditor() {
    var prompt = getSelectedPrompt();
    var hasPrompt = Boolean(prompt);

    refs.editorEmpty.hidden = hasPrompt;
    refs.promptForm.hidden = !hasPrompt;

    if (!prompt) {
      return;
    }

    refs.titleInput.value = prompt.title;
    refs.contentInput.value = prompt.content;
    refs.noteInput.value = prompt.note;
    refs.favoriteBtn.textContent = prompt.isFavorite ? "取消收藏" : "收藏";
    refs.archiveBtn.textContent = prompt.archived ? "取消归档" : "归档";
    refs.saveHint.textContent = "自动保存已开启";

    renderEditorMeta();
    renderEditorTags();
    renderPreview();
  }

  function renderEditorMeta() {
    var prompt = getSelectedPrompt();
    if (!prompt) {
      refs.editorMeta.textContent = "";
      return;
    }

    var updated = formatDateTime(prompt.updatedAt);
    var opened = prompt.lastOpenedAt ? " | 最近打开 " + formatDateTime(prompt.lastOpenedAt) : "";
    refs.editorMeta.textContent = "创建于 " + formatDateTime(prompt.createdAt) + " | 最近编辑 " + updated + opened;
  }

  function renderEditorTags() {
    var prompt = getSelectedPrompt();
    if (!prompt) {
      refs.editorTagList.innerHTML = "";
      return;
    }

    if (state.store.tags.length === 0) {
      refs.editorTagList.innerHTML = '<p class="meta-text">还没有标签，先创建一个。</p>';
      return;
    }

    refs.editorTagList.innerHTML = state.store.tags
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "zh-CN");
      })
      .map(function (tag) {
        var checked = prompt.tagIds.indexOf(tag.id) >= 0 ? "checked" : "";
        return (
          '<div class="tag-check">' +
          '<label>' +
          '<input type="checkbox" data-editor-tag-id="' +
          escapeHtml(tag.id) +
          '" ' +
          checked +
          " />" +
          '<span class="tag-swatch" style="background:' +
          escapeHtml(tag.color) +
          '"></span>' +
          '<span>' +
          escapeHtml(tag.name) +
          "</span>" +
          "</label>" +
          "</div>"
        );
      })
      .join("");

    refs.editorTagList.querySelectorAll("[data-editor-tag-id]").forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        var promptItem = getSelectedPrompt();
        if (!promptItem) return;

        var tagId = checkbox.getAttribute("data-editor-tag-id");
        if (checkbox.checked) {
          if (promptItem.tagIds.indexOf(tagId) === -1) {
            promptItem.tagIds.push(tagId);
          }
        } else {
          promptItem.tagIds = promptItem.tagIds.filter(function (item) {
            return item !== tagId;
          });
        }

        promptItem.updatedAt = new Date().toISOString();
        scheduleAutosave();
        renderList();
        renderSidebar();
        renderPreview();
      });
    });
  }

  function renderPreview() {
    var prompt = getSelectedPrompt();
    if (!prompt) {
      refs.previewTitle.textContent = "未命名 Prompt";
      refs.previewTags.innerHTML = "";
      refs.previewContent.textContent = "";
      refs.previewNote.textContent = "";
      refs.previewNoteBlock.hidden = true;
      return;
    }

    refs.previewTitle.textContent = prompt.title || "未命名 Prompt";
    refs.previewContent.textContent = prompt.content || "这里会显示 Prompt 正文预览。";

    var tags = prompt.tagIds
      .map(findTagById)
      .filter(Boolean)
      .map(function (tag) {
        return '<span class="preview-sheet__tag">' + escapeHtml(tag.name) + "</span>";
      })
      .join("");

    refs.previewTags.innerHTML = tags || '<span class="preview-sheet__tag">未打标签</span>';

    var note = (prompt.note || "").trim();
    refs.previewNote.textContent = note;
    refs.previewNoteBlock.hidden = note.length === 0;
  }

  function renderTagDialog() {
    if (state.store.tags.length === 0) {
      refs.dialogTagList.innerHTML = '<p class="meta-text">暂无标签。先创建一个用于分类。</p>';
      return;
    }

    var counts = countPromptsByTag();
    refs.dialogTagList.innerHTML = state.store.tags
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "zh-CN");
      })
      .map(function (tag) {
        return (
          '<div class="dialog-tag-row">' +
          '<input type="text" value="' +
          escapeHtml(tag.name) +
          '" data-rename-tag-id="' +
          escapeHtml(tag.id) +
          '" />' +
          '<span class="dialog-tag-row__meta mono">' +
          (counts[tag.id] || 0) +
          " 条" +
          "</span>" +
          '<button class="button button--danger" type="button" data-delete-tag-id="' +
          escapeHtml(tag.id) +
          '">删除</button>' +
          "</div>"
        );
      })
      .join("");

    refs.dialogTagList.querySelectorAll("[data-rename-tag-id]").forEach(function (input) {
      input.addEventListener("change", function () {
        renameTag(input.getAttribute("data-rename-tag-id"), input.value);
      });
    });

    refs.dialogTagList.querySelectorAll("[data-delete-tag-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        deleteTag(button.getAttribute("data-delete-tag-id"));
      });
    });
  }

  function getVisiblePrompts() {
    var prompts = state.store.prompts.filter(function (prompt) {
      if (state.ui.activeSystem === "favorites" && (!prompt.isFavorite || prompt.archived)) return false;
      if (state.ui.activeSystem === "recent" && (!prompt.lastOpenedAt || prompt.archived)) return false;
      if (state.ui.activeSystem === "untagged" && (prompt.archived || prompt.tagIds.length > 0)) return false;
      if (state.ui.activeSystem === "archived" && !prompt.archived) return false;
      if (state.ui.activeSystem === "all" && prompt.archived) return false;
      if (state.ui.activeSystem !== "archived" && state.ui.activeSystem !== "all" && prompt.archived) return false;

      if (state.ui.searchTerm) {
        var haystack = (prompt.title + " " + prompt.content + " " + prompt.note).toLowerCase();
        if (haystack.indexOf(state.ui.searchTerm) === -1) return false;
      }

      if (state.ui.activeTagIds.length > 0) {
        for (var i = 0; i < state.ui.activeTagIds.length; i += 1) {
          if (prompt.tagIds.indexOf(state.ui.activeTagIds[i]) === -1) {
            return false;
          }
        }
      }

      return true;
    });

    return prompts.sort(sortPromptList);
  }

  function sortPromptList(a, b) {
    var sortBy = state.store.preferences.sortBy;

    if (sortBy === "title") {
      return a.title.localeCompare(b.title, "zh-CN");
    }

    if (sortBy === "usageCount") {
      return b.usageCount - a.usageCount;
    }

    if (sortBy === "lastOpenedAt") {
      return getTimeValue(b.lastOpenedAt) - getTimeValue(a.lastOpenedAt);
    }

    return getTimeValue(b[sortBy]) - getTimeValue(a[sortBy]);
  }

  function renderActiveSummary() {
    var items = [];
    var systemLabel = {
      all: "全部",
      favorites: "已收藏",
      recent: "最近打开",
      untagged: "未打标签",
      archived: "已归档",
    }[state.ui.activeSystem];

    if (systemLabel && state.ui.activeSystem !== "all") {
      items.push('<span class="summary-pill">' + escapeHtml(systemLabel) + "</span>");
    }

    state.ui.activeTagIds.forEach(function (tagId) {
      var tag = findTagById(tagId);
      if (tag) {
        items.push('<span class="summary-pill">' + escapeHtml(tag.name) + "</span>");
      }
    });

    if (state.ui.searchTerm) {
      items.push('<span class="summary-pill">搜索：' + escapeHtml(state.ui.searchTerm) + "</span>");
    }

    refs.activeFilterSummary.hidden = items.length === 0;
    refs.activeFilterSummary.innerHTML = items.join("");
  }

  function selectPrompt(promptId) {
    var prompt = state.store.prompts.find(function (item) {
      return item.id === promptId;
    });
    if (!prompt) return;

    prompt.lastOpenedAt = new Date().toISOString();
    state.ui.selectedPromptId = prompt.id;
    persistStore();
    render();
  }

  function toggleFavorite() {
    var prompt = getSelectedPrompt();
    if (!prompt) return;
    prompt.isFavorite = !prompt.isFavorite;
    prompt.updatedAt = new Date().toISOString();
    persistStore();
    render();
    showToast(prompt.isFavorite ? "已加入收藏。" : "已取消收藏。");
  }

  function toggleArchive() {
    var prompt = getSelectedPrompt();
    if (!prompt) return;
    prompt.archived = !prompt.archived;
    prompt.updatedAt = new Date().toISOString();
    persistStore();

    if (prompt.archived && state.ui.activeSystem !== "archived") {
      state.ui.activeSystem = "all";
    }

    render();
    showToast(prompt.archived ? "已归档。" : "已取消归档。");
  }

  function copyCurrentPrompt() {
    var prompt = getSelectedPrompt();
    if (!prompt) return;
    copyPromptById(prompt.id);
  }

  function copyPromptById(promptId) {
    var prompt = state.store.prompts.find(function (item) {
      return item.id === promptId;
    });
    if (!prompt) return;

    var text = prompt.content || prompt.title;
    if (!text) {
      showToast("这条 Prompt 还是空的。");
      return;
    }

    copyText(text)
      .then(function () {
        prompt.usageCount += 1;
        prompt.lastOpenedAt = new Date().toISOString();
        persistStore();
        renderList();
        renderEditorMeta();
        showToast("已复制到剪贴板。");
      })
      .catch(function () {
        showToast("复制失败，请检查浏览器权限。");
      });
  }

  function duplicateCurrentPrompt() {
    var prompt = getSelectedPrompt();
    if (!prompt) return;

    var now = new Date().toISOString();
    var clone = {
      id: createId("prompt"),
      title: (prompt.title || "未命名 Prompt") + " 副本",
      content: prompt.content,
      note: prompt.note,
      isFavorite: false,
      tagIds: prompt.tagIds.slice(),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      usageCount: 0,
      archived: false,
    };

    state.store.prompts.unshift(clone);
    state.ui.selectedPromptId = clone.id;
    persistStore();
    render();
    showToast("已创建副本。");
  }

  function deleteCurrentPrompt() {
    var prompt = getSelectedPrompt();
    if (!prompt) return;

    var ok = window.confirm("确定删除这条 Prompt 吗？此操作不会进入回收站。");
    if (!ok) return;

    state.store.prompts = state.store.prompts.filter(function (item) {
      return item.id !== prompt.id;
    });

    state.ui.selectedPromptId = state.store.prompts.length > 0 ? state.store.prompts[0].id : null;
    persistStore();
    render();
    showToast("已删除 Prompt。");
  }

  function addTagFromInput(inputElement, attachToSelectedPrompt) {
    var name = inputElement.value.trim();
    if (!name) return;

    var existing = state.store.tags.find(function (tag) {
      return tag.name.toLowerCase() === name.toLowerCase();
    });

    var tag = existing || createTag(name);
    inputElement.value = "";

    var prompt = getSelectedPrompt();
    if (attachToSelectedPrompt && prompt && prompt.tagIds.indexOf(tag.id) === -1) {
      prompt.tagIds.push(tag.id);
      prompt.updatedAt = new Date().toISOString();
    }

    persistStore();
    render();
    if (existing) {
      showToast(attachToSelectedPrompt ? "已关联现有标签。" : "标签已存在。");
      return;
    }
    showToast(attachToSelectedPrompt ? "标签已创建并关联。" : "标签已创建。");
  }

  function createTag(name) {
    var now = new Date().toISOString();
    var tag = {
      id: createId("tag"),
      name: name,
      color: pickTagColor(name),
      createdAt: now,
      updatedAt: now,
    };
    state.store.tags.push(tag);
    return tag;
  }

  function renameTag(tagId, nextName) {
    var tag = findTagById(tagId);
    if (!tag) return;

    var name = String(nextName || "").trim();
    if (!name) {
      renderTagDialog();
      return;
    }

    var duplicate = state.store.tags.find(function (item) {
      return item.id !== tagId && item.name.toLowerCase() === name.toLowerCase();
    });
    if (duplicate) {
      showToast("标签名称重复，未保存。");
      renderTagDialog();
      return;
    }

    tag.name = name;
    tag.updatedAt = new Date().toISOString();
    persistStore();
    render();
  }

  function deleteTag(tagId) {
    var tag = findTagById(tagId);
    if (!tag) return;

    var ok = window.confirm('删除标签“' + tag.name + '”吗？这不会删除 Prompt，只会解除关联。');
    if (!ok) return;

    state.store.tags = state.store.tags.filter(function (item) {
      return item.id !== tagId;
    });

    state.store.prompts.forEach(function (prompt) {
      prompt.tagIds = prompt.tagIds.filter(function (item) {
        return item !== tagId;
      });
    });

    state.ui.activeTagIds = state.ui.activeTagIds.filter(function (item) {
      return item !== tagId;
    });

    persistStore();
    render();
    showToast("标签已删除。");
  }

  function openTagDialog() {
    refs.tagDialog.showModal();
    refs.dialogTagInput.focus();
  }

  function triggerImport() {
    refs.importInput.value = "";
    refs.importInput.click();
  }

  function importStoreFromFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (loadEvent) {
      try {
        var parsed = JSON.parse(String(loadEvent.target.result || "{}"));
        var nextStore = normalizeImportedStore(parsed);
        var ok = window.confirm("导入将覆盖当前浏览器中的全部数据，是否继续？");
        if (!ok) return;

        state.store = nextStore;
        state.ui.selectedPromptId = nextStore.prompts.length > 0 ? nextStore.prompts[0].id : null;
        state.ui.activeSystem = "all";
        state.ui.activeTagIds = [];
        state.ui.searchTerm = "";
        persistStore();
        render();
        refs.dataDialog.close();
        showToast("导入完成。");
      } catch (error) {
        showToast("导入失败，文件格式不正确。");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function normalizeImportedStore(parsed) {
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid JSON");
    }

    if (!Array.isArray(parsed.prompts) || !Array.isArray(parsed.tags)) {
      throw new Error("Missing arrays");
    }

    return normalizeStore({
      version: parsed.version || STORE_VERSION,
      prompts: parsed.prompts,
      tags: parsed.tags,
      preferences: parsed.preferences || {},
    });
  }

  function exportStore() {
    flushAutosave();

    var payload = {
      version: STORE_VERSION,
      exportedAt: new Date().toISOString(),
      prompts: state.store.prompts,
      tags: state.store.tags,
      preferences: state.store.preferences,
    };

    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "prompt-manager-backup-" + formatDateForFile(new Date()) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("备份文件已导出。");
  }

  function resetAllData() {
    var ok = window.confirm("确定清空所有本地数据吗？建议先导出备份。");
    if (!ok) return;

    state.store = createEmptyStore();
    state.ui.selectedPromptId = null;
    state.ui.activeSystem = "all";
    state.ui.activeTagIds = [];
    state.ui.searchTerm = "";
    refs.searchInput.value = "";
    persistStore();
    render();
    refs.dataDialog.close();
    showToast("本地数据已清空。");
  }

  function countPromptsByTag() {
    return state.store.prompts.reduce(function (accumulator, prompt) {
      if (prompt.archived) return accumulator;

      prompt.tagIds.forEach(function (tagId) {
        accumulator[tagId] = (accumulator[tagId] || 0) + 1;
      });
      return accumulator;
    }, {});
  }

  function findTagById(tagId) {
    return (
      state.store.tags.find(function (tag) {
        return tag.id === tagId;
      }) || null
    );
  }

  function notArchived(prompt) {
    return !prompt.archived;
  }

  function buildExcerpt(prompt) {
    var text = prompt.content || prompt.note || "";
    return text.trim() || "这条 Prompt 还没有内容。";
  }

  function renderPromptMeta(prompt) {
    var meta = [];
    meta.push(prompt.usageCount + " 次复制");
    meta.push("编辑于 " + formatDateTime(prompt.updatedAt));
    return meta.join(" · ");
  }

  function getTimeValue(value) {
    return value ? new Date(value).getTime() || 0 : 0;
  }

  function formatDateTime(value) {
    if (!value) return "未记录";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未记录";

    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function formatDateForFile(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      try {
        var textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        var success = document.execCommand("copy");
        textarea.remove();

        if (success) {
          resolve();
          return;
        }

        reject(new Error("Copy command failed"));
      } catch (error) {
        reject(error);
      }
    });
  }

  function pickTagColor(name) {
    var seed = 0;
    var text = String(name || "tag");
    for (var i = 0; i < text.length; i += 1) {
      seed += text.charCodeAt(i);
    }
    return TAG_COLORS[seed % TAG_COLORS.length];
  }

  function createId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
  }

  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add("is-visible");
    if (state.ui.toastTimer) {
      window.clearTimeout(state.ui.toastTimer);
    }
    state.ui.toastTimer = window.setTimeout(function () {
      refs.toast.classList.remove("is-visible");
    }, 2200);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
