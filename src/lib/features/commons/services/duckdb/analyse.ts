const get_js_type_macro = `CREATE OR REPLACE MACRO get_js_type(t) AS (
	SELECT
		CASE
			WHEN t IN ('BIGINT', 'HUGEINT', 'UBIGINT')  THEN 'bigint'
			--
			WHEN t IN ('DOUBLE', 'REAL', 'FLOAT') THEN 'number'
			WHEN t ILIKE 'decimal%' THEN 'number'
			--
			WHEN t IN ('INTEGER', 'SMALLINT', 'TINYINT', 'USMALLINT', 'UINTEGER', 'UTINYINT') THEN 'integer'
			--
			WHEN t = 'BOOLEAN' THEN 'boolean'
			--
			WHEN t IN ('DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE') THEN 'date'
			--
			WHEN t IN ('VARCHAR', 'UUID', 'BLOB', 'BITSTRING', 'TIME', 'INTERVAL') THEN 'string'
			--
			WHEN t = 'GEOMETRY' THEN 'geometry'
			--
			ELSE 'other'
		END
	);`;

const get_simplified_type_macro = `CREATE OR REPLACE MACRO get_simplified_type(t) AS (
	SELECT 
		CASE
			WHEN t IN ('BIGINT', 'HUGEINT', 'UBIGINT')  THEN 'numeric'
			--
			WHEN t IN ('DOUBLE', 'REAL', 'FLOAT') THEN 'numeric'
			WHEN t ILIKE 'decimal%' THEN 'numeric'
			--
			WHEN t IN ('INTEGER', 'SMALLINT', 'TINYINT', 'USMALLINT', 'UINTEGER', 'UTINYINT') THEN 'numeric'
			--
			WHEN t = 'BOOLEAN' THEN 'string'
			--
			WHEN t IN ('DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE') THEN 'date'
			--
			WHEN t IN ('VARCHAR', 'UUID', 'BLOB', 'BITSTRING', 'TIME', 'INTERVAL') THEN 'string'
			--
			WHEN t = 'GEOMETRY' THEN 'geometry'
			--
			ELSE 'other'
		END
);`;

const describe_full_macro = `CREATE OR replace MACRO describe_full(tabname) AS TABLE (
	FROM duckdb_columns()
    SELECT 
		column_name as name,
		data_type as type,
		get_js_type(type) as type_js,
		get_simplified_type(type) as type_simple,
		regexp_matches(name, '(?:^|\\W|_)(percent|share|per|par|part|proportion|rate|taux|%|/)(?:$|\\W|_)', 'i') as ratio_words,
		regexp_matches(name, '(?:^|\\W|_)(ranking|rank|rang|classement)(?:$|\\W|_)', 'i') as rank_words,
		regexp_matches(name, '(?:^|\\W|_)(id|code|name|nom)(?:$|\\W|_)', 'i') as id_words,
		regexp_matches(name, '(?:^|\\W|_)(lat|latitude)(?:$|\\W|_)', 'i') as lat_words,
		regexp_matches(name, '(?:^|\\W|_)(lon|long|longitude)(?:$|\\W|_)', 'i') as lon_words,
	WHERE table_name = tabname
);`;

const share_rank_interval_macro = `CREATE OR REPLACE FUNCTION share_rank_interval(tabname, colname) AS (
    WITH ordered_values AS (
        SELECT 
            "colname",
            LAG("colname") OVER (ORDER BY "colname") AS prev_value
        FROM query_table(tabname)
        WHERE "colname" IS NOT NULL
    ),
    differences AS (
        SELECT 
            "colname",
            prev_value,
            "colname" - prev_value AS diff
        FROM ordered_values
    )
    SELECT 
        SUM(CASE WHEN diff = 1 THEN 1 ELSE 0 END) / COUNT("colname")
    FROM differences
    WHERE prev_value IS NOT NULL
);`;

const summary_general_macro = `CREATE OR REPLACE MACRO summary_general(tabname, colname) AS TABLE (
	FROM query_table(tabname)
	SELECT
		first(alias("colname")) as name,
		count(*) as length,
		count("colname") as count,
		count(DISTINCT "colname") as uniques,
		uniques / length as share_uniques,
		length - COUNT("colname") as nulls,
		nulls / length as share_nulls
);`;

const summary_numeric_macro = `CREATE OR REPLACE MACRO summary_numeric(tabname, colname) AS TABLE (
	WITH t1 AS (
		FROM query_table(tabname)
		SELECT
			min("colname") AS min,
	        max("colname") AS max,
	        max - min AS extent,
	        CASE 
	          WHEN min >= 0 AND max > 0 THEN 'positive'
	          WHEN min < 0 AND max <= 0 THEN 'negative'
	          WHEN min < 0 AND max > 0 THEN 'cross_zero'
	        END AS sign,
	        CASE
	          WHEN min = 0 THEN 0
	          ELSE ((min).abs().log10().floor() + 1) * sign(min)
	        END AS min_mag,
	        CASE
	          WHEN max = 0 THEN 0
	          ELSE ((max).abs().log10().floor() + 1) * sign(max)
	        END AS max_mag,
	        max_mag - min_mag AS extent_magnitude,
	        SUM(CASE WHEN MOD("colname", 1) = 0 THEN 1 ELSE 0 END) * 1.0 / count(*) AS share_integers,
	        SUM(CASE WHEN MOD("colname", 1) <> 0 THEN 1 ELSE 0 END) * 1.0 / count(*) AS share_floats
	 ) FROM t1 POSITIONAL JOIN (SELECT share_rank_interval(tabname, "colname") as share_rank_interval)
);`;

const summary_date_macro = `CREATE OR REPLACE MACRO summary_date(tabname, colname) AS TABLE (
		FROM query_table(tabname)
		SELECT
			min("colname") AS min,
	        max("colname") AS max
);`;

const histogram_numeric_macro = `CREATE OR REPLACE MACRO histogram_numeric(tabname, colname) AS TABLE(
	WITH bins AS (
		FROM query_table(tabname::VARCHAR)
		SELECT equi_width_bins(MIN("colname"), MAX("colname"), 15, true) AS bins
	), agg AS (
		SELECT list_sort(list_distinct(FIRST(bins))) AS bins, histogram("colname", bins) AS histogram
		FROM query_table(tabname::VARCHAR), bins
	), histo AS (
		FROM agg, UNNEST(agg.bins) AS u(bin)
		SELECT bin, histogram[bin]::DOUBLE AS count
	), nulls_count AS (
		FROM query_table(tabname)
		SELECT NULL AS bin, (COUNT(*) - COUNT("colname")::DOUBLE) AS count
		HAVING (COUNT(*) - COUNT("colname")::DOUBLE) <> 0
	)
	FROM histo
	UNION ALL
	FROM nulls_count
);`;

const histogram_categorical_macro = `CREATE OR REPLACE MACRO histogram_categorical(tabname, colname) AS TABLE (
	WITH nrow AS (
		SELECT count(*) AS total FROM query_table(tabname)
	), all_categories AS (
		FROM query_table(tabname), nrow
	   	SELECT "colname" AS category, count(*) AS count, count / nrow.total AS percent
	   	GROUP BY "colname", nrow.total
	   	ORDER BY count DESC
	), one AS (
		FROM all_categories
		SELECT 'unique', count(count) as count, sum(percent) as percent
		WHERE count = 1
	), several AS (
		FROM all_categories
		WHERE count <> 1
	) FROM several
	UNION ALL
	FROM one
  	WHERE count <> 0
);`;

export const analyse =
	get_js_type_macro +
	get_simplified_type_macro +
	describe_full_macro +
	share_rank_interval_macro +
	summary_general_macro +
	summary_numeric_macro +
	summary_date_macro +
	histogram_numeric_macro +
	histogram_categorical_macro;
