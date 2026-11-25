import type { SourceType } from '@shared/types'
import type Database from 'better-sqlite3'
import type { Buffer } from 'node:buffer'
import type { DbChatMessage, DbChatSession, DbSessionStats } from '../types/database'

export class ChatRepository {
  constructor(private readonly db: Database.Database) {}

  createSession(data: {
    session_id: string
    title?: string
    started_at?: number
  }): DbChatSession {
    const startedAt = data.started_at || Math.floor(Date.now() / 1000)
    const result = this.db.prepare(`
      INSERT INTO chat_sessions (session_id, title, started_at, last_message_at)
      VALUES (?, ?, ?, ?)
    `).run(data.session_id, data.title || null, startedAt, startedAt)

    return this.db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(result.lastInsertRowid) as DbChatSession
  }

  getSessions(limit = 50, offset = 0): DbChatSession[] {
    return this.db.prepare(`
      SELECT cs.*,
        (SELECT content FROM chat_messages
         WHERE session_id = cs.session_id
         ORDER BY timestamp ASC, id ASC
         LIMIT 1) AS preview
      FROM chat_sessions cs
      ORDER BY cs.last_message_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as DbChatSession[]
  }

  getSession(sessionId: string): DbChatSession | undefined {
    return this.db.prepare('SELECT * FROM chat_sessions WHERE session_id = ?').get(sessionId) as DbChatSession | undefined
  }

  updateSessionTitle(sessionId: string, title: string): void {
    this.db.prepare('UPDATE chat_sessions SET title = ? WHERE session_id = ?').run(title, sessionId)
  }

  updateSessionStats(sessionId: string): void {
    const stats = this.db.prepare(`
      SELECT COUNT(*) as count, MAX(timestamp) as last_ts
      FROM chat_messages
      WHERE session_id = ?
    `).get(sessionId) as DbSessionStats

    this.db.prepare(`
      UPDATE chat_sessions
      SET message_count = ?, last_message_at = ?
      WHERE session_id = ?
    `).run(stats.count, stats.last_ts, sessionId)
  }

  deleteSession(sessionId: string): void {
    const deleteMessages = this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?')
    const deleteSession = this.db.prepare('DELETE FROM chat_sessions WHERE session_id = ?')
    this.db.transaction(() => {
      deleteMessages.run(sessionId)
      deleteSession.run(sessionId)
    })()
  }

  addMessage(data: {
    session_id: string
    role: 'user' | 'assistant'
    content: string
    emotion?: string
    source_type: SourceType
    image_data?: Buffer
    timestamp?: number
  }): DbChatMessage {
    const timestamp = data.timestamp ?? Math.floor(Date.now() / 1000)
    const result = this.db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, emotion, source_type, image_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.session_id,
      data.role,
      data.content,
      data.emotion || null,
      data.source_type,
      data.image_data || null,
      timestamp,
    )

    this.updateSessionStats(data.session_id)
    return this.db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid) as DbChatMessage
  }

  getMessages(sessionId: string, limit?: number, offset = 0): DbChatMessage[] {
    if (limit === undefined || limit === null || limit <= 0) {
      return this.db.prepare(`
        SELECT * FROM chat_messages
        WHERE session_id = ?
        ORDER BY timestamp ASC
      `).all(sessionId) as DbChatMessage[]
    }

    return this.db.prepare(`
      SELECT * FROM chat_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset) as DbChatMessage[]
  }

  getMessageCount(sessionId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM chat_messages
      WHERE session_id = ?
    `).get(sessionId) as { count: number }
    return result.count
  }

  deleteMessage(messageId: number): void {
    const message = this.db.prepare('SELECT session_id FROM chat_messages WHERE id = ?')
      .get(messageId) as { session_id: string } | undefined
    if (message) {
      this.db.prepare('DELETE FROM chat_messages WHERE id = ?').run(messageId)
      this.updateSessionStats(message.session_id)
    }
  }

  clearMessages(sessionId: string): void {
    this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId)
    this.updateSessionStats(sessionId)
  }
}
