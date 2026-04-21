/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const itemsCollection = dao.findCollectionByNameOrId("items");
  const elementsCollection = dao.findCollectionByNameOrId("global_elements");

  const collection = new Collection({
    name: "save_events",
    type: "base",
    system: false,
    schema: [
      {
        name: "item",
        type: "relation",
        required: true,
        unique: true,
        options: {
          collectionId: itemsCollection.id,
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: null
        }
      },
      {
        name: "element",
        type: "relation",
        required: false,
        options: {
          collectionId: elementsCollection.id,
          cascadeDelete: false,
          minSelect: null,
          maxSelect: 1,
          displayFields: null
        }
      },
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
      { name: "counted_at", type: "date", required: true, options: {} }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_save_events_item ON save_events (item)",
      "CREATE INDEX idx_save_events_user ON save_events (user)",
      "CREATE INDEX idx_save_events_element ON save_events (element)"
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
  const collection = dao.findCollectionByNameOrId("save_events");
  return dao.deleteCollection(collection);
});
