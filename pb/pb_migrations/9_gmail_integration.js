/// <reference path="../pb_data/types.d.ts" />
// CYCLE-12 — Gmail OAuth integration.
//
// Adds an `integrations` collection to store per-user OAuth credentials for
// third-party providers (starting with Google/Gmail). The collection has no
// public access rules: only the admin SDK (worker + server routes) can
// read or write, mirroring how we treat secrets like password hashes.
//
// Also extends the items `type` enum with `email` so the inbox can store
// Gmail messages.

migrate((db) => {
  const dao = new Dao(db);

  // 1. integrations collection ------------------------------------------------
  const integrations = new Collection({
    name: "integrations",
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
      {
        name: "provider",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["google"] }
      },
      { name: "provider_sub", type: "text", required: false, options: { max: 128 } },
      { name: "provider_email", type: "text", required: false, options: { max: 255 } },
      { name: "access_token", type: "text", required: false, options: {} },
      { name: "refresh_token", type: "text", required: false, options: {} },
      { name: "access_token_expires_at", type: "date", required: false, options: {} },
      { name: "scopes", type: "json", required: false, options: { maxSize: 4000 } },
      { name: "last_sync_at", type: "date", required: false, options: {} },
      { name: "last_history_id", type: "text", required: false, options: { max: 64 } },
      {
        name: "status",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["active", "revoked", "error"] }
      },
      { name: "error_msg", type: "text", required: false, options: { max: 500 } }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_integrations_user_provider ON integrations (user, provider)",
      "CREATE INDEX idx_integrations_user ON integrations (user)"
    ],
    // No user-facing rules — all access goes through server routes that use
    // admin auth. Tokens must never be exposed to clients directly.
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null
  });
  dao.saveCollection(integrations);

  // 2. items.type: add `email` ------------------------------------------------
  const items = dao.findCollectionByNameOrId("items");
  if (!items) throw new Error("items collection not found");
  const typeField = items.schema.getFieldByName("type");
  if (!typeField) throw new Error("items.type field not found");
  const currentValues = typeField.options.values || [];
  if (currentValues.indexOf("email") === -1) {
    typeField.options.values = currentValues.concat(["email"]);
  }

  // 3. items: email-specific metadata ----------------------------------------
  if (!items.schema.getFieldByName("email_message_id")) {
    items.schema.addField(new SchemaField({
      name: "email_message_id",
      type: "text",
      required: false,
      options: { max: 128 }
    }));
  }
  if (!items.schema.getFieldByName("email_from")) {
    items.schema.addField(new SchemaField({
      name: "email_from",
      type: "text",
      required: false,
      options: { max: 255 }
    }));
  }
  if (!items.schema.getFieldByName("email_subject")) {
    items.schema.addField(new SchemaField({
      name: "email_subject",
      type: "text",
      required: false,
      options: { max: 500 }
    }));
  }
  if (!items.schema.getFieldByName("email_received_at")) {
    items.schema.addField(new SchemaField({
      name: "email_received_at",
      type: "date",
      required: false,
      options: {}
    }));
  }

  // Unique partial index: prevent re-ingesting the same Gmail message per user.
  const existingIndexes = items.indexes || [];
  const hasGmailIndex = existingIndexes.some((s) => s.indexOf("idx_items_email_message") !== -1);
  if (!hasGmailIndex) {
    items.indexes = existingIndexes.concat([
      "CREATE UNIQUE INDEX idx_items_email_message ON items (user, email_message_id) WHERE email_message_id IS NOT NULL AND email_message_id != ''"
    ]);
  }

  return dao.saveCollection(items);
}, (db) => {
  const dao = new Dao(db);

  // Revert items changes first, then drop integrations.
  const items = dao.findCollectionByNameOrId("items");
  if (items) {
    const typeField = items.schema.getFieldByName("type");
    if (typeField) {
      typeField.options.values = (typeField.options.values || []).filter((v) => v !== "email");
    }
    for (const name of ["email_message_id", "email_from", "email_subject", "email_received_at"]) {
      const f = items.schema.getFieldByName(name);
      if (f) items.schema.removeField(f.id);
    }
    items.indexes = (items.indexes || []).filter((s) => s.indexOf("idx_items_email_message") === -1);
    dao.saveCollection(items);
  }

  const integrations = dao.findCollectionByNameOrId("integrations");
  if (integrations) dao.deleteCollection(integrations);
  return null;
});
