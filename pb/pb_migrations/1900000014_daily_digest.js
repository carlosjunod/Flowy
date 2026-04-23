/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  const users = dao.findCollectionByNameOrId("_pb_users_auth_");
  if (!users) throw new Error("users auth collection not found");

  if (!users.schema.getFieldByName("digest_enabled")) {
    users.schema.addField(new SchemaField({
      name: "digest_enabled",
      type: "bool",
      required: false,
      options: {}
    }));
  }
  if (!users.schema.getFieldByName("digest_time")) {
    users.schema.addField(new SchemaField({
      name: "digest_time",
      type: "text",
      required: false,
      options: { max: 5, pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" }
    }));
  }
  dao.saveCollection(users);

  const collection = new Collection({
    name: "digests",
    type: "base",
    system: false,
    schema: [
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
      { name: "generated_at", type: "date", required: true, options: {} },
      { name: "content", type: "json", required: true, options: { maxSize: 2000000 } },
      { name: "items_count", type: "number", required: false, options: {} },
      { name: "categories_count", type: "number", required: false, options: {} }
    ],
    indexes: [
      "CREATE INDEX idx_digests_user ON digests (user)",
      "CREATE INDEX idx_digests_user_generated ON digests (user, generated_at)"
    ],
    listRule: "@request.auth.id != '' && user = @request.auth.id",
    viewRule: "@request.auth.id != '' && user = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: "@request.auth.id != '' && user = @request.auth.id"
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);

  try {
    const digests = dao.findCollectionByNameOrId("digests");
    if (digests) dao.deleteCollection(digests);
  } catch (err) { /* collection already gone */ }

  const users = dao.findCollectionByNameOrId("_pb_users_auth_");
  if (users) {
    const enabled = users.schema.getFieldByName("digest_enabled");
    if (enabled) users.schema.removeField(enabled.id);
    const time = users.schema.getFieldByName("digest_time");
    if (time) users.schema.removeField(time.id);
    dao.saveCollection(users);
  }

  return null;
});
