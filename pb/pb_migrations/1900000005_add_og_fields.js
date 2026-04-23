/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");

  const schema = collection.schema;
  const fields = [
    { name: "og_image", type: "text", required: false, options: {} },
    { name: "og_description", type: "text", required: false, options: { max: 500 } },
    { name: "site_name", type: "text", required: false, options: { max: 100 } },
  ];

  for (const f of fields) {
    if (!schema.getFieldByName(f.name)) {
      schema.addField(new SchemaField(f));
    }
  }

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("items");
  const schema = collection.schema;
  for (const name of ["og_image", "og_description", "site_name"]) {
    const f = schema.getFieldByName(name);
    if (f) schema.removeField(f.id);
  }
  return dao.saveCollection(collection);
});
