/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_");
  if (!collection) throw new Error("users auth collection not found");

  const existing = collection.schema.getFieldByName("apple_sub");
  if (!existing) {
    collection.schema.addField(new SchemaField({
      name: "apple_sub",
      type: "text",
      required: false,
      unique: false,
      options: {}
    }));
  }

  const indexSql = "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON _pb_users_auth_ (apple_sub) WHERE apple_sub IS NOT NULL AND apple_sub != ''";
  const currentIndexes = collection.indexes || [];
  if (!currentIndexes.some((s) => s.indexOf("idx_users_apple_sub") !== -1)) {
    collection.indexes = currentIndexes.concat([indexSql]);
  }

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_");
  if (!collection) return null;

  const field = collection.schema.getFieldByName("apple_sub");
  if (field) collection.schema.removeField(field.id);

  collection.indexes = (collection.indexes || []).filter((s) => s.indexOf("idx_users_apple_sub") === -1);
  return dao.saveCollection(collection);
});
