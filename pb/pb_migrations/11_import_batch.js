/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  // 1) Extend `items` with: import_batch, source, original_title, bookmarked_at
  const items = dao.findCollectionByNameOrId("items");

  if (!items.schema.getFieldByName("import_batch")) {
    items.schema.addField(new SchemaField({
      name: "import_batch",
      type: "text",
      required: false,
      options: { max: 64 },
    }));
  }

  if (!items.schema.getFieldByName("source")) {
    items.schema.addField(new SchemaField({
      name: "source",
      type: "select",
      required: false,
      options: {
        maxSelect: 1,
        values: ["share", "web", "bookmark_import"],
      },
    }));
  }

  if (!items.schema.getFieldByName("original_title")) {
    items.schema.addField(new SchemaField({
      name: "original_title",
      type: "text",
      required: false,
      options: { max: 500 },
    }));
  }

  if (!items.schema.getFieldByName("bookmarked_at")) {
    items.schema.addField(new SchemaField({
      name: "bookmarked_at",
      type: "date",
      required: false,
      options: {},
    }));
  }

  const existingItemIdx = items.indexes || [];
  const addIdx = (sql) => {
    if (!existingItemIdx.some((s) => s.indexOf(sql) !== -1)) existingItemIdx.push(sql);
  };
  addIdx("CREATE INDEX idx_items_import_batch ON items (import_batch)");
  addIdx("CREATE INDEX idx_items_source ON items (source)");
  addIdx("CREATE INDEX idx_items_bookmarked_at ON items (bookmarked_at)");
  items.indexes = existingItemIdx;

  dao.saveCollection(items);

  // 2) Create `import_batches` collection
  const existingBatch = (() => {
    try { return dao.findCollectionByNameOrId("import_batches"); }
    catch (_) { return null; }
  })();
  if (existingBatch) return;

  const batches = new Collection({
    name: "import_batches",
    type: "base",
    system: false,
    schema: [
      {
        name: "user",
        type: "relation",
        required: true,
        options: {
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: null,
        },
      },
      {
        name: "label",
        type: "text",
        required: false,
        options: { max: 120 },
      },
      {
        name: "status",
        type: "select",
        required: true,
        options: {
          maxSelect: 1,
          values: ["running", "complete", "failed"],
        },
      },
      { name: "total",           type: "number", required: true, options: { min: 0, noDecimal: true } },
      { name: "completed_count", type: "number", required: true, options: { min: 0, noDecimal: true } },
      { name: "dead_count",      type: "number", required: true, options: { min: 0, noDecimal: true } },
      { name: "failed_count",    type: "number", required: true, options: { min: 0, noDecimal: true } },
      { name: "started_at",      type: "date",   required: true, options: {} },
      { name: "completed_at",    type: "date",   required: false, options: {} },
    ],
    indexes: [
      "CREATE INDEX idx_import_batches_user ON import_batches (user)",
      "CREATE INDEX idx_import_batches_status ON import_batches (status)",
    ],
    listRule:   "user = @request.auth.id",
    viewRule:   "user = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return dao.saveCollection(batches);
}, (db) => {
  const dao = new Dao(db);

  try {
    const batches = dao.findCollectionByNameOrId("import_batches");
    dao.deleteCollection(batches);
  } catch (_) { /* not present */ }

  const items = dao.findCollectionByNameOrId("items");
  ["import_batch", "source", "original_title", "bookmarked_at"].forEach((name) => {
    const f = items.schema.getFieldByName(name);
    if (f) items.schema.removeField(f.id);
  });
  items.indexes = (items.indexes || []).filter((s) =>
    s.indexOf("idx_items_import_batch") === -1 &&
    s.indexOf("idx_items_source") === -1 &&
    s.indexOf("idx_items_bookmarked_at") === -1,
  );
  return dao.saveCollection(items);
});
