/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const itemsCollection = dao.findCollectionByNameOrId("items");

  const collection = new Collection({
    name: "global_elements",
    type: "base",
    system: false,
    schema: [
      {
        name: "element_hash",
        type: "text",
        required: true,
        unique: true,
        options: { min: 1, max: 128 }
      },
      {
        name: "kind",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["url", "content"] }
      },
      { name: "normalized_url", type: "text", required: false, options: {} },
      {
        name: "save_count",
        type: "number",
        required: true,
        options: { min: 0, noDecimal: true }
      },
      {
        name: "first_saved_by",
        type: "relation",
        required: false,
        options: {
          collectionId: "_pb_users_auth_",
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1,
          displayFields: null
        }
      },
      { name: "first_saved_at", type: "date", required: true, options: {} },
      { name: "last_saved_at", type: "date", required: true, options: {} },
      {
        name: "representative_item",
        type: "relation",
        required: false,
        options: {
          collectionId: itemsCollection.id,
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1,
          displayFields: null
        }
      }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_global_elements_hash ON global_elements (element_hash)",
      "CREATE INDEX idx_global_elements_save_count ON global_elements (save_count)",
      "CREATE INDEX idx_global_elements_kind ON global_elements (kind)"
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("global_elements");
  return dao.deleteCollection(collection);
});
