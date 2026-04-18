/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  const collection = new Collection({
    name: "items",
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
          displayFields: null
        }
      },
      {
        name: "type",
        type: "select",
        required: true,
        options: {
          maxSelect: 1,
          values: ["url", "screenshot", "youtube", "receipt", "pdf", "audio"]
        }
      },
      { name: "raw_url", type: "text", required: false, options: {} },
      { name: "r2_key", type: "text", required: false, options: {} },
      { name: "title", type: "text", required: false, options: {} },
      { name: "summary", type: "text", required: false, options: { max: 500 } },
      { name: "content", type: "text", required: false, options: {} },
      { name: "tags", type: "json", required: false, options: { maxSize: 4000 } },
      { name: "category", type: "text", required: false, options: {} },
      {
        name: "status",
        type: "select",
        required: true,
        options: {
          maxSelect: 1,
          values: ["pending", "processing", "ready", "error"]
        }
      },
      { name: "error_msg", type: "text", required: false, options: {} },
      { name: "source_url", type: "text", required: false, options: {} }
    ],
    indexes: [
      "CREATE INDEX idx_items_user ON items (user)",
      "CREATE INDEX idx_items_status ON items (status)",
      "CREATE INDEX idx_items_type ON items (type)"
    ],
    listRule: "@request.auth.id != '' && user = @request.auth.id",
    viewRule: "@request.auth.id != '' && user = @request.auth.id",
    createRule: "@request.auth.id != '' && user = @request.auth.id",
    updateRule: "@request.auth.id != '' && user = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user = @request.auth.id"
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");
  return dao.deleteCollection(collection);
});
