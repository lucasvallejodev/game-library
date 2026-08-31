import { describe, expect, it } from 'vitest'

import { slugify, sortName } from './text.js'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('WD 4TB External')).toBe('wd-4tb-external')
  })

  it('strips diacritics rather than dropping the letter', () => {
    expect(slugify('Café Racer')).toBe('cafe-racer')
    expect(slugify('Pokémon')).toBe('pokemon')
  })

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(slugify('Half-Life 2: Episode  One')).toBe('half-life-2-episode-one')
  })

  it('trims leading and trailing separators', () => {
    expect(slugify('  !GOG!  ')).toBe('gog')
  })

  it('collides on names that differ only by spacing or case', () => {
    expect(slugify('WD 4TB  external')).toBe(slugify('WD 4TB External'))
  })

  it('returns an empty string when nothing sluggable remains', () => {
    expect(slugify('!!!')).toBe('')
  })
})

describe('sortName', () => {
  it('strips a leading definite article', () => {
    expect(sortName('The Witcher 3')).toBe('Witcher 3')
  })

  it('strips leading indefinite articles', () => {
    expect(sortName('A Plague Tale')).toBe('Plague Tale')
    expect(sortName('An Ordinary Day')).toBe('Ordinary Day')
  })

  it('leaves words that merely start with an article alone', () => {
    expect(sortName('Anno 1800')).toBe('Anno 1800')
    expect(sortName('Theme Hospital')).toBe('Theme Hospital')
  })

  it('strips only the first article', () => {
    expect(sortName('The A-Team Game')).toBe('A-Team Game')
  })

  it('normalizes surrounding and repeated whitespace', () => {
    expect(sortName('  The   Witcher 3  ')).toBe('Witcher 3')
  })
})
