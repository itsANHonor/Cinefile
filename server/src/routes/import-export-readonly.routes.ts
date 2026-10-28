import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/import-export/schema
 * Get the CSV import schema documentation
 */
router.get('/schema', (req: Request, res: Response) => {
  const schema = {
    description: 'CSV Import/Export Schema for Cinefile Media Collection',
    format: 'CSV (Comma-Separated Values)',
    encoding: 'UTF-8',
    fields: [
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'The title of the media item',
        example: 'The Matrix',
      },
      {
        name: 'physical_item_name',
        type: 'string',
        required: true,
        description: 'Name of the physical item (e.g., "Back to the Future Box Set"). Multiple movies can share the same physical item.',
        example: 'Back to the Future Trilogy',
      },
      {
        name: 'formats',
        type: 'JSON array (string)',
        required: true,
        description: 'Physical format(s) for this specific movie. JSON array of formats.',
        allowed_values: ['4K UHD', '3D Blu-ray', 'Blu-ray', 'DVD', 'Digital-HD', 'Digital-SD', 'Digital-UHD', 'LaserDisc', 'VHS'],
        example: '["Blu-ray","DVD"]',
      },
      {
        name: 'tmdb_id',
        type: 'integer',
        required: false,
        description: 'The Movie Database (TMDb) ID. If provided and a movie with this ID exists, it will be reused instead of creating a new entry.',
        example: '603',
      },
      {
        name: 'synopsis',
        type: 'text',
        required: false,
        description: 'Plot synopsis or description',
        example: 'A computer hacker learns from mysterious rebels...',
      },
      {
        name: 'cover_art_url',
        type: 'string (URL)',
        required: false,
        description: 'URL to cover art image (typically from TMDb)',
        example: 'https://image.tmdb.org/t/p/w500/...',
      },
      {
        name: 'release_date',
        type: 'date',
        required: false,
        description: 'Release date in YYYY-MM-DD format',
        example: '1999-03-31',
      },
      {
        name: 'director',
        type: 'string',
        required: false,
        description: 'Director name(s)',
        example: 'Lana Wachowski, Lilly Wachowski',
      },
      {
        name: 'cast',
        type: 'JSON array (string)',
        required: false,
        description: 'Cast members as JSON array string',
        example: '["Keanu Reeves","Laurence Fishburne","Carrie-Anne Moss"]',
      },
      {
        name: 'genres',
        type: 'JSON array (string)',
        required: false,
        description: 'Genres as JSON array of objects with id and name properties',
        example: '[{"id":28,"name":"Action"},{"id":878,"name":"Science Fiction"}]',
      },
      {
        name: 'series',
        type: 'JSON array (string)',
        required: false,
        description: 'Series names as JSON array string. Movies can belong to multiple series.',
        example: '["The Matrix Trilogy","Sci-Fi Classics"]',
      },
      {
        name: 'disc_number',
        type: 'integer',
        required: false,
        description: 'Disc number within the physical item (for multi-disc sets)',
        example: '1',
      },
      {
        name: 'version_notes',
        type: 'string',
        required: false,
        description: 'Movie version or cut included on this disc/entry (e.g., Theatrical, Extended, Director\'s Cut)',
        example: 'Extended',
      },
      {
        name: 'edition_notes',
        type: 'string',
        required: false,
        description: 'Edition details like Steelbook, Collector\'s Edition, etc.',
        example: 'Steelbook Edition',
      },
      {
        name: 'purchase_date',
        type: 'date',
        required: false,
        description: 'Purchase date of the physical item in YYYY-MM-DD format',
        example: '2023-12-01',
      },
      {
        name: 'store_links',
        type: 'JSON array (string)',
        required: false,
        description: 'Store links for the physical item as JSON array',
        example: '["https://amazon.com/item","https://bestbuy.com/item"]',
      },
      {
        name: 'custom_image_url',
        type: 'string (URL)',
        required: false,
        description: 'URL to custom uploaded image of your physical media',
        example: '/uploads/my-photo.jpg',
      },
    ],
    notes: [
      'For IMPORT: Only title, physical_item_name, and formats are required.',
      'For IMPORT: Multiple movies can share the same physical_item_name to create box sets or multi-disc collections.',
      'For IMPORT: If tmdb_id is provided and matches an existing movie, that movie will be reused instead of creating a duplicate.',
      'For IMPORT: The physical item\'s overall formats will be automatically calculated from all movies\' formats.',
      'For IMPORT: If a field contains commas, newlines, or quotes, wrap the entire value in double quotes.',
      'For IMPORT: To include a quote character within a quoted field, use two consecutive quotes ("").',
      'For IMPORT: The cast, genres, series, and store_links fields should be valid JSON arrays as strings.',
      'For IMPORT: If tmdb_id matches an existing movie, the movie will be updated with CSV data instead of creating a duplicate.',
      'For IMPORT: Series names will be created if they don\'t exist, and movies will be linked to them.',
      'For EXPORT: All fields will be exported including id, created_at, and updated_at.',
      'For EXPORT: Each row represents one movie, with physical item details duplicated for movies in the same physical item.',
      'For EXPORT: You can re-import an exported CSV - the id, created_at, and updated_at fields will be ignored on import.',
    ],
    example_csv: `title,physical_item_name,formats,tmdb_id,director,disc_number,edition_notes
"Back to the Future","Back to the Future Trilogy","[""Blu-ray"",""DVD""]",105,"Robert Zemeckis",1,"Box Set"
"Back to the Future Part II","Back to the Future Trilogy","[""Blu-ray"",""DVD""]",165,"Robert Zemeckis",2,"Box Set"
"The Matrix","The Matrix","[""4K UHD"",""Blu-ray""]",603,"Lana Wachowski, Lilly Wachowski",1,"4K Combo Pack"`,
  };

  res.json(schema);
});

export default router;



