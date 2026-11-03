import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const stories=sqliteTable('stories',{
  id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),title:text('title').notNull(),
  documentJson:text('document_json').notNull(),version:integer('version').notNull().default(1),
  updatedAt:text('updated_at').notNull(),lastRequestId:text('last_request_id').notNull(),lastRequestHash:text('last_request_hash').notNull(),
},t=>[index('stories_owner_updated').on(t.ownerId,t.updatedAt)]);
