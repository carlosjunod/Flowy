/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");
  const field = collection.schema.getFieldByName("type");
  if (!field) throw new Error("items.type field not found");
  const current = field.options.values || [];
  const toAdd = ["pinterest", "dribbble", "linkedin", "twitter"];
  toAdd.forEach(function (v) {
    if (current.indexOf(v) === -1) current.push(v);
  });
  field.options.values = current;
  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");
  const field = collection.schema.getFieldByName("type");
  if (!field) return null;
  const removeSet = ["pinterest", "dribbble", "linkedin", "twitter"];
  field.options.values = (field.options.values || []).filter(function (v) {
    return removeSet.indexOf(v) === -1;
  });
  return dao.saveCollection(collection);
});
