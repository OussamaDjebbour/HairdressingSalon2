// Shared by the app (src/data/salonRow.ts) and the edge middleware (functions/_lib), so both read
// the same salon columns. No imports: the edge's TypeScript project includes this file as is.

/** The salon columns the app reads (PostgREST select list). */
export const SALON_COLUMNS =
  'id, name, name_ar, palette, hero_image, founder_name, founder_role, story, story_intro, ' +
  'years_open, client_count, rating, review_count, demo';

/** The id of the <script type="application/json"> the edge writes the salon row into. */
export const SALON_DATA_ID = 'salon-data';
