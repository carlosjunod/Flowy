/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);

  const collection = new Collection({
    name: "user_interests",
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
      { name: "topic", type: "text", required: true, options: { max: 64 } },
      {
        name: "source",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["tag", "category"] }
      },
      {
        name: "count",
        type: "number",
        required: true,
        options: { min: 0, noDecimal: true }
      },
      { name: "last_seen", type: "date", required: true, options: {} }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_user_interests_unique ON user_interests (user, topic, source)",
      "CREATE INDEX idx_user_interests_user ON user_interests (user)",
      "CREATE INDEX idx_user_interests_topic ON user_interests (topic)"
    ],
    listRule: "@request.auth.id != '' && user = @request.auth.id",
    viewRule: "@request.auth.id != '' && user = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: null
  });

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("user_interests");
  return dao.deleteCollection(collection);
});
