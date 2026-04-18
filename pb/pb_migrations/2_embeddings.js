/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const itemsCollection = dao.findCollectionByNameOrId("items");

  const collection = new Collection({
    name: "embeddings",
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
        name: "vector",
        type: "json",
        required: true,
        options: { maxSize: 200000 }
      }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_embeddings_item_unique ON embeddings (item)"
    ],
    listRule: "@request.auth.id != '' && item.user = @request.auth.id",
    viewRule: "@request.auth.id != '' && item.user = @request.auth.id",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''"
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("embeddings");
  return dao.deleteCollection(collection);
});
