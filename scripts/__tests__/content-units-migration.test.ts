import { describe, expect, it } from 'vitest'
import fs from 'fs'

const migration = fs.readFileSync('scripts/migrations/2026-04-25-content-units-lesson-blocks.sql', 'utf-8')
const rollback = fs.readFileSync('scripts/migrations/2026-04-25-content-units-lesson-blocks.rollback.sql', 'utf-8')

describe('content units migration', () => {
  it('creates durable content unit, lesson block, and capability relationship tables', () => {
    expect(migration).toContain('create table if not exists indonesian.content_units')
    expect(migration).toContain('content_unit_key text not null unique')
    expect(migration).toContain('create table if not exists indonesian.lesson_page_blocks')
    expect(migration).toContain('create table if not exists indonesian.capability_content_units')
    expect(migration).toContain("relationship_kind in ('introduced_by','practiced_by','assessed_by','referenced_by')")
    expect(migration).toContain('grant select on indonesian.lesson_page_blocks to authenticated')
    expect(migration).toContain('revoke insert, update, delete on indonesian.capability_content_units from authenticated')
  })

  it('rolls the slice back in dependency order', () => {
    const drops = rollback
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('drop table'))

    expect(drops).toEqual([
      'drop table if exists indonesian.capability_content_units;',
      'drop table if exists indonesian.lesson_page_blocks;',
      'drop table if exists indonesian.content_units;',
    ])
  })
})
