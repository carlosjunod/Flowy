/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const items = dao.findCollectionByNameOrId("items");
  const elements = dao.findCollectionByNameOrId("global_elements");

  items.schema.addField(new SchemaField({
    name: "element",
    type: "relation",
    required: false,
    options: {
      collectionId: elements.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: null
    }
  }));

  const existing = items.indexes || [];
  if (!existing.some((idx) => idx.indexOf("idx_items_element") !== -1)) {
    items.indexes = existing.concat([
      "CREATE INDEX idx_items_element ON items (element)"
    ]);
  }

  return dao.saveCollection(items);
}, (db) => {
  const dao = new Dao(db);
  const items = dao.findCollectionByNameOrId("items");
  items.schema.removeField(items.schema.getFieldByName("element")?.id);
  items.indexes = (items.indexes || []).filter((idx) => idx.indexOf("idx_items_element") === -1);
  return dao.saveCollection(items);
});
