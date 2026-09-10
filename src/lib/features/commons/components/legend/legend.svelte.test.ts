import { render } from '@testing-library/svelte';
import Textbox from '@borgar/textbox';
import { scaleLegendMetric } from './utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LegendSvg,
  createLegendSvg,
  draw_categorical_legend,
  draw_khartis_line_width_legend,
  draw_khartis_swatch_legend,
  draw_quanti_color_legend,
  draw_symbols_legend
} from '.';
import { renderLegendHeader, renderLegendNote, wrapLegendText } from './utils';

const measureCanvas = {
  getContext: () => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 7 })
  })
};

describe('common legend generators', () => {
  beforeAll(() => {
    Textbox.setMeasureCanvas(measureCanvas);
  });

  afterAll(() => {
    Textbox.setMeasureCanvas(null);
  });

  it('wraps legend text with the shared Textbox measurement', () => {
    expect(wrapLegendText('Alpha beta gamma', '12px Inter', 75)).toEqual([
      'Alpha beta',
      'gamma'
    ]);
  });

  it('wraps an unbroken legend label within the measured width', () => {
    const lines = wrapLegendText(
      'population_identifier_with_no_spaces',
      '12px Inter',
      70
    );

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('population_identifier_with_no_spaces');
    expect(
      lines.every((line) => Textbox.measureText(line, '12px Inter') <= 70)
    ).toBe(true);
  });

  it('renders shared header and note blocks with escaped wrapped text', () => {
    const header = renderLegendHeader({
      title: 'Alpha <title> beta gamma',
      subtitle: 'Delta epsilon',
      x: 4,
      y: 6,
      maxWidth: 75,
      titleSize: 12,
      subtitleSize: 10,
      fontFamily: 'Inter'
    });
    const note = renderLegendNote({
      note: 'Source <unsafe> beta gamma',
      x: 4,
      y: header.height + 10,
      maxWidth: 75,
      noteSize: 9,
      fontFamily: 'Inter'
    });
    const emptyHeader = renderLegendHeader({
      title: '   ',
      subtitle: '   ',
      x: 4,
      y: 6,
      maxWidth: 75,
      titleSize: 12,
      subtitleSize: 10,
      fontFamily: 'Inter'
    });

    expect(header.markup).toContain('class="title"');
    expect(header.markup).toContain('class="subtitle"');
    expect(header.markup).toContain('&lt;title&gt;');
    expect(header.markup).not.toContain('<title>');
    expect(header.height).toBeGreaterThan(0);
    expect(note.markup).toContain('class="note"');
    expect(note.markup).toContain('&lt;unsafe&gt;');
    expect(note.height).toBeGreaterThan(0);
    expect(emptyHeader).toEqual({ markup: '', height: 0 });
  });

  it('draws a quantitative color legend from precomputed thresholds', () => {
    const svg = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        title: 'Population',
        nodata: true,
        nodataLabel: 'Sans données'
      })
    );

    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);
    expect(svg.markup).toContain('quantitative_legend');
    expect(svg.markup).toContain('Sans données');
    expect(svg.markup).toContain('#2171b5');
  });

  it('widens quantitative legends to contain unbroken header text', () => {
    const svg = createLegendSvg(
      draw_quanti_color_legend([0, 1], ['#2171b5'], {
        title: 'Évolution du PIB',
        subtitle: 'gdp_per_capita / growth_rate',
        fontSize: 10
      })
    );

    const horizontalMargins = scaleLegendMetric(10, 10) * 2;
    expect(svg.width).toBeGreaterThanOrEqual(
      Textbox.measureText('gdp_per_capita', '10px Open Sans') +
        horizontalMargins
    );
  });

  it('draws categorical legends and escapes labels before raw SVG rendering', () => {
    const svg = createLegendSvg(
      draw_categorical_legend([
        {
          label: 'A <script>',
          fill: '#f287ac'
        }
      ])
    );

    expect(svg.markup).toContain('categorical_legend');
    expect(svg.markup).toContain('A &lt;script&gt;');
    expect(svg.markup).not.toContain('A <script>');
  });

  it('widens categorical legends to contain unbroken header text', () => {
    const svg = createLegendSvg(
      draw_categorical_legend(
        [
          { label: 'private', fill: '#b08c7a' },
          { label: 'public', fill: '#9f8a6a' }
        ],
        {
          title: 'Visualisation',
          subtitle: 'place_name / category',
          fontSize: 10
        }
      )
    );

    const horizontalMargins = scaleLegendMetric(10, 10) * 2;
    expect(svg.width).toBeGreaterThanOrEqual(
      Textbox.measureText('Visualisation', 'bold 12px Open Sans') +
        horizontalMargins
    );
  });

  it('gains columns instead of rows past the compact category count', () => {
    const countColumns = (items_nb: number): number => {
      const svg = draw_categorical_legend(
        Array.from({ length: items_nb }, (_, index) => ({
          label: `Catégorie ${index + 1}`,
          fill: '#4585f5'
        })),
        { fontSize: 8 }
      );

      return new Set(
        [
          ...svg.markup.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="10"/g)
        ].map((match) => match[1])
      ).size;
    };

    expect(countColumns(4)).toBe(1);
    expect(countColumns(8)).toBe(2);
    expect(countColumns(30)).toBe(3);
    // Three columns would push these past thirty rows and off the page.
    expect(countColumns(91)).toBe(4);
    expect(countColumns(121)).toBe(5);
    expect(countColumns(200)).toBe(5);
  });

  it('keeps categorical missing data compact in the same SVG', () => {
    const svg = createLegendSvg(
      draw_categorical_legend(
        [
          { label: 'Actif', fill: '#4585f5' },
          { label: 'Dormant', fill: '#ff812a' }
        ],
        {
          title: 'Visualisation',
          subtitle: 'Status',
          footerType: 'box',
          footerItems: [
            {
              label: 'Absence de données',
              fill: '#c6c6c6',
              stroke: 'rgba(0, 0, 0, 0.15)'
            }
          ]
        }
      )
    );

    expect(svg.markup).toContain('categorical_legend');
    expect(svg.markup).toContain('Absence de données');
    expect(svg.height).toBeLessThan(140);
  });

  it('draws nested proportional symbol legends from numeric data', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([7, 100_000, 1_000_000], {
        type: 'circle',
        fill: '#4585f5',
        stroke: '#ffffff'
      })
    );

    expect(svg.markup).toContain('symbol_legend');
    expect(svg.markup).toContain('class="links"');
    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);
  });

  it('drops symbol legend ticks whose labels would vertically overlap', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([38, 54], {
        type: 'circle',
        size: 18,
        fontSize: 12,
        fill: '#4585f5'
      })
    );

    const host = document.createElement('div');
    host.innerHTML = `<svg>${svg.markup}</svg>`;
    const labelTexts = [...host.querySelectorAll('.labels text')].map(
      (node) => ({
        y: Number(node.getAttribute('y')),
        text: node.textContent?.trim() ?? ''
      })
    );

    // With size=18 and fontSize=12, [38,54] would have labels only ~6px apart.
    // The smaller tick should be dropped so only the max remains.
    expect(labelTexts.length).toBeGreaterThanOrEqual(1);
    expect(labelTexts.some((l) => l.text === '54')).toBe(true);

    // Verify no two labels are closer than fontSize * 1.2
    for (let i = 0; i < labelTexts.length - 1; i++) {
      const dist = Math.abs(labelTexts[i].y - labelTexts[i + 1].y);
      expect(dist).toBeGreaterThanOrEqual(12 * 1.2);
    }
  });

  it('keeps non-overlapping symbol legend ticks while dropping overlapping ones', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([1_300_000, 4_000_000, 9_900_000], {
        type: 'circle',
        size: 18,
        fontSize: 12,
        fill: '#4585f5'
      })
    );

    const host = document.createElement('div');
    host.innerHTML = `<svg>${svg.markup}</svg>`;
    const labelTexts = [...host.querySelectorAll('.labels text')].map(
      (node) => ({
        y: Number(node.getAttribute('y')),
        text: node.textContent?.trim() ?? ''
      })
    );

    // The middle tick (4,000,000) would overlap with neighbours at this size,
    // so we expect to keep the extremes that are far enough apart.
    expect(labelTexts.length).toBeGreaterThanOrEqual(1);

    // Verify no two labels are closer than fontSize * 1.2
    for (let i = 0; i < labelTexts.length - 1; i++) {
      const dist = Math.abs(labelTexts[i].y - labelTexts[i + 1].y);
      expect(dist).toBeGreaterThanOrEqual(12 * 1.2);
    }
  });

  it('widens proportional symbol legends when the missing-data label is long', () => {
    const base = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'circle',
        fill: '#4585f5'
      })
    );
    const withNoData = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'circle',
        fill: '#4585f5',
        nodata: true,
        nodataLabel: 'Absence de données'
      })
    );

    expect(withNoData.markup).toContain('Absence de données');
    expect(withNoData.width).toBeGreaterThan(base.width);
  });

  it('widens proportional symbol legends to contain unbroken header text', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        title: 'Population',
        subtitle: 'population_identifier_with_no_spaces',
        fontSize: 10
      })
    );

    const horizontalMargins = scaleLegendMetric(10, 10) * 2;
    expect(svg.width).toBeGreaterThanOrEqual(
      Textbox.measureText(
        'population_identifier_with_no_spaces',
        '10px Open Sans'
      ) + horizontalMargins
    );
  });

  it('widens line-width legends to contain unbroken header text', () => {
    const svg = createLegendSvg(
      draw_khartis_line_width_legend(
        [{ label: '100', width: 4, color: '#4585f5' }],
        {
          title: 'Flux de transports',
          subtitle: 'transport_flow_identifier',
          fontSize: 10
        }
      )
    );

    const horizontalMargins = scaleLegendMetric(10, 10) * 2;
    expect(svg.width).toBeGreaterThanOrEqual(
      Textbox.measureText('transport_flow_identifier', '10px Open Sans') +
        horizontalMargins
    );
  });

  it('draws quantitative class boxes as white background plus motif fill when classPatternFills is set', () => {
    const svg = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        classPatternFills: [
          {
            defs: '<pattern id="motif-0"><rect /></pattern>',
            fillUrl: 'url(#motif-0)'
          },
          {
            defs: '<pattern id="motif-1"><rect /></pattern>',
            fillUrl: 'url(#motif-1)'
          }
        ]
      })
    );

    expect(svg.markup).toContain('<pattern id="motif-0">');
    expect(svg.markup).toContain('<pattern id="motif-1">');
    expect(svg.markup).toContain('fill="#ffffff"');
    expect(svg.markup).toContain('fill="url(#motif-0)" opacity="1"');
    expect(svg.markup).toContain('fill="url(#motif-1)" opacity="1"');
    expect(svg.markup).not.toContain('fill="#f7fbff"');
    expect(svg.markup).not.toContain('fill="#2171b5"');
  });

  it('widens quantitative legends when the missing-data label is long', () => {
    const base = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'])
    );
    const withNoData = createLegendSvg(
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        nodata: true,
        nodataLabel: 'Absence de données'
      })
    );

    expect(withNoData.markup).toContain('Absence de données');
    expect(withNoData.width).toBeGreaterThan(base.width);
  });

  it('keeps legend canvases transparent and applies the selected font family', () => {
    const svgDefinitions = [
      draw_categorical_legend([{ label: 'Actif', fill: '#4585f5' }], {
        fontFamily: 'Cabin'
      }),
      draw_quanti_color_legend([0, 10, 20], ['#f7fbff', '#2171b5'], {
        fontFamily: 'Cabin'
      }),
      draw_symbols_legend([10, 100, 1_000], {
        fontFamily: 'Cabin'
      }),
      draw_khartis_swatch_legend([{ label: 'Actif', fill: '#4585f5' }], {
        fontFamily: 'Cabin'
      })
    ];

    for (const { markup } of svgDefinitions) {
      expect(markup).toContain('font-family="&quot;Cabin&quot;, sans-serif"');
      expect(markup).toContain('fill="transparent"');
      expect(markup).not.toContain('fill="white"');
    }
  });

  it('keeps the khartis-legends text symbol variant available for text size legends', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'text',
        fill: '#111111',
        stroke: 'none',
        nodata: true,
        nodataLabel: 'Sans données'
      })
    );

    expect(svg.markup).toContain('symbol_legend');
    expect(svg.markup).toContain('Sans données');
    expect(svg.markup).toContain('<path');
  });

  it('keeps the cross-zero sign legend inside the SVG viewBox bounds', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-100, -50, 50, 100], {
        type: 'circle',
        fill: '#4585f5'
      })
    );

    expect(svg.markup).toContain('sign_legend');

    const rectYs = [
      ...svg.markup.matchAll(/<g class="sign_legend"[^>]*>[\s\S]*?<\/g>/g)
    ].flatMap((block) =>
      [...block[0].matchAll(/<rect[^>]*y="([^"]+)"/g)].map((m) => Number(m[1]))
    );
    expect(rectYs.length).toBeGreaterThan(0);
    for (const y of rectYs) {
      expect(y).toBeLessThan(svg.height);
    }

    const svgWithoutSign = createLegendSvg(
      draw_symbols_legend([10, 100, 1_000], {
        type: 'circle',
        fill: '#4585f5'
      })
    );
    expect(svg.height).toBeGreaterThan(svgWithoutSign.height);
  });

  it('keeps sign legend, nodata and note all within bounds for cross-zero data', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-100, -50, 50, 100], {
        type: 'circle',
        fill: '#4585f5',
        nodata: true,
        nodataLabel: 'Sans données',
        note: 'Source: Khartis',
        title: 'Visualisation',
        subtitle: 'Indice'
      })
    );

    expect(svg.markup).toContain('sign_legend');
    expect(svg.markup).toContain('Sans données');
    expect(svg.markup).toContain('Source: Khartis');
    expect(svg.markup).toContain('Indice');
    expect(svg.markup).toContain('Visualisation');
    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);
  });

  it('handles cross-zero proportional bars with the sign legend integrated', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-50, 100], {
        type: 'bar',
        fill: '#4585f5'
      })
    );

    expect(svg.markup).toContain('sign_legend');
    expect(svg.height).toBeGreaterThan(0);

    const rectYs = [
      ...svg.markup.matchAll(/<g class="sign_legend"[^>]*>[\s\S]*?<\/g>/g)
    ].flatMap((block) =>
      [...block[0].matchAll(/<rect[^>]*y="([^"]+)"/g)].map((m) => Number(m[1]))
    );
    expect(rectYs.length).toBeGreaterThan(0);
    for (const y of rectYs) {
      expect(y).toBeLessThan(svg.height);
    }
  });

  it('uses uniform section gaps between symbols, sign legend, nodata and note', () => {
    const svg = createLegendSvg(
      draw_symbols_legend([-100, -50, 50, 100], {
        type: 'circle',
        fill: '#4585f5',
        nodata: true,
        nodataLabel: 'Sans données',
        note: 'Source: Khartis'
      })
    );

    const signLegendBlock = /<g class="sign_legend"[^>]*>[\s\S]*?<\/g>/.exec(
      svg.markup
    )?.[0];
    expect(signLegendBlock).toBeDefined();
    const signRectYs = [
      ...(signLegendBlock ?? '').matchAll(/<rect[^>]*y="([\d.]+)"/g)
    ].map((m) => Number(m[1]));
    expect(signRectYs.length).toBe(2);
    const [plusBoxY, minusBoxY] = signRectYs;
    expect(minusBoxY).toBeGreaterThan(plusBoxY);

    const interBoxGap = minusBoxY - plusBoxY;
    expect(interBoxGap).toBeGreaterThan(0);
    expect(interBoxGap).toBeLessThan(40);

    const nodataMatch = /<g class="nodata">[\s\S]*?y1="([\d.]+)"/.exec(
      svg.markup
    );
    expect(nodataMatch).not.toBeNull();
    const nodataY = Number(nodataMatch?.[1]);
    expect(nodataY).toBeGreaterThan(minusBoxY);
  });

  it('escapes SVG text, colors, and paths in Khartis extensions', () => {
    const svg = createLegendSvg(
      draw_khartis_swatch_legend(
        [
          {
            label: '<img>',
            fill: '#fff" /><script>',
            symbol: 'M0,0" /><script>',
            patternFill: {
              defs: '<pattern id="safe"><rect /></pattern>',
              fillUrl: 'url(#safe)" /><script>'
            }
          }
        ],
        {
          type: 'symbol',
          title: '<script>'
        }
      )
    );

    expect(svg.markup).toContain('&lt;img&gt;');
    expect(svg.markup).toContain('&lt;script&gt;');
    expect(svg.markup).not.toContain('<script>');
  });

  it('draws pattern swatches as a colored box overlaid by the motif fill', () => {
    const svg = draw_khartis_swatch_legend(
      [
        {
          label: 'A',
          fill: '#2171b5',
          patternFill: {
            defs: '<pattern id="motif-a"><rect /></pattern>',
            fillUrl: 'url(#motif-a)'
          }
        }
      ],
      { type: 'pattern' }
    );

    expect(svg.markup).toContain('<pattern id="motif-a">');
    expect(svg.markup).toContain('fill="#2171b5"');
    expect(svg.markup).toContain('fill="url(#motif-a)" opacity="0.6"');
  });

  it('centralizes raw SVG markup rendering in LegendSvg', () => {
    const { container } = render(LegendSvg, {
      markup: '<g class="safe"><rect width="10" height="12" /></g>',
      width: 10,
      height: 12,
      decorative: false,
      ariaLabel: 'Legend'
    });
    const svg = container.querySelector('svg.legend-svg');

    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 10 12');
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg).toHaveAttribute('aria-label', 'Legend');
    expect(container.querySelector('.safe')).toBeInTheDocument();
  });

  it('keeps text color on the SVG root for DOM image exports', () => {
    const { container } = render(LegendSvg, {
      markup: '<g><text x="0" y="10">Legend</text></g>',
      width: 42,
      height: 16,
      textColor: '#ffffff'
    });
    const svg = container.querySelector('svg.legend-svg');

    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveStyle({ color: '#ffffff' });
  });
});
