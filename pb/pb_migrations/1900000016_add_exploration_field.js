/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");

  if (!collection.schema.getFieldByName("exploration")) {
    collection.schema.addField(new SchemaField({
      name: "exploration",
      type: "json",
      required: false,
      options: { maxSize: 200000 }
    }));
  }

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");
  const field = collection.schema.getFieldByName("exploration");
  if (field) collection.schema.removeField(field.id);
  return dao.saveCollection(collection);
});
