/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");

  const typeField = collection.schema.getFieldByName("type");
  if (!typeField) throw new Error("items.type field not found");
  const current = typeField.options.values || [];
  if (current.indexOf("instagram") === -1) {
    typeField.options.values = current.concat(["instagram"]);
  }

  if (!collection.schema.getFieldByName("media")) {
    collection.schema.addField(new SchemaField({
      name: "media",
      type: "json",
      required: false,
      options: { maxSize: 2000000 }
    }));
  }

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");

  const typeField = collection.schema.getFieldByName("type");
  if (typeField) {
    typeField.options.values = (typeField.options.values || []).filter((v) => v !== "instagram");
  }

  const mediaField = collection.schema.getFieldByName("media");
  if (mediaField) collection.schema.removeField(mediaField.id);

  return dao.saveCollection(collection);
});
