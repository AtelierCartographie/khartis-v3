/**
 * @constant {string} normalize_raw_text_macro
 * @description Legacy raw-text normalization used by destructive operations.
 * It preserves the previous behavior: trim, remove non-alphanumeric chars,
 * lowercase, then strip accents.
 */
const normalize_raw_text_macro = `CREATE OR REPLACE MACRO normalize_raw_text(s) AS (
	lower(strip_accents(regexp_replace(trim(coalesce(s::VARCHAR, '')), '[^a-zA-Z0-9]', ' ', 'g')))
);`;

/**
 * @constant {string} strip_html_text_macro
 * @description Converts HTML-like strings to display/search plain text.
 * It decodes common entities, strips tag structures, collapses whitespace,
 * and trims the final result.
 */
const strip_html_text_macro = `CREATE OR REPLACE MACRO strip_html_text(s) AS (
	trim(
		regexp_replace(
			regexp_replace(
				regexp_replace(
					regexp_replace(
						regexp_replace(
							regexp_replace(
								regexp_replace(
									replace(
										regexp_replace(
											regexp_replace(
												coalesce(s::VARCHAR, ''),
												'&nbsp;',
												' ',
												'gi'
											),
											'&amp;',
											'&',
											'gi'
										),
										'&quot;',
										'"'
									),
									'&#39;',
									'''',
									'gi'
								),
								'&apos;',
								'''',
								'gi'
							),
							'&lt;',
							'<',
							'gi'
						),
						'&gt;',
						'>',
						'gi'
					),
					'</?[A-Za-z][A-Za-z0-9:_-]*(\\s[^<>]*?)?>',
					' ',
					'g'
				),
				'\\s+',
				' ',
				'g'
			),
			'^\\s+|\\s+$',
			'',
			'g'
		)
	)
);`;

/**
 * @constant {string} normalize_text_macro
 * @description Search normalization built on the HTML-aware projection.
 * It keeps the historic normalization steps after stripping HTML-like markup.
 */
const normalize_text_macro = `CREATE OR REPLACE MACRO normalize_text(s) AS (
	lower(strip_accents(regexp_replace(strip_html_text(s), '[^a-zA-Z0-9]', ' ', 'g')))
);`;

export const search_macros = [
  normalize_raw_text_macro,
  strip_html_text_macro,
  normalize_text_macro
].join('\n');
