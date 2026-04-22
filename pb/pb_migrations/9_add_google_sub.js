/// <reference path="../pb_data/types.d.ts" />
// CYCLE-12 — Sign in with Google.
//
// Adds `google_sub` to the users collection, mirroring the existing
// `apple_sub` pattern (4_add_apple_sub.js). We key the user record on the
// Google `sub` so repeat logins map back to the same account even if the
// user changes their primary email.
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_");
  if (!collection) throw new Error("users auth collection not found");

  const existing = collection.schema.getFieldByName("google_sub");
  if (!existing) {
    collection.schema.addField(new SchemaField({
      name: "google_sub",
      type: "text",
      required: false,
      unique: false,
      options: {}
    }));
  }

  // Partial unique index — only enforces uniqueness for rows that actually
  // have a google_sub. Matches how apple_sub is indexed.
  const indexSql = "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON _pb_users_auth_ (google_sub) WHERE google_sub IS NOT NULL AND google_sub != ''";
  const currentIndexes = collection.indexes || [];
  if (!currentIndexes.some((s) => s.indexOf("idx_users_google_sub") !== -1)) {
    collection.indexes = currentIndexes.concat([indexSql]);
  }

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("_pb_users_auth_");
  if (!collection) return null;

  const field = collection.schema.getFieldByName("google_sub");
  if (field) collection.schema.removeField(field.id);

  collection.indexes = (collection.indexes || []).filter((s) => s.indexOf("idx_users_google_sub") === -1);
  return dao.saveCollection(collection);
});
