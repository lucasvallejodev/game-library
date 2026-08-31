import { relations } from 'drizzle-orm'

import { users } from './auth.js'
import { gameGenres, gameLocations, games } from './games.js'
import { mediaAssets } from './media.js'
import { gameTypes, genres, locations } from './taxonomy.js'
import { wishlistItemGenres, wishlistItems } from './wishlist.js'

/**
 * Relations power Drizzle's relational query API (`db.query.games.findMany({
 * with: { locations: true } })`), which is how the card grid fetches a game
 * plus its chips in one round trip.
 *
 * These are a query-planning convenience only — the actual referential
 * integrity lives in the foreign keys declared on the tables themselves.
 */

export const usersRelations = relations(users, ({ many }) => ({
  games: many(games),
  wishlistItems: many(wishlistItems),
  locations: many(locations),
  gameTypes: many(gameTypes),
  genres: many(genres),
  mediaAssets: many(mediaAssets),
}))

export const gamesRelations = relations(games, ({ one, many }) => ({
  user: one(users, { fields: [games.userId], references: [users.id] }),
  gameType: one(gameTypes, { fields: [games.gameTypeId], references: [gameTypes.id] }),
  cover: one(mediaAssets, { fields: [games.coverAssetId], references: [mediaAssets.id] }),
  gameLocations: many(gameLocations),
  gameGenres: many(gameGenres),
}))

export const gameLocationsRelations = relations(gameLocations, ({ one }) => ({
  game: one(games, { fields: [gameLocations.gameId], references: [games.id] }),
  location: one(locations, { fields: [gameLocations.locationId], references: [locations.id] }),
}))

export const gameGenresRelations = relations(gameGenres, ({ one }) => ({
  game: one(games, { fields: [gameGenres.gameId], references: [games.id] }),
  genre: one(genres, { fields: [gameGenres.genreId], references: [genres.id] }),
}))

export const locationsRelations = relations(locations, ({ one, many }) => ({
  user: one(users, { fields: [locations.userId], references: [users.id] }),
  logo: one(mediaAssets, { fields: [locations.logoAssetId], references: [mediaAssets.id] }),
  gameLocations: many(gameLocations),
}))

export const gameTypesRelations = relations(gameTypes, ({ one, many }) => ({
  user: one(users, { fields: [gameTypes.userId], references: [users.id] }),
  games: many(games),
  wishlistItems: many(wishlistItems),
}))

export const genresRelations = relations(genres, ({ one, many }) => ({
  user: one(users, { fields: [genres.userId], references: [users.id] }),
  gameGenres: many(gameGenres),
  wishlistItemGenres: many(wishlistItemGenres),
}))

export const wishlistItemsRelations = relations(wishlistItems, ({ one, many }) => ({
  user: one(users, { fields: [wishlistItems.userId], references: [users.id] }),
  gameType: one(gameTypes, { fields: [wishlistItems.gameTypeId], references: [gameTypes.id] }),
  cover: one(mediaAssets, { fields: [wishlistItems.coverAssetId], references: [mediaAssets.id] }),
  promotedGame: one(games, {
    fields: [wishlistItems.promotedGameId],
    references: [games.id],
  }),
  wishlistItemGenres: many(wishlistItemGenres),
}))

export const wishlistItemGenresRelations = relations(wishlistItemGenres, ({ one }) => ({
  wishlistItem: one(wishlistItems, {
    fields: [wishlistItemGenres.wishlistItemId],
    references: [wishlistItems.id],
  }),
  genre: one(genres, { fields: [wishlistItemGenres.genreId], references: [genres.id] }),
}))

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  user: one(users, { fields: [mediaAssets.userId], references: [users.id] }),
}))
