/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");
  const field = collection.schema.getFieldByName("type");
  if (!field) throw new Error("items.type field not found");
  const current = field.options.values || [];
  if (current.indexOf("screen_recording") === -1) {
    field.options.values = current.concat(["screen_recording"]);
  }
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");
  const field = collection.schema.getFieldByName("type");
  if (!field) return null;
  field.options.values = (field.options.values || []).filter((v) => v !== "screen_recording");
  return dao.saveCollection(collection);
});
